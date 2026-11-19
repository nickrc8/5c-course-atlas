import type { Course, Filters, Block } from "../types";
import { NO_AFTER_MIN, NO_BEFORE_MIN } from "../types";
import { coursesConflict } from "./time";

export function overlapsBlock(c: Course, b: Block): boolean {
  for (const m of c.meetings) {
    if (m.days.length === 0 || m.end <= m.start) continue;
    if (!m.days.some((d) => b.days.includes(d))) continue;
    if (m.start < b.end && b.start < m.end) return true;
  }
  return false;
}

export interface FilterCtx {
  /** active (non-tentative) sections in My Schedule */
  schedule: Course[];
}

export type Facet =
  | "campuses" | "depts" | "days" | "credits" | "reqs" | "none";

/** Returns true if the course passes every active filter except the one named in `skip`. */
export function matches(c: Course, f: Filters, ctx: FilterCtx, skip: Facet = "none"): boolean {
  if (f.q.trim()) {
    const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    for (const t of tokens) if (!c.searchText.includes(t)) return false;
  }
  if (skip !== "campuses" && f.campuses.length && !f.campuses.includes(c.campus)) return false;
  if (skip !== "depts" && f.depts.length && !f.depts.includes(c.dept)) return false;
  if (skip !== "days" && f.days.length) {
    // "Days" means: the section only meets on the chosen days. TBA sections are kept.
    for (const m of c.meetings) for (const d of m.days) if (!f.days.includes(d)) return false;
  }
  if (skip !== "credits" && f.credits.length && !f.credits.includes(c.credits)) return false;
  if (f.openOnly && !c.isOpen) return false;

  if (skip !== "reqs" && f.reqs.length) {
    if (f.reqMode === "any") {
      if (!f.reqs.some((r) => c.areas.includes(r))) return false;
    } else if (!f.reqs.every((r) => c.areas.includes(r))) return false;
  }

  // time-period exclusions (sections with no posted time are never hidden by these)
  for (const m of c.meetings) {
    if (m.days.length === 0 || m.end <= m.start) continue;
    if (f.noBefore && m.start < NO_BEFORE_MIN) return false;
    if (f.noAfter && m.end > NO_AFTER_MIN) return false;
    if (f.noFriday && m.days.includes("F")) return false;
  }
  for (const b of f.blocks) if (overlapsBlock(c, b)) return false;
  if (f.hideConflicts && ctx.schedule.some((s) => coursesConflict(c, s))) return false;

  if (f.excludeIntro && c.intro) return false;
  if (f.introDepts.length && c.intro && f.introDepts.includes(c.dept)) return false;
  if (f.excludeSenior && c.senior) return false;
  return true;
}

export function applyFilters(courses: Course[], f: Filters, ctx: FilterCtx): Course[] {
  return courses.filter((c) => matches(c, f, ctx));
}

/** Live facet counts: each facet is counted with every OTHER filter applied. */
export function facetCounts<K extends string | number>(
  courses: Course[], f: Filters, ctx: FilterCtx, facet: Exclude<Facet, "none">, keys: (c: Course) => K[],
): Map<K, number> {
  const out = new Map<K, number>();
  for (const c of courses) {
    if (!matches(c, f, ctx, facet)) continue;
    for (const k of keys(c)) out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

export type SortKey = "code" | "title" | "seats" | "time";
export function sortCourses(list: Course[], key: SortKey): Course[] {
  const out = [...list];
  const firstStart = (c: Course) => {
    const t = c.meetings.filter((m) => m.days.length && m.end > m.start);
    return t.length ? Math.min(...t.map((m) => m.start)) : 9999;
  };
  if (key === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else if (key === "seats") out.sort((a, b) => b.openSeats - a.openSeats);
  else if (key === "time") out.sort((a, b) => firstStart(a) - firstStart(b));
  return out;
}
