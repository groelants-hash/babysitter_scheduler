import { hashPassword } from "./auth.js";

// Test accounts for TEST VERSIONS of the app only (Vercel "preview" deployments).
//
// A test version has its own, separate, empty database, so nobody could sign in
// there. This creates two fake accounts the first time the sign-in endpoint
// finds that test database empty. Safety rules, all enforced below:
//  - runs ONLY when VERCEL_ENV is exactly "preview" (never on the live site),
//  - runs ONLY when a TEST_ADMIN_PASSWORD setting exists,
//  - never touches a database that already has any users in it, so even if a
//    test version were ever pointed at the live database by mistake, nothing
//    would be changed.

const USERS_KEY = "babysitter:users";
const USERS_INIT_KEY = "babysitter:users:initialized";

export const TEST_ADMIN_EMAIL = "test-admin@bbsit.test";
export const TEST_SITTER_EMAIL = "test-sitter@bbsit.test";

export async function seedTestAccountsIfEmpty(redis) {
  if (process.env.VERCEL_ENV !== "preview") return false;
  const plain = process.env.TEST_ADMIN_PASSWORD;
  if (!plain) return false;

  const existing = await redis.get(USERS_KEY);
  if (existing !== null && existing !== undefined) {
    // Anything other than a genuinely empty list: leave it alone.
    if (!Array.isArray(existing) || existing.length > 0) return false;
  }

  const password = await hashPassword(plain);
  const users = [
    { id: "test-admin", email: TEST_ADMIN_EMAIL, password, role: "admin", sitterName: "" },
    { id: "test-sitter", email: TEST_SITTER_EMAIL, password, role: "sitter", sitterName: "Test Sitter" },
  ];

  // NX = "only if the key does not exist yet", so two sign-ins at the same moment
  // can never overwrite each other. An existing empty list is replaced via a
  // second guarded step below.
  if (existing === null || existing === undefined) {
    const ok = await redis.set(USERS_KEY, users, { nx: true });
    if (!ok) return false;
  } else {
    // Key exists but is an empty list: re-check right before writing.
    const again = await redis.get(USERS_KEY);
    if (Array.isArray(again) && again.length > 0) return false;
    await redis.set(USERS_KEY, users);
  }
  await redis.set(USERS_INIT_KEY, "true");
  return true;
}
