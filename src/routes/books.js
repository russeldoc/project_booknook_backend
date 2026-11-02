import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { asyncHandler, escapeRegex } from "../utils.js";

export const CATEGORIES = ["Fiction", "Science", "History", "Kids", "Others"];

const router = Router();

// Validates and cleans book fields. With `partial`, only supplied fields are checked.
function cleanBook(body, { partial = false } = {}) {
  const out = {};
  const errors = [];

  const text = (key, label, max) => {
    if (body[key] === undefined) {
      if (!partial) errors.push(`${label} is required.`);
      return;
    }
    const value = String(body[key]).trim();
    if (!value) errors.push(`${label} is required.`);
    else if (value.length > max) errors.push(`${label} must be ${max} characters or fewer.`);
    else out[key] = value;
  };

  text("title", "Book title", 150);
  text("author", "Author name", 100);
  text("description", "Description", 2000);
  text("image", "Book image", 500);
  if (out.image && !/^https?:\/\//i.test(out.image)) {
    errors.push("Book image must be a valid link.");
  }

  if (body.category === undefined) {
    if (!partial) errors.push("Category is required.");
  } else if (!CATEGORIES.includes(body.category)) {
    errors.push("Choose a valid category.");
  } else {
    out.category = body.category;
  }

  if (body.totalCopies === undefined) {
    if (!partial) errors.push("Total copies is required.");
  } else {
    const copies = Number(body.totalCopies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 1000) {
      errors.push("Total copies must be a whole number from 1 to 1000.");
    } else {
      out.totalCopies = copies;
    }
  }

  return { out, errors };
}

function parseId(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ message: "That book id is not valid." });
    return null;
  }
  return new ObjectId(req.params.id);
}

// GET /books  (public) — newest first. Optional: ?limit= ?category= ?search=
// With ?mine=true a valid token is required and only the user's own books return.
async function listBooks(req, res) {
  const db = await getDb();
  const { limit, category, search, mine } = req.query;
  const filter = {};

  if (mine === "true") filter["addedBy.email"] = req.user.email;
  if (CATEGORIES.includes(category)) filter.category = category;
  if (search) {
    const pattern = new RegExp(escapeRegex(String(search).slice(0, 80)), "i");
    filter.$or = [{ title: pattern }, { author: pattern }];
  }

  let cursor = db.collection("books").find(filter).sort({ createdAt: -1, _id: -1 });
  const max = parseInt(limit, 10);
  if (max > 0) cursor = cursor.limit(Math.min(max, 100));

  res.json(await cursor.toArray());
}

router.get("/", (req, res, next) => {
  if (req.query.mine === "true") {
    return verifyToken(req, res, () => listBooks(req, res).catch(next));
  }
  return listBooks(req, res).catch(next);
});

// GET /books/:id — one book (token required; details page is private)
router.get(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const _id = parseId(req, res);
    if (!_id) return;
    const db = await getDb();
    const book = await db.collection("books").findOne({ _id });
    if (!book) return res.status(404).json({ message: "Book not found." });
    res.json(book);
  })
);

// POST /books — add a book (owner comes from the token, never from the body)
router.post(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { out, errors } = cleanBook(req.body || {});
    if (errors.length) return res.status(400).json({ message: errors[0], errors });

    const db = await getDb();
    const book = {
      ...out,
      availableCopies: out.totalCopies,
      addedBy: { name: req.user.name, email: req.user.email },
      createdAt: new Date(),
    };
    const result = await db.collection("books").insertOne(book);
    res.status(201).json({ ...book, _id: result.insertedId });
  })
);

// PATCH /books/:id — update (owner only)
router.patch(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const _id = parseId(req, res);
    if (!_id) return;

    const db = await getDb();
    const books = db.collection("books");
    const book = await books.findOne({ _id });
    if (!book) return res.status(404).json({ message: "Book not found." });
    if (book.addedBy?.email !== req.user.email) {
      return res.status(403).json({ message: "You can only edit books you added." });
    }

    const { out, errors } = cleanBook(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    if (!Object.keys(out).length) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    // Keep available copies in step with the new total.
    if (out.totalCopies !== undefined) {
      const onLoan = book.totalCopies - book.availableCopies;
      if (out.totalCopies < onLoan) {
        return res.status(400).json({
          message: `${onLoan} cop${onLoan === 1 ? "y is" : "ies are"} currently borrowed, so total copies can't go below ${onLoan}.`,
        });
      }
      out.availableCopies = out.totalCopies - onLoan;
    }

    const updated = await books.findOneAndUpdate(
      { _id },
      { $set: out },
      { returnDocument: "after" }
    );

    // Keep the copy of title/image stored on borrow records fresh.
    const borrowFields = {};
    if (out.title) borrowFields.bookTitle = out.title;
    if (out.image) borrowFields.bookImage = out.image;
    if (Object.keys(borrowFields).length) {
      await db.collection("borrows").updateMany({ bookId: _id }, { $set: borrowFields });
    }

    res.json(updated);
  })
);

// DELETE /books/:id — delete (owner only)
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    const _id = parseId(req, res);
    if (!_id) return;

    const db = await getDb();
    const book = await db.collection("books").findOne({ _id });
    if (!book) return res.status(404).json({ message: "Book not found." });
    if (book.addedBy?.email !== req.user.email) {
      return res.status(403).json({ message: "You can only delete books you added." });
    }

    await db.collection("books").deleteOne({ _id });
    await db.collection("borrows").deleteMany({ bookId: _id });
    res.json({ deleted: true });
  })
);

export default router;
