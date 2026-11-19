import { useMemo } from "react";
import type { Course, Meeting } from "../types";
import { DAY_NAMES, WEEKDAYS } from "../types";
import { useData, useSchedule } from "../data";
import { useStore } from "../store";
import { coursesConflict, fmtMeetings, fmtRange, fmtTime } from "../lib/time";
import { downloadIcs } from "../lib/ics";
import { courseHue, CampusBadge, Empty, Instructors, SeatPill } from "../components/common";
import { termLabel } from "../lib/hyperschedule";
import { useUI } from "../ui";

const GRID_START = 8 * 60;
const GRID_END = 22 * 60;
const HOUR_PX = 48;

interface Block { c: Course; m: Meeting; day: string; active: boolean; lane: number; lanes: number; clash: boolean }

function layoutDay(items: Omit<Block, "lane" | "lanes">[]): Block[] {
  const sorted = [...items].sort((a, b) => a.m.start - b.m.start || a.m.end - b.m.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((b) => b.lane + 1)); cluster.forEach((b) => (b.lanes = n)); out.push(...cluster); cluster = []; };
  for (const it of sorted) {
    if (cluster.length && it.m.start >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((b) => b.m.end > it.m.start).map((b) => b.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.m.end);
  }
  if (cluster.length) flush();
  return out;
}

export function ScheduleView() {
  const { termKey } = useData();
  const { resolved, active, missing } = useSchedule();
  const toggleActive = useStore((s) => s.toggleActive);
  const remove = useStore((s) => s.removeFromSchedule);
  const clear = useStore((s) => s.clearSchedule);
  const setTab = useUI((s) => s.setTab);

  const credits = active.reduce((t, c) => t + c.credits, 0);
  const tentative = resolved.filter((r) => r.course && !r.entry.active).reduce((t, r) => t + r.course!.credits, 0);

  const clashes = useMemo(() => {
    const out: [Course, Course][] = [];
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) if (coursesConflict(active[i], active[j])) out.push([active[i], active[j]]);
    return out;
  }, [active]);
  const clashIds = new Set(clashes.flat().map((c) => c.id));

  const byDay = useMemo(() => {
    const map = new Map<string, Omit<Block, "lane" | "lanes">[]>();
    for (const r of resolved) {
      if (!r.course) continue;
      for (const m of r.course.meetings) {
        if (m.end <= m.start) continue;
        for (const d of m.days) {
          if (!(WEEKDAYS as readonly string[]).includes(d)) continue;
          if (!map.has(d)) map.set(d, []);
          map.get(d)!.push({ c: r.course, m, day: d, active: r.entry.active, clash: r.entry.active && clashIds.has(r.course.id) });
        }
      }
    }
    return new Map([...map].map(([d, items]) => [d, layoutDay(items)] as const));
  }, [resolved, clashes]); // eslint-disable-line react-hooks/exhaustive-deps

  const offGrid = resolved.filter((r) => r.course && (!r.course.hasTimes || r.course.meetings.some((m) => m.days.some((d) => !(WEEKDAYS as readonly string[]).includes(d)))));
  const hours = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => GRID_START / 60 + i);

  if (resolved.length === 0 && missing.length === 0) {
    return (
      <Empty title="Your schedule is empty">
        Find courses in <button className="link" onClick={() => setTab("search")}>Search</button>, <button className="link" onClick={() => setTab("foryou")}>For You</button> or ask Atlas, then add them here. Everything saves in this browser.
      </Empty>
    );
  }

  return (
    <div className="schedule">
      <div className="sched-head">
        <div>
          <h1 className="h1">My Schedule <span className="muted">· {termLabel(termKey)}</span></h1>
          <div className="stats">
            <span className="stat"><strong>{credits}</strong> active credits</span>
            {tentative > 0 && <span className="stat muted">{tentative} tentative</span>}
            <span className="stat muted">{active.length} course{active.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="sched-actions">
          <button className="btn" disabled={active.length === 0} onClick={() => downloadIcs(active, `5c-schedule-${termKey}.ics`)}>Export .ics</button>
          <button className="btn btn-quiet" onClick={() => { if (confirm("Remove every course from this term's schedule?")) clear(termKey); }}>Clear all</button>
        </div>
      </div>

      {clashes.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <strong>Time clash{clashes.length > 1 ? "es" : ""}:</strong>{" "}
          {clashes.map(([a, b], i) => <span key={i}>{i > 0 && "; "}{a.code} and {b.code}</span>)}. Mark one tentative to resolve it.
        </div>
      )}
      {missing.length > 0 && (
        <div className="alert">
          {missing.length} saved course{missing.length === 1 ? " is" : "s are"} not in the current data for this term (the section may have been removed or renumbered):{" "}
          {missing.map((m) => <span key={m.id} className="chip">{m.label} <button className="link" onClick={() => remove(termKey, m.id)}>remove</button></span>)}
        </div>
      )}

      <div className="grid-wrap">
        <div className="grid" style={{ ["--hour" as string]: `${HOUR_PX}px` }}>
          <div className="grid-corner" />
          {WEEKDAYS.map((d) => <div key={d} className="grid-dayhead">{DAY_NAMES[d]}</div>)}
          <div className="grid-axis" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h) => <div key={h} className="grid-hour" style={{ top: (h - GRID_START / 60) * HOUR_PX }}>{fmtTime(h * 60).replace(":00", "")}</div>)}
          </div>
          {WEEKDAYS.map((d) => (
            <div key={d} className="grid-col" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => <div key={h} className="grid-line" style={{ top: (h - GRID_START / 60) * HOUR_PX }} />)}
              {(byDay.get(d) || []).map((b, i) => {
                const s = Math.max(b.m.start, GRID_START), e = Math.min(b.m.end, GRID_END);
                if (e <= s) return null;
                return (
                  <div key={b.c.id + i} className={`block ${b.active ? "" : "tentative"} ${b.clash ? "clash" : ""}`}
                    style={{ top: ((s - GRID_START) / 60) * HOUR_PX, height: Math.max(20, ((e - s) / 60) * HOUR_PX - 2), left: `${(b.lane / b.lanes) * 100}%`, width: `calc(${100 / b.lanes}% - 3px)`, ["--h" as string]: courseHue(b.c.courseKey) }}
                    title={`${b.c.code} ${b.c.title}\n${fmtRange(b.m.start, b.m.end)}${b.m.loc ? "\n" + b.m.loc : ""}${b.active ? "" : "\n(tentative)"}`}>
                    <div className="block-code">{b.c.code}</div>
                    <div className="block-title">{b.c.title}</div>
                    <div className="block-time">{fmtRange(b.m.start, b.m.end)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {offGrid.length > 0 && (
        <p className="hint">Not on the grid (no posted time, or meets on a weekend): {offGrid.map((r) => `${r.course!.code} (${fmtMeetings(r.course!)})`).join("; ")}</p>
      )}

      <h2 className="h2">Courses</h2>
      <div className="list">
        {resolved.map(({ entry, course }) => course && (
          <div key={entry.id} className={`row sched-row ${entry.active ? "" : "is-tentative"}`} style={{ ["--h" as string]: courseHue(course.courseKey) }}>
            <div className="swatch" />
            <div className="row-main">
              <div className="row-head">
                <CampusBadge campus={course.campus} />
                <span className="code">{course.code}</span>
                <SeatPill c={course} />
                {clashIds.has(course.id) && entry.active && <span className="tag tag-warn">Clash</span>}
                {!entry.active && <span className="tag">Tentative</span>}
              </div>
              <h3 className="row-title">{course.title}</h3>
              <div className="row-meta"><Instructors names={course.instructors} /><span className="dot">·</span><span>{fmtMeetings(course)}</span><span className="dot">·</span><span className="muted">{course.credits} credit{course.credits === 1 ? "" : "s"}</span></div>
            </div>
            <div className="row-side">
              <label className="switch" title="Tentative courses stay in the list but are left off the credit total, clash checks and requirement progress">
                <input type="checkbox" checked={entry.active} onChange={() => toggleActive(termKey, entry.id)} />
                <span>{entry.active ? "Active" : "Tentative"}</span>
              </label>
              <button className="btn btn-quiet" onClick={() => remove(termKey, entry.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
