import { useEffect, useState } from "react";
import { CalendarDays, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type Kind = "school" | "personal";
type TimetableRow = {
  id: string; learner_id: string; timetable_kind: Kind; subject_name: string; title: string;
  day_of_week: number; starts_at: string; ends_at: string; location: string; notes: string;
};
type Draft = Omit<TimetableRow, "id" | "learner_id" | "timetable_kind">;
type ActiveLearner = { id: string; full_name: string; preferred_name: string; education_level: string; grade: string; account_status: string };
const eventTypes = ["Study session", "Lesson", "Meeting", "Break", "Lunch", "Other"];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyDraft = (): Draft => ({
  subject_name: "", title: "", day_of_week: 1, starts_at: "08:00", ends_at: "09:00", location: "", notes: ""
});
const shortTime = (time: string) => time.slice(0, 5);

export default function TimetableManager({
  learnerId, kind, title, subjects = [], allowGroupEvents = false
}: {
  learnerId: string;
  kind: Kind;
  title: string;
  subjects?: string[];
  allowGroupEvents?: boolean;
}) {
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [eventType, setEventType] = useState("Study session");
  const [activeLearners, setActiveLearners] = useState<ActiveLearner[]>([]);
  const [educationLevel, setEducationLevel] = useState("");
  const [grade, setGrade] = useState("");
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [groupTag, setGroupTag] = useState("");

  async function refresh() {
    if (!supabase) { setLoading(false); setError("Supabase is not connected."); return; }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase.from("student_timetable_entries")
      .select("id,learner_id,timetable_kind,subject_name,title,day_of_week,starts_at,ends_at,location,notes")
      .eq("learner_id", learnerId).eq("timetable_kind", kind)
      .order("day_of_week").order("starts_at");
    if (queryError) setError(queryError.message);
    else setRows((data ?? []) as TimetableRow[]);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, [learnerId, kind]);

  useEffect(() => {
    if (!allowGroupEvents || kind !== "personal" || !supabase) return;
    let alive = true;
    void supabase.from("profiles").select("id,full_name,preferred_name,education_level,grade,account_status")
      .eq("role", "learner").eq("account_status", "active").order("preferred_name")
      .then(({ data, error: learnerError }) => {
        if (!alive) return;
        if (learnerError) setError("Learners could not be loaded for the study session: " + learnerError.message);
        else setActiveLearners((data ?? []) as ActiveLearner[]);
      });
    return () => { alive = false; };
  }, [allowGroupEvents, kind]);

  const levelOptions = Array.from(new Set(activeLearners.map(item => item.education_level).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const gradeOptions = Array.from(new Set(activeLearners.filter(item => item.education_level === educationLevel).map(item => item.grade).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const eligibleLearners = activeLearners.filter(item => item.education_level === educationLevel && item.grade === grade);

  useEffect(() => {
    if (!groupTag || !selectedLearners.length || !activeLearners.length) return;
    const matching = activeLearners.find(item => selectedLearners.includes(item.id));
    if (matching) { setEducationLevel(matching.education_level); setGrade(matching.grade); }
  }, [groupTag, selectedLearners, activeLearners]);

  function openNew(day = 1) {
    setEditingId(null);
    setDraft({ ...emptyDraft(), day_of_week: day, subject_name: subjects[0] ?? "" });
    setEventType("Study session"); setEducationLevel(""); setGrade(""); setSelectedLearners([]); setGroupTag("");
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(row: TimetableRow) {
    setEditingId(row.id);
    const tag = row.notes.match(/\[MONITOR_EVENT:([a-f0-9-]+)\]/i)?.[1] || "";
    setGroupTag(tag); setEventType(eventTypes.includes(row.subject_name) ? row.subject_name : "Other");
    setEducationLevel(""); setGrade(""); setSelectedLearners([]);
    if (tag && supabase) void supabase.from("student_timetable_entries").select("learner_id")
      .ilike("notes", "%[MONITOR_EVENT:" + tag + "]%").then(({ data }) => {
        if (!data) return;
        const ids = data.map(item => item.learner_id).filter((id: string) => id !== learnerId);
        setSelectedLearners(ids);
        const matching = activeLearners.filter(item => ids.includes(item.id));
        if (matching.length) { setEducationLevel(matching[0].education_level); setGrade(matching[0].grade); }
      });
    setDraft({
      subject_name: row.subject_name || "", title: row.title || "", day_of_week: row.day_of_week,
      starts_at: shortTime(row.starts_at), ends_at: shortTime(row.ends_at),
      location: row.location || "", notes: row.notes || ""
    });
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    if (!draft.starts_at || !draft.ends_at || draft.ends_at <= draft.starts_at) { setError("End time must be later than start time."); return; }
    if (allowGroupEvents && kind === "personal" && eventType === "Study session" && (!educationLevel || !grade || selectedLearners.length === 0)) {
      setError("Choose an education level, grade and at least one learner for this study session."); return;
    }
    setSaving(true); setError(""); setNotice("");
    const activity = allowGroupEvents && kind === "personal" ? eventType : (draft.subject_name.trim() || "Other");
    const subject = allowGroupEvents && kind === "personal"
      ? (eventType === "Other" && !groupTag ? (draft.subject_name.trim() || activity) : activity)
      : draft.subject_name.trim();
    const titleValue = draft.title.trim() || subject || (kind === "school" ? "School lesson" : "Study session");
    const tag = groupTag || (eventType === "Study session" && allowGroupEvents ? crypto.randomUUID() : "");
    const marker = tag ? "[MONITOR_EVENT:" + tag + "] " : "";
    const common = { timetable_kind: kind, subject_name: subject, title: titleValue,
      day_of_week: draft.day_of_week, starts_at: draft.starts_at, ends_at: draft.ends_at,
      location: draft.location.trim(), source: "manual" as const };
    try {
      if (editingId) {
        const notes = marker + draft.notes.trim();
        if (tag) {
          const { error: updateError } = await supabase.from("student_timetable_entries").update({ ...common, notes })
            .ilike("notes", "%[MONITOR_EVENT:" + tag + "]%");
          if (updateError) throw updateError;
          const existing = await supabase.from("student_timetable_entries").select("learner_id").ilike("notes", "%[MONITOR_EVENT:" + tag + "]%");
          if (existing.error) throw existing.error;
          const existingIds = (existing.data ?? []).map(item => item.learner_id).filter((id: string) => id !== learnerId);
          const removedIds = existingIds.filter((id: string) => !selectedLearners.includes(id));
          const addedIds = selectedLearners.filter(id => !existingIds.includes(id));
          if (removedIds.length) {
            const { error: removeError } = await supabase.from("student_timetable_entries").delete()
              .ilike("notes", "%[MONITOR_EVENT:" + tag + "]%").in("learner_id", removedIds);
            if (removeError) throw removeError;
          }
          if (addedIds.length) {
            const { error: addError } = await supabase.from("student_timetable_entries").insert(addedIds.map(id => ({ ...common, learner_id: id, notes })));
            if (addError) throw addError;
          }
        } else {
          const { error: updateError } = await supabase.from("student_timetable_entries").update({ ...common, learner_id: learnerId, notes })
            .eq("id", editingId).eq("learner_id", learnerId);
          if (updateError) throw updateError;
        }
      } else {
        const targets = eventType === "Study session" && allowGroupEvents && kind === "personal" ? [learnerId, ...selectedLearners] : [learnerId];
        const { error: insertError } = await supabase.from("student_timetable_entries").insert(targets.map(id => ({ ...common, learner_id: id, notes: marker + draft.notes.trim() })));
        if (insertError) throw insertError;
      }
      setEditorOpen(false); setEditingId(null);
      setNotice(editingId ? "Timetable event updated." : eventType === "Study session" && allowGroupEvents ? "Study session added to your timetable and " + selectedLearners.length + " learner timetable(s)." : "Timetable entry added.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The timetable entry could not be saved."); }
    finally { setSaving(false); }
  }

  async function remove(row: TimetableRow) {
    if (!supabase || !window.confirm("Remove " + row.title + "?")) return;
    const tag = row.notes.match(/\[MONITOR_EVENT:([a-f0-9-]+)\]/i)?.[1];
    const query = supabase.from("student_timetable_entries").delete();
    const { error: deleteError } = tag ? await query.ilike("notes", "%[MONITOR_EVENT:" + tag + "]%") : await query.eq("id", row.id).eq("learner_id", learnerId);
    if (deleteError) setError(deleteError.message);
    else { setNotice("Timetable entry removed."); await refresh(); }
  }

  return <section className="panel timetable-manager">
    <div className="panel-heading">
      <div><h2>{title}</h2><p>{kind === "school" ? "School lessons" : "Personal study sessions"} · {rows.length} saved</p></div>
      <div className="timetable-manager-actions"><button type="button" className="subtle-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh timetable"><RefreshCw size={14}/></button><button type="button" className="primary-button" onClick={() => openNew()}><Plus size={14}/> Add entry</button></div>
    </div>
    {notice && <p className="inline-message" role="status">{notice}</p>}
    {error && <p className="inline-message error-message" role="alert">{error}</p>}
    {editorOpen && <form className="timetable-manager-editor" onSubmit={event => void save(event)}>
      <div className="timetable-manager-grid">
        {allowGroupEvents && kind === "personal" ? <label>Event type<select value={eventType} onChange={event => { setEventType(event.target.value); setDraft(current => ({ ...current, subject_name: event.target.value, title: "" })); if (event.target.value !== "Study session") { setEducationLevel(""); setGrade(""); setSelectedLearners([]); } }}>{eventTypes.map(option => <option key={option} value={option}>{option}</option>)}</select></label> : <label>Subject / activity<select value={draft.subject_name} onChange={event => setDraft(current => ({ ...current, subject_name: event.target.value, title: current.title || event.target.value }))}><option value="">General / other</option>{subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select></label>}
        <label>Day<select value={draft.day_of_week} onChange={event => setDraft(current => ({ ...current, day_of_week: Number(event.target.value) }))}>{days.map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>
        <label>Start<input required type="time" value={draft.starts_at} onChange={event => setDraft(current => ({ ...current, starts_at: event.target.value }))}/></label>
        <label>End<input required type="time" value={draft.ends_at} onChange={event => setDraft(current => ({ ...current, ends_at: event.target.value }))}/></label>
        <label>Title (optional)<input maxLength={120} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder={draft.subject_name || "Lesson / study activity"}/></label>
        {allowGroupEvents && kind === "personal" && eventType === "Study session" && <><label>Education level<select required value={educationLevel} onChange={event => { setEducationLevel(event.target.value); setGrade(""); setSelectedLearners([]); }}><option value="">Choose education level</option>{levelOptions.map(level => <option key={level} value={level}>{level}</option>)}</select></label><label>Grade / year<select required value={grade} onChange={event => { setGrade(event.target.value); setSelectedLearners([]); }} disabled={!educationLevel}><option value="">Choose grade / year</option>{gradeOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label><div className="timetable-manager-wide"><strong>Choose learners ({selectedLearners.length} selected)</strong><p className="subtle-note">{educationLevel && grade ? eligibleLearners.length + " active learner(s) in " + educationLevel + " · " + grade : "Choose a level and grade to see matching learners."}</p><div className="timetable-event-learner-list">{eligibleLearners.map(item => <label key={item.id}><input type="checkbox" checked={selectedLearners.includes(item.id)} onChange={event => setSelectedLearners(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/><span>{item.preferred_name || item.full_name || "Learner"}</span></label>)}{educationLevel && grade && eligibleLearners.length === 0 && <small>No active learners match this level and grade.</small>}</div></div></> }
        <label>Room / location<input maxLength={120} value={draft.location} onChange={event => setDraft(current => ({ ...current, location: event.target.value }))}/></label>
        <label className="timetable-manager-wide">Notes (optional)<input maxLength={300} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}/></label>
      </div>
      <div className="timetable-manager-form-actions"><button type="button" className="subtle-button" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Save size={14}/>{saving ? "Saving…" : "Save entry"}</button></div>
    </form>}
    {loading ? <div className="classroom-empty">Loading timetable…</div> :
      <div className="teacher-week-grid-wrap">
        {!rows.length && <div className="timetable-manager-empty"><CalendarDays size={20}/><span>No timetable entries saved yet. The learner can add or import lessons from the student app.</span></div>}
        <div className="teacher-week-grid-scroll"><table className="teacher-week-grid">
          <thead><tr><th className="teacher-week-day-heading">DAY</th>{Array.from(new Set(rows.map(row=>shortTime(row.starts_at)))).sort().map(start=><th key={start}><span>{start}</span><small>SUBJECT / ACTIVITY</small></th>)}</tr></thead>
          <tbody>{[1,2,3,4,5,6,0].map(day=><tr key={day}><th className="teacher-week-day-cell">{days[day]}</th>
            {Array.from(new Set(rows.map(row=>shortTime(row.starts_at)))).sort().map(start=><td key={start}>{rows.filter(row=>row.day_of_week===day&&shortTime(row.starts_at)===start).map(row=><article className={"teacher-week-lesson "+(/break/i.test(row.title)?"is-break":/lunch/i.test(row.title)?"is-lunch":"")} key={row.id}>
              <b>{row.subject_name||row.title}</b><small>{shortTime(row.starts_at)}–{shortTime(row.ends_at)}</small>{row.location&&<small>{row.location}</small>}
              <div><button type="button" className="icon-button" onClick={()=>openEdit(row)} aria-label={"Edit "+row.title}><Pencil size={12}/></button><button type="button" className="icon-button danger-text" onClick={()=>void remove(row)} aria-label={"Remove "+row.title}><Trash2 size={12}/></button></div>
            </article>)}</td>)}
          </tr>)}</tbody>
        </table></div>
      </div>}
  </section>;
}
