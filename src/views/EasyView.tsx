import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useData, useSchedule } from "../data";
import { easyElectives } from "../lib/recommend";
import { CourseRow } from "../components/CourseRow";
import { Empty, Toggle } from "../components/common";
import { useUI } from "../ui";
import { termLabel } from "../lib/hyperschedule";

export function EasyView() {
  const { courses, termKey } = useData();
  const { active } = useSchedule();
  const majors = useStore((s) => s.majors);
  const filters = useStore((s) => s.filters);
  const max = useStore((s) => s.easyMaxWeekly);
  const setMax = useStore((s) => s.setEasyMax);
  const setTab = useUI((s) => s.setTab);
  const [hideConflicts, setHide] = useState(true);
  const [fullOnly, setFullOnly] = useState(true);
  const [shown, setShown] = useState(30);

  const list = useMemo(
    () => easyElectives(courses, { majors, schedule: active, filters, maxWeeklyMin: max, hideConflicts, minCredit: fullOnly ? 1 : 0.25 }),
    [courses, majors, active, filters, max, hideConflicts, fullOnly],
  );
  const hasMajorDepts = majors.some((m) => m.depts.length > 0);

  return (
    <div className="page">
      <h1 className="h1">Easy Electives <span className="muted">· {termLabel(termKey)}</span></h1>
      <p className="lede">Open sections outside your major with no prerequisite language in the description and a lighter weekly meeting pattern. This is a pattern filter, not a workload rating: Atlas has no data on reading, papers or grading.</p>

      <section className="card">
        <label className="slider">
          <span>Meets at most <strong>{max} minutes</strong> per week <span className="muted">(about {Math.round(max / 75 * 10) / 10} class meetings of 75 min)</span></span>
          <input type="range" min={50} max={400} step={10} value={max} onChange={(e) => setMax(Number(e.target.value))} />
        </label>
        <div className="toggle-row">
          <Toggle checked={hideConflicts} onChange={setHide} label="Hide clashes with My Schedule and block-outs" />
          <Toggle checked={fullOnly} onChange={setFullOnly} label="Full courses only (1 credit or more)" hint="Hides half-credit, activity and PE sections. HMC credits are converted so a 3-credit HMC course counts as 1." />
        </div>
        {!hasMajorDepts && <p className="hint warn">No major department codes are set, so nothing is excluded for being in your major. Add yours in <button className="link" onClick={() => setTab("requirements")}>Requirements</button>.</p>}
        <p className="hint">Sections with no published description are left out, because “no prerequisite language” cannot be claimed without a description. Prerequisite detection is a text match, so read the description before you enroll.</p>
      </section>

      <div className="results-head"><span><strong>{list.length}</strong> courses</span></div>
      {list.length === 0 ? <Empty title="Nothing matches">Raise the weekly-minutes limit or turn off the clash filter.</Empty> : (
        <div className="list">
          {list.slice(0, shown).map((c) => <CourseRow key={c.id} c={c} extra={<span className="muted tiny">{c.weeklyMin} min/wk · {c.dayCount} day{c.dayCount === 1 ? "" : "s"}</span>} />)}
          {shown < list.length && <button className="btn btn-block" onClick={() => setShown(shown + 30)}>Show more ({list.length - shown} left)</button>}
        </div>
      )}
    </div>
  );
}
