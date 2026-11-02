import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks;

// BetterAuth (in the Next.js app) signs the JWT; its public keys are served at
// /api/auth/jwks, so this API can verify tokens without sharing any secret.
function getJwks() {
  if (!jwks) {
    const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
    if (!base) throw new Error("FRONTEND_URL is not set.");
    jwks = createRemoteJWKSet(new URL(`${base}/api/auth/jwks`));
  }
  return jwks;
}

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in to continue." });
  }

  try {
    const { payload } = await jwtVerify(token, getJwks());
    const email = String(payload.email || "").toLowerCase();
    if (!email) throw new Error("Token has no email.");

    req.user = {
      id: payload.id || payload.sub,
      email,
      name: payload.name || email.split("@")[0],
      image: payload.image || "",
    };
    return next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Your session is invalid or has expired. Please log in again." });
  }
}
