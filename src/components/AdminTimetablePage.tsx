import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, RefreshCw, Users, BookOpen, Video } from "lucide-react";
import { supabase } from "../lib/supabase";

type SharedSession = {
  id: string;
  title: string;
  subject_name: string;
  education_level: string;
  grade: string;
  curriculum: string;
  starts_at: string;
  duration_minutes: number;
  status: "scheduled" | "live" | "ended" | string;
  meeting_url: string | null;
};
type SessionMember = { session_id: string; learner_id: string };

const statusLabel = (status: string) => status === "live" ? "Live now" : status === "ended" ? "Completed" : "Scheduled";

export default function AdminTimetablePage() {
  const [sessions, setSessions] = useState<SharedSession[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError("StudySpace is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Administrator sign-in has expired. Sign in again.");
      const { data, error: sessionError } = await supabase
        .from("class_sessions")
        .select("id,title,subject_name,education_level,grade,curriculum,starts_at,duration_minutes,status,meeting_url")
        .eq("created_by", auth.user.id)
        .order("starts_at", { ascending: true });
      if (sessionError) throw sessionError;
      const rows = (data || []) as SharedSession[];
      setSessions(rows);
      if (rows.length) {
        const { data: members, error: memberError } = await supabase
          .from("class_session_members")
          .select("session_id,learner_id")
          .in("session_id", rows.map(row => row.id));
        if (memberError) throw memberError;
        const counts: Record<string, number> = {};
        (members || [] as SessionMember[]).forEach((member: SessionMember) => {
          counts[member.session_id] = (counts[member.session_id] || 0) + 1;
        });
        setMemberCounts(counts);
      } else {
        setMemberCounts({});
      }
      setUpdatedAt(new Date().toISOString());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your shared teaching timetable could not be loaded.");
      setSessions([]);
      setMemberCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upcoming = sessions.filter(session => session.status !== "ended" && new Date(session.starts_at).getTime() >= Date.now());
  const past = sessions.filter(session => session.status === "ended" || new Date(session.starts_at).getTime() < Date.now());

  const renderSession = (session: SharedSession) => {
    const start = new Date(session.starts_at);
    const end = new Date(start.getTime() + Math.max(5, session.duration_minutes || 45) * 60000);
    return <article className="panel shared-teaching-session" key={session.id}>
      <div className="panel-heading">
        <div>
          <span className={"pin-status " + (session.status === "live" ? "active" : session.status === "ended" ? "pending" : "unused")}>{statusLabel(session.status)}</span>
          <h2>{session.title}</h2>
          <p>{session.subject_name || "Subject not set"} · {session.education_level || "Level not set"} · {session.grade || "Grade not set"}</p>
        </div>
        <BookOpen size={19}/>
      </div>
      <div className="settings-row">
        <div><strong><CalendarDays size={15}/> {start.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong><span><Clock3 size={14}/> {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {session.duration_minutes || 45} minutes</span></div>
        <span className="connection-pill"><i/> {memberCounts[session.id] || 0} learner(s) invited</span>
      </div>
      {session.curriculum && <p className="subtle-note">Curriculum: {session.curriculum}</p>}
      {session.meeting_url && session.status !== "ended" && <a className="secondary-button" href={session.meeting_url} target="_blank" rel="noreferrer"><Video size={14}/> Open class room</a>}
    </article>;
  };

  return <div className="subpage">
    <div className="welcome-row">
      <div><div className="eyebrow"><CalendarDays size={14}/> MY SHARED TEACHING TIMETABLE</div><h1>My timetable <span>workspace.</span></h1><p className="page-subtitle">Only classes and lessons that you have published to learners appear here. Individual learner school and personal timetables are available under Learners → select a learner → details.</p></div>
      <button type="button" className="primary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh my timetable"}</button>
    </div>
    {updatedAt && <p className="subtle-note">Last refreshed {new Date(updatedAt).toLocaleString()} · {sessions.length} published session(s).</p>}
    {error && <p className="inline-message error-message" role="alert">{error}</p>}
    {loading ? <div className="panel classroom-empty">Loading your shared teaching timetable…</div> : !sessions.length ? <div className="panel classroom-empty"><CalendarDays size={24}/><strong>Your shared timetable is empty</strong><span>When you publish a lesson to learners from Classroom Studio, it will appear here. Student timetables will not be mixed into this view.</span></div> : <>
      <section className="subpage-section"><div className="panel-heading"><div><h2>Upcoming and active classes</h2><p>{upcoming.length} upcoming / active session(s)</p></div><Users size={18}/></div>{upcoming.length ? upcoming.map(renderSession) : <div className="panel classroom-empty">No upcoming shared classes.</div>}</section>
      <section className="subpage-section"><div className="panel-heading"><div><h2>Previous classes</h2><p>{past.length} completed or past session(s)</p></div><Clock3 size={18}/></div>{past.length ? past.slice().reverse().map(renderSession) : <div className="panel classroom-empty">No previous classes yet.</div>}</section>
    </>}
  </div>;
}
