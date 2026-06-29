import { redis } from "./_lib/redis.js";
import { pushBackup, checkForSuspiciousShrink, wouldRemoveAllAdmins } from "./_lib/backup.js";

const KEY = "babysitter:users";
const INIT_KEY = "babysitter:users:initialized";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const [data, initialized] = await Promise.all([
      redis.get(KEY),
      redis.get(INIT_KEY),
    ]);
    return res.status(200).json({ data: data ?? null, initialized: !!initialized });
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({ error: "Invalid payload: expected an array of users." });
    }

    const force = req.query.force === "1";
    const current = await redis.get(KEY);

    if (!force) {
      const warning = checkForSuspiciousShrink(current, body, "users")
        || (wouldRemoveAllAdmins(current, body)
          ? "This save would remove every admin account, locking everyone out. If this is intentional, retry with ?force=1."
          : null);
      if (warning) return res.status(409).json({ error: warning });
    }

    await pushBackup(redis, KEY, current);
    await redis.set(KEY, body);
    await redis.set(INIT_KEY, "true");
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
