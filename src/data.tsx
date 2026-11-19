import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AreaInfo, Course, TermRef } from "./types";
import { loadAreas, loadSections, loadTerms, parseTermKey, pickDefaultTerm, termKey as tk, type DataSource } from "./lib/hyperschedule";
import { useStore } from "./store";
import { computeProgress, unmetItems, areasForItem, type ItemProgress } from "./lib/requirements";
import type { AtlasContext } from "./lib/localAtlas";

interface DataCtx {
  status: "loading" | "ready" | "error";
  error: string;
  terms: TermRef[];
  termKey: string;
  courses: Course[];
  byId: Map<string, Course>;
  areas: AreaInfo[];
  areaName: (code: string) => string;
  deptName: (code: string) => string;
  depts: string[];
  fetchedAt: string;
  source: DataSource;
  switching: boolean;
  setTerm: (k: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);
export const useData = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("DataProvider missing");
  return c;
};

export function DataProvider({ children }: { children: ReactNode }) {
  const storedTerm = useStore((s) => s.termKey);
  const setStoredTerm = useStore((s) => s.setTerm);
  const [status, setStatus] = useState<DataCtx["status"]>("loading");
  const [error, setError] = useState("");
  const [terms, setTerms] = useState<TermRef[]>([]);
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [key, setKey] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [source, setSource] = useState<DataSource>("snapshot");
  const [switching, setSwitching] = useState(false);
  const bootRef = useRef(false);

  const apply = useCallback((d: { termKey: string; courses: Course[]; fetchedAt: string; source: DataSource }) => {
    setKey(d.termKey); setCourses(d.courses); setFetchedAt(d.fetchedAt); setSource(d.source);
    setStoredTerm(d.termKey);
  }, [setStoredTerm]);

  // first load
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        const [t, a] = await Promise.all([loadTerms(), loadAreas().catch(() => [] as AreaInfo[])]);
        setTerms(t.terms); setAreas(a);
        let data = null;
        if (storedTerm && t.terms.some((x) => tk(x) === storedTerm)) {
          try { data = await loadSections(storedTerm); } catch { /* fall through to default */ }
        }
        if (!data || data.courses.length === 0) data = await pickDefaultTerm(t.terms);
        apply(data);
        setStatus("ready");
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    })();
  }, [apply, storedTerm]);

  const setTerm = useCallback((k: string) => {
    if (!parseTermKey(k) || k === key) return;
    setSwitching(true);
    setError("");
    loadSections(k)
      .then((d) => apply(d))
      .catch((e) => setError((e as Error).message))
      .finally(() => setSwitching(false));
  }, [apply, key]);

  const reload = useCallback(async () => {
    if (!key) return;
    setSwitching(true);
    try { apply(await loadSections(key, true)); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setSwitching(false); }
  }, [apply, key]);

  // quiet refresh every 5 minutes while the tab is visible
  useEffect(() => {
    if (!key) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadSections(key, true).then(apply).catch(() => {}); }, 5 * 60_000);
    return () => clearInterval(t);
  }, [key, apply]);

  const value = useMemo<DataCtx>(() => {
    const byId = new Map(courses.map((c) => [c.id, c] as const));
    const names = new Map(areas.map((a) => [a.area, a.description] as const));
    const depts = [...new Set(courses.map((c) => c.dept))].sort();
    return {
      status, error, terms, termKey: key, courses, byId, areas,
      areaName: (code) => names.get(code) || code,
      deptName: (code) => { const n = names.get(code); return n && !/^\d/.test(code) ? n : code; },
      depts, fetchedAt, source, switching, setTerm, reload,
    };
  }, [status, error, terms, key, courses, areas, fetchedAt, source, switching, setTerm, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Active (non-tentative) schedule resolved against live data. Entries whose id is missing are reported separately. */
export function useSchedule() {
  const { termKey, byId } = useData();
  const entries = useStore((s) => s.schedules[termKey]);
  return useMemo(() => {
    const list = entries || [];
    const resolved = list.map((e) => ({ entry: e, course: byId.get(e.id) || null }));
    const active = resolved.filter((r) => r.entry.active && r.course).map((r) => r.course!) ;
    const all = resolved.filter((r) => r.course).map((r) => r.course!);
    const missing = resolved.filter((r) => !r.course).map((r) => r.entry);
    return { entries: list, resolved, active, all, missing };
  }, [entries, byId]);
}

export function useProgress(): ItemProgress[] {
  const college = useStore((s) => s.college);
  const completed = useStore((s) => s.completed);
  const overrides = useStore((s) => s.overrides);
  const manualDone = useStore((s) => s.manualDone);
  const manualOptions = useStore((s) => s.manualOptions);
  const extraCredits = useStore((s) => s.extraCredits);
  const customReqs = useStore((s) => s.customReqs);
  const { active } = useSchedule();
  return useMemo(() => {
    if (!college) return [];
    return computeProgress({ college, completed, planned: active, overrides, manualDone, manualOptions, extraCredits, customReqs });
  }, [college, completed, active, overrides, manualDone, manualOptions, extraCredits, customReqs]);
}

export function useAtlasContext(): AtlasContext {
  const college = useStore((s) => s.college);
  const majors = useStore((s) => s.majors);
  const minors = useStore((s) => s.minors);
  const blocks = useStore((s) => s.filters.blocks);
  const progress = useProgress();
  const { termKey } = useData();
  const { active } = useSchedule();
  return useMemo(() => {
    const unmet = unmetItems(progress);
    return {
      college, termKey,
      majors: majors.map((m) => m.name), minors: minors.map((m) => m.name),
      unmetTitles: unmet.map((p) => p.item.title),
      unmetAreas: [...new Set(unmet.flatMap((p) => areasForItem(p.item)))],
      scheduleIds: active.map((c) => c.id),
      blocks: blocks.map((b) => ({ days: b.days, start: b.start, end: b.end })),
    };
  }, [college, majors, minors, blocks, progress, termKey, active]);
}
