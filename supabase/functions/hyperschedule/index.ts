// Supabase Edge Function: CORS-friendly, cached proxy for the Hyperschedule v4 API.
// GET /functions/v1/hyperschedule?resource=terms|areas|sections[&term=SP2027]
// Returns { fetchedAt, data } where data is Hyperschedule's JSON, untouched.

const UPSTREAM = "https://banana.hyperschedule.io/v4";
const TTL_MS: Record<string, number> = { terms: 60 * 60_000, areas: 60 * 60_000, sections: 5 * 60_000 };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

interface Entry { at: number; raw: string }
const cache = new Map<string, Entry>();

function json(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...CORS, "content-type": "application/json", ...extra } });
}

async function upstream(path: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(`${UPSTREAM}${path}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`Hyperschedule returned HTTP ${r.status}`);
    const raw = await r.text();
    if (!raw.trimStart().startsWith("[")) throw new Error("Unexpected upstream payload");
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json(JSON.stringify({ error: "GET only" }), 405);

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") || "";
  const term = url.searchParams.get("term") || "";

  let path: string;
  if (resource === "terms") path = "/term/all";
  else if (resource === "areas") path = "/course-areas";
  else if (resource === "sections") {
    if (!/^(FA|SP|SU)\d{4}$/.test(term)) return json(JSON.stringify({ error: "term must look like SP2027" }), 400);
    path = `/sections/${term}`;
  } else return json(JSON.stringify({ error: "resource must be terms, areas or sections" }), 400);

  const key = resource === "sections" ? `s:${term}` : resource;
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS[resource];
  let entry = fresh ? hit : undefined;
  let stale = false;

  if (!entry) {
    try {
      const raw = await upstream(path);
      entry = { at: Date.now(), raw };
      cache.set(key, entry);
    } catch (e) {
      if (hit) { entry = hit; stale = true; } // serve stale rather than fail
      else return json(JSON.stringify({ error: (e as Error).message }), 502);
    }
  }

  const fetchedAt = new Date(entry.at).toISOString();
  return json(`{"fetchedAt":"${fetchedAt}","data":${entry.raw}}`, 200, {
    "cache-control": "public, max-age=60, s-maxage=300",
    ...(stale ? { "x-atlas-stale": "1" } : {}),
  });
});
