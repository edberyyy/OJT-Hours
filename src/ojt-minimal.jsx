import { useState, useEffect, useRef, useCallback } from "react";

const GOAL = 500;
const KEY = "ojt_v3";
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

const fmtWeekday = (d) =>
  parseLocal(d).toLocaleDateString("en-US", { weekday: "long" });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ── Time helpers ─────────────────────────────────────────────────
// time stored as { h: 1-12, m: 0-59, period: "AM"|"PM" }
const defaultTimeIn  = () => ({ h: 8,  m: 0, period: "AM" });
const defaultTimeOut = () => ({ h: 5,  m: 0, period: "PM" });

const timeToMinutes = (t) => {
  let h = t.h % 12;
  if (t.period === "PM") h += 12;
  return h * 60 + t.m;
};

const minutesToHours = (mins) => {
  if (mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
};

const fmtTime = (t) => {
  if (!t) return "";
  const mm = String(t.m).padStart(2, "0");
  return `${t.h}:${mm} ${t.period}`;
};

const calcHoursFromTimes = (tin, tout) => {
  const start = timeToMinutes(tin);
  let end = timeToMinutes(tout);

  // If end is earlier (or equal), assume the session crosses midnight.
  if (end <= start) end += 24 * 60;

  const totalMinutes = end - start;
  if (totalMinutes <= 0) return 0;

  // Base shift + overtime rules:
  // - Base shift window: 08:00–17:00 (but when OT happens, this window is credited as max 8 hours)
  // - Overtime window: 17:00–20:00
  //   - If the full OT window is worked (5pm–8pm), OT is credited as a flat 8 hours
  //   - Otherwise, OT minutes are credited at 2x
  const BASE_START = 8 * 60;
  const BASE_END = 17 * 60;
  const BASE_CREDIT = 8 * 60;
  const OT_START = 17 * 60;
  const OT_END = 20 * 60;
  const OT_WINDOW = OT_END - OT_START;

  const overlap = (aStart, aEnd, bStart, bEnd) => {
    const s = Math.max(aStart, bStart);
    const e = Math.min(aEnd, bEnd);
    return Math.max(0, e - s);
  };

  let baseWindowMinutes = 0;
  let overtimeMinutes = 0;
  const lastDay = Math.floor((end - 1) / (24 * 60));
  for (let day = 0; day <= lastDay; day++) {
    const offset = day * 24 * 60;
    baseWindowMinutes += overlap(start, end, BASE_START + offset, BASE_END + offset);
    overtimeMinutes += overlap(start, end, OT_START + offset, OT_END + offset);
  }

  const LUNCH_DEDUCT = 60;

  let creditedMinutes = 0;

  // If there's no OT (out before 5pm), keep the original behavior (no 2x, no base-shift adjustment).
  if (overtimeMinutes <= 0) {
    creditedMinutes = totalMinutes;
  } else {
    // OT exists: credit the base shift window as up to 8 hours,
    // and credit OT window minutes at 2x (or flat 8 hours if the full 5–8pm window is worked).
    const baseCreditedMinutes = Math.min(BASE_CREDIT, baseWindowMinutes);
    const otherMinutes = Math.max(0, totalMinutes - baseWindowMinutes - overtimeMinutes);

    let overtimeCreditedMinutes = 0;
    for (let day = 0; day <= lastDay; day++) {
      const offset = day * 24 * 60;
      const ot = overlap(start, end, OT_START + offset, OT_END + offset);
      if (ot <= 0) continue;
      overtimeCreditedMinutes += ot >= OT_WINDOW ? BASE_CREDIT : ot * 2;
    }

    creditedMinutes = baseCreditedMinutes + otherMinutes + overtimeCreditedMinutes;
  }

  // Lunch break: always deduct 1 hour from credited time.
  creditedMinutes = Math.max(0, creditedMinutes - LUNCH_DEDUCT);
  return minutesToHours(creditedMinutes);
};

// ── Storage ──────────────────────────────────────────────────────
const loadEntries = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};
const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
};

// ── Calendar ─────────────────────────────────────────────────────
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

  const isSel = (d) => selected && selected.getFullYear() === view.y && selected.getMonth() === view.m && selected.getDate() === d;
  const isDis = (d) => max && new Date(view.y, view.m, d) > max;
  const isTod = (d) => { const t = new Date(); return t.getFullYear() === view.y && t.getMonth() === view.m && t.getDate() === d; };

  const c = {
    bg: dark ? "#161616" : "#fff",
    border: dark ? "#272727" : "#e4e1db",
    text: dark ? "#d8d5cf" : "#111",
    muted: dark ? "#4a4a4a" : "#b8b4ac",
    selBg: dark ? "#d8d5cf" : "#111",
    selTx: dark ? "#111" : "#f7f6f3",
    disTx: dark ? "#2c2c2c" : "#e0ddd7",
    hov: dark ? "#1e1e1e" : "#f4f2ee",
    dot: dark ? "#3a3a3a" : "#d0cdc7",
    hdrBg: dark ? "#111" : "#f9f8f5",
  };

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: c.hdrBg, borderBottom: `1px solid ${c.border}` }}>
        <button onClick={prev} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, fontFamily: "inherit" }}
          onMouseEnter={e => e.target.style.color = c.text} onMouseLeave={e => e.target.style.color = c.muted}>‹</button>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.text }}>
          {MONTHS[view.m].slice(0, 3)} {view.y}
        </span>
        <button onClick={next} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, fontFamily: "inherit" }}
          onMouseEnter={e => e.target.style.color = c.text} onMouseLeave={e => e.target.style.color = c.muted}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "8px 10px 4px" }}>
        {DAYS_SHORT.map(d => <div key={d} style={{ textAlign: "center", fontFamily: "'Geist Mono',monospace", fontSize: 9, letterSpacing: "0.06em", color: c.muted, paddingBottom: 3 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px 10px", gap: 1 }}>
        {cells.map((d, i) => {
          const sel = d && isSel(d), dis = d && isDis(d), tod = d && isTod(d);
          return (
            <div key={i} onClick={() => !dis && pick(d)} style={{
              textAlign: "center", padding: "6px 0",
              fontFamily: "'Geist Mono',monospace", fontSize: 11,
              cursor: d && !dis ? "pointer" : "default",
              color: !d ? "transparent" : dis ? c.disTx : sel ? c.selTx : c.text,
              background: sel ? c.selBg : "transparent",
              position: "relative", transition: "background 0.1s",
            }}
              onMouseEnter={e => { if (d && !dis && !sel) e.currentTarget.style.background = c.hov; }}
              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              {d || ""}
              {tod && !sel && <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: c.dot, display: "block" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarField({ value, onChange, maxDate, dark, label, compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const c = { border: dark ? "#2a2a2a" : "#d0cfc9", text: dark ? "#d8d5cf" : "#111", muted: dark ? "#4a4a4a" : "#b0ada6", shadow: dark ? "0 8px 40px rgba(0,0,0,0.7)" : "0 8px 40px rgba(0,0,0,0.1)" };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && !compact && <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "#555" : "#b0ada6", marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>{label}</div>}
      <button onClick={() => setOpen(o => !o)} style={{
        background: "transparent", border: "none", borderBottom: `1px solid ${open ? c.text : c.border}`,
        borderRadius: 0, width: "100%", textAlign: "left", padding: compact ? "3px 0" : "6px 0",
        fontFamily: "'Geist Mono',monospace", fontSize: compact ? 12 : 13, color: value ? c.text : c.muted,
        cursor: "pointer", transition: "border-color 0.15s",
      }}>{value ? fmtDate(value) : "Select date"}</button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300, width: 254, boxShadow: c.shadow }}>
          <Calendar value={value} onChange={v => { onChange(v); setOpen(false); }} maxDate={maxDate} dark={dark} />
        </div>
      )}
    </div>
  );
}

// ── Time Picker ──────────────────────────────────────────────────
function TimePicker({ value, onChange, dark, label }) {
  const c = {
    text: dark ? "#d8d5cf" : "#111",
    muted: dark ? "#4a4a4a" : "#b0ada6",
    border: dark ? "#2a2a2a" : "#d0cfc9",
    selBg: dark ? "#d8d5cf" : "#111",
    selTx: dark ? "#111" : "#f7f6f3",
    bg: dark ? "#161616" : "#fff",
    hdrBg: dark ? "#111" : "#f9f8f5",
    hov: dark ? "#1e1e1e" : "#f4f2ee",
    labelColor: dark ? "#555" : "#b0ada6",
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 15, 30, 45];

  const setH = (h) => onChange({ ...value, h });
  const setM = (m) => onChange({ ...value, m });
  const setP = (period) => onChange({ ...value, period });

  return (
    <div>
      {label && <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.labelColor, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>{label}</div>}
      <div style={{ border: `1px solid ${c.border}`, background: c.bg }}>
        {/* Header display */}
        <div style={{ background: c.hdrBg, borderBottom: `1px solid ${c.border}`, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: c.text, letterSpacing: "0.06em" }}>{fmtTime(value)}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["AM", "PM"].map(p => (
              <button key={p} onClick={() => setP(p)} style={{
                background: value.period === p ? c.selBg : "transparent",
                color: value.period === p ? c.selTx : c.muted,
                border: `1px solid ${value.period === p ? c.selBg : c.border}`,
                padding: "2px 8px", fontSize: 9, letterSpacing: "0.08em",
                fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "all 0.12s",
              }}>{p}</button>
            ))}
          </div>
        </div>
        {/* Hour grid */}
        <div style={{ padding: "8px 10px 4px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 5, fontFamily: "'Geist Mono',monospace" }}>Hour</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 2 }}>
            {hours.map(h => (
              <button key={h} onClick={() => setH(h)} style={{
                background: value.h === h ? c.selBg : "transparent",
                color: value.h === h ? c.selTx : c.text,
                border: `1px solid ${value.h === h ? c.selBg : c.border}`,
                padding: "4px 0", fontSize: 11, fontFamily: "'Geist Mono',monospace",
                cursor: "pointer", textAlign: "center", transition: "all 0.1s",
              }}
                onMouseEnter={e => { if (value.h !== h) e.currentTarget.style.background = c.hov; }}
                onMouseLeave={e => { if (value.h !== h) e.currentTarget.style.background = "transparent"; }}
              >{h}</button>
            ))}
          </div>
        </div>
        {/* Minute row */}
        <div style={{ padding: "6px 10px 10px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 5, fontFamily: "'Geist Mono',monospace" }}>Minute</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2 }}>
            {minutes.map(m => (
              <button key={m} onClick={() => setM(m)} style={{
                background: value.m === m ? c.selBg : "transparent",
                color: value.m === m ? c.selTx : c.text,
                border: `1px solid ${value.m === m ? c.selBg : c.border}`,
                padding: "4px 0", fontSize: 11, fontFamily: "'Geist Mono',monospace",
                cursor: "pointer", textAlign: "center", transition: "all 0.1s",
              }}
                onMouseEnter={e => { if (value.m !== m) e.currentTarget.style.background = c.hov; }}
                onMouseLeave={e => { if (value.m !== m) e.currentTarget.style.background = "transparent"; }}
              >:{String(m).padStart(2, "0")}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────────
function Chip({ label, active, onClick, dark }) {
  const c = { border: dark ? "#2a2a2a" : "#e0ddd7", muted: dark ? "#4a4a4a" : "#9c9890", text: dark ? "#d8d5cf" : "#111", selBg: dark ? "#d8d5cf" : "#111", selTx: dark ? "#111" : "#f7f6f3", hov: dark ? "#555" : "#111" };
  return (
    <button onClick={onClick} style={{
      background: active ? c.selBg : "none", border: `1px solid ${active ? c.selBg : c.border}`,
      color: active ? c.selTx : c.muted, padding: "4px 10px", fontSize: 10,
      letterSpacing: "0.06em", fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "all 0.12s",
    }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = c.hov; e.currentTarget.style.color = c.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.muted; } }}
    >{label}</button>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────
function DeleteModal({ entry, onConfirm, onCancel, dark }) {
  const c = {
    overlay: "rgba(0,0,0,0.55)",
    bg: dark ? "#141414" : "#fff",
    border: dark ? "#272727" : "#e4e1db",
    text: dark ? "#d8d5cf" : "#111",
    sub: dark ? "#555" : "#b0ada6",
    faint: dark ? "#1e1e1e" : "#e0ddd7",
    btnBg: dark ? "#d8d5cf" : "#111",
    btnTx: dark ? "#111" : "#f7f6f3",
    dangerBg: dark ? "#3a1515" : "#fff0f0",
    dangerBorder: dark ? "#5c2020" : "#f5c6c6",
    dangerTx: dark ? "#e07070" : "#c0392b",
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onCancel}>
      <div style={{ background: c.bg, border: `1px solid ${c.border}`, padding: "28px 24px", maxWidth: 340, width: "100%", boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.sub, marginBottom: 16, fontFamily: "'Geist Mono',monospace" }}>Confirm Delete</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: c.text, lineHeight: 1.2, marginBottom: 8 }}>
          Remove this entry?
        </div>
        <div style={{ fontSize: 12, color: c.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>
          {fmtDate(entry.date)}
        </div>
        <div style={{ fontSize: 12, color: c.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>
          {entry.timeIn && entry.timeOut
            ? `${fmtTime(entry.timeIn)} — ${fmtTime(entry.timeOut)}`
            : null}
        </div>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: c.sub, marginBottom: 24 }}>
          {(() => { const h = entry.h; return `${h % 1 === 0 ? h : h.toFixed(2)} hr${h === 1 ? "" : "s"} will be deducted`; })()}
        </div>
        <div style={{ height: 1, background: c.faint, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={{
            flex: 1, background: c.dangerBg, color: c.dangerTx,
            border: `1px solid ${c.dangerBorder}`, padding: "9px 0",
            fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >Delete</button>
          <button onClick={onCancel} style={{
            flex: 1, background: c.btnBg, color: c.btnTx,
            border: "none", padding: "9px 0",
            fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >Keep</button>
        </div>
      </div>
    </div>
  );
}

function DuplicateDateModal({ title, message, onClose, dark }) {
  const c = {
    overlay: "rgba(0,0,0,0.55)",
    bg: dark ? "#141414" : "#fff",
    border: dark ? "#272727" : "#e4e1db",
    text: dark ? "#d8d5cf" : "#111",
    sub: dark ? "#555" : "#b0ada6",
    faint: dark ? "#1e1e1e" : "#e0ddd7",
    btnBg: dark ? "#d8d5cf" : "#111",
    btnTx: dark ? "#111" : "#f7f6f3",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}>
      <div style={{ background: c.bg, border: `1px solid ${c.border}`, padding: "28px 24px", maxWidth: 340, width: "100%", boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(0,0,0,0.15)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.sub, marginBottom: 16, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: c.text, lineHeight: 1.2, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: c.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 24, lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ height: 1, background: c.faint, marginBottom: 20 }} />
        <button onClick={onClose} style={{
          width: "100%", background: c.btnBg, color: c.btnTx,
          border: "none", padding: "9px 0",
          fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >OK</button>
      </div>
    </div>
  );
}

// ── Inline Edit Row ──────────────────────────────────────────────
function EditRow({ entry, onSave, onCancel, dark, isDateTaken, onDuplicate }) {
  const [eDate, setEDate] = useState(entry.date);
  const [mode, setMode] = useState(entry.timeIn ? "time" : "manual");
  const [eHrs, setEHrs] = useState(String(entry.h));
  const [eIn, setEIn] = useState(entry.timeIn || defaultTimeIn());
  const [eOut, setEOut] = useState(entry.timeOut || defaultTimeOut());
  const [eErr, setEErr] = useState("");

  const derivedH = mode === "time" ? calcHoursFromTimes(eIn, eOut) : parseFloat(eHrs) || 0;
  const dateTaken = Boolean(isDateTaken && isDateTaken(eDate, entry.id));

  const c = {
    text: dark ? "#d8d5cf" : "#111",
    muted: dark ? "#4a4a4a" : "#9c9890",
    sub: dark ? "#555" : "#b0ada6",
    faint: dark ? "#1e1e1e" : "#e0ddd7",
    inputBorder: dark ? "#2a2a2a" : "#d0cfc9",
    btnBg: dark ? "#d8d5cf" : "#111",
    btnTx: dark ? "#111" : "#f7f6f3",
    rowBg: dark ? "#141414" : "#faf9f7",
    accent: dark ? "#333" : "#c8c5be",
    tabActive: dark ? "#d8d5cf" : "#111",
    tabActiveTx: dark ? "#111" : "#f7f6f3",
    tabInactive: "transparent",
    tabBorder: dark ? "#2a2a2a" : "#e0ddd7",
  };

  const inputStyle = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${c.inputBorder}`,
    outline: "none", fontFamily: "'Geist Mono',monospace",
    fontSize: 12, color: c.text, padding: "3px 0", width: "100%",
    transition: "border-color 0.15s",
  };

  const save = () => {
    if (!eDate) return setEErr("Date required.");
    if (dateTaken) {
      onDuplicate?.(eDate);
      return;
    }
    if (mode === "manual") {
      const h = parseFloat(eHrs);
      if (!eHrs || isNaN(h) || h <= 0 || h > 24) return setEErr("Hours must be 0.5–24.");
      onSave({ ...entry, date: eDate, h, timeIn: null, timeOut: null });
    } else {
      if (derivedH <= 0) return setEErr("Time out must be after time in.");
      onSave({ ...entry, date: eDate, h: derivedH, timeIn: eIn, timeOut: eOut });
    }
  };

  return (
    <div style={{ padding: "16px 14px 14px", background: c.rowBg, borderBottom: `1px solid ${c.faint}`, borderLeft: `2px solid ${c.accent}` }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, border: `1px solid ${c.tabBorder}`, width: "fit-content" }}>
        {[["manual", "Manual Hours"], ["time", "Time In / Out"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setMode(val)} style={{
            background: mode === val ? c.tabActive : c.tabInactive,
            color: mode === val ? c.tabActiveTx : c.sub,
            border: "none", padding: "5px 14px", fontSize: 9,
            letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "all 0.15s",
          }}>{lbl}</button>
        ))}
      </div>

      {/* Date */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 5, fontFamily: "'Geist Mono',monospace" }}>Date</div>
        <CalendarField value={eDate} onChange={setEDate} maxDate={todayStr()} dark={dark} compact />
      </div>

      {dateTaken && (
        <div style={{ border: `1px solid ${c.faint}`, padding: "12px 12px", marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
          <div style={{ fontSize: 11, color: c.sub, fontFamily: "'Geist Mono',monospace", letterSpacing: "0.02em", lineHeight: 1.4 }}>
            This date is already used in History. You can't save a duplicate date. Edit the existing entry instead, or delete it then add a new one.
          </div>
        </div>
      )}

      {mode === "manual" ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 5, fontFamily: "'Geist Mono',monospace" }}>Hours</div>
          <input type="number" value={eHrs} min="0.5" max="24" step="0.5" style={inputStyle}
            onChange={e => setEHrs(e.target.value)}
            onFocus={e => e.target.style.borderColor = c.text}
            onBlur={e => e.target.style.borderColor = c.inputBorder}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} />
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
            {[4, 6, 7, 8, 9].map(h => <Chip key={h} label={`${h}h`} active={eHrs === String(h)} onClick={() => setEHrs(String(h))} dark={dark} />)}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <TimePicker value={eIn} onChange={setEIn} dark={dark} label="Time In" />
            <TimePicker value={eOut} onChange={setEOut} dark={dark} label="Time Out" />
          </div>
          {derivedH > 0 && (
            <div style={{ fontSize: 11, color: c.muted, fontFamily: "'Geist Mono',monospace", marginBottom: 12 }}>
              = {derivedH % 1 === 0 ? derivedH : derivedH.toFixed(2)} hrs
            </div>
          )}
        </div>
      )}

      {eErr && <div style={{ fontSize: 10, color: c.muted, marginBottom: 10, letterSpacing: "0.04em" }}>{eErr}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save} style={{
          background: c.btnBg, color: c.btnTx, border: "none",
          padding: "7px 18px", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >Save</button>
        <button onClick={onCancel} style={{
          background: "none", border: "none", padding: "7px 0",
          fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
          color: c.sub, fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "color 0.15s",
        }}
          onMouseEnter={e => e.target.style.color = c.text}
          onMouseLeave={e => e.target.style.color = c.sub}
        >Cancel</button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function OjtMinimal() {
  const [entries, setEntries] = useState(loadEntries);
  const [theme, setTheme] = useState(loadTheme);
  const dark = theme === "dark";

  // Single entry
  const [date, setDate] = useState(todayStr());
  const [entryMode, setEntryMode] = useState("manual"); // "manual" | "time"
  const [hrs, setHrs] = useState("");
  const [timeIn, setTimeIn] = useState(defaultTimeIn());
  const [timeOut, setTimeOut] = useState(defaultTimeOut());
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState(false);
  const hrsRef = useRef(null);

  // Bulk
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bMode, setBMode] = useState("manual");
  const [bHrs, setBHrs] = useState("8");
  const [bTimeIn, setBTimeIn] = useState(defaultTimeIn());
  const [bTimeOut, setBTimeOut] = useState(defaultTimeOut());
  const [bSkip, setBSkip] = useState(true);
  const [bErr, setBErr] = useState("");
  const [bFlash, setBFlash] = useState(false);

  // Edit / Delete
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // entry object
  const [removing, setRemoving] = useState(null);
  const [dupNotice, setDupNotice] = useState(null); // { title: string, message: string }

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {} }, [entries]);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.body.style.background = dark ? "#0e0e0e" : "#f7f6f3";
    document.body.style.color = dark ? "#d8d5cf" : "#111";
  }, [theme, dark]);

  const total = entries.reduce((s, e) => s + e.h, 0);
  const rem = Math.max(0, GOAL - total);
  const pct = Math.min(100, (total / GOAL) * 100);
  const done = total >= GOAL;
  const n = (v) => v % 1 === 0 ? v : v.toFixed(2);

  const usedDates = new Set(entries.map(e => e.date));
  const isDateTaken = useCallback((d, excludeId) => {
    if (!d) return false;
    return entries.some(e => e.date === d && e.id !== excludeId);
  }, [entries]);

  const derivedH = entryMode === "time" ? calcHoursFromTimes(timeIn, timeOut) : 0;
  const bDerivedH = bMode === "time" ? calcHoursFromTimes(bTimeIn, bTimeOut) : 0;

  const openDupModal = useCallback((d, mode) => {
    if (mode === "bulk") {
      setDupNotice({
        title: "Duplicate dates",
        message: "Some dates in this range already exist in History. You can't add duplicates. Edit the existing entries, or delete them first then add again.",
      });
      return;
    }

    const pretty = d ? `${fmtDate(d)} (${fmtWeekday(d)})` : "This date";
    setDupNotice({
      title: "Date already exists",
      message: `${pretty} is already in History. You can't add another entry for the same date. Please edit the existing entry, or delete it then add a new one.`,
    });
  }, []);

  const add = () => {
    if (!date) return setErr("Date required.");
    if (usedDates.has(date)) {
      setErr("");
      openDupModal(date, "single");
      return;
    }
    let h;
    if (entryMode === "manual") {
      h = parseFloat(hrs);
      if (!hrs || isNaN(h) || h <= 0 || h > 24) return setErr("Enter hours between 0.5 and 24.");
    } else {
      h = derivedH;
      if (h <= 0) return setErr("Time out must be after time in.");
    }
    setErr("");
    setEntries(p => [...p, {
      id: crypto.randomUUID(), date, h,
      timeIn: entryMode === "time" ? timeIn : null,
      timeOut: entryMode === "time" ? timeOut : null,
    }]);
    setHrs(""); setDate(todayStr());
    setTimeIn(defaultTimeIn()); setTimeOut(defaultTimeOut());
    setFlash(true); setTimeout(() => setFlash(false), 700);
    if (entryMode === "manual") hrsRef.current?.focus();
  };

  const doDelete = (entry) => {
    setConfirmDelete(null);
    setRemoving(entry.id);
    setTimeout(() => {
      setEntries(p => p.filter(e => e.id !== entry.id));
      setRemoving(null);
      if (editingId === entry.id) setEditingId(null);
    }, 260);
  };

  const saveEdit = (updated) => {
    setEntries(p => p.map(e => e.id === updated.id ? updated : e));
    setEditingId(null);
  };

  const getBulkDates = useCallback(() => {
    if (!bStart || !bEnd) return [];
    const start = parseLocal(bStart), end = parseLocal(bEnd);
    if (start > end) return [];
    const dates = [], cur = new Date(start);
    while (cur <= end) {
      if (!bSkip || (cur.getDay() !== 0 && cur.getDay() !== 6)) dates.push(toStr(new Date(cur)));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [bStart, bEnd, bSkip]);

  const bulkDates = getBulkDates();
  const bulkH = bMode === "manual" ? (parseFloat(bHrs) || 0) : bDerivedH;
  const bulkTotal = bulkDates.length * bulkH;
  const bulkDupCount = bulkDates.reduce((acc, d) => acc + (usedDates.has(d) ? 1 : 0), 0);

  const commitBulk = () => {
    if (!bStart || !bEnd) return setBErr("Select start and end dates.");
    if (parseLocal(bStart) > parseLocal(bEnd)) return setBErr("Start must be before end.");
    if (bulkH <= 0) return setBErr(bMode === "manual" ? "Enter valid hours per day." : "Time out must be after time in.");
    if (bulkH > 24) return setBErr("Hours per day cannot exceed 24.");
    if (bulkDates.length === 0) return setBErr("No valid days in range.");
    if (bulkDupCount > 0) {
      setBErr("");
      openDupModal(null, "bulk");
      return;
    }
    setBErr("");
    setEntries(p => [...p, ...bulkDates.map(d => ({
      id: crypto.randomUUID(), date: d, h: bulkH,
      timeIn: bMode === "time" ? bTimeIn : null,
      timeOut: bMode === "time" ? bTimeOut : null,
    }))]);
    setBStart(""); setBEnd(""); setBHrs("8");
    setBFlash(true); setTimeout(() => { setBFlash(false); setBulkOpen(false); }, 900);
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const c = {
    text: dark ? "#d8d5cf" : "#111",
    muted: dark ? "#4a4a4a" : "#9c9890",
    sub: dark ? "#555" : "#b0ada6",
    faint: dark ? "#1e1e1e" : "#e0ddd7",
    inputBorder: dark ? "#2a2a2a" : "#d0cfc9",
    btnBg: dark ? "#d8d5cf" : "#111",
    btnTx: dark ? "#111" : "#f7f6f3",
    panelBg: dark ? "#111" : "#fff",
    panelBorder: dark ? "#1e1e1e" : "#ece9e3",
    previewBg: dark ? "#0e0e0e" : "#f7f6f3",
    tabActive: dark ? "#d8d5cf" : "#111",
    tabActiveTx: dark ? "#111" : "#f7f6f3",
    tabBorder: dark ? "#2a2a2a" : "#e0ddd7",
  };

  const inputStyle = {
    background: "transparent", border: "none",
    borderBottom: `1px solid ${c.inputBorder}`,
    borderRadius: 0, outline: "none",
    fontFamily: "'Geist Mono',monospace",
    fontSize: 13, color: c.text, padding: "6px 0", width: "100%",
    transition: "border-color 0.15s",
  };

  const TabBar = ({ value, onChange, options }) => (
    <div style={{ display: "flex", border: `1px solid ${c.tabBorder}`, width: "fit-content", marginBottom: 20 }}>
      {options.map(([val, lbl]) => (
        <button key={val} onClick={() => onChange(val)} style={{
          background: value === val ? c.tabActive : "transparent",
          color: value === val ? c.tabActiveTx : c.sub,
          border: "none", padding: "6px 16px", fontSize: 10,
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "all 0.15s",
        }}>{lbl}</button>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Geist Mono',monospace; font-size: 13px; -webkit-font-smoothing: antialiased; transition: background 0.25s, color 0.25s; }
        button { cursor: pointer; font-family: 'Geist Mono',monospace; }
        input[type="number"] { -webkit-appearance: none; appearance: none; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input::placeholder { color: ${c.sub}; }
        .log-item { display: flex; align-items: center; justify-content: space-between; padding: 13px 0; border-bottom: 1px solid ${c.faint}; transition: opacity 0.26s; }
        .log-item.out { opacity: 0; }
        .action-btn { background: none; border: none; padding: 0; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${c.sub}; transition: color 0.15s; white-space: nowrap; }
        .action-btn:hover { color: ${c.text}; }
        .action-btn.danger:hover { color: ${dark ? "#e07070" : "#c0392b"}; }
        .log-sep { width: 1px; height: 10px; background: ${c.faint}; flex-shrink: 0; }
        @media (max-width: 500px) { .wrap { padding: 48px 20px 80px !important; } .hero-n { font-size: 80px !important; } .two-col { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <DeleteModal
          entry={confirmDelete}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          dark={dark}
        />
      )}

      {dupNotice && (
        <DuplicateDateModal
          title={dupNotice.title}
          message={dupNotice.message}
          onClose={() => setDupNotice(null)}
          dark={dark}
        />
      )}

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

        {/* Hero */}
        <div style={{ marginBottom: 60 }}>
          <div className="hero-n" style={{ fontFamily: "'Instrument Serif',serif", fontSize: "clamp(80px,18vw,120px)", fontWeight: 400, lineHeight: 0.88, letterSpacing: "-0.02em", color: c.text, fontVariantNumeric: "tabular-nums" }}>
            {n(total)}
          </div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 300, color: c.muted, marginTop: 12 }}>
            of {GOAL} hours required
          </div>
        </div>

        {/* Progress */}
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
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1, color: c.text, fontVariantNumeric: "tabular-nums" }}>{entries.length}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginTop: 4 }}>Sessions</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1, color: c.text, fontVariantNumeric: "tabular-nums" }}>
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
            >{bulkOpen ? "Single entry" : "Bulk add"}</button>
          </div>

          {!bulkOpen ? (
            <>
              <TabBar value={entryMode} onChange={setEntryMode} options={[["manual","Manual Hours"],["time","Time In / Out"]]} />

              {/* Date */}
              <div style={{ marginBottom: 20 }}>
                <CalendarField value={date} onChange={setDate} maxDate={todayStr()} dark={dark} label="Date" />
              </div>

              {date && usedDates.has(date) && (
                <div style={{ border: `1px solid ${c.faint}`, padding: "12px 14px", marginBottom: 20 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
                  <div style={{ fontSize: 11, color: c.sub, fontFamily: "'Geist Mono',monospace", letterSpacing: "0.02em", lineHeight: 1.4 }}>
                    This date is already used in History. You can't add a duplicate date. Edit the existing entry instead, or delete it then add a new one.
                  </div>
                </div>
              )}

              {entryMode === "manual" ? (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Hours</div>
                  <input ref={hrsRef} type="number" placeholder="0.0" value={hrs} min="0.5" max="24" step="0.5"
                    style={inputStyle}
                    onChange={e => setHrs(e.target.value)}
                    onFocus={e => e.target.style.borderColor = c.text}
                    onBlur={e => e.target.style.borderColor = c.inputBorder}
                    onKeyDown={e => e.key === "Enter" && add()} />
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {[4, 6, 7, 8, 9].map(h => <Chip key={h} label={`${h}h`} active={hrs === String(h)} onClick={() => setHrs(String(h))} dark={dark} />)}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
                    <TimePicker value={timeIn} onChange={setTimeIn} dark={dark} label="Time In" />
                    <TimePicker value={timeOut} onChange={setTimeOut} dark={dark} label="Time Out" />
                  </div>
                  {derivedH > 0 && (
                    <div style={{ fontSize: 12, color: c.muted, fontFamily: "'Geist Mono',monospace" }}>
                      = {derivedH % 1 === 0 ? derivedH : derivedH.toFixed(2)} hrs
                    </div>
                  )}
                </div>
              )}

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
            /* Bulk panel */
            <div style={{ background: c.panelBg, border: `1px solid ${c.panelBorder}`, padding: "20px 18px" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.sub, marginBottom: 18 }}>Add a range of past dates at once</div>

              <TabBar value={bMode} onChange={setBMode} options={[["manual","Manual Hours"],["time","Time In / Out"]]} />

              <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <CalendarField value={bStart} onChange={v => { setBStart(v); if (bEnd && parseLocal(v) > parseLocal(bEnd)) setBEnd(""); }} maxDate={todayStr()} dark={dark} label="Start date" />
                <CalendarField value={bEnd} onChange={v => { if (!bStart || parseLocal(v) >= parseLocal(bStart)) { setBEnd(v); setBErr(""); } else setBErr("End must be after start."); }} maxDate={todayStr()} dark={dark} label="End date" />
              </div>

              {bulkDupCount > 0 && (
                <div style={{ border: `1px solid ${c.faint}`, padding: "12px 14px", marginBottom: 16, background: c.previewBg }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
                  <div style={{ fontSize: 11, color: c.sub, fontFamily: "'Geist Mono',monospace", letterSpacing: "0.02em", lineHeight: 1.4 }}>
                    {bulkDupCount} date{bulkDupCount === 1 ? " is" : "s are"} already used in History for this range. You can't bulk add duplicates. Edit the existing entries instead, or delete them then add again.
                  </div>
                </div>
              )}

              {bMode === "manual" ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Hours per day</div>
                  <input type="number" placeholder="8" value={bHrs} min="0.5" max="24" step="0.5"
                    style={inputStyle}
                    onChange={e => setBHrs(e.target.value)}
                    onFocus={e => e.target.style.borderColor = c.text}
                    onBlur={e => e.target.style.borderColor = c.inputBorder} />
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {[4, 6, 7, 8, 9, 10].map(h => <Chip key={h} label={`${h}h`} active={bHrs === String(h)} onClick={() => setBHrs(String(h))} dark={dark} />)}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                    <TimePicker value={bTimeIn} onChange={setBTimeIn} dark={dark} label="Time In" />
                    <TimePicker value={bTimeOut} onChange={setBTimeOut} dark={dark} label="Time Out" />
                  </div>
                  {bDerivedH > 0 && (
                    <div style={{ fontSize: 11, color: c.muted, fontFamily: "'Geist Mono',monospace" }}>
                      = {bDerivedH % 1 === 0 ? bDerivedH : bDerivedH.toFixed(2)} hrs / day
                    </div>
                  )}
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: c.sub, letterSpacing: "0.06em", userSelect: "none", marginBottom: 20 }}>
                <input type="checkbox" checked={bSkip} onChange={e => setBSkip(e.target.checked)} style={{ accentColor: c.text, width: 13, height: 13 }} />
                Skip weekends
              </label>

              {bStart && bEnd && bulkH > 0 && bulkDates.length > 0 && (
                <div style={{ background: c.previewBg, padding: "12px 14px", marginBottom: 14, borderTop: `1px solid ${c.faint}` }}>
                  {[["Days", bulkDates.length], ["Hours to add", n(bulkTotal)], ["New total", n(Math.min(GOAL, total + bulkTotal))]].map(([lbl, val]) => (
                    <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub }}>{lbl}</span>
                      <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: c.text, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={commitBulk} style={{
                background: bFlash ? (dark ? "#888" : "#555") : c.btnBg,
                color: c.btnTx, border: "none", padding: "10px 0", width: "100%",
                fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
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
            {sorted.length > 0 && <span style={{ fontSize: 10, color: c.sub, letterSpacing: "0.06em" }}>{sorted.length} {sorted.length === 1 ? "entry" : "entries"}</span>}
          </div>

          {sorted.length === 0 ? (
            <div style={{ fontSize: 12, color: dark ? "#2e2e2e" : "#c8c5be", letterSpacing: "0.04em", padding: "20px 0" }}>No entries recorded.</div>
          ) : sorted.map(e => (
            <div key={e.id}>
              {editingId === e.id ? (
                <EditRow
                  entry={e}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  dark={dark}
                  isDateTaken={isDateTaken}
                  onDuplicate={(d) => openDupModal(d, "single")}
                />
              ) : (
                <div className={`log-item${removing === e.id ? " out" : ""}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: c.text }}>
                      {fmtDate(e.date)}
                      <span style={{ fontSize: 10, color: c.sub, marginLeft: 8, letterSpacing: "0.04em" }}>
                        {fmtWeekday(e.date)}
                      </span>
                    </div>
                    {e.timeIn && e.timeOut && (
                      <div style={{ fontSize: 10, color: c.sub, fontFamily: "'Geist Mono',monospace", marginTop: 2, letterSpacing: "0.04em" }}>
                        {fmtTime(e.timeIn)} — {fmtTime(e.timeOut)}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: c.text, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {n(e.h)}<span style={{ fontSize: 10, color: c.sub, letterSpacing: "0.06em", marginLeft: 3 }}>hr</span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 16 }}>
                    <button className="action-btn" onClick={() => setEditingId(e.id)}>Edit</button>
                    <div className="log-sep" />
                    <button className="action-btn danger" onClick={() => setConfirmDelete(e)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </>
  );
}