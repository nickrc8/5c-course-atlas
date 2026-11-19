import type { Campus, Course } from "../types";
import { COLLEGE_REQS, type Matcher, type ReqItem, type ReqOption } from "./reqdata";

/** A course the user finished (entered by them, or picked from the catalog). */
export interface CompletedCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
  campus: Campus | "";
  dept: string;
  num: number;
  affil: string;
  areas: string[];
  term?: string;
}

export interface CustomReq {
  id: string;
  scope: "major" | "minor";
  parent: string;
  title: string;
  needed: number;
  matchers: Matcher[];
}

export interface CourseRef {
  id: string;
  code: string;
  title: string;
  dept: string;
  num: number;
  affil: string;
  campus: string;
  credits: number;
  areas: string[];
  kind: "completed" | "planned";
}

export function refFromCompleted(c: CompletedCourse): CourseRef {
  return { id: c.id, code: c.code, title: c.title, dept: c.dept, num: c.num, affil: c.affil, campus: c.campus, credits: c.credits, areas: c.areas, kind: "completed" };
}
export function refFromCourse(c: Course): CourseRef {
  return { id: c.id, code: c.code, title: c.title, dept: c.dept, num: c.num, affil: c.affil, campus: c.campus, credits: c.courseCredit, areas: c.areas, kind: "planned" };
}

export function matchOne(r: CourseRef, m: Matcher): boolean {
  if (!m.areas && !m.dept && !m.affil && !m.campus && m.num === undefined && m.minNum === undefined && m.maxNum === undefined) return false;
  if (m.areas && !m.areas.some((a) => r.areas.includes(a))) return false;
  if (m.dept && r.dept !== m.dept) return false;
  if (m.affil && r.affil !== m.affil) return false;
  if (m.campus && r.campus !== m.campus) return false;
  if (m.num !== undefined && r.num !== m.num) return false;
  if (m.minNum !== undefined && r.num < m.minNum) return false;
  if (m.maxNum !== undefined && r.num > m.maxNum) return false;
  return true;
}
export const matchAny = (r: CourseRef, ms: Matcher[] | undefined) => !!ms && ms.some((m) => matchOne(r, m));

/** Can a course ever satisfy this item through automatic matching? */
function autoMatches(r: CourseRef, item: ReqItem): boolean {
  if (item.minCredit !== undefined && r.credits < item.minCredit) return false;
  if (item.kind === "pick") return !!item.options?.some((o) => matchAny(r, o.matchers));
  if (item.kind === "manual") return false;
  if (item.all) return true;
  return matchAny(r, item.matchers);
}

export interface OptionStatus { id: string; label: string; state: "done" | "planned" | "none"; manual: boolean }

export interface ItemProgress {
  item: ReqItem;
  /** for custom requirements, who owns it */
  custom?: CustomReq;
  needed: number;
  done: number;
  planned: number;
  doneRefs: CourseRef[];
  plannedRefs: CourseRef[];
  manualDone: boolean;
  options?: OptionStatus[];
  /** done + planned reaches the need */
  covered: boolean;
  complete: boolean;
  tracker: boolean;
}

export interface Inputs {
  college: Campus;
  completed: CompletedCourse[];
  planned: Course[];
  overrides: Record<string, string[]>;
  manualDone: Record<string, boolean>;
  /** option-level manual checkoffs, key "itemId:optionId" */
  manualOptions: Record<string, boolean>;
  extraCredits: number;
  customReqs: CustomReq[];
}

function customToItem(c: CustomReq): ReqItem {
  return { id: c.id, group: `${c.scope === "major" ? "Major" : "Minor"}: ${c.parent}`, title: c.title, kind: "count", needed: Math.max(1, c.needed), matchers: c.matchers, confidence: "official" };
}

export function computeProgress(inp: Inputs): ItemProgress[] {
  const college = COLLEGE_REQS[inp.college];
  const items: { item: ReqItem; custom?: CustomReq }[] = [
    ...college.items.map((item) => ({ item })),
    ...inp.customReqs.map((c) => ({ item: customToItem(c), custom: c })),
  ];
  const refs: CourseRef[] = [...inp.completed.map(refFromCompleted), ...inp.planned.map(refFromCourse)];

  // 1. decide which items each course counts for
  const assigned = new Map<string, CourseRef[]>(); // itemId -> refs
  const take = (id: string, r: CourseRef) => assigned.set(id, [...(assigned.get(id) || []), r]);
  const exclFill = new Map<string, number>(); // `${excl}|${itemId}` -> count

  const ordered = [...refs].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "completed" ? -1 : 1));
  for (const r of ordered) {
    const ov = inp.overrides[r.id];
    if (ov) {
      for (const id of ov) if (items.some((x) => x.item.id === id)) take(id, r);
      continue;
    }
    const used = new Set<string>(); // exclusive groups this course already counts in
    for (const { item } of items) {
      if (!autoMatches(r, item)) continue;
      if (item.excl) {
        if (used.has(item.excl)) continue;
        const k = `${item.excl}|${item.id}`;
        const filled = exclFill.get(k) || 0;
        const want = item.needed || 1;
        if (filled >= want) continue; // that slot is full; let it try the next item in the group
        exclFill.set(k, filled + 1);
        used.add(item.excl);
      }
      take(item.id, r);
    }
  }

  // 2. score each item
  return items.map(({ item, custom }) => {
    const refsFor = assigned.get(item.id) || [];
    const manualDone = !!inp.manualDone[item.id];
    const doneRefs = refsFor.filter((r) => r.kind === "completed");
    const plannedRefs = refsFor.filter((r) => r.kind === "planned");
    let done = 0, planned = 0, needed = item.needed;
    let options: OptionStatus[] | undefined;
    const tracker = item.kind === "tracker";

    const sumCredits = (rs: CourseRef[]) => Math.round(rs.reduce((t, r) => t + r.credits, 0) * 100) / 100;

    switch (item.kind) {
      case "count":
        done = doneRefs.length; planned = plannedRefs.length; break;
      case "tracker":
        done = doneRefs.length; planned = plannedRefs.length; needed = 0; break;
      case "credits": {
        done = sumCredits(doneRefs) + (item.all ? inp.extraCredits : 0);
        planned = sumCredits(plannedRefs);
        break;
      }
      case "distinctDept": {
        done = new Set(doneRefs.map((r) => r.dept)).size;
        planned = new Set([...doneRefs, ...plannedRefs].map((r) => r.dept)).size - done;
        break;
      }
      case "concentration": {
        const best = (rs: CourseRef[]) => {
          const m = new Map<string, number>();
          for (const r of rs) m.set(r.dept, (m.get(r.dept) || 0) + 1);
          return Math.max(0, ...m.values());
        };
        done = best(doneRefs);
        planned = best([...doneRefs, ...plannedRefs]) - done;
        break;
      }
      case "pick": {
        const opts = item.options || [];
        const st = (o: ReqOption): OptionStatus => {
          const manual = !!inp.manualOptions[`${item.id}:${o.id}`];
          const hitDone = doneRefs.some((r) => matchAny(r, o.matchers));
          const hitPlan = plannedRefs.some((r) => matchAny(r, o.matchers));
          return { id: o.id, label: o.label, manual: !!o.manual, state: manual || hitDone ? "done" : hitPlan ? "planned" : "none" };
        };
        options = opts.map(st);
        done = options.filter((o) => o.state === "done").length;
        planned = options.filter((o) => o.state === "planned").length;
        break;
      }
      case "manual":
        done = 0; planned = 0; needed = 1; break;
    }
    if (manualDone) { done = Math.max(done, needed); }
    done = Math.round(done * 100) / 100;
    planned = Math.round(planned * 100) / 100;
    const covered = !tracker && needed > 0 && done + planned >= needed;
    const complete = tracker ? manualDone : needed > 0 && done >= needed;
    return { item, custom, needed, done, planned, doneRefs, plannedRefs, manualDone, options, covered, complete, tracker };
  });
}

export function overall(progress: ItemProgress[]) {
  const countable = progress.filter((p) => !p.tracker);
  const complete = countable.filter((p) => p.complete).length;
  const covered = countable.filter((p) => p.covered).length;
  return { total: countable.length, complete, covered };
}

/** Items that are not yet completed AND not covered by the plan: what the user still needs to find. */
export function unmetItems(progress: ItemProgress[]): ItemProgress[] {
  return progress.filter((p) => !p.tracker && !p.covered && p.item.kind !== "manual");
}

/** Hyperschedule area codes that would help satisfy a set of items. */
export function areasForItem(item: ReqItem): string[] {
  const out = new Set<string>();
  for (const m of item.matchers || []) (m.areas || []).forEach((a) => out.add(a));
  for (const o of item.options || []) for (const m of o.matchers) (m.areas || []).forEach((a) => out.add(a));
  return [...out];
}

export function courseHelpsItem(c: Course, item: ReqItem): boolean {
  // "all courses count" items (total credits) say nothing about which course to pick
  if (item.all) return false;
  return autoMatches(refFromCourse(c), item);
}
