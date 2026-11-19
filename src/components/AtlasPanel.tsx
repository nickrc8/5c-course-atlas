import { useEffect, useRef, useState } from "react";
import { useUI } from "../ui";
import { useAtlasContext, useData } from "../data";
import { AtlasUnavailable, askAtlas, atlasConfigured, splitReply, type ChatMsg } from "../lib/atlasApi";
import { answerLocally } from "../lib/localAtlas";
import { AddButton, CampusBadge, Instructors, SeatPill } from "./common";
import { fmtMeetings } from "../lib/time";

interface Msg { role: "user" | "assistant"; content: string; ids?: string[]; mode?: "claude" | "offline"; error?: boolean }

const SUGGESTIONS = [
  "Find me an open humanities class on Tu/Th after 11 AM with no prereqs that doesn't clash with my schedule.",
  "What upper-division electives fit my unmet requirements and avoid intro ECON?",
  "Open classes that end by noon on Mon/Wed/Fri",
];

export function MiniCourseCard({ id }: { id: string }) {
  const { byId } = useData();
  const openProf = useUI((s) => s.openProf);
  void openProf;
  const c = byId.get(id);
  if (!c) return null; // never show a course that is not in the loaded dataset
  return (
    <div className="mini card-mini">
      <div className="mini-main">
        <div className="row-head"><CampusBadge campus={c.campus} /><span className="code">{c.code}</span><SeatPill c={c} /></div>
        <div className="mini-title">{c.title}</div>
        <div className="muted tiny"><Instructors names={c.instructors} /> · {fmtMeetings(c)} · {c.credits} cr</div>
      </div>
      <AddButton c={c} compact />
    </div>
  );
}

export function AtlasPanel() {
  const open = useUI((s) => s.atlasOpen);
  const setOpen = useUI((s) => s.setAtlas);
  const { courses, areas, byId } = useData();
  const ctx = useAtlasContext();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open && llm === null) atlasConfigured().then(setLlm); }, [open, llm]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, setOpen]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    const offline = (note?: string) => {
      const a = answerLocally(q, courses, areas, ctx);
      setMsgs([...history, { role: "assistant", content: (note ? note + "\n\n" : "") + a.text, ids: a.ids, mode: "offline" }]);
    };
    try {
      if (!(await atlasConfigured())) { offline(); return; }
      const chat: ChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));
      const r = await askAtlas(chat, ctx);
      // belt and braces: only keep references that exist in the loaded term
      const clean = r.reply.replace(/\[\[course:([^\]\s]+)\]\]/g, (m, id) => (byId.has(id) ? m : ""));
      setMsgs([...history, { role: "assistant", content: clean, mode: "claude" }]);
    } catch (e) {
      if (e instanceof AtlasUnavailable) offline(`Atlas AI is not reachable (${e.message}), so I used the offline parser.`);
      else offline(`Atlas AI hit an error (${(e as Error).message}), so I used the offline parser.`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="fab" onClick={() => setOpen(true)} aria-label="Open Ask Atlas">
        <span className="fab-spark">✦</span> Ask Atlas
      </button>
    );
  }
  return (
    <div className="drawer-scrim atlas-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="drawer atlas" role="dialog" aria-label="Ask Atlas">
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">✦ Ask Atlas</h2>
            <div className="muted tiny">{llm ? "Claude, grounded in the live Hyperschedule data" : llm === false ? "Offline parser (AI not set up on this deployment)" : "…"} · {ctx.termKey}</div>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        </div>
        <div className="chat">
          {msgs.length === 0 && (
            <div className="chat-intro">
              <p>Ask in plain language. Every course I show comes from the live course data for {ctx.termKey}, never from memory. I can see your college{ctx.college ? ` (${ctx.college})` : ""}, majors, unmet requirements, schedule and blocked times.</p>
              <div className="suggest">
                {SUGGESTIONS.map((s) => <button key={s} className="chip chip-btn" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === "user" ? <p>{m.content}</p> : (
                <>
                  {splitReply(m.content).map((p, j) => p.t === "text"
                    ? <p key={j} className="msg-text">{p.v.trim()}</p>
                    : <MiniCourseCard key={j} id={p.v} />)}
                  {m.ids?.map((id) => <MiniCourseCard key={id} id={id} />)}
                  {m.mode === "offline" && <div className="muted tiny">Offline parser, not an AI model.</div>}
                </>
              )}
            </div>
          ))}
          {busy && <div className="msg msg-assistant"><p className="muted">Searching the course data…</p></div>}
          <div ref={endRef} />
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. open Tu/Th class after 11 with no prereqs" aria-label="Ask Atlas" disabled={busy} />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>Ask</button>
        </form>
      </aside>
    </div>
  );
}
