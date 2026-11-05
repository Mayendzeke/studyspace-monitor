import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { supabase } from "../lib/supabase";

type Attempt = {
  id: string;
  assignment_id: string;
  learner_id: string;
  answers: Record<string, unknown>;
  score: number;
  total_points: number;
  submitted_at: string;
  manual_marks: Record<string, number>;
  teacher_feedback: string;
  marked_by: string | null;
  marked_at: string | null;
};
type Question = { id: string; exercise_set_id: string; question_type: string; prompt: string; points: number; markingGuide?: string };
type ReviewItem = {
  attempt: Attempt;
  title: string;
  subject: string;
  learner: string;
  studentId: string;
  questions: Question[];
};

export default function AssessmentReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [marks, setMarks] = useState<Record<string, Record<string, string>>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) { setError("Studyspace is not connected."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Sign in again to review assessment submissions.");
      const { data: assignments, error: assignmentError } = await supabase.from("exercise_assignments")
        .select("id,exercise_set_id,learner_id").order("assigned_at", { ascending: false });
      if (assignmentError) throw assignmentError;
      const rows = assignments || [];
      if (!rows.length) { setItems([]); setLoading(false); return; }
      const assignmentIds = rows.map(row => row.id);
      const setIds = [...new Set(rows.map(row => row.exercise_set_id))];
      const learnerIds = [...new Set(rows.map(row => row.learner_id))];
      const [attemptResult, setResult, questionResult, learnerResult] = await Promise.all([
        supabase.from("exercise_attempts")
          .select("id,assignment_id,learner_id,answers,score,total_points,submitted_at,manual_marks,teacher_feedback,marked_by,marked_at")
          .in("assignment_id", assignmentIds).order("submitted_at", { ascending: false }),
        supabase.from("exercise_sets").select("id,title,subject_name").in("id", setIds),
        supabase.from("exercise_questions").select("id,exercise_set_id,question_type,prompt,points")
          .in("exercise_set_id", setIds).order("position"),
        supabase.from("profiles").select("id,student_id,full_name,preferred_name").in("id", learnerIds),
      ]);
      if (attemptResult.error) throw attemptResult.error;
      if (setResult.error) throw setResult.error;
      if (questionResult.error) throw questionResult.error;
      if (learnerResult.error) throw learnerResult.error;
      const shortAnswerIds = (questionResult.data || []).filter(q => q.question_type === "short_answer").map(q => q.id);
      let markingGuides = new Map<string, string>();
      if (shortAnswerIds.length) {
        const { data: answerKeys, error: answerKeyError } = await supabase.from("exercise_answer_keys")
          .select("question_id,answer_key").in("question_id", shortAnswerIds);
        if (answerKeyError) throw answerKeyError;
        markingGuides = new Map((answerKeys || []).map(row => [
          row.question_id,
          String((row.answer_key as Record<string, unknown> | null)?.explanation || "")
        ]));
      }
      const setMap = new Map((setResult.data || []).map(row => [row.id, row]));
      const learnerMap = new Map((learnerResult.data || []).map(row => [row.id, row]));
      const assignmentMap = new Map(rows.map(row => [row.id, row]));
      const next: ReviewItem[] = (attemptResult.data || []).map(raw => {
        const attempt = {
          ...raw,
          manual_marks: (raw.manual_marks || {}) as Record<string, number>,
          answers: (raw.answers || {}) as Record<string, unknown>,
        } as Attempt;
        const assignment = assignmentMap.get(attempt.assignment_id);
        const set = assignment ? setMap.get(assignment.exercise_set_id) : undefined;
        const learner = learnerMap.get(attempt.learner_id);
        return {
          attempt,
          title: set?.title || "Assessment",
          subject: set?.subject_name || "General",
          learner: learner?.preferred_name || learner?.full_name || "Learner",
          studentId: learner?.student_id || "",
          questions: (questionResult.data || []).filter(q =>
            q.exercise_set_id === assignment?.exercise_set_id && q.question_type === "short_answer"
          ).map(q => ({ ...q, markingGuide: markingGuides.get(q.id) || "" })) as Question[],
        };
      }).filter(item => item.questions.length > 0);
      setItems(next);
      setMarks(current => {
        const updated = { ...current };
        for (const item of next) {
          if (!updated[item.attempt.id]) {
            updated[item.attempt.id] = Object.fromEntries(item.questions.map(q => [
              q.id,
              item.attempt.manual_marks[q.id] === undefined ? "" : String(item.attempt.manual_marks[q.id])
            ]));
          }
        }
        return updated;
      });
      setFeedback(current => {
        const updated = { ...current };
        for (const item of next) if (updated[item.attempt.id] === undefined) updated[item.attempt.id] = item.attempt.teacher_feedback || "";
        return updated;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Assessment submissions could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const pendingCount = useMemo(() => items.filter(item => !item.attempt.marked_at).length, [items]);

  const gradeAttempt = async (item: ReviewItem) => {
    if (!supabase || busyId) return;
    const attemptId = item.attempt.id;
    const values = marks[attemptId] || {};
    const newMarks: Record<string, number> = {};
    for (const question of item.questions) {
      const raw = values[question.id];
      const value = raw === "" || raw === undefined ? NaN : Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > Number(question.points)) {
        setError("Enter a mark from 0 to " + question.points + " for each written response.");
        return;
      }
      newMarks[question.id] = value;
    }
    setBusyId(attemptId); setError(""); setNotice("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your administrator session has expired.");
      const previousManual = Object.values(item.attempt.manual_marks || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const currentManual = Object.values(newMarks).reduce((sum, value) => sum + value, 0);
      const autoScore = Math.max(0, Number(item.attempt.score) - previousManual);
      const nextScore = Math.min(Number(item.attempt.total_points), autoScore + currentManual);
      const markedAt = new Date().toISOString();
      const teacherFeedback = (feedback[attemptId] || "").trim().slice(0, 2000);
      const { error: updateError } = await supabase.from("exercise_attempts").update({
        manual_marks: newMarks,
        teacher_feedback: teacherFeedback,
        marked_by: auth.user.id,
        marked_at: markedAt,
        score: nextScore,
      }).eq("id", attemptId);
      if (updateError) throw updateError;

      const { data: events, error: eventsError } = await supabase.from("progress_events")
        .select("id,metadata").eq("learner_id", item.attempt.learner_id).eq("event_type", "assigned_assessment");
      if (eventsError) throw eventsError;
      const event = (events || []).find(row => row.metadata?.attempt_id === attemptId);
      if (event) {
        const { error: progressError } = await supabase.from("progress_events").update({
          score: nextScore,
          max_score: item.attempt.total_points,
          metadata: { ...event.metadata, teacher_marked_at: markedAt },
        }).eq("id", event.id);
        if (progressError) throw new Error("The written answers were marked, but progress reporting could not be refreshed: " + progressError.message);
      }
      setNotice("Written responses marked and the learner's result updated.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assessment could not be marked.");
    } finally { setBusyId(""); }
  };

  return <section className="panel assessment-review-queue">
    <div className="panel-heading">
      <div><h2>Written response marking</h2><p>Review short answers submitted by learners.</p></div>
      <div className="assessment-review-tools"><span className="assessment-review-count">{pendingCount} awaiting review</span><button className="icon-button" title="Refresh submissions" aria-label="Refresh submissions" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16}/></button></div>
    </div>
    {error && <div className="assessment-review-message is-error" role="alert"><AlertCircle size={15}/>{error}</div>}
    {notice && <div className="assessment-review-message is-success" role="status"><CheckCircle2 size={15}/>{notice}</div>}
    {loading ? <div className="assessment-review-empty"><LoaderCircle size={21}/><span>Loading written submissions…</span></div> :
      items.length ? <div className="assessment-review-list">{items.map(item => {
        const attempt = item.attempt;
        const attemptMarks = marks[attempt.id] || {};
        return <article className="assessment-review-card" key={attempt.id}>
          <div className="assessment-review-card-head">
            <div><strong>{item.learner}</strong><span>{item.studentId ? item.studentId + " · " : ""}{item.title} · {item.subject}</span></div>
            <span className={attempt.marked_at ? "assessment-review-status is-marked" : "assessment-review-status"}>{attempt.marked_at ? "Marked" : "Awaiting review"}</span>
          </div>
          <div className="assessment-review-card-meta"><span>Submitted {new Date(attempt.submitted_at).toLocaleString()}</span><span>Automatic mark: {Number(attempt.score) - Object.values(attempt.manual_marks || {}).reduce((sum,value)=>sum+Number(value||0),0)} / {attempt.total_points}</span></div>
          {item.questions.map((question,index) => <div className="assessment-review-answer" key={question.id}>
            <div className="assessment-review-question"><strong>Written response {index + 1}</strong><span>{question.points} marks</span></div>
            <p>{question.prompt}</p>
            <blockquote>{String(attempt.answers[question.id] ?? "").trim() || "No answer submitted."}</blockquote>
            {question.markingGuide && <div className="assessment-review-guidance"><strong>Private marking guidance</strong><p>{question.markingGuide}</p></div>}
            <label>Mark awarded
              <input type="number" min="0" max={question.points} step="0.5" value={attemptMarks[question.id] ?? ""}
                onChange={event => setMarks(current => ({ ...current, [attempt.id]: { ...(current[attempt.id] || {}), [question.id]: event.target.value } }))}/>
              <small>Maximum {question.points} marks</small>
            </label>
          </div>)}
          <label className="assessment-review-feedback">Feedback for learner
            <textarea rows={2} maxLength={2000} value={feedback[attempt.id] ?? ""} onChange={event => setFeedback(current => ({ ...current, [attempt.id]: event.target.value }))} placeholder="Optional feedback on the written responses…"/>
          </label>
          <div className="assessment-review-card-footer">
            {attempt.marked_at && <span>Last marked {new Date(attempt.marked_at).toLocaleString()}</span>}
            <button className="primary-button" onClick={() => void gradeAttempt(item)} disabled={busyId === attempt.id}>
              {busyId === attempt.id ? "Saving…" : "Save marks"} <Save size={15}/>
            </button>
          </div>
        </article>;
      })}</div> :
      <div className="assessment-review-empty"><ClipboardCheck size={25}/><strong>No written submissions to review</strong><span>Short-answer responses from assigned assessments will appear here after learners submit them.</span></div>}
  </section>;
}
