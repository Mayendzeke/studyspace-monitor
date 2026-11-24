import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, FileText, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type SourceReference = { title?: string; url?: string; publisher?: string; accessed_at?: string };
type ReviewItem = {
  id: string;
  learner_id: string;
  title: string;
  summary: string;
  subject_name: string;
  topic: string;
  material_type: string;
  content: Record<string, unknown>;
  country: string;
  institution: string;
  education_level: string;
  grade: string;
  course: string;
  curriculum: string;
  academic_year: string;
  language: string;
  source_references: SourceReference[];
  profile_snapshot: Record<string, unknown>;
  generator: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string;
  created_at: string;
};

function markdownFor(item: ReviewItem): string {
  const content = item.content || {};
  if (typeof content.markdown === "string") return content.markdown;
  if (typeof content.body === "string") return content.body;
  if (typeof content.content === "string") return content.content;
  const sections = Array.isArray(content.sections) ? content.sections as Record<string, unknown>[] : [];
  if (sections.length) {
    return sections.map(section => {
      const heading = String(section.heading || section.title || "Learning section");
      const body = String(section.body || section.content || "");
      const examples = Array.isArray(section.examples) ? section.examples.map(String).map(value => "- " + value).join("\n") : "";
      return "## " + heading + "\n\n" + body + (examples ? "\n\n" + examples : "");
    }).join("\n\n");
  }
  return "# " + item.title + "\n\n" + item.summary + "\n\n" + JSON.stringify(content, null, 2);
}

const when = (value: string) => new Date(value).toLocaleString();

export default function LearningMaterialReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const refresh = useCallback(async () => {
    if (!supabase) { setError("StudySpace database is not connected."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("learning_material_review_queue")
      .select("id,learner_id,title,summary,subject_name,topic,material_type,content,country,institution,education_level,grade,course,curriculum,academic_year,language,source_references,profile_snapshot,generator,status,review_notes,created_at")
      .eq("status", filter).order("created_at", { ascending: false }).limit(200);
    if (queryError) setError("Learning-material review queue could not be loaded: " + queryError.message);
    else setItems((data || []) as ReviewItem[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter(item => [item.title,item.subject_name,item.topic,item.country,item.grade,item.course,item.curriculum]
      .some(value => String(value || "").toLocaleLowerCase().includes(term)));
  }, [items, search]);

  async function approve(item: ReviewItem) {
    if (!supabase || busyId) return;
    setBusyId(item.id); setError(""); setNotice("");
    let storagePath = "";
    let resourceId = "";
    let assignmentCreated = false;
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your administrator session has expired. Sign in again.");
      const markdown = markdownFor(item).trim();
      if (markdown.length < 80) throw new Error("This material is too short to publish safely. Request a correction instead.");
      const file = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      storagePath = auth.user.id + "/resources/ai-materials/" + item.learner_id + "/" + item.id + ".md";
      const { error: uploadError } = await supabase.storage.from("studyspace-resources").upload(storagePath, file, {
        contentType: "text/markdown",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: resource, error: resourceError } = await supabase.from("learning_resources").insert({
        created_by: auth.user.id,
        title: item.title,
        description: item.summary || "AI-prepared learning material reviewed by Study Space.",
        subject_name: item.subject_name,
        education_level: item.education_level,
        curriculum: item.curriculum,
        storage_path: storagePath,
        mime_type: "text/markdown",
        file_size: file.size,
        topic: item.topic,
        resource_type: item.material_type || "Study notes",
      }).select("id").single();
      if (resourceError || !resource) throw resourceError || new Error("The learning resource record was not created.");
      resourceId = resource.id;

      const { error: assignmentError } = await supabase.from("resource_assignments").insert({
        resource_id: resourceId,
        learner_id: item.learner_id,
        assigned_by: auth.user.id,
      });
      if (assignmentError) throw assignmentError;
      assignmentCreated = true;

      const { error: reviewError } = await supabase.from("learning_material_review_queue").update({
        status: "approved",
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        published_resource_id: resourceId,
      }).eq("id", item.id).eq("status", "pending");
      if (reviewError) throw reviewError;
      setNotice("Material approved and published to the learner's Study Materials library.");
      await refresh();
    } catch (reason) {
      if (assignmentCreated && resourceId) await supabase.from("resource_assignments").delete().eq("resource_id", resourceId);
      if (resourceId) await supabase.from("learning_resources").delete().eq("id", resourceId);
      if (storagePath) await supabase.storage.from("studyspace-resources").remove([storagePath]);
      setError(reason instanceof Error ? reason.message : "The material could not be published. No student access was granted.");
    } finally {
      setBusyId("");
    }
  }

  async function reject(item: ReviewItem) {
    if (!supabase || busyId) return;
    const reason = window.prompt("Why should this material be rejected? This note is kept for review history.");
    if (reason === null) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your administrator session has expired.");
      const { error: updateError } = await supabase.from("learning_material_review_queue").update({
        status: "rejected",
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reason.trim().slice(0, 1200),
      }).eq("id", item.id).eq("status", "pending");
      if (updateError) throw updateError;
      setNotice("Material rejected. It will not appear in the learner's library.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The material could not be rejected.");
    } finally {
      setBusyId("");
    }
  }

  return <div className="subpage learning-material-review">
    <div className="eyebrow">ACADEMIC CONTENT QUALITY CONTROL</div>
    <h1>Learning material review</h1>
    <p className="page-subtitle">Review AI-prepared material against each learner's country, curriculum, level, grade, course and registered subject before publishing it to their profile.</p>

    <div className="panel settings-card">
      <div className="panel-heading">
        <div><h2>Material approval queue</h2><p>Pending material is private to Monitor. Learners only receive resources after approval.</p></div>
        <ShieldCheck size={20}/>
      </div>
      <div className="setting-row">
        <div><strong>Review status</strong><span>Inspect pending submissions or review previously processed material.</span></div>
        <select aria-label="Review status" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
          <option value="pending">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <label className="material-review-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, subject, curriculum or learner context"/></label>
      {error && <p className="inline-message error-message" role="alert">{error}</p>}
      {notice && <p className="inline-message" role="status">{notice}</p>}
      {loading ? <div className="classroom-empty"><RefreshCw size={22}/><strong>Loading review queue</strong><span>Checking materials awaiting administrator review.</span></div>
        : visible.length ? <div className="material-review-list">{visible.map(item => {
          const sources = Array.isArray(item.source_references) ? item.source_references : [];
          const profile = item.profile_snapshot || {};
          return <article className="panel material-review-card" key={item.id}>
            <div className="panel-heading">
              <div><span className="eyebrow">{item.subject_name} · {item.topic || "General coverage"}</span><h2>{item.title}</h2><p>{item.summary}</p></div>
              <span className={"material-review-status status-" + item.status}>{item.status}</span>
            </div>
            <div className="material-review-profile">
              <span><b>Country</b>{item.country || "Not supplied"}</span>
              <span><b>Curriculum</b>{item.curriculum || "Not supplied"}</span>
              <span><b>Level / grade</b>{[item.education_level,item.grade].filter(Boolean).join(" · ") || "Not supplied"}</span>
              <span><b>Course</b>{item.course || "Not supplied"}</span>
              <span><b>Institution</b>{item.institution || "Not supplied"}</span>
              <span><b>Language</b>{item.language || "English"}</span>
              <span><b>Academic year</b>{item.academic_year || "Not supplied"}</span>
              <span><b>Generator</b>{item.generator}</span>
            </div>
            {Object.keys(profile).length > 0 && <details><summary>Full academic profile used for research</summary><pre>{JSON.stringify(profile,null,2)}</pre></details>}
            <details className="material-review-preview"><summary><FileText size={15}/> Preview learning material</summary><pre>{markdownFor(item)}</pre></details>
            <div className="material-review-sources"><strong>Research sources</strong>{sources.length ? sources.map((source,index)=><a key={source.url || index} href={source.url} target="_blank" rel="noreferrer">{source.title || source.publisher || source.url || "Source"} <ExternalLink size={12}/></a>) : <span>No source references supplied. Verify the material's accuracy before approving.</span>}</div>
            <div className="material-review-footer"><span>Prepared {when(item.created_at)} · Learner {item.learner_id.slice(0,8)}…</span>
              {item.status === "pending" && <div className="material-review-actions">
                <button type="button" className="secondary-button" disabled={busyId === item.id || !!busyId} onClick={() => void reject(item)}><XCircle size={15}/> Reject</button>
                <button type="button" className="primary-button" disabled={busyId === item.id || !!busyId} onClick={() => void approve(item)}><CheckCircle2 size={15}/>{busyId === item.id ? "Publishing…" : "Approve & publish"}</button>
              </div>}
              {item.status !== "pending" && item.review_notes && <span>Review note: {item.review_notes}</span>}
            </div>
          </article>;
        })}</div> : <div className="classroom-empty"><BookOpen size={25}/><strong>No {filter} materials</strong><span>New AI-prepared learning resources will appear here after they are submitted for review.</span></div>}
      <div className="setting-row"><div><strong>Refresh queue</strong><span>Reload the latest generated learning materials.</span></div><button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || !!busyId}><RefreshCw size={15}/> Refresh</button></div>
    </div>
  </div>;
}
