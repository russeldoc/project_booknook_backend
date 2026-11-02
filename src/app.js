import "dotenv/config";
import express from "express";
import cors from "cors";
import booksRouter from "./routes/books.js";
import borrowsRouter from "./routes/borrows.js";

const app = express();

const allowedOrigin = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");

app.use(
  cors({
    origin: allowedOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

// The 8 API routes
app.use("/books", booksRouter);
app.use("/borrows", borrowsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Something went wrong on the server." });
});

export default app;
