import { useMemo, useState } from "react";
import { CAMPUSES, CAMPUS_NAMES, type Campus } from "../types";
import { useStore, uid, type Program } from "../store";
import { useData, useProgress, useSchedule } from "../data";
import { COLLEGE_REQS, CONFIDENCE_LABEL, type Matcher } from "../lib/reqdata";
import { areasForItem, overall, type CompletedCourse, type CourseRef, type ItemProgress } from "../lib/requirements";
import { CampusBadge, Empty, Modal } from "../components/common";
import { useUI } from "../ui";

function Bar({ done, planned, needed }: { done: number; planned: number; needed: number }) {
  const d = needed > 0 ? Math.min(100, (done / needed) * 100) : 0;
  const p = needed > 0 ? Math.min(100 - d, (planned / needed) * 100) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.min(done, needed)}>
      <div className="bar-done" style={{ width: `${d}%` }} />
      <div className="bar-plan" style={{ width: `${p}%`, left: `${d}%` }} />
    </div>
  );
}

function unitLabel(p: ItemProgress): string {
  switch (p.item.kind) {
    case "credits": return "credits";
    case "distinctDept": return "disciplines";
    case "concentration": return "in one discipline";
    case "pick": return "fields";
    default: return p.needed === 1 ? "course" : "courses";
  }
}

export function RequirementsView() {
  const college = useStore((s) => s.college);
  const setCollege = useStore((s) => s.setCollege);
  const progress = useProgress();
  const setTab = useUI((s) => s.setTab);

  if (!college) {
    return (
      <div className="reqs">
        <h1 className="h1">Graduation requirements</h1>
        <p className="lede">Pick your home college to load its general-education checklist. Planned courses (active ones in My Schedule) and completed courses count automatically.</p>
        <div className="college-grid">
          {CAMPUSES.map((c) => (
            <button key={c} className={`college-card campus-${c}`} onClick={() => setCollege(c)}>
              <span className={`badge campus-${c}`}>{c}</span>
              <strong>{CAMPUS_NAMES[c]}</strong>
            </button>
          ))}
        </div>
        <p className="hint">Not signed in? Nothing is lost: this saves in your browser. <button className="link" onClick={() => setTab("search")}>Back to search</button></p>
      </div>
    );
  }
  return <Tracker college={college} progress={progress} />;
}

function Tracker({ college, progress }: { college: Campus; progress: ItemProgress[] }) {
  const def = COLLEGE_REQS[college];
  const setCollege = useStore((s) => s.setCollege);
  const manualDone = useStore((s) => s.manualDone);
  const setManualDone = useStore((s) => s.setManualDone);
  const setManualOption = useStore((s) => s.setManualOption);
  const removeCustom = useStore((s) => s.removeCustomReq);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const setTab = useUI((s) => s.setTab);
  const { areaName } = useData();
  const [override, setOverride] = useState<CourseRef | null>(null);

  const sum = overall(progress);
  const groups = useMemo(() => {
    const m = new Map<string, ItemProgress[]>();
    for (const p of progress) { if (!m.has(p.item.group)) m.set(p.item.group, []); m.get(p.item.group)!.push(p); }
    return [...m];
  }, [progress]);

  const findCourses = (p: ItemProgress) => {
    const areas = areasForItem(p.item);
    const depts = [...new Set((p.item.matchers || []).map((m) => m.dept).filter(Boolean) as string[])];
    resetFilters();
    if (areas.length) setFilters({ reqs: areas, reqMode: "any", openOnly: true });
    else if (depts.length) setFilters({ depts, openOnly: true });
    setTab("search");
  };

  return (
    <div className="reqs">
      <div className="reqs-head">
        <div>
          <h1 className="h1"><CampusBadge campus={college} /> {def.name}</h1>
          <p className="lede">{def.summary}</p>
          <div className="link-row">
            <a className="btn" href={def.link} target="_blank" rel="noopener noreferrer">Verify in Official Catalog ↗</a>
            {def.extraLinks?.map((l) => <a key={l.href} className="btn btn-quiet" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}
          </div>
        </div>
        <div className="summary-card">
          <div className="big">{sum.complete}<span className="muted"> / {sum.total}</span></div>
          <div className="muted">requirements complete</div>
          <div className="small">{sum.covered} covered once your active schedule is counted</div>
          <button className="link" onClick={() => setCollege(null)}>Change college</button>
        </div>
      </div>

      <div className="alert">
        This is a planning aid, not a degree audit. Requirement tags come from Hyperschedule's registrar data, and counts are labeled by how well I could confirm them. Always confirm with your registrar. Planned means active courses in <button className="link" onClick={() => setTab("schedule")}>My Schedule</button> for the selected term.
      </div>

      <Setup />

      {groups.map(([group, items]) => (
        <section key={group} className="req-group">
          <h2 className="h2">{group}</h2>
          <div className="req-list">
            {items.map((p) => {
              const canFind = areasForItem(p.item).length > 0 || (p.item.matchers || []).some((m) => m.dept);
              const complete = p.complete;
              return (
                <div key={p.item.id} className={`req ${complete ? "is-complete" : p.covered ? "is-covered" : ""}`}>
                  <div className="req-top">
                    <div className="req-title">
                      <span className={`check-dot ${complete ? "on" : p.covered ? "plan" : ""}`} aria-hidden="true">{complete ? "✓" : p.covered ? "◐" : ""}</span>
                      <strong>{p.item.title}</strong>
                    </div>
                    <span className={`conf conf-${p.item.confidence}`} title={CONFIDENCE_LABEL[p.item.confidence]}>{p.item.confidence === "official" ? "official" : p.item.confidence === "secondary" ? "verify" : "count unconfirmed"}</span>
                  </div>
                  {p.item.kind !== "manual" && !p.tracker && <Bar done={p.done} planned={p.planned} needed={p.needed} />}
                  <div className="req-nums">
                    {p.item.kind === "manual" ? (
                      <span className="muted">{p.manualDone ? "Checked off" : "Not checked off yet"}</span>
                    ) : p.tracker ? (
                      <span>{p.done} counted{p.planned > 0 ? ` · +${p.planned} planned` : ""} <span className="muted">(requirement count not confirmed)</span></span>
                    ) : (
                      <span><strong>{p.done}</strong> of {p.needed} {unitLabel(p)}{p.planned > 0 && <span className="planned"> · +{p.planned} planned</span>}</span>
                    )}
                  </div>
                  {p.item.note && <p className="hint">{p.item.note}</p>}

                  {p.options && (
                    <ul className="opts">
                      {p.options.map((o) => (
                        <li key={o.id} className={`opt opt-${o.state}`}>
                          <span>{o.state === "done" ? "✓" : o.state === "planned" ? "◐" : "○"}</span> {o.label}
                          {o.manual && (
                            <label className="inline-check"><input type="checkbox" checked={!!useStore.getState().manualOptions[`${p.item.id}:${o.id}`]} onChange={(e) => setManualOption(`${p.item.id}:${o.id}`, e.target.checked)} /> I did this</label>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {(p.doneRefs.length > 0 || p.plannedRefs.length > 0) && (
                    <div className="chips">
                      {[...p.doneRefs, ...p.plannedRefs].map((r) => (
                        <button key={r.id + r.kind} className={`chip chip-btn ${r.kind === "planned" ? "chip-plan" : "chip-done"}`} onClick={() => setOverride(r)} title={`${r.title}\nClick to change which requirements this course counts toward`}>
                          {r.kind === "planned" ? "◐" : "✓"} {r.code}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="req-actions">
                    <label className="inline-check" title="Use for transfer credit, waivers, study abroad or anything Atlas cannot see">
                      <input type="checkbox" checked={!!manualDone[p.item.id]} onChange={(e) => setManualDone(p.item.id, e.target.checked)} /> Mark complete
                    </label>
                    {canFind && !complete && <button className="btn btn-sm" onClick={() => findCourses(p)}>Find courses</button>}
                    {p.custom && <button className="btn btn-sm btn-quiet" onClick={() => removeCustom(p.custom!.id)}>Delete item</button>}
                    {areasForItem(p.item).length > 0 && <span className="muted tiny">{areasForItem(p.item).map((a) => `${a}`).join(", ")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <CustomForm />
      <Completed />
      <OverrideModal ref0={override} progress={progress} onClose={() => setOverride(null)} areaName={areaName} />
    </div>
  );
}

function Setup() {
  const majors = useStore((s) => s.majors);
  const minors = useStore((s) => s.minors);
  const extra = useStore((s) => s.extraCredits);
  const setExtra = useStore((s) => s.setExtraCredits);
  const add = useStore((s) => s.addProgram);
  const remove = useStore((s) => s.removeProgram);
  const { depts, deptName } = useData();
  const [pick, setPick] = useState("");
  const [kind, setKind] = useState<"majors" | "minors">("majors");
  const [custom, setCustom] = useState("");
  const [customDepts, setCustomDepts] = useState("");

  const addDept = () => { if (!pick) return; const p: Program = { name: deptName(pick) !== pick ? deptName(pick) : pick, depts: [pick] }; add(kind, p); setPick(""); };
  const addCustom = () => {
    const name = custom.trim(); if (!name) return;
    const codes = customDepts.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    add(kind, { name, depts: codes }); setCustom(""); setCustomDepts("");
  };
  const list = (k: "majors" | "minors", items: Program[]) => (
    <div className="chips">
      {items.map((m) => <button key={m.name} className="chip chip-btn on" onClick={() => remove(k, m.name)} title={m.depts.length ? `Departments: ${m.depts.join(", ")}` : "No department codes attached"}>{m.name} ✕</button>)}
      {items.length === 0 && <span className="muted tiny">None yet</span>}
    </div>
  );
  return (
    <section className="card">
      <h2 className="h2">Your majors and minors</h2>
      <div className="two-col">
        <div><div className="label">Major(s)</div>{list("majors", majors)}</div>
        <div><div className="label">Minor(s)</div>{list("minors", minors)}</div>
      </div>
      <div className="form-row">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "majors" | "minors")} aria-label="Add as"><option value="majors">Major</option><option value="minors">Minor</option></select>
        <select className="input grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Department">
          <option value="">Pick a department from any 5C college…</option>
          {depts.map((d) => <option key={d} value={d}>{d}{deptName(d) !== d ? ` · ${deptName(d)}` : ""}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!pick} onClick={addDept}>Add</button>
      </div>
      <div className="form-row">
        <input className="input grow" placeholder="Or a custom name (e.g. Dual Degree, off-campus major)" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <input className="input" placeholder="Dept codes (optional)" value={customDepts} onChange={(e) => setCustomDepts(e.target.value)} aria-label="Department codes" />
        <button className="btn" disabled={!custom.trim()} onClick={addCustom}>Add</button>
      </div>
      <p className="hint">Department codes let For You and Easy Electives know which fields are yours. Major and minor requirement checklists are yours to build below, because I did not want to guess at them.</p>
      <label className="form-row">
        <span className="label">Credits already earned outside Atlas (transfer, AP/IB, earlier terms you did not add)</span>
        <input className="input narrow" type="number" min={0} step={0.25} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
      </label>
    </section>
  );
}

function CustomForm() {
  const majors = useStore((s) => s.majors);
  const minors = useStore((s) => s.minors);
  const customReqs = useStore((s) => s.customReqs);
  const add = useStore((s) => s.addCustomReq);
  const { depts, deptName } = useData();
  const programs = [...majors.map((m) => ({ scope: "major" as const, name: m.name })), ...minors.map((m) => ({ scope: "minor" as const, name: m.name }))];
  const [prog, setProg] = useState("");
  const [title, setTitle] = useState("");
  const [needed, setNeeded] = useState(1);
  const [dept, setDept] = useState("");
  const [minNum, setMinNum] = useState("");
  const [maxNum, setMaxNum] = useState("");
  const [codes, setCodes] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const sel = programs.find((p) => `${p.scope}:${p.name}` === prog) || programs[0];
    if (!sel) { setErr("Add a major or minor above first."); return; }
    if (!title.trim()) { setErr("Give the requirement a name."); return; }
    const matchers: Matcher[] = [];
    for (const tok of codes.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
      const m = /^([A-Za-z/&]+)\s*0*(\d+)\s*[A-Za-z]?\s*([A-Za-z]{2})?$/.exec(tok);
      if (!m) { setErr(`Could not read “${tok}”. Use a form like POLI 120 or GOVT 020 CM.`); return; }
      matchers.push({ dept: m[1].toUpperCase(), num: Number(m[2]), ...(m[3] ? { affil: m[3].toUpperCase() } : {}) });
    }
    if (dept) matchers.push({ dept, ...(minNum ? { minNum: Number(minNum) } : {}), ...(maxNum ? { maxNum: Number(maxNum) } : {}) });
    if (matchers.length === 0) { setErr("Add a department or at least one course code so Atlas knows what counts. (You can still override individual courses later.)"); return; }
    add({ id: uid("custom"), scope: sel.scope, parent: sel.name, title: title.trim(), needed: Math.max(1, needed), matchers });
    setTitle(""); setCodes(""); setDept(""); setMinNum(""); setMaxNum(""); setNeeded(1); setErr("");
  };
  return (
    <section className="card">
      <h2 className="h2">Add a major or minor requirement</h2>
      <p className="hint">Example: “Upper-division POLI electives”, 4 courses, department POLI, number 100 and up. {customReqs.length > 0 && `${customReqs.length} custom item${customReqs.length === 1 ? "" : "s"} added above.`}</p>
      <div className="form-grid">
        <select className="input" value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Belongs to">
          {programs.length === 0 && <option value="">(add a major or minor first)</option>}
          {programs.map((p) => <option key={`${p.scope}:${p.name}`} value={`${p.scope}:${p.name}`}>{p.scope === "major" ? "Major" : "Minor"}: {p.name}</option>)}
        </select>
        <input className="input" placeholder="Requirement name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" type="number" min={1} value={needed} onChange={(e) => setNeeded(Number(e.target.value))} aria-label="Courses needed" />
        <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Counts: any course in department">
          <option value="">Any course in department…</option>
          {depts.map((d) => <option key={d} value={d}>{d}{deptName(d) !== d ? ` · ${deptName(d)}` : ""}</option>)}
        </select>
        <input className="input" placeholder="Min number (e.g. 100)" value={minNum} onChange={(e) => setMinNum(e.target.value.replace(/\D/g, ""))} />
        <input className="input" placeholder="Max number" value={maxNum} onChange={(e) => setMaxNum(e.target.value.replace(/\D/g, ""))} />
      </div>
      <textarea className="input" rows={2} placeholder="Or specific courses that count, separated by commas: GOVT 020 CM, POLI 120" value={codes} onChange={(e) => setCodes(e.target.value)} />
      {err && <p className="hint warn">{err}</p>}
      <button className="btn btn-primary" onClick={submit}>Add requirement</button>
    </section>
  );
}

function Completed() {
  const completed = useStore((s) => s.completed);
  const add = useStore((s) => s.addCompleted);
  const remove = useStore((s) => s.removeCompleted);
  const college = useStore((s) => s.college)!;
  const { courses, termKey, areaName } = useData();
  const { all } = useSchedule();
  const [q, setQ] = useState("");
  const [mCode, setMCode] = useState("");
  const [mTitle, setMTitle] = useState("");
  const [mCredits, setMCredits] = useState(1);
  const [mAreas, setMAreas] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const hits = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!t.length) return [];
    const seen = new Set<string>();
    return courses.filter((c) => t.every((x) => c.searchText.includes(x))).filter((c) => (seen.has(c.courseKey) ? false : (seen.add(c.courseKey), true))).slice(0, 8);
  }, [q, courses]);

  const collegeAreas = useMemo(() => [...new Set(COLLEGE_REQS[college].items.flatMap((i) => areasForItem(i)))], [college]);

  const addFromCatalog = (i: number) => {
    const c = hits[i];
    add({ id: `done:${c.courseKey}`, code: c.code, title: c.title, credits: c.courseCredit, campus: c.campus, dept: c.dept, num: c.num, affil: c.affil, areas: c.areas, term: termKey });
    setQ("");
  };
  const addManual = () => {
    const m = /^([A-Za-z/&]+)\s*0*(\d+)\s*([A-Za-z]?)\s*([A-Za-z]{2})?$/.exec(mCode.trim());
    if (!m) { setErr("Enter a code like CSCI 062 PO or POLI 120."); return; }
    const dept = m[1].toUpperCase(), num = Number(m[2]), affil = (m[4] || "").toUpperCase();
    const c: CompletedCourse = {
      id: `done:${dept}-${String(num).padStart(3, "0")}${m[3].toUpperCase()}-${affil || "X"}-${Math.random().toString(36).slice(2, 6)}`,
      code: `${dept} ${String(num).padStart(3, "0")}${m[3].toUpperCase()}${affil ? " " + affil : ""}`, title: mTitle.trim() || mCode.trim(),
      credits: mCredits, campus: (CAMPUSES as string[]).includes(affil) ? (affil as Campus) : "", dept, num, affil, areas: mAreas,
    };
    add(c); setMCode(""); setMTitle(""); setMAreas([]); setMCredits(1); setErr("");
  };

  return (
    <section className="card">
      <h2 className="h2">Courses you have completed</h2>
      <p className="hint">Add them from this term's catalog (their requirement tags come along), or enter any past course by hand and tick the requirement tags it earned. {all.length > 0 && "Courses in My Schedule are counted as planned automatically."}</p>
      <input className="input" placeholder="Search this term's catalog to add a completed course…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalog to add a completed course" />
      {hits.length > 0 && (
        <ul className="pick-list">
          {hits.map((c, i) => <li key={c.id}><button className="pick" onClick={() => addFromCatalog(i)}><CampusBadge campus={c.campus} /> <span className="code">{c.code}</span> {c.title}<span className="plus">+ completed</span></button></li>)}
        </ul>
      )}
      <details className="manual">
        <summary>Enter a past course by hand</summary>
        <div className="form-grid">
          <input className="input" placeholder="Code, e.g. CSCI 062 PO" value={mCode} onChange={(e) => setMCode(e.target.value)} />
          <input className="input" placeholder="Title (optional)" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
          <input className="input" type="number" min={0} step={0.25} value={mCredits} onChange={(e) => setMCredits(Number(e.target.value))} aria-label="Course credits" />
        </div>
        <div className="label">Requirement tags it earned</div>
        <div className="chips">
          {collegeAreas.map((a) => <button key={a} className={`chip chip-btn ${mAreas.includes(a) ? "on" : ""}`} onClick={() => setMAreas(mAreas.includes(a) ? mAreas.filter((x) => x !== a) : [...mAreas, a])} title={areaName(a)} aria-pressed={mAreas.includes(a)}>{a}</button>)}
        </div>
        {err && <p className="hint warn">{err}</p>}
        <button className="btn btn-primary" onClick={addManual}>Add completed course</button>
      </details>
      {completed.length === 0 ? <Empty title="Nothing added yet" /> : (
        <ul className="done-list">
          {completed.map((c) => (
            <li key={c.id}>
              <span className="code">{c.code}</span> <span>{c.title}</span> <span className="muted">{c.credits} cr{c.term ? ` · ${c.term}` : ""}</span>
              <span className="chips">{c.areas.filter((a) => /^\d/.test(a)).map((a) => <span key={a} className="chip" title={areaName(a)}>{a}</span>)}</span>
              <button className="icon-btn" onClick={() => remove(c.id)} aria-label={`Remove ${c.code}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OverrideModal({ ref0, progress, onClose, areaName }: { ref0: CourseRef | null; progress: ItemProgress[]; onClose: () => void; areaName: (c: string) => string }) {
  const setOverride = useStore((s) => s.setOverride);
  const overrides = useStore((s) => s.overrides);
  const [sel, setSel] = useState<string[] | null>(null);
  if (!ref0) return null;
  const current = sel ?? progress.filter((p) => [...p.doneRefs, ...p.plannedRefs].some((r) => r.id === ref0.id)).map((p) => p.item.id);
  const manual = !!overrides[ref0.id];
  const toggle = (id: string) => setSel(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const close = () => { setSel(null); onClose(); };
  return (
    <Modal open onClose={close} title={`${ref0.code} counts toward…`}>
      <p className="hint">{ref0.title}. Tags: {ref0.areas.filter((a) => /^\d/.test(a)).map((a) => `${a} (${areaName(a)})`).join(", ") || "none"}. Tick the requirements this course should satisfy; this replaces the automatic match.</p>
      <div className="checklist tall">
        {progress.filter((p) => p.item.kind !== "tracker" || true).map((p) => (
          <label key={p.item.id} className="check"><input type="checkbox" checked={current.includes(p.item.id)} onChange={() => toggle(p.item.id)} /><span className="check-text">{p.item.title}</span></label>
        ))}
      </div>
      <div className="modal-actions">
        {manual && <button className="btn btn-quiet" onClick={() => { setOverride(ref0.id, null); close(); }}>Reset to automatic</button>}
        <button className="btn btn-primary" onClick={() => { setOverride(ref0.id, current); close(); }}>Save</button>
      </div>
    </Modal>
  );
}
