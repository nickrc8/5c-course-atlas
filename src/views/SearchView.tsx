import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useData, useSchedule } from "../data";
import { applyFilters, sortCourses, type SortKey } from "../lib/filters";
import { FilterSidebar } from "../components/FilterSidebar";
import { CourseRow } from "../components/CourseRow";
import { Empty } from "../components/common";
import { useUI } from "../ui";

const PAGE = 50;

export function SearchView() {
  const f = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const resetFilters = useStore((s) => s.resetFilters);
  const { courses, termKey } = useData();
  const { active } = useSchedule();
  const filtersOpen = useUI((s) => s.filtersOpen);
  const setFiltersOpen = useUI((s) => s.setFiltersOpen);
  const [sort, setSort] = useState<SortKey>("code");
  const [shown, setShown] = useState(PAGE);
  const [q, setQ] = useState(f.q);

  // debounce typing into the shared filter state
  useEffect(() => {
    const t = setTimeout(() => { if (q !== f.q) setFilters({ q }); }, 160);
    return () => clearTimeout(t);
  }, [q, f.q, setFilters]);
  useEffect(() => { setQ(f.q); }, [f.q]);

  const results = useMemo(() => sortCourses(applyFilters(courses, f, { schedule: active }), sort), [courses, f, active, sort]);
  useEffect(() => { setShown(PAGE); }, [f, termKey, sort]);

  return (
    <div className="layout">
      <aside className={`sidebar ${filtersOpen ? "open" : ""}`}>
        <button className="sidebar-close btn" onClick={() => setFiltersOpen(false)}>Show {results.length} results</button>
        <FilterSidebar />
      </aside>
      <section className="results" aria-live="polite">
        <div className="searchbar">
          <input className="input input-lg" type="search" placeholder="Search by code, title, professor, department or keyword in the description…"
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search courses" />
          <button className="btn filters-btn" onClick={() => setFiltersOpen(true)}>Filters</button>
        </div>
        <div className="results-head">
          <span><strong>{results.length.toLocaleString()}</strong> of {courses.length.toLocaleString()} sections</span>
          <label className="sort">Sort
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="code">Course code</option>
              <option value="title">Title</option>
              <option value="seats">Most open seats</option>
              <option value="time">Earliest start</option>
            </select>
          </label>
        </div>
        {results.length === 0 ? (
          <Empty title="No sections match">
            Loosen a filter, or <button className="link" onClick={resetFilters}>reset all filters</button>.
          </Empty>
        ) : (
          <div className="list">
            {results.slice(0, shown).map((c) => <CourseRow key={c.id} c={c} />)}
            {shown < results.length && (
              <button className="btn btn-block" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
