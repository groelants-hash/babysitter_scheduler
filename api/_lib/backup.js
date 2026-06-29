// Shared write-safety helpers used by every API route that overwrites
// the full slots/users blob in Redis. The whole dataset lives under a
// couple of single keys, so a bad write (bug, stale client state, bad
// payload) can wipe everything in one call with nothing to recover from.
// These helpers add: (1) a rolling backup taken before every overwrite,
// and (2) a guard that blocks suspiciously destructive overwrites unless
// explicitly forced.

const MAX_BACKUPS = 50;

function backupsKeyFor(key) {
  return `${key}:backups`;
}

// Snapshot `previousValue` into a rolling list before it gets overwritten.
// No-op if there was nothing to snapshot yet (true first run).
export async function pushBackup(redis, key, previousValue) {
  if (previousValue === null || previousValue === undefined) return;
  const backupsKey = backupsKeyFor(key);
  await redis.lpush(
    backupsKey,
    JSON.stringify({ savedAt: new Date().toISOString(), data: previousValue })
  );
  await redis.ltrim(backupsKey, 0, MAX_BACKUPS - 1);
}

export async function listBackups(redis, key, limit = MAX_BACKUPS) {
  const raw = await redis.lrange(backupsKeyFor(key), 0, limit - 1);
  return raw.map((entry, index) => {
    const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;
    return { index, savedAt: parsed.savedAt, data: parsed.data };
  });
}

export async function getBackup(redis, key, index) {
  const raw = await redis.lrange(backupsKeyFor(key), index, index);
  if (!raw.length) return null;
  const parsed = typeof raw[0] === "string" ? JSON.parse(raw[0]) : raw[0];
  return parsed;
}

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && Array.isArray(value.slots)) return value.slots.length;
  return null;
}

// Flags a write that would shrink the dataset drastically compared to what's
// currently stored — the signature of a stale/empty/demo payload clobbering
// real data (the most likely failure mode we've seen) rather than an
// intentional bulk edit. Returns a warning string, or null if the write looks fine.
export function checkForSuspiciousShrink(previousValue, nextValue, label) {
  const prevCount = countOf(previousValue);
  const nextCount = countOf(nextValue);
  if (prevCount === null || nextCount === null) return null;
  if (prevCount === 0) return null;
  if (nextCount === 0 || nextCount < prevCount * 0.5) {
    return `This save would shrink ${label} from ${prevCount} to ${nextCount} (more than half gone). ` +
      `If this is intentional, retry with ?force=1.`;
  }
  return null;
}

// Users-specific guard: never allow a write that would leave zero admins,
// since that locks everyone out with no way to fix it from within the app.
export function wouldRemoveAllAdmins(previousUsers, nextUsers) {
  if (!Array.isArray(previousUsers) || !Array.isArray(nextUsers)) return false;
  const hadAdmin = previousUsers.some(u => u.role === "admin");
  const hasAdmin = nextUsers.some(u => u.role === "admin");
  return hadAdmin && !hasAdmin;
}
