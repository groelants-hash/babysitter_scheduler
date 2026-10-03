import { resend, emailsEnabled } from "./email.js";

const SLOTS_KEY = "babysitter:slots";
const USERS_KEY = "babysitter:users";

// Where the daily backup email goes. Can be changed with a BACKUP_EMAIL
// setting in Vercel, without touching the code.
const DEFAULT_BACKUP_EMAIL = "admin@tiegoconsulting.com";

// Builds a plain-JSON copy of everything in the database.
// Password hashes are deliberately left out: the file travels by email, and
// anyone who loses their password can simply use "forgot password".
export function buildExport(slotsRaw, usersRaw, now = new Date()) {
  const users = Array.isArray(usersRaw) ? usersRaw : [];
  return {
    exportedAt: now.toISOString(),
    note: "BBSIT daily backup. Password hashes are not included.",
    counts: {
      slots: Array.isArray(slotsRaw?.slots) ? slotsRaw.slots.length : 0,
      users: users.length,
    },
    slots: slotsRaw ?? null,
    users: users.map(({ password, ...rest }) => rest),
  };
}

// Emails the backup to the owner as an attachment.
// Read-only on the database: it never writes anything to it.
// Only sends from the live site (see email.js); test versions skip it.
export async function emailDailyBackup(redis, now = new Date()) {
  if (!emailsEnabled) return { skipped: "not the live site" };

  const [slotsRaw, usersRaw] = await Promise.all([redis.get(SLOTS_KEY), redis.get(USERS_KEY)]);
  // Never send an "empty" backup that could later be mistaken for real data.
  if (!slotsRaw && !usersRaw) return { skipped: "database is empty" };

  const data = buildExport(slotsRaw, usersRaw, now);
  const day = now.toISOString().slice(0, 10);
  const filename = `bbsit-backup-${day}.json`;
  const to = process.env.BACKUP_EMAIL || DEFAULT_BACKUP_EMAIL;

  const result = await resend.emails.send({
    from: "Babysitter Scheduler <noreply@gautrach.com>",
    to,
    subject: `BBSIT backup ${day} (${data.counts.slots} slots, ${data.counts.users} users)`,
    html: `<p>Daily backup of the babysitter scheduler is attached (<b>${filename}</b>).</p>
           <p>${data.counts.slots} slots and ${data.counts.users} users. Password hashes are not included.</p>`,
    attachments: [
      { filename, content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64") },
    ],
  });
  if (result?.error) {
    throw new Error(`Backup email failed: ${result.error.message || JSON.stringify(result.error)}`);
  }
  return { sent: true, to, filename };
}
