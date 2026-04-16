import { Redis } from "@upstash/redis";
import { Resend } from "resend";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const resend = new Resend(process.env.RESEND_API_KEY);

const SLOTS_KEY = "babysitter:slots";
const USERS_KEY = "babysitter:users";
const APP_URL = process.env.APP_URL || "https://bbsit.vercel.app";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

// Generate 30-min increment time options for the confirmation page
function timeOptions(selectedTime) {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const selected = val === selectedTime ? "selected" : "";
      options.push(`<option value="${val}" ${selected}>${val}</option>`);
    }
  }
  return options.join("");
}

function buildConfirmEmail(sitterName, slot) {
  const baseUrl = `${APP_URL}/api/confirm-slot`;
  const confirmUrl = `${baseUrl}?action=confirm&slotId=${slot.id}`;
  const updateUrl = `${baseUrl}?action=update&slotId=${slot.id}`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">

    <div style="background:#7F77DD;padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:500;color:#CECBF6;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:22px;font-weight:500;color:#fff;">Confirm your slot</h1>
    </div>

    <div style="padding:24px 32px 0;">
      <p style="margin:0 0 6px;font-size:15px;color:#111;">Hi ${sitterName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
        Thanks for babysitting today! Please confirm the timing below, or let us know if anything changed.
      </p>
    </div>

    <div style="padding:0 32px 24px;">
      <div style="background:#f5f5f5;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;color:#888;">Slot details</p>
        <p style="margin:0 0 2px;font-size:16px;font-weight:500;color:#111;">${fmtDate(slot.date)}</p>
        <p style="margin:0;font-size:14px;color:#555;">${slot.start} – ${slot.end}</p>
      </div>

      <p style="margin:0 0 12px;font-size:13px;color:#555;">Did everything go as planned?</p>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="${confirmUrl}" style="display:block;text-align:center;background:#1D9E75;color:#fff;font-size:14px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none;">
          Confirm timing (${slot.start} – ${slot.end})
        </a>
        <a href="${updateUrl}&start=${slot.start}&end=${slot.end}" style="display:block;text-align:center;background:#fff;color:#111;font-size:14px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none;border:0.5px solid #ccc;">
          Update timing
        </a>
        <a href="${updateUrl}&start=${slot.start}&end=${slot.end}" style="display:block;text-align:center;background:#fff;color:#111;font-size:14px;font-weight:500;padding:12px 24px;border-radius:8px;text-decoration:none;border:0.5px solid #ccc;">
          Leave a comment
        </a>
      </div>
    </div>

    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Sent automatically at end of day · <a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>

  </div>
</body>
</html>
  `;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [slotsRaw, usersRaw] = await Promise.all([
      redis.get(SLOTS_KEY),
      redis.get(USERS_KEY),
    ]);

    const slotData = slotsRaw || { slots: [] };
    const users = usersRaw || [];
    const today = todayStr();

    // Find slots that are happening today AND have been claimed (by anyone, at any time)
    const todaySlots = slotData.slots.filter(sl =>
      sl.claimedBy &&
      sl.date === today
    );

    if (todaySlots.length === 0) {
      return res.status(200).json({ message: "No claimed slots happening today, nothing sent." });
    }

    const results = await Promise.all(todaySlots.map(async (slot) => {
      const sitterUser = users.find(u => u.sitterName === slot.claimedBy && u.role === "sitter");
      if (!sitterUser?.email) return { skipped: slot.id, reason: "No email found for sitter" };

      const html = buildConfirmEmail(slot.claimedBy, slot);

      return resend.emails.send({
        from: "Babysitter Scheduler <onboarding@resend.dev>",
        to: sitterUser.email,
        subject: `Please confirm your slot on ${new Date(slot.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
        html,
      });
    }));

    return res.status(200).json({
      message: `Confirmation emails sent for ${todaySlots.length} slot(s).`,
      results,
    });

  } catch (err) {
    console.error("Slot confirm cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}