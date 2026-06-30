import { redis } from "./_lib/redis.js";
import { pushBackup } from "./_lib/backup.js";
import { getSession, verifyPassword, hashPassword } from "./_lib/auth.js";

const KEY = "babysitter:users";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Any signed-in user (sitter or admin) can change their own password —
  // this only ever touches the record matching the caller's own session id.
  const session = await getSession(redis, req);
  if (!session) return res.status(401).json({ error: "Sign-in required." });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const users = (await redis.get(KEY)) || [];
  const idx = users.findIndex(u => u.id === session.id);
  if (idx === -1) return res.status(404).json({ error: "Account not found." });

  const ok = await verifyPassword(currentPassword, users[idx].password);
  if (!ok) return res.status(400).json({ error: "Current password is incorrect." });

  await pushBackup(redis, KEY, users);
  users[idx] = { ...users[idx], password: await hashPassword(newPassword) };
  await redis.set(KEY, users);

  return res.status(200).json({ ok: true });
}
