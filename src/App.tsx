import { useEffect, useState } from "react";
import { DataProvider, useData, useSchedule } from "./data";
import { useStore } from "./store";
import { useUI, type Tab } from "./ui";
import { initAuth } from "./lib/sync";
import { termLabel, timeAgo } from "./lib/hyperschedule";
import { SearchView } from "./views/SearchView";
import { ScheduleView } from "./views/ScheduleView";
import { RequirementsView } from "./views/RequirementsView";
import { ForYouView } from "./views/ForYouView";
import { EasyView } from "./views/EasyView";
import { ProfessorDrawer } from "./components/ProfessorDrawer";
import { AtlasPanel } from "./components/AtlasPanel";
import { AuthModal, useAuth } from "./components/AuthModal";

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") delete el.dataset.theme; else el.dataset.theme = theme;
  }, [theme]);
}

const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "schedule", label: "My Schedule" },
  { id: "foryou", label: "For You" },
  { id: "easy", label: "Easy Electives" },
  { id: "requirements", label: "Requirements" },
];

function Nav() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const setAuth = useUI((s) => s.setAuth);
  const { terms, termKey, fetchedAt, source, setTerm, reload, switching, status } = useData();
  const { all } = useSchedule();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const auth = useAuth();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  const nextTheme = { system: "light", light: "dark", dark: "system" } as const;
  const dot = auth.sync === "synced" ? "ok" : auth.sync === "error" ? "bad" : "mid";

  return (
    <header className="nav">
      <div className="nav-row">
        <a className="brand" href="./" onClick={(e) => { e.preventDefault(); setTab("search"); }}>
          <span className="logo" aria-hidden="true">5C</span>
          <span className="brand-name">Course Atlas</span>
        </a>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              {t.label}{t.id === "schedule" && all.length > 0 ? <span className="count-pill">{all.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="nav-right">
          {status === "ready" && (
            <>
              <select className="input term-select" value={termKey} onChange={(e) => setTerm(e.target.value)} aria-label="Term" disabled={switching}>
                {terms.map((t) => { const k = `${t.term}${t.year}`; return <option key={k} value={k}>{termLabel(k)}</option>; })}
              </select>
              <button className="sync" onClick={() => reload()} disabled={switching} title={`Last synced ${new Date(fetchedAt).toLocaleString()}. ${source === "edge" ? "Live through the Edge Function." : "From the GitHub Actions snapshot."} Click to refresh.`}>
                <span className={`sync-dot ${source === "edge" ? "live" : "snap"}`} />
                <span className="sync-text">{switching ? "Syncing…" : `Last synced ${timeAgo(fetchedAt)}`}</span>
              </button>
            </>
          )}
          <button className="icon-btn" onClick={() => setTheme(nextTheme[theme])} title={`Theme: ${theme}. Click for ${nextTheme[theme]}`} aria-label={`Theme: ${theme}`}>
            {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
          </button>
          <button className="btn btn-signin" onClick={() => setAuth(true)}>
            {auth.user ? <><span className={`sync-dot ${dot}`} /> {auth.user.email?.split("@")[0]}</> : "Sign in"}
          </button>
        </div>
      </div>
    </header>
  );
}

function Body() {
  const { status, error, switching, reload, source, courses } = useData();
  const tab = useUI((s) => s.tab);
  if (status === "loading") return <div className="center"><div className="spinner" /><p>Loading real course sections from Hyperschedule…</p></div>;
  if (status === "error") {
    return (
      <div className="center">
        <h2>Could not load course data</h2>
        <p className="muted">{error}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
  return (
    <main className={`main ${switching ? "is-switching" : ""}`}>
      {error && <div className="alert alert-warn" role="alert">{error} <button className="link" onClick={() => reload()}>Retry</button></div>}
      {source === "snapshot" && (
        <div className="banner">Showing a periodic snapshot of Hyperschedule data (refreshed by GitHub Actions). Seat counts can lag by up to about half an hour. Click “Last synced” to re-check.</div>
      )}
      {tab === "search" && <SearchView />}
      {tab === "schedule" && <ScheduleView />}
      {tab === "foryou" && <ForYouView />}
      {tab === "easy" && <EasyView />}
      {tab === "requirements" && <RequirementsView />}
      <footer className="foot">
        <p>{courses.length.toLocaleString()} sections from <a href="https://hyperschedule.io" target="_blank" rel="noopener noreferrer">Hyperschedule</a> (open source, <a href="https://github.com/hyperschedule/hyperschedule" target="_blank" rel="noopener noreferrer">github.com/hyperschedule</a>). Seats, times and instructors are copied as published; Atlas does not invent courses or professor ratings. Not affiliated with the Claremont Colleges or Hyperschedule. Always confirm in the official 5C portal before registering.</p>
      </footer>
    </main>
  );
}

export default function App() {
  useTheme();
  useEffect(() => { void initAuth(); }, []);
  return (
    <DataProvider>
      <Nav />
      <Body />
      <ProfessorDrawer />
      <AtlasPanel />
      <AuthModal />
    </DataProvider>
  );
}
