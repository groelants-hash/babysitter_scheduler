import { redis } from "./_lib/redis.js";
import { verifyPassword, hashPassword, isHashed, createSession } from "./_lib/auth.js";

const KEY = "babysitter:users";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required." });
  }

  const users = (await redis.get(KEY)) || [];
  const idx = users.findIndex(
    u => u.email.toLowerCase() === String(email).trim().toLowerCase()
  );
  if (idx === -1) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const user = users[idx];
  const ok = await verifyPassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  // Self-migrate legacy plaintext passwords to bcrypt hashes the first time
  // each account successfully logs in after this change — no manual
  // migration step needed.
  if (!isHashed(user.password)) {
    users[idx] = { ...user, password: await hashPassword(password) };
    await redis.set(KEY, users);
  }

  const token = await createSession(redis, users[idx]);
  return res.status(200).json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      sitterName: user.sitterName || "",
    },
  });
}
