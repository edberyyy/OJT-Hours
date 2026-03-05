import { useState, useEffect, useRef, useCallback } from "react";

const GOAL = 500;
const KEY = "ojt_v2";
const THEME_KEY = "ojt_theme";

const todayStr = () => new Date().toISOString().slice(0, 10);

const parseLocal = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const fmtDate = (d) =>
  parseLocal(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const loadEntries = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};
const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
};

// ── Custom Calendar Component ─────────────────────────────────────
function Calendar({ value, onChange, maxDate, dark }) {
  const init = value ? parseLocal(value) : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const selected = value ? parseLocal(value) : null;
  const max = maxDate ? parseLocal(maxDate) : null;

  const firstDay = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prev = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const next = () => {
    const nd = new Date(view.y, view.m + 1, 1);
    if (!max || nd <= max) setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });
  };

  const pick = (d) => {
    if (!d) return;
    const ds = toStr(new Date(view.y, view.m, d));
    if (max && parseLocal(ds) > max) return;
    onChange(ds);
  };

  const isSelected = (d) => selected &&
    selected.getFullYear() === view.y &&
    selected.getMonth() === view.m &&
    selected.getDate() === d;

  const isDisabled = (d) => max && new Date(view.y, view.m, d) > max;

  const isToday = (d) => {
    const t = new Date();
    return t.getFullYear() === view.y && t.getMonth() === view.m && t.getDate() === d;
  };

  const c = {
    bg: dark ? "#161616" : "#ffffff",
    border: dark ? "#272727" : "#e4e1db",
    text: dark ? "#d8d5cf" : "#111111",
    muted: dark ? "#4a4a4a" : "#b8b4ac",
    selBg: dark ? "#d8d5cf" : "#111111",
    selTx: dark ? "#111111" : "#f7f6f3",
    disabledTx: dark ? "#2c2c2c" : "#e0ddd7",
    hoverBg: dark ? "#1e1e1e" : "#f4f2ee",
    todayLine: dark ? "#3a3a3a" : "#d0cdc7",
    headerBg: dark ? "#111111" : "#f9f8f5",
  };

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, width: "100%", userSelect: "none" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: c.headerBg, borderBottom: `1px solid ${c.border}` }}>
        <button onClick={prev} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", fontFamily: "inherit", transition: "color 0.12s" }}
          onMouseEnter={e => e.target.style.color = c.text} onMouseLeave={e => e.target.style.color = c.muted}>‹</button>
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: c.text }}>
          {MONTHS[view.m].slice(0,3)} {view.y}
        </span>
        <button onClick={next} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px", fontFamily: "inherit", transition: "color 0.12s" }}
          onMouseEnter={e => e.target.style.color = c.text} onMouseLeave={e => e.target.style.color = c.muted}>›</button>
      </div>

      {/* Day labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "8px 10px 4px" }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: "center", fontFamily: "'Geist Mono', monospace", fontSize: "9px", letterSpacing: "0.06em", color: c.muted, paddingBottom: 3 }}>{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 10px 10px", gap: 1 }}>
        {cells.map((d, i) => {
          const sel = d && isSelected(d);
          const dis = d && isDisabled(d);
          const tod = d && isToday(d);
          return (
            <div key={i}
              onClick={() => !dis && pick(d)}
              style={{
                textAlign: "center", padding: "6px 0",
                fontFamily: "'Geist Mono', monospace", fontSize: "11px",
                cursor: d && !dis ? "pointer" : "default",
                color: !d ? "transparent" : dis ? c.disabledTx : sel ? c.selTx : c.text,
                background: sel ? c.selBg : "transparent",
                position: "relative",
                transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={e => { if (d && !dis && !sel) e.currentTarget.style.background = c.hoverBg; }}
              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              {d || ""}
              {tod && !sel && (
                <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: c.todayLine, display: "block" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Popover Calendar Field ────────────────────────────────────────
function CalendarField({ value, onChange, maxDate, dark, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const c = {
    border: dark ? "#2a2a2a" : "#d0cfc9",
    text: dark ? "#d8d5cf" : "#111111",
    muted: dark ? "#4a4a4a" : "#b0ada6",
    label: dark ? "#555" : "#b0ada6",
    shadow: dark ? "0 8px 40px rgba(0,0,0,0.7)" : "0 8px 40px rgba(0,0,0,0.1)",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && (
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.label, marginBottom: 6, fontFamily: "'Geist Mono', monospace" }}>{label}</div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "transparent", border: "none",
          borderBottom: `1px solid ${open ? c.text : c.border}`,
          borderRadius: 0, width: "100%", textAlign: "left",
          padding: "6px 0", fontFamily: "'Geist Mono', monospace",
          fontSize: 13, color: value ? c.text : c.muted,
          cursor: "pointer", transition: "border-color 0.15s",
        }}
      >
        {value ? fmtDate(value) : "Select date"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, width: 254, boxShadow: c.shadow }}>
          <Calendar value={value} onChange={v => { onChange(v); setOpen(false); }} maxDate={maxDate} dark={dark} />
        </div>
      )}
    </div>
  );
}

// ── Quick chip ────────────────────────────────────────────────────
function Chip({ label, active, onClick, dark }) {
  const c = {
    border: dark ? "#2a2a2a" : "#e0ddd7",
    muted: dark ? "#4a4a4a" : "#9c9890",
    text: dark ? "#d8d5cf" : "#111",
    selBg: dark ? "#d8d5cf" : "#111",
    selTx: dark ? "#111" : "#f7f6f3",
    hoverBorder: dark ? "#555" : "#111",
  };
  return (
    <button onClick={onClick} style={{
      background: active ? c.selBg : "none",
      border: `1px solid ${active ? c.selBg : c.border}`,
      color: active ? c.selTx : c.muted,
      padding: "4px 10px", fontSize: 10,
      letterSpacing: "0.06em", fontFamily: "'Geist Mono', monospace",
      cursor: "pointer", transition: "all 0.12s",
    }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = c.hoverBorder; e.currentTarget.style.color = c.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.muted; } }}
    >{label}</button>
  );
}

// ── App ───────────────────────────────────────────────────────────
export default function OjtMinimal() {
  const [entries, setEntries] = useState(loadEntries);
  const [theme, setTheme] = useState(loadTheme);
  const dark = theme === "dark";

  const [date, setDate] = useState(todayStr());
  const [hrs, setHrs] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState(false);
  const [removing, setRemoving] = useState(null);
  const hrsRef = useRef(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bHrs, setBHrs] = useState("8");
  const [bSkip, setBSkip] = useState(true);
  const [bErr, setBErr] = useState("");
  const [bFlash, setBFlash] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
  }, [entries]);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.body.style.background = dark ? "#0e0e0e" : "#f7f6f3";
    document.body.style.color = dark ? "#d8d5cf" : "#111111";
  }, [theme, dark]);

  const total = entries.reduce((s, e) => s + e.h, 0);
  const rem = Math.max(0, GOAL - total);
  const pct = Math.min(100, (total / GOAL) * 100);
  const done = total >= GOAL;
  const n = (v) => v % 1 === 0 ? v : v.toFixed(1);

  const add = () => {
    const h = parseFloat(hrs);
    if (!date) return setErr("Date required.");
    if (!hrs || isNaN(h) || h <= 0 || h > 24) return setErr("Enter hours between 0.5 and 24.");
    setErr("");
    setEntries(p => [...p, { id: crypto.randomUUID(), date, h }]);
    setHrs(""); setDate(todayStr());
    setFlash(true); setTimeout(() => setFlash(false), 700);
    hrsRef.current?.focus();
  };

  const remove = (id) => {
    setRemoving(id);
    setTimeout(() => { setEntries(p => p.filter(e => e.id !== id)); setRemoving(null); }, 260);
  };

  const getBulkDates = useCallback(() => {
    if (!bStart || !bEnd) return [];
    const start = parseLocal(bStart), end = parseLocal(bEnd);
    if (start > end) return [];
    const dates = [], cur = new Date(start);
    while (cur <= end) {
      if (!bSkip || (cur.getDay() !== 0 && cur.getDay() !== 6))
        dates.push(toStr(new Date(cur)));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [bStart, bEnd, bSkip]);

  const bulkDates = getBulkDates();
  const bulkH = parseFloat(bHrs) || 0;
  const bulkTotal = bulkDates.length * bulkH;

  const commitBulk = () => {
    if (!bStart || !bEnd) return setBErr("Select start and end dates.");
    if (parseLocal(bStart) > parseLocal(bEnd)) return setBErr("Start must be before end.");
    if (!bHrs || bulkH <= 0 || bulkH > 24) return setBErr("Enter valid hours per day.");
    if (bulkDates.length === 0) return setBErr("No valid days in range.");
    setBErr("");
    setEntries(p => [...p, ...bulkDates.map(d => ({ id: crypto.randomUUID(), date: d, h: bulkH }))]);
    setBStart(""); setBEnd(""); setBHrs("8");
    setBFlash(true); setTimeout(() => { setBFlash(false); setBulkOpen(false); }, 900);
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // Color tokens
  const c = {
    text: dark ? "#d8d5cf" : "#111111",
    muted: dark ? "#4a4a4a" : "#9c9890",
    sub: dark ? "#555" : "#b0ada6",
    faint: dark ? "#1e1e1e" : "#e0ddd7",
    inputBorder: dark ? "#2a2a2a" : "#d0cfc9",
    btnBg: dark ? "#d8d5cf" : "#111111",
    btnTx: dark ? "#111111" : "#f7f6f3",
    panelBg: dark ? "#111111" : "#ffffff",
    panelBorder: dark ? "#1e1e1e" : "#ece9e3",
    previewBg: dark ? "#0e0e0e" : "#f7f6f3",
  };

  const inputStyle = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${c.inputBorder}`,
    borderRadius: 0, outline: "none",
    fontFamily: "'Geist Mono', monospace",
    fontSize: 13, color: c.text, padding: "6px 0", width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Geist Mono', monospace; font-size: 13px; -webkit-font-smoothing: antialiased; transition: background 0.25s, color 0.25s; }
        button { cursor: pointer; font-family: 'Geist Mono', monospace; }
        input[type="number"] { -webkit-appearance: none; appearance: none; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input::placeholder { color: ${c.sub}; }
        .log-item { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid ${c.faint}; transition: opacity 0.26s; }
        .log-item.out { opacity: 0; }
        .remove-btn { background: none; border: none; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${c.sub}; margin-left: 20px; padding: 0; transition: color 0.15s; flex-shrink: 0; }
        .remove-btn:hover { color: ${c.text}; }
        @media (max-width: 500px) { .wrap { padding: 48px 20px 80px !important; } .hero-n { font-size: 80px !important; } .two-col { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="wrap" style={{ maxWidth: 560, margin: "0 auto", padding: "72px 32px 120px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 60 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.muted }}>OJT Progress</span>
          <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")} style={{
            background: "none", border: `1px solid ${c.faint}`, color: c.muted,
            padding: "5px 14px", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = c.text; e.currentTarget.style.color = c.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.faint; e.currentTarget.style.color = c.muted; }}
          >{dark ? "Light" : "Dark"}</button>
        </div>

        {/* Hero number */}
        <div style={{ marginBottom: 60 }}>
          <div className="hero-n" style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(80px,18vw,120px)", fontWeight: 400, lineHeight: 0.88, letterSpacing: "-0.02em", color: c.text, fontVariantNumeric: "tabular-nums" }}>
            {n(total)}
          </div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 300, color: c.muted, marginTop: 12 }}>
            of {GOAL} hours required
          </div>
        </div>

        {/* Progress bar + stats */}
        <div style={{ marginBottom: 60 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.08em", color: c.muted }}>{pct.toFixed(1)}%</span>
            <span style={{ fontSize: 11, letterSpacing: "0.05em", color: c.muted }}>{done ? "Complete" : `${n(rem)} remaining`}</span>
          </div>
          <div style={{ height: 1, background: c.faint, position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: 1, background: c.text, width: `${pct}%`, transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)" }} />
          </div>
          <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${c.faint}`, marginTop: 20, paddingTop: 20 }}>
            <div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1, color: c.text, fontVariantNumeric: "tabular-nums" }}>{entries.length}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginTop: 4 }}>Sessions</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1, color: c.text, fontVariantNumeric: "tabular-nums" }}>
                {entries.length > 0 ? n(total / entries.length) : "—"}
              </div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginTop: 4 }}>Avg / session</div>
            </div>
          </div>
          {done && <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.muted, borderTop: `1px solid ${c.faint}`, paddingTop: 16, marginTop: 20 }}>Requirement fulfilled</div>}
        </div>

        <div style={{ height: 1, background: c.faint, marginBottom: 40 }} />

        {/* Log Entry */}
        <div style={{ marginBottom: 60 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.muted }}>Log Entry</div>
            <button onClick={() => { setBulkOpen(o => !o); setBErr(""); }} style={{
              background: "none", border: "none", padding: 0, fontSize: 11,
              letterSpacing: "0.08em", textTransform: "uppercase", color: c.sub,
              textDecoration: "underline", textUnderlineOffset: 3, transition: "color 0.15s",
            }}
              onMouseEnter={e => e.target.style.color = c.text}
              onMouseLeave={e => e.target.style.color = c.sub}
            >
              {bulkOpen ? "Single entry" : "Bulk add"}
            </button>
          </div>

          {!bulkOpen ? (
            /* Single entry */
            <>
              <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
                <CalendarField value={date} onChange={setDate} maxDate={todayStr()} dark={dark} label="Date" />
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono', monospace" }}>Hours</div>
                  <input ref={hrsRef} type="number" placeholder="0.0" value={hrs} min="0.5" max="24" step="0.5"
                    style={inputStyle}
                    onChange={e => setHrs(e.target.value)}
                    onFocus={e => e.target.style.borderColor = c.text}
                    onBlur={e => e.target.style.borderColor = c.inputBorder}
                    onKeyDown={e => e.key === "Enter" && add()} />
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {[4, 6, 7, 8, 9].map(h => (
                      <Chip key={h} label={`${h}h`} active={hrs === String(h)} onClick={() => setHrs(String(h))} dark={dark} />
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={add} style={{
                background: flash ? (dark ? "#888" : "#555") : c.btnBg,
                color: c.btnTx, border: "none", padding: "10px 28px",
                fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "opacity 0.15s, background 0.2s",
              }}
                onMouseEnter={e => !flash && (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >{flash ? "Added" : "Add"}</button>
              {err && <div style={{ fontSize: 11, color: c.muted, marginTop: 12, letterSpacing: "0.04em" }}>{err}</div>}
            </>
          ) : (
            /* Bulk entry panel */
            <div style={{ background: c.panelBg, border: `1px solid ${c.panelBorder}`, padding: "20px 18px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.sub, marginBottom: 18 }}>
                Add a range of past dates at once
              </div>

              {/* Date range */}
              <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <CalendarField value={bStart} onChange={v => { setBStart(v); if (bEnd && parseLocal(v) > parseLocal(bEnd)) setBEnd(""); }} maxDate={todayStr()} dark={dark} label="Start date" />
                <CalendarField value={bEnd} onChange={v => { if (!bStart || parseLocal(v) >= parseLocal(bStart)) { setBEnd(v); setBErr(""); } else setBErr("End must be after start."); }} maxDate={todayStr()} dark={dark} label="End date" />
              </div>

              {/* Hours per day */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono', monospace" }}>Hours per day</div>
                <input type="number" placeholder="8" value={bHrs} min="0.5" max="24" step="0.5"
                  style={inputStyle}
                  onChange={e => setBHrs(e.target.value)}
                  onFocus={e => e.target.style.borderColor = c.text}
                  onBlur={e => e.target.style.borderColor = c.inputBorder} />
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {[4, 6, 7, 8, 9, 10].map(h => (
                    <Chip key={h} label={`${h}h`} active={bHrs === String(h)} onClick={() => setBHrs(String(h))} dark={dark} />
                  ))}
                </div>
              </div>

              {/* Skip weekends toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: c.sub, letterSpacing: "0.06em", userSelect: "none", marginBottom: 20 }}>
                <input type="checkbox" checked={bSkip} onChange={e => setBSkip(e.target.checked)} style={{ accentColor: c.text, width: 13, height: 13, cursor: "pointer" }} />
                Skip weekends
              </label>

              {/* Preview */}
              {bStart && bEnd && bulkH > 0 && bulkDates.length > 0 && (
                <div style={{ background: c.previewBg, padding: "12px 14px", marginBottom: 14, borderTop: `1px solid ${c.faint}` }}>
                  {[["Days", bulkDates.length], ["Hours to add", n(bulkTotal)], ["New total", n(Math.min(GOAL, total + bulkTotal))]].map(([lbl, val]) => (
                    <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub }}>{lbl}</span>
                      <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: c.text, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={commitBulk} style={{
                background: bFlash ? (dark ? "#888" : "#555") : c.btnBg,
                color: c.btnTx, border: "none", padding: "10px 0",
                width: "100%", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "opacity 0.15s, background 0.2s",
              }}
                onMouseEnter={e => !bFlash && (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                {bFlash
                  ? `Added ${bulkDates.length} entries`
                  : `Add ${bulkDates.length > 0 ? bulkDates.length + " entr" + (bulkDates.length === 1 ? "y" : "ies") : "entries"}`}
              </button>
              {bErr && <div style={{ fontSize: 11, color: c.muted, marginTop: 10, letterSpacing: "0.04em" }}>{bErr}</div>}
            </div>
          )}
        </div>

        <div style={{ height: 1, background: c.faint, marginBottom: 40 }} />

        {/* History */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.muted }}>History</div>
            {sorted.length > 0 && (
              <span style={{ fontSize: 10, color: c.sub, letterSpacing: "0.06em" }}>
                {sorted.length} {sorted.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
          {sorted.length === 0 ? (
            <div style={{ fontSize: 12, color: dark ? "#2e2e2e" : "#c8c5be", letterSpacing: "0.04em", padding: "20px 0" }}>No entries recorded.</div>
          ) : sorted.map(e => (
            <div key={e.id} className={`log-item${removing === e.id ? " out" : ""}`}>
              <span style={{ fontSize: 13, color: c.text, flex: 1 }}>{fmtDate(e.date)}</span>
              <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: c.text, marginLeft: 16, fontVariantNumeric: "tabular-nums" }}>
                {n(e.h)}<span style={{ fontSize: 10, color: c.sub, letterSpacing: "0.06em", marginLeft: 3 }}>hr</span>
              </span>
              <button className="remove-btn" onClick={() => remove(e.id)}>Remove</button>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}
