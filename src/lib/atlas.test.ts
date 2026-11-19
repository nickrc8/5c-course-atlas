import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { normalizeAll, hasPrereqLanguage, isIntro, isSeniorLevel } from "./normalize";
import { applyFilters, facetCounts } from "./filters";
import { computeProgress, type CompletedCourse } from "./requirements";
import { buildIcs } from "./ics";
import { answerLocally, type AtlasContext } from "./localAtlas";
import { coursesConflict } from "./time";
import { forYou, easyElectives } from "./recommend";
import { defaultFilters, type Course, type Filters } from "../types";
import { mergeUserData, emptyUserData } from "../store";

const DIR = new URL("../../public/data/", import.meta.url);
const have = existsSync(new URL("sections-SP2027.json", DIR));
let courses: Course[] = [];
let areas: { area: string; description: string }[] = [];

beforeAll(() => {
  if (!have) return;
  courses = normalizeAll(JSON.parse(readFileSync(new URL("sections-SP2027.json", DIR), "utf8")).data);
  areas = JSON.parse(readFileSync(new URL("areas.json", DIR), "utf8")).data;
});

const F = (p: Partial<Filters>): Filters => ({ ...defaultFilters, ...p });
const ctx = { schedule: [] as Course[] };

describe.skipIf(!have)("real Hyperschedule data", () => {
  it("normalizes thousands of real sections with unique ids and only the five campuses", () => {
    expect(courses.length).toBeGreaterThan(1500);
    expect(new Set(courses.map((c) => c.id)).size).toBe(courses.length);
    expect(courses.every((c) => ["PO", "CM", "SC", "HM", "PZ"].includes(c.campus))).toBe(true);
    for (const c of courses) for (const m of c.meetings) { expect(Number.isFinite(m.start)).toBe(true); expect(Number.isFinite(m.end)).toBe(true); }
  });

  it("open seats filter only returns sections that really have open seats", () => {
    const r = applyFilters(courses, F({ openOnly: true }), ctx);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => c.seatsTotal - c.seatsFilled > 0 && c.status !== "C")).toBe(true);
  });

  it("presets: nothing before 10, nothing after 4, no Friday", () => {
    const r = applyFilters(courses, F({ noBefore: true, noAfter: true, noFriday: true }), ctx);
    expect(r.length).toBeGreaterThan(100);
    for (const c of r) for (const m of c.meetings) {
      if (!m.days.length || m.end <= m.start) continue; // no posted time
      expect(m.start).toBeGreaterThanOrEqual(600);
      expect(m.end).toBeLessThanOrEqual(960);
      expect(m.days).not.toContain("F");
    }
  });

  it("custom blocked window hides every overlapping section", () => {
    const b = { id: "x", days: ["T", "R"], start: 14 * 60, end: 16 * 60 };
    const r = applyFilters(courses, F({ blocks: [b] }), ctx);
    expect(r.length).toBeLessThan(courses.length);
    for (const c of r) for (const m of c.meetings) {
      if (m.days.some((d) => b.days.includes(d))) expect(m.start >= b.end || m.end <= b.start).toBe(true);
    }
  });

  it("multi-select requirement categories: ANY is a superset of ALL", () => {
    const any = applyFilters(courses, F({ reqs: ["5HUM", "5IUG"], reqMode: "any" }), ctx);
    const all = applyFilters(courses, F({ reqs: ["5HUM", "5IUG"], reqMode: "all" }), ctx);
    expect(all.length).toBeGreaterThan(0);
    expect(any.length).toBeGreaterThan(all.length);
    expect(all.every((c) => c.areas.includes("5HUM") && c.areas.includes("5IUG"))).toBe(true);
    expect(any.every((c) => c.areas.includes("5HUM") || c.areas.includes("5IUG"))).toBe(true);
  });

  it("field-specific intro exclusion hides intro CSCI and MATH but keeps intro ART/PHIL", () => {
    const r = applyFilters(courses, F({ introDepts: ["CSCI", "MATH"] }), ctx);
    expect(r.some((c) => c.intro && (c.dept === "CSCI" || c.dept === "MATH"))).toBe(false);
    expect(r.some((c) => c.intro && (c.dept === "ART" || c.dept === "PHIL"))).toBe(true);
    expect(r.some((c) => !c.intro && c.dept === "CSCI")).toBe(true);
  });

  it("senior seminar / capstone exclusion removes thesis-type sections", () => {
    const withSenior = courses.filter((c) => c.senior);
    expect(withSenior.length).toBeGreaterThan(20);
    const r = applyFilters(courses, F({ excludeSenior: true }), ctx);
    expect(r.some((c) => c.senior)).toBe(false);
    expect(r.length).toBe(courses.length - withSenior.length);
  });

  it("search finds by code, professor and description keyword", () => {
    const sample = courses.find((c) => c.instructors.length && c.description)!;
    expect(applyFilters(courses, F({ q: sample.code.split(" ").slice(0, 2).join(" ").toLowerCase() }), ctx).some((c) => c.id === sample.id)).toBe(true);
    expect(applyFilters(courses, F({ q: sample.instructors[0] }), ctx).some((c) => c.id === sample.id)).toBe(true);
    expect(applyFilters(courses, F({ q: "qualitative comparative" }), ctx).length).toBeGreaterThan(0);
  });

  it("facet counts agree with the filtered result length", () => {
    const f = F({ openOnly: true, noFriday: true });
    const counts = facetCounts(courses, f, ctx, "campuses", (c) => [c.campus]);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(applyFilters(courses, f, ctx).length);
  });

  it("conflict detection: same slot clashes, first-half vs second-half does not", () => {
    const timed = courses.filter((c) => c.hasTimes && !c.half);
    const a = timed[0];
    const twin: Course = { ...a, id: a.id + "-twin" };
    expect(coursesConflict(a, twin)).toBe(true);
    const p1: Course = { ...a, id: "p1", endDate: 20270301 };
    const p2: Course = { ...a, id: "p2", startDate: 20270302 };
    expect(coursesConflict(p1, p2)).toBe(false);
  });

  it("every term area tag used in requirement definitions exists in the real data", async () => {
    const { COLLEGE_REQS } = await import("./reqdata");
    const present = new Set(courses.flatMap((c) => c.areas));
    const missing: string[] = [];
    for (const col of Object.values(COLLEGE_REQS)) for (const it of col.items) {
      const ms = [...(it.matchers || []), ...(it.options || []).flatMap((o) => o.matchers)];
      for (const m of ms) for (const a of m.areas || []) if (!present.has(a)) missing.push(`${col.campus}:${it.id}:${a}`);
    }
    expect(missing).toEqual([]);
  });

  it("ICS export: valid structure and the first event lands on the right weekday", () => {
    const c = courses.find((x) => x.hasTimes && x.meetings.some((m) => m.days.join("") === "MW") && x.startDate && x.endDate)!;
    const ics = buildIcs([c]);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
    const ds = /DTSTART:(\d{4})(\d{2})(\d{2})T/.exec(ics)!;
    const d = new Date(Date.UTC(+ds[1], +ds[2] - 1, +ds[3])).getUTCDay();
    expect([1, 3]).toContain(d);
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });

  it("offline Atlas: every returned course is real and satisfies the parsed constraints", () => {
    const actx: AtlasContext = { college: "PZ", majors: [], minors: [], unmetTitles: [], unmetAreas: ["5HUM"], scheduleIds: [], blocks: [], termKey: "SP2027" };
    const a = answerLocally("Find me an open humanities class on Tu/Th after 11 AM with no prereqs", courses, areas, actx);
    expect(a.ids.length).toBeGreaterThan(0);
    const byId = new Map(courses.map((c) => [c.id, c]));
    for (const id of a.ids) {
      const c = byId.get(id)!;
      expect(c).toBeTruthy();
      expect(c.isOpen).toBe(true);
      expect(c.prereq).toBe(false);
      for (const m of c.meetings) { expect(m.start).toBeGreaterThanOrEqual(11 * 60); expect(m.days.every((d) => d === "T" || d === "R")).toBe(true); }
    }
  });

  it("offline Atlas: 'avoid intro ECON' removes only intro ECON", () => {
    const actx: AtlasContext = { college: "PZ", majors: [], minors: [], unmetTitles: [], unmetAreas: [], scheduleIds: [], blocks: [], termKey: "SP2027" };
    const a = answerLocally("upper-division electives that avoid intro econ", courses, areas, actx);
    const byId = new Map(courses.map((c) => [c.id, c]));
    expect(a.ids.length).toBeGreaterThan(0);
    for (const id of a.ids) expect(byId.get(id)!.intro).toBe(false);
  });

  it("offline Atlas: 'avoid intro ECON' alone keeps intro courses in other fields", () => {
    const actx: AtlasContext = { college: null, majors: [], minors: [], unmetTitles: [], unmetAreas: [], scheduleIds: [], blocks: [], termKey: "SP2027" };
    const a = answerLocally("open classes, avoid intro econ", courses, areas, actx);
    const byId = new Map(courses.map((c) => [c.id, c]));
    for (const id of a.ids) { const c = byId.get(id)!; expect(c.intro && c.dept === "ECON").toBe(false); }
  });

  it("For You never recommends a clashing or closed section", () => {
    const sched = courses.filter((c) => c.hasTimes && c.isOpen).slice(0, 3);
    const recs = forYou(courses, { progress: [], majors: [{ name: "Politics", depts: ["POLI"] }], minors: [], interests: ["film"], schedule: sched, filters: defaultFilters, completedCodes: new Set() });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) { expect(r.course.isOpen).toBe(true); for (const s of sched) expect(coursesConflict(r.course, s)).toBe(false); }
  });

  it("Easy Electives: open, described, no prereq language, outside the major, light", () => {
    const list = easyElectives(courses, { majors: [{ name: "CS", depts: ["CSCI"] }], schedule: [], filters: defaultFilters, maxWeeklyMin: 200, hideConflicts: false, minCredit: 1 });
    expect(list.length).toBeGreaterThan(10);
    for (const c of list) { expect(c.isOpen && !!c.description.trim() && !c.prereq && c.dept !== "CSCI" && c.weeklyMin <= 200).toBe(true); }
  });
});

describe("requirements engine", () => {
  const mk = (p: Partial<CompletedCourse> & { id: string; areas: string[] }): CompletedCourse => ({
    code: p.id, title: p.id, credits: 1, campus: "PZ", dept: "XXXX", num: 100, affil: "PZ", ...p,
  });
  const base = { overrides: {}, manualDone: {}, manualOptions: {}, extraCredits: 0, customReqs: [], planned: [] as Course[] };

  it("Pitzer: a course tagged IUG and IUL counts toward only one of them (exclusive group)", () => {
    const p = computeProgress({ ...base, college: "PZ", completed: [mk({ id: "a", areas: ["5IUG", "5IUL"] })] });
    const iug = p.find((x) => x.item.id === "pz-iug")!, iul = p.find((x) => x.item.id === "pz-iul")!;
    expect(iug.done + iul.done).toBe(1);
  });

  it("Pitzer: a second IUG+IUL course then fills the other slot", () => {
    const p = computeProgress({ ...base, college: "PZ", completed: [mk({ id: "a", areas: ["5IUG", "5IUL"] }), mk({ id: "b", areas: ["5IUG", "5IUL"] })] });
    expect(p.find((x) => x.item.id === "pz-iug")!.done).toBe(1);
    expect(p.find((x) => x.item.id === "pz-iul")!.done).toBe(1);
  });

  it("Pitzer: half-credit courses cannot count toward Breadth", () => {
    const p = computeProgress({ ...base, college: "PZ", completed: [mk({ id: "h", credits: 0.5, areas: ["5HUM"] })] });
    expect(p.find((x) => x.item.id === "pz-hum")!.done).toBe(0);
  });

  it("override replaces automatic matching", () => {
    const p = computeProgress({ ...base, college: "PZ", completed: [mk({ id: "z", areas: ["5HUM"] })], overrides: { z: ["pz-nat"] } });
    expect(p.find((x) => x.item.id === "pz-hum")!.done).toBe(0);
    expect(p.find((x) => x.item.id === "pz-nat")!.done).toBe(1);
  });

  it("planned courses count separately from completed", () => {
    const planned = [{ ...({} as Course), id: "p", code: "X", title: "X", dept: "PSYC", num: 10, affil: "PZ", campus: "PZ", courseCredit: 1, areas: ["5SOC"] } as unknown as Course];
    const p = computeProgress({ ...base, college: "PZ", completed: [], planned });
    const soc = p.find((x) => x.item.id === "pz-soc")!;
    expect(soc.done).toBe(0);
    expect(soc.planned).toBe(1);
    expect(soc.covered).toBe(false); // needs 2
  });

  it("CMC pick: social science needs 3 distinct fields", () => {
    const comp = [mk({ id: "g", campus: "CM", areas: ["3AMG"] }), mk({ id: "h", campus: "CM", areas: ["3HGE"] }), mk({ id: "h2", campus: "CM", areas: ["3HGE"] })];
    const soc = computeProgress({ ...base, college: "CM", completed: comp }).find((x) => x.item.id === "cm-soc")!;
    expect(soc.done).toBe(2);
    expect(soc.complete).toBe(false);
  });

  it("HM: concentration is the largest count in one department", () => {
    const c = (id: string, dept: string) => mk({ id, dept, campus: "HM", areas: ["4HSS"] });
    const p = computeProgress({ ...base, college: "HM", completed: [c("1", "ECON"), c("2", "ECON"), c("3", "ECON"), c("4", "HIST")] });
    expect(p.find((x) => x.item.id === "hm-conc")!.done).toBe(3);
    expect(p.find((x) => x.item.id === "hm-breadth")!.done).toBe(2);
  });

  it("custom major requirement matches by department and level, and extra credits count toward the total", () => {
    const custom = [{ id: "c1", scope: "major" as const, parent: "Politics", title: "Upper-division POLI", needed: 2, matchers: [{ dept: "POLI", minNum: 100 }] }];
    const comp = [mk({ id: "x", dept: "POLI", num: 120, areas: [] }), mk({ id: "y", dept: "POLI", num: 20, areas: [] })];
    const p = computeProgress({ ...base, college: "PZ", completed: comp, customReqs: custom, extraCredits: 4 });
    expect(p.find((x) => x.item.id === "c1")!.done).toBe(1);
    expect(p.find((x) => x.item.id === "pz-total")!.done).toBe(6);
  });
});

describe("text heuristics", () => {
  it("flags prerequisite language and ignores plain descriptions", () => {
    expect(hasPrereqLanguage("Prerequisite: MATH 031.")).toBe(true);
    expect(hasPrereqLanguage("Open only with permission of the instructor.")).toBe(true);
    expect(hasPrereqLanguage("A survey of film history and criticism.")).toBe(false);
  });
  it("intro and senior detection", () => {
    expect(isIntro(45, "Calculus")).toBe(true);
    expect(isIntro(150, "Introduction to Topology")).toBe(true);
    expect(isIntro(150, "Real Analysis")).toBe(false);
    expect(isSeniorLevel(191, "Anything", "")).toBe(true);
    expect(isSeniorLevel(120, "Senior Seminar in Politics", "")).toBe(true);
    expect(isSeniorLevel(120, "Public Policy", "")).toBe(false);
  });
});

describe("cloud merge", () => {
  it("unions lists and never drops data from either side", () => {
    const a = { ...emptyUserData(), updatedAt: 1, completed: [{ id: "a", code: "A", title: "A", credits: 1, campus: "" as const, dept: "A", num: 1, affil: "", areas: [] }], schedules: { SP2027: [{ id: "s1", active: true, label: "s1" }] } };
    const b = { ...emptyUserData(), updatedAt: 2, college: "PO" as const, completed: [{ id: "b", code: "B", title: "B", credits: 1, campus: "" as const, dept: "B", num: 1, affil: "", areas: [] }], schedules: { SP2027: [{ id: "s2", active: false, label: "s2" }] } };
    const m = mergeUserData(a, b);
    expect(m.completed.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(m.schedules.SP2027.map((e) => e.id).sort()).toEqual(["s1", "s2"]);
    expect(m.college).toBe("PO");
  });
});
