import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, Atom, BookOpen, CheckCircle2, ClipboardCheck, FileCheck2, FlaskConical,
  Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Users, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Area = "maths" | "physics" | "chemistry" | "biology";
type LabWork = {
  learner_id: string; lab_area: Area; activity_key: string; title: string;
  live_state: Record<string,any>; result: Record<string,any>; status: string;
  last_accessed_at: string; updated_at: string; reviewed_at?: string|null;
  reviewed_by?: string|null; score?: number|null; feedback?: string;
};
type Learner = {id:string;full_name:string;preferred_name:string;account_status:string;role:string};
type Assignment = {id:string;learner_id:string;lab_area:Area;activity_key:string;title:string;instructions:string;due_at:string|null;required:boolean;status:string;created_at:string};
type DocumentWork = {learner_id:string;resource_key:string;document_name:string;page_count:number;annotations:any[];form_values:Record<string,string>;submitted:boolean;submitted_at:string|null;updated_at:string};
type Control = {lab_area:Area;enabled:boolean;student_message:string};
type Tab = "Overview"|"Live work"|"Assignments"|"Submissions"|"Controls";
const areas: {key:Area;label:string;icon:typeof FlaskConical;color:string}[]=[
  {key:"maths",label:"Mathematics",icon:Activity,color:"#7164d8"},
  {key:"physics",label:"Physics",icon:Atom,color:"#3f87be"},
  {key:"chemistry",label:"Chemistry",icon:FlaskConical,color:"#269777"},
  {key:"biology",label:"Biology",icon:BookOpen,color:"#b17a39"},
];
const defaultControls:Control[]=areas.map(item=>({lab_area:item.key,enabled:true,student_message:""}));
const displayName=(learner?:Learner)=>learner?.preferred_name||learner?.full_name||"Student";
const when=(value?:string|null)=>value?new Date(value).toLocaleString():"—";

export default function LabsManagementPage(){
  const [tab,setTab]=useState<Tab>("Overview");
  const [learners,setLearners]=useState<Learner[]>([]);
  const [work,setWork]=useState<LabWork[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [documents,setDocuments]=useState<DocumentWork[]>([]);
  const [controls,setControls]=useState<Control[]>(defaultControls);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [search,setSearch]=useState("");
  const [areaFilter,setAreaFilter]=useState<"all"|Area>("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [assignOpen,setAssignOpen]=useState(false);
  const [learnerId,setLearnerId]=useState("");
  const [assignArea,setAssignArea]=useState<Area>("physics");
  const [assignTitle,setAssignTitle]=useState("");
  const [assignInstructions,setAssignInstructions]=useState("");
  const [assignDue,setAssignDue]=useState("");
  const [assignRequired,setAssignRequired]=useState(true);
  const [savingAssignment,setSavingAssignment]=useState(false);
  const [reviewing,setReviewing]=useState<LabWork|null>(null);
  const [reviewScore,setReviewScore]=useState("");
  const [reviewFeedback,setReviewFeedback]=useState("");
  const [savingReview,setSavingReview]=useState(false);
  const [savingControl,setSavingControl]=useState("");

  const learnerById=useMemo(()=>new Map(learners.map(item=>[item.id,item])),[learners]);
  const workLearners=useMemo(()=>new Set(work.map(item=>item.learner_id)).size,[work]);
  const pendingWork=useMemo(()=>work.filter(item=>item.status==="submitted"&&!item.reviewed_at).length,[work]);
  const recentActive=useMemo(()=>work.filter(item=>Date.now()-Date.parse(item.last_accessed_at||item.updated_at)<15*60*1000&&item.status==="in_progress").length,[work]);
  const submittedDocs=useMemo(()=>documents.filter(item=>item.submitted).length,[documents]);

  const refresh=useCallback(async()=>{
    if(!supabase){setError("StudySpace database is not connected.");setLoading(false);return;}
    setRefreshing(true);setError("");
    try{
      const [learnerResult,workResult,assignmentResult,documentResult,controlResult]=await Promise.all([
        supabase.from("profiles").select("id,full_name,preferred_name,account_status,role").eq("role","learner").order("created_at",{ascending:false}).limit(1000),
        supabase.from("student_lab_work").select("*").order("updated_at",{ascending:false}).limit(500),
        supabase.from("lab_assignments").select("*").order("created_at",{ascending:false}).limit(500),
        supabase.from("student_document_work").select("*").eq("submitted",true).order("submitted_at",{ascending:false}).limit(300),
        supabase.from("lab_controls").select("lab_area,enabled,student_message"),
      ]);
      const firstError=learnerResult.error||workResult.error||assignmentResult.error||documentResult.error||controlResult.error;
      if(firstError) throw firstError;
      setLearners((learnerResult.data||[]) as Learner[]);
      setWork((workResult.data||[]) as LabWork[]);
      setAssignments((assignmentResult.data||[]) as Assignment[]);
      setDocuments((documentResult.data||[]) as DocumentWork[]);
      const incoming=(controlResult.data||[]) as Control[];
      setControls(defaultControls.map(item=>incoming.find(row=>row.lab_area===item.lab_area)||item));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"The Labs dashboard could not load. Check the database migration and administrator access.");
    }finally{setLoading(false);setRefreshing(false);}
  },[]);

  useEffect(()=>{
    void refresh();
    if(!supabase)return;
    const channel=supabase.channel("studyspace-monitor-labs")
      .on("postgres_changes",{event:"*",schema:"public",table:"student_lab_work"},()=>void refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"lab_assignments"},()=>void refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"student_document_work"},()=>void refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"lab_controls"},()=>void refresh())
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[refresh]);

  const filteredWork=useMemo(()=>{
    const needle=search.trim().toLowerCase();
    return work.filter(item=>{
      const learner=learnerById.get(item.learner_id);
      const matchesSearch=!needle||[displayName(learner),learner?.full_name||"",item.title,item.activity_key].some(value=>value.toLowerCase().includes(needle));
      return matchesSearch&&(areaFilter==="all"||item.lab_area===areaFilter)&&(statusFilter==="all"||item.status===statusFilter);
    });
  },[work,learnerById,search,areaFilter,statusFilter]);

  async function createAssignment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!learnerId||!assignTitle.trim()||savingAssignment)return;
    setSavingAssignment(true);setError("");setNotice("");
    try{
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(authError||!auth.user)throw new Error("Sign in again before assigning a practical.");
      const {error:insertError}=await supabase.from("lab_assignments").insert({
        learner_id:learnerId,lab_area:assignArea,activity_key:assignArea==="maths"?"maths-workspace":"science-workspace",
        title:assignTitle.trim(),instructions:assignInstructions.trim(),
        due_at:assignDue?new Date(assignDue).toISOString():null,required:assignRequired,
        status:"assigned",assigned_by:auth.user.id,
      });
      if(insertError)throw insertError;
      setNotice("Lab practical assigned. It will appear in the student's relevant lab.");
      setAssignOpen(false);setAssignTitle("");setAssignInstructions("");setAssignDue("");
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"The practical could not be assigned.");}
    finally{setSavingAssignment(false);}
  }

  async function cancelAssignment(item:Assignment){
    if(!supabase)return;
    const {error:updateError}=await supabase.from("lab_assignments").update({status:"cancelled"}).eq("id",item.id);
    if(updateError)setError(updateError.message);else{setNotice("Assignment cancelled.");await refresh();}
  }

  async function saveReview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!reviewing||savingReview)return;
    const score=reviewScore.trim()===""?null:Number(reviewScore);
    if(score!==null&&(!Number.isFinite(score)||score<0||score>100)){setError("Enter a score between 0 and 100.");return;}
    setSavingReview(true);setError("");
    try{
      const {data:auth}=await supabase.auth.getUser();
      const {error:updateError}=await supabase.from("student_lab_work").update({
        score,feedback:reviewFeedback.trim(),reviewed_at:new Date().toISOString(),reviewed_by:auth.user?.id||null,
      }).eq("learner_id",reviewing.learner_id).eq("lab_area",reviewing.lab_area).eq("activity_key",reviewing.activity_key);
      if(updateError)throw updateError;
      setNotice("Feedback saved to the student's lab notebook.");
      setReviewing(null);setReviewScore("");setReviewFeedback("");
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"Feedback could not be saved.");}
    finally{setSavingReview(false);}
  }

  async function saveControl(control:Control){
    if(!supabase)return;
    setSavingControl(control.lab_area);setError("");setNotice("");
    const {error:saveError}=await supabase.from("lab_controls").upsert(control,{onConflict:"lab_area"});
    if(saveError)setError(saveError.message);else{setNotice(areaLabel(control.lab_area)+" settings saved. Student access updates live.");await refresh();}
    setSavingControl("");
  }
  function areaLabel(area:Area){return areas.find(item=>item.key===area)?.label||area;}

  return <section className="monitor-labs-page">
    <header className="monitor-labs-hero">
      <div className="monitor-labs-hero-icon"><FlaskConical size={27}/></div>
      <div className="monitor-labs-hero-copy"><span className="eyebrow">STUDYSPACE LEARNING SYSTEMS</span><h1>Labs Command Centre</h1><p>Oversee practicals, live learner activity, submitted investigations and lab availability from one workspace.</p></div>
      <button type="button" className="primary-button" onClick={()=>{setAssignOpen(true);setTab("Assignments");}}><Plus size={16}/> Assign practical</button>
    </header>

    <nav className="monitor-labs-tabs" aria-label="Labs sections">
      {(["Overview","Live work","Assignments","Submissions","Controls"] as Tab[]).map(item=><button type="button" key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item==="Overview"?<Activity size={15}/>:item==="Live work"?<Users size={15}/>:item==="Assignments"?<ClipboardCheck size={15}/>:item==="Submissions"?<FileCheck2 size={15}/>:<SlidersHorizontal size={15}/>}<span>{item}</span></button>)}
    </nav>

    {error&&<div className="monitor-labs-alert is-error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    {notice&&<div className="monitor-labs-alert" role="status"><CheckCircle2 size={16}/>{notice}<button type="button" onClick={()=>setNotice("")} aria-label="Dismiss notice"><X size={14}/></button></div>}

    {tab==="Overview"&&<>
      <div className="monitor-labs-stat-grid">
        <article><span>Students with lab activity</span><strong>{loading?"—":workLearners}</strong><small><Users size={13}/> learners represented</small></article>
        <article><span>Active in the last 15 minutes</span><strong>{loading?"—":recentActive}</strong><small><Activity size={13}/> live work sessions</small></article>
        <article><span>Waiting for review</span><strong>{loading?"—":pendingWork}</strong><small><ClipboardCheck size={13}/> submitted investigations</small></article>
        <article><span>Document submissions</span><strong>{loading?"—":submittedDocs}</strong><small><FileCheck2 size={13}/> completed papers shared with you</small></article>
      </div>
      <div className="monitor-labs-area-grid">{areas.map(item=>{const Icon=item.icon;const areaWork=work.filter(row=>row.lab_area===item.key);const control=controls.find(row=>row.lab_area===item.key);return <article key={item.key} className="monitor-labs-area-card"><div className="monitor-labs-area-top"><span style={{color:item.color}}><Icon size={20}/></span><em className={control?.enabled===false?"is-paused":"is-enabled"}>{control?.enabled===false?"Paused":"Available"}</em></div><h3>{item.label} Lab</h3><strong>{areaWork.length} work record(s)</strong><p>{areaWork.filter(row=>row.status==="submitted"&&!row.reviewed_at).length} awaiting teacher review</p><button type="button" onClick={()=>{setAreaFilter(item.key);setTab("Live work");}}>Open activity <span>→</span></button></article>})}</div>
      <section className="monitor-labs-panel"><div className="monitor-labs-panel-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest learner work</h2></div><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={refreshing}><RefreshCw size={14}/> Refresh</button></div><WorkTable rows={work.slice(0,8)} learnerById={learnerById} onReview={row=>{setReviewing(row);setReviewScore(row.score==null?"":String(row.score));setReviewFeedback(row.feedback||"");}}/></section>
    </>}

    {tab==="Live work"&&<section className="monitor-labs-panel"><div className="monitor-labs-panel-head"><div><span className="eyebrow">REAL-TIME OVERSIGHT</span><h2>Student lab notebooks</h2><p>Work state and results sync from the student app.</p></div><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={refreshing}><RefreshCw size={14}/> Refresh</button></div>
      <div className="monitor-labs-filters"><label><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search students or activities…"/></label><select value={areaFilter} onChange={event=>setAreaFilter(event.target.value as "all"|Area)}><option value="all">All lab areas</option>{areas.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="submitted">Submitted</option></select></div>
      <WorkTable rows={filteredWork} learnerById={learnerById} onReview={row=>{setReviewing(row);setReviewScore(row.score==null?"":String(row.score));setReviewFeedback(row.feedback||"");}}/>
      {!loading&&!filteredWork.length&&<div className="monitor-labs-empty"><Activity size={22}/><strong>No lab records match these filters.</strong><p>Student activity will appear here as learners use the Maths and Science Labs.</p></div>}
    </section>}

    {tab==="Assignments"&&<section className="monitor-labs-panel"><div className="monitor-labs-panel-head"><div><span className="eyebrow">TEACHER WORKFLOW</span><h2>Assigned practicals</h2><p>Assign a task to an individual learner and track the submitted work from Live work.</p></div><button type="button" className="primary-button" onClick={()=>setAssignOpen(value=>!value)}><Plus size={15}/> New practical</button></div>
      {assignOpen&&<form className="monitor-labs-assignment-form" onSubmit={createAssignment}><label>Student<select required value={learnerId} onChange={event=>setLearnerId(event.target.value)}><option value="">Choose a learner</option>{learners.filter(item=>item.account_status==="active").map(item=><option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label><label>Lab area<select value={assignArea} onChange={event=>setAssignArea(event.target.value as Area)}>{areas.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="wide">Practical title<input required maxLength={140} value={assignTitle} onChange={event=>setAssignTitle(event.target.value)} placeholder="e.g. Investigate the relationship between voltage and current"/></label><label className="wide">Instructions<textarea rows={3} maxLength={2000} value={assignInstructions} onChange={event=>setAssignInstructions(event.target.value)} placeholder="Describe the question, expected evidence and success criteria…"/></label><label>Due date<input type="datetime-local" value={assignDue} onChange={event=>setAssignDue(event.target.value)}/></label><label className="monitor-labs-check"><input type="checkbox" checked={assignRequired} onChange={event=>setAssignRequired(event.target.checked)}/> Required practical</label><div className="monitor-labs-form-actions"><button type="button" className="secondary-button" onClick={()=>setAssignOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={savingAssignment}>{savingAssignment?"Assigning…":"Assign practical"}</button></div></form>}
      <div className="monitor-labs-assignment-list">{assignments.filter(item=>item.status!=="cancelled").map(item=><article key={item.id}><div><span className="eyebrow">{areaLabel(item.lab_area)} · {item.required?"REQUIRED":"PRACTICE"}</span><h3>{item.title}</h3><p>{item.instructions||"No extra instructions."}</p><small>{displayName(learnerById.get(item.learner_id))} · Due {when(item.due_at)} · Assigned {when(item.created_at)}</small></div><button type="button" className="text-button" onClick={()=>void cancelAssignment(item)}>Cancel</button></article>)}{!assignments.filter(item=>item.status!=="cancelled").length&&<div className="monitor-labs-empty"><ClipboardCheck size={21}/><strong>No practicals assigned yet.</strong><p>Use New practical to assign the first activity.</p></div>}</div>
    </section>}

    {tab==="Submissions"&&<section className="monitor-labs-panel"><div className="monitor-labs-panel-head"><div><span className="eyebrow">LEARNER-SHARED WORK</span><h2>Document submissions</h2><p>Only papers students have explicitly submitted are visible here. Personal drafts remain private.</p></div></div>
      <div className="monitor-labs-document-list">{documents.map(item=><article key={item.learner_id+item.resource_key}><div className="monitor-labs-document-icon"><FileCheck2 size={18}/></div><div className="monitor-labs-document-copy"><strong>{item.document_name||"Completed document"}</strong><span>{displayName(learnerById.get(item.learner_id))} · {item.page_count} page(s) · {item.annotations?.length||0} annotation(s) · {Object.keys(item.form_values||{}).length} filled field(s)</span><small>Submitted {when(item.submitted_at||item.updated_at)}</small></div><em>Submitted</em></article>)}{!documents.length&&<div className="monitor-labs-empty"><FileCheck2 size={22}/><strong>No papers submitted yet.</strong><p>Student PDF work appears here only after a learner presses Submit paper to teacher.</p></div>}</div>
    </section>}

    {tab==="Controls"&&<section className="monitor-labs-panel"><div className="monitor-labs-panel-head"><div><span className="eyebrow">PLATFORM CONTROLS</span><h2>Lab availability</h2><p>Pause a subject while maintaining its saved student work and records.</p></div></div>
      <div className="monitor-labs-control-list">{controls.map(control=>{const item=areas.find(area=>area.key===control.lab_area)!;const Icon=item.icon;return <article key={control.lab_area}><div className="monitor-labs-control-icon"><Icon size={19}/></div><div className="monitor-labs-control-copy"><strong>{item.label} Lab</strong><span>{control.enabled?"Available to active students":"Paused for students"}</span><input value={control.student_message} maxLength={240} onChange={event=>setControls(current=>current.map(row=>row.lab_area===control.lab_area?{...row,student_message:event.target.value}:row))} placeholder="Optional student message shown while paused"/></div><label className="monitor-labs-toggle"><input type="checkbox" checked={control.enabled} onChange={event=>setControls(current=>current.map(row=>row.lab_area===control.lab_area?{...row,enabled:event.target.checked}:row))}/><span>{control.enabled?"On":"Paused"}</span></label><button type="button" className="secondary-button" onClick={()=>void saveControl(control)} disabled={savingControl===control.lab_area}>{savingControl===control.lab_area?"Saving…":"Save"}</button></article>})}</div>
    </section>}

    {reviewing&&<div className="monitor-labs-review-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setReviewing(null);}}><form className="monitor-labs-review-dialog" onSubmit={saveReview}><div className="monitor-labs-review-head"><div><span className="eyebrow">TEACHER REVIEW</span><h2>{displayName(learnerById.get(reviewing.learner_id))}</h2><p>{areaLabel(reviewing.lab_area)} · {reviewing.title}</p></div><button type="button" className="icon-button" onClick={()=>setReviewing(null)} aria-label="Close review"><X size={18}/></button></div><div className="monitor-labs-result-preview"><strong>Saved result</strong><pre>{JSON.stringify(reviewing.result||{},null,2)}</pre></div><label>Score (%)<input type="number" min="0" max="100" step="0.5" value={reviewScore} onChange={event=>setReviewScore(event.target.value)} placeholder="Optional"/></label><label>Feedback<textarea rows={4} maxLength={2500} value={reviewFeedback} onChange={event=>setReviewFeedback(event.target.value)} placeholder="Give clear feedback and next steps…"/></label><div className="monitor-labs-form-actions"><button type="button" className="secondary-button" onClick={()=>setReviewing(null)}>Cancel</button><button type="submit" className="primary-button" disabled={savingReview}>{savingReview?"Saving…":"Save feedback"}</button></div></form></div>}
  </section>;
}

function WorkTable({rows,learnerById,onReview}:{rows:LabWork[];learnerById:Map<string,Learner>;onReview:(row:LabWork)=>void}){
  const areaName=(area:Area)=>areas.find(item=>item.key===area)?.label||area;
  return <div className="monitor-labs-table-wrap"><table className="monitor-labs-table"><thead><tr><th>Student</th><th>Lab</th><th>Activity</th><th>Status</th><th>Last active</th><th>Review</th></tr></thead><tbody>{rows.map(row=><tr key={row.learner_id+row.lab_area+row.activity_key}><td><strong>{displayName(learnerById.get(row.learner_id))}</strong></td><td>{areaName(row.lab_area)}</td><td>{row.title||row.activity_key}</td><td><span className={"monitor-labs-status status-"+row.status}>{row.status.replace("_"," ")}</span></td><td>{when(row.last_accessed_at||row.updated_at)}</td><td><button type="button" className="monitor-labs-review-button" onClick={()=>onReview(row)}>{row.reviewed_at?"Edit feedback":"Review"}</button></td></tr>)}</tbody></table></div>;
}
