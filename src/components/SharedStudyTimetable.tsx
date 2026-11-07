import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Minus, Plus, RefreshCw, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type Learner = { id: string; full_name: string; preferred_name: string; grade: string; education_level: string };
type Slot = { id: string; learner_id: string; subject_name: string; title: string; day_of_week: number; starts_at: string; ends_at: string; notes: string };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const time = (value: string) => value.slice(0, 5);
const learnerName = (learner?: Learner) => learner?.preferred_name || learner?.full_name || "Learner";

export default function SharedStudyTimetable() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timetableZoom, setTimetableZoom] = useState(1);

  async function refresh(quiet = false) {
    if (!supabase) { setError("Studyspace is not connected."); setLoading(false); return; }
    if (!quiet) setLoading(true); setError("");
    try {
      const { data: profiles, error: profileError } = await supabase.from("profiles")
        .select("id,full_name,preferred_name,grade,education_level")
        .eq("role", "learner").eq("account_status", "active").order("preferred_name");
      if (profileError) throw profileError;
      const active = (profiles || []) as Learner[];
      setLearners(active);
      if (!active.length) { setSlots([]); return; }
      const { data, error: slotError } = await supabase.from("student_timetable_entries")
        .select("id,learner_id,subject_name,title,day_of_week,starts_at,ends_at,notes")
        .in("learner_id", active.map(item => item.id))
        .eq("timetable_kind", "personal")
        .order("day_of_week").order("starts_at");
      if (slotError) throw slotError;
      setSlots((data || []) as Slot[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Shared study availability could not be loaded.");
    } finally { if (!quiet) setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);
  const times = useMemo(() => Array.from(new Set(slots.map(slot => time(slot.starts_at)))).sort(), [slots]);
  const byId = useMemo(() => new Map(learners.map(item => [item.id, item])), [learners]);

  return <section className="panel timetable-manager shared-study-timetable">
    <div className="panel-heading">
      <div><h2>Shared student study availability</h2><p>Students' available study slots, synced from their personal timetables · {slots.length} slot(s)</p></div>
      <div className="timetable-manager-actions">
        <div className="timetable-zoom-controls" role="group" aria-label="Shared timetable zoom controls">
          <button type="button" className="timetable-zoom-button" aria-label="Zoom out" title="Zoom out" onClick={() => setTimetableZoom(value => Math.max(0.45, Math.round((value - 0.1) * 100) / 100))} disabled={timetableZoom <= 0.45}><Minus size={14}/></button>
          <button type="button" className="timetable-zoom-reset" onClick={() => setTimetableZoom(1)} aria-label="Reset timetable zoom">{Math.round(timetableZoom * 100)}%</button>
          <button type="button" className="timetable-zoom-button" aria-label="Zoom in" title="Zoom in" onClick={() => setTimetableZoom(value => Math.min(1.5, Math.round((value + 0.1) * 100) / 100))} disabled={timetableZoom >= 1.5}><Plus size={14}/></button>
        </div>
        <button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh shared study timetable"><RefreshCw size={14}/></button>
      </div>
    </div>
    <p className="subtle-note"><Users size={14}/> When a learner completes signup, Studyspace creates editable study slots from their preferred days and weekly study hours. Changes made in the student app appear here after refresh.</p>
    {error && <p className="inline-message error-message" role="alert">{error}</p>}
    {loading ? <div className="classroom-empty">Loading shared availability…</div> :
      !slots.length ? <div className="timetable-manager-empty"><CalendarDays size={20}/><span>No student study slots are available yet. Learners' signup preferences create the initial schedule.</span></div> :
      <div className="teacher-week-grid-scroll"><div className="teacher-week-grid-zoom" style={{ zoom: timetableZoom, width: (100 / timetableZoom) + "%" }}><table className="teacher-week-grid">
        <thead><tr><th className="teacher-week-day-heading">DAY</th>{times.map(start => <th key={start}>{start}</th>)}</tr></thead>
        <tbody>{[1,2,3,4,5,6,0].map(day => <tr key={day}>
          <th className="teacher-week-day-cell">{days[day]}</th>
          {times.map(start => <td key={start}>{slots.filter(slot => slot.day_of_week === day && time(slot.starts_at) === start).map(slot => {
            const learner = byId.get(slot.learner_id);
            return <article className="teacher-week-lesson shared-study-slot" key={slot.id}>
              <b>{learnerName(learner)}</b>
              <small>{time(slot.starts_at)}–{time(slot.ends_at)}</small>
              <small>{slot.subject_name || slot.title || "Study session"}{learner?.grade ? " · " + learner.grade : ""}</small>
              <span className={"pin-status " + ((slot.notes || "").includes("[READY_FOR_STUDY]") ? "active" : "pending")}>{(slot.notes || "").includes("[READY_FOR_STUDY]") ? "Ready" : "Planned"}</span>
            </article>;
          })}</td>)}
        </tr>)}</tbody>
      </table></div></div>}
  </section>;
}
