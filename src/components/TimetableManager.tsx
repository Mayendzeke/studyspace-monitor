import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type Kind = "school" | "personal";
type TimetableRow = {
  id: string; learner_id: string; timetable_kind: Kind; subject_name: string; title: string;
  day_of_week: number; starts_at: string; ends_at: string; location: string; notes: string;
};
type Draft = Omit<TimetableRow, "id" | "learner_id" | "timetable_kind">;
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const emptyDraft = (): Draft => ({
  subject_name: "", title: "", day_of_week: 1, starts_at: "08:00", ends_at: "09:00", location: "", notes: ""
});
const shortTime = (time: string) => time.slice(0, 5);

export default function TimetableManager({
  learnerId, kind, title, subjects = []
}: {
  learnerId: string;
  kind: Kind;
  title: string;
  subjects?: string[];
}) {
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  function openNew(day = 1) {
    setEditingId(null);
    setDraft({ ...emptyDraft(), day_of_week: day, subject_name: subjects[0] ?? "" });
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function openEdit(row: TimetableRow) {
    setEditingId(row.id);
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
    if (!draft.starts_at || !draft.ends_at || draft.ends_at <= draft.starts_at) {
      setError("End time must be later than start time.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const subject = draft.subject_name.trim();
    const values = {
      learner_id: learnerId, timetable_kind: kind, subject_name: subject,
      title: draft.title.trim() || subject || (kind === "school" ? "School lesson" : "Study session"),
      day_of_week: draft.day_of_week, starts_at: draft.starts_at, ends_at: draft.ends_at,
      location: draft.location.trim(), notes: draft.notes.trim(), source: "manual" as const
    };
    try {
      const result = editingId
        ? await supabase.from("student_timetable_entries").update(values).eq("id", editingId).eq("learner_id", learnerId)
        : await supabase.from("student_timetable_entries").insert(values);
      if (result.error) throw result.error;
      setEditorOpen(false);
      setEditingId(null);
      setNotice(editingId ? "Timetable entry updated." : "Timetable entry added.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The timetable entry could not be saved.");
    } finally { setSaving(false); }
  }

  async function remove(row: TimetableRow) {
    if (!supabase || !window.confirm("Remove " + row.title + "?")) return;
    const { error: deleteError } = await supabase.from("student_timetable_entries")
      .delete().eq("id", row.id).eq("learner_id", learnerId);
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
        <label>Subject / activity<select value={draft.subject_name} onChange={event => setDraft(current => ({ ...current, subject_name: event.target.value, title: current.title || event.target.value }))}><option value="">General / other</option>{subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select></label>
        <label>Day<select value={draft.day_of_week} onChange={event => setDraft(current => ({ ...current, day_of_week: Number(event.target.value) }))}>{days.map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>
        <label>Start<input required type="time" value={draft.starts_at} onChange={event => setDraft(current => ({ ...current, starts_at: event.target.value }))}/></label>
        <label>End<input required type="time" value={draft.ends_at} onChange={event => setDraft(current => ({ ...current, ends_at: event.target.value }))}/></label>
        <label>Title (optional)<input maxLength={120} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder={draft.subject_name || "Lesson / study activity"}/></label>
        <label>Room / location<input maxLength={120} value={draft.location} onChange={event => setDraft(current => ({ ...current, location: event.target.value }))}/></label>
        <label className="timetable-manager-wide">Notes (optional)<input maxLength={300} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}/></label>
      </div>
      <div className="timetable-manager-form-actions"><button type="button" className="subtle-button" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}><Save size={14}/>{saving ? "Saving…" : "Save entry"}</button></div>
    </form>}
    {loading ? <div className="classroom-empty">Loading timetable…</div> :
      <div className="teacher-week-grid-wrap">
        {!rows.length && <div className="timetable-manager-empty"><CalendarDays size={20}/><span>No timetable entries saved yet. The learner can add or import lessons from the student app.</span></div>}
        <div className="teacher-week-grid-scroll"><table className="teacher-week-grid">
          <thead><tr><th>TIME</th>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=><th key={day}>{day}</th>)}</tr></thead>
          <tbody>{Array.from(new Set(rows.map(row=>shortTime(row.starts_at)))).sort().map(start=>{
            const atTime=rows.filter(row=>shortTime(row.starts_at)===start);
            const first=atTime[0];
            return <tr key={start}><th><strong>{start}</strong><small>{shortTime(first.ends_at)}</small></th>
              {[1,2,3,4,5,6,0].map(day=><td key={day}>{atTime.filter(row=>row.day_of_week===day).map(row=><article className={"teacher-week-lesson "+(/break/i.test(row.title)?"is-break":/lunch/i.test(row.title)?"is-lunch":"")} key={row.id}>
                <b>{row.subject_name||row.title}</b><small>{shortTime(row.starts_at)}–{shortTime(row.ends_at)}</small>{row.location&&<small>{row.location}</small>}
                <div><button type="button" className="icon-button" onClick={()=>openEdit(row)} aria-label={"Edit "+row.title}><Pencil size={12}/></button><button type="button" className="icon-button danger-text" onClick={()=>void remove(row)} aria-label={"Remove "+row.title}><Trash2 size={12}/></button></div>
              </article>)}</td>)}
            </tr>
          })}</tbody>
        </table></div>
      </div>}
  </section>;
}
