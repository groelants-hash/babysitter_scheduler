// One serverless function that serves all the sign-in related endpoints.
//
// Vercel's free (Hobby) plan allows at most 12 functions per deployment, and the
// app had grown to 13, which made every new deployment fail. The five small
// account endpoints now live in api/_lib/handlers/ (unchanged code) and are
// reached through this file. vercel.json rewrites keep the original URLs
// (/api/login, /api/logout, ...) working, so the app itself needs no change.

import login from "./_lib/handlers/login.js";
import logout from "./_lib/handlers/logout.js";
import changePassword from "./_lib/handlers/change-password.js";
import forgotPassword from "./_lib/handlers/forgot-password.js";
import resetPassword from "./_lib/handlers/reset-password.js";

const ROUTES = {
  login,
  logout,
  "change-password": changePassword,
  "forgot-password": forgotPassword,
  "reset-password": resetPassword,
};

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  const route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null;
  if (!route) return res.status(404).json({ error: "Not found" });
  return route(req, res);
}
