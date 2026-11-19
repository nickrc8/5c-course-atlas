import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useData, useProgress, useSchedule } from "../data";
import { forYou } from "../lib/recommend";
import { CourseRow } from "../components/CourseRow";
import { Empty } from "../components/common";
import { useUI } from "../ui";
import { termLabel } from "../lib/hyperschedule";

export function ForYouView() {
  const { courses, termKey } = useData();
  const { active } = useSchedule();
  const progress = useProgress();
  const college = useStore((s) => s.college);
  const majors = useStore((s) => s.majors);
  const minors = useStore((s) => s.minors);
  const interests = useStore((s) => s.interests);
  const setInterests = useStore((s) => s.setInterests);
  const completed = useStore((s) => s.completed);
  const filters = useStore((s) => s.filters);
  const setTab = useUI((s) => s.setTab);
  const [tag, setTag] = useState("");
  const [shown, setShown] = useState(30);

  const recs = useMemo(
    () => forYou(courses, { progress, majors, minors, interests, schedule: active, filters, completedCodes: new Set(completed.map((c) => c.id.replace(/^done:/, "").replace(/-[a-z0-9]{4}$/, ""))) }),
    [courses, progress, majors, minors, interests, active, filters, completed],
  );

  const addTag = () => {
    const t = tag.trim().toLowerCase();
    if (t && !interests.includes(t)) setInterests([...interests, t]);
    setTag("");
  };
  const personalized = !!college || majors.length > 0 || minors.length > 0 || interests.length > 0;

  return (
    <div className="page">
      <h1 className="h1">For You <span className="muted">· {termLabel(termKey)}</span></h1>
      <p className="lede">Open sections ranked by how many of your unmet requirements they cover, your majors and minors, and your interests. Anything that clashes with your active schedule or your block-outs is left out.</p>

      <section className="card">
        <div className="label">Interest tags</div>
        <div className="chips">
          {interests.map((t) => <button key={t} className="chip chip-btn on" onClick={() => setInterests(interests.filter((x) => x !== t))}>{t} ✕</button>)}
          {interests.length === 0 && <span className="muted tiny">e.g. film, climate, statistics, poetry</span>}
        </div>
        <div className="form-row">
          <input className="input grow" placeholder="Add an interest (matched against titles and descriptions)" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTag(); }} />
          <button className="btn" disabled={!tag.trim()} onClick={addTag}>Add</button>
        </div>
        <p className="hint">Using: {college ? `home college ${college}` : "no home college yet"}; {majors.length ? `major ${majors.map((m) => m.name).join(", ")}` : "no major"}; {active.length} active course{active.length === 1 ? "" : "s"} in your schedule{filters.blocks.length ? `; ${filters.blocks.length} blocked window${filters.blocks.length === 1 ? "" : "s"}` : ""}.</p>
      </section>

      {!personalized && (
        <Empty title="Tell Atlas about you first">
          Choose your college and majors in <button className="link" onClick={() => setTab("requirements")}>Requirements</button>, or add an interest tag above.
        </Empty>
      )}
      {personalized && recs.length === 0 && <Empty title="No open matches right now">Try removing a block-out, or add another interest.</Empty>}
      <div className="list">
        {recs.slice(0, shown).map((r) => (
          <CourseRow key={r.course.id} c={r.course} reasons={r.reasons} extra={r.sections > 1 ? <span className="muted tiny">{r.sections} open sections</span> : undefined} />
        ))}
        {shown < recs.length && <button className="btn btn-block" onClick={() => setShown(shown + 30)}>Show more ({recs.length - shown} left)</button>}
      </div>
    </div>
  );
}
