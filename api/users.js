import { redis } from "./_lib/redis.js";
import { pushBackup, checkForSuspiciousShrink, wouldRemoveAllAdmins } from "./_lib/backup.js";
import { getSession, hashPassword } from "./_lib/auth.js";

const KEY = "babysitter:users";
const INIT_KEY = "babysitter:users:initialized";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // The full user list (and any write to it) is admin-only: it's the one
  // place passwords live, and it controls who has accounts at all.
  const session = await getSession(redis, req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Admin sign-in required." });
  }

  if (req.method === "GET") {
    const [data, initialized] = await Promise.all([
      redis.get(KEY),
      redis.get(INIT_KEY),
    ]);
    const sanitized = Array.isArray(data)
      ? data.map(({ password, ...rest }) => rest)
      : data;
    return res.status(200).json({ data: sanitized ?? null, initialized: !!initialized });
  }

  if (req.method === "POST") {
    const incoming = req.body;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Invalid payload: expected an array of users." });
    }

    const force = req.query.force === "1";
    const current = (await redis.get(KEY)) || [];
    const currentById = new Map(current.map(u => [u.id, u]));

    // The client never receives real passwords (see GET above), so for any
    // user already on file we keep their existing stored password unless a
    // new plaintext one was explicitly supplied (new account, or a future
    // "reset password" feature). New plaintext passwords get hashed here.
    const merged = [];
    for (const u of incoming) {
      const existing = currentById.get(u.id);
      let password = existing ? existing.password : undefined;
      if (u.password) {
        password = await hashPassword(u.password);
      }
      if (!password) {
        return res.status(400).json({ error: `User ${u.email} needs a password.` });
      }
      merged.push({
        id: u.id,
        email: u.email,
        password,
        role: u.role,
        sitterName: u.sitterName || "",
      });
    }

    if (!force) {
      const warning = checkForSuspiciousShrink(current, merged, "users")
        || (wouldRemoveAllAdmins(current, merged)
          ? "This save would remove every admin account, locking everyone out. If this is intentional, retry with ?force=1."
          : null);
      if (warning) return res.status(409).json({ error: warning });
    }

    await pushBackup(redis, KEY, current);
    await redis.set(KEY, merged);
    await redis.set(INIT_KEY, "true");
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
