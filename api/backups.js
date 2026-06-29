import { redis } from "./_lib/redis.js";
import { listBackups, getBackup, pushBackup } from "./_lib/backup.js";

const KEYS = {
  slots: "babysitter:slots",
  users: "babysitter:users",
};

function page(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f3; min-height: 100vh; padding: 2rem 1rem; }
    .card { background: #fff; border-radius: 12px; border: 0.5px solid #e5e5e5; padding: 1.5rem; max-width: 640px; margin: 0 auto; }
    .header { background: #7F77DD; margin: -1.5rem -1.5rem 1.5rem; padding: 1.25rem 1.5rem; border-radius: 12px 12px 0 0; }
    .header p { color: #CECBF6; font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
    .header h1 { color: #fff; font-size: 18px; font-weight: 500; }
    .tabs { display: flex; gap: 8px; margin-bottom: 1.25rem; }
    .tabs a { font-size: 13px; padding: 7px 14px; border-radius: 99px; background: #f5f5f5; color: #555; text-decoration: none; font-weight: 500; }
    .tabs a.active { background: #7F77DD; color: #fff; }
    .current { background: #f5f5f5; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #555; margin-bottom: 1.25rem; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 0.5px solid #eee; }
    .row:last-child { border-bottom: none; }
    .row .when { font-size: 14px; font-weight: 500; color: #111; }
    .row .summary { font-size: 12px; color: #888; margin-top: 2px; }
    .btn { font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; background: #1D9E75; color: #fff; }
    .btn:hover { opacity: 0.85; }
    .success { color: #085041; background: #E1F5EE; border-radius: 8px; padding: 12px 16px; font-size: 14px; margin-bottom: 1rem; }
    .empty { font-size: 13px; color: #888; padding: 1rem 0; }
    .footer { font-size: 11px; color: #aaa; text-align: center; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <p>Babysitter scheduler</p>
      <h1>${title}</h1>
    </div>
    ${body}
    <p class="footer">Backup &amp; restore tool — keep this link private.</p>
  </div>
</body>
</html>`;
}

function summarize(key, data) {
  if (key === "slots") {
    const n = Array.isArray(data?.slots) ? data.slots.length : 0;
    return `${n} slot${n === 1 ? "" : "s"}`;
  }
  const n = Array.isArray(data) ? data.length : 0;
  return `${n} user${n === 1 ? "" : "s"}`;
}

export default async function handler(req, res) {
  const { secret } = req.query;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized. Append ?secret=YOUR_ADMIN_SECRET to the URL.");
  }

  const key = req.query.key === "users" ? "users" : "slots";
  const redisKey = KEYS[key];
  const otherKey = key === "slots" ? "users" : "slots";

  const tabs = `
    <div class="tabs">
      <a href="/api/backups?key=slots&secret=${secret}" class="${key === "slots" ? "active" : ""}">Slots</a>
      <a href="/api/backups?key=users&secret=${secret}" class="${key === "users" ? "active" : ""}">Users</a>
    </div>
  `;

  if (req.method === "POST" && req.query.restore !== undefined) {
    const idx = parseInt(req.query.restore, 10);
    const backup = await getBackup(redis, redisKey, idx);
    if (!backup) {
      return res.status(404).send(page("Not found", `${tabs}<p class="empty">That backup no longer exists.</p>`));
    }

    // Snapshot what's live right now before restoring, so the restore itself is undoable.
    const current = await redis.get(redisKey);
    await pushBackup(redis, redisKey, current);
    await redis.set(redisKey, backup.data);

    return res.status(200).send(page("Restored", `
      ${tabs}
      <div class="success">Restored the ${key} backup from ${new Date(backup.savedAt).toLocaleString()}. The data that was live just before this restore was itself saved as a new backup, so this can be undone.</div>
    `));
  }

  const [current, backups] = await Promise.all([
    redis.get(redisKey),
    listBackups(redis, redisKey),
  ]);

  const rows = backups.length
    ? backups.map(b => `
        <div class="row">
          <div>
            <div class="when">${new Date(b.savedAt).toLocaleString()}</div>
            <div class="summary">${summarize(key, b.data)}</div>
          </div>
          <form method="POST" action="/api/backups?key=${key}&secret=${secret}&restore=${b.index}">
            <button class="btn" onclick="return confirm('Restore ${key} to this snapshot? The current data will be saved as a backup first.')">Restore</button>
          </form>
        </div>
      `).join("")
    : `<p class="empty">No backups yet — one is taken automatically every time ${key} is saved.</p>`;

  return res.status(200).send(page(`Backups — ${key}`, `
    ${tabs}
    <div class="current">Currently live: <strong>${summarize(key, current)}</strong></div>
    ${rows}
  `));
}
