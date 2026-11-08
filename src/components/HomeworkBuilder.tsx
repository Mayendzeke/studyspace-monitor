import { useEffect, useMemo, useState } from "react";
import { BookOpen, Clock3, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

type QuestionType = "multiple_choice" | "fill_blank" | "short_answer" | "true_false" | "matching";
type Format = QuestionType | "mixed";
type Pair = { left: string; right: string };
type HomeworkQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  topic: string;
  difficulty: string;
  options: string[];
  answer: string;
  acceptedAnswers: string[];
  pairs: Pair[];
  explanation: string;
  markingGuide: string;
};
type ClassroomGroup = { id:string; title:string; subject_name:string; education_level:string; grade:string; curriculum:string; starts_at:string|null; };
type Learner = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  student_id: string | null;
  education_level: string | null;
  grade: string | null;
  curriculum: string | null;
  course: string | null;
  account_status: string;
};
const formats: { value: Format; label: string }[] = [
  { value: "mixed", label: "Mixed question types" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "fill_blank", label: "Fill in the blanks" },
  { value: "short_answer", label: "Short written response" },
  { value: "true_false", label: "True / false" },
  { value: "matching", label: "Matching" },
];
const levels = ["Primary school", "Secondary school", "High school / Sixth form", "College", "University", "Other"];
const uuid = () => crypto.randomUUID();
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const toQuestion = (raw: Record<string, unknown>, fallbackPoints: number, topic: string, difficulty: string): HomeworkQuestion => {
  const type = String(raw.type || raw.question_type || "short_answer") as QuestionType;
  const allowed: QuestionType[] = ["multiple_choice", "fill_blank", "short_answer", "true_false", "matching"];
  if (!allowed.includes(type)) throw new Error("MIA returned an unsupported question format.");
  const options = Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 6) : [];
  const pairs = Array.isArray(raw.pairs) ? raw.pairs.filter((p): p is Record<string, unknown> => !!p && typeof p === "object").map(p => ({ left: String(p.left || ""), right: String(p.right || "") })).filter(p => p.left && p.right).slice(0, 8) : [];
  const acceptedAnswers = Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers.map(String).filter(Boolean).slice(0, 8) : [];
  return {
    id: uuid(), type, prompt: String(raw.prompt || "").trim().slice(0, 1500),
    points: Math.max(0.25, Math.min(100, Number(raw.points) || fallbackPoints)),
    topic: String(raw.topic || topic).trim().slice(0, 120),
    difficulty: String(raw.difficulty || difficulty).trim().slice(0, 40),
    options, answer: String(raw.answer || "").trim().slice(0, 500),
    acceptedAnswers, pairs,
    explanation: String(raw.explanation || "").trim().slice(0, 2000),
    markingGuide: String(raw.markingGuide || raw.marking_guide || "").trim().slice(0, 2500),
  };
};

export default function HomeworkBuilder() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [groups, setGroups] = useState<ClassroomGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [groupLearnerIds, setGroupLearnerIds] = useState<string[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [loadingLearners, setLoadingLearners] = useState(true);
  const [level, setLevel] = useState("");
  const [grade, setGrade] = useState("");
  const [course, setCourse] = useState("");
  const [subject, setSubject] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<Format>("mixed");
  const [difficulty, setDifficulty] = useState("Standard");
  const [questionCount, setQuestionCount] = useState(8);
  const [points, setPoints] = useState(1);
  const [instructions, setInstructions] = useState("Answer every question. Show working where appropriate.");
  const [dueDate, setDueDate] = useState("");
  const [recipientMode, setRecipientMode] = useState<"group" | "selected">("group");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase) { setError("StudySpace is not connected."); setLoadingLearners(false); return; }
      const [{ data, error: loadError }, { data: groupRows, error: groupError }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,preferred_name,student_id,education_level,grade,curriculum,course,account_status").eq("role", "learner").eq("account_status", "active").order("preferred_name"),
        supabase.from("class_sessions").select("id,title,subject_name,education_level,grade,curriculum,starts_at").order("created_at", { ascending: false }).limit(100),
      ]);
      if (!alive) return;
      if (loadError) setError("The active learner list could not be loaded: " + loadError.message);
      else {
        const rows = (data || []) as Learner[];
        setLearners(rows);
        const first = rows[0];
        if (first) {
          setLevel(first.education_level || "");
          setGrade(first.grade || "");
          setCurriculum(first.curriculum || "");
          setCourse(first.course || "");
        }
      }
      if (groupError) setError(current => current || "Classroom groups could not be loaded: " + groupError.message);
      else setGroups((groupRows || []) as ClassroomGroup[]);
      setLoadingLearners(false);
    };
    void load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadGroupMembers = async () => {
      if (!supabase || !groupId) { setGroupLearnerIds([]); setGroupLoading(false); return; }
      setGroupLoading(true);
      const { data, error: memberError } = await supabase.from("class_session_members").select("learner_id").eq("session_id", groupId);
      if (!alive) return;
      if (memberError) setError("The selected classroom roster could not be loaded: " + memberError.message);
      else setGroupLearnerIds((data || []).map(row => String(row.learner_id)));
      setGroupLoading(false);
    };
    void loadGroupMembers();
    return () => { alive = false; };
  }, [groupId]);

  const gradeOptions = useMemo(() => [...new Set(learners.filter(x => !level || x.education_level === level).map(x => x.grade || "").filter(Boolean))].sort(), [learners, level]);
  const courseOptions = useMemo(() => [...new Set(learners.filter(x => !level || x.education_level === level).map(x => x.course || "").filter(Boolean))].sort(), [learners, level]);
  const matchingLearners = useMemo(() => learners.filter(x =>
    (!level || x.education_level === level) &&
    (!grade || x.grade === grade) &&
    (!course || x.course === course) &&
    (!groupId || groupLearnerIds.includes(x.id))
  ), [learners, level, grade, course, groupId, groupLearnerIds]);
  const recipients = recipientMode === "group" ? matchingLearners : matchingLearners.filter(x => selectedIds.includes(x.id));

  const generate = async () => {
    if (!supabase) return;
    setError(""); setNotice("");
    if (!subject.trim() || !topic.trim() || !level || !grade) {
      setError("Choose the education level and grade/year, then enter a subject and topic.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("generate-homework", {
        body: { subject, topic, educationLevel: level, grade, course, curriculum, format, difficulty, questionCount, pointsPerQuestion: points, instructions }
      });
      if (invokeError) throw invokeError;
      if (!data?.success || !Array.isArray(data.questions)) throw new Error(data?.error || "MIA did not return a usable question set.");
      const next = data.questions.map((item: Record<string, unknown>) => toQuestion(item, points, topic, difficulty));
      if (next.length !== questionCount) throw new Error("MIA returned " + next.length + " questions instead of " + questionCount + ". Please retry.");
      setQuestions(next); setReviewed(false);
      setNotice("MIA generated " + next.length + " questions. Review and edit the prompts, answers and explanations before assigning.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MIA could not generate this homework.");
    } finally { setGenerating(false); }
  };

  const updateQuestion = (id: string, patch: Partial<HomeworkQuestion>) =>
    setQuestions(current => current.map(q => q.id === id ? { ...q, ...patch } : q));
  const removeQuestion = (id: string) => { setQuestions(current => current.filter(q => q.id !== id)); setReviewed(false); };
  const addQuestion = () => {
    setQuestions(current => [...current, {
      id: uuid(), type: "short_answer", prompt: "", points, topic, difficulty,
      options: [], answer: "", acceptedAnswers: [], pairs: [], explanation: "", markingGuide: ""
    }]);
    setReviewed(false);
  };

  const publish = async () => {
    if (!supabase || publishing) return;
    setError(""); setNotice("");
    if (!reviewed) { setError("Confirm that you have reviewed and edited this question set before publishing."); return; }
    if (recipients.length === 0) { setError("Select at least one active learner, class or group."); return; }
    if (!subject.trim() || !topic.trim() || questions.length === 0) { setError("A subject, topic and at least one question are required."); return; }
    for (const [index, q] of questions.entries()) {
      if (!q.prompt.trim()) { setError("Question " + (index + 1) + " needs a question prompt."); return; }
      if (q.type === "multiple_choice" && (q.options.length < 2 || !q.options.includes(q.answer))) { setError("Question " + (index + 1) + " needs at least two options and a correct option."); return; }
      if (q.type === "true_false" && !["True", "False"].includes(q.answer)) { setError("Question " + (index + 1) + " needs a True or False answer key."); return; }
      if (q.type === "fill_blank" && !q.answer.trim() && q.acceptedAnswers.length === 0) { setError("Question " + (index + 1) + " needs at least one accepted answer."); return; }
      if (q.type === "matching" && q.pairs.length < 2) { setError("Question " + (index + 1) + " needs at least two matching pairs."); return; }
      if (q.type === "short_answer" && !q.markingGuide.trim()) { setError("Question " + (index + 1) + " needs a teacher marking guide."); return; }
    }
    setPublishing(true);
    const setId = uuid();
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Administrator sign-in has expired. Sign in again.");
      const questionRows = questions.map((q, index) => {
        let content: Record<string, unknown> = { topic: q.topic, difficulty: q.difficulty };
        if (q.type === "multiple_choice") content = { ...content, options: q.options };
        if (q.type === "matching") {
          const shuffledRight = shuffle(q.pairs.map(pair => pair.right));
          content = { ...content, pairs: q.pairs.map((pair, pairIndex) => ({ left: pair.left, right: shuffledRight[pairIndex] })) };
        }
        return {
          id: q.id,
          position: index + 1,
          question_type: q.type,
          prompt: q.prompt.trim(),
          content,
          explanation: "",
          points: q.points,
          topic: q.topic,
          difficulty: q.difficulty,
        };
      });
      const answerRows = questions.map(q => ({
        question_id: q.id,
        answer_key: q.type === "matching"
          ? { pairs: q.pairs, explanation: q.explanation }
          : q.type === "short_answer"
            ? { markingGuide: q.markingGuide }
            : { answer: q.answer, acceptedAnswers: q.acceptedAnswers, explanation: q.explanation },
      }));
      const dueAt = dueDate ? new Date(dueDate + "T23:59:00").toISOString() : null;
      const { error: draftError } = await supabase.rpc("save_studyspace_exercise_draft", {
        p_set: {
          id: setId, title: subject.trim() + " · " + topic.trim(),
          instructions: instructions.trim(), subject_name: subject.trim(),
          education_level: level, grade: grade, curriculum: curriculum.trim(),
          duration_minutes: Math.max(5, questions.length * 2),
          due_date: dueDate || null, review_status: "approved"
        },
        p_questions: questionRows,
        p_answer_keys: answerRows,
      });
      if (draftError) throw draftError;
      const assignments = recipients.map(learner => ({
        exercise_set_id: setId,
        learner_id: learner.id,
        assigned_by: auth.user.id,
        due_at: dueAt,
        available_at: new Date().toISOString(),
      }));
      const { error: assignmentError } = await supabase.from("exercise_assignments").insert(assignments);
      if (assignmentError) throw new Error("The reviewed homework is saved as a private draft, but it could not be assigned: " + assignmentError.message);
      const { error: publishError } = await supabase.from("exercise_sets").update({ is_published: true, review_status: "approved", updated_at: new Date().toISOString() }).eq("id", setId);
      if (publishError) {
        await supabase.from("exercise_assignments").delete().eq("exercise_set_id", setId);
        throw new Error("The assignment records were rolled back because the homework could not be published: " + publishError.message);
      }
      setNotice("Published successfully to " + recipients.length + " learner(s). It now appears in Assigned by my teacher in their Study & Exams workspace.");
      setQuestions([]); setReviewed(false); setSelectedIds([]); setDueDate("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Homework could not be saved and assigned.");
    } finally { setPublishing(false); }
  };

  return <section className="panel homework-builder">
    <div className="panel-heading">
      <div><h2><Sparkles size={18}/> MIA Homework</h2><p>Generate, review and assign interactive homework through the existing assessment system.</p></div>
      <BookOpen size={20}/>
    </div>
    <div className="homework-privacy-note"><strong>Teacher review is required.</strong> MIA creates a private draft. Learners cannot see the answer keys. Only publish after checking each question.</div>
    {error && <div className="homework-message error" role="alert">{error}</div>}
    {notice && <div className="homework-message success" role="status">{notice}</div>}
    <div className="homework-grid">
      <label>Classroom group / session<select value={groupId} onChange={e => {
        const next = e.target.value;
        const group = groups.find(item => item.id === next);
        setGroupId(next); setSelectedIds([]);
        if (group) {
          setLevel(group.education_level || "");
          setGrade(group.grade || "");
          setCurriculum(group.curriculum || "");
          setCourse("");
          if (group.subject_name && !subject.trim()) setSubject(group.subject_name);
        }
      }}><option value="">Choose a class roster or use grade filters</option>{groups.map(group => <option key={group.id} value={group.id}>{group.title}{group.subject_name ? " · " + group.subject_name : ""}{group.starts_at ? " · " + new Date(group.starts_at).toLocaleDateString() : ""}</option>)}</select></label>
      <label>Education level<select value={level} onChange={e=>{setLevel(e.target.value);setGrade("");setCourse("");setSelectedIds([])}}><option value="">Choose level</option>{[...new Set([...levels,...learners.map(x=>x.education_level||"").filter(Boolean)])].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Grade / year<select value={grade} onChange={e=>{setGrade(e.target.value);setSelectedIds([])}}><option value="">Choose grade / year</option>{gradeOptions.map(x=><option key={x}>{x}</option>)}</select></label>
      {courseOptions.length>0 && <label>Course / programme<select value={course} onChange={e=>{setCourse(e.target.value);setSelectedIds([])}}><option value="">All courses</option>{courseOptions.map(x=><option key={x}>{x}</option>)}</select></label>}
      <label>Subject / module<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={120} placeholder="e.g. Mathematics"/></label>
      <label>Curriculum / syllabus<input value={curriculum} onChange={e=>setCurriculum(e.target.value)} maxLength={120} placeholder="e.g. Cambridge IGCSE"/></label>
      <label>Topic<input value={topic} onChange={e=>setTopic(e.target.value)} maxLength={160} placeholder="e.g. Linear equations"/></label>
      <label>Question format<select value={format} onChange={e=>setFormat(e.target.value as Format)}>{formats.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label>Difficulty<select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>Foundation</option><option>Standard</option><option>Advanced</option><option>Exam practice</option></select></label>
      <label>Number of questions<input type="number" min={1} max={30} value={questionCount} onChange={e=>setQuestionCount(Math.max(1,Math.min(30,Number(e.target.value)||1)))}/></label>
      <label>Marks per question<input type="number" min={0.25} max={100} step={0.25} value={points} onChange={e=>setPoints(Math.max(0.25,Math.min(100,Number(e.target.value)||1)))}/></label>
      <label>Due date<input type="date" value={dueDate} min={new Date().toISOString().slice(0,10)} onChange={e=>setDueDate(e.target.value)}/></label>
    </div>
    <label className="homework-instructions">Instructions for learners<textarea rows={3} maxLength={2000} value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
    <div className="homework-generate-row">
      <button className="primary-button" type="button" disabled={generating || loadingLearners} onClick={()=>void generate()}><Sparkles size={16}/>{generating?"Generating with MIA…":"Generate with MIA"}</button>
      <span>{loadingLearners?"Loading active learner list…":groupLoading?"Loading classroom roster…":matchingLearners.length+" active learner(s) "+(groupId?"in this classroom roster":"match the selected grade/course filters")+"."}</span>
    </div>
    <div className="homework-recipients">
      <div className="homework-subheading"><strong><Users size={16}/> Recipients</strong><span>{recipients.length} selected</span></div>
      <div className="homework-recipient-mode">
        <label><input type="radio" checked={recipientMode==="group"} onChange={()=>setRecipientMode("group")}/> Entire matching class / group</label>
        <label><input type="radio" checked={recipientMode==="selected"} onChange={()=>setRecipientMode("selected")}/> Selected learners / individual</label>
      </div>
      {recipientMode==="selected" && <div className="homework-learner-list">{matchingLearners.map(learner=><label key={learner.id}><input type="checkbox" checked={selectedIds.includes(learner.id)} onChange={e=>setSelectedIds(current=>e.target.checked?[...current,learner.id]:current.filter(id=>id!==learner.id))}/><span>{learner.preferred_name||learner.full_name||"Learner"} <small>{learner.student_id||"No Student ID"}</small></span></label>)}</div>}
    </div>

    {questions.length>0 && <div className="homework-review">
      <div className="homework-subheading"><strong>Review questions before publishing</strong><span>{questions.length} question(s) · {questions.reduce((n,q)=>n+q.points,0)} total marks</span></div>
      {questions.map((q,index)=><article className="homework-question" key={q.id}>
        <div className="homework-question-top"><strong>Question {index+1} · {formats.find(x=>x.value===q.type)?.label||q.type}</strong><button className="homework-remove" type="button" onClick={()=>removeQuestion(q.id)} aria-label={"Remove question "+(index+1)}><Trash2 size={15}/></button></div>
        <label>Question prompt<textarea rows={3} value={q.prompt} onChange={e=>{updateQuestion(q.id,{prompt:e.target.value});setReviewed(false)}}/></label>
        <div className="homework-question-fields">
          <label>Marks<input type="number" min={0.25} max={100} step={0.25} value={q.points} onChange={e=>{updateQuestion(q.id,{points:Math.max(.25,Number(e.target.value)||.25)});setReviewed(false)}}/></label>
          <label>Topic<input value={q.topic} onChange={e=>{updateQuestion(q.id,{topic:e.target.value});setReviewed(false)}}/></label>
          <label>Difficulty<select value={q.difficulty} onChange={e=>{updateQuestion(q.id,{difficulty:e.target.value});setReviewed(false)}}><option>Foundation</option><option>Standard</option><option>Advanced</option><option>Exam practice</option></select></label>
        </div>
        {q.type==="multiple_choice" && <>
          <label>Answer options (one per line)<textarea rows={4} value={q.options.join("\n")} onChange={e=>{updateQuestion(q.id,{options:e.target.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});setReviewed(false)}}/></label>
          <label>Correct option<select value={q.answer} onChange={e=>{updateQuestion(q.id,{answer:e.target.value});setReviewed(false)}}><option value="">Choose correct option</option>{q.options.map(x=><option key={x}>{x}</option>)}</select></label>
        </>}
        {q.type==="true_false" && <label>Correct answer<select value={q.answer} onChange={e=>{updateQuestion(q.id,{answer:e.target.value});setReviewed(false)}}><option value="">Choose answer</option><option>True</option><option>False</option></select></label>}
        {q.type==="fill_blank" && <>
          <label>Expected answer<input value={q.answer} onChange={e=>{updateQuestion(q.id,{answer:e.target.value});setReviewed(false)}}/></label>
          <label>Other accepted answers (comma separated)<input value={q.acceptedAnswers.join(", ")} onChange={e=>{updateQuestion(q.id,{acceptedAnswers:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)});setReviewed(false)}}/></label>
        </>}
        {q.type==="matching" && <label>Matching pairs (one pair per line, use left :: right)<textarea rows={4} value={q.pairs.map(p=>p.left+" :: "+p.right).join("\n")} onChange={e=>{updateQuestion(q.id,{pairs:e.target.value.split(/\r?\n/).map(line=>{const [left,...right]=line.split("::");return {left:left?.trim()||"",right:right.join("::").trim()}}).filter(p=>p.left&&p.right)});setReviewed(false)}}/></label>}
        {q.type==="short_answer" && <label>Teacher marking guide / rubric<textarea rows={3} value={q.markingGuide} onChange={e=>{updateQuestion(q.id,{markingGuide:e.target.value});setReviewed(false)}}/></label>}
        {q.type!=="short_answer" && <label>Explanation shown after submission<textarea rows={2} value={q.explanation} onChange={e=>{updateQuestion(q.id,{explanation:e.target.value});setReviewed(false)}}/></label>}
      </article>)}
      <button className="subtle-button" type="button" onClick={addQuestion}><Plus size={15}/> Add a question</button>
      <label className="homework-review-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I have reviewed the question prompts, answers, marks and explanations, and approve this homework for the selected learners.</span></label>
      <div className="homework-publish-row"><span><Clock3 size={15}/> {recipients.length} learner(s) · {dueDate?"Due "+dueDate:"No due date"}</span><button className="primary-button" type="button" onClick={()=>void publish()} disabled={publishing||!reviewed||recipients.length===0}>{publishing?"Saving and assigning…":"Publish homework"}</button></div>
    </div>}
    {!questions.length && <div className="homework-empty"><BookOpen size={23}/><strong>Your questions will appear here.</strong><span>Generate a set with MIA or add questions after generating a set.</span></div>}
  </section>;
}
