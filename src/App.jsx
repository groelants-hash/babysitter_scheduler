import { useState, useEffect } from "react";

const HERO_IMG = "https://i.imgur.com/w6RMVy0.jpeg";

const defaultSlotData = {
  sitters: ["Emma", "Sophie", "Jake"],
  slots: [
    { id: "s1", date: "2026-05-03", start: "09:00", end: "17:00", claimedBy: null },
    { id: "s2", date: "2026-05-07", start: "18:00", end: "22:00", claimedBy: null },
    { id: "s3", date: "2026-05-10", start: "09:00", end: "13:00", claimedBy: null },
  ],
  rates: {}
};

const defaultUsers = [
  { id: "u1", email: "admin@home.com", password: "admin123", role: "admin", sitterName: "" },
];

const COLORS = ["#7F77DD","#1D9E75","#D85A30","#D4537E","#378ADD","#BA7517"];
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
.sch-wrap{font-family:var(--font-sans);max-width:560px;margin:0 auto;padding:1.25rem 1rem 2rem}
.sch-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
.sch-title{font-size:20px;font-weight:500;color:var(--color-text-primary);margin:0}
.sch-saving{font-size:11px;color:var(--color-text-secondary);margin-left:8px}
.sch-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.5rem}
.sch-stat{background:var(--color-background-secondary);border-radius:10px;padding:12px 14px}
.sch-stat-label{font-size:11px;color:var(--color-text-secondary);margin:0 0 4px;text-transform:uppercase;letter-spacing:0.04em}
.sch-stat-val{font-size:26px;font-weight:500;color:var(--color-text-primary);margin:0}
.sch-tabs{display:flex;gap:0;margin-bottom:1.25rem;border-bottom:0.5px solid var(--color-border-tertiary)}
.sch-tab{font-size:13px;padding:7px 14px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--color-text-secondary);cursor:pointer;margin-bottom:-1px;transition:color 0.1s}
.sch-tab.active{color:var(--color-text-primary);border-bottom:2px solid var(--color-text-primary)}
.sch-slot{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.sch-slot:hover{border-color:var(--color-border-secondary)}
.sch-slot-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.sch-slot-body{flex:1;min-width:0}
.sch-slot-date{font-size:14px;font-weight:500;color:var(--color-text-primary);margin:0 0 2px}
.sch-slot-time{font-size:12px;color:var(--color-text-secondary);margin:0}
.sch-slot-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.sch-avatar{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;color:#fff;flex-shrink:0}
.sch-avatar-lg{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;color:#fff;flex-shrink:0}
.sch-icon-btn{background:transparent;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:14px;padding:4px 6px;border-radius:6px;line-height:1}
.sch-icon-btn:hover{background:var(--color-background-secondary)}
.sch-add-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:1rem;padding:14px 16px;background:var(--color-background-secondary);border-radius:12px}
.sch-input{font-size:13px;padding:7px 10px;border-radius:8px;border:0.5px solid var(--color-border-secondary);background:var(--color-background-primary);color:var(--color-text-primary);outline:none}
.sch-input:focus{border-color:var(--color-border-primary)}
.sch-btn{font-size:13px;padding:7px 14px;border-radius:8px;border:0.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer;white-space:nowrap}
.sch-btn:hover{background:var(--color-background-secondary)}
.sch-btn-primary{font-size:13px;padding:7px 16px;border-radius:8px;border:none;background:var(--color-text-primary);color:var(--color-background-primary);cursor:pointer;white-space:nowrap}
.sch-btn-primary:hover{opacity:0.85}
.sch-sitter-row{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.sch-empty{font-size:14px;color:var(--color-text-secondary);padding:1rem 0}
.sch-cal-link{font-size:12px;padding:5px 12px;border-radius:8px;border:0.5px solid var(--color-border-secondary);color:var(--color-text-primary);text-decoration:none;white-space:nowrap}
.sch-cal-link:hover{background:var(--color-background-secondary)}
.sch-sitter-btn{display:flex;align-items:center;gap:7px;padding:7px 14px 7px 8px;border-radius:99px;border:0.5px solid var(--color-border-secondary);background:transparent;cursor:pointer;font-size:13px;color:var(--color-text-primary);transition:background 0.1s}
.sch-sitter-btn:hover{background:var(--color-background-secondary)}
.sch-sitter-btn.active{border-width:1.5px}
.sch-open-badge{font-size:12px;padding:3px 10px;border-radius:99px;background:var(--color-background-success);color:var(--color-text-success);font-weight:500}
.sch-taken-badge{font-size:12px;padding:3px 10px;border-radius:99px;background:var(--color-background-secondary);color:var(--color-text-secondary)}
.sch-slot-sitter{font-size:12px;padding:3px 10px;border-radius:99px;font-weight:500;color:#fff}
.auth-wrap{min-height:420px;display:flex;align-items:center;justify-content:center;padding:2rem 1rem}
.auth-card{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:16px;padding:2rem;width:100%;max-width:360px}
.auth-hero{width:100%;border-radius:10px;margin-bottom:1.25rem;display:block}
.auth-h{font-size:18px;font-weight:500;text-align:center;margin:0 0 0.25rem;color:var(--color-text-primary)}
.auth-sub{font-size:13px;text-align:center;color:var(--color-text-secondary);margin:0 0 1.5rem}
.auth-field{margin-bottom:12px}
.auth-label{font-size:12px;color:var(--color-text-secondary);margin:0 0 4px;display:block}
.auth-input{width:100%;font-size:14px;padding:9px 12px;border-radius:9px;border:0.5px solid var(--color-border-secondary);background:var(--color-background-secondary);color:var(--color-text-primary);outline:none;box-sizing:border-box}
.auth-input:focus{border-color:var(--color-border-primary);background:var(--color-background-primary)}
.auth-err{font-size:12px;color:var(--color-text-danger);margin:0 0 12px;padding:8px 12px;background:var(--color-background-danger);border-radius:8px}
.auth-btn{width:100%;padding:10px;border-radius:9px;border:none;background:var(--color-text-primary);color:var(--color-background-primary);font-size:14px;font-weight:500;cursor:pointer;margin-top:4px}
.auth-btn:hover{opacity:0.85}
.user-row{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.role-badge{font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500}
.role-admin{background:#EEEDFE;color:#3C3489}
.role-sitter{background:#E1F5EE;color:#085041}
select.sch-input{cursor:pointer}
`;

// ─── App root ────────────────────────────────────────────────────────────────

export default function App() {
  const [slotData, setSlotData] = useState(null);
  const [users, setUsers] = useState(null);
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("slots");

  useEffect(() => {
    (async () => {
      try {
        const [sd, ud] = await Promise.all([
          fetch("/api/data").then(r => r.json()),
          fetch("/api/users").then(r => r.json()),
        ]);
        setSlotData(sd || defaultSlotData);
        setUsers(ud || defaultUsers);
      } catch {
        setSlotData(defaultSlotData);
        setUsers(defaultUsers);
      }
      setTimeout(() => setLoaded(true), 300);
    })();
  }, []);

  async function saveSlots(d) {
    setSaving(true); setSlotData(d);
    try {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
    } catch {}
    setSaving(false);
  }

  async function saveUsers(u) {
    setUsers(u);
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(u),
      });
    } catch {}
  }

  if (!loaded || !slotData || !users) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--color-text-secondary)", fontSize: 14 }}>
      Loading…
    </div>
  );

  if (!session) return (
    <>
      <style>{CSS}</style>
      <LoginScreen users={users} onLogin={setSession} />
    </>
  );

  const isAdmin = session.role === "admin";

  return (
    <>
      <style>{CSS}</style>
      <div className="sch-wrap">
        <div className="sch-header">
          <p className="sch-title">
            Babysitter scheduler
            {saving && <span className="sch-saving">saving…</span>}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div className="sch-avatar" style={{ background: isAdmin ? "#7F77DD" : "#1D9E75", width: 26, height: 26, fontSize: 12 }}>{initials(session.email)}</div>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{session.email.split("@")[0]}</span>
              <span className={`role-badge ${isAdmin ? "role-admin" : "role-sitter"}`}>{session.role}</span>
            </div>
            <button className="sch-icon-btn" title="Sign out" style={{ fontSize: 13, padding: "4px 8px" }} onClick={() => { setSession(null); setTab("slots"); }}>
              Sign out
            </button>
          </div>
        </div>
        {isAdmin
          ? <AdminApp slotData={slotData} saveSlots={saveSlots} users={users} saveUsers={saveUsers} tab={tab} setTab={setTab} />
          : <SitterApp slotData={slotData} saveSlots={saveSlots} session={session} />
        }
      </div>
    </>
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function login() {
    const u = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
    if (!u) { setErr("Incorrect email or password."); return; }
    onLogin(u);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src={HERO_IMG} className="auth-hero" alt="The Babysitters" />
        <p className="auth-h">Welcome back</p>
        <p className="auth-sub">Sign in to manage your babysitting schedule</p>
        {err && <p className="auth-err">{err}</p>}
        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input className="auth-input" type="email" placeholder="you@example.com" value={email}
            onChange={e => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input className="auth-input" type="password" placeholder="••••••••" value={password}
            onChange={e => { setPassword(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <button className="auth-btn" onClick={login}>Sign in</button>
      </div>
    </div>
  );
}

// ─── Admin shell ─────────────────────────────────────────────────────────────

function AdminApp({ slotData, saveSlots, users, saveUsers, tab, setTab }) {
  const claimed = slotData.slots.filter(sl => sl.claimedBy).length;
  const total = slotData.slots.length;
  return (
    <>
      <div className="sch-stats">
        {[["Total slots", total], ["Claimed", claimed], ["Open", total - claimed]].map(([l, v]) => (
          <div className="sch-stat" key={l}>
            <p className="sch-stat-label">{l}</p>
            <p className="sch-stat-val">{v}</p>
          </div>
        ))}
      </div>
      <div className="sch-tabs">
        {["slots", "sitters", "overview", "payroll", "users"].map(t => (
          <button key={t} className={"sch-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "slots"    && <SlotsTab data={slotData} save={saveSlots} />}
      {tab === "sitters"  && <SittersTab data={slotData} save={saveSlots} />}
      {tab === "overview" && <OverviewTab data={slotData} unclaimSlot={id => saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: null } : s) })} />}
      {tab === "payroll"  && <Payroll data={slotData} save={saveSlots} />}
      {tab === "users"    && <UsersTab users={users} saveUsers={saveUsers} sitters={slotData.sitters} />}
    </>
  );
}

// ─── Sitter shell ─────────────────────────────────────────────────────────────

function SitterApp({ slotData, saveSlots, session }) {
  const [tab, setTab] = useState("slots");
  const name = session.sitterName;
  const color = sitterColor(name, slotData.sitters);

  function claimSlot(id) {
    const slot = slotData.slots.find(s => s.id === id);
    if (slot.claimedBy) return;
    saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: name } : s) });
  }

  function unclaimSlot(id) {
    saveSlots({ ...slotData, slots: slotData.slots.map(s => s.id === id ? { ...s, claimedBy: null } : s) });
  }

  const visibleSlots = [...slotData.slots]
    .filter(sl => {
      if (sl.freeNight && !FREE_NIGHT_SITTERS.includes(name)) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="sch-tabs">
        {["slots", "payroll"].map(t => (
          <button key={t} className={"sch-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "slots" && (
        <>
          {visibleSlots.length === 0 && <p className="sch-empty">No slots available.</p>}
          {visibleSlots.map(sl => {
            const mine = sl.claimedBy === name, taken = sl.claimedBy && !mine;
            return (
              <div className="sch-slot" key={sl.id} style={{ opacity: taken ? 0.45 : 1 }}>
                <div className="sch-slot-dot" style={{ background: mine ? color : taken ? "var(--color-border-secondary)" : "#1D9E75" }} />
                <div className="sch-slot-body">
                  <p className="sch-slot-date">{fmtDate(sl.date)}</p>
                  <p className="sch-slot-time">{sl.start} – {sl.end}</p>
                </div>
                <div className="sch-slot-right">
                  {taken
                    ? <span className="sch-taken-badge">Taken</span>
                    : mine
                      ? <button className="sch-btn" style={{ fontSize: 12 }} onClick={() => unclaimSlot(sl.id)}>Unclaim</button>
                      : <button className="sch-btn-primary" style={{ fontSize: 12 }} onClick={() => claimSlot(sl.id)}>Claim</button>
                  }
                </div>
              </div>
            );
          })}
        </>
      )}
      {tab === "payroll" && <Payroll data={slotData} save={saveSlots} fixedSitter={name} readOnly />}
    </>
  );
}

// ─── Slots tab ────────────────────────────────────────────────────────────────

function SlotsTab({ data, save }) {
  const schedule = data.schedule || defaultSchedule;
  const [newSlot, setNewSlot] = useState({ date: "", start: "09:00", end: "17:00", freeNight: false });
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

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
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Weekly recurring schedule</p>
      <div className="sch-slot" style={{ flexDirection: "column", gap: 0, padding: "4px 16px", marginBottom: 16 }}>
        {schedule.map((rec, i) => (
          <div key={rec.day} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < 6 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
            <div onClick={() => toggleDay(i)} style={{ width: 32, height: 18, borderRadius: 99, background: rec.on ? "#7F77DD" : "var(--color-background-secondary)", border: `0.5px solid ${rec.on ? "#7F77DD" : "var(--color-border-secondary)"}`, cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
              <div style={{ position: "absolute", top: 3, left: rec.on ? "auto" : "3px", right: rec.on ? "3px" : "auto", width: 12, height: 12, borderRadius: "50%", background: "#fff" }} />
            </div>
            <span style={{ width: 32, fontSize: 13, fontWeight: 500, color: rec.on ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{rec.day}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, opacity: rec.on ? 1 : 0.4 }}>
              <input type="time" className="sch-input" style={{ width: 90, padding: "4px 8px", fontSize: 12 }} value={rec.start} disabled={!rec.on} onChange={e => updateTime(i, "start", e.target.value)} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>–</span>
              <input type="time" className="sch-input" style={{ width: 90, padding: "4px 8px", fontSize: 12 }} value={rec.end} disabled={!rec.on} onChange={e => updateTime(i, "end", e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Generate slots</p>
      <div className="sch-slot" style={{ marginBottom: 20, gap: 10 }}>
        <select className="sch-input" style={{ flex: 1 }} value={genMonth} onChange={e => setGenMonth(e.target.value)}>
          {monthOptions.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}
        </select>
        <button className="sch-btn-primary" style={{ background: "#7F77DD", whiteSpace: "nowrap" }} onClick={generateSlots} disabled={genCount === 0}>
          {genCount === 0 ? "No new slots" : `Generate ${genCount} slot${genCount !== 1 ? "s" : ""}`}
        </button>
      </div>

      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>All slots</p>
      {data.slots.length === 0 && <p className="sch-empty">No slots yet.</p>}
      {[...data.slots].sort((a, b) => a.date.localeCompare(b.date)).map(sl => {
        const color = sl.claimedBy ? sitterColor(sl.claimedBy, data.sitters) : "var(--color-border-tertiary)";
        return (
          <div className="sch-slot" key={sl.id}>
            <div className="sch-slot-dot" style={{ background: sl.recurring ? "#7F77DD" : color }} />
            <div className="sch-slot-body">
              <p className="sch-slot-date">{fmtDate(sl.date)}</p>
              <p className="sch-slot-time">{sl.start} – {sl.end}</p>
            </div>
            <div className="sch-slot-right">
              {sl.recurring && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#EEEDFE", color: "#3C3489" }}>recurring</span>}
              {sl.freeNight && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#FAEEDA", color: "#854F0B" }}>free night</span>}
              {sl.claimedBy ? <span className="sch-slot-sitter" style={{ background: color }}>{sl.claimedBy}</span> : <span className="sch-open-badge">Open</span>}
              {sl.claimedBy && <button className="sch-icon-btn" title="Unclaim" onClick={() => save({ ...data, slots: data.slots.map(s => s.id === sl.id ? { ...s, claimedBy: null } : s) })}>↺</button>}
              <button className="sch-icon-btn" title="Remove" onClick={() => save({ ...data, slots: data.slots.filter(s => s.id !== sl.id) })}>✕</button>
            </div>
          </div>
        );
      })}

      <div className="sch-add-row">
        <input type="date" className="sch-input" style={{ flex: "0 0 130px" }} value={newSlot.date} onChange={e => setNewSlot(p => ({ ...p, date: e.target.value }))} />
        <input type="time" className="sch-input" style={{ width: 88 }} value={newSlot.start} onChange={e => setNewSlot(p => ({ ...p, start: e.target.value }))} />
        <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>–</span>
        <input type="time" className="sch-input" style={{ width: 88 }} value={newSlot.end} onChange={e => setNewSlot(p => ({ ...p, end: e.target.value }))} />
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={newSlot.freeNight} onChange={e => setNewSlot(p => ({ ...p, freeNight: e.target.checked }))} />
          free night
        </label>
        <button className="sch-btn-primary" onClick={addSlot}>Add</button>
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
    save({ ...data, sitters: data.sitters.filter(s => s !== name), slots: data.slots.map(sl => sl.claimedBy === name ? { ...sl, claimedBy: null } : sl) });
  }

  return (
    <>
      {data.sitters.map(name => {
        const color = sitterColor(name, data.sitters);
        const n = data.slots.filter(s => s.claimedBy === name).length;
        return (
          <div className="sch-sitter-row" key={name}>
            <div className="sch-avatar-lg" style={{ background: color }}>{initials(name)}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{name}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{n} slot{n !== 1 ? "s" : ""} claimed</p>
            </div>
            <button className="sch-icon-btn" onClick={() => removeSitter(name)}>✕</button>
          </div>
        );
      })}
      <div className="sch-add-row">
        <input className="sch-input" style={{ flex: 1 }} placeholder="Sitter name" value={newSitter}
          onChange={e => setNewSitter(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addSitter()} />
        <button className="sch-btn-primary" onClick={addSitter}>Add sitter</button>
      </div>
    </>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, unclaimSlot }) {
  const filled = data.slots.filter(sl => sl.claimedBy).sort((a, b) => a.date.localeCompare(b.date));
  if (!filled.length) return <p className="sch-empty">No slots claimed yet.</p>;
  return filled.map(sl => {
    const color = sitterColor(sl.claimedBy, data.sitters);
    return (
      <div className="sch-slot" key={sl.id}>
        <div className="sch-avatar" style={{ background: color, width: 28, height: 28, fontSize: 12 }}>{initials(sl.claimedBy)}</div>
        <div className="sch-slot-body">
          <p className="sch-slot-date">{fmtDate(sl.date)}</p>
          <p className="sch-slot-time">{sl.start} – {sl.end} · {sl.claimedBy}</p>
        </div>
        <a href={gcalUrl(sl)} target="_blank" rel="noreferrer" className="sch-cal-link">+ Google Cal</a>
      </div>
    );
  });
}

// ─── Payroll tab ──────────────────────────────────────────────────────────────

function Payroll({ data, save, fixedSitter, readOnly }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [selected, setSelected] = useState(fixedSitter || data.sitters[0] || "");
  const rates = data.rates || {};
  const dayRate = parseFloat(rates.day || 0), nightRate = parseFloat(rates.night || 0);

  function updateRate(field, val) { save({ ...data, rates: { ...(data.rates || {}), [field]: val } }); }

  const sitter = fixedSitter || selected;
  const color = sitterColor(sitter, data.sitters);
  const monthSlots = data.slots.filter(sl => sl.claimedBy === sitter && sl.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const totals = monthSlots.reduce((acc, sl) => { const { dayH, nightH } = calcSplit(sl); return { dayH: acc.dayH + dayH, nightH: acc.nightH + nightH }; }, { dayH: 0, nightH: 0 });
  const totalDue = totals.dayH * dayRate + totals.nightH * nightRate;
  const monthName = new Date(month + "-02").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <select className="sch-input" value={month} onChange={e => setMonth(e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return <option key={val} value={val}>{d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</option>;
          })}
        </select>
        {!fixedSitter && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {data.sitters.map(name => {
              const c = sitterColor(name, data.sitters); const active = selected === name;
              return (
                <button key={name} className={"sch-sitter-btn" + (active ? " active" : "")} style={active ? { borderColor: c, background: c + "18" } : {}} onClick={() => setSelected(name)}>
                  <div className="sch-avatar" style={{ background: c, width: 22, height: 22, fontSize: 11 }}>{initials(name)}</div>
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: "1.25rem" }}>
          {[["day", "Day rate (before 19:00)", "#FAC775"], ["night", "Night rate (19:00+)", "#7F77DD"]].map(([field, label, accent]) => (
            <div key={field} className="sch-stat" style={{ borderLeft: `3px solid ${accent}` }}>
              <p className="sch-stat-label">{label}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>€</span>
                <input type="number" min="0" step="0.5" className="sch-input" style={{ width: "100%", fontSize: 20, fontWeight: 500, padding: "2px 4px", border: "none", borderBottom: "1.5px solid var(--color-border-secondary)", borderRadius: 0, background: "transparent" }} value={rates[field] || ""} placeholder="0" onChange={e => updateRate(field, e.target.value)} />
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>/h</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: "1.5rem" }}>
        <div className="sch-stat"><p className="sch-stat-label" style={{ color: "#BA7517" }}>Day hours</p><p className="sch-stat-val">{fmtH(totals.dayH)}h</p>{dayRate > 0 && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>€{(totals.dayH * dayRate).toFixed(2)}</p>}</div>
        <div className="sch-stat"><p className="sch-stat-label" style={{ color: "#534AB7" }}>Night hours</p><p className="sch-stat-val">{fmtH(totals.nightH)}h</p>{nightRate > 0 && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>€{(totals.nightH * nightRate).toFixed(2)}</p>}</div>
        <div className="sch-stat" style={{ background: totalDue > 0 ? "var(--color-background-success)" : "var(--color-background-secondary)" }}>
          <p className="sch-stat-label" style={{ color: totalDue > 0 ? "var(--color-text-success)" : "var(--color-text-secondary)" }}>Total due</p>
          <p className="sch-stat-val" style={{ color: totalDue > 0 ? "var(--color-text-success)" : "var(--color-text-primary)" }}>€{totalDue.toFixed(2)}</p>
        </div>
      </div>

      {monthSlots.length === 0
        ? <p className="sch-empty">{sitter} has no claimed slots in {monthName}.</p>
        : monthSlots.map(sl => {
          const { dayH, nightH } = calcSplit(sl);
          const slotTotal = dayH * dayRate + nightH * nightRate;
          const overnight = () => { const [eh] = sl.end.split(":").map(Number); const [sh] = sl.start.split(":").map(Number); return eh < sh; };
          return (
            <div className="sch-slot" key={sl.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="sch-slot-dot" style={{ background: color }} />
                <div style={{ flex: 1 }}>
                  <p className="sch-slot-date" style={{ margin: 0 }}>{fmtDate(sl.date)}{overnight() && <span style={{ fontSize: 11, marginLeft: 6, padding: "1px 6px", borderRadius: 99, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>overnight</span>}</p>
                  <p className="sch-slot-time">{sl.start} – {sl.end}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{dayRate > 0 || nightRate > 0 ? `€${slotTotal.toFixed(2)}` : `${fmtH(dayH + nightH)}h`}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, paddingLeft: 22 }}>
                {dayH > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#FAEEDA", color: "#854F0B" }}>☀ {fmtH(dayH)}h day{dayRate > 0 ? ` · €${(dayH * dayRate).toFixed(2)}` : ""}</span>}
                {nightH > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#EEEDFE", color: "#3C3489" }}>☾ {fmtH(nightH)}h night{nightRate > 0 ? ` · €${(nightH * nightRate).toFixed(2)}` : ""}</span>}
              </div>
            </div>
          );
        })
      }
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
          <div className="sch-avatar-lg" style={{ background: u.role === "admin" ? "#7F77DD" : "#1D9E75", width: 32, height: 32, fontSize: 13 }}>{initials(u.email)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{u.role === "sitter" && u.sitterName ? `Linked to ${u.sitterName}` : u.role === "admin" ? "Admin access" : ""}</p>
          </div>
          <span className={`role-badge ${u.role === "admin" ? "role-admin" : "role-sitter"}`}>{u.role}</span>
          <button className="sch-icon-btn" title="Toggle role" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => toggleRole(u.id)}>⇄</button>
          <button className="sch-icon-btn" title="Remove" onClick={() => removeUser(u.id)}>✕</button>
        </div>
      ))}
      <div className="sch-add-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>Add new user</p>
        {err && <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-danger)", padding: "6px 10px", background: "var(--color-background-danger)", borderRadius: 8 }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="sch-input" style={{ flex: 2, minWidth: 140 }} placeholder="Email" value={newUser.email} onChange={e => { setNewUser(p => ({ ...p, email: e.target.value })); setErr(""); }} />
          <input className="sch-input" type="password" style={{ flex: 1, minWidth: 100 }} placeholder="Password" value={newUser.password} onChange={e => { setNewUser(p => ({ ...p, password: e.target.value })); setErr(""); }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="sch-input" style={{ flex: 1 }} value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value, sitterName: "" }))}>
            <option value="sitter">Sitter</option>
            <option value="admin">Admin</option>
          </select>
          {newUser.role === "sitter" && (
            <select className="sch-input" style={{ flex: 1 }} value={newUser.sitterName} onChange={e => setNewUser(p => ({ ...p, sitterName: e.target.value }))}>
              <option value="">Link to sitter…</option>
              {sitters.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button className="sch-btn-primary" onClick={addUser}>Add user</button>
        </div>
      </div>
    </div>
  );
}
