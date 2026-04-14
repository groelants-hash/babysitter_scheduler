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

// ─── Storage layer (Redis via API) ───────────────────────────────────────────
async function loadData(key) {
  try {
    const res = await fetch(`/api/${key}`);
    const json = await res.json();
    return json;
  } catch { return null; }
}

async function saveData(key, data) {
  try {
    await fetch(`/api/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ["#7F77DD","#1D9E75","#D85A30","#D4537E","#378ADD","#BA7517"];
function sitterColor(name, sitters) { return COLORS[sitters.indexOf(name) % COLORS.length]; }
function initials(name) { return name.slice(0,1).toUpperCase(); }
function uid() { return Math.random().toString(36).slice(2,8); }
function fmtDate(date) { return new Date(date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}); }
function fmtH(h) { return h%1===0?h:h.toFixed(1); }

function gcalUrl(slot) {
  const base="https://calendar.google.com/calendar/render?action=TEMPLATE";
  const d=slot.date.replace(/-/g,""); const ts=t=>t.replace(":","");
  return `${base}&text=Babysitter+(${slot.claimedBy||""})&dates=${d}T${ts(slot.start)}00/${d}T${ts(slot.end)}00`;
}

function calcSplit(slot) {
  const [sh,sm]=slot.start.split(":").map(Number);
  const [eh,em]=slot.end.split(":").map(Number);
  const startM=sh*60+sm; let endM=eh*60+em;
  if(endM<=startM) endM+=1440;
  const NIGHT=19*60;
  let dayM=0,nightM=0;
  for(let m=startM;m<endM;m++){
    const t=m%1440;
    if(t>=NIGHT) nightM++; else dayM++;
  }
  return {dayH:dayM/60,nightH:nightM/60};
}

const CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9f9f8; color: #1a1a1a; }
.sch-wrap{max-width:560px;margin:0 auto;padding:1.25rem 1rem 2rem}
.sch-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
.sch-title{font-size:20px;font-weight:500;margin:0}
.sch-saving{font-size:11px;color:#888;margin-left:8px}
.sch-modetoggle{display:flex;background:#f1efe8;border-radius:99px;padding:3px;gap:2px}
.sch-modetoggle button{font-size:12px;padding:5px 14px;border-radius:99px;border:none;cursor:pointer;background:transparent;color:#666}
.sch-modetoggle button.active{background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.sch-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.5rem}
.sch-stat{background:#f1efe8;border-radius:10px;padding:12px 14px}
.sch-stat-label{font-size:11px;color:#666;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.04em}
.sch-stat-val{font-size:26px;font-weight:500;margin:0}
.sch-tabs{display:flex;margin-bottom:1.25rem;border-bottom:0.5px solid #e0ddd5}
.sch-tab{font-size:13px;padding:7px 14px;background:transparent;border:none;border-bottom:2px solid transparent;color:#888;cursor:pointer;margin-bottom:-1px}
.sch-tab.active{color:#1a1a1a;border-bottom:2px solid #1a1a1a}
.sch-slot{background:#fff;border:0.5px solid #e0ddd5;border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.sch-slot:hover{border-color:#ccc}
.sch-slot-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.sch-slot-body{flex:1;min-width:0}
.sch-slot-date{font-size:14px;font-weight:500;margin:0 0 2px}
.sch-slot-time{font-size:12px;color:#888;margin:0}
.sch-slot-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.sch-avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:500;color:#fff;flex-shrink:0}
.sch-icon-btn{background:transparent;border:none;cursor:pointer;color:#888;font-size:14px;padding:4px 6px;border-radius:6px}
.sch-icon-btn:hover{background:#f1efe8}
.sch-add-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:1rem;padding:14px 16px;background:#f1efe8;border-radius:12px}
.sch-input{font-size:13px;padding:7px 10px;border-radius:8px;border:0.5px solid #ccc;background:#fff;color:#1a1a1a;outline:none}
.sch-input:focus{border-color:#999}
.sch-btn{font-size:13px;padding:7px 14px;border-radius:8px;border:0.5px solid #ccc;background:transparent;color:#1a1a1a;cursor:pointer}
.sch-btn:hover{background:#f1efe8}
.sch-btn-primary{font-size:13px;padding:7px 16px;border-radius:8px;border:none;background:#1a1a1a;color:#fff;cursor:pointer}
.sch-btn-primary:hover{opacity:0.85}
.sch-sitter-row{background:#fff;border:0.5px solid #e0ddd5;border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.sch-empty{font-size:14px;color:#888;padding:1rem 0}
.sch-cal-link{font-size:12px;padding:5px 12px;border-radius:8px;border:0.5px solid #ccc;color:#1a1a1a;text-decoration:none}
.sch-cal-link:hover{background:#f1efe8}
.sch-sitter-btn{display:flex;align-items:center;gap:7px;padding:7px 14px 7px 8px;border-radius:99px;border:0.5px solid #ccc;background:transparent;cursor:pointer;font-size:13px;color:#1a1a1a}
.sch-sitter-btn:hover{background:#f1efe8}
.sch-sitter-btn.active{border-width:1.5px}
.sch-open-badge{font-size:12px;padding:3px 10px;border-radius:99px;background:#eaf3de;color:#27500a;font-weight:500}
.sch-taken-badge{font-size:12px;padding:3px 10px;border-radius:99px;background:#f1efe8;color:#888}
.sch-slot-sitter{font-size:12px;padding:3px 10px;border-radius:99px;font-weight:500;color:#fff}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem 1rem;background:#f9f9f8}
.auth-card{background:#fff;border:0.5px solid #e0ddd5;border-radius:16px;padding:2rem;width:100%;max-width:360px}
.auth-hero{width:100%;border-radius:10px;margin-bottom:1.25rem;display:block}
.auth-h{font-size:18px;font-weight:500;text-align:center;margin:0 0 0.25rem}
.auth-sub{font-size:13px;text-align:center;color:#888;margin:0 0 1.5rem}
.auth-field{margin-bottom:12px}
.auth-label{font-size:12px;color:#888;margin:0 0 4px;display:block}
.auth-input{width:100%;font-size:14px;padding:9px 12px;border-radius:9px;border:0.5px solid #ccc;background:#f9f9f8;color:#1a1a1a;outline:none}
.auth-input:focus{border-color:#999;background:#fff}
.auth-err{font-size:12px;color:#a32d2d;margin:0 0 12px;padding:8px 12px;background:#fcebeb;border-radius:8px}
.auth-btn{width:100%;padding:10px;border-radius:9px;border:none;background:#1a1a1a;color:#fff;font-size:14px;font-weight:500;cursor:pointer;margin-top:4px}
.auth-btn:hover{opacity:0.85}
.user-row{background:#fff;border:0.5px solid #e0ddd5;border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
.role-badge{font-size:11px;padding:2px 8px;border-radius:99px;font-weight:500}
.role-admin{background:#EEEDFE;color:#3C3489}
.role-sitter{background:#E1F5EE;color:#085041}
select.sch-input{cursor:pointer}
`;

export default function App() {
  const [slotData, setSlotData] = useState(null);
  const [users, setUsers] = useState(null);
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("slots");

  useEffect(() => {
    (async () => {
      const [sd, ud] = await Promise.all([
        loadData("slots"),
        loadData("users"),
      ]);
      setSlotData(sd || defaultSlotData);
      setUsers(ud || defaultUsers);
      setLoaded(true);
    })();
  }, []);

  async function saveSlots(d) {
    setSaving(true); setSlotData(d);
    await saveData("slots", d);
    setSaving(false);
  }

  async function saveUsers(u) {
    setUsers(u);
    await saveData("users", u);
  }

  if (!loaded) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontSize:14,color:"#888"}}>Loading…</div>;

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
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div className="sch-avatar" style={{background:isAdmin?"#7F77DD":"#1D9E75",width:26,height:26,fontSize:12}}>{initials(session.email)}</div>
              <span style={{fontSize:12,color:"#888"}}>{session.email.split("@")[0]}</span>
              <span className={`role-badge ${isAdmin?"role-admin":"role-sitter"}`}>{session.role}</span>
            </div>
            <button className="sch-icon-btn" onClick={()=>{setSession(null);setTab("slots");}}>Sign out</button>
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

function LoginScreen({ users, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function login() {
    const u = users.find(u => u.email.toLowerCase()===email.trim().toLowerCase() && u.password===password);
    if (!u) { setErr("Incorrect email or password."); return; }
    onLogin(u);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src={HERO_IMG} className="auth-hero" alt="The Babysitters" />
        <p className="auth-h">Welcome back</p>
        <p className="auth-sub">Sign in to manage your schedule</p>
        {err && <p className="auth-err">{err}</p>}
        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input className="auth-input" type="email" placeholder="you@example.com" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&login()} />
        </div>
        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input className="auth-input" type="password" placeholder="••••••••" value={password} onChange={e=>{setPassword(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&login()} />
        </div>
        <button className="auth-btn" onClick={login}>Sign in</button>
      </div>
    </div>
  );
}

function AdminApp({ slotData, saveSlots, users, saveUsers, tab, setTab }) {
  const claimed = slotData.slots.filter(sl=>sl.claimedBy).length;
  const total = slotData.slots.length;
  return (
    <>
      <div className="sch-stats">
        {[["Total slots",total],["Claimed",claimed],["Open",total-claimed]].map(([l,v])=>(
          <div className="sch-stat" key={l}><p className="sch-stat-label">{l}</p><p className="sch-stat-val">{v}</p></div>
        ))}
      </div>
      <div className="sch-tabs">
        {["slots","sitters","overview","payroll","users"].map(t=>(
          <button key={t} className={"sch-tab"+(tab===t?" active":"")} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
      {tab==="slots" && <SlotsTab data={slotData} save={saveSlots} />}
      {tab==="sitters" && <SittersTab data={slotData} save={saveSlots} />}
      {tab==="overview" && <OverviewTab data={slotData} unclaimSlot={id=>saveSlots({...slotData,slots:slotData.slots.map(s=>s.id===id?{...s,claimedBy:null}:s)})} />}
      {tab==="payroll" && <Payroll data={slotData} save={saveSlots} />}
      {tab==="users" && <UsersTab users={users} saveUsers={saveUsers} sitters={slotData.sitters} />}
    </>
  );
}

function SitterApp({ slotData, saveSlots, session }) {
  const [tab, setTab] = useState("slots");
  const name = session.sitterName;
  const color = sitterColor(name, slotData.sitters);
  function claimSlot(id) { saveSlots({...slotData, slots:slotData.slots.map(s=>s.id===id&&!s.claimedBy?{...s,claimedBy:name}:s)}); }
  function unclaimSlot(id) { saveSlots({...slotData, slots:slotData.slots.map(s=>s.id===id?{...s,claimedBy:null}:s)}); }
  return (
    <>
      <div className="sch-tabs">
        {["slots","payroll"].map(t=>(
          <button key={t} className={"sch-tab"+(tab===t?" active":"")} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
      {tab==="slots" && [...slotData.slots].sort((a,b)=>a.date.localeCompare(b.date)).map(sl=>{
        const mine=sl.claimedBy===name, taken=sl.claimedBy&&!mine;
        return (
          <div className="sch-slot" key={sl.id} style={{opacity:taken?0.45:1}}>
            <div className="sch-slot-dot" style={{background:mine?color:taken?"#ccc":"#1D9E75"}}/>
            <div className="sch-slot-body"><p className="sch-slot-date">{fmtDate(sl.date)}</p><p className="sch-slot-time">{sl.start} – {sl.end}</p></div>
            <div className="sch-slot-right">
              {taken?<span className="sch-taken-badge">Taken</span>
               :mine?<button className="sch-btn" style={{fontSize:12}} onClick={()=>unclaimSlot(sl.id)}>Unclaim</button>
               :<button className="sch-btn-primary" style={{fontSize:12}} onClick={()=>claimSlot(sl.id)}>Claim</button>}
            </div>
          </div>
        );
      })}
      {tab==="payroll" && <Payroll data={slotData} save={saveSlots} fixedSitter={name} readOnly />}
    </>
  );
}

function SlotsTab({ data, save }) {
  const [ns, setNs] = useState({date:"",start:"09:00",end:"17:00"});
  function add() {
    if (!ns.date) return;
    save({...data, slots:[...data.slots,{id:uid(),...ns,claimedBy:null}]});
    setNs({date:"",start:"09:00",end:"17:00"});
  }
  return (
    <>
      {[...data.slots].sort((a,b)=>a.date.localeCompare(b.date)).map(sl=>{
        const c=sl.claimedBy?sitterColor(sl.claimedBy,data.sitters):"#ccc";
        return (
          <div className="sch-slot" key={sl.id}>
            <div className="sch-slot-dot" style={{background:c}}/>
            <div className="sch-slot-body"><p className="sch-slot-date">{fmtDate(sl.date)}</p><p className="sch-slot-time">{sl.start} – {sl.end}</p></div>
            <div className="sch-slot-right">
              {sl.claimedBy?<span className="sch-slot-sitter" style={{background:c}}>{sl.claimedBy}</span>:<span className="sch-open-badge">Open</span>}
              {sl.claimedBy&&<button className="sch-icon-btn" onClick={()=>save({...data,slots:data.slots.map(s=>s.id===sl.id?{...s,claimedBy:null}:s)})}>↺</button>}
              <button className="sch-icon-btn" onClick={()=>save({...data,slots:data.slots.filter(s=>s.id!==sl.id)})}>✕</button>
            </div>
          </div>
        );
      })}
      <div className="sch-add-row">
        <input type="date" className="sch-input" style={{flex:"0 0 130px"}} value={ns.date} onChange={e=>setNs(p=>({...p,date:e.target.value}))}/>
        <input type="time" className="sch-input" style={{width:88}} value={ns.start} onChange={e=>setNs(p=>({...p,start:e.target.value}))}/>
        <span style={{color:"#888",fontSize:13}}>–</span>
        <input type="time" className="sch-input" style={{width:88}} value={ns.end} onChange={e=>setNs(p=>({...p,end:e.target.value}))}/>
        <button className="sch-btn-primary" onClick={add}>Add slot</button>
      </div>
    </>
  );
}

function SittersTab({ data, save }) {
  const [ns, setNs] = useState("");
  function add() {
    const n=ns.trim(); if(!n||data.sitters.includes(n)) return;
    save({...data,sitters:[...data.sitters,n]}); setNs("");
  }
  return (
    <>
      {data.sitters.map(name=>{
        const c=sitterColor(name,data.sitters);
        const n=data.slots.filter(s=>s.claimedBy===name).length;
        return (
          <div className="sch-sitter-row" key={name}>
            <div className="sch-avatar" style={{background:c,width:36,height:36,fontSize:15}}>{initials(name)}</div>
            <div style={{flex:1}}><p style={{margin:0,fontSize:14,fontWeight:500}}>{name}</p><p style={{margin:0,fontSize:12,color:"#888"}}>{n} slot{n!==1?"s":""} claimed</p></div>
            <button className="sch-icon-btn" onClick={()=>save({...data,sitters:data.sitters.filter(s=>s!==name),slots:data.slots.map(sl=>sl.claimedBy===name?{...sl,claimedBy:null}:sl)})}>✕</button>
          </div>
        );
      })}
      <div className="sch-add-row">
        <input className="sch-input" style={{flex:1}} placeholder="Sitter name" value={ns} onChange={e=>setNs(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}/>
        <button className="sch-btn-primary" onClick={add}>Add sitter</button>
      </div>
    </>
  );
}

function OverviewTab({ data, unclaimSlot }) {
  const filled=data.slots.filter(sl=>sl.claimedBy).sort((a,b)=>a.date.localeCompare(b.date));
  if(!filled.length) return <p className="sch-empty">No slots claimed yet.</p>;
  return filled.map(sl=>{
    const c=sitterColor(sl.claimedBy,data.sitters);
    return (
      <div className="sch-slot" key={sl.id}>
        <div className="sch-avatar" style={{background:c,width:28,height:28,fontSize:12}}>{initials(sl.claimedBy)}</div>
        <div className="sch-slot-body"><p className="sch-slot-date">{fmtDate(sl.date)}</p><p className="sch-slot-time">{sl.start} – {sl.end} · {sl.claimedBy}</p></div>
        <a href={gcalUrl(sl)} target="_blank" rel="noreferrer" className="sch-cal-link">+ Google Cal</a>
      </div>
    );
  });
}

function Payroll({ data, save, fixedSitter, readOnly }) {
  const [month,setMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
  const [selected,setSelected]=useState(fixedSitter||data.sitters[0]||"");
  const rates=data.rates||{};
  const dayRate=parseFloat(rates.day||0),nightRate=parseFloat(rates.night||0);
  const sitter=fixedSitter||selected;
  const color=sitterColor(sitter,data.sitters);
  const monthSlots=data.slots.filter(sl=>sl.claimedBy===sitter&&sl.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
  const totals=monthSlots.reduce((acc,sl)=>{const{dayH,nightH}=calcSplit(sl);return{dayH:acc.dayH+dayH,nightH:acc.nightH+nightH};},{dayH:0,nightH:0});
  const totalDue=totals.dayH*dayRate+totals.nightH*nightRate;
  const monthName=new Date(month+"-02").toLocaleDateString("en-GB",{month:"long",year:"numeric"});
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1.25rem",flexWrap:"wrap"}}>
        <select className="sch-input" value={month} onChange={e=>setMonth(e.target.value)}>
          {Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-i);const val=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;return <option key={val} value={val}>{d.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</option>;})}
        </select>
        {!fixedSitter&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{data.sitters.map(name=>{const c=sitterColor(name,data.sitters);const active=selected===name;return(<button key={name} className={"sch-sitter-btn"+(active?" active":"")} style={active?{borderColor:c,background:c+"18"}:{}} onClick={()=>setSelected(name)}><div className="sch-avatar" style={{background:c,width:22,height:22,fontSize:11}}>{initials(name)}</div>{name}</button>);})}</div>}
      </div>
      {!readOnly&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"1.25rem"}}>{[["day","Day (before 19:00)","#FAC775"],["night","Night (19:00+)","#7F77DD"]].map(([f,l,a])=>(
        <div key={f} className="sch-stat" style={{borderLeft:`3px solid ${a}`}}>
          <p className="sch-stat-label">{l}</p>
          <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:4}}>
            <span style={{fontSize:15,color:"#888"}}>€</span>
            <input type="number" min="0" step="0.5" className="sch-input" style={{width:"100%",fontSize:20,fontWeight:500,padding:"2px 4px",border:"none",borderBottom:"1.5px solid #ccc",borderRadius:0,background:"transparent"}} value={rates[f]||""} placeholder="0" onChange={e=>save({...data,rates:{...(data.rates||{}),[f]:e.target.value}})}/>
            <span style={{fontSize:12,color:"#888"}}>/h</span>
          </div>
        </div>
      ))}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:"1.5rem"}}>
        <div className="sch-stat"><p className="sch-stat-label" style={{color:"#BA7517"}}>Day hours</p><p className="sch-stat-val">{fmtH(totals.dayH)}h</p>{dayRate>0&&<p style={{fontSize:12,color:"#888",margin:"2px 0 0"}}>€{(totals.dayH*dayRate).toFixed(2)}</p>}</div>
        <div className="sch-stat"><p className="sch-stat-label" style={{color:"#534AB7"}}>Night hours</p><p className="sch-stat-val">{fmtH(totals.nightH)}h</p>{nightRate>0&&<p style={{fontSize:12,color:"#888",margin:"2px 0 0"}}>€{(totals.nightH*nightRate).toFixed(2)}</p>}</div>
        <div className="sch-stat" style={{background:totalDue>0?"#eaf3de":"#f1efe8"}}>
          <p className="sch-stat-label" style={{color:totalDue>0?"#27500a":"#888"}}>Total due</p>
          <p className="sch-stat-val" style={{color:totalDue>0?"#27500a":"#1a1a1a"}}>€{totalDue.toFixed(2)}</p>
        </div>
      </div>
      {monthSlots.length===0?<p className="sch-empty">{sitter} has no slots in {monthName}.</p>:monthSlots.map(sl=>{
        const{dayH,nightH}=calcSplit(sl);const slotTotal=dayH*dayRate+nightH*nightRate;
        const overnight=()=>{const[eh]=sl.end.split(":").map(Number);const[sh]=sl.start.split(":").map(Number);return eh<sh;};
        return(
          <div className="sch-slot" key={sl.id} style={{flexDirection:"column",alignItems:"stretch",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="sch-slot-dot" style={{background:color}}/>
              <div style={{flex:1}}>
                <p className="sch-slot-date" style={{margin:0}}>{fmtDate(sl.date)}{overnight()&&<span style={{fontSize:11,marginLeft:6,padding:"1px 6px",borderRadius:99,background:"#f1efe8",color:"#888"}}>overnight</span>}</p>
                <p className="sch-slot-time">{sl.start} – {sl.end}</p>
              </div>
              <p style={{margin:0,fontSize:14,fontWeight:500}}>{dayRate>0||nightRate>0?`€${slotTotal.toFixed(2)}`:`${fmtH(dayH+nightH)}h`}</p>
            </div>
            <div style={{display:"flex",gap:8,paddingLeft:22}}>
              {dayH>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#FAEEDA",color:"#854F0B"}}>☀ {fmtH(dayH)}h{dayRate>0?` · €${(dayH*dayRate).toFixed(2)}`:""}</span>}
              {nightH>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#EEEDFE",color:"#3C3489"}}>☾ {fmtH(nightH)}h{nightRate>0?` · €${(nightH*nightRate).toFixed(2)}`:""}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UsersTab({ users, saveUsers, sitters }) {
  const [nu,setNu]=useState({email:"",password:"",role:"sitter",sitterName:""});
  const [err,setErr]=useState("");
  function add() {
    if(!nu.email||!nu.password){setErr("Email and password required.");return;}
    if(users.find(u=>u.email.toLowerCase()===nu.email.toLowerCase())){setErr("Email already exists.");return;}
    if(nu.role==="sitter"&&!nu.sitterName){setErr("Please link to a sitter.");return;}
    saveUsers([...users,{...nu,id:uid()}]);
    setNu({email:"",password:"",role:"sitter",sitterName:""});setErr("");
  }
  return (
    <div>
      {users.map(u=>(
        <div className="user-row" key={u.id}>
          <div className="sch-avatar" style={{background:u.role==="admin"?"#7F77DD":"#1D9E75",width:32,height:32,fontSize:13}}>{initials(u.email)}</div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</p>
            <p style={{margin:0,fontSize:12,color:"#888"}}>{u.role==="sitter"&&u.sitterName?`Linked to ${u.sitterName}`:u.role==="admin"?"Admin":""}</p>
          </div>
          <span className={`role-badge ${u.role==="admin"?"role-admin":"role-sitter"}`}>{u.role}</span>
          <button className="sch-icon-btn" style={{fontSize:12}} onClick={()=>saveUsers(users.map(x=>x.id===u.id?{...x,role:x.role==="admin"?"sitter":"admin"}:x))}>⇄</button>
          <button className="sch-icon-btn" onClick={()=>saveUsers(users.filter(x=>x.id!==u.id))}>✕</button>
        </div>
      ))}
      <div className="sch-add-row" style={{flexDirection:"column",alignItems:"stretch",gap:10}}>
        <p style={{margin:0,fontSize:12,fontWeight:500,color:"#888"}}>Add new user</p>
        {err&&<p style={{margin:0,fontSize:12,color:"#a32d2d",padding:"6px 10px",background:"#fcebeb",borderRadius:8}}>{err}</p>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input className="sch-input" style={{flex:2,minWidth:140}} placeholder="Email" value={nu.email} onChange={e=>{setNu(p=>({...p,email:e.target.value}));setErr("");}}/>
          <input className="sch-input" type="password" style={{flex:1,minWidth:100}} placeholder="Password" value={nu.password} onChange={e=>{setNu(p=>({...p,password:e.target.value}));setErr("");}}/>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select className="sch-input" style={{flex:1}} value={nu.role} onChange={e=>setNu(p=>({...p,role:e.target.value,sitterName:""}))}>
            <option value="sitter">Sitter</option>
            <option value="admin">Admin</option>
          </select>
          {nu.role==="sitter"&&<select className="sch-input" style={{flex:1}} value={nu.sitterName} onChange={e=>setNu(p=>({...p,sitterName:e.target.value}))}>
            <option value="">Link to sitter…</option>
            {sitters.map(s=><option key={s} value={s}>{s}</option>)}
          </select>}
          <button className="sch-btn-primary" onClick={add}>Add user</button>
        </div>
      </div>
    </div>
  );
}
