import { Resend } from "resend";

// Single gateway for every email the app sends.
//
// Safety rule: real emails are only sent from the live site (Vercel's
// "production" environment). Test versions of the app (previews) and local
// development never email anyone — they just log what would have been sent.
// This protects real sitters from getting test emails while we work on changes.

export const emailsEnabled = process.env.VERCEL_ENV === "production";

let realClient = null;
function client() {
  if (!realClient) realClient = new Resend(process.env.RESEND_API_KEY);
  return realClient;
}

export const resend = {
  emails: {
    async send(message) {
      if (!emailsEnabled) {
        console.log(
          `[email skipped: not the live site] to=${JSON.stringify(message.to)} subject=${JSON.stringify(message.subject)}`
        );
        // Same shape the Resend SDK returns on success, so callers behave normally.
        return { data: { id: "skipped-not-production" }, error: null };
      }
      return client().emails.send(message);
    },
  },
};
