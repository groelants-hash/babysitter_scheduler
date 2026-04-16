import { Redis } from "@upstash/redis";
import { Resend } from "resend";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const SLOTS_KEY = "babysitter:slots";
const USERS_KEY = "babysitter:users";
const FREE_NIGHT_SITTERS = ["Iza", "Gabi"];
const APP_URL = process.env.APP_URL || "https://bbsit.vercel.app";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function getMonthStr(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthName(monthStr) {
  return new Date(monthStr + "-02").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric"
  });
}

function fmtH(h) {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

// ─── Payroll helpers ──────────────────────────────────────────────────────────

function calcSplit(slot) {
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  const startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 1440;
  const NIGHT = 19 * 60;
  let dayM = 0, nightM = 0;
  for (let m = startM; m < endM; m++) {
    const t = m % 1440;
    if (t >= NIGHT) nightM++; else dayM++;
  }
  return { dayH: dayM / 60, nightH: nightM / 60 };
}

// ─── Calendar URL helpers ─────────────────────────────────────────────────────

function gcalUrl(slot, sitterName) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const d = slot.date.replace(/-/g, "");
  const ts = t => t.replace(":", "");
  return `${base}&text=Babysitting+(${sitterName})&dates=${d}T${ts(slot.start)}00/${d}T${ts(slot.end)}00`;
}

function icalUrl(slot, sitterName) {
  const d = slot.date.replace(/-/g, "");
  const ts = t => t.replace(":", "");
  const summary = encodeURIComponent(`Babysitting (${sitterName})`);
  return `data:text/calendar;charset=utf8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ADTSTART:${d}T${ts(slot.start)}00%0ADTEND:${d}T${ts(slot.end)}00%0ASUMMARY:${summary}%0AEND:VEVENT%0AEND:VCALENDAR`;
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildSitterEmail(sitterName, currentMonth, nextMonth, claimedSlots, openEligibleSlots, rates) {
  const dayRate = parseFloat(rates?.day ?? 12);
  const nightRate = parseFloat(rates?.night ?? 10);

  // Payroll summary for current month
  const totals = claimedSlots
    .filter(sl => sl.date.startsWith(currentMonth))
    .reduce((acc, sl) => {
      const { dayH, nightH } = calcSplit(sl);
      return { dayH: acc.dayH + dayH, nightH: acc.nightH + nightH };
    }, { dayH: 0, nightH: 0 });
  const totalDue = totals.dayH * dayRate + totals.nightH * nightRate;
  const currentMonthSlotCount = claimedSlots.filter(sl => sl.date.startsWith(currentMonth)).length;

  // Next month claimed slots
  const nextMonthClaimed = claimedSlots
    .filter(sl => sl.date.startsWith(nextMonth))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentMonthName = getMonthName(currentMonth);
  const nextMonthName = getMonthName(nextMonth);

  // ── Payroll cards ──
  const payrollCards = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:4px;">
      <div style="background:#f5f5f5;border-radius:10px;padding:12px 14px;">
        <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.04em;">Day hours</p>
        <p style="margin:0;font-size:22px;font-weight:500;color:#111;">${fmtH(totals.dayH)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888;">€${(totals.dayH * dayRate).toFixed(2)}</p>
      </div>
      <div style="background:#f5f5f5;border-radius:10px;padding:12px 14px;">
        <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.04em;">Night hours</p>
        <p style="margin:0;font-size:22px;font-weight:500;color:#111;">${fmtH(totals.nightH)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888;">€${(totals.nightH * nightRate).toFixed(2)}</p>
      </div>
      <div style="background:#E1F5EE;border-radius:10px;padding:12px 14px;">
        <p style="margin:0 0 4px;font-size:11px;color:#085041;text-transform:uppercase;letter-spacing:0.04em;">Total due</p>
        <p style="margin:0;font-size:22px;font-weight:500;color:#085041;">€${totalDue.toFixed(2)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#0F6E56;">${currentMonthSlotCount} slot${currentMonthSlotCount !== 1 ? "s" : ""}</p>
      </div>
    </div>
  `;

  // ── Next month claimed slots ──
  const claimedRows = nextMonthClaimed.length === 0
    ? `<p style="padding:14px;font-size:13px;color:#888;margin:0;">No claimed slots in ${nextMonthName} yet.</p>`
    : nextMonthClaimed.map((sl, i) => {
        const { dayH, nightH } = calcSplit(sl);
        const isLast = i === nextMonthClaimed.length - 1;
        const parts = [];
        if (dayH > 0) parts.push(`${fmtH(dayH)} day`);
        if (nightH > 0) parts.push(`${fmtH(nightH)} night`);
        const overnight = (() => { const [eh] = sl.end.split(":").map(Number); const [sh] = sl.start.split(":").map(Number); return eh < sh; })();
        return `
          <div style="padding:11px 14px;${isLast ? "" : "border-bottom:0.5px solid #e5e5e5;"}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div>
                <p style="margin:0;font-size:14px;font-weight:500;color:#111;">${fmtDate(sl.date)}${overnight ? ' <span style="font-size:11px;padding:1px 6px;border-radius:99px;background:#f5f5f5;color:#888;margin-left:4px;">overnight</span>' : ""}</p>
                <p style="margin:0;font-size:12px;color:#888;">${sl.start} – ${sl.end}${parts.length ? " · " + parts.join(" · ") : ""}</p>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <a href="${gcalUrl(sl, sitterName)}" style="font-size:11px;padding:4px 10px;border-radius:6px;border:0.5px solid #e5e5e5;color:#111;text-decoration:none;background:#fff;">Google Cal</a>
                <a href="${icalUrl(sl, sitterName)}" style="font-size:11px;padding:4px 10px;border-radius:6px;border:0.5px solid #e5e5e5;color:#111;text-decoration:none;background:#fff;">iCal</a>
              </div>
            </div>
          </div>
        `;
      }).join("");

  // ── Open eligible slots ──
  const openRows = openEligibleSlots.length === 0
    ? `<p style="padding:14px;font-size:13px;color:#888;margin:0;">No open slots available for you in ${nextMonthName}.</p>`
    : openEligibleSlots.map((sl, i) => {
        const isLast = i === openEligibleSlots.length - 1;
        const isFreeNight = !!sl.freeNight;
        return `
          <div style="padding:11px 14px;${isLast ? "" : "border-bottom:0.5px solid #e5e5e5;"}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div>
                  <p style="margin:0;font-size:14px;font-weight:500;color:#111;">${fmtDate(sl.date)}</p>
                  <p style="margin:0;font-size:12px;color:#888;">${sl.start} – ${sl.end}</p>
                </div>
                ${isFreeNight ? `<span style="font-size:11px;padding:3px 8px;border-radius:99px;background:#FAEEDA;color:#854F0B;font-weight:500;">free night</span>` : ""}
              </div>
              <span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#E1F5EE;color:#085041;font-weight:500;flex-shrink:0;">Open</span>
            </div>
          </div>
        `;
      }).join("");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#ffffff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">

    <div style="background:#1D9E75;padding:28px 32px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:500;color:#9FE1CB;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:22px;font-weight:500;color:#fff;">Your ${currentMonthName} summary &amp; ${nextMonthName} schedule</h1>
    </div>

    <div style="padding:24px 32px 0;">
      <p style="margin:0 0 6px;font-size:15px;color:#111;">Hi ${sitterName},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">Here's your earnings summary for ${currentMonthName} and an overview of your upcoming slots in ${nextMonthName}. Don't forget to add them to your calendar!</p>
    </div>

    <div style="padding:0 32px 24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.06em;">${currentMonthName} — earnings</p>
      ${payrollCards}
    </div>

    <div style="padding:0 32px 24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.06em;">${nextMonthName} — your claimed slots</p>
      <div style="border:0.5px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        ${claimedRows}
      </div>
    </div>

    <div style="padding:0 32px 24px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.06em;">${nextMonthName} — open slots you can claim</p>
      <div style="border:0.5px solid #e5e5e5;border-radius:10px;overflow:hidden;">
        ${openRows}
      </div>
      ${openEligibleSlots.length > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#aaa;">Log in to claim any open slot.</p>` : ""}
    </div>

    <div style="padding:16px 32px;border-top:0.5px solid #e5e5e5;text-align:center;">
      <a href="${APP_URL}" style="display:inline-block;background:#1D9E75;color:#fff;font-size:13px;font-weight:500;padding:10px 24px;border-radius:8px;text-decoration:none;">Open scheduler</a>
    </div>

    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Sent automatically on the last day of ${currentMonthName} · <a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>

  </div>
</body>
</html>
  `;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Security check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Only run on the last day of the month (skip check if ?force=1 for testing)
  if (!isLastDayOfMonth() && req.query.force !== "1") {
    return res.status(200).json({ message: "Not the last day of the month, nothing sent." });
  }

  try {
    const [slotsRaw, usersRaw] = await Promise.all([
      redis.get(SLOTS_KEY),
      redis.get(USERS_KEY),
    ]);

    const slotData = slotsRaw || { slots: [], sitters: [], rates: {} };
    const users = usersRaw || [];

    const currentMonth = getMonthStr(0);
    const nextMonth = getMonthStr(1);

    // Admin emails for CC
    const adminEmails = users
      .filter(u => u.role === "admin")
      .map(u => u.email);

    // Sitter users only
    const sitterUsers = users.filter(u => u.role === "sitter" && u.sitterName && u.email);

    if (sitterUsers.length === 0) {
      return res.status(200).json({ message: "No sitter users found, nothing sent." });
    }

    const results = await Promise.all(sitterUsers.map(async (user) => {
      const { sitterName, email } = user;

      // All slots this sitter has claimed (current + next month)
      const claimedSlots = slotData.slots.filter(sl =>
        sl.claimedBy === sitterName &&
        (sl.date.startsWith(currentMonth) || sl.date.startsWith(nextMonth))
      );

      // Open slots in next month this sitter is eligible for
      const isFreeNightEligible = FREE_NIGHT_SITTERS.includes(sitterName);
      const openEligibleSlots = slotData.slots
        .filter(sl =>
          !sl.claimedBy &&
          sl.date.startsWith(nextMonth) &&
          (!sl.freeNight || isFreeNightEligible)
        )
        .sort((a, b) => a.date.localeCompare(b.date));

      const html = buildSitterEmail(
        sitterName,
        currentMonth,
        nextMonth,
        claimedSlots,
        openEligibleSlots,
        slotData.rates
      );

      return resend.emails.send({
        from: "Babysitter Scheduler <noreply@gautrach.com>",
        to: email,
        cc: adminEmails,
        subject: `Your ${getMonthName(currentMonth)} summary & ${getMonthName(nextMonth)} schedule`,
        html,
      });
    }));

    return res.status(200).json({
      message: `Monthly summary sent to ${sitterUsers.length} sitter(s), CC'd ${adminEmails.length} admin(s).`,
      results,
    });

  } catch (err) {
    console.error("Monthly cron error:", err);
    return res.status(500).json({ error: err.message });
  }
}
