// Fetches real Hyperschedule data into public/data/ so the static site has a
// same-origin fallback (Hyperschedule sends no CORS headers).
// Run by GitHub Actions before every build. Usage: node scripts/fetch-snapshot.mjs [termCount]
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://banana.hyperschedule.io/v4";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const termCount = Number(process.argv[2] || 3);

async function get(path) {
  const r = await fetch(`${API}${path}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}
const write = (name, data, extra = {}) =>
  writeFile(join(OUT, name), JSON.stringify({ fetchedAt: new Date().toISOString(), ...extra, data }));

await mkdir(OUT, { recursive: true });
const terms = await get("/term/all");
if (!Array.isArray(terms) || terms.length === 0) throw new Error("term/all returned nothing");
await write("areas.json", await get("/course-areas"));
const available = [];

let saved = 0;
for (const t of terms) {
  if (saved >= termCount) break;
  const key = `${t.term}${t.year}`;
  try {
    const sections = await get(`/sections/${key}`);
    if (!Array.isArray(sections) || sections.length === 0) {
      console.log(`skip ${key}: empty`);
      continue;
    }
    await write(`sections-${key}.json`, sections);
    console.log(`saved ${key}: ${sections.length} sections`);
    available.push(key);
    saved++;
  } catch (e) {
    console.log(`skip ${key}: ${e.message}`);
  }
}
// the term list records which terms this snapshot can actually serve
await write("terms.json", terms, { available });
if (saved === 0) throw new Error("No term had any sections; refusing to publish an empty snapshot.");
