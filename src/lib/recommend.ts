import type { Course, Filters } from "../types";
import type { Program } from "../store";
import { courseHelpsItem, unmetItems, type ItemProgress } from "./requirements";
import { coursesConflict } from "./time";
import { overlapsBlock } from "./filters";
import { NO_AFTER_MIN, NO_BEFORE_MIN } from "../types";

export interface Rec {
  course: Course;
  score: number;
  reasons: string[];
  /** how many open sections of this course exist */
  sections: number;
}

interface Ctx {
  progress: ItemProgress[];
  majors: Program[];
  minors: Program[];
  interests: string[];
  /** active (non-tentative) sections */
  schedule: Course[];
  filters: Filters;
  completedCodes: Set<string>;
}

/** True if the section has no clash with My Schedule and respects the user's block-outs. */
export function fitsSchedule(c: Course, schedule: Course[], f: Filters): boolean {
  if (schedule.some((s) => coursesConflict(c, s))) return false;
  for (const b of f.blocks) if (overlapsBlock(c, b)) return false;
  for (const m of c.meetings) {
    if (m.days.length === 0 || m.end <= m.start) continue;
    if (f.noBefore && m.start < NO_BEFORE_MIN) return false;
    if (f.noAfter && m.end > NO_AFTER_MIN) return false;
    if (f.noFriday && m.days.includes("F")) return false;
  }
  return true;
}

const short = (t: string) => (t.length > 46 ? t.slice(0, 44) + "…" : t);

export function forYou(courses: Course[], ctx: Ctx): Rec[] {
  const unmet = unmetItems(ctx.progress);
  const inSchedule = new Set(ctx.schedule.map((s) => s.courseKey));
  const majorDepts = new Map<string, string>();
  ctx.majors.forEach((m) => m.depts.forEach((d) => majorDepts.set(d, m.name)));
  const minorDepts = new Map<string, string>();
  ctx.minors.forEach((m) => m.depts.forEach((d) => minorDepts.set(d, m.name)));
  const tags = ctx.interests.map((t) => t.toLowerCase().trim()).filter(Boolean);

  const best = new Map<string, Rec>();
  const openCount = new Map<string, number>();
  for (const c of courses) {
    if (!c.isOpen) continue;
    if (inSchedule.has(c.courseKey) || ctx.completedCodes.has(c.courseKey)) continue;
    if (!fitsSchedule(c, ctx.schedule, ctx.filters)) continue;
    openCount.set(c.courseKey, (openCount.get(c.courseKey) || 0) + 1);

    let score = 0;
    const reasons: string[] = [];
    let n = 0;
    for (const p of unmet) {
      if (!courseHelpsItem(c, p.item)) continue;
      const remaining = Math.max(1, p.needed - p.done - p.planned);
      score += 3 + Math.min(2, remaining * 0.5);
      if (n++ < 3) reasons.push(`Counts toward: ${short(p.item.title)}`);
    }
    const mj = majorDepts.get(c.dept);
    if (mj) { score += 4; reasons.push(`Your major: ${mj}`); }
    const mn = minorDepts.get(c.dept);
    if (mn) { score += 2.5; reasons.push(`Your minor: ${mn}`); }
    const hay = `${c.title} ${c.description}`.toLowerCase();
    let hits = 0;
    for (const t of tags) {
      if (c.title.toLowerCase().includes(t)) { score += 2; hits++; reasons.push(`Interest: ${t}`); }
      else if (hay.includes(t)) { score += 1; hits++; reasons.push(`Interest: ${t}`); }
      if (hits >= 3) break;
    }
    if (score <= 0) continue;
    score += Math.min(0.5, c.openSeats / 40); // tiny nudge toward roomier sections
    const prev = best.get(c.courseKey);
    if (!prev || score > prev.score) best.set(c.courseKey, { course: c, score, reasons, sections: 0 });
  }
  const out = [...best.values()].map((r) => ({ ...r, sections: openCount.get(r.course.courseKey) || 1 }));
  out.sort((a, b) => b.score - a.score || a.course.dept.localeCompare(b.course.dept) || a.course.num - b.course.num);
  return out;
}

export interface EasyOpts {
  majors: Program[];
  schedule: Course[];
  filters: Filters;
  maxWeeklyMin: number;
  hideConflicts: boolean;
  minCredit: number;
}

/**
 * Easy Electives are a heuristic, not a workload rating. A section qualifies when it has open
 * seats, a published description with NO prerequisite language, is outside your declared
 * major departments, and meets for a light number of minutes per week. Sections with no
 * description are left out because "no prerequisite language" cannot be claimed for them.
 */
export function easyElectives(courses: Course[], o: EasyOpts): Course[] {
  const majorDepts = new Set(o.majors.flatMap((m) => m.depts));
  const seen = new Set<string>();
  const out: Course[] = [];
  for (const c of courses) {
    if (!c.isOpen || !c.hasTimes) continue;
    if (!c.description.trim() || c.prereq) continue;
    if (majorDepts.has(c.dept) || c.senior) continue;
    if (c.courseCredit < o.minCredit) continue;
    if (c.weeklyMin > o.maxWeeklyMin) continue;
    if (o.hideConflicts && !fitsSchedule(c, o.schedule, o.filters)) continue;
    out.push(c);
  }
  out.sort((a, b) => a.weeklyMin - b.weeklyMin || a.dayCount - b.dayCount || b.openSeats - a.openSeats || a.dept.localeCompare(b.dept) || a.num - b.num);
  // one section per course
  return out.filter((c) => (seen.has(c.courseKey) ? false : (seen.add(c.courseKey), true)));
}
