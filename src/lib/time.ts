import type { Course, Meeting } from "../types";

export function fmtTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export function fmtRange(start: number, end: number): string {
  const a = fmtTime(start);
  const b = fmtTime(end);
  // collapse a shared AM/PM: "9:45 – 11:00 AM"
  if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)} – ${b}`;
  return `${a} – ${b}`;
}

const DAY_ORDER = "MTWRFSU";
export function fmtDays(days: string[]): string {
  return [...days].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y)).join("");
}

export function fmtMeeting(m: Meeting): string {
  return `${fmtDays(m.days)} ${fmtRange(m.start, m.end)}`;
}

export function fmtMeetings(c: Course): string {
  const timed = c.meetings.filter((m) => m.days.length > 0 && m.end > m.start);
  if (timed.length === 0) return "Time TBA";
  return timed.map(fmtMeeting).join(" · ");
}

/** "7:30" or "14:05" (24 h) <-> minutes, for <input type="time"> */
export function toTimeInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function fromTimeInput(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  if (!a.days.some((d) => b.days.includes(d))) return false;
  return a.start < b.end && b.start < a.end;
}

/**
 * Do two sections clash? They must meet at the same time on a shared day AND be
 * running during the same dates (a first-half-semester course never clashes
 * with a second-half-semester course).
 */
export function coursesConflict(a: Course, b: Course): boolean {
  if (a.id === b.id) return false;
  if (a.endDate && b.startDate && (a.endDate < b.startDate || b.endDate < a.startDate)) return false;
  for (const m of a.meetings) {
    if (m.days.length === 0 || m.end <= m.start) continue;
    for (const n of b.meetings) {
      if (n.days.length === 0 || n.end <= n.start) continue;
      if (meetingsOverlap(m, n)) return true;
    }
  }
  return false;
}
