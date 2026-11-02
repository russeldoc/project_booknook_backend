import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { asyncHandler } from "../utils.js";

const router = Router();
const LOAN_DAYS = 7;

// POST /borrows — borrow a book
router.post(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { bookId } = req.body || {};
    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "That book id is not valid." });
    }

    const db = await getDb();
    const books = db.collection("books");
    const borrows = db.collection("borrows");
    const _id = new ObjectId(bookId);

    const book = await books.findOne({ _id });
    if (!book) return res.status(404).json({ message: "Book not found." });

    // No double borrow
    const already = await borrows.findOne({ bookId: _id, userEmail: req.user.email });
    if (already) {
      return res.status(409).json({ message: "You have already borrowed this book." });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate.getTime() + LOAN_DAYS * 24 * 60 * 60 * 1000);
    const borrow = {
      bookId: _id,
      bookTitle: book.title,
      bookImage: book.image,
      userName: req.user.name,
      userEmail: req.user.email,
      borrowDate,
      returnDate,
    };

    let inserted;
    try {
      inserted = await borrows.insertOne(borrow);
    } catch (error) {
      // The unique index catches two simultaneous requests.
      if (error.code === 11000) {
        return res.status(409).json({ message: "You have already borrowed this book." });
      }
      throw error;
    }

    // Take one copy, but only if one is left ($inc with a guard).
    const taken = await books.findOneAndUpdate(
      { _id, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );
    if (!taken) {
      await borrows.deleteOne({ _id: inserted.insertedId });
      return res.status(409).json({ message: "This book is not available right now." });
    }

    res.status(201).json({ ...borrow, _id: inserted.insertedId });
  })
);

// GET /borrows — borrows of the logged-in user
router.get(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const list = await db
      .collection("borrows")
      .find({ userEmail: req.user.email })
      .sort({ borrowDate: -1 })
      .toArray();
    res.json(list);
  })
);

// DELETE /borrows/:id — return a book
router.delete(
  "/:id",
  verifyToken,
  asyncHandler(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "That borrow id is not valid." });
    }
    const _id = new ObjectId(req.params.id);

    const db = await getDb();
    const borrows = db.collection("borrows");
    const borrow = await borrows.findOne({ _id });
    if (!borrow) return res.status(404).json({ message: "Borrow record not found." });
    if (borrow.userEmail !== req.user.email) {
      return res.status(403).json({ message: "You can only return your own borrowed books." });
    }

    await borrows.deleteOne({ _id });
    await db
      .collection("books")
      .updateOne({ _id: borrow.bookId }, { $inc: { availableCopies: 1 } });

    res.json({ returned: true });
  })
);

export default router;
