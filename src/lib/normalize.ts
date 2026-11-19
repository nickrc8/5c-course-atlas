import type { Campus, Course, Meeting } from "../types";
import { CAMPUSES } from "../types";

/** Shape of one section from https://banana.hyperschedule.io/v4/sections/{TERM}{YEAR} */
export interface RawSection {
  courseAreas: string[];
  credits: number;
  permCount: number;
  seatsTotal: number;
  seatsFilled: number;
  status: string;
  startDate: { year: number; month: number; day: number };
  endDate: { year: number; month: number; day: number };
  instructors: { name: string }[];
  course: {
    code: { department: string; courseNumber: number; suffix: string; affiliation: string };
    title: string;
    description: string;
    primaryAssociation: string;
  };
  schedules: { startTime: number; endTime: number; days: string[]; locations: string[] }[];
  identifier: {
    department: string;
    courseNumber: number;
    suffix: string;
    affiliation: string;
    sectionNumber: number;
    year: number;
    term: string;
    half: { prefix: string; number: number } | null;
  };
}

const dateNum = (d: { year: number; month: number; day: number } | undefined) =>
  d ? d.year * 10000 + d.month * 100 + d.day : 0;

/** Prerequisite language. Only a heuristic over the published description. */
const PREREQ_RE = new RegExp(
  [
    "\\bpre-?requisites?\\b",
    "\\bprereqs?\\b",
    "\\bco-?requisites?\\b",
    "permission of (?:the )?(?:instructor|department|professor|chair)",
    "(?:instructor|department|professor)'?s? (?:permission|consent|approval)",
    "consent of (?:the )?(?:instructor|department)",
    "(?:instructor|department) (?:permission|consent|approval)",
    "\\b(?:must|should|need to) (?:have )?(?:completed|taken|passed|complete|take)\\b",
    "\\bprior (?:course|coursework|experience|knowledge)\\b",
    "\\bprevious (?:course|coursework)\\b",
    "\\bcompletion of\\b",
    "\\bpermission required\\b",
    "\\bby (?:instructor )?(?:permission|consent|application)\\b",
    "\\bapplication required\\b",
    "\\bopen to (?:juniors|seniors|majors|sophomores)\\b",
    "\\b(?:junior|senior) standing\\b",
  ].join("|"),
  "i",
);

const INTRO_TITLE_RE = /\bintro(?:duction|ductory)?\b/i;

const SENIOR_TITLE_RE =
  /senior\s+(?:seminar|thesis|project|exercise|capstone|colloquium|research|honors)|capstone|\bthesis\b|colloquium|colloquia|independent\s+study|directed\s+(?:study|research|reading)|senior\s+comp/i;
const SENIOR_DESC_RE =
  /senior\s+(?:seminar|thesis|capstone|project|exercise|colloquium)|capstone\s+(?:course|experience|seminar)|open to seniors only|for seniors only/i;

export function isIntro(num: number, title: string): boolean {
  return num < 100 || INTRO_TITLE_RE.test(title);
}

export function isSeniorLevel(num: number, title: string, description: string): boolean {
  if (num >= 190 && num <= 199) return true;
  return SENIOR_TITLE_RE.test(title) || SENIOR_DESC_RE.test(description);
}

export function hasPrereqLanguage(description: string): boolean {
  return PREREQ_RE.test(description);
}

export function normalizeSection(s: RawSection): Course | null {
  const code = s.course.code;
  const campus = s.course.primaryAssociation as Campus;
  // Only the five Claremont Colleges. Anything else would be an unknown affiliation.
  if (!CAMPUSES.includes(campus)) return null;

  const id = s.identifier;
  const half = id.half ? `${id.half.prefix}${id.half.number}` : null;
  const numPad = String(code.courseNumber).padStart(3, "0");
  const codeStr = `${code.department} ${numPad}${code.suffix} ${code.affiliation}`;
  const courseKey = `${code.department}-${numPad}${code.suffix}-${code.affiliation}`;
  const sectionId = `${id.term}${id.year}:${id.department}-${String(id.courseNumber).padStart(3, "0")}${id.suffix}-${id.affiliation}-${String(id.sectionNumber).padStart(2, "0")}${half ? "-" + half : ""}`;

  const meetings: Meeting[] = s.schedules.map((m) => ({
    days: m.days,
    start: Math.round(m.startTime / 60),
    end: Math.round(m.endTime / 60),
    loc: (m.locations || []).filter(Boolean).join(", "),
  }));
  const timed = meetings.filter((m) => m.days.length > 0 && m.end > m.start);
  const weeklyMin = timed.reduce((t, m) => t + (m.end - m.start) * m.days.length, 0);
  const dayCount = new Set(timed.flatMap((m) => m.days)).size;

  const instructors = s.instructors.map((i) => i.name).filter(Boolean);
  const description = s.course.description || "";
  const title = s.course.title || "";
  const credits = s.credits;
  const courseCredit = campus === "HM" ? Math.round((credits / 3) * 100) / 100 : credits;
  const openSeats = Math.max(0, s.seatsTotal - s.seatsFilled);
  const isOpen = s.status !== "C" && openSeats > 0;

  const num = code.courseNumber;
  const compact = `${code.department}${numPad}${code.suffix}`.toLowerCase();
  const searchText = [
    codeStr, compact, `${code.department} ${num}${code.suffix}`, `${code.department}${num}${code.suffix}`,
    `${compact} ${code.affiliation}-${String(id.sectionNumber).padStart(2, "0")}`,
    title, instructors.join(" "), description, s.courseAreas.join(" "), campus,
  ].join(" ").toLowerCase();

  return {
    id: sectionId,
    courseKey,
    dept: code.department,
    num,
    suffix: code.suffix,
    affil: code.affiliation,
    section: id.sectionNumber,
    code: codeStr,
    title,
    description,
    campus,
    credits,
    courseCredit,
    status: s.status,
    seatsTotal: s.seatsTotal,
    seatsFilled: s.seatsFilled,
    openSeats,
    isOpen,
    instructors,
    areas: s.courseAreas,
    meetings,
    hasTimes: timed.length > 0,
    startDate: dateNum(s.startDate),
    endDate: dateNum(s.endDate),
    half,
    permCount: s.permCount,
    intro: isIntro(num, title),
    senior: isSeniorLevel(num, title, description),
    prereq: hasPrereqLanguage(description),
    weeklyMin,
    dayCount,
    searchText,
  };
}

export function normalizeAll(raw: RawSection[]): Course[] {
  const out: Course[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const c = normalizeSection(r);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  out.sort((a, b) => a.dept.localeCompare(b.dept) || a.num - b.num || a.suffix.localeCompare(b.suffix) || a.affil.localeCompare(b.affil) || a.section - b.section);
  return out;
}
