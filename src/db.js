import { MongoClient } from "mongodb";

let dbPromise = null;

// One shared connection, reused across requests (important on serverless).
export function getDb() {
  if (!dbPromise) {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not set.");
    }
    const client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client
      .connect()
      .then(async (connected) => {
        const db = connected.db(process.env.DB_NAME || "booknook");
        // A user can hold only one active borrow per book ("no double borrow").
        await db
          .collection("borrows")
          .createIndex({ bookId: 1, userEmail: 1 }, { unique: true });
        await db.collection("books").createIndex({ createdAt: -1 });
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}
