import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Block, Campus, Filters } from "./types";
import { defaultFilters } from "./types";
import type { CompletedCourse, CustomReq } from "./lib/requirements";

export interface Program { name: string; depts: string[] }
export interface SchedEntry { id: string; active: boolean; label: string }
export interface ProfNote { text: string; tags: string[] }

/** Everything the user owns. Saved to localStorage always; synced to the cloud only if signed in. */
export interface UserData {
  schedules: Record<string, SchedEntry[]>;
  college: Campus | null;
  majors: Program[];
  minors: Program[];
  completed: CompletedCourse[];
  overrides: Record<string, string[]>;
  manualDone: Record<string, boolean>;
  manualOptions: Record<string, boolean>;
  extraCredits: number;
  customReqs: CustomReq[];
  interests: string[];
  notes: Record<string, ProfNote>;
  updatedAt: number;
}

export interface Prefs {
  theme: "system" | "light" | "dark";
  termKey: string | null;
  filters: Filters;
  easyMaxWeekly: number;
}

export const emptyUserData = (): UserData => ({
  schedules: {}, college: null, majors: [], minors: [], completed: [], overrides: {}, manualDone: {},
  manualOptions: {}, extraCredits: 0, customReqs: [], interests: [], notes: {}, updatedAt: 0,
});

interface Actions {
  setTheme: (t: Prefs["theme"]) => void;
  setTerm: (k: string) => void;
  setFilters: (p: Partial<Filters>) => void;
  resetFilters: () => void;
  addBlock: (b: Omit<Block, "id">) => void;
  removeBlock: (id: string) => void;
  setEasyMax: (n: number) => void;

  addToSchedule: (term: string, id: string, label: string) => void;
  removeFromSchedule: (term: string, id: string) => void;
  toggleActive: (term: string, id: string) => void;
  clearSchedule: (term: string) => void;

  setCollege: (c: Campus | null) => void;
  addProgram: (kind: "majors" | "minors", p: Program) => void;
  removeProgram: (kind: "majors" | "minors", name: string) => void;
  addCompleted: (c: CompletedCourse) => void;
  removeCompleted: (id: string) => void;
  setOverride: (courseId: string, reqIds: string[] | null) => void;
  setManualDone: (id: string, v: boolean) => void;
  setManualOption: (key: string, v: boolean) => void;
  setExtraCredits: (n: number) => void;
  addCustomReq: (r: CustomReq) => void;
  removeCustomReq: (id: string) => void;
  setInterests: (t: string[]) => void;
  setNote: (name: string, n: ProfNote) => void;
  /** replace user data wholesale (cloud merge) */
  replaceUserData: (d: UserData) => void;
}

export type Store = Prefs & UserData & Actions;

const safeStorage = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode or quota */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let idCounter = 0;
export const uid = (p = "id") => `${p}-${Date.now().toString(36)}-${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const useStore = create<Store>()(
  persist(
    (set) => {
      const touch = <T extends Partial<UserData>>(p: T): T & { updatedAt: number } => ({ ...p, updatedAt: Date.now() });
      return {
        theme: "system",
        termKey: null,
        filters: defaultFilters,
        easyMaxWeekly: 200,
        ...emptyUserData(),

        setTheme: (theme) => set({ theme }),
        setTerm: (termKey) => set({ termKey }),
        setFilters: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
        resetFilters: () => set({ filters: defaultFilters }),
        addBlock: (b) => set((s) => ({ filters: { ...s.filters, blocks: [...s.filters.blocks, { ...b, id: uid("blk") }] } })),
        removeBlock: (id) => set((s) => ({ filters: { ...s.filters, blocks: s.filters.blocks.filter((b) => b.id !== id) } })),
        setEasyMax: (easyMaxWeekly) => set({ easyMaxWeekly }),

        addToSchedule: (term, id, label) => set((s) => {
          const cur = s.schedules[term] || [];
          if (cur.some((e) => e.id === id)) return {};
          return touch({ schedules: { ...s.schedules, [term]: [...cur, { id, active: true, label }] } });
        }),
        removeFromSchedule: (term, id) => set((s) => touch({ schedules: { ...s.schedules, [term]: (s.schedules[term] || []).filter((e) => e.id !== id) } })),
        toggleActive: (term, id) => set((s) => touch({ schedules: { ...s.schedules, [term]: (s.schedules[term] || []).map((e) => (e.id === id ? { ...e, active: !e.active } : e)) } })),
        clearSchedule: (term) => set((s) => touch({ schedules: { ...s.schedules, [term]: [] } })),

        setCollege: (college) => set(touch({ college })),
        addProgram: (kind, p) => set((s) => (s[kind].some((x) => x.name === p.name) ? {} : touch({ [kind]: [...s[kind], p] }))),
        removeProgram: (kind, name) => set((s) => touch({ [kind]: s[kind].filter((x) => x.name !== name) })),
        addCompleted: (c) => set((s) => (s.completed.some((x) => x.id === c.id) ? {} : touch({ completed: [...s.completed, c] }))),
        removeCompleted: (id) => set((s) => touch({ completed: s.completed.filter((c) => c.id !== id) })),
        setOverride: (courseId, reqIds) => set((s) => {
          const o = { ...s.overrides };
          if (reqIds === null) delete o[courseId]; else o[courseId] = reqIds;
          return touch({ overrides: o });
        }),
        setManualDone: (id, v) => set((s) => touch({ manualDone: { ...s.manualDone, [id]: v } })),
        setManualOption: (key, v) => set((s) => touch({ manualOptions: { ...s.manualOptions, [key]: v } })),
        setExtraCredits: (extraCredits) => set(touch({ extraCredits: Math.max(0, extraCredits || 0) })),
        addCustomReq: (r) => set((s) => touch({ customReqs: [...s.customReqs, r] })),
        removeCustomReq: (id) => set((s) => touch({ customReqs: s.customReqs.filter((r) => r.id !== id) })),
        setInterests: (interests) => set(touch({ interests })),
        setNote: (name, n) => set((s) => {
          const notes = { ...s.notes };
          if (!n.text.trim() && n.tags.length === 0) delete notes[name]; else notes[name] = n;
          return touch({ notes });
        }),
        replaceUserData: (d) => set({ ...d }),
      };
    },
    {
      name: "atlas-v1",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // persist data only, never the action functions
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")) as Partial<Store>,
      // tolerate older or hand-edited saved state
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<Store>;
        return { ...current, ...p, filters: { ...defaultFilters, ...(p.filters || {}) } };
      },
    },
  ),
);

export function pickUserData(s: Store): UserData {
  return {
    schedules: s.schedules, college: s.college, majors: s.majors, minors: s.minors, completed: s.completed,
    overrides: s.overrides, manualDone: s.manualDone, manualOptions: s.manualOptions, extraCredits: s.extraCredits,
    customReqs: s.customReqs, interests: s.interests, notes: s.notes, updatedAt: s.updatedAt,
  };
}

export function hasUserData(d: UserData): boolean {
  return (
    Object.values(d.schedules).some((l) => l.length > 0) || !!d.college || d.majors.length > 0 || d.minors.length > 0 ||
    d.completed.length > 0 || Object.keys(d.manualDone).length > 0 || d.customReqs.length > 0 ||
    d.interests.length > 0 || Object.keys(d.notes).length > 0 || d.extraCredits > 0
  );
}

/** Union-merge two copies of the user's data. Nothing is dropped; the newer copy wins conflicts. */
export function mergeUserData(a: UserData, b: UserData): UserData {
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];
  const byId = <T extends { id: string }>(x: T[], y: T[]) => {
    const m = new Map(x.map((i) => [i.id, i] as const));
    for (const i of y) m.set(i.id, i);
    return [...m.values()];
  };
  const byName = (x: Program[], y: Program[]) => {
    const m = new Map(x.map((i) => [i.name, i] as const));
    for (const i of y) m.set(i.name, i);
    return [...m.values()];
  };
  const schedules: Record<string, SchedEntry[]> = {};
  for (const k of new Set([...Object.keys(older.schedules), ...Object.keys(newer.schedules)])) {
    schedules[k] = byId(older.schedules[k] || [], newer.schedules[k] || []);
  }
  return {
    schedules,
    college: newer.college ?? older.college,
    majors: byName(older.majors, newer.majors),
    minors: byName(older.minors, newer.minors),
    completed: byId(older.completed, newer.completed),
    overrides: { ...older.overrides, ...newer.overrides },
    manualDone: { ...older.manualDone, ...newer.manualDone },
    manualOptions: { ...older.manualOptions, ...newer.manualOptions },
    extraCredits: Math.max(older.extraCredits, newer.extraCredits),
    customReqs: byId(older.customReqs, newer.customReqs),
    interests: [...new Set([...older.interests, ...newer.interests])],
    notes: { ...older.notes, ...newer.notes },
    updatedAt: Math.max(a.updatedAt, b.updatedAt, Date.now()),
  };
}
