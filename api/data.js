import { redis } from "./_lib/redis.js";
import { pushBackup, checkForSuspiciousShrink } from "./_lib/backup.js";

const KEY = "babysitter:slots";
const INIT_KEY = "babysitter:slots:initialized";

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
    // `initialized` lets the client tell "no data has ever been saved yet"
    // (safe to show defaults) apart from "data existed and is now missing"
    // (a real problem — should never be silently papered over with demo data).
    return res.status(200).json({ data: data ?? null, initialized: !!initialized });
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!body || typeof body !== "object" || !Array.isArray(body.slots)) {
      return res.status(400).json({ error: "Invalid payload: expected an object with a slots array." });
    }

    const force = req.query.force === "1";
    const current = await redis.get(KEY);

    if (!force) {
      const warning = checkForSuspiciousShrink(current, body, "slots");
      if (warning) return res.status(409).json({ error: warning });
    }

    await pushBackup(redis, KEY, current);
    await redis.set(KEY, body);
    await redis.set(INIT_KEY, "true");
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
