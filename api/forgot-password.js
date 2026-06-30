import { Resend } from "resend";
import crypto from "crypto";
import { redis } from "./_lib/redis.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const USERS_KEY = "babysitter:users";
const RESET_PREFIX = "babysitter:reset:";
const RESET_TTL_SECONDS = 60 * 60; // 1 hour
const APP_URL = process.env.APP_URL || "https://bbsit.vercel.app";

function resetEmailHtml(link) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;border:0.5px solid #e5e5e5;overflow:hidden;">
    <div style="background:#7F77DD;padding:24px 32px;">
      <p style="margin:0 0 4px;font-size:11px;color:#CECBF6;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;">Babysitter scheduler</p>
      <h1 style="margin:0;font-size:20px;font-weight:500;color:#fff;">Reset your password</h1>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#333;">We got a request to reset your password. Click below to choose a new one — this link expires in 1 hour.</p>
      <a href="${link}" style="display:block;width:100%;text-align:center;background:#1D9E75;color:#fff;font-size:14px;font-weight:500;padding:12px;border-radius:8px;text-decoration:none;box-sizing:border-box;margin-bottom:1rem;">Choose a new password →</a>
      <p style="margin:0;font-size:12px;color:#888;">Didn't request this? You can safely ignore this email — your password won't change.</p>
    </div>
    <div style="padding:16px 32px;background:#fafafa;border-top:0.5px solid #e5e5e5;">
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="${APP_URL}" style="color:#aaa;">${APP_URL.replace("https://", "")}</a></p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  // Always return the same generic response whether or not the email
  // matches an account — never reveal which emails have accounts.
  const genericResponse = { ok: true, message: "If an account exists for that email, a reset link is on its way." };
  if (!email) return res.status(200).json(genericResponse);

  const users = (await redis.get(USERS_KEY)) || [];
  const user = users.find(u => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user) return res.status(200).json(genericResponse);

  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(RESET_PREFIX + token, { userId: user.id }, { ex: RESET_TTL_SECONDS });

  const link = `${APP_URL}/?reset=${token}`;
  try {
    await resend.emails.send({
      from: "Babysitter Scheduler <onboarding@resend.dev>",
      to: user.email,
      subject: "Reset your password",
      html: resetEmailHtml(link),
    });
  } catch (err) {
    console.error(`Reset email failed for ${user.email}:`, err);
    // Still return the generic success response — don't leak send failures
    // to the client, and don't block on email delivery.
  }

  return res.status(200).json(genericResponse);
}
