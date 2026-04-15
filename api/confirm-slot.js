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

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

// Generate 30-min increment time options
function timeOptions(selectedTime) {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const sel = val === selectedTime ? ' selected="selected"' : "";
      options.push(`<option value="${val}"${sel}>${val}</option>`);
    }
  }
  return options.join("");
}

function htmlPage(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f3; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; border: 0.5px solid #e5e5e5; padding: 2rem; max-width: 480px; width: 100%; }
    .header { background: #7F77DD; margin: -2rem -2rem 1.5rem; padding: 1.5rem 2rem; border-radius: 12px 12px 0 0; }
    .header p { color: #CECBF6; font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 500; }
    .slot-box { background: #f5f5f5; border-radius: 10px; padding: 14px 16px; margin-bottom: 1.5rem; }
    .slot-box .label { font-size: 12px; color: #888; margin-bottom: 4px; }
    .slot-box .date { font-size: 15px; font-weight: 500; color: #111; margin-bottom: 2px; }
    .slot-box .time { font-size: 13px; color: #555; }
    label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; margin-top: 12px; }
    select, textarea { width: 100%; font-size: 14px; padding: 9px 10px; border-radius: 8px; border: 0.5px solid #ccc; background: #fff; color: #111; outline: none; font-family: inherit; }
    textarea { resize: vertical; min-height: 80px; }
    .row { display: flex; gap: 10px; align-items: center; }
    .row select { flex: 1; }
    .btn { display: block; width: 100%; text-align: center; background: #1D9E75; color: #fff; font-size: 14px; font-weight: 500; padding: 12px; border-radius: 8px; border: none; cursor: pointer; margin-top: 1.5rem; font-family: inherit; }
    .btn:hover { opacity: 0.85; }
    .success { color: #085041; background: #E1F5EE; border-radius: 8px; padding: 12px 16px; font-size: 14px; margin-bottom: 1rem; }
    .footer { font-size: 11px; color: #aaa; text-align: center; margin-top: 1.5rem; }
    .tag { font-size: 11px; padding: 2px 8px; border-radius: 99px; background: #FAEEDA; color: #854F0B; font-weight: 500; display: inline-block; margin-left: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <p>Babysitter scheduler</p>
      <h1>${title}</h1>
    </div>
    ${body}
    <p class="footer"><a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
  </div>
</body>
</html>`;
}

async function notifyAdmins(users, slot, sitterName, changes) {
  const admins = users.filter(u => u.role === "admin" && u.email);
  if (admins.length === 0) return;

  const changesHtml = [];
  if (changes.timingChanged) {
    changesHtml.push(`
      <div style="background:#FFF3E0;border-left:3px solid #E65100;padding:12px 14px;border-radius:0;margin-bottom:10px;">
        <p style="margin:0 0 4px;font-size:12px;color:#BF360C;font-weight:500;">Timing updated</p>
        <p style="margin:0;font-size:13px;color:#111;">
          ${changes.originalStart} – ${changes.originalEnd}
          &rarr; <strong>${slot.start} – ${slot.end}</strong>
        </p>
      </div>
    `);
  }
  if (changes.comment) {
    changesHtml.push(`
      <div style="background:#f5f5f5;border-radius:8px;padding:12px 14px;margin-bottom:10px;">
        <p style="margin:0 0 4px;font-size:12px;color:#888;font-weight:500;">Comment from ${sitterName}</p>
        <p style="margin:0;font-size:13px;color:#111;">${changes.comment}</p>
      </div>
    `);
  }

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">
    <div style="background:#7F77DD;padding:24px 32px;">
      <p style="margin:0 0 4px;font-size:11px;color:#CECBF6;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:20px;font-weight:500;color:#fff;">Slot update from ${sitterName}</h1>
    </div>
    <div style="padding:24px 32px;">
      <div style="background:#f5f5f5;border-radius:10px;padding:14px 16px;margin-bottom:1.25rem;">
        <p style="margin:0 0 2px;font-size:15px;font-weight:500;color:#111;">${fmtDate(slot.date)}</p>
        <p style="margin:0;font-size:13px;color:#555;">${slot.start} – ${slot.end}</p>
      </div>
      ${changesHtml.join("")}
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>
  </div>
</body>
</html>`;

  await Promise.all(admins.map(admin =>
    resend.emails.send({
      from: "Babysitter Scheduler <onboarding@resend.dev>",
      to: admin.email,
      subject: `Slot update from ${sitterName} — ${new Date(slot.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
      html,
    })
  ));
}

export default async function handler(req, res) {
  const { action, slotId } = req.query;

  if (!slotId) {
    return res.status(400).send(htmlPage("Error", `<p style="color:#c00;font-size:14px;">Missing slot ID.</p>`));
  }

  // ── GET: show confirm or update form ─────────────────────────────────────
  if (req.method === "GET") {
    const slotsRaw = await redis.get(SLOTS_KEY);
    const slotData = slotsRaw || { slots: [] };
    const slot = slotData.slots.find(s => s.id === slotId);

    if (!slot) {
      return res.status(404).send(htmlPage("Not found", `<p style="font-size:14px;color:#888;">This slot could not be found. It may have been removed.</p>`));
    }

    // Already confirmed
    if (action === "confirm") {
      const updated = { ...slotData, slots: slotData.slots.map(s => s.id === slotId ? { ...s, confirmed: true } : s) };
      await redis.set(SLOTS_KEY, JSON.stringify(updated));
      return res.status(200).send(htmlPage("Confirmed!", `
        <div class="success">Your slot has been confirmed. See you then!</div>
        <div class="slot-box">
          <p class="label">Confirmed slot</p>
          <p class="date">${fmtDate(slot.date)}</p>
          <p class="time">${slot.start} – ${slot.end}</p>
        </div>
      `));
    }

    // Show update form
    if (action === "update") {
      return res.status(200).send(htmlPage("Update your slot", `
        <div class="slot-box">
          <p class="label">Original timing</p>
          <p class="date">${fmtDate(slot.date)}</p>
          <p class="time">${slot.start} – ${slot.end}</p>
        </div>
        <form method="POST" action="/api/confirm-slot?action=save&slotId=${slotId}">
          <label>Actual start time</label>
          <select name="start">${timeOptions(slot.start)}</select>
          <label>Actual end time</label>
          <select name="end">${timeOptions(slot.end)}</select>
          <label>Comment (optional)</label>
          <textarea name="comment" placeholder="Any notes about the session…"></textarea>
          <button type="submit" class="btn">Save updates</button>
        </form>
      `));
    }

    return res.status(400).send(htmlPage("Error", `<p style="font-size:14px;color:#888;">Unknown action.</p>`));
  }

  // ── POST: save update form ────────────────────────────────────────────────
  if (req.method === "POST" && action === "save") {
    let body = "";
    await new Promise(resolve => {
      req.on("data", chunk => { body += chunk; });
      req.on("end", resolve);
    });

    const params = new URLSearchParams(body);
    const newStart = params.get("start");
    const newEnd = params.get("end");
    const comment = params.get("comment")?.trim() || "";

    const [slotsRaw, usersRaw] = await Promise.all([
      redis.get(SLOTS_KEY),
      redis.get(USERS_KEY),
    ]);
    const slotData = slotsRaw || { slots: [] };
    const users = usersRaw || [];
    const slot = slotData.slots.find(s => s.id === slotId);

    if (!slot) {
      return res.status(404).send(htmlPage("Not found", `<p style="font-size:14px;color:#888;">Slot not found.</p>`));
    }

    const timingChanged = newStart !== slot.start || newEnd !== slot.end;
    const originalStart = slot.start;
    const originalEnd = slot.end;

    const updatedSlot = {
      ...slot,
      start: newStart || slot.start,
      end: newEnd || slot.end,
      comment: comment || slot.comment || "",
      confirmed: true,
      updatedByUser: true,
    };

    const updatedData = { ...slotData, slots: slotData.slots.map(s => s.id === slotId ? updatedSlot : s) };
    await redis.set(SLOTS_KEY, JSON.stringify(updatedData));

    // Notify admins if anything changed
    if (timingChanged || comment) {
      await notifyAdmins(users, updatedSlot, slot.claimedBy, {
        timingChanged,
        originalStart,
        originalEnd,
        comment,
      });
    }

    const changeNote = timingChanged
      ? `<p style="font-size:13px;color:#555;margin-bottom:1rem;">Timing updated to <strong>${newStart} – ${newEnd}</strong>.</p>`
      : `<p style="font-size:13px;color:#555;margin-bottom:1rem;">Timing confirmed as <strong>${slot.start} – ${slot.end}</strong>.</p>`;

    return res.status(200).send(htmlPage("All saved!", `
      <div class="success">Thanks! Your updates have been saved.</div>
      <div class="slot-box">
        <p class="label">Updated slot</p>
        <p class="date">${fmtDate(updatedSlot.date)}</p>
        <p class="time">${updatedSlot.start} – ${updatedSlot.end}</p>
        ${comment ? `<p style="margin-top:8px;font-size:12px;color:#888;">Comment saved.</p>` : ""}
      </div>
      ${changeNote}
    `));
  }

  return res.status(405).send(htmlPage("Error", `<p style="font-size:14px;color:#888;">Method not allowed.</p>`));
}
