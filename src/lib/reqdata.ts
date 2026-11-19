import type { Campus } from "../types";

/**
 * General-education / graduation requirements, modeled from the official catalogs.
 * Course matching uses Hyperschedule "course areas" (its own codes for each school's
 * requirement tags, e.g. 1A1 = "PO Area 1 Requirement"), so tags come from the registrar
 * data rather than from guesses. Nothing here is a degree audit: always verify with the
 * registrar. Items whose required COUNT could not be confirmed from a catalog page are
 * marked "tracker" and show how many matching courses you have without a progress bar.
 */

export interface Matcher {
  areas?: string[];
  dept?: string;
  affil?: string;
  campus?: Campus;
  num?: number;
  minNum?: number;
  maxNum?: number;
}

export type ReqKind =
  | "count"          // N matching courses
  | "credits"        // N course credits from matching courses (or all courses)
  | "pick"           // satisfy N of the listed options
  | "distinctDept"   // courses spread across N departments
  | "concentration"  // N courses inside a single department
  | "manual"         // no course tag exists; user checks it off
  | "tracker";       // count shown, required number not confirmed

/** official = read from the college's own page; secondary = student press or similar; unconfirmed = name known, count not */
export type Confidence = "official" | "secondary" | "unconfirmed";

export interface ReqOption {
  id: string;
  label: string;
  matchers: Matcher[];
  manual?: boolean;
}

export interface ReqItem {
  id: string;
  group: string;
  title: string;
  kind: ReqKind;
  needed: number;
  matchers?: Matcher[];
  options?: ReqOption[];
  /** a course may satisfy only one item inside the same exclusive group */
  excl?: string;
  minCredit?: number;
  /** credits kind: count every course, not just matching ones */
  all?: boolean;
  confidence: Confidence;
  note?: string;
}

export interface CollegeReqs {
  campus: Campus;
  name: string;
  link: string;
  extraLinks?: { label: string; href: string }[];
  summary: string;
  items: ReqItem[];
}

const area = (...a: string[]): Matcher[] => [{ areas: a }];

const PO: CollegeReqs = {
  campus: "PO",
  name: "Pomona College",
  link: "https://catalog.pomona.edu/academicpolicies/degreegraduationpolicies/degreerequirements",
  summary:
    "32 course credits (30 after matriculation, 16 at Pomona, final semester in residence), a major, and a 2.00 GPA. Breadth of Study is one course in each of six areas.",
  items: [
    { id: "po-total", group: "Degree", title: "32 course credits", kind: "credits", needed: 32, all: true, confidence: "official",
      note: "At least 16 credits at Pomona, minimum four semesters, final semester in residence." },
    { id: "po-ci", group: "First-year", title: "Critical Inquiry seminar (ID 001 PO)", kind: "count", needed: 1,
      matchers: [{ dept: "ID", num: 1, affil: "PO" }], confidence: "official",
      note: "Taken in the first semester. Not required of transfer students." },
    { id: "po-a1", group: "Breadth of Study", title: "Area 1: Criticism, analysis and contextual study of works of the human imagination", kind: "count", needed: 1, matchers: area("1A1"), confidence: "official" },
    { id: "po-a2", group: "Breadth of Study", title: "Area 2: Social institutions and human behavior", kind: "count", needed: 1, matchers: area("1A2"), confidence: "official" },
    { id: "po-a3", group: "Breadth of Study", title: "Area 3: History, values, ethics and cultural studies", kind: "count", needed: 1, matchers: area("1A3"), confidence: "official" },
    { id: "po-a4", group: "Breadth of Study", title: "Area 4: Physical and biological sciences", kind: "count", needed: 1, matchers: area("1A4"), confidence: "official" },
    { id: "po-a5", group: "Breadth of Study", title: "Area 5: Mathematical reasoning", kind: "count", needed: 1, matchers: area("1A5"), confidence: "official" },
    { id: "po-a6", group: "Breadth of Study", title: "Area 6: Creation and performance of works of art and literature", kind: "count", needed: 1, matchers: area("1A6"), confidence: "official" },
    { id: "po-wi", group: "Skills", title: "Writing Intensive", kind: "tracker", needed: 0, matchers: area("1WIR"), confidence: "unconfirmed",
      note: "Requirement exists in the catalog; the number of courses was not on the page I read. Check the Writing Intensive Requirement page." },
    { id: "po-si", group: "Skills", title: "Speaking Intensive", kind: "tracker", needed: 0, matchers: area("1SIR"), confidence: "unconfirmed",
      note: "Check the Speaking Intensive Requirement page for the count." },
    { id: "po-adr", group: "Skills", title: "Analyzing Difference", kind: "tracker", needed: 0, matchers: area("1ADR"), confidence: "unconfirmed",
      note: "Check the Analyzing Difference Requirement page for the count." },
    { id: "po-fl", group: "Skills", title: "Language requirement", kind: "tracker", needed: 0, matchers: area("1FL"), confidence: "unconfirmed",
      note: "Placement and proficiency rules are in the catalog's Language Requirement page." },
    { id: "po-pe", group: "Skills", title: "Physical education", kind: "tracker", needed: 0, matchers: area("1PE"), confidence: "unconfirmed",
      note: "Check the Physical Education Requirement page for how many are needed." },
  ],
};

const CM: CollegeReqs = {
  campus: "CM",
  name: "Claremont McKenna College",
  link: "https://www.cmc.edu/registrar/degree-requirements",
  extraLinks: [
    { label: "CMC General Education Requirements (PDF)", href: "https://www.cmc.edu/sites/default/files/CMC-General-Requirements_FINAL_2026.pdf" },
    { label: "CMC GE degree-audit checklist", href: "https://webapps.cmc.edu/degree_audit/ge.php?jb=1" },
  ],
  summary:
    "Rules below follow CMC's general education chart. Humanities and social science fields must be outside your major (majors in those fields need an extra field). CMC's chart notes its course numbers apply to CMC courses, so use the override button for 5C courses it accepts.",
  items: [
    { id: "cm-fws", group: "First year", title: "First-Year Writing Seminar (FWS 010 CM)", kind: "count", needed: 1,
      matchers: [{ dept: "FWS", num: 10, affil: "CM" }], confidence: "official", note: "Must be taken during the first year." },
    { id: "cm-fhs", group: "First year", title: "First-Year Humanities Seminar (FHS 010 CM)", kind: "count", needed: 1,
      matchers: [{ dept: "FHS", num: 10, affil: "CM" }], confidence: "official", note: "Must be taken during the first year." },
    { id: "cm-lang", group: "Skills", title: "Foreign language: competency at the 3rd college semester", kind: "manual", needed: 1, confidence: "official",
      note: "May be waived by placement exam or demonstrated proficiency in a language not taught at the consortium." },
    { id: "cm-math", group: "Science and math", title: "Mathematics or Computer Science (1 course)", kind: "count", needed: 1,
      matchers: [{ areas: ["3MAT"] }, { dept: "CSCI" }, { dept: "MATH", affil: "CM" }], confidence: "official",
      note: "Any CMC Mathematical Sciences course, or any computer science or calculus course in the consortium." },
    { id: "cm-lab", group: "Science and math", title: "Lab science (SCI 010L CM)", kind: "count", needed: 1,
      matchers: [{ areas: ["3SCI", "3LAB"] }], confidence: "official", note: "Complete by the end of the second year." },
    { id: "cm-hum", group: "Humanities (2 of 4 fields, outside your major)", title: "Humanities: courses in 2 of 4 fields", kind: "pick", needed: 2, confidence: "official",
      options: [
        { id: "lit", label: "Literature", matchers: area("3LIT") },
        { id: "phil", label: "Philosophy (numbered 59 or below)", matchers: area("3PHI") },
        { id: "rel", label: "Religious Studies", matchers: area("3REL") },
        { id: "flit", label: "Literature in a foreign language (4th–6th semester)", matchers: [], manual: true },
      ],
      note: "Majors in one of these fields need 3 of the 4." },
    { id: "cm-soc", group: "Social sciences (3 of 4 fields, outside your major)", title: "Social sciences: courses in 3 of 4 fields", kind: "pick", needed: 3, confidence: "official",
      options: [
        { id: "econ", label: "Economics (ECON 050 CM)", matchers: [{ dept: "ECON", num: 50, affil: "CM" }] },
        { id: "govt", label: "Government (GOVT 020 CM, American Government)", matchers: [{ areas: ["3AMG"] }, { dept: "GOVT", num: 20, affil: "CM" }] },
        { id: "hist", label: "History", matchers: area("3HGE") },
        { id: "psy", label: "Psychological Science (under 100)", matchers: area("3PSY") },
      ],
      note: "Majors in one of these fields need all 4." },
    { id: "cm-pe", group: "Skills", title: "Physical education: 3 semesters", kind: "count", needed: 3, matchers: [{ dept: "PE" }], confidence: "official",
      note: "Or 2 seasons of a team or club sport. Finish in the first two years." },
    { id: "cm-thesis", group: "Senior year", title: "Senior Thesis", kind: "manual", needed: 1, confidence: "official", note: "Related to your major. Done in the senior year." },
  ],
};

const SC: CollegeReqs = {
  campus: "SC",
  name: "Scripps College",
  link: "https://catalog.scrippscollege.edu/content.php?catoid=37&navoid=4665",
  summary:
    "A minimum of 32 courses including the Core, the General Education requirements and the major. I could not open the current Scripps catalog page from my tools (its certificate failed), so most counts below come from a Scripps catalog search snippet and student press. Verify each against the official page.",
  items: [
    { id: "sc-total", group: "Degree", title: "32 courses", kind: "credits", needed: 32, all: true, confidence: "official",
      note: "Per the Scripps catalog: a minimum of 32 courses including the Core, General Education and the major." },
    { id: "sc-core", group: "Core", title: "Core humanities sequence (three semesters)", kind: "count", needed: 3, matchers: area("2COR"), confidence: "secondary",
      note: "Reported by The Student Life as three semesters of Core." },
    { id: "sc-fa", group: "Breadth of Study", title: "Fine Arts", kind: "count", needed: 1, matchers: area("2FA"), confidence: "secondary" },
    { id: "sc-lt", group: "Breadth of Study", title: "Letters", kind: "count", needed: 1, matchers: area("2LT"), confidence: "secondary" },
    { id: "sc-ns", group: "Breadth of Study", title: "Natural Science", kind: "count", needed: 1, matchers: area("2NS"), confidence: "secondary" },
    { id: "sc-ss", group: "Breadth of Study", title: "Social Science", kind: "count", needed: 1, matchers: area("2SS"), confidence: "secondary" },
    { id: "sc-mth", group: "Other General Education", title: "Mathematics", kind: "tracker", needed: 0, matchers: area("2MTH"), confidence: "unconfirmed" },
    { id: "sc-res", group: "Other General Education", title: "Race and Ethnic Studies", kind: "tracker", needed: 0, matchers: area("2RES"), confidence: "unconfirmed" },
    { id: "sc-ws", group: "Other General Education", title: "Gender and Women's Studies", kind: "tracker", needed: 0, matchers: area("2WS"), confidence: "unconfirmed" },
    { id: "sc-fl", group: "Other General Education", title: "Foreign Language", kind: "tracker", needed: 0, matchers: area("2FL"), confidence: "unconfirmed" },
    { id: "sc-thesis", group: "Senior year", title: "Senior Thesis", kind: "tracker", needed: 0, matchers: area("2THE"), confidence: "unconfirmed",
      note: "Count not confirmed. Check the catalog for how many thesis courses are required." },
  ],
};

const HM: CollegeReqs = {
  campus: "HM",
  name: "Harvey Mudd College",
  link: "https://catalog.hmc.edu/content.php?catoid=28&navoid=1446",
  extraLinks: [{ label: "HSA graduation requirements", href: "https://www.hmc.edu/hsa/program/graduation-requirements/" }],
  summary:
    "The HSA rules below come from Harvey Mudd's HSA graduation requirements page. The Common Core and your major and Clinic are tracked but not itemised: I did not read their counts, so add them as custom items or check them off. HMC credits are shown divided by 3 so one full course = 1.0.",
  items: [
    { id: "hm-hsa10", group: "HSA", title: "HSA 010 Critical Inquiry", kind: "count", needed: 1, matchers: [{ dept: "HSA", num: 10 }], confidence: "official",
      note: "Taken in the spring of the first year." },
    { id: "hm-hsa", group: "HSA", title: "10 more full HSA courses", kind: "credits", needed: 10, matchers: area("4HSA", "4HSS"), confidence: "official",
      note: "A full course carries 3 or 4 units. Remaining coursework may be done at other Claremont Colleges." },
    { id: "hm-dept", group: "HSA", title: "At least 4 of those with HSA department faculty", kind: "credits", needed: 4, matchers: area("4HSA"), confidence: "official" },
    { id: "hm-breadth", group: "HSA", title: "Breadth: full courses in 5 different HSA disciplines", kind: "distinctDept", needed: 5, matchers: area("4HSA", "4HSS"), confidence: "official",
      note: "Disciplines are approximated by department code (so Politics and Government count separately). Use manual check-off if that is wrong." },
    { id: "hm-conc", group: "HSA", title: "Concentration: 4 courses in one HSA discipline", kind: "concentration", needed: 4, matchers: area("4HSA", "4HSS"), confidence: "official",
      note: "Choose a concentration by your sixth semester." },
    { id: "hm-wi", group: "HSA", title: "At least 1 writing-intensive HSA course", kind: "count", needed: 1, matchers: area("4WRT"), confidence: "official",
      note: "About 5,000 words (or 18 pages) of formal graded writing." },
    { id: "hm-core", group: "Common Core and major", title: "Common Core courses", kind: "tracker", needed: 0, matchers: area("4COR"), confidence: "unconfirmed",
      note: "Required courses are listed in the HMC catalog. Counted here only." },
    { id: "hm-major", group: "Common Core and major", title: "Major requirements and Clinic", kind: "manual", needed: 1, confidence: "unconfirmed",
      note: "Add your major's courses as custom items below." },
  ],
};

const PZ: CollegeReqs = {
  campus: "PZ",
  name: "Pitzer College",
  link: "https://catalog.pitzer.edu/content.php?catoid=36&navoid=2521",
  summary:
    "32 course credits, a 2.00 GPA overall and in your major and minor, and the educational-objective requirements below. A course may satisfy only one of IUG, IUL, SRX or SJT, and one course cannot count toward two Breadth areas. Half-credit courses cannot be used for Breadth. (Transfer courses of at least 0.67 credit may qualify.)",
  items: [
    { id: "pz-total", group: "Degree", title: "32 course credits", kind: "credits", needed: 32, all: true, confidence: "official" },
    { id: "pz-iug", group: "Intercultural Understanding", title: "Global or international perspective (IUG)", kind: "count", needed: 1, matchers: area("5IUG"), excl: "pz-ethics", confidence: "official",
      note: "Or complete an approved study abroad program (use the manual check-off)." },
    { id: "pz-iul", group: "Intercultural Understanding", title: "Domestic or local perspective (IUL)", kind: "count", needed: 1, matchers: area("5IUL"), excl: "pz-ethics", confidence: "official",
      note: "Or complete the CASA Pitzer Program (use the manual check-off)." },
    { id: "pz-sjt", group: "Ethical Implications of Knowledge and Action", title: "Social Justice Theory (SJT)", kind: "count", needed: 1, matchers: area("5SJT"), excl: "pz-ethics", confidence: "official" },
    { id: "pz-srx", group: "Ethical Implications of Knowledge and Action", title: "Social Responsibility Praxis (SRX)", kind: "count", needed: 1, matchers: area("5SRX"), excl: "pz-ethics", confidence: "official" },
    { id: "pz-hum", group: "Breadth of Knowledge", title: "Humanities and fine arts (2 course credits)", kind: "count", needed: 2, matchers: area("5HUM"), excl: "pz-breadth", minCredit: 1, confidence: "official" },
    { id: "pz-soc", group: "Breadth of Knowledge", title: "Social and behavioral sciences (2 course credits)", kind: "count", needed: 2, matchers: area("5SOC"), excl: "pz-breadth", minCredit: 1, confidence: "official" },
    { id: "pz-nat", group: "Breadth of Knowledge", title: "Natural sciences (1 course credit)", kind: "count", needed: 1, matchers: area("5NAT"), excl: "pz-breadth", minCredit: 1, confidence: "official" },
    { id: "pz-qua", group: "Breadth of Knowledge", title: "Quantitative reasoning (1 course credit)", kind: "count", needed: 1, matchers: area("5QUA"), excl: "pz-breadth", minCredit: 1, confidence: "official" },
    { id: "pz-wri", group: "Written Expression", title: "Writing-intensive course (WRI)", kind: "count", needed: 1, matchers: area("5WRI"), confidence: "official",
      note: "Most students meet it with a First-Year Seminar." },
    { id: "pz-major", group: "Major", title: "Complete a major", kind: "manual", needed: 1, confidence: "official",
      note: "Major/Educational Objectives form due by midterm of the first semester of junior year." },
  ],
};

export const COLLEGE_REQS: Record<Campus, CollegeReqs> = { PO, CM, SC, HM, PZ };

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  official: "Read from the official catalog",
  secondary: "Secondary source, verify",
  unconfirmed: "Count not confirmed, verify",
};
