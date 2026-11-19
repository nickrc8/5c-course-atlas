import { useEffect, useMemo, useState } from "react";
import { useUI } from "../ui";
import { useData } from "../data";
import { useStore } from "../store";
import { FULL_NAME, profLinks } from "../lib/links";
import { CampusBadge, AddButton, SeatPill } from "./common";
import { fmtMeetings } from "../lib/time";
import { CAMPUS_NAMES } from "../types";
import { termLabel } from "../lib/hyperschedule";

export function ProfessorDrawer() {
  const name = useUI((s) => s.prof);
  const close = useUI((s) => s.openProf);
  const { courses, termKey } = useData();
  const note = useStore((s) => (name ? s.notes[name] : undefined));
  const setNote = useStore((s) => s.setNote);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");

  useEffect(() => { setText(note?.text || ""); setTags(note?.tags || []); setTag(""); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!name) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [name, close]);

  const sections = useMemo(() => (name ? courses.filter((c) => c.instructors.some((i) => i.toLowerCase() === name.toLowerCase())) : []), [courses, name]);
  if (!name) return null;

  // the instructor's college: the campus that hosts most of their sections this term
  const counts = new Map<string, number>();
  sections.forEach((c) => counts.set(c.campus, (counts.get(c.campus) || 0) + 1));
  const campuses = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c) as (keyof typeof CAMPUS_NAMES)[];
  const home = campuses[0] || "PO";
  const links = profLinks(name, home);

  const save = (t = text, tg = tags) => setNote(name, { text: t, tags: tg });
  const addTag = () => { const v = tag.trim(); if (v && !tags.includes(v)) { const n = [...tags, v]; setTags(n); save(text, n); } setTag(""); };

  return (
    <div className="drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(null); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Professor card for ${name}`}>
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">{name}</h2>
            <div className="muted">{campuses.map((c) => <span key={c} className="inline-badge"><CampusBadge campus={c} /> </span>)}{sections.length} section{sections.length === 1 ? "" : "s"} in {termLabel(termKey)}</div>
          </div>
          <button className="icon-btn" onClick={() => close(null)} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <h3 className="h3">Research</h3>
          <p className="hint">These open searches pre-filled with the name. Atlas does not show ratings, bios or work histories itself, and never invents them.</p>
          <ul className="link-list">
            {(campuses.length ? campuses : [home]).map((c) => (
              <li key={c}><a href={profLinks(name, c).rmpCurrent} target="_blank" rel="noopener noreferrer"><strong>Rate My Professors · {FULL_NAME[c]}</strong><span>Search limited to ratemyprofessors.com and {FULL_NAME[c]}{campuses.length > 1 ? " (they teach at more than one college this term)" : ""}</span></a></li>
            ))}
            <li><a href={links.rmpAll} target="_blank" rel="noopener noreferrer"><strong>Rate My Professors · all schools</strong><span>Prior-college check: new hires often have reviews from where they taught before</span></a></li>
            <li><a href={links.linkedin} target="_blank" rel="noopener noreferrer"><strong>LinkedIn teaching history</strong><span>Searches “{name}” professor OR lecturer OR university, to spot a new hire and see previous colleges</span></a></li>
            <li><a href={links.profile} target="_blank" rel="noopener noreferrer"><strong>Faculty profile</strong><span>Official department bio and web results</span></a></li>
            <li><a href={links.scholar} target="_blank" rel="noopener noreferrer"><strong>Google Scholar</strong><span>Published work by this author</span></a></li>
          </ul>

          <h3 className="h3">Private notes</h3>
          <textarea className="input" rows={4} placeholder="Notes only you can see (saved in this browser, and to your account if you sign in)" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save()} />
          <div className="chips">
            {tags.map((t) => <button key={t} className="chip chip-btn on" onClick={() => { const n = tags.filter((x) => x !== t); setTags(n); save(text, n); }}>{t} ✕</button>)}
          </div>
          <div className="form-row">
            <input className="input grow" placeholder="Add a tag (e.g. great lecturer, heavy reading)" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTag(); }} />
            <button className="btn" onClick={addTag} disabled={!tag.trim()}>Add</button>
          </div>

          <h3 className="h3">Teaching in {termLabel(termKey)}</h3>
          {sections.length === 0 && <p className="muted">No sections found for this name in the loaded term.</p>}
          <div className="mini-list">
            {sections.map((c) => (
              <div key={c.id} className="mini">
                <div className="mini-main">
                  <div className="row-head"><CampusBadge campus={c.campus} /><span className="code">{c.code}</span><SeatPill c={c} /></div>
                  <div className="mini-title">{c.title}</div>
                  <div className="muted tiny">{fmtMeetings(c)}</div>
                </div>
                <AddButton c={c} compact />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
