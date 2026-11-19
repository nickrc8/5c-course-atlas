import type { AreaInfo, Course, TermRef } from "../types";
import { normalizeAll, type RawSection } from "./normalize";

/**
 * Data comes from Hyperschedule's public v4 API (https://banana.hyperschedule.io/v4).
 * That API sends no CORS headers, so browsers cannot call it directly. Two paths:
 *   1. Supabase Edge Function "hyperschedule" (live, cached a few minutes), if configured.
 *   2. A JSON snapshot in ./data/ refreshed by GitHub Actions (always available).
 * Both return the same envelope: { fetchedAt, data }.
 */

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface Envelope<T> {
  fetchedAt: string;
  data: T;
  /** snapshot only: term keys the snapshot holds sections for */
  available?: string[];
}

export type DataSource = "edge" | "snapshot";

let configPromise: Promise<AppConfig> | null = null;
export function loadConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = fetch(`${import.meta.env.BASE_URL}config.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((c: Partial<AppConfig>) => ({
        supabaseUrl: (c.supabaseUrl || "").replace(/\/+$/, ""),
        supabaseAnonKey: c.supabaseAnonKey || "",
      }));
  }
  return configPromise;
}

export const termKey = (t: TermRef) => `${t.term}${t.year}`;
export function parseTermKey(k: string): TermRef | null {
  const m = /^(FA|SP|SU)(\d{4})$/.exec(k);
  return m ? { term: m[1] as TermRef["term"], year: Number(m[2]) } : null;
}
const TERM_NAMES = { FA: "Fall", SP: "Spring", SU: "Summer" } as const;
export const termLabel = (k: string) => {
  const t = parseTermKey(k);
  return t ? `${TERM_NAMES[t.term]} ${t.year}` : k;
};

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getEnvelope<T>(resource: "terms" | "areas" | "sections", term?: string): Promise<Envelope<T> & { source: DataSource }> {
  const cfg = await loadConfig();
  const errors: string[] = [];
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    try {
      const qs = new URLSearchParams({ resource });
      if (term) qs.set("term", term);
      const r = await fetchWithTimeout(
        `${cfg.supabaseUrl}/functions/v1/hyperschedule?${qs}`,
        { headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}` } },
        20000,
      );
      if (r.ok) {
        const body = (await r.json()) as Envelope<T>;
        if (body && body.data !== undefined) return { ...body, source: "edge" };
      }
      errors.push(`edge ${r.status}`);
    } catch (e) {
      errors.push(`edge ${(e as Error).message}`);
    }
  }
  const file = resource === "sections" ? `sections-${term}.json` : `${resource}.json`;
  const r = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/${file}`, { cache: "no-cache" }, 30000);
  if (!r.ok) {
    throw new Error(
      resource === "sections"
        ? `No live or snapshot data for ${termLabel(term || "")}${errors.length ? ` (${errors.join(", ")})` : ""}. The snapshot only holds the most recent terms; deploy the Edge Function to browse older ones.`
        : `Could not load ${resource} (${errors.concat(`snapshot ${r.status}`).join(", ")})`,
    );
  }
  const body = (await r.json()) as Envelope<T>;
  return { ...body, source: "snapshot" };
}

export async function loadTerms() {
  const e = await getEnvelope<TermRef[]>("terms");
  // The snapshot only holds a few terms; list just those so the picker never offers a dead end.
  const terms = e.source === "snapshot" && e.available?.length ? e.data.filter((t) => e.available!.includes(termKey(t))) : e.data;
  return { terms, fetchedAt: e.fetchedAt, source: e.source };
}

export async function loadAreas(): Promise<AreaInfo[]> {
  const e = await getEnvelope<AreaInfo[]>("areas");
  return e.data;
}

export interface TermData {
  termKey: string;
  courses: Course[];
  fetchedAt: string;
  source: DataSource;
}

const sectionCache = new Map<string, Promise<TermData>>();
export function loadSections(key: string, force = false): Promise<TermData> {
  if (force) sectionCache.delete(key);
  let p = sectionCache.get(key);
  if (!p) {
    p = getEnvelope<RawSection[]>("sections", key).then((e) => {
      if (!Array.isArray(e.data)) throw new Error("Unexpected response shape for sections");
      return { termKey: key, courses: normalizeAll(e.data), fetchedAt: e.fetchedAt, source: e.source };
    });
    p.catch(() => sectionCache.delete(key));
    sectionCache.set(key, p);
  }
  return p;
}

/** First listed term that actually has sections (the API lists future terms that may be empty). */
export async function pickDefaultTerm(terms: TermRef[]): Promise<TermData> {
  let lastErr: unknown;
  for (const t of terms.slice(0, 4)) {
    try {
      const d = await loadSections(termKey(t));
      if (d.courses.length > 0) return d;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No term has any sections yet.");
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
