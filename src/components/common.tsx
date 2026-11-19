import { useEffect, type ReactNode } from "react";
import type { Campus, Course } from "../types";
import { CAMPUS_NAMES } from "../types";
import { isRealName } from "../lib/links";
import { useUI } from "../ui";
import { useStore } from "../store";
import { useData, useSchedule } from "../data";
import { coursesConflict } from "../lib/time";

export function CampusBadge({ campus }: { campus: Campus }) {
  return <span className={`badge campus-${campus}`} title={CAMPUS_NAMES[campus]}>{campus}</span>;
}

export function courseHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Instructors({ names }: { names: string[] }) {
  const openProf = useUI((s) => s.openProf);
  if (names.length === 0) return <span className="muted">Instructor TBA</span>;
  return (
    <>
      {names.map((n, i) => (
        <span key={n + i}>
          {isRealName(n) ? (
            <button className="link" onClick={(e) => { e.stopPropagation(); openProf(n); }} title={`Open professor card for ${n}`}>{n}</button>
          ) : (
            <span className="muted">{n}</span>
          )}
          {i < names.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

export function SeatPill({ c }: { c: Course }) {
  if (c.status === "C" && c.openSeats === 0) return <span className="pill pill-closed" title={`${c.seatsFilled}/${c.seatsTotal} filled`}>Closed</span>;
  if (c.openSeats === 0) return <span className="pill pill-closed" title={`${c.seatsFilled}/${c.seatsTotal} filled`}>Full</span>;
  if (c.status === "C") return <span className="pill pill-warn" title="Marked closed but seats are listed">Closed · {c.openSeats} listed</span>;
  const low = c.openSeats <= 3;
  return <span className={`pill ${low ? "pill-warn" : "pill-open"}`} title={`${c.seatsFilled}/${c.seatsTotal} filled`}>{c.openSeats} open</span>;
}

export function AddButton({ c, compact }: { c: Course; compact?: boolean }) {
  const { termKey } = useData();
  const add = useStore((s) => s.addToSchedule);
  const remove = useStore((s) => s.removeFromSchedule);
  const { entries, active } = useSchedule();
  const inSched = entries.some((e) => e.id === c.id);
  const clash = !inSched ? active.find((s) => coursesConflict(c, s)) : undefined;
  if (inSched) {
    return <button className="btn btn-done" onClick={(e) => { e.stopPropagation(); remove(termKey, c.id); }} title="Remove from My Schedule">{compact ? "✓ Added" : "✓ In schedule"}</button>;
  }
  return (
    <button
      className={`btn ${clash ? "btn-warn" : "btn-primary"}`}
      onClick={(e) => { e.stopPropagation(); add(termKey, c.id, `${c.code}: ${c.title}`); }}
      title={clash ? `Clashes with ${clash.code}. You can still add it.` : "Add to My Schedule"}
    >
      {clash ? "⚠ Add anyway" : "+ Add"}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-dot" /></span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}
