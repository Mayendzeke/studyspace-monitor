import { useEffect, useMemo, useState } from "react";
import { FileText, Library } from "lucide-react";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string; full_name: string; preferred_name: string; country: string; institution: string;
  institution_type: string; education_level: string; grade: string; curriculum: string;
  course: string; academic_year: string; qualification_level: string;
};
type Subject = { learner_id: string; name: string };

export default function MissingMaterialsGenerator() {
  const [profiles,setProfiles] = useState<Profile[]>([]);
  const [subjects,setSubjects] = useState<Subject[]>([]);
  const [learnerId,setLearnerId] = useState("");
  const [subject,setSubject] = useState("");
  const [topic,setTopic] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) { setError("StudySpace is not connected."); setLoading(false); return; }
      const [profileResult,subjectResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,preferred_name,country,institution,institution_type,education_level,grade,curriculum,course,academic_year,qualification_level").eq("role","learner").eq("account_status","active").order("preferred_name"),
        supabase.from("student_subjects").select("learner_id,name").order("name"),
      ]);
      if (!alive) return;
      if (profileResult.error || subjectResult.error) setError("Learner academic profiles or registered subjects could not be loaded.");
      else {
        const rows = (profileResult.data || []) as Profile[];
        setProfiles(rows);
        setSubjects((subjectResult.data || []) as Subject[]);
        setLearnerId(rows[0]?.id || "");
      }
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, []);

  const learnerSubjects = useMemo(() => subjects.filter(item => item.learner_id === learnerId),[subjects,learnerId]);
  const profile = profiles.find(item => item.id === learnerId);
  useEffect(() => {
    if (!learnerSubjects.some(item => item.name === subject)) setSubject(learnerSubjects[0]?.name || "");
  },[learnerSubjects,subject]);

  async function prepare() {
    if (!supabase || !learnerId || !subject || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const {data,error:invokeError} = await supabase.functions.invoke("mia-monitor-assistant",{
        body:{action:"prepare_material",learnerId,subjectName:subject,topic:topic.trim()},
      });
      if (invokeError) {
        const context = (invokeError as {context?:Response}).context;
        if (context instanceof Response) {
          try { const body = await context.clone().json(); throw new Error(body.error || body.message || "Material preparation failed."); }
          catch (reason) { if (reason instanceof Error && reason.message !== "Unexpected end of JSON input") throw reason; }
        }
        throw invokeError;
      }
      if (!data?.success) throw new Error(data?.error || "Material preparation failed.");
      setNotice(String(data.message || "Material submitted for review."));
      setTopic("");
    } catch(reason) {
      setError(reason instanceof Error ? reason.message : "Material preparation failed.");
    } finally { setBusy(false); }
  }

  return <section className="mia-material-preparation">
    <div className="mia-material-preparation-heading"><span><Library size={18}/></span><div><strong>Prepare missing learner materials</strong><small>MIΛ checks existing resources first, uses the learner's academic profile and submits new material for approval. Nothing is published automatically.</small></div></div>
    {loading ? <p>Loading learner profiles…</p> : <>
      <div className="mia-material-preparation-fields">
        <label>Student profile<select value={learnerId} onChange={event=>setLearnerId(event.target.value)} disabled={busy}>
          <option value="">Choose a learner</option>
          {profiles.map(item=><option key={item.id} value={item.id}>{item.preferred_name || item.full_name || "Learner"} · {[item.country,item.education_level,item.grade,item.course].filter(Boolean).join(" / ")}</option>)}
        </select></label>
        <label>Registered subject<select value={subject} onChange={event=>setSubject(event.target.value)} disabled={busy || !learnerSubjects.length}>
          <option value="">Choose a registered subject</option>{learnerSubjects.map((item,index)=><option key={item.learner_id+"-"+index} value={item.name}>{item.name}</option>)}
        </select></label>
        <label>Topic (optional)<input value={topic} onChange={event=>setTopic(event.target.value)} maxLength={180} placeholder="Leave blank for curriculum-guided selection" disabled={busy}/></label>
        <button type="button" className="primary-button" onClick={()=>void prepare()} disabled={busy || !learnerId || !subject}><FileText size={15}/>{busy?"Preparing…":"Prepare for review"}</button>
      </div>
      {profile && <p className="mia-material-profile-context">Academic context: {[profile.country,profile.institution,profile.institution_type,profile.education_level,profile.grade,profile.course,profile.curriculum,profile.academic_year,profile.qualification_level].filter(Boolean).join(" · ")}</p>}
    </>}
    {notice && <p className="mia-material-success" role="status">{notice} Open Learning materials in Monitor to review it.</p>}
    {error && <p className="mia-error" role="alert">{error}</p>}
  </section>;
}
