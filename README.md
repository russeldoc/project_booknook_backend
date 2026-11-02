# BookNook API

Express + MongoDB server for **BookNook**, a small online library.

**Live API:** https://your-booknook-api.vercel.app  <!-- replace with your deployed server URL -->
**Client (frontend repo):** https://your-booknook-site.vercel.app  <!-- replace with your deployed client URL -->

## Features

- Exactly 8 REST routes for books and borrows.
- JWT protection: tokens issued by BetterAuth (in the Next.js app) are verified with the app's public keys, so no secret is shared between the two projects.
- Owner-only edit and delete for books.
- Copy tracking with a guarded `$inc`, so the last copy can't be borrowed twice.
- "No double borrow" enforced by a unique MongoDB index on `(bookId, userEmail)`.
- The book owner and borrower always come from the verified token, never from the request body.

## API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/books` | public | All books, newest first. Optional `?limit=`, `?category=`, `?search=`. With `?mine=true` (token required) only the user's books. |
| GET | `/books/:id` | token | One book |
| POST | `/books` | token | Add a book |
| PATCH | `/books/:id` | token, owner | Update a book |
| DELETE | `/books/:id` | token, owner | Delete a book (and its borrow records) |
| POST | `/borrows` | token | Borrow a book. Body: `{ "bookId": "..." }`. Due in 7 days. |
| GET | `/borrows` | token | The logged-in user's borrows |
| DELETE | `/borrows/:id` | token, borrower | Return a book |

Send the token as `Authorization: Bearer <jwt>`.

## Getting started

```bash
npm install
cp .env.example .env     # then fill in the values
npm run dev              # http://localhost:5000
```

| Variable | What it is |
|---|---|
| `MONGODB_URI`, `DB_NAME` | MongoDB connection. Use the same cluster and database as the frontend. |
| `FRONTEND_URL` | URL of the Next.js app, no trailing slash. Used for CORS and to fetch the public keys at `/api/auth/jwks`. |
| `PORT` | Local port (default 5000). |

## Deploy (Vercel)

`vercel.json` and `api/index.js` are already set up. Import the repo, add the three variables, and set `FRONTEND_URL` to your live frontend URL. In MongoDB Atlas, allow network access from anywhere (`0.0.0.0/0`).
