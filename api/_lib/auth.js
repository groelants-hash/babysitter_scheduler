// Server-side authentication helpers shared by /api/login, /api/data, and
// /api/users. Passwords are hashed with bcrypt; sessions are opaque random
// tokens stored in Redis (not signed JWTs) so no extra secret env var is
// needed beyond what's already configured for Redis.

import crypto from "crypto";
import bcrypt from "bcryptjs";

const SESSION_PREFIX = "babysitter:session:";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const BCRYPT_HASH_RE = /^\$2[aby]\$/;

export function isHashed(stored) {
  return typeof stored === "string" && BCRYPT_HASH_RE.test(stored);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

// Accepts either a bcrypt hash (normal case) or, for backward compatibility
// with accounts created before this change, a legacy plaintext password.
export async function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  return plain === stored;
}

export async function createSession(redis, user) {
  const token = crypto.randomBytes(32).toString("hex");
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    sitterName: user.sitterName || "",
  };
  await redis.set(SESSION_PREFIX + token, payload, { ex: SESSION_TTL_SECONDS });
  return token;
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

// Returns the session payload ({ id, email, role, sitterName }) or null.
export async function getSession(redis, req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const payload = await redis.get(SESSION_PREFIX + token);
  return payload || null;
}

export async function destroySession(redis, req) {
  const token = tokenFromRequest(req);
  if (token) await redis.del(SESSION_PREFIX + token);
}
