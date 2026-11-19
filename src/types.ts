export type Campus = "PO" | "CM" | "SC" | "HM" | "PZ";
export const CAMPUSES: Campus[] = ["PO", "CM", "SC", "HM", "PZ"];
export const CAMPUS_NAMES: Record<Campus, string> = {
  PO: "Pomona",
  CM: "Claremont McKenna",
  SC: "Scripps",
  HM: "Harvey Mudd",
  PZ: "Pitzer",
};
/** Weekdays in Hyperschedule notation. R = Thursday. */
export const WEEKDAYS = ["M", "T", "W", "R", "F"] as const;
export const DAY_NAMES: Record<string, string> = {
  M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun",
};

export interface Meeting {
  days: string[];
  /** minutes after midnight */
  start: number;
  end: number;
  loc: string;
}

/** A single real section, normalized from the Hyperschedule v4 API. Never constructed from anything else. */
export interface Course {
  id: string;
  /** course identity without section, used to group sections */
  courseKey: string;
  dept: string;
  num: number;
  suffix: string;
  affil: string;
  section: number;
  /** e.g. "CSCI 062A PO" */
  code: string;
  title: string;
  description: string;
  campus: Campus;
  credits: number;
  /** credits converted to 1.0 = one full course (HMC-hosted credits / 3) */
  courseCredit: number;
  status: string;
  seatsTotal: number;
  seatsFilled: number;
  openSeats: number;
  isOpen: boolean;
  instructors: string[];
  areas: string[];
  meetings: Meeting[];
  hasTimes: boolean;
  startDate: number;
  endDate: number;
  half: string | null;
  permCount: number;
  intro: boolean;
  senior: boolean;
  prereq: boolean;
  weeklyMin: number;
  dayCount: number;
  searchText: string;
}

export interface AreaInfo {
  area: string;
  description: string;
}

export interface TermRef {
  term: "FA" | "SP" | "SU";
  year: number;
}

export interface Block {
  id: string;
  days: string[];
  start: number;
  end: number;
}

export interface Filters {
  q: string;
  campuses: Campus[];
  depts: string[];
  days: string[];
  credits: number[];
  openOnly: boolean;
  reqs: string[];
  reqMode: "any" | "all";
  noBefore: boolean;
  noAfter: boolean;
  noFriday: boolean;
  blocks: Block[];
  hideConflicts: boolean;
  excludeIntro: boolean;
  introDepts: string[];
  excludeSenior: boolean;
}

export const defaultFilters: Filters = {
  q: "",
  campuses: [],
  depts: [],
  days: [],
  credits: [],
  openOnly: false,
  reqs: [],
  reqMode: "any",
  noBefore: false,
  noAfter: false,
  noFriday: false,
  blocks: [],
  hideConflicts: false,
  excludeIntro: false,
  introDepts: [],
  excludeSenior: false,
};

export const NO_BEFORE_MIN = 10 * 60;
export const NO_AFTER_MIN = 16 * 60;
