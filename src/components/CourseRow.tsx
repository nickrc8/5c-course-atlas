import { useState, type ReactNode } from "react";
import type { Course } from "../types";
import { fmtMeetings } from "../lib/time";
import { AddButton, CampusBadge, Instructors, SeatPill } from "./common";
import { useData } from "../data";

export function CourseRow({ c, extra, reasons }: { c: Course; extra?: ReactNode; reasons?: string[] }) {
  const [open, setOpen] = useState(false);
  const { areaName } = useData();
  const reqAreas = c.areas.filter((a) => /^\d/.test(a));
  const locs = [...new Set(c.meetings.map((m) => m.loc).filter(Boolean))];
  return (
    <article className="row" data-open={open}>
      <div className="row-main" onClick={() => setOpen(!open)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        aria-expanded={open}>
        <div className="row-head">
          <CampusBadge campus={c.campus} />
          <span className="code">{c.code}</span>
          <span className="sec">Sec {String(c.section).padStart(2, "0")}{c.half ? ` · ${c.half}` : ""}</span>
          <SeatPill c={c} />
          {c.intro && <span className="tag">Intro</span>}
          {c.senior && <span className="tag">Senior / capstone</span>}
          {c.prereq && <span className="tag tag-warn" title="The description contains prerequisite or permission language">Prereq language</span>}
        </div>
        <h3 className="row-title">{c.title}</h3>
        <div className="row-meta">
          <span><Instructors names={c.instructors} /></span>
          <span className="dot">·</span>
          <span className={c.hasTimes ? "" : "muted"}>{fmtMeetings(c)}</span>
          {locs.length > 0 && (<><span className="dot">·</span><span className="muted">{locs.join(", ")}</span></>)}
          <span className="dot">·</span>
          <span className="muted">{c.credits} {c.credits === 1 ? "credit" : "credits"}</span>
        </div>
        {reasons && reasons.length > 0 && (
          <div className="chips">{reasons.map((r) => <span key={r} className="chip chip-reason">{r}</span>)}</div>
        )}
      </div>
      <div className="row-side">
        <AddButton c={c} />
        {extra}
      </div>
      {open && (
        <div className="row-detail">
          {c.description ? <p>{c.description}</p> : <p className="muted">No description published for this section.</p>}
          {reqAreas.length > 0 && (
            <div className="detail-line">
              <strong>Requirement tags:</strong>{" "}
              {reqAreas.map((a) => <span key={a} className="chip" title={areaName(a)}>{a} · {areaName(a)}</span>)}
            </div>
          )}
          <div className="detail-line muted">
            {c.seatsFilled}/{c.seatsTotal} seats filled
            {c.permCount > 0 && ` · ${c.permCount} permission slip${c.permCount === 1 ? "" : "s"}`}
            {" · "}{c.id.split(":")[0]}
          </div>
        </div>
      )}
    </article>
  );
}
