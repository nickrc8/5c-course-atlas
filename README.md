# 5C Course Atlas

Course search, scheduling, graduation-requirement tracking and an AI advisor for Pomona, Claremont McKenna, Scripps, Harvey Mudd and Pitzer. Hosted as a static GitHub Pages site.

- **Real data only.** Every section comes from [Hyperschedule](https://hyperschedule.io)'s public v4 API. Nothing is invented: no courses, times, seat counts, ratings or professor bios.
- **No login wall.** Everything works as a guest and saves to `localStorage`. An optional Atlas account (email or Google) syncs that data across devices.
- **Views:** Search (multi-facet filters), My Schedule (weekly grid, tentative toggle, `.ics` export), For You, Easy Electives, Requirements (per-college checklists, majors and minors), professor cards, and Ask Atlas.

## How the data gets to the browser

Hyperschedule sends no CORS headers, so a browser cannot call it directly. Two paths, same JSON envelope `{ fetchedAt, data }`:

1. **Supabase Edge Function `hyperschedule`** (live, cached 5 min). Used when `public/config.json` has a Supabase URL and anon key.
2. **GitHub Actions snapshot** in `public/data/`. `.github/workflows/deploy.yml` fetches the 3 latest terms on every push and every 30 minutes, then rebuilds and deploys. This is the fallback and works with zero setup.

The nav bar shows "Last synced …" and a dot: green = live through the Edge Function, amber = snapshot.

## Deploy the site (no backend needed)

1. Create a GitHub repo and push this folder to `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The `Deploy to GitHub Pages` workflow runs. Your site is at `https://<user>.github.io/<repo>/`.

Without Supabase you get everything except cloud sign-in and the AI model. Ask Atlas still works through a clearly labelled **offline keyword parser** over the real data.

## Turn on live data, accounts and the AI advisor (Supabase)

1. Create a project at supabase.com. Note the **Project URL**, **anon key** (Settings → API) and **project ref**.
2. Run `supabase/migrations/20261119000000_user_state.sql` in the SQL editor (creates `user_state` with row-level security).
3. Deploy the functions, either with the CLI:
   ```bash
   supabase login
   supabase functions deploy hyperschedule --project-ref <ref> --no-verify-jwt
   supabase functions deploy atlas --project-ref <ref> --no-verify-jwt
   supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref <ref>
   ```
   or run the manual **Deploy Supabase Edge Functions** workflow (needs repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`; you still set `ANTHROPIC_API_KEY` once with the command above).
4. In the GitHub repo, **Settings → Secrets and variables → Actions → Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The deploy workflow writes them into `config.json`. (The anon key is public by design; row-level security protects user data.)
5. Auth → Providers: enable Email, and Google if you want it (needs a Google OAuth client). Under Auth → URL Configuration add your Pages URL as a redirect.

Optional: `ATLAS_MODEL` secret overrides the default model (`claude-sonnet-5-5`).

**Cost and abuse note.** Ask Atlas works for guests, so anyone with your site URL can spend your Anthropic credits. The function has a small per-IP rate limit (20 questions per 10 minutes per isolate). Set a spend limit in the Anthropic console.

## Ask Atlas grounding

Claude gets two tools (`search_courses`, `list_requirement_areas`) that run over the live dataset. It may only show a course by emitting `[[course:<id>]]`. The Edge Function deletes any marker whose id is not a real section, and the browser drops any id it cannot find in the loaded term before rendering a card. Cards are rendered by the app from the real data, never from model text.

## Develop

```bash
npm install
npm run snapshot   # pulls real data into public/data (git-ignored)
npm run dev        # http://localhost:5173
npm test           # 28 tests against the real snapshot
npm run build
```

## Known limits

- **No CRNs.** Hyperschedule does not publish CRNs, so search matches section codes (e.g. `CSCI 062 PO`), not CRNs.
- **Requirements are a planning aid, not a degree audit.** Each item is labelled *official*, *secondary* or *count unconfirmed*. Scripps counts other than the 32-course total are from secondary sources because the Scripps catalog page failed TLS verification when read. Pomona's writing, speaking, difference, language and PE counts were not on the pages read, so they are trackers without a target number. Verify everything with the registrar.
- **Majors and minors are user-built.** Pick departments, then add your own requirement items. No major checklists are pre-filled.
- **Prerequisite and "intro" detection are text heuristics.** Sections with no description are excluded from Easy Electives.
- **Rate My Professors "current college" link** is a Google search restricted to ratemyprofessors.com and the college name (school IDs were not verifiable). The all-schools link is a direct RMP search.
- **Planned credits** count only the active courses of the selected term, because only that term's data is loaded.
- HMC credits are shown divided by 3 in degree totals (3 HMC credits = one full course). Verify this against your own audit.
