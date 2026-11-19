import type { Course } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");
const ICS_DAY: Record<string, string> = { M: "MO", T: "TU", W: "WE", R: "TH", F: "FR", S: "SA", U: "SU" };
const JS_DAY: Record<string, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** RFC 5545 line folding at 75 octets (approximated by characters). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

function ymd(n: number) {
  return { y: Math.floor(n / 10000), m: Math.floor((n % 10000) / 100), d: n % 100 };
}

/** First date on/after `start` that falls on one of the weekdays. */
function firstOccurrence(startNum: number, days: string[]): Date {
  const { y, m, d } = ymd(startNum);
  const base = new Date(Date.UTC(y, m - 1, d));
  const wanted = new Set(days.map((x) => JS_DAY[x]));
  for (let i = 0; i < 7; i++) {
    const t = new Date(base.getTime() + i * 86400000);
    if (wanted.has(t.getUTCDay())) return t;
  }
  return base;
}

/** Builds an .ics file of the given sections. Times are "floating" local times, so they show at the same wall-clock time in whatever zone the calendar uses (campus is Pacific). */
export function buildIcs(courses: Course[], calName = "5C Course Atlas schedule"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//5C Course Atlas//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(calName)}`,
  ];
  for (const c of courses) {
    c.meetings.forEach((m, i) => {
      const days = m.days.filter((d) => ICS_DAY[d]);
      if (days.length === 0 || m.end <= m.start || !c.startDate || !c.endDate) return;
      const first = firstOccurrence(c.startDate, days);
      const dateStr = `${first.getUTCFullYear()}${pad(first.getUTCMonth() + 1)}${pad(first.getUTCDate())}`;
      const t = (min: number) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
      const e = ymd(c.endDate);
      const until = `${e.y}${pad(e.m)}${pad(e.d)}T235959`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${c.id.replace(/[^A-Za-z0-9-]/g, "")}-${i}@5c-course-atlas`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dateStr}T${t(m.start)}`,
        `DTEND:${dateStr}T${t(m.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAY[d]).join(",")};UNTIL=${until}`,
        `SUMMARY:${esc(`${c.code} ${c.title}`)}`,
      );
      if (m.loc) lines.push(`LOCATION:${esc(m.loc)}`);
      lines.push(`DESCRIPTION:${esc(`${c.instructors.join(", ") || "Instructor TBA"} · Section ${String(c.section).padStart(2, "0")} · ${c.credits} credit(s)`)}`, "END:VEVENT");
    });
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(courses: Course[], filename: string) {
  const blob = new Blob([buildIcs(courses)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
