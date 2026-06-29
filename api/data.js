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
    // (a rea