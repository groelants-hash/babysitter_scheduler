import { redis } from "./_lib/redis.js";
import { pushBackup } from "./_lib/backup.js";
import { hashPassword } from "./_lib/auth.js";

const USERS_KEY = "babysitter:users";
const RESET_PREFIX = "babysitter:reset:";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Missing reset token or new password." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const resetKey = RESET_PREFIX + token;
  const reset = await redis.get(resetKey);
  if (!reset) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  }

  const users = (await redis.get(USERS_KEY)) || [];
  const idx = users.findIndex(u => u.id === reset.userId);
  if (idx === -1) {
    await redis.del(resetKey);
    return res.status(400).json({ error: "This account no longer exists." });
  }

  await pushBackup(redis, USERS_KEY, users);
  users[idx] = { ...users[idx], password: await hashPassword(newPassword) };
  await redis.set(USERS_KEY, users);
  // One-time use: burn the token immediately so the same link can't be replayed.
  await redis.del(resetKey);

  return res.status(200).json({ ok: true });
}
