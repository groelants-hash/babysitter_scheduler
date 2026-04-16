import { Redis } from "@upstash/redis";
import { Resend } from "resend";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const SLOTS_KEY = "babysitter:slots";
const USERS_KEY = "babysitter:users";

function fmtDate(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric"
  });
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildEmail(adminName, urgentSlots, allUnclaimedThisMonth, appUrl) {
  const urgentRows = urgentSlots.map(sl => `
    <div style="background:#FFF3E0;border-left:3px solid #E65100;padding:14px 16px;margin-bottom:12px;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:500;color:#BF360C;">Due in 7 days</p>
      <p style="margin:0 0 2px;font-size:15px;font-weight:500;color:#111;">${fmtDate(sl.date)}</p>
      <p style="margin:0;font-size:13px;color:#555;">${sl.start} – ${sl.end}</p>
    </div>
  `).join("");

  const allRows = allUnclaimedThisMonth.map((sl, i) => {
    const days = daysUntil(sl.date);
    const isLast = i === allUnclaimedThisMonth.length - 1;
    const urgent = days <= 7;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;${isLast ? "" : "border-bottom:0.5px solid #e5e5e5;"}">
        <div>
          <p style="margin:0;font-size:14px;font-weight:500;color:#111;">${fmtDate(sl.date)}</p>
          <p style="margin:0;font-size:12px;color:#888;">${sl.start} – ${sl.end}</p>
        </div>
        <span style="font-size:11px;padding:3px 10px;border-radius:99px;background:${urgent ? "#FFF3E0" : "#f5f5f5"};color:${urgent ? "#BF360C" : "#888"};font-weight:500;">${days} day${days !== 1 ? "s" : ""}</span>
      </div>
    `;
  }).join("");

  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">

    <div style="background:#7F77DD;padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:500;color:#CECBF6;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:22px;font-weight:500;color:#ffffff;">Unclaimed slots reminder</h1>
    </div>

    <div style="padding:24px 32px 0;">
      <p style="margin:0 0 6px;font-size:15px;color:#111;">Hi ${adminName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
        The following slot${urgentSlots.length > 1 ? "s are" : " is"} unclaimed and due in <strong style="color:#111;">7 days</strong>. Please make sure ${urgentSlots.length > 1 ? "they get" : "it gets"} covered.
      </p>
      ${urgentRows}
    </div>

    <div style="padding:16px 32px 24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.06em;">All unclaimed slots in ${month}</p>
      <div style="border:0.5px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        ${allRows.length > 0 ? allRows : `<p style="padding:14px;font-size:13px;color:#888;margin:0;">No other unclaimed slots this month.</p>`}
      </div>
    </div>

    <div style="padding:16px 32px;border-top:0.5px solid #e5e5e5;display:flex;justify-content:center;">
      <a href="${appUrl}" style="display:inline-block;background:#7F77DD;color:#fff;font-size:13px;font-weight:500;padding:10px 24px;border-radius:8px;text-decoration:none;">Open scheduler</a>
    </div>

    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Sent automatically by your Babysitter Scheduler · <a href="${appUrl}" style="color:#aaa;">${appUrl.replace("https://", "")}</a></p>
    </div>

  </div>
</body>
</html>
  `;
}

export default async function handler(req, res) {
  // Security: only allow Vercel cron or manual GET with secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Load data from Redis
    const [slotsRaw, usersRaw] = await Promise.all([
      redis.get(SLOTS_KEY),
      redis.get(USERS_KEY),
    ]);

    const slotData = slotsRaw || { slots: [] };
    const users = usersRaw || [];

    // Find admin users
    const admins = users.filter(u => u.role === "admin" && u.email);
    if (admins.length === 0) {
      return res.status(200).json({ message: "No admin users found, nothing sent." });
    }

    const force = req.query.force === "1";

    // All unclaimed upcoming slots
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = getCurrentMonth();
    const allUnclaimedThisMonth = slotData.slots
      .filter(sl => !sl.claimedBy && sl.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    // When forced (test button): send all upcoming unclaimed slots
    // When running on schedule: only trigger if some are due within 7 days
    const urgentSlots = slotData.slots.filter(sl => {
      const d = daysUntil(sl.date);
      return !sl.claimedBy && d >= 0 && d <= 7;
    });

    if (!force && urgentSlots.length === 0) {
      return res.status(200).json({ message: "No unclaimed slots due in the next 7 days." });
    }
    if (allUnclaimedThisMonth.length === 0) {
      return res.status(200).json({ message: "No upcoming unclaimed slots to report." });
    }

    // When forced, treat all upcoming as "urgent" for the email highlight section
    const slotsToHighlight = force ? allUnclaimedThisMonth : urgentSlots;

    const appUrl = process.env.APP_URL || "https://bbsit.vercel.app";

    // Send email to each admin
    const results = await Promise.all(admins.map(async (admin) => {
      const adminName = admin.email.split("@")[0];
      const html = buildEmail(adminName, slotsToHighlight, allUnclaimedThisMonth, appUrl);

      return resend.emails.send({
        from: "Babysitter Scheduler <noreply@gautrach.com>",
        to: admin.email,
        subject: force ? `Unclaimed slots overview — ${slotsToHighlight.length} upcoming` : `Reminder: ${urgentSlots.length} unclaimed slot${urgentSlots.length > 1 ? "s" : ""} due in 7 days`,
        html,
      });
    }));

    return res.status(200).json({
      message: `Reminder sent to ${admins.length} admin(s).`,
      urgentSlots: urgentSlots.length,
      results,
    });

  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
