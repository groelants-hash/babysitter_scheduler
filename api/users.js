import { Resend } from "resend";
import { redis } from "./_lib/redis.js";
import { pushBackup, checkForSuspiciousShrink, wouldRemoveAllAdmins } from "./_lib/backup.js";
import { getSession, hashPassword } from "./_lib/auth.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const KEY = "babysitter:users";
const INIT_KEY = "babysitter:users:initialized";
const APP_URL = process.env.APP_URL || "https://bbsit.vercel.app";

function welcomeEmailHtml({ email, password, role }) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">
    <div style="background:#7F77DD;padding:24px 32px;">
      <p style="margin:0 0 4px;font-size:11px;color:#CECBF6;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:20px;font-weight:500;color:#fff;">You've been added!</h1>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#333;">An account has been created for you on the babysitter scheduler${role === "admin" ? " with admin access" : ""}. Here are your sign-in details:</p>
      <div style="background:#f5f5f5;border-radius:10px;padding:14px 16px;margin-bottom:1.25rem;">
        <p style="margin:0 0 8px;font-size:13px;color:#555;"><span style="color:#888;">Email</span><br/>${email}</p>
        <p style="margin:0;font-size:13px;color:#555;"><span style="color:#888;">Password</span><br/>${password}</p>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">You can change your password later by asking an admin to reset it.</p>
      <a href="${APP_URL}" style="display:block;width:100%;text-align:center;background:#1D9E75;color:#fff;font-size:14px;font-weight:500;padding:12px;border-radius:8px;text-decoration:none;box-sizing:border-box;">Sign in →</a>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>
  </div>
</body>
</html>`;
}

async function sendWelcomeEmails(newUsers) {
  const targets = newUsers.filter(u => u.email && u.plainPassword);
  if (targets.length === 0) return;
  // Best-effort: a flaky email send should never block the account from
  // being created (the save below has already succeeded by the time we'd
  // call this), so failures are swallowed rather than surfaced to the admin.
  await Promise.all(targets.map(u =>
    resend.emails.send({
      from: "Babysitter Scheduler <onboarding@resend.dev>",
      to: u.email,
      subject: "Welcome to the babysitter scheduler",
      html: welcomeEmailHtml({ email: u.email, password: u.plainPassword, role: u.role }),
    }).catch(err => console.error(`Welcome email failed for ${u.email}:`, err))
  ));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // The full user list (and any write to it) is admin-only: it's the one
  // place passwords live, and it controls who has accounts at all.
  const session = await getSession(redis, req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Admin sign-in required." });
  }

  if (req.method === "GET") {
    const [data, initialized] = await Promise.all([
      redis.get(KEY),
      redis.get(INIT_KEY),
    ]);
    const sanitized = Array.isArray(data)
      ? data.map(({ password, ...rest }) => rest)
      : data;
    return res.status(200).json({ data: sanitized ?? null, initialized: !!initialized });
  }

  if (req.method === "POST") {
    const incoming = req.body;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Invalid payload: expected an array of users." });
    }

    const force = req.query.force === "1";
    const current = (await redis.get(KEY)) || [];
    const currentById = new Map(current.map(u => [u.id, u]));

    // The client never receives real passwords (see GET above), so for any
    // user already on file we keep their existing stored password unless a
    // new plaintext one was explicitly supplied (new account, or a future
    // "reset password" feature). New plaintext passwords get hashed here.
    // Brand-new users (not in currentById) get a welcome email once the
    // save below succeeds, since that's the only point we have their
    // plaintext password in hand.
    const merged = [];
    const newlyCreated = [];
    for (const u of incoming) {
      const existing = currentById.get(u.id);
      let password = existing ? existing.password : undefined;
      if (u.password) {
        password = await hashPassword(u.password);
      }
      if (!password) {
        return res.status(400).json({ error: `User ${u.email} needs a password.` });
      }
      if (!existing) {
        newlyCreated.push({ email: u.email, role: u.role, plainPassword: u.password });
      }
      merged.push({
        id: u.id,
        email: u.email,
        password,
        role: u.role,
        sitterName: u.sitterName || "",
      });
    }

    if (!force) {
      const warning = checkForSuspiciousShrink(current, merged, "users")
        || (wouldRemoveAllAdmins(current, merged)
          ? "This save would remove every admin account, locking everyone out. If this is intentional, retry with ?force=1."
          : null);
      if (warning) return res.status(409).json({ error: warning });
    }

    await pushBackup(redis, KEY, current);
    await redis.set(KEY, merged);
    await redis.set(INIT_KEY, "true");

    if (newlyCreated.length > 0) {
      await sendWelcomeEmails(newlyCreated);
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
