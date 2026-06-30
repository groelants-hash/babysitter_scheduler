import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const HERO_IMG = "https://i.imgur.com/w6RMVy0.jpeg";

const defaultSlotData = {
  sitters: ["Emma", "Sophie", "Jake"],
  slots: [
    { id: "s1", date: "2026-05-03", start: "09:00", end: "17:00", claimedBy: null },
    { id: "s2", date: "2026-05-07", start: "18:00", end: "22:00", claimedBy: null },
    { id: "s3", date: "2026-05-10", start: "09:00", end: "13:00", claimedBy: null },
  ],
  rates: { day: 12, night: 10 }
};

const defaultUsers = [
  { id: "u1", email: "admin@home.com", password: "admin123", role: "admin", sitterName: "" },
];

const COLORS = ["#E07A5F","#3D405B","#81B29A","#F2CC8F","#6B8CAE","#C77DFF"];
const FREE_NIGHT_SITTERS = ["Iza","Gabi"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const defaultSchedule = DAYS.map(d => ({ day: d, on: false, start: "09:00", end: "17:00", freeNight: false }));

function sitterColor(name, sitters) { return COLORS[sitters.indexOf(name) % COLORS.length]; }
function initials(name) { return name.slice(0, 1).toUpperCase(); }
function uid() { return Math.random().toString(36).slice(2, 8); }
function fmtDate(date) { return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function fmtH(h) { return h % 1 === 0 ? h : h.toFixed(1); }

function gcalUrl(slot) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const d = slot.date.replace(/-/g, "");
  const ts = t => t.replace(":", "");
  return `${base}&text=Babysitter+(${slot.claimedBy || ""})&dates=${d}T${ts(slot.start)}00/${d}T${ts(slot.end)}00`;
}

function icalUrl(slot) {
  const d = slot.date.replace(/-/g, "");
  const ts = t => t.replace(":", "");
  const title = encodeURIComponent(`Babysitting (${slot.claimedBy || ""})`);
  return `data:text/calendar;charset=utf8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ADTSTART:${d}T${ts(slot.start)}00%0ADTEND:${d}T${ts(slot.end)}00%0ASUMMARY:${title}%0AEND:VEVENT%0AEND:VCALENDAR`;
}

function calcSplit(slot) {
  const [sh, sm] = slot.start.split(":").map(Number);
  const [eh, em] = slot.end.split(":").map(Number);
  const startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 1440;
  const NIGHT = 19 * 60;
  let dayM = 0, nightM = 0;
  for (let m = startM; m < endM; m++) {
    const t = m % 1440;
    if (t >= NIGHT) nightM++; else dayM++;
  }
  return { dayH: dayM / 60, nightH: nightM / 60 };
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Nunito+Sans:wght@400;500;600&display=swap');

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  :root {
    --cream: #FDF8F0;
    --cream-dark: #F5EDD8;
    --brown-light: #EDE0C8;
    --text-dark: #2C2016;
    --text-mid: #6B5744;
    --text-light: #9C8070;
    --accent: #E07A5F;
    --accent-light: #FAEAE5;
    --green: #5B9E7A;
    --green-light: #E4F4EC;
    --purple: #6B5EAD;
    --purple-light: #EDEAF8;
    --gold: #C4882A;
    --gold-light: #FEF3DC;
    --border: rgba(44,32,22,0.1);
    --shadow: 0 2px 12px rgba(44,32,22,0.08);
    --shadow-md: 0 4px 20px rgba(44,32,22,0.12);
    --r: 16px;
    --r-sm: 10px;
    --font: 'Nunito', sans-serif;
  }

  body { background: var(--cream); margin: 0; font-family: var(--font); }

  /* ── Layout ── */
  .app-shell { min-height: 100dvh; background: var(--cream); }
  .top-bar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(253,248,240,0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .top-bar-title { font-size: 18px; font-weight: 800; color: var(--text-dark); margin: 0; letter-spacing: -0.3px; }
  .top-bar-title span { color: var(--accent); }

  .wrap { max-width: 540px; margin: 0 auto; padding: 16px 14px 100px; }

  /* ── Stats ── */
  .stats-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 20px; }
  .stat-card {
    background: #fff; border-radius: var(--r); padding: 14px 12px;
    border: 1px solid var(--border); box-shadow: var(--shadow);
    text-align: center;
  }
  .stat-val { font-size: 28px; font-weight: 800; color: var(--text-dark); line-height: 1; margin-bottom: 3px; }
  .stat-lbl { font-size: 11px; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; }

  /* ── Tabs ── */
  .tab-bar {
    display: flex; gap: 4px; margin-bottom: 16px;
    background: var(--cream-dark); border-radius: 14px; padding: 4px;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tab-bar::-webkit-scrollbar { display: none; }
  .tab-btn {
    flex-shrink: 0; font-family: var(--font); font-size: 13px; font-weight: 700;
    padding: 8px 14px; border-radius: 10px; border: none;
    background: transparent; color: var(--text-mid); cursor: pointer;
    transition: all 0.15s; white-space: nowrap;
  }
  .tab-btn.active {
    background: #fff; color: var(--text-dark);
    box-shadow: 0 2px 8px rgba(44,32,22,0.1);
  }

  /* ── Cards / Slots ── */
  .card {
    background: #fff; border-radius: var(--r); border: 1px solid var(--border);
    box-shadow: var(--shadow); margin-bottom: 10px; overflow: hidden;
  }
  .slot-card {
    background: #fff; border-radius: var(--r); border: 1px solid var(--border);
    box-shadow: var(--shadow); margin-bottom: 10px;
    display: flex; align-items: center; gap: 12px; padding: 14px 14px;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .slot-card:active { transform: scale(0.985); }
  .slot-icon {
    width: 44px; height: 44px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
  }
  .slot-body { flex: 1; min-width: 0; }
  .slot-date { font-size: 15px; font-weight: 700; color: var(--text-dark); margin: 0 0 2px; }
  .slot-time { font-size: 13px; font-weight: 500; color: var(--text-mid); margin: 0; }
  .slot-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  /* ── Badges ── */
  .badge {
    display: inline-flex; align-items: center;
    font-size: 12px; font-weight: 700; padding: 4px 10px;
    border-radius: 99px; white-space: nowrap;
  }
  .badge-open { background: var(--green-light); color: var(--green); }
  .badge-taken { background: var(--cream-dark); color: var(--text-light); }
  .badge-sitter { color: #fff; }
  .badge-recurring { background: var(--purple-light); color: var(--purple); }
  .badge-freenight { background: var(--gold-light); color: var(--gold); }
  .badge-admin { background: var(--purple-light); color: var(--purple); }
  .badge-role { background: var(--green-light); color: var(--green); }

  /* ── Buttons ── */
  .btn {
    font-family: var(--font); font-size: 14px; font-weight: 700;
    padding: 10px 18px; border-radius: 12px; border: 1.5px solid var(--border);
    background: #fff; color: var(--text-dark); cursor: pointer;
    transition: all 0.15s; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:active { transform: scale(0.96); }
  .btn-primary {
    background: var(--accent); color: #fff; border-color: transparent;
    box-shadow: 0 3px 10px rgba(224,122,95,0.35);
  }
  .btn-primary:active { background: #d06a4f; }
  .btn-primary:disabled { background: var(--brown-light); box-shadow: none; color: var(--text-light); cursor: not-allowed; }
  .btn-ghost { border: none; background: transparent; padding: 8px; border-radius: 8px; color: var(--text-light); font-size: 16px; cursor: pointer; }
  .btn-ghost:active { background: var(--cream-dark); }
  .btn-sm { font-size: 13px; padding: 8px 14px; border-radius: 10px; }
  .btn-green { background: var(--green); color: #fff; border-color: transparent; box-shadow: 0 3px 10px rgba(91,158,122,0.3); }
  .btn-green:active { background: #4a8a69; }
  .btn-purple { background: var(--purple); color: #fff; border-color: transparent; box-shadow: 0 3px 10px rgba(107,94,173,0.3); }

  .signout-btn {
    font-family: var(--font); font-size: 12px; font-weight: 700;
    padding: 6px 12px; border-radius: 8px; border: 1.5px solid var(--border);
    background: #fff; color: var(--text-mid); cursor: pointer;
  }

  /* ── Avatars ── */
  .avatar {
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-weight: 800; color: #fff; flex-shrink: 0; font-family: var(--font);
  }

  /* ── Form elements ── */
  .field { margin-bottom: 14px; }
  .field-label { font-size: 12px; font-weight: 700; color: var(--text-mid); margin: 0 0 5px; display: block; text-transform: uppercase; letter-spacing: 0.04em; }
  .input {
    font-family: var(--font); font-size: 15px; font-weight: 500;
    padding: 12px 14px; border-radius: var(--r-sm);
    border: 1.5px solid var(--border);
    background: var(--cream); color: var(--text-dark); outline: none; width: 100%;
    transition: border-color 0.15s;
    -webkit-appearance: none; appearance: none;
  }
  .input:focus { border-color: var(--accent); background: #fff; }
  .input-sm { font-size: 13px; padding: 9px 11px; border-radius: 10px; }
  select.input { cursor: pointer; }

  /* ── Add row ── */
  .add-row {
    background: var(--cream-dark); border-radius: var(--r);
    padding: 14px; margin-top: 12px;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 11px; font-weight: 800; color: var(--text-light);
    text-transform: uppercase; letter-spacing: 0.07em;
    margin: 20px 0 10px;
  }

  /* ── Auth ── */
  .auth-shell {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 20px 16px; background: var(--cream);
  }
  .auth-card {
    background: #fff; border-radius: 24px; padding: 28px 24px;
    width: 100%; max-width: 380px; box-shadow: var(--shadow-md);
    border: 1px solid var(--border);
  }
  .auth-hero { width: 100%; border-radius: 16px; margin-bottom: 22px; display: block; object-fit: cover; max-height: 200px; }
  .auth-title { font-size: 24px; font-weight: 800; text-align: center; margin: 0 0 4px; color: var(--text-dark); letter-spacing: -0.5px; }
  .auth-sub { font-size: 14px; text-align: center; color: var(--text-light); margin: 0 0 24px; font-weight: 500; }
  .auth-err { font-size: 13px; font-weight: 600; color: #C0392B; padding: 10px 14px; background: #FDECEA; border-radius: 10px; margin-bottom: 14px; }

  /* ── Sitter selector pills ── */
  .sitter-pill {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 16px 8px 8px; border-radius: 99px;
    border: 2px solid var(--border); background: #fff;
    cursor: pointer; font-family: var(--font); font-size: 14px; font-weight: 700;
    color: var(--text-dark); transition: all 0.15s;
  }
  .sitter-pill:active { transform: scale(0.95); }
  .sitter-pill.active { border-width: 2px; }

  /* ── User row ── */
  .user-row {
    background: #fff; border-radius: var(--r); border: 1px solid var(--border);
    box-shadow: var(--shadow); padding: 14px; margin-bottom: 10px;
    display: flex; align-items: center; gap: 12px;
  }

  /* ── Toggle switch ── */
  .toggle {
    width: 38px; height: 22px; border-radius: 99px; border: none;
    cursor: pointer; position: relative; flex-shrink: 0;
    transition: background 0.2s; padding: 0;
  }
  .toggle-knob {
    position: absolute; top: 3px; width: 16px; height: 16px;
    border-radius: 50%; background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    transition: left 0.2s;
  }

  /* ── Calendar link ── */
  .cal-link {
    font-family: var(--font); font-size: 12px; font-weight: 700;
    padding: 7px 12px; border-radius: 10px;
    border: 1.5px solid var(--border); color: var(--text-dark);
    text-decoration: none; background: #fff; white-space: nowrap;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .cal-link:active { background: var(--cream-dark); }

  /* ── Empty state ── */
  .empty { text-align: center; padding: 40px 20px; color: var(--text-light); font-size: 15px; font-weight: 500; }
  .empty-icon { font-size: 40px; margin-bottom: 10px; }

  /* ── Saving indicator ── */
  .saving-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* ── Schedule rows ── */
  .sched-row {
    display: flex; align-items: center; gap: 10px; padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }
  .sched-row:last-child { border-bottom: none; }

  /* ── Payroll cards ── */
  .pay-card {
    background: #fff; border-radius: var(--r); border: 1px solid var(--border);
    box-shadow: var(--shadow); padding: 14px; margin-bottom: 10px;
  }

  /* ── Fade in ── */
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
  .fade-up { animation: fadeUp 0.25s ease both; }

  /* ── Assign bottom sheet ── */
  .popover-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(44,32,22,0.4);
    backdrop-filter: blur(2px);
    animation: fadeIn 0.18s ease;
  }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  .popover {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
    background: #fff; border-radius: 24px 24px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 16px);
    box-shadow: 0 -8px 40px rgba(44,32,22,0.18);
    animation: slideUp 0.22s cubic-bezier(0.32,0.72,0,1);
    max-width: 540px; margin: 0 auto;
  }
  @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
  .sheet-header {
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--border);
  }
  .sheet-title { font-size: 14px; font-weight: 800; color: var(--text-dark); margin: 0 0 1px; }
  .sheet-sub { font-size: 12px; font-weight: 500; color: var(--text-light); margin: 0; }
  .sheet-sitter-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .sheet-sitter-row:last-child { border-bottom: none; }
  .sheet-sitter-row:active { background: var(--cream); }
  .sheet-sitter-row.current { background: var(--cream-dark); }
  .sheet-unassign {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; cursor: pointer;
    border-top: 1px solid var(--border);
    transition: background 0.1s;
  }
  .sheet-unassign:active { background: #FDECEA; }
`;

// ─── App root ────────────────────────────────────────────────────────────────

export default function App() {
  const [slotData, setSlotData] = useState(null);
  const [users, setUsers] = useState(null);
  const [session, setSession] = useState(null);
  const [token, setToken] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("slots");
  const [showChangePw, setShowChangePw] = useState(false);
  // A password-reset email link looks like /?reset=<token>. Capture it once
  // on first render — this takes priority over the normal login/app flow
  // regardless of whether a session is already active on this device.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));

  function clearResetToken() {
    setResetToken(null);
    window.history.replaceState({}, "", window.location.pathname);
  }

  // Restore a saved session (from a previous visit) before doing anything else.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bbsit_session") || "null");
      if (saved && saved.token && saved.user) {
        setToken(saved.token);
        setSession(saved.user);
      }
    } catch {}
    setAuthChecked(true);
  }, []);

  function handleLogin(newToken, user) {
    setToken(newToken);
    setSession(user);
    try { localStorage.setItem("bbsit_session", JSON.stringify({ token: newToken, user })); } catch {}
  }

  function handleLogout() {
    if (token) {
      fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    setSession(null);
    setToken(null);
    setSlotData(null);
    setUsers(null);
    setLoaded(false);
    setLoadError(null);
    try { localStorage.removeItem("bbsit_session"); } catch {}
    setTab("slots");
  }

  useEffect(() => {
    if (!session || !token) return;
    (async () => {
      try {
        const authHeader = { Authorization: `Bearer ${token}` };
        const wantsUsers = session.role === "admin";
        const requests = [fetch("/api/data", { headers: authHeader })];
        if (wantsUsers) requests.push(fetch("/api/users", { headers: authHeader }));
        const [slotsRes, usersRes] = await Promise.all(requests);

        if (slotsRes.status === 401 || (usersRes && usersRes.status === 401)) {
          // Session expired or was revoked server-side — sign out cleanly.
          handleLogout();
          return;
        }
        if (!slotsRes.ok || (usersRes && !usersRes.ok)) {
          throw new Error("The server couldn't load your data right now.");
        }
        const sd = await slotsRes.json();
        const ud = usersRes ? await usersRes.json() : null;

        // `initialized` tells us whether anything has EVER been saved to this
        // key. If it has, and we're now getting null back, that's data going
        // missing — not a fresh app. Never paper over that with demo data,
        // since the next save would silently overwrite whatever's really there.
        if (sd.data === null && sd.initialized) {
          throw new Error("Your schedule data is missing from the database. This needs to be restored before continuing — nothing has been changed.");
        }
        if (ud && ud.data === null && ud.initialized) {
          throw new Error("Your user data is missing from the database. This needs to be restored before continuing — nothing has been changed.");
        }

        setSlotData(sd.data ?? defaultSlotData);
        if (ud) setUsers(ud.data ?? defaultUsers);
        setLoadError(null);
      } catch (e) {
        // Fetch/network failure or the missing-data case above: do NOT fall
        // back to demo data here. Doing so used to let the app load normally
        // on a hiccup, and the very next save would overwrite real data with
        // the hardcoded demo set. Show a hard stop instead.
        setLoadError(e.message || "Failed to load data.");
      }
      setTimeout(() => setLoaded(true), 300);
    })();
  }, [session, token]);

  async function saveSlots(d) {
    setSaving(true);
    const previous = slotData;
    setSlotData(d);
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(d),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (r.status === 401) { handleLogout(); return; }
        if (r.status === 409 && body.error) {
          const confirmed = window.confirm(`${body.error}\n\nClick OK to save anyway, or Cancel to undo this change.`);
          if (confirmed) {
            const retry = await fetch("/api/data?force=1", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(d),
            });
            if (!retry.ok) throw new Error("Save failed even after confirming.");
            setSaving(false);
            return;
          }
          setSlotData(previous);
          setSaving(false);
          return;
        }
        throw new Error(body.error || "Save failed.");
      }
    } catch (e) {
      setSlotData(previous);
      alert(`Couldn't save your changes (${e.message}). Your previous data has been kept — please try again.`);
    }
    setSaving(false);
  }

  async function saveUsers(u) {
    const previous = users;
    setUsers(u);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(u),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (r.status === 401) { handleLogout(); return; }
        if (r.status === 409 && body.error) {
          const confirmed = window.confirm(`${body.error}\n\nClick OK to save anyway, or Cancel to undo this change.`);
          if (confirmed) {
            const retry = await fetch("/api/users?force=1", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(u),
            });
            if (!retry.ok) throw new Error("Save failed even after confirming.");
            return;
          }
          setUsers(previous);
          return;
        }
        throw new Error(body.error || "Save failed.");
      }
    } catch (e) {
      setUsers(previous);
      alert(`Couldn't save your changes (${e.message}). Your previous data has been kept — please try again.`);
    }
  }

  if (resetToken) return (
    <>
      <style>{CSS}</style>
      <ResetPasswordScreen token={resetToken} onDone={clearResetToken} />
    </>
  );

  if (!authChecked) return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 10, color: "var(--text-mid)", fontSize: 15, fontFamily: "var(--font)", fontWeight: 600 }}>
        <span style={{ fontSize: 24 }}>🧸</span> Loading…
      </div>
    </>
  );

  if (!session) return (
    <>
      <style>{CSS}</style>
      <LoginScreen onLogin={handleLogin} />
    </>
  );

  if (loadError) return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 12, padding: 24, textAlign: "center", color: "var(--text-mid)", fontFamily: "var(--font)" }}>
        <span style={{ fontSize: 32 }}>⚠️</span>
        <p style={{ fontSize: 15, fontWeight: 700, maxWidth: 360 }}>Couldn't load the app</p>
        <p style={{ fontSize: 13, maxWidth: 360 }}>{loadError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </>
  );

  const wantsUsers = session.role === "admin";
  if (!loaded || !slotData || (wantsUsers && !users)) return (
    <>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 10, color: "var(--text-mid)", fontSize: 15, fontFamily: "var(--font)", fontWeight: 600 }}>
        <span style={{ fontSize: 24 }}>🧸</span> Loading…
      </div>
    </>
  );

  const isAdmin = session.role === "admin";
  const name = isAdmin ? session.email.split("@")[0] : session.sitterName || session.email.split("@")[0];
  const avatarColor = isAdmin ? "#6B5EAD" : sitterColor(session.sitterName, slotData.sitters);

  return (
    <>
      <style>{CSS}</style>
      <div className="app-shell">
        <div className="top-bar">
          <p className="top-bar-title">bb<span>sit</span> 🧸</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {saving && <div className="saving-dot" title="Saving…" />}
            <div className="avatar" style={{ background: avatarColor, width: 30, height: 30, fontSize: 13 }}>{initials(name)}</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-mid)" }}>{name}</span>
            <button className="signout-btn" onClick={() => setShowChangePw(true)}>
              Change password
            </button>
            <button className="signout-btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="wrap fade-up">
          {isAdmin
            ? <AdminApp slotData={slotData} saveSlots={saveSlots} users={users} saveUsers={saveUsers} tab={tab} setTab={setTab} />
            : <SitterApp slotData={slotData} saveSlots={saveSlots} session={session} />
          }
        </div>

        {showChangePw && <ChangePasswordSheet token={token} onClose={() => setShowChangePw(false)} />}
      </div>
    </>
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "forgot" | "forgot-sent"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(body.error || "Incorrect email or password."); setBusy(false); return; }
      onLogin(body.token, body.user);
    } catch (e) {
      setErr("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  async function sendResetLink() {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // The endpoint always returns a generic success regardless of whether
      // the email matched an account — same message either way here.
      setMode("forgot-sent");
    } catch (e) {
      setErr("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
  }

  if (mode === "forgot" || mode === "forgot-sent") {
    return (
      <div className="auth-shell">
        <div className="auth-card fade-up">
          <img src={HERO_IMG} className="auth-hero" alt="The Babysitters" />
          <p className="auth-title">Reset your password</p>
          <p className="auth-sub">
            {mode === "forgot-sent"
              ? "If an account exists for that email, a reset link is on its way."
              : "Enter your email and we'll send you a reset link."}
          </p>
          {err && <p className="auth-err">⚠️ {err}</p>}
          {mode === "forgot" && (
            <>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="input" type="email" placeholder="you@example.com" value={email}
                  onChange={e => { setEmail(e.target.value); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && sendResetLink()} />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "13px" }} onClick={sendResetLink} disabled={busy}>
                {busy ? "Sending…" : "Send reset link →"}
              </button>
            </>
          )}
          <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => { setMode("login"); setErr(""); }}>
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card fade-up">
        <img src={HERO_IMG} className="auth-hero" alt="The Babysitters" />
        <p className="auth-title">Welcome back 👋</p>
        <p className="auth-sub">Sign in to manage your schedule</p>
        {err && <p className="auth-err">⚠️ {err}</p>}
        <div className="field">
          <label className="field-label">Email</label>
          <input className="input" type="email" placeholder="you@example.com" value={email}
            onChange={e => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input className="input" type="password" placeholder="••••••••" value={password}
            onChange={e => { setPassword(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "13px" }} onClick={login} disabled={busy}>
          {busy ? "Signing in…" : "Sign in →"}
        </button>
        <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 10, border: "none", background: "transparent", color: "var(--text-light)", fontSize: 13, fontWeight: 600 }}
          onClick={() => { setMode("forgot"); setErr(""); }}>
          Forgot password?
        </button>
      </div>
    </div>
  );
}

// ─── Change password (signed-in user) ─────────────────────────────────────────

function ChangePasswordSheet({ token, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setErr("");
    if (newPassword !== confirmPassword) { setErr("New passwords don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(body.error || "Couldn't change your password."); setBusy(false); return; }
      setDone(true);
    } catch (e) {
      setErr("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
  }

  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="popover">
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--brown-light)", margin: "12px auto 0" }} />
        <div className="sheet-header">
          <p className="sheet-title">🔒 Change password</p>
          <p className="sheet-sub">{done ? "All set." : "Enter your current password and a new one."}</p>
        </div>
        <div style={{ padding: 16 }}>
          {done ? (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-mid)" }}>Your password has been updated.</p>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              {err && <p className="auth-err">⚠️ {err}</p>}
              <div className="field">
                <label className="field-label">Current password</label>
                <input className="input" type="password" placeholder="••••••••" value={currentPassword}
                  onChange={e => { setCurrentPassword(e.target.value); setErr(""); }} />
              </div>
              <div className="field">
                <label className="field-label">New password</label>
                <input className="input" type="password" placeholder="At least 6 characters" value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setErr(""); }} />
              </div>
              <div className="field">
                <label className="field-label">Confirm new password</label>
                <input className="input" type="password" placeholder="••••••••" value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setErr(""); }}
                  onKeyDown={e => e.key === "Enter" && submit()} />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Reset password (from email link) ──────────────────────────────────────────

function ResetPasswordScreen({ token, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setErr("");
    if (newPassword !== confirmPassword) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(body.error || "Couldn't reset your password."); setBusy(false); return; }
      setDone(true);
    } catch (e) {
      setErr("Couldn't reach the server. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card fade-up">
        <img src={HERO_IMG} className="auth-hero" alt="The Babysitters" />
        <p className="auth-title">{done ? "Password updated ✅" : "Choose a new password"}</p>
        {!done && <p className="auth-sub">Enter a new password for your account.</p>}
        {err && <p className="auth-err">⚠️ {err}</p>}
        {done ? (
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "13px" }} onClick={onDone}>
            Go to sign in →
          </button>
        ) : (
          <>
            <div className="field">
              <label className="field-label">New password</label>
              <input className="input" type="password" placeholder="At least 6 characters" value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setErr(""); }} />
            </div>
            <div className="field">
              <label className="field-label">Confirm new password</label>
              <input className="input" type="password" placeholder="••••••••" value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setErr(""); }}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "13px" }} onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Update password →"}
            </button>
            <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={onDone}>
              ← Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Admin shell ─────────────────────────────────────────────────────────────

function AdminApp({ slotData, saveSlots, users, saveUsers, tab, setTab }) {
  const claimed = slotData.slots.filter(sl => sl.claimedBy).length;
  const total = slotData.slots.length;
  const tabs = ["slots", "sitters", "overview", "payroll", "users", "test"];

  return (
    <>
      <div className="stats-row">
        {[["📋", "Total", total], ["✅", "Claimed", claimed], ["🟢", "Open", total - claimed]].map(([icon, l, v]) => (
          <div className="stat-card" key={l}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
            <div className="stat-val">{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div className="tab-bar">
        {tabs.map(t => (
          <button key={t} className={"tab-btn" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "slots"    && <SlotsTab data={slotData} save={saveSlots} />}
      {tab === "sitters"  && <SittersTab data={slotData} save={saveSlots} />}
      {tab === "overview" && <OverviewTab data={slotData} unclaimSlot={id => saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: null } : s) })} />}
      {tab === "payroll"  && <Payroll data={slotData} save={saveSlots} />}
      {tab === "users"    && <UsersTab users={users} saveUsers={saveUsers} sitters={slotData.sitters} />}
      {tab === "test"     && <TestTab />}
    </>
  );
}

// ─── Sitter shell ─────────────────────────────────────────────────────────────

function SitterApp({ slotData, saveSlots, session }) {
  const [tab, setTab] = useState("overview");
  const name = session.sitterName;
  const color = sitterColor(name, slotData.sitters);

  function claimSlot(id) {
    const slot = slotData.slots.find(s => s.id === id);
    if (slot.claimedBy) return;
    const today = new Date();
    const claimedAt = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: name, claimedAt } : s) });
  }

  function unclaimSlot(id) {
    saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: null } : s) });
  }

  const visibleSlots = [...slotData.slots]
    .filter(sl => !(sl.freeNight && !FREE_NIGHT_SITTERS.includes(name)))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Current month overview
  const currentMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
  const monthName = new Date(currentMonth + "-02").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const myMonthSlots = slotData.slots
    .filter(sl => sl.claimedBy === name && sl.date.startsWith(currentMonth))
    .sort((a, b) => a.date.localeCompare(b.date));
  const rates = slotData.rates || {};
  const dayRate = parseFloat(rates.day ?? 12);
  const nightRate = parseFloat(rates.night ?? 10);
  const monthTotals = myMonthSlots.reduce((acc, sl) => {
    if (sl.freeNight) return acc;
    const { dayH, nightH } = calcSplit(sl);
    return { dayH: acc.dayH + dayH, nightH: acc.nightH + nightH };
  }, { dayH: 0, nightH: 0 });
  const monthEarnings = monthTotals.dayH * dayRate + monthTotals.nightH * nightRate;

  return (
    <>
      <div className="tab-bar">
        {[["overview", "🗓️ Overview"], ["slots", "📋 Slots"], ["payroll", "💰 Payroll"]].map(([t, label]) => (
          <button key={t} className={"tab-btn" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="stats-row" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div style={{ fontSize: 20, marginBottom: 4 }}>📅</div>
              <div className="stat-val">{myMonthSlots.length}</div>
              <div className="stat-lbl">My slots</div>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: 20, marginBottom: 4 }}>⏱️</div>
              <div className="stat-val">{fmtH(monthTotals.dayH + monthTotals.nightH)}<span style={{ fontSize: 16 }}>h</span></div>
              <div className="stat-lbl">Hours</div>
            </div>
            <div className="stat-card" style={{ background: monthEarnings > 0 ? "var(--green-light)" : undefined }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>💶</div>
              <div className="stat-val" style={{ color: monthEarnings > 0 ? "var(--green)" : undefined }}>€{monthEarnings.toFixed(0)}</div>
              <div className="stat-lbl" style={{ color: monthEarnings > 0 ? "var(--green)" : undefined }}>Earnings</div>
            </div>
          </div>

          <p className="section-label">📆 {monthName}</p>
          {myMonthSlots.length === 0
            ? <div className="empty"><div className="empty-icon">🌿</div>No slots claimed yet this month.</div>
            : myMonthSlots.map(sl => {
                const hour = parseInt(sl.start.split(":")[0]);
                const icon = hour >= 19 ? "🌙" : hour >= 17 ? "🌆" : "☀️";
                const { dayH, nightH } = calcSplit(sl);
                const slotEarnings = sl.freeNight ? 0 : dayH * dayRate + nightH * nightRate;
                const isPast = sl.date < currentMonth.slice(0,7) + "-" + new Date().getDate().toString().padStart(2,'0') || sl.date < new Date().toISOString().slice(0,10);
                return (
                  <div className="slot-card" key={sl.id} style={{ opacity: isPast ? 0.6 : 1 }}>
                    <div className="slot-icon" style={{ background: color + "20" }}>
                      <span>{icon}</span>
                    </div>
                    <div className="slot-body">
                      <p className="slot-date">{fmtDate(sl.date)}</p>
                      <p className="slot-time">{sl.start} – {sl.end}</p>
                      {sl.freeNight && <span className="badge badge-freenight" style={{ fontSize: 11, marginTop: 4 }}>🌙 free</span>}
                    </div>
                    <div className="slot-right" style={{ flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      {sl.freeNight
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-light)" }}>Free</span>
                        : <span style={{ fontSize: 14, fontWeight: 800, color: "var(--green)" }}>€{slotEarnings.toFixed(2)}</span>
                      }
                      <div style={{ display: "flex", gap: 4 }}>
                        <a href={gcalUrl(sl)} target="_blank" rel="noreferrer" className="cal-link" style={{ fontSize: 11, padding: "4px 8px" }}>📅 GCal</a>
                        <a href={icalUrl(sl)} download={`bbsit-${sl.date}.ics`} className="cal-link" style={{ fontSize: 11, padding: "4px 8px" }}>🍎 iCal</a>
                      </div>
                    </div>
                  </div>
                );
              })
          }
        </>
      )}

      {tab === "slots" && (
        <>
          {visibleSlots.length === 0
            ? <div className="empty"><div className="empty-icon">📭</div>No slots available right now.</div>
            : visibleSlots.map(sl => {
                const mine = sl.claimedBy === name;
                const taken = sl.claimedBy && !mine;
                const hour = parseInt(sl.start.split(":")[0]);
                const icon = hour >= 19 ? "🌙" : hour >= 17 ? "🌆" : "☀️";
                return (
                  <div className="slot-card" key={sl.id} style={{ opacity: taken ? 0.5 : 1 }}>
                    <div className="slot-icon" style={{ background: mine ? color + "20" : taken ? "var(--cream-dark)" : "var(--green-light)" }}>
                      <span>{icon}</span>
                    </div>
                    <div className="slot-body">
                      <p className="slot-date">{fmtDate(sl.date)}</p>
                      <p className="slot-time">{sl.start} – {sl.end}</p>
                      {sl.freeNight && <span className="badge badge-freenight" style={{ fontSize: 11, marginTop: 4, display: "inline-flex" }}>🌙 free night</span>}
                    </div>
                    <div className="slot-right">
                      {taken
                        ? <span className="badge badge-taken">Taken</span>
                        : mine
                          ? <button className="btn btn-sm" onClick={() => unclaimSlot(sl.id)}>Unclaim</button>
                          : <button className="btn btn-sm btn-green" onClick={() => claimSlot(sl.id)}>Claim ✓</button>
                      }
                    </div>
                  </div>
                );
              })
          }
        </>
      )}
      {tab === "payroll" && <Payroll data={slotData} save={saveSlots} fixedSitter={name} readOnly />}
    </>
  );
}

// ─── Slots tab ────────────────────────────────────────────────────────────────


// --- Assign Sheet ---

function AssignSheet({ slot, sitters, onAssign, onClose }) {
  if (!slot) return null;
  const hour = parseInt(slot.start.split(":")[0]);
  const timeIcon = hour >= 19 ? "🌙" : hour >= 17 ? "🌆" : "☀️";

  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="popover">
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--brown-light)", margin: "12px auto 0" }} />
        <div className="sheet-header">
          <p className="sheet-title">{timeIcon} {fmtDate(slot.date)}</p>
          <p className="sheet-sub">{slot.start} – {slot.end} · Assign to a sitter</p>
        </div>
        {sitters.map(name => {
          const color = sitterColor(name, sitters);
          const isCurrent = slot.claimedBy === name;
          return (
            <div key={name} className={"sheet-sitter-row" + (isCurrent ? " current" : "")}
              onClick={() => { onAssign(slot.id, name); onClose(); }}>
              <div className="avatar" style={{ background: color, width: 40, height: 40, fontSize: 17 }}>{initials(name)}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-dark)" }}>{name}</p>
                {isCurrent && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-light)" }}>Currently assigned</p>}
              </div>
              {isCurrent
                ? <span style={{ fontSize: 20 }}>✓</span>
                : <span style={{ fontSize: 16, color: "var(--text-light)" }}>→</span>
              }
            </div>
          );
        })}
        {slot.claimedBy && (
          <div className="sheet-unassign" onClick={() => { onAssign(slot.id, null); onClose(); }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#FDECEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>×</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#C0392B" }}>Remove assignment</p>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

function EditSlotSheet({ slot, onSave, onClose }) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [freeNight, setFreeNight] = useState(false);
  const [err, setErr] = useState("");

  // Re-seed the form fields whenever a new slot is opened for editing.
  useEffect(() => {
    if (slot) {
      setDate(slot.date);
      setStart(slot.start);
      setEnd(slot.end);
      setFreeNight(!!slot.freeNight);
      setErr("");
    }
  }, [slot]);

  if (!slot) return null;

  function submit() {
    if (!date || !start || !end) { setErr("Date, start, and end are all required."); return; }
    onSave(slot.id, { date, start, end, freeNight });
    onClose();
  }

  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="popover">
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "var(--brown-light)", margin: "12px auto 0" }} />
        <div className="sheet-header">
          <p className="sheet-title">✏️ Edit slot</p>
          <p className="sheet-sub">{slot.claimedBy ? `Currently assigned to ${slot.claimedBy}` : "Update the date or time"}</p>
        </div>
        <div style={{ padding: 16 }}>
          {err && <p className="auth-err">⚠️ {err}</p>}
          <div className="field">
            <label className="field-label">Date</label>
            <input type="date" className="input" value={date} onChange={e => { setDate(e.target.value); setErr(""); }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">Start</label>
              <input type="time" className="input" value={start} onChange={e => { setStart(e.target.value); setErr(""); }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">End</label>
              <input type="time" className="input" value={end} onChange={e => { setEnd(e.target.value); setErr(""); }} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer", margin: "4px 0 16px" }}>
            <input type="checkbox" checked={freeNight} onChange={e => setFreeNight(e.target.checked)} />
            Free night
          </label>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
            Save changes
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

function SlotsTab({ data, save }) {
  const schedule = data.schedule || defaultSchedule;
  const [newSlot, setNewSlot] = useState({ date: "", start: "09:00", end: "17:00", freeNight: false });
  const [assignSlot, setAssignSlot] = useState(null);
  const [editSlot, setEditSlot] = useState(null);
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  function assignToSitter(slotId, sitterName) {
    save({ ...data, slots: data.slots.map(s => s.id === slotId ? { ...s, claimedBy: sitterName } : s) });
  }

  function updateSlot(slotId, patch) {
    save({ ...data, slots: data.slots.map(s => s.id === slotId ? { ...s, ...patch } : s) });
  }

  function saveSchedule(s) { save({ ...data, schedule: s }); }
  function toggleDay(i) { const s = [...schedule]; s[i] = { ...s[i], on: !s[i].on }; saveSchedule(s); }
  function updateTime(i, field, val) { const s = [...schedule]; s[i] = { ...s[i], [field]: val }; saveSchedule(s); }

  function countGenSlots() {
    const [y, m] = genMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dayIdx = (date.getDay() + 6) % 7;
      const rec = schedule[dayIdx];
      if (!rec.on) continue;
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const exists = data.slots.some(s => s.date === dateStr && s.start === rec.start && s.end === rec.end);
      if (!exists) count++;
    }
    return count;
  }

  function generateSlots() {
    const [y, m] = genMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const newSlots = [...data.slots];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dayIdx = (date.getDay() + 6) % 7;
      const rec = schedule[dayIdx];
      if (!rec.on) continue;
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const exists = newSlots.some(s => s.date === dateStr && s.start === rec.start && s.end === rec.end);
      if (!exists) newSlots.push({ id: uid(), date: dateStr, start: rec.start, end: rec.end, claimedBy: null, recurring: true, freeNight: !!rec.freeNight });
    }
    save({ ...data, slots: newSlots });
  }

  function addSlot() {
    if (!newSlot.date || !newSlot.start || !newSlot.end) return;
    save({ ...data, slots: [...data.slots, { id: uid(), ...newSlot, claimedBy: null }] });
    setNewSlot({ date: "", start: "09:00", end: "17:00", freeNight: false });
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() + i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lbl = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { val, lbl };
  });

  const genCount = countGenSlots();

  return (
    <>
      <p className="section-label">📆 Weekly recurring schedule</p>
      <div className="card" style={{ padding: "4px 16px" }}>
        {schedule.map((rec, i) => (
          <div className="sched-row" key={rec.day}>
            <button
              className="toggle"
              style={{ background: rec.on ? "var(--accent)" : "var(--brown-light)" }}
              onClick={() => toggleDay(i)}
            >
              <div className="toggle-knob" style={{ left: rec.on ? "19px" : "3px" }} />
            </button>
            <span style={{ width: 34, fontSize: 13, fontWeight: 700, color: rec.on ? "var(--text-dark)" : "var(--text-light)" }}>{rec.day}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, opacity: rec.on ? 1 : 0.35 }}>
              <input type="time" className="input input-sm" style={{ flex: 1, minWidth: 0 }} value={rec.start} disabled={!rec.on} onChange={e => updateTime(i, "start", e.target.value)} />
              <span style={{ color: "var(--text-light)", fontWeight: 700 }}>–</span>
              <input type="time" className="input input-sm" style={{ flex: 1, minWidth: 0 }} value={rec.end} disabled={!rec.on} onChange={e => updateTime(i, "end", e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <p className="section-label">⚡ Generate slots</p>
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <select className="input" style={{ flex: 1 }} value={genMonth} onChange={e => setGenMonth(e.target.value)}>
          {monthOptions.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}
        </select>
        <button className="btn btn-purple btn-sm" onClick={generateSlots} disabled={genCount === 0} style={{ flexShrink: 0 }}>
          {genCount === 0 ? "No new slots" : `Generate ${genCount}`}
        </button>
      </div>

      <p className="section-label">📋 All slots</p>
      {data.slots.length === 0
        ? <div className="empty"><div className="empty-icon">🗓️</div>No slots yet — generate or add one!</div>
        : [...data.slots].sort((a, b) => a.date.localeCompare(b.date)).map(sl => {
            const color = sl.claimedBy ? sitterColor(sl.claimedBy, data.sitters) : "#ccc";
            const hour = parseInt(sl.start.split(":")[0]);
            const icon = hour >= 19 ? "🌙" : hour >= 17 ? "🌆" : "☀️";
            return (
              <div className="slot-card" key={sl.id} style={{ cursor: "pointer" }}
                onClick={() => setAssignSlot(sl)}>
                <div className="slot-icon" style={{ background: sl.claimedBy ? color + "25" : "var(--cream-dark)" }}>
                  {icon}
                </div>
                <div className="slot-body">
                  <p className="slot-date">{fmtDate(sl.date)}</p>
                  <p className="slot-time">{sl.start} – {sl.end}</p>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {sl.recurring && <span className="badge badge-recurring" style={{ fontSize: 11 }}>recurring</span>}
                    {sl.freeNight && <span className="badge badge-freenight" style={{ fontSize: 11 }}>🌙 free night</span>}
                  </div>
                </div>
                <div className="slot-right" onClick={e => e.stopPropagation()}>
                  {sl.claimedBy
                    ? <span className="badge badge-sitter" style={{ background: color }}>{sl.claimedBy}</span>
                    : <span className="badge badge-open">Open</span>
                  }
                  <button className="btn-ghost" title="Assign sitter"
                    style={{ fontSize: 18, color: "var(--accent)" }}
                    onClick={e => { e.stopPropagation(); setAssignSlot(sl); }}>
                    👥
                  </button>
                  <button className="btn-ghost" title="Edit date/time"
                    onClick={e => { e.stopPropagation(); setEditSlot(sl); }}>
                    ✏️
                  </button>
                  {sl.claimedBy && (
                    <button className="btn-ghost" title="Unclaim" onClick={e => { e.stopPropagation(); save({ ...data, slots: data.slots.map(s => s.id === sl.id ? { ...s, claimedBy: null } : s) }); }}>↺</button>
                  )}
                  <button className="btn-ghost" title="Remove" onClick={e => { e.stopPropagation(); save({ ...data, slots: data.slots.filter(s => s.id !== sl.id) }); }}>✕</button>
                </div>
              </div>
            );
          })
      }

      <AssignSheet
        slot={assignSlot}
        sitters={data.sitters}
        onAssign={assignToSitter}
        onClose={() => setAssignSlot(null)}
      />

      <EditSlotSheet
        slot={editSlot}
        onSave={updateSlot}
        onClose={() => setEditSlot(null)}
      />

      <div className="add-row">
        <input type="date" className="input input-sm" style={{ flex: "1 1 130px" }} value={newSlot.date} onChange={e => setNewSlot(p => ({ ...p, date: e.target.value }))} />
        <input type="time" className="input input-sm" style={{ flex: "1 1 90px" }} value={newSlot.start} onChange={e => setNewSlot(p => ({ ...p, start: e.target.value }))} />
        <span style={{ color: "var(--text-light)", fontWeight: 700 }}>–</span>
        <input type="time" className="input input-sm" style={{ flex: "1 1 90px" }} value={newSlot.end} onChange={e => setNewSlot(p => ({ ...p, end: e.target.value }))} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={newSlot.freeNight} onChange={e => setNewSlot(p => ({ ...p, freeNight: e.target.checked }))} />
          Free night
        </label>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={addSlot}>+ Add</button>
      </div>
    </>
  );
}

// ─── Sitters tab ──────────────────────────────────────────────────────────────

function SittersTab({ data, save }) {
  const [newSitter, setNewSitter] = useState("");

  function addSitter() {
    const n = newSitter.trim();
    if (!n || data.sitters.includes(n)) return;
    save({ ...data, sitters: [...data.sitters, n] });
    setNewSitter("");
  }

  function removeSitter(name) {
    save({
      ...data,
      sitters: data.sitters.filter(s => s !== name),
      slots: data.slots.map(sl => sl.claimedBy === name ? { ...sl, claimedBy: null } : sl)
    });
  }

  return (
    <>
      {data.sitters.map(name => {
        const color = sitterColor(name, data.sitters);
        const n = data.slots.filter(s => s.claimedBy === name).length;
        return (
          <div className="card" key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div className="avatar" style={{ background: color, width: 44, height: 44, fontSize: 18 }}>{initials(name)}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-dark)" }}>{name}</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-light)", fontWeight: 500 }}>{n} slot{n !== 1 ? "s" : ""} claimed</p>
            </div>
            <button className="btn-ghost" onClick={() => removeSitter(name)} style={{ fontSize: 18 }}>✕</button>
          </div>
        );
      })}
      <div className="add-row">
        <input className="input input-sm" style={{ flex: 1 }} placeholder="Sitter name…" value={newSitter}
          onChange={e => setNewSitter(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addSitter()} />
        <button className="btn btn-primary btn-sm" onClick={addSitter}>+ Add</button>
      </div>
    </>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, unclaimSlot }) {
  const filled = data.slots.filter(sl => sl.claimedBy).sort((a, b) => a.date.localeCompare(b.date));
  if (!filled.length) return (
    <div className="empty"><div className="empty-icon">👀</div>No slots claimed yet.</div>
  );
  return filled.map(sl => {
    const color = sitterColor(sl.claimedBy, data.sitters);
    return (
      <div className="slot-card" key={sl.id}>
        <div className="avatar" style={{ background: color, width: 40, height: 40, fontSize: 16 }}>{initials(sl.claimedBy)}</div>
        <div className="slot-body">
          <p className="slot-date">{fmtDate(sl.date)}</p>
          <p className="slot-time">{sl.start} – {sl.end} · <strong>{sl.claimedBy}</strong></p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <a href={gcalUrl(sl)} target="_blank" rel="noreferrer" className="cal-link">📅 GCal</a>
          <a href={icalUrl(sl)} download={`bbsit-${sl.date}.ics`} className="cal-link">🍎 iCal</a>
        </div>
      </div>
    );
  });
}

// ─── Payroll tab ──────────────────────────────────────────────────────────────

function Payroll({ data, save, fixedSitter, readOnly }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [selected, setSelected] = useState(fixedSitter || data.sitters[0] || "");
  const rates = data.rates || {};
  const dayRate = parseFloat(rates.day ?? 12), nightRate = parseFloat(rates.night ?? 10);

  function updateRate(field, val) { save({ ...data, rates: { ...(data.rates || {}), [field]: val } }); }

  const allMonthSlots = data.slots.filter(sl => sl.date.startsWith(month));
  const claimedMonthSlots = allMonthSlots.filter(sl => sl.claimedBy);
  const totalOwed = claimedMonthSlots.reduce((sum, sl) => {
    if (sl.freeNight) return sum;
    const { dayH, nightH } = calcSplit(sl);
    return sum + dayH * dayRate + nightH * nightRate;
  }, 0);
  const totalForecast = allMonthSlots.reduce((sum, sl) => {
    if (sl.freeNight) return sum;
    const { dayH, nightH } = calcSplit(sl);
    return sum + dayH * dayRate + nightH * nightRate;
  }, 0);

  const sitter = fixedSitter || selected;
  const color = sitterColor(sitter, data.sitters);
  const monthSlots = data.slots.filter(sl => sl.claimedBy === sitter && sl.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const totals = monthSlots.reduce((acc, sl) => { if (sl.freeNight) return acc; const { dayH, nightH } = calcSplit(sl); return { dayH: acc.dayH + dayH, nightH: acc.nightH + nightH }; }, { dayH: 0, nightH: 0 });
  const totalDue = totals.dayH * dayRate + totals.nightH * nightRate;
  const monthName = new Date(month + "-02").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div>
      <select className="input" style={{ marginBottom: 16 }} value={month} onChange={e => setMonth(e.target.value)}>
        {Array.from({ length: 8 }, (_, i) => {
          const d = new Date(); d.setMonth(d.getMonth() + 1 - i);
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return <option key={val} value={val}>{d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</option>;
        })}
      </select>

      {!readOnly && (
        <>
          <p className="section-label">💶 Rates</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[["day", "☀️ Day rate", "#C4882A", "var(--gold-light)"], ["night", "🌙 Night rate", "var(--purple)", "var(--purple-light)"]].map(([field, label, accent, bg]) => (
              <div key={field} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${accent}`, background: bg }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 14, color: accent, fontWeight: 700 }}>€</span>
                  <input type="number" min="0" step="0.5" className="input input-sm" style={{ width: "100%", fontSize: 22, fontWeight: 800, padding: "2px 4px", border: "none", borderBottom: `2px solid ${accent}`, borderRadius: 0, background: "transparent", color: accent }} value={rates[field] ?? (field === "day" ? 12 : 10)} onChange={e => updateRate(field, e.target.value)} />
                  <span style={{ fontSize: 12, color: accent, fontWeight: 700 }}>/h</span>
                </div>
              </div>
            ))}
          </div>

          <p className="section-label">📊 Monthly summary</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div className="card" style={{ padding: "14px", background: "var(--green-light)", borderLeft: "3px solid var(--green)" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--green)", textTransform: "uppercase" }}>Total owed</p>
              <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 800, color: "var(--green)" }}>€{totalOwed.toFixed(2)}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--green)", opacity: 0.8, fontWeight: 500 }}>{claimedMonthSlots.length} slot{claimedMonthSlots.length !== 1 ? "s" : ""} claimed</p>
            </div>
            <div className="card" style={{ padding: "14px", background: "var(--purple-light)", borderLeft: "3px solid var(--purple)" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--purple)", textTransform: "uppercase" }}>Forecast</p>
              <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 800, color: "var(--purple)" }}>€{totalForecast.toFixed(2)}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--purple)", opacity: 0.8, fontWeight: 500 }}>{allMonthSlots.length} slot{allMonthSlots.length !== 1 ? "s" : ""} total</p>
            </div>
          </div>

          <p className="section-label">👤 Per sitter</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {data.sitters.map(name => {
              const c = sitterColor(name, data.sitters); const active = selected === name;
              return (
                <button key={name} className={"sitter-pill" + (active ? " active" : "")}
                  style={active ? { borderColor: c, background: c + "18" } : {}}
                  onClick={() => setSelected(name)}>
                  <div className="avatar" style={{ background: c, width: 24, height: 24, fontSize: 12 }}>{initials(name)}</div>
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
        <div className="card" style={{ padding: "12px", textAlign: "center" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase" }}>☀️ Day</p>
          <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "var(--text-dark)" }}>{fmtH(totals.dayH)}h</p>
          {dayRate > 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--text-light)", fontWeight: 500 }}>€{(totals.dayH * dayRate).toFixed(2)}</p>}
        </div>
        <div className="card" style={{ padding: "12px", textAlign: "center" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--purple)", textTransform: "uppercase" }}>🌙 Night</p>
          <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "var(--text-dark)" }}>{fmtH(totals.nightH)}h</p>
          {nightRate > 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--text-light)", fontWeight: 500 }}>€{(totals.nightH * nightRate).toFixed(2)}</p>}
        </div>
        <div className="card" style={{ padding: "12px", textAlign: "center", background: totalDue > 0 ? "var(--green-light)" : "#fff", borderLeft: totalDue > 0 ? "3px solid var(--green)" : undefined }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: totalDue > 0 ? "var(--green)" : "var(--text-light)", textTransform: "uppercase" }}>💰 Total</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: totalDue > 0 ? "var(--green)" : "var(--text-dark)" }}>€{totalDue.toFixed(2)}</p>
        </div>
      </div>

      {monthSlots.length === 0
        ? <div className="empty"><div className="empty-icon">💸</div>{sitter} has no claimed slots in {monthName}.</div>
        : monthSlots.map(sl => {
            const { dayH, nightH } = calcSplit(sl);
            const slotTotal = sl.freeNight ? 0 : dayH * dayRate + nightH * nightRate;
            const overnight = parseInt(sl.end.split(":")[0]) < parseInt(sl.start.split(":")[0]);
            return (
              <div className="pay-card" key={sl.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div className="slot-icon" style={{ background: color + "20", width: 38, height: 38 }}>
                    {parseInt(sl.start.split(":")[0]) >= 19 ? "🌙" : "☀️"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-dark)" }}>
                      {fmtDate(sl.date)}
                      {overnight && <span className="badge" style={{ fontSize: 10, background: "var(--cream-dark)", color: "var(--text-light)", marginLeft: 6 }}>overnight</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-mid)", fontWeight: 500 }}>{sl.start} – {sl.end}</p>
                  </div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: sl.freeNight ? "var(--text-light)" : "var(--text-dark)" }}>
                    {sl.freeNight ? "Free" : (dayRate > 0 || nightRate > 0 ? `€${slotTotal.toFixed(2)}` : `${fmtH(dayH + nightH)}h`)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, paddingLeft: 48 }}>
                  {dayH > 0 && <span className="badge badge-freenight" style={{ fontSize: 11 }}>☀️ {fmtH(dayH)}h{dayRate > 0 ? ` · €${(dayH * dayRate).toFixed(2)}` : ""}</span>}
                  {nightH > 0 && <span className="badge badge-recurring" style={{ fontSize: 11 }}>🌙 {fmtH(nightH)}h{nightRate > 0 ? ` · €${(nightH * nightRate).toFixed(2)}` : ""}</span>}
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ─── Test tab ──────────────────────────────────────────────────────────────────────────────

function TestTab() {
  const CRONS = [
    {
      key: "reminder",
      label: "7-day reminder",
      desc: "Emails admin if any slots are unclaimed and due in 7 days.",
      icon: "⏰",
      url: "/api/cron?force=1",
    },
    {
      key: "confirm",
      label: "Slot confirmation",
      desc: "Emails sitters who have a slot happening today to confirm timing.",
      icon: "✅",
      url: "/api/cron-slot-confirm",
    },
    {
      key: "monthly",
      label: "Monthly summary",
      desc: "Emails each sitter their earnings summary and next month schedule.",
      icon: "📅",
      url: "/api/cron-monthly?force=1",
    },
  ];

  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  async function runCron(key, url) {
    setLoading(l => ({ ...l, [key]: true }));
    setResults(r => ({ ...r, [key]: null }));
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_CRON_SECRET || ""}` },
      });
      const json = await res.json();
      setResults(r => ({ ...r, [key]: { ok: res.ok, msg: json.message || json.error || JSON.stringify(json) } }));
    } catch (e) {
      setResults(r => ({ ...r, [key]: { ok: false, msg: e.message } }));
    }
    setLoading(l => ({ ...l, [key]: false }));
  }

  return (
    <div>
      <div className="card" style={{ padding: "14px 16px", marginBottom: 20, background: "var(--gold-light)", borderLeft: "3px solid var(--gold)" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>⚠️ Admin only</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-mid)" }}>These buttons trigger real emails to real people. Use only for testing.</p>
      </div>
      {CRONS.map(({ key, label, desc, icon, url }) => {
        const result = results[key];
        const isLoading = loading[key];
        return (
          <div className="card" key={key} style={{ padding: "16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div className="slot-icon" style={{ background: "var(--cream-dark)", fontSize: 22, width: 44, height: 44, flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-dark)" }}>{label}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-light)", fontWeight: 500 }}>{desc}</p>
              </div>
            </div>
            <button
              className={"btn btn-sm" + (isLoading ? "" : " btn-primary")}
              style={{ width: "100%", justifyContent: "center" }}
              disabled={isLoading}
              onClick={() => runCron(key, url)}
            >
              {isLoading ? "Running…" : "▶ Run now"}
            </button>
            {result && (
              <div style={{
                marginTop: 10, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: result.ok ? "var(--green-light)" : "#FDECEA",
                color: result.ok ? "var(--green)" : "#C0392B",
              }}>
                {result.ok ? "✓ " : "⚠️ "}{result.msg}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ users, saveUsers, sitters }) {
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "sitter", sitterName: "" });
  const [err, setErr] = useState("");

  function addUser() {
    if (!newUser.email || !newUser.password) { setErr("Email and password required."); return; }
    if (users.find(u => u.email.toLowerCase() === newUser.email.toLowerCase())) { setErr("Email already exists."); return; }
    if (newUser.role === "sitter" && !newUser.sitterName) { setErr("Please link this account to a sitter."); return; }
    saveUsers([...users, { ...newUser, id: uid() }]);
    setNewUser({ email: "", password: "", role: "sitter", sitterName: "" });
    setErr("");
  }

  function removeUser(id) { saveUsers(users.filter(u => u.id !== id)); }
  function toggleRole(id) { saveUsers(users.map(u => u.id === id ? { ...u, role: u.role === "admin" ? "sitter" : "admin" } : u)); }

  return (
    <div>
      {users.map(u => (
        <div className="user-row" key={u.id}>
          <div className="avatar" style={{ background: u.role === "admin" ? "#6B5EAD" : sitterColor(u.sitterName || u.email, sitters), width: 40, height: 40, fontSize: 16 }}>{initials(u.email)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-dark)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-light)", fontWeight: 500 }}>
              {u.role === "sitter" && u.sitterName ? `Linked to ${u.sitterName}` : u.role === "admin" ? "Admin access" : ""}
            </p>
          </div>
          <span className={"badge " + (u.role === "admin" ? "badge-admin" : "badge-role")}>{u.role}</span>
          <button className="btn-ghost" title="Toggle role" onClick={() => toggleRole(u.id)}>⇄</button>
          <button className="btn-ghost" title="Remove" onClick={() => removeUser(u.id)}>✕</button>
        </div>
      ))}

      <div className="add-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text-mid)" }}>➕ Add new user</p>
        {err && <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#C0392B", padding: "8px 12px", background: "#FDECEA", borderRadius: 10 }}>⚠️ {err}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="input input-sm" style={{ flex: "2 1 140px" }} placeholder="Email" value={newUser.email} onChange={e => { setNewUser(p => ({ ...p, email: e.target.value })); setErr(""); }} />
          <input className="input input-sm" type="password" style={{ flex: "1 1 100px" }} placeholder="Password" value={newUser.password} onChange={e => { setNewUser(p => ({ ...p, password: e.target.value })); setErr(""); }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="input input-sm" style={{ flex: 1 }} value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value, sitterName: "" }))}>
            <option value="sitter">Sitter</option>
            <option value="admin">Admin</option>
          </select>
          {newUser.role === "sitter" && (
            <select className="input input-sm" style={{ flex: 1 }} value={newUser.sitterName} onChange={e => setNewUser(p => ({ ...p, sitterName: e.target.value }))}>
              <option value="">Link to sitter…</option>
              {sitters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button className="btn btn-primary btn-sm" onClick={addUser}>Add user</button>
        </div>
      </div>
    </div>
  );
}