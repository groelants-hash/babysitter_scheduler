import { Resend } from "resend";
import { redis } from "./_lib/redis.js";
import { getSession } from "./_lib/auth.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const SLOTS_KEY = "babysitter:slots";
const USERS_KEY = "babysitter:users";
const APP_URL = process.env.APP_URL || "https://bbsit.vercel.app";

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function buildEmail(sitterName, slots) {
  const rows = slots.map((sl, i) => {
    const isLast = i === slots.length - 1;
    return `
      <div style="padding:12px 16px;${isLast ? "" : "border-bottom:0.5px solid #e5e5e5;"}">
        <p style="margin:0 0 2px;font-size:14px;font-weight:500;color:#111;">${fmtDate(sl.date)}</p>
        <p style="margin:0;font-size:13px;color:#555;">${sl.start} – ${sl.end}${sl.freeNight ? " · 🌙 free night" : ""}</p>
      </div>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">

    <div style="background:#7F77DD;padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:500;color:#CECBF6;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:22px;font-weight:500;color:#ffffff;">${slots.length} open slot${slots.length > 1 ? "s" : ""} available</h1>
    </div>

    <div style="padding:24px 32px 0;">
      <p style="margin:0 0 6px;font-size:15px;color:#111;">Hi ${sitterName},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
        The following slot${slots.length > 1 ? "s are" : " is"} open and up for grabs. First come, first served — open the app to claim ${slots.length > 1 ? "any that work for you" : "it"}.
      </p>
    </div>

    <div style="padding:0 32px 24px;">
      <div style="border:0.5px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        ${rows}
      </div>
    </div>

    <div style="padding:0 32px 28px;">
      <a href="${APP_URL}" style="display:block;text-align:center;background:#1D9E75;color:#fff;font-size:14px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none;">
        Open scheduler →
      </a>
    </div>

    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>

  </div>
</body>
</html>
  `;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Sending a broadcast email to every sitter is an admin action.
  const session = await getSession(redis, req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Admin sign-in required." });
  }

  const { slotIds, userIds } = req.body || {};
  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    return res.status(400).json({ error: "Select at least one slot to send." });
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "Select at least one recipient to send to." });
  }

  try {
    const [slotsRaw, usersRaw] = await Promise.all([
      redis.get(SLOTS_KEY),
      redis.get(USERS_KEY),
    ]);
    const slotData = slotsRaw || { slots: [] };
    const users = usersRaw || [];

    const slots = slotData.slots
      .filter(sl => slotIds.includes(sl.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    if (slots.length === 0) {
      return res.status(404).json({ error: "None of the selected slots could be found." });
    }

    const recipients = users.filter(u => userIds.includes(u.id) && u.role === "sitter" && u.email);
    if (recipients.length === 0) {
      return res.status(400).json({ error: "None of the selected recipients have an email on file." });
    }

    const results = await Promise.all(recipients.map(u => {
      const sitterName = u.sitterName || u.email.split("@")[0];
      return resend.emails.send({
        from: "Babysitter Scheduler <noreply@gautrach.com>",
        to: u.email,
        subject: `${slots.length} open slot${slots.length > 1 ? "s" : ""} available`,
        html: buildEmail(sitterName, slots),
      }).catch(err => ({ error: err.message, to: u.email }));
    }));

    return res.status(200).json({
      message: `Sent to ${recipients.length} sitter${recipients.length > 1 ? "s" : ""} about ${slots.length} slot${slots.length > 1 ? "s" : ""}.`,
      results,
    });
  } catch (err) {
    console.error("notify-open-slots error:", err);
    return res.status(500).json({ error: err.message });
  }
}
