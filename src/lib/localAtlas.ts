import type { AreaInfo, Campus, Course } from "../types";
import { fmtTime } from "./time";
import { coursesConflict } from "./time";

/**
 * Offline fallback for Ask Atlas. This is NOT a language model: it is a keyword parser that
 * turns a request into filters over the real, loaded course data. It is used when the Edge
 * Function (Claude) is not configured or unreachable. Every course it returns is a real
 * section from the loaded term.
 */

export interface AtlasContext {
  college: Campus | null;
  majors: string[];
  minors: string[];
  unmetTitles: string[];
  unmetAreas: string[];
  scheduleIds: string[];
  blocks: { days: string[]; start: number; end: number }[];
  termKey: string;
}

export interface LocalAnswer { text: string; ids: string[] }

const STOP = new Set(("a an the and or of for to in on at me my i find show give want need looking class classes course courses some any that this with without " +
  "doesn't dont don't does not no clash clashes conflict conflicts schedule fits fit what which are is there open seat seats prereq prereqs prerequisite prerequisites " +
  "after before between morning afternoon evening upper division level lower avoid exclude intro introductory only please can could would like have has " +
  "tu th tue tues thu thurs thur tuesday thursday monday wednesday friday mon wed fri mwf tth unmet requirement requirements electives elective humanities " +
  "social science sciences quantitative writing arts fine").split(/\s+/));

const CONCEPTS: { re: RegExp; label: string; areas: string[] }[] = [
  { re: /\bhumanit(?:y|ies)\b/, label: "humanities", areas: ["5HUM", "2LT", "3LIT", "3PHI", "3REL", "1A1", "1A3"] },
  { re: /\bsocial sciences?\b|\bsocial\/behavioral\b/, label: "social science", areas: ["5SOC", "2SS", "3PSY", "3HGE", "1A2"] },
  { re: /\bnatural sciences?\b|\bnat(?:ural)? sci\b|\blab science\b/, label: "natural science", areas: ["5NAT", "2NS", "3SCI", "3LAB", "1A4"] },
  { re: /\bquant(?:itative)?\b|\bmath(?:ematical)? reasoning\b/, label: "quantitative reasoning", areas: ["5QUA", "2MTH", "3MAT", "1A5"] },
  { re: /\bfine arts?\b|\bcreative\b|\bperformance\b/, label: "fine arts", areas: ["2FA", "1A6", "5HUM"] },
  { re: /\bwriting[- ]intensive\b|\bwriting requirement\b/, label: "writing intensive", areas: ["5WRI", "1WIR", "4WRT"] },
];

const DAY_PATTERNS: { re: RegExp; days: string[] }[] = [
  { re: /\btu\/?th\b|\bt\/?th\b|\btth\b|\btues(?:day)?s?\s*(?:\/|and|&|,)?\s*thu(?:rs(?:day)?)?s?\b/, days: ["T", "R"] },
  { re: /\bm\/?w\/?f\b|\bmwf\b/, days: ["M", "W", "F"] },
  { re: /\bm\/?w\b|\bmon(?:day)?s?\s*(?:\/|and|&|,)?\s*wed(?:nesday)?s?\b/, days: ["M", "W"] },
];
const SINGLE_DAYS: [RegExp, string][] = [
  [/\bmon(?:day)?s?\b/, "M"], [/\btue(?:s|sday)?s?\b/, "T"], [/\bwed(?:nesday)?s?\b/, "W"], [/\bthu(?:r|rs|rsday)?s?\b/, "R"], [/\bfri(?:day)?s?\b/, "F"],
];

function hourToMin(h: number, mer: string | undefined, minute = 0): number {
  let hh = h;
  if (mer === "pm" && hh < 12) hh += 12;
  else if (mer === "am" && hh === 12) hh = 0;
  else if (!mer) { if (hh >= 1 && hh <= 7) hh += 12; } // "after 2" means 2 PM; "after 11" means 11 AM
  return hh * 60 + minute;
}
function parseClock(s: string): number | null {
  if (/\bnoon\b/.test(s)) return 12 * 60;
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/.exec(s);
  if (!m) return null;
  const mer = m[3]?.startsWith("a") ? "am" : m[3]?.startsWith("p") ? "pm" : undefined;
  return hourToMin(Number(m[1]), mer, m[2] ? Number(m[2]) : 0);
}

export function answerLocally(question: string, courses: Course[], areas: AreaInfo[], ctx: AtlasContext): LocalAnswer {
  const q = question.toLowerCase();
  const notes: string[] = [];
  let pool = courses;

  // dept aliases from real data
  const termDepts = new Set(courses.map((c) => c.dept));
  const deptWords = new Map<string, string>();
  for (const a of areas) {
    if (/^\d/.test(a.area) || !termDepts.has(a.area)) continue;
    deptWords.set(a.area.toLowerCase(), a.area);
    const first = a.description.toLowerCase().split(/[\s,/]+/)[0];
    if (first && first.length >= 5 && !deptWords.has(first)) deptWords.set(first, a.area);
  }
  const wordsIn = (s: string) => s.match(/[a-z/&-]+/g) || [];
  const conceptStripped = (s: string) => CONCEPTS.reduce((t, c) => t.replace(new RegExp(c.re.source, "g"), " "), s);
  const deptsMentioned = (s: string) => [...new Set(wordsIn(conceptStripped(s)).map((w) => deptWords.get(w)).filter(Boolean) as string[])];

  // "avoid intro ECON" hides intro courses only in those fields; "upper-division" hides all intro courses
  const avoidIntro = /(?:avoid|exclude|no|skip|without|not)\s+(?:the\s+)?intro(?:ductory)?(?:\s+level)?\s*([a-z\s,/&]*?)(?:\.|\?|$|\bclasses\b|\bcourses\b)/.exec(q);
  const upper = /\b(?:upper[- ]division|advanced|upper[- ]level)\b/.test(q);
  if (avoidIntro) {
    const d = deptsMentioned(avoidIntro[1]);
    if (d.length) { pool = pool.filter((c) => !(c.intro && d.includes(c.dept))); notes.push(`no intro ${d.join("/")}`); }
    else { pool = pool.filter((c) => !c.intro); notes.push("not intro-level"); }
  }
  if (upper) { pool = pool.filter((c) => !c.intro); notes.push("upper-division (number 100+, not intro-titled)"); }
  else if (!avoidIntro && /\bintro(?:ductory)?\b|\bbeginner\b/.test(q)) { pool = pool.filter((c) => c.intro); notes.push("intro-level"); }

  // days
  let days: string[] | null = null;
  for (const p of DAY_PATTERNS) if (p.re.test(q)) { days = p.days; break; }
  if (!days) {
    const found = SINGLE_DAYS.filter(([re]) => re.test(q)).map(([, d]) => d);
    if (found.length) days = found;
  }
  if (days) {
    const d = days;
    pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.days.every((x) => d.includes(x))));
    notes.push(`meets only ${days.join("")}`);
  }

  // times
  const after = /\bafter\s+((?:\d{1,2})(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|noon)/.exec(q);
  const before = /\bbefore\s+((?:\d{1,2})(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|noon)/.exec(q);
  if (after) { const t = parseClock(after[1]); if (t !== null) { pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.days.length === 0 || m.start >= t)); notes.push(`starts at or after ${fmtTime(t)}`); } }
  if (before) { const t = parseClock(before[1]); if (t !== null) { pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.days.length === 0 || m.end <= t)); notes.push(`ends by ${fmtTime(t)}`); } }
  if (/\bmorning\b/.test(q) && !after && !before) { pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.end <= 12 * 60 + 15)); notes.push("morning"); }
  if (/\bafternoon\b/.test(q) && !after && !before) { pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.start >= 12 * 60)); notes.push("afternoon"); }
  if (/\bevening\b/.test(q)) { pool = pool.filter((c) => c.hasTimes && c.meetings.every((m) => m.start >= 17 * 60)); notes.push("evening"); }

  // seats / prereqs
  if (/\bopen\b|\bseats?\b|\bavailable\b/.test(q)) { pool = pool.filter((c) => c.isOpen); notes.push("open seats"); }
  if (/\bno[- ]prereqs?\b|\bwithout prereq|\bno prerequisites?\b|\bwith no prereq/.test(q)) {
    pool = pool.filter((c) => c.description.trim() && !c.prereq); notes.push("no prerequisite language in the description");
  }
  if (/(?:doesn'?t|does not|don'?t|without|no|avoid)\s+(?:clash|conflict)|\bnot (?:clash|conflict)|\bfits? (?:in )?my schedule\b|\bno conflicts?\b/.test(q)) {
    const sched = courses.filter((c) => ctx.scheduleIds.includes(c.id));
    pool = pool.filter((c) => !sched.some((s) => coursesConflict(c, s)) && !ctx.scheduleIds.includes(c.id));
    notes.push(sched.length ? "no clash with your schedule" : "no clash (your schedule is empty)");
  }

  // campus
  const campuses: Campus[] = [];
  if (/\bpomona\b/.test(q)) campuses.push("PO");
  if (/\bpitzer\b/.test(q)) campuses.push("PZ");
  if (/\bscripps\b/.test(q)) campuses.push("SC");
  if (/\bmudd\b|\bhmc\b/.test(q)) campuses.push("HM");
  if (/\bcmc\b|claremont mckenna/.test(q)) campuses.push("CM");
  if (campuses.length) { pool = pool.filter((c) => campuses.includes(c.campus)); notes.push(`at ${campuses.join("/")}`); }

  // requirement concepts
  const wantAreas = new Set<string>();
  for (const c of CONCEPTS) if (c.re.test(q)) { c.areas.forEach((a) => wantAreas.add(a)); notes.push(c.label); }
  if (/\bunmet\b|\bmy requirements?\b|\bfit(?:s)? my (?:\w+ )?requirements?\b/.test(q) && ctx.unmetAreas.length) {
    ctx.unmetAreas.forEach((a) => wantAreas.add(a)); notes.push("your unmet requirements");
  }
  if (wantAreas.size) pool = pool.filter((c) => c.areas.some((a) => wantAreas.has(a)));

  // departments by name ("ECON classes", "psychology")
  const mentioned = deptsMentioned(q.replace(avoidIntro?.[0] || "§", ""));
  if (mentioned.length) { pool = pool.filter((c) => mentioned.includes(c.dept)); notes.push(`dept ${mentioned.join("/")}`); }

  // leftover keywords against title/description/instructor
  const kw = wordsIn(q).filter((w) => w.length >= 4 && !STOP.has(w) && !deptWords.has(w) && !/^(pomona|pitzer|scripps|mudd|claremont|mckenna)$/.test(w));
  let usedKw = false;
  if (kw.length) {
    const narrowed = pool.filter((c) => kw.every((k) => c.searchText.includes(k)));
    if (narrowed.length) { pool = narrowed; usedKw = true; notes.push(`mentions “${kw.join(" ")}”`); }
  }

  // one section per course, open first
  const seen = new Set<string>();
  const unique = pool
    .filter((c) => (c.isOpen || /\bclosed\b/.test(q)) )
    .concat(pool.filter((c) => !c.isOpen))
    .filter((c) => (seen.has(c.courseKey) ? false : (seen.add(c.courseKey), true)));
  const top = unique.slice(0, 6);

  const interpreted = notes.length ? `I read that as: ${notes.join(", ")}.` : "I could not pick any filters out of that, so I am showing a handful of open courses.";
  const header = "Offline mode: this is a keyword parser over the real course data, not an AI model. ";
  void usedKw;
  if (top.length === 0) {
    return { text: `${header}${interpreted} Nothing in ${ctx.termKey} matched. Try fewer constraints, or ask without a day or time.`, ids: [] };
  }
  return {
    text: `${header}${interpreted} ${pool.length} section${pool.length === 1 ? "" : "s"} matched; here ${top.length === 1 ? "is the best" : `are the first ${top.length}`}.`,
    ids: top.map((c) => c.id),
  };
}
