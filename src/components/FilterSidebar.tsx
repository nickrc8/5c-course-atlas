import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { useData, useSchedule } from "../data";
import { facetCounts } from "../lib/filters";
import { CAMPUSES, CAMPUS_NAMES, DAY_NAMES, WEEKDAYS, type Campus } from "../types";
import { fromTimeInput, toTimeInput, fmtMeeting } from "../lib/time";
import { Toggle } from "./common";

function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: number }) {
  return (
    <details className="fsec" open={defaultOpen}>
      <summary>{title}{badge ? <span className="count-pill">{badge}</span> : null}</summary>
      <div className="fsec-body">{children}</div>
    </details>
  );
}

const COLLEGE_PREFIX: Record<string, Campus> = { "1": "PO", "2": "SC", "3": "CM", "4": "HM", "5": "PZ" };

export function FilterSidebar() {
  const f = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const addBlock = useStore((s) => s.addBlock);
  const removeBlock = useStore((s) => s.removeBlock);
  const { courses, deptName, areaName } = useData();
  const { active } = useSchedule();
  const ctx = useMemo(() => ({ schedule: active }), [active]);

  const campusCounts = useMemo(() => facetCounts(courses, f, ctx, "campuses", (c) => [c.campus]), [courses, f, ctx]);
  const deptCounts = useMemo(() => facetCounts(courses, f, ctx, "depts", (c) => [c.dept]), [courses, f, ctx]);
  const dayCounts = useMemo(() => facetCounts(courses, f, ctx, "days", (c) => [...new Set(c.meetings.flatMap((m) => m.days))]), [courses, f, ctx]);
  const creditCounts = useMemo(() => facetCounts(courses, f, ctx, "credits", (c) => [c.credits]), [courses, f, ctx]);
  const reqCounts = useMemo(() => facetCounts(courses, f, ctx, "reqs", (c) => c.areas.filter((a) => /^\d/.test(a))), [courses, f, ctx]);
  const allReqs = useMemo(() => [...new Set(courses.flatMap((c) => c.areas.filter((a) => /^\d/.test(a))))].sort(), [courses]);
  const allDepts = useMemo(() => [...new Set(courses.map((c) => c.dept))].sort(), [courses]);
  const allCredits = useMemo(() => [...new Set(courses.map((c) => c.credits))].sort((a, b) => a - b), [courses]);

  const [deptQ, setDeptQ] = useState("");
  const [reqQ, setReqQ] = useState("");
  const [introPick, setIntroPick] = useState("");
  const [bDays, setBDays] = useState<string[]>(["T", "R"]);
  const [bStart, setBStart] = useState("14:00");
  const [bEnd, setBEnd] = useState("16:00");

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const deptList = allDepts.filter((d) => !deptQ || `${d} ${deptName(d)}`.toLowerCase().includes(deptQ.toLowerCase()));
  const reqList = allReqs.filter((r) => !reqQ || `${r} ${areaName(r)}`.toLowerCase().includes(reqQ.toLowerCase()));
  const blockOk = bDays.length > 0 && fromTimeInput(bEnd) > fromTimeInput(bStart);

  const activeCount =
    (f.campuses.length ? 1 : 0) + (f.depts.length ? 1 : 0) + (f.days.length ? 1 : 0) + (f.credits.length ? 1 : 0) + (f.openOnly ? 1 : 0) +
    (f.reqs.length ? 1 : 0) + (f.noBefore ? 1 : 0) + (f.noAfter ? 1 : 0) + (f.noFriday ? 1 : 0) + (f.blocks.length ? 1 : 0) +
    (f.hideConflicts ? 1 : 0) + (f.excludeIntro ? 1 : 0) + (f.introDepts.length ? 1 : 0) + (f.excludeSenior ? 1 : 0);

  return (
    <div className="filters">
      <div className="filters-top">
        <strong>Filters</strong>
        {activeCount > 0 && <button className="link" onClick={resetFilters}>Reset all ({activeCount})</button>}
      </div>

      <Section title="Quick presets">
        <div className="chips">
          <button className={`chip chip-btn ${f.noBefore ? "on" : ""}`} onClick={() => setFilters({ noBefore: !f.noBefore })} aria-pressed={f.noBefore}>Nothing before 10:00 AM</button>
          <button className={`chip chip-btn ${f.noAfter ? "on" : ""}`} onClick={() => setFilters({ noAfter: !f.noAfter })} aria-pressed={f.noAfter}>Nothing after 4:00 PM</button>
          <button className={`chip chip-btn ${f.noFriday ? "on" : ""}`} onClick={() => setFilters({ noFriday: !f.noFriday })} aria-pressed={f.noFriday}>No Friday classes</button>
        </div>
        <Toggle checked={f.openOnly} onChange={(v) => setFilters({ openOnly: v })} label="Open seats only" />
        <Toggle checked={f.hideConflicts} onChange={(v) => setFilters({ hideConflicts: v })} label="Hide conflicts with My Schedule" hint={active.length ? `Checks against ${active.length} active course(s)` : "Your schedule is empty, so nothing is hidden yet"} />
      </Section>

      <Section title="Campus" badge={f.campuses.length}>
        <div className="chips">
          {CAMPUSES.map((c) => (
            <button key={c} className={`chip chip-btn campus-chip campus-${c} ${f.campuses.includes(c) ? "on" : ""}`} aria-pressed={f.campuses.includes(c)}
              onClick={() => setFilters({ campuses: toggle(f.campuses, c) })} title={CAMPUS_NAMES[c]}>
              {c} <span className="n">{campusCounts.get(c) || 0}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Requirement categories" badge={f.reqs.length}>
        <div className="seg" role="group" aria-label="Match mode">
          <button className={f.reqMode === "any" ? "on" : ""} onClick={() => setFilters({ reqMode: "any" })}>Match ANY</button>
          <button className={f.reqMode === "all" ? "on" : ""} onClick={() => setFilters({ reqMode: "all" })}>Match ALL</button>
        </div>
        <p className="hint">Tags come from each college's registrar data. Pick several: {f.reqMode === "any" ? "a course needs at least one" : "a course needs every one"}.</p>
        {f.reqs.length > 0 && (
          <div className="chips">
            {f.reqs.map((r) => (
              <button key={r} className="chip chip-btn on" onClick={() => setFilters({ reqs: f.reqs.filter((x) => x !== r) })} title={areaName(r)}>{r} ✕</button>
            ))}
          </div>
        )}
        <input className="input" placeholder="Find a category…" value={reqQ} onChange={(e) => setReqQ(e.target.value)} aria-label="Find a requirement category" />
        <div className="checklist">
          {(["1", "2", "3", "4", "5"] as const).map((p) => {
            const items = reqList.filter((r) => r[0] === p);
            if (!items.length) return null;
            return (
              <div key={p}>
                <div className="group-label"><span className={`badge campus-${COLLEGE_PREFIX[p]}`}>{COLLEGE_PREFIX[p]}</span></div>
                {items.map((r) => (
                  <label key={r} className="check">
                    <input type="checkbox" checked={f.reqs.includes(r)} onChange={() => setFilters({ reqs: toggle(f.reqs, r) })} />
                    <span className="check-text"><span className="mono">{r}</span> {areaName(r).replace(/^(PO|SC|CMC|CM|HM|PZ)\s+/, "")}</span>
                    <span className="n">{reqCounts.get(r) || 0}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Department" badge={f.depts.length} defaultOpen={false}>
        <input className="input" placeholder="Find a department…" value={deptQ} onChange={(e) => setDeptQ(e.target.value)} aria-label="Find a department" />
        <div className="checklist">
          {deptList.map((d) => (
            <label key={d} className="check">
              <input type="checkbox" checked={f.depts.includes(d)} onChange={() => setFilters({ depts: toggle(f.depts, d) })} />
              <span className="check-text"><span className="mono">{d}</span> {deptName(d) !== d ? deptName(d) : ""}</span>
              <span className="n">{deptCounts.get(d) || 0}</span>
            </label>
          ))}
          {deptList.length === 0 && <p className="hint">No departments match.</p>}
        </div>
      </Section>

      <Section title="Days (R = Thursday)" badge={f.days.length}>
        <div className="chips">
          {WEEKDAYS.map((d) => (
            <button key={d} className={`chip chip-btn day ${f.days.includes(d) ? "on" : ""}`} aria-pressed={f.days.includes(d)} onClick={() => setFilters({ days: toggle(f.days, d) })} title={DAY_NAMES[d]}>
              {d} <span className="n">{dayCounts.get(d) || 0}</span>
            </button>
          ))}
        </div>
        <p className="hint">Shows sections that meet only on the days you pick. Sections with no posted time are kept.</p>
      </Section>

      <Section title="Credits" badge={f.credits.length} defaultOpen={false}>
        <div className="chips">
          {allCredits.map((c) => (
            <button key={c} className={`chip chip-btn ${f.credits.includes(c) ? "on" : ""}`} aria-pressed={f.credits.includes(c)} onClick={() => setFilters({ credits: toggle(f.credits, c) })}>
              {c} <span className="n">{creditCounts.get(c) || 0}</span>
            </button>
          ))}
        </div>
        <p className="hint">Harvey Mudd lists 3 for a full course; the other colleges list 1.</p>
      </Section>

      <Section title="Block out times" badge={f.blocks.length}>
        <p className="hint">Hide any section that overlaps these windows (practice, work, meetings).</p>
        <div className="chips">
          {WEEKDAYS.map((d) => (
            <button key={d} className={`chip chip-btn day ${bDays.includes(d) ? "on" : ""}`} aria-pressed={bDays.includes(d)} onClick={() => setBDays(toggle(bDays, d))}>{d}</button>
          ))}
        </div>
        <div className="time-row">
          <input type="time" className="input" value={bStart} onChange={(e) => setBStart(e.target.value)} aria-label="Block start time" />
          <span>to</span>
          <input type="time" className="input" value={bEnd} onChange={(e) => setBEnd(e.target.value)} aria-label="Block end time" />
        </div>
        <button className="btn btn-primary btn-block" disabled={!blockOk} onClick={() => addBlock({ days: bDays, start: fromTimeInput(bStart), end: fromTimeInput(bEnd) })}>
          Add blocked window
        </button>
        {!blockOk && <p className="hint warn">Pick at least one day and an end time after the start.</p>}
        {f.blocks.map((b) => (
          <div key={b.id} className="block-item">
            <span>{fmtMeeting({ days: b.days, start: b.start, end: b.end, loc: "" })}</span>
            <button className="icon-btn" onClick={() => removeBlock(b.id)} aria-label="Remove blocked window">✕</button>
          </div>
        ))}
      </Section>

      <Section title="Intro classes">
        <Toggle checked={f.excludeIntro} onChange={(v) => setFilters({ excludeIntro: v })} label="Exclude all intro-level classes" hint="Course number under 100, or the title says Intro / Introduction" />
        <p className="hint">Or hide intro classes only in certain fields:</p>
        <div className="time-row">
          <select className="input" value={introPick} onChange={(e) => setIntroPick(e.target.value)} aria-label="Department to hide intro classes in">
            <option value="">Choose a field…</option>
            {allDepts.filter((d) => !f.introDepts.includes(d)).map((d) => <option key={d} value={d}>{d}{deptName(d) !== d ? ` · ${deptName(d)}` : ""}</option>)}
          </select>
          <button className="btn" disabled={!introPick} onClick={() => { setFilters({ introDepts: [...f.introDepts, introPick] }); setIntroPick(""); }}>Add</button>
        </div>
        <div className="chips">
          {f.introDepts.map((d) => (
            <button key={d} className="chip chip-btn on" onClick={() => setFilters({ introDepts: f.introDepts.filter((x) => x !== d) })} title="Remove">no intro {d} ✕</button>
          ))}
        </div>
      </Section>

      <Section title="Senior seminars and capstones">
        <Toggle checked={f.excludeSenior} onChange={(v) => setFilters({ excludeSenior: v })} label="Exclude seminars, theses, capstones, independent study" hint="Numbers 190–199, or the title or description says senior seminar, thesis, capstone, colloquium, independent study" />
      </Section>
    </div>
  );
}
