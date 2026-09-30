# BBSIT – Babysitter Scheduler

Web app to schedule babysitters: recurring slots, sitter claims, payroll, email notifications.
Live at gautrach.com. Owner: Gauthier (not a developer – relies on Claude for all code changes).

## How to work with the owner
- Explain things in plain language, no jargon. Say what changed and how to check it.
- Work on a branch and open a pull request. Never push straight to `main` (main = live site via Vercel).
- After each change, give the Vercel preview link so it can be tested on a phone before merging.
- Ask before anything that touches production data, environment variables or the domain.

## Stack
- Frontend: React 18 + Vite (`src/App.jsx`, `src/main.jsx`). PWA (`public/manifest.json`, icons) for iPhone home screen.
- Backend: Vercel serverless functions in `api/` (shared helpers in `api/_lib/`: `auth.js`, `redis.js`, `backup.js`).
- Data: Upstash Redis (keep the `noeviction` policy; a past incident emptied the keys).
- Email: Resend (domain gautrach.com, DNS via Namecheap).
- Hosting/deploy: Vercel, auto-deploys from GitHub `main`. Every branch gets a preview URL.

## Features
- Role-based auth: admin and sitter (`api/login.js`, `logout.js`, password reset/change endpoints).
- Recurring slot scheduling, slot claiming and confirmation (`api/confirm-slot.js`).
- Payroll with day/night rate splitting.
- Open-slot emails to sitters with delivery status (`api/notify-open-slots.js`).
- Backups (`api/backups.js`, `api/_lib/backup.js`).

## Cron jobs (`vercel.json`)
- `/api/cron` – 7-day unclaimed slot alert
- `/api/cron-monthly` – monthly sitter earnings summary
- `/api/cron-slot-confirm` – slot confirmation flow

## Commands
- `npm run dev` – local dev server
- `npm run build` – production build (run before opening a PR)

## Rules
- Never delete or overwrite data in Redis without explicit approval and a backup first.
- Never commit secrets (Upstash, Resend keys live in Vercel environment variables).
- Keep the UI usable on iPhone, iPad and desktop.
- Deliverables and UI text in English unless told otherwise.
