import { loadConfig } from "./hyperschedule";
import { bearerToken } from "./sync";
import type { AtlasContext } from "./localAtlas";

export interface ChatMsg { role: "user" | "assistant"; content: string }

export interface AtlasReply {
  /** assistant text. Course references look like [[course:SP2027:CSCI-062-PO-01]] */
  reply: string;
  /** section ids the server verified against the live dataset */
  courseIds: string[];
}

export async function atlasConfigured(): Promise<boolean> {
  const c = await loadConfig();
  return !!(c.supabaseUrl && c.supabaseAnonKey);
}

export class AtlasUnavailable extends Error {}

export async function askAtlas(messages: ChatMsg[], context: AtlasContext): Promise<AtlasReply> {
  const cfg = await loadConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new AtlasUnavailable("Edge Function not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${cfg.supabaseUrl}/functions/v1/atlas`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${await bearerToken()}` },
      body: JSON.stringify({ messages: messages.slice(-12), context, termKey: context.termKey }),
    });
    if (r.status === 404 || r.status === 503) throw new AtlasUnavailable(`Atlas function returned ${r.status}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (body?.code === "no_api_key") throw new AtlasUnavailable("The Atlas function has no ANTHROPIC_API_KEY secret set");
      throw new Error(body?.error || `Atlas returned HTTP ${r.status}`);
    }
    return body as AtlasReply;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Atlas took too long to answer. Try a narrower question.");
    if (e instanceof TypeError) throw new AtlasUnavailable("Could not reach the Atlas function");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const REF = /\[\[course:([^\]\s]+)\]\]/g;
/** Splits assistant text into text and course-id pieces. */
export function splitReply(text: string): ({ t: "text"; v: string } | { t: "course"; v: string })[] {
  const out: ({ t: "text"; v: string } | { t: "course"; v: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    if (m.index! > last) out.push({ t: "text", v: text.slice(last, m.index) });
    out.push({ t: "course", v: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}
