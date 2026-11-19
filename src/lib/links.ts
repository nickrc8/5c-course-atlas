import type { Campus } from "../types";
import { CAMPUS_NAMES } from "../types";

/**
 * Professor research links. These are plain search URLs pre-filled with the instructor's
 * name. Atlas never shows ratings, bios or work histories itself.
 *
 * The "current college" link is a Google search restricted to ratemyprofessors.com plus the
 * college name, because Rate My Professors school IDs could not be verified from here and
 * a wrong ID would silently show the wrong school.
 */
const enc = encodeURIComponent;

export const FULL_NAME: Record<Campus, string> = {
  PO: "Pomona College",
  CM: "Claremont McKenna College",
  SC: "Scripps College",
  HM: "Harvey Mudd College",
  PZ: "Pitzer College",
};

export interface ProfLinks {
  rmpCurrent: string;
  rmpAll: string;
  linkedin: string;
  profile: string;
  scholar: string;
}

export function profLinks(name: string, campus: Campus): ProfLinks {
  return {
    rmpCurrent: `https://www.google.com/search?q=${enc(`site:ratemyprofessors.com "${name}" "${FULL_NAME[campus]}"`)}`,
    rmpAll: `https://www.ratemyprofessors.com/search/professors?q=${enc(name)}`,
    linkedin: `https://www.linkedin.com/search/results/all/?keywords=${enc(`"${name}" professor OR lecturer OR university`)}`,
    profile: `https://www.google.com/search?q=${enc(`"${name}" ${CAMPUS_NAMES[campus]} faculty profile`)}`,
    scholar: `https://scholar.google.com/scholar?q=${enc(`author:"${name}"`)}`,
  };
}

/** "Staff", "TBA" and similar are not people. */
export function isRealName(name: string): boolean {
  const n = name.trim();
  return n.length > 2 && !/^(staff|faculty|tba|tbd|none|n\/a)$/i.test(n) && !/\b(tbd|tba|to be announced|to be determined)\b/i.test(n);
}
