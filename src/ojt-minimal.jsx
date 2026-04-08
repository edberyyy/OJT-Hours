import { useState, useEffect, useRef, useCallback } from "react";

const GOAL = 500;
const KEY = "ojt_v3";
const THEME_KEY = "ojt_theme";
const GOAL_KEY = "ojt_goal";

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

const pad2 = (n) => String(n).padStart(2, "0");

const timeToDisplay = (t) => {
  if (!t) return "";
  return `${t.h}:${pad2(t.m)} ${t.period}`;
};

const parseDisplayTime = (value) => {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*$/.exec(value || "");
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (Number.isNaN(hour24) || Number.isNaN(minute)) return null;
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
  if (hour24 > 12) return null;
  if (hour24 === 0) return null;
  const hour12 = hour24;
  return { h: hour12, m: minute, period };
};

const formatTimeInput = (value) => {
  const next = parseDisplayTime(value);
  return next ? timeToDisplay(next) : value;
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
  return totalMinutes > 0 ? minutesToHours(totalMinutes) : 0;
};

const normalizeEntry = (entry) => {
  const hasAnyNewField = entry.hReg != null || entry.hOT != null || entry.hMinus != null;

  const legacyH = typeof entry.h === "number" ? entry.h : (parseFloat(entry.h) || 0);
  const reg = entry.hReg != null
    ? (typeof entry.hReg === "number" ? entry.hReg : (parseFloat(entry.hReg) || 0))
    : (hasAnyNewField ? 0 : legacyH);

  let ot = entry.hOT != null
    ? (typeof entry.hOT === "number" ? entry.hOT : (parseFloat(entry.hOT) || 0))
    : 0;

  let minus = entry.hMinus != null
    ? (typeof entry.hMinus === "number" ? entry.hMinus : (parseFloat(entry.hMinus) || 0))
    : 0;

  // Backward compat: a previous iteration stored deductions as negative OT.
  // Convert negative OT into minus hours when `hMinus` isn't set.
  if (minus === 0 && ot < 0) {
    minus = -ot;
    ot = 0;
  }

  const total = Math.max(0, (reg + ot) - minus);
  return { hReg: reg, hOT: ot, hMinus: minus, total };
};

const entryTotal = (entry) => normalizeEntry(entry).total;

// ── Storage ──────────────────────────────────────────────────────
const loadEntries = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};
const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
};
const loadGoal = () => {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

// ── Calendar ─────────────────────────────────────────────────────
function Calendar({ value, onChange, maxDate, dark, disabledDates }) {
  const init = value ? parseLocal(value) : new Date();
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() });
  const selected = value ? parseLocal(value) : null;
  const max = maxDate ? parseLocal(maxDate) : null;
  const blocked = disabledDates instanceof Set ? disabledDates : new Set(disabledDates || []);

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
    if (blocked.has(ds)) return;
    onChange(ds);
  };

  const isSel = (d) => selected && selected.getFullYear() === view.y && selected.getMonth() === view.m && selected.getDate() === d;
  const isDis = (d) => max && new Date(view.y, view.m, d) > max;
  const isBlocked = (d) => blocked.has(toStr(new Date(view.y, view.m, d)));
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
          const sel = d && isSel(d), dis = d && isDis(d), blockedDay = d && isBlocked(d), tod = d && isTod(d);
          return (
            <div key={i} onClick={() => !dis && !blockedDay && pick(d)} style={{
              textAlign: "center", padding: "6px 0",
              fontFamily: "'Geist Mono',monospace", fontSize: 11,
              cursor: d && !dis && !blockedDay ? "pointer" : "default",
              color: !d ? "transparent" : dis || blockedDay ? c.disTx : sel ? c.selTx : c.text,
              background: sel ? c.selBg : blockedDay ? (dark ? "rgba(255,255,255,0.02)" : "#f7f3ec") : "transparent",
              position: "relative", transition: "background 0.1s",
            }}
              onMouseEnter={e => { if (d && !dis && !sel && !blockedDay) e.currentTarget.style.background = c.hov; }}
              onMouseLeave={e => { if (!sel && !blockedDay) e.currentTarget.style.background = "transparent"; }}
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

function CalendarField({ value, onChange, maxDate, dark, label, compact, disabledDates }) {
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
          <Calendar value={value} onChange={v => { onChange(v); setOpen(false); }} maxDate={maxDate} dark={dark} disabledDates={disabledDates} />
        </div>
      )}
    </div>
  );
}

// ── Time Picker ──────────────────────────────────────────────────
function TimePicker({ value, onChange, dark, label }) {
  const [typedValue, setTypedValue] = useState(timeToDisplay(value));
  const [typedError, setTypedError] = useState("");
  const c = {
    text: dark ? "#efe9df" : "#1f2937",
    muted: dark ? "#8d96a0" : "#667085",
    border: dark ? "#2a313d" : "#d8d1c7",
    selBg: dark ? "#cfd7e2" : "#243b53",
    selTx: dark ? "#14171c" : "#fbf8f2",
    bg: dark ? "#15181d" : "#fffdf9",
    hdrBg: dark ? "#101317" : "#faf7f0",
    hov: dark ? "#222831" : "#f4eee5",
    labelColor: dark ? "#8d96a0" : "#667085",
    faint: dark ? "#232831" : "#e6dfd4",
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 15, 30, 45];

  useEffect(() => {
    setTypedValue(timeToDisplay(value));
    setTypedError("");
  }, [value]);

  const applyTypedValue = (raw) => {
    const parsed = parseDisplayTime(raw);
    if (!parsed) {
      setTypedError("Use h:mm AM/PM, such as 8:30 AM.");
      return false;
    }
    onChange(parsed);
    setTypedValue(timeToDisplay(parsed));
    setTypedError("");
    return true;
  };

  const setH = (h) => {
    const next = { ...value, h };
    onChange(next);
    setTypedValue(timeToDisplay(next));
    setTypedError("");
  };
  const setM = (m) => {
    const next = { ...value, m };
    onChange(next);
    setTypedValue(timeToDisplay(next));
    setTypedError("");
  };
  const setP = (period) => {
    const next = { ...value, period };
    onChange(next);
    setTypedValue(timeToDisplay(next));
    setTypedError("");
  };

  return (
    <div>
      {label && <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.labelColor, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>{label}</div>}
      <div style={{ border: `1px solid ${c.border}`, borderRadius: 18, background: c.bg, overflow: "hidden", boxShadow: dark ? "0 14px 34px rgba(0,0,0,0.18)" : "0 12px 28px rgba(36,40,50,0.06)" }}>
        <div style={{ background: c.hdrBg, borderBottom: `1px solid ${c.border}`, padding: "12px 14px", display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <input
              type="text"
              inputMode="text"
              placeholder="8:30 AM"
              value={typedValue}
              onChange={e => {
                const next = e.target.value;
                setTypedValue(next);
                if (typedError) setTypedError("");
              }}
              onKeyDown={e => {
                if (e.key === "Enter") applyTypedValue(formatTimeInput(typedValue));
                if (e.key === "Escape") setTypedValue(timeToDisplay(value));
              }}
              style={{
                background: dark ? "rgba(255,255,255,0.02)" : "#fff",
                border: `1px solid ${c.border}`,
                borderRadius: 14,
                padding: "10px 12px",
                fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                fontSize: 14,
                letterSpacing: "0.03em",
                color: c.text,
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = c.selBg;
                e.currentTarget.style.boxShadow = dark ? "0 0 0 3px rgba(207,215,226,0.12)" : "0 0 0 3px rgba(36,59,83,0.10)";
              }}
              onBlur={e => {
                applyTypedValue(formatTimeInput(typedValue));
                e.currentTarget.style.borderColor = c.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
            {["AM", "PM"].map(p => (
              <button key={p} onClick={() => setP(p)} style={{
                background: value.period === p ? c.selBg : "transparent",
                color: value.period === p ? c.selTx : c.muted,
                border: `1px solid ${value.period === p ? c.selBg : c.border}`,
                padding: "6px 10px", fontSize: 9, letterSpacing: "0.08em",
                fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "all 0.12s",
                borderRadius: 999,
              }}>{p}</button>
            ))}
          </div>
          </div>
          {typedError && <div style={{ fontSize: 11, color: c.muted, letterSpacing: "0.02em", lineHeight: 1.4 }}>{typedError}</div>}
        </div>
        <div style={{ padding: "12px 14px 14px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>Hour</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
            {hours.map(h => (
              <button key={h} onClick={() => setH(h)} style={{
                background: value.h === h ? c.selBg : "transparent",
                color: value.h === h ? c.selTx : c.text,
                border: `1px solid ${value.h === h ? c.selBg : c.border}`,
                padding: "6px 0", fontSize: 11, fontFamily: "'Geist Mono',monospace",
                cursor: "pointer", textAlign: "center", transition: "all 0.1s",
                borderRadius: 12,
              }}
                onMouseEnter={e => { if (value.h !== h) e.currentTarget.style.background = c.hov; }}
                onMouseLeave={e => { if (value.h !== h) e.currentTarget.style.background = "transparent"; }}
              >{h}</button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${c.faint}`, padding: "12px 14px 14px", background: dark ? "rgba(255,255,255,0.01)" : "#fff" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>Minute</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {minutes.map(m => (
              <button key={m} onClick={() => setM(m)} style={{
                background: value.m === m ? c.selBg : "transparent",
                color: value.m === m ? c.selTx : c.text,
                border: `1px solid ${value.m === m ? c.selBg : c.border}`,
                padding: "6px 0", fontSize: 11, fontFamily: "'Geist Mono',monospace",
                cursor: "pointer", textAlign: "center", transition: "all 0.1s",
                borderRadius: 12,
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
      color: active ? c.selTx : c.muted, padding: "6px 12px", fontSize: 10,
      letterSpacing: "0.06em", fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", cursor: "pointer", transition: "all 0.12s",
      borderRadius: 999,
    }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = c.hov; e.currentTarget.style.color = c.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.muted; } }}
    >{label}</button>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────
function DeleteModal({ entry, onConfirm, onCancel, dark }) {
  const c = {
    overlay: dark ? "rgba(5, 7, 12, 0.72)" : "rgba(17, 19, 23, 0.42)",
    bg: dark ? "#12161b" : "#fffdf9",
    border: dark ? "#252b33" : "#e6dfd4",
    text: dark ? "#efe9df" : "#1f2937",
    sub: dark ? "#8d96a0" : "#667085",
    faint: dark ? "#20262f" : "#ede6da",
    btnBg: dark ? "#d9e1eb" : "#243b53",
    btnTx: dark ? "#11161b" : "#fbf8f2",
    dangerBg: dark ? "#3a1515" : "#fff0f0",
    dangerBorder: dark ? "#6a2424" : "#efc7c7",
    dangerTx: dark ? "#ff8f8f" : "#bb3a2b",
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(8px)" }}
      onClick={onCancel}>
      <div style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        padding: "28px 24px 24px",
        maxWidth: 380,
        width: "100%",
        boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(17,19,23,0.16)",
        borderRadius: 24,
      }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.sub, marginBottom: 16, fontFamily: "'Geist Mono',monospace" }}>Confirm Delete</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: c.text, lineHeight: 1.1, marginBottom: 8 }}>
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
          {(() => {
            const h = entryTotal(entry);
            return `${h % 1 === 0 ? h : h.toFixed(2)} hr${h === 1 ? "" : "s"} will be deducted`;
          })()}
        </div>
        <div style={{ height: 1, background: c.faint, marginBottom: 20 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={{
            flex: 1, background: c.dangerBg, color: c.dangerTx,
            border: `1px solid ${c.dangerBorder}`, padding: "9px 0",
            fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
            borderRadius: 999,
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >Delete</button>
          <button onClick={onCancel} style={{
            flex: 1, background: c.btnBg, color: c.btnTx,
            border: "none", padding: "9px 0",
            fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "'Geist Mono',monospace", cursor: "pointer", transition: "opacity 0.15s",
            borderRadius: 999,
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
    overlay: dark ? "rgba(5, 7, 12, 0.72)" : "rgba(17, 19, 23, 0.42)",
    bg: dark ? "#12161b" : "#fffdf9",
    border: dark ? "#252b33" : "#e6dfd4",
    text: dark ? "#efe9df" : "#1f2937",
    sub: dark ? "#8d96a0" : "#667085",
    faint: dark ? "#20262f" : "#ede6da",
    btnBg: dark ? "#d9e1eb" : "#243b53",
    btnTx: dark ? "#11161b" : "#fbf8f2",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}>
      <div style={{ background: c.bg, border: `1px solid ${c.border}`, padding: "28px 24px 24px", maxWidth: 380, width: "100%", boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(17,19,23,0.16)", borderRadius: 24 }}
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
          borderRadius: 999,
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >OK</button>
      </div>
    </div>
  );
}

function GoalModal({ mode, value, onSave, onCancel, dark }) {
  const [goalValue, setGoalValue] = useState(String(value));
  const c = {
    overlay: dark ? "rgba(5, 7, 12, 0.72)" : "rgba(17, 19, 23, 0.42)",
    bg: dark ? "#12161b" : "#fffdf9",
    border: dark ? "#252b33" : "#e6dfd4",
    text: dark ? "#efe9df" : "#1f2937",
    sub: dark ? "#8d96a0" : "#667085",
    faint: dark ? "#20262f" : "#ede6da",
    btnBg: dark ? "#d9e1eb" : "#243b53",
    btnTx: dark ? "#11161b" : "#fbf8f2",
  };

  useEffect(() => {
    setGoalValue(String(value));
  }, [value]);

  const submit = () => {
    const parsed = Number(goalValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave(Math.round(parsed));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.bg, border: `1px solid ${c.border}`, padding: "28px 24px 24px", maxWidth: 380, width: "100%", boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(17,19,23,0.16)", borderRadius: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.sub, marginBottom: 16, fontFamily: "'Geist Mono',monospace" }}>{mode === "reset" ? "Reset Progress" : mode === "change" ? "Change Target" : "Start Setup"}</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: c.text, lineHeight: 1.1, marginBottom: 8 }}>
          How many hours do you need?
        </div>
        <div style={{ fontSize: 12, color: c.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 18, lineHeight: 1.5 }}>
          {mode === "reset"
            ? "This will clear the current progress and start a new target."
            : mode === "change"
              ? "Update the target without clearing your logged hours."
              : "Set your target before you begin logging hours."}
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Target hours</div>
          <input
            type="number"
            min="1"
            step="1"
            value={goalValue}
            onChange={e => setGoalValue(e.target.value)}
            style={{ background: dark ? "rgba(255,255,255,0.02)" : "#fff", border: `1px solid ${c.border}`, borderRadius: 14, outline: "none", fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", fontSize: 15, lineHeight: 1.5, letterSpacing: "0.01em", color: c.text, padding: "12px 14px", width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "transparent", color: c.sub, border: `1px solid ${c.faint}`, padding: "11px 0", borderRadius: 999, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={submit} style={{ flex: 1, background: c.btnBg, color: c.btnTx, border: "none", padding: "11px 0", borderRadius: 999, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
            Save target
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetConfirmModal({ onConfirm, onCancel, dark }) {
  const c = {
    overlay: dark ? "rgba(5, 7, 12, 0.72)" : "rgba(17, 19, 23, 0.42)",
    bg: dark ? "#12161b" : "#fffdf9",
    border: dark ? "#252b33" : "#e6dfd4",
    text: dark ? "#efe9df" : "#1f2937",
    sub: dark ? "#8d96a0" : "#667085",
    faint: dark ? "#20262f" : "#ede6da",
    btnBg: dark ? "#d9e1eb" : "#243b53",
    btnTx: dark ? "#11161b" : "#fbf8f2",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.bg, border: `1px solid ${c.border}`, padding: "28px 24px 24px", maxWidth: 380, width: "100%", boxShadow: dark ? "0 24px 60px rgba(0,0,0,0.8)" : "0 24px 60px rgba(17,19,23,0.16)", borderRadius: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.sub, marginBottom: 16, fontFamily: "'Geist Mono',monospace" }}>Reset Progress</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: c.text, lineHeight: 1.1, marginBottom: 8 }}>
          Are you sure you want to reset?
        </div>
        <div style={{ fontSize: 12, color: c.sub, fontFamily: "'Geist Mono',monospace", marginBottom: 24, lineHeight: 1.5 }}>
          This clears the current progress before asking for a new target.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "transparent", color: c.sub, border: `1px solid ${c.faint}`, padding: "11px 0", borderRadius: 999, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, background: c.btnBg, color: c.btnTx, border: "none", padding: "11px 0", borderRadius: 999, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
            Yes, reset
          </button>
        </div>
      </div>
    </div>
  );
}

function LogRow({ entry, colors, removing, onEdit, onDelete }) {
  return (
    <div className={`log-item${removing ? " out" : ""}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: colors.text, fontWeight: 600, lineHeight: 1.35 }}>
          {fmtDate(entry.date)}
          <span style={{ fontSize: 10, color: colors.sub, marginLeft: 8, letterSpacing: "0.04em", fontWeight: 500 }}>
            {fmtWeekday(entry.date)}
          </span>
        </div>
        {entry.timeIn && entry.timeOut && (
          <div style={{ fontSize: 11, color: colors.sub, fontFamily: "'Geist Mono',monospace", marginTop: 4, letterSpacing: "0.03em" }}>
            {fmtTime(entry.timeIn)} — {fmtTime(entry.timeOut)}
          </div>
        )}
      </div>
      <span style={{ fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", fontSize: 18, color: colors.text, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {Number(entryTotal(entry)).toFixed(2).replace(/\.00$/, "")}<span style={{ fontSize: 10, color: colors.sub, letterSpacing: "0.06em", marginLeft: 3, fontWeight: 500 }}>hr</span>
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 16 }}>
        <button className="action-btn" onClick={() => onEdit(entry.id)}>Edit</button>
        <div className="log-sep" />
        <button className="action-btn danger" onClick={() => onDelete(entry)}>Delete</button>
      </div>
    </div>
  );
}

// ── Inline Edit Row ──────────────────────────────────────────────
function EditRow({ entry, onSave, onCancel, dark, isDateTaken, onDuplicate, disabledDates }) {
  const init = normalizeEntry(entry);
  const [eDate, setEDate] = useState(entry.date);
  const [mode, setMode] = useState(entry.timeIn ? "time" : "manual");
  const [eReg, setEReg] = useState(String(init.hReg || ""));
  const [eOT, setEOT] = useState(String(init.hOT || ""));
  const [eMinus, setEMinus] = useState(String(init.hMinus || "0"));
  const [eIn, setEIn] = useState(entry.timeIn || defaultTimeIn());
  const [eOut, setEOut] = useState(entry.timeOut || defaultTimeOut());
  const [eErr, setEErr] = useState("");

  const regH = mode === "time" ? calcHoursFromTimes(eIn, eOut) : (parseFloat(eReg) || 0);
  const otH = parseFloat(eOT) || 0;
  const minusH = parseFloat(eMinus) || 0;
  const derivedH = Math.max(0, (regH + otH) - minusH);
  const dateTaken = Boolean(isDateTaken && isDateTaken(eDate, entry.id));

  const c = {
    text: dark ? "#efe9df" : "#1f2937",
    muted: dark ? "#8d96a0" : "#667085",
    sub: dark ? "#6d7682" : "#8b94a3",
    faint: dark ? "#232831" : "#e6dfd4",
    inputBorder: dark ? "#2a313d" : "#d8d1c7",
    btnBg: dark ? "#cfd7e2" : "#243b53",
    btnTx: dark ? "#14171c" : "#fbf8f2",
    rowBg: dark ? "#15181d" : "#fffdf9",
    accent: dark ? "#3d4654" : "#d9d1c6",
    tabActive: dark ? "#cfd7e2" : "#243b53",
    tabActiveTx: dark ? "#14171c" : "#fbf8f2",
    tabInactive: "transparent",
    tabBorder: dark ? "#2a313d" : "#ded6cb",
    panelBg: dark ? "#15181d" : "#fffdf9",
    panelBorder: dark ? "#242a33" : "#e7ded4",
  };

  const inputStyle = {
    background: dark ? "rgba(255,255,255,0.02)" : "#fff",
    border: `1px solid ${c.inputBorder}`,
    borderRadius: 14,
    outline: "none",
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    lineHeight: 1.5,
    color: c.text,
    padding: "10px 12px",
    width: "100%",
    transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s, background-color 0.15s",
  };

  const save = () => {
    if (!eDate) return setEErr("Date required.");
    if (dateTaken) {
      onDuplicate?.(eDate);
      return;
    }
    if (regH < 0 || regH > 24) return setEErr("Hours must be 0–24.");
    if (otH < 0 || otH > 24) return setEErr("OT hours must be 0–24.");
    if (minusH < 0 || minusH > 24) return setEErr("Minus hours must be 0–24.");
    if ((regH + otH) <= 0) return setEErr("Enter hours to log.");
    if (derivedH <= 0) return setEErr("Total after minus must be greater than 0.");
    if (derivedH > 24) return setEErr("Total hours cannot exceed 24.");
    if (mode === "time" && regH <= 0) return setEErr("Time out must be after time in.");

    onSave({
      ...entry,
      date: eDate,
      hReg: regH,
      hOT: otH,
      hMinus: minusH,
      timeIn: mode === "time" ? eIn : null,
      timeOut: mode === "time" ? eOut : null,
    });
  };

  return (
    <div style={{ padding: "18px 16px 16px", background: c.rowBg, border: `1px solid ${c.panelBorder}`, borderRadius: 20, boxShadow: dark ? "0 16px 44px rgba(0,0,0,0.22)" : "0 14px 34px rgba(36,40,50,0.06)", borderLeft: `2px solid ${c.accent}` }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, border: `1px solid ${c.tabBorder}`, width: "fit-content", borderRadius: 999, overflow: "hidden", background: c.panelBg }}>
        {[["manual", "Manual Hours"], ["time", "Time In / Out"]].map(([val, lbl]) => (
          <button key={val} onClick={() => setMode(val)} style={{
            background: mode === val ? c.tabActive : c.tabInactive,
            color: mode === val ? c.tabActiveTx : c.sub,
            border: "none", padding: "8px 16px", fontSize: 9,
            letterSpacing: "0.1em", textTransform: "uppercase",
            fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", cursor: "pointer", transition: "all 0.15s",
          }}>{lbl}</button>
        ))}
      </div>

      {/* Date */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 5, fontFamily: "'Geist Mono',monospace" }}>Date</div>
        <CalendarField value={eDate} onChange={setEDate} maxDate={todayStr()} dark={dark} compact disabledDates={disabledDates} />
      </div>

      {dateTaken && (
        <div style={{ border: `1px solid ${c.faint}`, borderRadius: 16, padding: "12px 14px", marginBottom: 14, background: dark ? "rgba(255,255,255,0.03)" : "#faf7f0" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
          <div style={{ fontSize: 12, color: c.sub, lineHeight: 1.6, letterSpacing: "0.01em" }}>
            This date is already used in History. You can't save a duplicate date. Edit the existing entry instead, or delete it then add a new one.
          </div>
        </div>
      )}

      {mode === "manual" ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Hours</div>
          <input type="number" value={eReg} min="0" max="24" step="0.5" style={inputStyle}
            onChange={e => setEReg(e.target.value)}
            onFocus={e => e.target.style.borderColor = c.text}
            onBlur={e => e.target.style.borderColor = c.inputBorder}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} />
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
            {[4, 6, 7, 8, 9].map(h => <Chip key={h} label={`${h}h`} active={eReg === String(h)} onClick={() => setEReg(String(h))} dark={dark} />)}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>Time In / Out</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>
            <TimePicker value={eIn} onChange={setEIn} dark={dark} label="Time In" />
            <TimePicker value={eOut} onChange={setEOut} dark={dark} label="Time Out" />
          </div>
          {regH > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${c.faint}`, paddingTop: 10, color: c.muted }}>
              <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace" }}>Total Hours</span>
              <span style={{ fontSize: 12, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", letterSpacing: "0.02em" }}>
                = {regH % 1 === 0 ? regH : regH.toFixed(2)} hrs
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>OT hours</div>
        <input type="number" value={eOT} min="0" max="24" step="0.5" style={inputStyle}
          onChange={e => setEOT(e.target.value)}
          onFocus={e => e.target.style.borderColor = c.text}
          onBlur={e => e.target.style.borderColor = c.inputBorder}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Minus hours</div>
        <input type="number" value={eMinus} min="0" max="24" step="0.5" style={inputStyle}
          onChange={e => setEMinus(e.target.value)}
          onFocus={e => e.target.style.borderColor = c.text}
          onBlur={e => e.target.style.borderColor = c.inputBorder}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }} />
      </div>

      {derivedH > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${c.faint}`, paddingTop: 10, marginBottom: 12, color: c.muted }}>
          <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Geist Mono',monospace" }}>Total Hours</span>
          <span style={{ fontSize: 12, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", letterSpacing: "0.02em" }}>
            = {derivedH % 1 === 0 ? derivedH : derivedH.toFixed(2)} hrs
          </span>
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

  const BULK_OT_WEEKDAY_OPTIONS = [
    [1, "Mon"],
    [2, "Tue"],
    [3, "Wed"],
    [4, "Thu"],
    [5, "Fri"],
    [6, "Sat"],
    [0, "Sun"],
  ];

  const savedGoal = loadGoal();

  // Single entry
  const [date, setDate] = useState(todayStr());
  const [entryMode, setEntryMode] = useState("manual"); // "manual" | "time"
  const [hrs, setHrs] = useState("");
  const [otHours, setOtHours] = useState("");
  const [minusHours, setMinusHours] = useState("0");
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
  const [bOtHrs, setBOtHrs] = useState("0");
  const [bOtDays, setBOtDays] = useState(() => BULK_OT_WEEKDAY_OPTIONS.map(([d]) => d));
  const [bMinusHrs, setBMinusHrs] = useState("0");
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
  const [showLogForm, setShowLogForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [goal, setGoal] = useState(savedGoal ?? GOAL);
  const [goalMode, setGoalMode] = useState(savedGoal == null ? "setup" : "change");
  const [showGoalModal, setShowGoalModal] = useState(savedGoal == null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleBulkToggle = () => {
    setBulkOpen(prev => {
      const next = !prev;
      if (next) setEditingId(null);
      return next;
    });
    setBErr("");
    setErr("");
  };

  const handleLogToggle = () => {
    setShowLogForm(prev => {
      const next = !prev;
      if (next) {
        setBulkOpen(false);
        setEditingId(null);
      }
      return next;
    });
    setErr("");
    setBErr("");
  };

  const handleOpenReset = () => {
    setShowResetConfirm(true);
  };

  const handleOpenGoalChange = () => {
    setGoalMode("change");
    setShowGoalModal(true);
  };

  const handleConfirmReset = () => {
    setShowResetConfirm(false);
    setGoalMode("reset");
    setShowGoalModal(true);
  };

  const handleSaveGoal = (nextGoal) => {
    try { localStorage.setItem(GOAL_KEY, String(nextGoal)); } catch {}
    setGoal(nextGoal);
    setShowGoalModal(false);

    if (goalMode === "reset") {
      setEntries([]);
      setDate(todayStr());
      setEntryMode("manual");
      setHrs("");
      setOtHours("");
      setMinusHours("0");
      setTimeIn(defaultTimeIn());
      setTimeOut(defaultTimeOut());
      setBulkOpen(false);
      setEditingId(null);
      setShowLogForm(false);
      setShowHistory(false);
      setConfirmDelete(null);
      setDupNotice(null);
      setErr("");
      setBErr("");
    }
  };

  const startEdit = (id) => {
    setBulkOpen(false);
    setShowLogForm(false);
    setEditingId(id);
  };

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {} }, [entries]);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.body.style.background = dark ? "#0e0e0e" : "#f7f6f3";
    document.body.style.color = dark ? "#d8d5cf" : "#111";
  }, [theme, dark]);

  const total = entries.reduce((s, e) => s + entryTotal(e), 0);
  const rem = Math.max(0, goal - total);
  const pct = Math.min(100, (total / goal) * 100);
  const done = total >= goal;
  const n = (v) => v % 1 === 0 ? v : v.toFixed(2);

  const usedDates = new Set(entries.map(e => e.date));
  const isDateTaken = useCallback((d, excludeId) => {
    if (!d) return false;
    const ex = excludeId == null ? null : String(excludeId);
    return entries.some(e => e.date === d && String(e.id) !== ex);
  }, [entries]);

  const derivedH = entryMode === "time" ? calcHoursFromTimes(timeIn, timeOut) : 0;
  const bDerivedH = bMode === "time" ? calcHoursFromTimes(bTimeIn, bTimeOut) : 0;

  const singleRegH = entryMode === "time" ? derivedH : (parseFloat(hrs) || 0);
  const singleOtH = parseFloat(otHours) || 0;
  const singleMinusH = parseFloat(minusHours) || 0;
  const singleTotalH = Math.max(0, (singleRegH + singleOtH) - singleMinusH);

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

  const dailyTotals = entries.reduce((m, e) => {
    const t = entryTotal(e);
    if (t <= 0) return m;
    m.set(e.date, (m.get(e.date) || 0) + t);
    return m;
  }, new Map());
  const avgPerDay = dailyTotals.size > 0 ? (total / dailyTotals.size) : 0;

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const nextWorkdayStart = () => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    while (isWeekend(d)) d.setDate(d.getDate() + 1);
    return d;
  };
  const addBusinessDays = (start, days) => {
    const d = new Date(start);
    for (let i = 0; i < days; i++) {
      d.setDate(d.getDate() + 1);
      while (isWeekend(d)) d.setDate(d.getDate() + 1);
    }
    return d;
  };
  const estimateCompletion = () => {
    if (rem <= 0) return null;
    if (!(avgPerDay > 0)) return null;

    const daysNeeded = rem / avgPerDay;
    let wholeDays = Math.floor(daysNeeded);
    let frac = daysNeeded - wholeDays;
    if (frac === 0) {
      frac = 1;
      wholeDays = Math.max(0, wholeDays - 1);
    }

    const start = nextWorkdayStart();
    const day = addBusinessDays(start, wholeDays);
    const ms = (frac * avgPerDay) * 60 * 60 * 1000;
    const est = new Date(day.getTime() + ms);
    while (isWeekend(est)) est.setDate(est.getDate() + 1);
    return est;
  };

  const eta = estimateCompletion();

  const add = () => {
    if (!date) return setErr("Date required.");
    if (usedDates.has(date)) {
      setErr("");
      openDupModal(date, "single");
      return;
    }
    if (singleRegH < 0 || singleRegH > 24) return setErr("Hours must be 0–24.");
    if (singleOtH < 0 || singleOtH > 24) return setErr("OT hours must be 0–24.");
    if (singleMinusH < 0 || singleMinusH > 24) return setErr("Minus hours must be 0–24.");
    if ((singleRegH + singleOtH) <= 0) return setErr("Enter hours to log.");
    if (entryMode === "time" && singleRegH <= 0) return setErr("Time out must be after time in.");
    if (singleTotalH <= 0) return setErr("Total after minus must be greater than 0.");
    if (singleTotalH > 24) return setErr("Total hours cannot exceed 24.");
    setErr("");
    setEntries(p => [...p, {
      id: crypto.randomUUID(),
      date,
      hReg: singleRegH,
      hOT: singleOtH,
      hMinus: singleMinusH,
      timeIn: entryMode === "time" ? timeIn : null,
      timeOut: entryMode === "time" ? timeOut : null,
    }]);
    setHrs("");
    setOtHours("");
    setMinusHours("0");
    setDate(todayStr());
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
  const bulkRegH = bMode === "time" ? bDerivedH : (parseFloat(bHrs) || 0);
  const bulkOtH = parseFloat(bOtHrs) || 0;
  const bulkMinusH = parseFloat(bMinusHrs) || 0;
  const otAppliesBulk = useCallback((dateStr) => {
    const day = parseLocal(dateStr).getDay();
    return bOtDays.includes(day);
  }, [bOtDays]);

  const bulkTotal = bulkDates.reduce((sum, d) => {
    const dayOt = otAppliesBulk(d) ? bulkOtH : 0;
    const perDay = Math.max(0, (bulkRegH + dayOt) - bulkMinusH);
    return sum + perDay;
  }, 0);
  const bulkDupCount = bulkDates.reduce((acc, d) => acc + (usedDates.has(d) ? 1 : 0), 0);

  const commitBulk = () => {
    if (!bStart || !bEnd) return setBErr("Select start and end dates.");
    if (parseLocal(bStart) > parseLocal(bEnd)) return setBErr("Start must be before end.");
    if (bulkRegH < 0 || bulkRegH > 24) return setBErr("Hours must be 0–24.");
    if (bulkOtH < 0 || bulkOtH > 24) return setBErr("OT hours must be 0–24.");
    if (bulkMinusH < 0 || bulkMinusH > 24) return setBErr("Minus hours must be 0–24.");
    if (bulkOtH > 0 && bOtDays.length === 0) return setBErr("Select at least one weekday for OT, or set OT hours to 0.");
    if ((bulkRegH + bulkOtH) <= 0) return setBErr("Enter hours to log.");
    if (bMode === "time" && bulkRegH <= 0) return setBErr("Time out must be after time in.");
    for (const d of bulkDates) {
      const dayOt = otAppliesBulk(d) ? bulkOtH : 0;
      const perDay = (bulkRegH + dayOt) - bulkMinusH;
      if (perDay <= 0) return setBErr("Total after minus must be greater than 0 for every day in the range.");
      if (perDay > 24) return setBErr("Hours per day cannot exceed 24.");
    }
    if (bulkDates.length === 0) return setBErr("No valid days in range.");
    if (bulkDupCount > 0) {
      setBErr("");
      openDupModal(null, "bulk");
      return;
    }
    setBErr("");
    setEntries(p => [...p, ...bulkDates.map(d => ({
      id: crypto.randomUUID(),
      date: d,
      hReg: bulkRegH,
      hOT: otAppliesBulk(d) ? bulkOtH : 0,
      hMinus: bulkMinusH,
      timeIn: bMode === "time" ? bTimeIn : null,
      timeOut: bMode === "time" ? bTimeOut : null,
    }))]);
    setBStart(""); setBEnd(""); setBHrs("8");
    setBOtHrs("0");
    setBOtDays(BULK_OT_WEEKDAY_OPTIONS.map(([d]) => d));
    setBMinusHrs("0");
    setBFlash(true); setTimeout(() => { setBFlash(false); setBulkOpen(false); }, 900);
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const c = {
    text: dark ? "#efe9df" : "#1f2937",
    muted: dark ? "#8d96a0" : "#667085",
    sub: dark ? "#6d7682" : "#8b94a3",
    faint: dark ? "#232831" : "#e6dfd4",
    inputBorder: dark ? "#2a313d" : "#d8d1c7",
    btnBg: dark ? "#cfd7e2" : "#243b53",
    btnTx: dark ? "#14171c" : "#fbf8f2",
    modeBg: dark ? "#f1c97a" : "#1f2d3d",
    modeBorder: dark ? "#e3b34c" : "#111c28",
    modeTx: dark ? "#1b1f26" : "#f7f4ee",
    modeShadow: dark ? "0 10px 22px rgba(241, 201, 122, 0.22)" : "0 10px 22px rgba(31, 45, 61, 0.18)",
    panelBg: dark ? "#15181d" : "#fffdf9",
    panelBorder: dark ? "#242a33" : "#e7ded4",
    previewBg: dark ? "#101317" : "#faf6ef",
    tabActive: dark ? "#cfd7e2" : "#243b53",
    tabActiveTx: dark ? "#14171c" : "#fbf8f2",
    tabBorder: dark ? "#2a313d" : "#ded6cb",
  };

  const shellStyle = {
    maxWidth: 760,
    margin: "0 auto",
  };

  const surfaceStyle = {
    background: c.panelBg,
    border: `1px solid ${c.panelBorder}`,
    borderRadius: 24,
    boxShadow: dark ? "0 22px 60px rgba(0,0,0,0.32)" : "0 18px 48px rgba(36,40,50,0.10)",
  };

  const surfacePaddingStyle = {
    padding: 24,
  };

  const displayStyle = {
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
    letterSpacing: "-0.06em",
    lineHeight: 0.92,
    color: c.text,
    fontVariantNumeric: "tabular-nums",
  };

  const sectionLabelStyle = {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: c.sub,
  };

  const bodyNoteStyle = {
    fontSize: 13,
    lineHeight: 1.7,
    letterSpacing: "0.01em",
    color: c.sub,
  };

  const dividerStyle = {
    height: 1,
    background: c.faint,
    margin: "40px 0",
  };

  const inputStyle = {
    background: dark ? "rgba(255,255,255,0.02)" : "#fff",
    border: `1px solid ${c.inputBorder}`,
    borderRadius: 16,
    outline: "none",
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
    fontSize: 15,
    lineHeight: 1.5,
    letterSpacing: "0.01em",
    color: c.text,
    padding: "12px 14px",
    width: "100%",
    transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s, background-color 0.15s",
  };

  const TabBar = ({ value, onChange, options }) => (
    <div style={{ display: "flex", border: `1px solid ${c.tabBorder}`, width: "fit-content", marginBottom: 20, borderRadius: 999, overflow: "hidden", background: c.panelBg }}>
      {options.map(([val, lbl]) => (
        <button key={val} onClick={() => onChange(val)} style={{
          background: value === val ? c.tabActive : "transparent",
          color: value === val ? c.tabActiveTx : c.sub,
          border: "none", padding: "9px 18px", fontSize: 10,
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif", cursor: "pointer", transition: "all 0.15s",
        }}>{lbl}</button>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Geist+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Inter, 'Segoe UI', system-ui, sans-serif; font-size: 16px; line-height: 1.6; letter-spacing: 0.01em; -webkit-font-smoothing: antialiased; transition: background 0.25s, color 0.25s; }
        button { cursor: pointer; font-family: Inter, 'Segoe UI', system-ui, sans-serif; }
        input[type="number"] { -webkit-appearance: none; appearance: none; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input::placeholder { color: ${c.sub}; }
        .log-item { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid ${c.faint}; transition: opacity 0.26s; }
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

      {showResetConfirm && (
        <ResetConfirmModal
          onConfirm={handleConfirmReset}
          onCancel={() => setShowResetConfirm(false)}
          dark={dark}
        />
      )}

      {showGoalModal && (
        <GoalModal
          mode={goalMode}
          value={goal}
          onSave={handleSaveGoal}
          onCancel={() => setShowGoalModal(false)}
          dark={dark}
        />
      )}

      <div className="wrap app-shell" style={{ ...shellStyle, padding: "88px 28px 120px" }}>

        {/* Top bar */}
        <div className="app-topbar" style={{ marginBottom: 56, alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="app-overline" style={{ color: c.muted }}>OJT Progress</span>
            <div style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.01em", color: c.sub }}>
              Target {goal} hours
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", alignSelf: "flex-start", marginLeft: "auto", padding: 6, borderRadius: 999, border: `1px solid ${c.faint}`, background: dark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.72)" }}>
            <button onClick={handleOpenGoalChange} style={{
              background: c.btnBg, border: `1px solid ${c.btnBg}`, color: c.btnTx,
              padding: "8px 12px", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
              borderRadius: 999,
              transition: "all 0.15s",
              boxShadow: dark ? "0 10px 24px rgba(0,0,0,0.18)" : "0 8px 18px rgba(36,40,50,0.08)",
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >Change hours</button>
            <button onClick={handleOpenReset} style={{
              background: "transparent", border: `1px solid ${c.faint}`, color: c.sub,
              padding: "8px 12px", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
              borderRadius: 999,
              transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = c.text; e.currentTarget.style.color = c.text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = c.faint; e.currentTarget.style.color = c.sub; }}
            >Reset</button>
            <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")} style={{
              background: c.modeBg, border: `1px solid ${c.modeBorder}`, color: c.modeTx,
              padding: "8px 12px", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
              borderRadius: 999,
              transition: "all 0.15s",
              boxShadow: c.modeShadow,
            }}
              onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.98)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
            >{dark ? "Light" : "Dark"}</button>
          </div>
        </div>

        {/* Hero */}
        <div className="app-hero" style={{ marginBottom: 56 }}>
          <div className="hero-n app-hero-value" style={displayStyle}>
            {n(total)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.muted, marginTop: 14, letterSpacing: "0.01em" }}>
            of {goal} hours required
          </div>
        </div>

        {/* Progress */}
        <div className="app-surface app-surface--panel" style={{ ...surfaceStyle, ...surfacePaddingStyle, marginBottom: 56 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={sectionLabelStyle}>{pct.toFixed(1)}%</span>
            <span style={sectionLabelStyle}>{done ? "Complete" : `${n(rem)} remaining`}</span>
          </div>
          <div style={{ height: 10, background: dark ? "rgba(255,255,255,0.04)" : "#ece6dc", position: "relative", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: 10, background: c.btnBg, width: `${pct}%`, transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)", borderRadius: 999 }} />
          </div>
          <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${c.faint}`, marginTop: 20, paddingTop: 20, gap: 18 }}>
            <div>
              <div style={{ ...displayStyle, fontSize: 30, fontWeight: 700 }}>{entries.length}</div>
              <div style={sectionLabelStyle}>Sessions</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...displayStyle, fontSize: 30, fontWeight: 700 }}>
                {entries.length > 0 ? n(total / entries.length) : "—"}
              </div>
              <div style={sectionLabelStyle}>Avg / session</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${c.faint}`, marginTop: 20, paddingTop: 16 }}>
            <span style={sectionLabelStyle}>Estimated completion</span>
            <span style={{ fontSize: 12, letterSpacing: "0.02em", color: c.muted, fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif" }}>
              {eta
                ? eta.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" })
                : "—"}
            </span>
          </div>
          {done && <div style={{ ...sectionLabelStyle, borderTop: `1px solid ${c.faint}`, paddingTop: 16, marginTop: 20 }}>Requirement fulfilled</div>}
        </div>

        <div style={dividerStyle} />

        {/* Log Entry */}
        <div className="app-surface app-surface--panel" style={{ ...surfaceStyle, ...surfacePaddingStyle, marginBottom: 56, background: dark ? "#15181d" : "#fffdf9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={sectionLabelStyle}>Log Entry</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, letterSpacing: "0.01em", color: c.sub, marginTop: 6 }}>
                {showLogForm ? "Add a clean single log or switch to bulk entry." : "Hidden until you open it."}
              </div>
            </div>
            <button onClick={handleLogToggle} style={{
              flexShrink: 0,
              background: showLogForm ? c.btnBg : "transparent", border: `1px solid ${showLogForm ? c.btnBg : c.faint}`, padding: "8px 14px", fontSize: 10,
              letterSpacing: "0.1em", textTransform: "uppercase", color: showLogForm ? c.btnTx : c.sub,
              borderRadius: 999, transition: "all 0.15s", fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
            }}
              onMouseEnter={e => { if (!showLogForm) { e.currentTarget.style.color = c.text; e.currentTarget.style.borderColor = c.text; } }}
              onMouseLeave={e => { if (!showLogForm) { e.currentTarget.style.color = c.sub; e.currentTarget.style.borderColor = c.faint; } }}
            >{showLogForm ? "Hide log" : "Add log"}</button>
          </div>

          {!showLogForm ? (
            <div style={{ padding: "14px 0 2px", color: c.sub, fontSize: 12, lineHeight: 1.6, letterSpacing: "0.01em" }}>
              Tap <span style={{ color: c.text }}>Add log</span> when you need to enter a new session.
            </div>
          ) : bulkOpen ? (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button onClick={handleBulkToggle} style={{
                  background: c.btnBg,
                  border: `1px solid ${c.btnBg}`,
                  padding: "8px 14px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: c.btnTx,
                  borderRadius: 999,
                  transition: "all 0.15s",
                  fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                  boxShadow: dark ? "0 10px 24px rgba(0,0,0,0.25)" : "0 10px 22px rgba(36,40,50,0.08)",
                }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >Bulk add</button>
              </div>

              <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${c.faint}`, borderRadius: 18, background: dark ? "rgba(255,255,255,0.015)" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, fontFamily: "'Geist Mono',monospace" }}>Bulk Add</div>
                    <div style={{ fontSize: 12, lineHeight: 1.6, letterSpacing: "0.01em", color: c.sub, marginTop: 4 }}>
                      Add a range of past dates using the same theme as the single entry form.
                    </div>
                  </div>
                  <TabBar value={bMode} onChange={setBMode} options={[['manual','Manual Hours'],['time','Time In / Out']]} />
                </div>

                <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <CalendarField value={bStart} onChange={v => { setBStart(v); if (bEnd && parseLocal(v) > parseLocal(bEnd)) setBEnd(""); }} maxDate={todayStr()} dark={dark} label="Start date" />
                  <CalendarField value={bEnd} onChange={v => { if (!bStart || parseLocal(v) >= parseLocal(bStart)) { setBEnd(v); setBErr(""); } else setBErr("End must be after start."); }} maxDate={todayStr()} dark={dark} label="End date" />
                </div>
              </div>

              {bulkDupCount > 0 && (
                <div style={{ border: `1px solid ${c.faint}`, padding: "12px 14px", marginBottom: 16, background: c.previewBg, borderRadius: 16 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
                  <div style={{ fontSize: 11, color: c.sub, fontFamily: "'Geist Mono',monospace", letterSpacing: "0.02em", lineHeight: 1.4 }}>
                    {bulkDupCount} date{bulkDupCount === 1 ? " is" : "s are"} already used in History for this range. You can't bulk add duplicates. Edit the existing entries instead, or delete them then add again.
                  </div>
                </div>
              )}

              {bMode === 'manual' ? (
                <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${c.faint}`, borderRadius: 18, background: dark ? "rgba(255,255,255,0.015)" : "#fff" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Hours per day</div>
                  <input type="number" placeholder="8" value={bHrs} min="0" max="24" step="0.5"
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 10 }}>
                    <TimePicker value={bTimeIn} onChange={setBTimeIn} dark={dark} label="Time In" />
                    <TimePicker value={bTimeOut} onChange={setBTimeOut} dark={dark} label="Time Out" />
                  </div>
                  {bDerivedH > 0 && (
                    <div style={{ fontSize: 11, color: c.muted, fontFamily: "'Geist Mono',monospace", marginTop: 10 }}>
                      = {bDerivedH % 1 === 0 ? bDerivedH : bDerivedH.toFixed(2)} hrs / day
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${c.faint}`, borderRadius: 18, background: dark ? "rgba(255,255,255,0.015)" : "#fff" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>OT hours / day</div>
                <input type="number" placeholder="0" value={bOtHrs} min="0" max="24" step="0.5"
                  style={inputStyle}
                  onChange={e => setBOtHrs(e.target.value)}
                  onFocus={e => e.target.style.borderColor = c.text}
                  onBlur={e => e.target.style.borderColor = c.inputBorder} />

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>Apply OT on</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {BULK_OT_WEEKDAY_OPTIONS.map(([day, label]) => (
                      <Chip
                        key={day}
                        label={label}
                        active={bOtDays.includes(day)}
                        onClick={() => setBOtDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                        dark={dark}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${c.faint}`, borderRadius: 18, background: dark ? "rgba(255,255,255,0.015)" : "#fff" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Minus hours / day</div>
                <input type="number" placeholder="0" value={bMinusHrs} min="0" max="24" step="0.5"
                  style={inputStyle}
                  onChange={e => setBMinusHrs(e.target.value)}
                  onFocus={e => e.target.style.borderColor = c.text}
                  onBlur={e => e.target.style.borderColor = c.inputBorder} />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: c.sub, letterSpacing: "0.06em", userSelect: "none", marginBottom: 20, paddingLeft: 4 }}>
                <input type="checkbox" checked={bSkip} onChange={e => setBSkip(e.target.checked)} style={{ accentColor: c.text, width: 13, height: 13 }} />
                Skip weekends
              </label>

              {bStart && bEnd && bulkDates.length > 0 && (
                <div style={{ background: c.previewBg, padding: "12px 14px", marginBottom: 14, borderTop: `1px solid ${c.faint}` }}>
                  {[['Days', bulkDates.length], ['Hours to add', n(bulkTotal)], ['New total', n(Math.min(goal, total + bulkTotal))]].map(([lbl, val]) => (
                    <div key={lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub }}>{lbl}</span>
                      <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: c.text, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={commitBulk} style={{
                background: bFlash ? (dark ? "#888" : "#555") : c.btnBg,
                color: c.btnTx, border: "none", padding: "12px 0", width: "100%",
                fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "opacity 0.15s, background 0.2s",
                borderRadius: 999,
                boxShadow: dark ? "0 10px 24px rgba(0,0,0,0.22)" : "0 10px 22px rgba(36,40,50,0.08)",
              }}
                onMouseEnter={e => !bFlash && (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                {bFlash
                  ? `Added ${bulkDates.length} entries`
                  : `Add ${bulkDates.length > 0 ? bulkDates.length + " entr" + (bulkDates.length === 1 ? "y" : "ies") : "entries"}`}
              </button>
              {bErr && <div style={{ fontSize: 11, color: c.muted, marginTop: 10, letterSpacing: "0.04em" }}>{bErr}</div>}
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button onClick={handleBulkToggle} style={{
                  background: "transparent",
                  border: `1px solid ${c.faint}`,
                  padding: "8px 14px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: c.sub,
                  borderRadius: 999,
                  transition: "all 0.15s",
                  fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = c.text; e.currentTarget.style.borderColor = c.text; }}
                  onMouseLeave={e => { e.currentTarget.style.color = c.sub; e.currentTarget.style.borderColor = c.faint; }}
                >Bulk add</button>
              </div>

              <TabBar value={entryMode} onChange={setEntryMode} options={[['manual','Manual Hours'],['time','Time In / Out']]} />

              {/* Date */}
              <div style={{ marginBottom: 20 }}>
                <CalendarField value={date} onChange={setDate} maxDate={todayStr()} dark={dark} label="Date" disabledDates={usedDates} />
              </div>

              {date && usedDates.has(date) && (
                <div style={{ border: `1px solid ${c.faint}`, borderRadius: 16, padding: "14px 16px", marginBottom: 20, background: dark ? "rgba(255,255,255,0.03)" : "#faf7f0" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: c.muted, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Notice</div>
                  <div style={bodyNoteStyle}>
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

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>OT hours</div>
                    <input type="number" placeholder="0" value={otHours} min="0" max="24" step="0.5"
                      style={inputStyle}
                      onChange={e => setOtHours(e.target.value)}
                      onFocus={e => e.target.style.borderColor = c.text}
                      onBlur={e => e.target.style.borderColor = c.inputBorder}
                      onKeyDown={e => e.key === "Enter" && add()} />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Minus hours</div>
                    <input type="number" placeholder="0" value={minusHours} min="0" max="24" step="0.5"
                      style={inputStyle}
                      onChange={e => setMinusHours(e.target.value)}
                      onFocus={e => e.target.style.borderColor = c.text}
                      onBlur={e => e.target.style.borderColor = c.inputBorder}
                      onKeyDown={e => e.key === "Enter" && add()} />
                  </div>

                  {singleTotalH > 0 && (
                    <div style={{ fontSize: 12, color: c.muted, fontFamily: "'Geist Mono',monospace", marginTop: 12 }}>
                      = {singleTotalH % 1 === 0 ? singleTotalH : singleTotalH.toFixed(2)} hrs
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
                    <TimePicker value={timeIn} onChange={setTimeIn} dark={dark} label="Time In" />
                    <TimePicker value={timeOut} onChange={setTimeOut} dark={dark} label="Time Out" />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>OT hours</div>
                    <input type="number" placeholder="0" value={otHours} min="0" max="24" step="0.5"
                      style={inputStyle}
                      onChange={e => setOtHours(e.target.value)}
                      onFocus={e => e.target.style.borderColor = c.text}
                      onBlur={e => e.target.style.borderColor = c.inputBorder}
                      onKeyDown={e => e.key === "Enter" && add()} />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>Minus hours</div>
                    <input type="number" placeholder="0" value={minusHours} min="0" max="24" step="0.5"
                      style={inputStyle}
                      onChange={e => setMinusHours(e.target.value)}
                      onFocus={e => e.target.style.borderColor = c.text}
                      onBlur={e => e.target.style.borderColor = c.inputBorder}
                      onKeyDown={e => e.key === "Enter" && add()} />
                  </div>

                  {singleTotalH > 0 && (
                    <div style={{ fontSize: 12, color: c.muted, fontFamily: "'Geist Mono',monospace", marginTop: 12 }}>
                      = {singleTotalH % 1 === 0 ? singleTotalH : singleTotalH.toFixed(2)} hrs
                    </div>
                  )}
                </div>
              )}

              <button onClick={add} style={{
                background: flash ? (dark ? "#8690a1" : "#39526a") : c.btnBg,
                color: c.btnTx, border: "none", padding: "11px 20px", borderRadius: 999,
                fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "opacity 0.15s, background 0.2s",
              }}
                onMouseEnter={e => !flash && (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >{flash ? "Added" : "Add"}</button>
              {err && <div style={{ fontSize: 11, color: c.muted, marginTop: 12, letterSpacing: "0.04em" }}>{err}</div>}
            </>
          )}
        </div>

        <div style={{ height: 1, background: c.faint, marginBottom: 40 }} />

        {/* History */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.muted }}>History</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {sorted.length > 0 && <span style={{ fontSize: 10, color: c.sub, letterSpacing: "0.06em" }}>{sorted.length} {sorted.length === 1 ? "entry" : "entries"}</span>}
              <button
                onClick={() => setShowHistory(v => !v)}
                style={{
                  background: showHistory ? c.btnBg : "transparent",
                  color: showHistory ? c.btnTx : c.sub,
                  border: `1px solid ${c.faint}`,
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
                  cursor: "pointer",
                }}
              >
                {showHistory ? "Hide log" : "Show log"}
              </button>
            </div>
          </div>

          {!showHistory ? (
            <div style={{ fontSize: 12, color: c.sub, letterSpacing: "0.04em", padding: "12px 0 6px" }}>
              The log is hidden until you open it.
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ fontSize: 12, color: dark ? "#2e2e2e" : "#c8c5be", letterSpacing: "0.04em", padding: "20px 0" }}>No entries recorded.</div>
          ) : sorted.map(e => (
            <div key={e.id} style={{ marginBottom: 12 }}>
              {editingId === e.id ? (
                <EditRow
                  entry={e}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                  dark={dark}
                  isDateTaken={isDateTaken}
                  onDuplicate={(d) => openDupModal(d, "single")}
                  disabledDates={new Set(entries.filter(x => x.id !== e.id).map(x => x.date))}
                />
              ) : (
                <LogRow
                  entry={e}
                  colors={c}
                  removing={removing === e.id}
                  onEdit={startEdit}
                  onDelete={setConfirmDelete}
                />
              )}
            </div>
          ))}
        </div>

      </div>
    </>
  );
}