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
    const body = req.b