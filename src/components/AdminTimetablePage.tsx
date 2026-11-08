import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Search, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import SharedStudyTimetable from "./SharedStudyTimetable";
import TimetableManager from "./TimetableManager";

type TimetableEntry = { id: string; learner_id: string; timetable_kind: "school" | "personal"; subject_name: string; title: string; day_of_week: number; starts_at: string; ends_at: string; location: string; notes: string; };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Learner = {
  id: string;
  student_id: string | null;
  full_name: string;
  preferred_name: string;
  education_level: string;
  grade: string;
  account_status: string;
};

export default function AdminTimetablePage() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | "school" | "personal">("all");
  const [scheduleError, setScheduleError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"school" | "personal">("school");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function refresh() {
    if (!supabase) { setError("StudySpace is not connected."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("profiles")
      .select("id,student_id,full_name,preferred_name,education_level,grade,account_status")
      .eq("role", "learner")
      .order("preferred_name", { ascending: true });
    if (loadError) {
      setError("Learner records could not be loaded. Check administrator access and database policies.");
      setLearners([]);
      setEntries([]);
    } else {
      const next = (data || []) as Learner[];
      setLearners(next);
      if (!selectedId && next.length) setSelectedId(next[0].id);
      if (selectedId && !next.some(item => item.id === selectedId)) setSelectedId(next[0]?.id || "");
      if (!next.length) {
        setEntries([]);
      } else {
        const { data: timetableRows, error: timetableError } = await supabase.from("student_timetable_entries")
          .select("id,learner_id,timetable_kind,subject_name,title,day_of_week,starts_at,ends_at,location,notes")
          .in("learner_id", next.map(item => item.id))
          .order("day_of_week").order("starts_at");
        if (timetableError) throw timetableError;
        setEntries((timetableRows || []) as TimetableEntry[]);
      }
      setScheduleError("");
      setUpdatedAt(new Date().toISOString());
    }
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const visible = learners.filter(item => [
    item.student_id, item.full_name, item.preferred_name, item.education_level, item.grade,
  ].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = learners.find(item => item.id === selectedId);
  const displayName = (item: Learner) => item.preferred_name || item.full_name || "Learner";
  const learnerById = new Map(learners.map(item => [item.id, item]));
  const visibleEntries = entries.filter(entry => {
    const learner = learnerById.get(entry.learner_id);
    return (kindFilter === "all" || entry.timetable_kind === kindFilter)
      && [learner?.full_name, learner?.preferred_name, learner?.student_id, entry.subject_name, entry.title].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return <div className="subpage">
    <div className="welcome-row">
      <div><div className="eyebrow"><CalendarDays size={14}/> CENTRAL TIMETABLE</div><h1>Timetable <span>workspace.</span></h1><p className="page-subtitle">Review shared learner study availability, then add or edit any learner's school lessons and personal study sessions without opening their profile.</p></div>
      <button type="button" className="primary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh learners"}</button>
    </div>

    <SharedStudyTimetable />

    <section className="panel timetable-admin-overview">
      <div className="panel-heading"><div><h2>All learner timetables</h2><p>{entries.length} school and personal timetable entries across {learners.length} learner account(s). Manage takes you directly to the selected learner's editor.</p></div><CalendarDays size={19}/></div>
      <div className="theme-options" role="group" aria-label="Filter timetable entries">
        <button type="button" className={kindFilter === "all" ? "chosen" : ""} onClick={() => setKindFilter("all")}>All timetables</button>
        <button type="button" className={kindFilter === "school" ? "chosen" : ""} onClick={() => setKindFilter("school")}>School</button>
        <button type="button" className={kindFilter === "personal" ? "chosen" : ""} onClick={() => setKindFilter("personal")}>Personal study</button>
      </div>
      {scheduleError && <p className="inline-message error-message" role="alert">{scheduleError}</p>}
      {loading ? <div className="classroom-empty">Loading all learner timetables…</div> :
        !visibleEntries.length ? <div className="classroom-empty"><CalendarDays size={22}/><strong>No timetable entries in this view</strong><span>Choose another filter or add lessons using the learner editor below.</span></div> :
        <div className="teacher-week-grid-scroll"><table className="teacher-week-grid admin-timetable-overview-table">
          <thead><tr><th>LEARNER</th><th>TYPE</th><th>DAY</th><th>TIME</th><th>SUBJECT / ACTIVITY</th><th>LOCATION</th><th>ACTION</th></tr></thead>
          <tbody>{visibleEntries.map(entry => {
            const learner = learnerById.get(entry.learner_id);
            return <tr key={entry.id}>
              <td><strong>{learner ? displayName(learner) : "Learner"}</strong><small>{learner?.student_id || "No Student ID"}</small></td>
              <td>{entry.timetable_kind === "school" ? "School" : "Personal"}</td>
              <td>{DAYS[entry.day_of_week] || "Day not set"}</td>
              <td>{entry.starts_at.slice(0,5)}–{entry.ends_at.slice(0,5)}</td>
              <td>{entry.subject_name || entry.title || "Untitled entry"}</td>
              <td>{entry.location || "—"}</td>
              <td><button type="button" className="subtle-button" onClick={() => { setSelectedId(entry.learner_id); setKind(entry.timetable_kind); }}>Manage</button></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    <section className="panel timetable-admin-selector">
      <div className="panel-heading"><div><h2>Manage an individual timetable</h2><p>{learners.length} learner account(s) · {updatedAt ? "Updated " + new Date(updatedAt).toLocaleTimeString() : "Not yet refreshed"}</p></div><Users size={19}/></div>
      <div className="learners-search"><label><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find by name, Student ID, grade or level"/></label></div>
      <label className="field-label">Choose learner
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={loading || !visible.length}>
          {visible.map(item => <option key={item.id} value={item.id}>{displayName(item)} · {item.student_id || "No Student ID"} · {item.grade || item.education_level || "Details incomplete"} · {item.account_status}</option>)}
        </select>
      </label>
      {loading && <div className="classroom-empty">Loading learner accounts…</div>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}
      {!loading && !learners.length && <div className="classroom-empty"><Users size={22}/><strong>No learner records found</strong><span>Active and pending learner accounts will appear here when present in StudySpace.</span></div>}
      {!loading && learners.length > 0 && !visible.length && <div className="classroom-empty">No learner matches that search.</div>}
      {selected && <div className="timetable-admin-selected">
        <div className="timetable-admin-identity"><strong>{displayName(selected)}</strong><span>{selected.student_id || "No Student ID"} · {selected.education_level || "Level incomplete"} · {selected.grade || "Grade incomplete"} · {selected.account_status}</span></div>
        <div className="theme-options" role="group" aria-label="Timetable type">
          <button type="button" className={kind === "school" ? "chosen" : ""} onClick={() => setKind("school")}>School timetable</button>
          <button type="button" className={kind === "personal" ? "chosen" : ""} onClick={() => setKind("personal")}>Personal study</button>
        </div>
        <TimetableManager key={selected.id + "-" + kind} learnerId={selected.id} kind={kind} title={displayName(selected) + " · " + (kind === "school" ? "School timetable" : "Personal study timetable")} allowGroupEvents={kind === "personal"} />
      </div>}
    </section>
  </div>;
}
