import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, ExternalLink, FileText, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type ReviewItem={
  id:string;learner_id:string;title:string;summary:string;subject_name:string;topic:string;material_type:string;
  content:Record<string,any>;country:string;institution:string;education_level:string;grade:string;course:string;
  curriculum:string;academic_year:string;language:string;source_references:any[];profile_snapshot:Record<string,any>;
  generator:string;status:string;review_notes:string;created_at:string;published_resource_id:string|null;
};
type Learner={id:string;student_id:string|null;full_name:string|null;preferred_name:string|null};
const formatDate=(value:string)=>new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});
const slug=(value:string)=>value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"study-guide";
const list=(value:unknown)=>Array.isArray(value)?value:[];
function toMarkdown(item:ReviewItem):string {
  const c=item.content||{};
  const lines:string[]=[
    "# "+String(c.title||item.title),
    "",
    "**Subject:** "+item.subject_name,
    "**Topic:** "+(item.topic||"Complete subject guide"),
    "**Level:** "+[item.education_level,item.grade,item.course].filter(Boolean).join(" · "),
    "**Curriculum:** "+[item.country,item.curriculum,item.academic_year].filter(Boolean).join(" · "),
    "",
    "## Overview",
    String(c.summary||item.summary||""),
    "",
    "## Learning objectives",
    ...list(c.learning_objectives).map((value:any)=>"- "+String(value)),
    "",
    "## Topic map",
  ];
  for(const topic of list(c.topic_map))lines.push("### "+String(topic.topic||"Topic"),String(topic.description||""),topic.prerequisites?.length?"Prerequisites: "+topic.prerequisites.join(", "):"",topic.estimated_minutes?"Estimated study time: "+topic.estimated_minutes+" minutes":"");
  lines.push("","## Key terms");
  for(const term of list(c.key_terms))lines.push("**"+String(term.term||"")+"** — "+String(term.definition||""));
  lines.push("","## Study notes");
  for(const section of list(c.concept_sections))lines.push("### "+String(section.heading||"Concept"),String(section.explanation||""),section.example?"Example: "+section.example:"",section.source_location?"Source: "+section.source_location:"");
  lines.push("","## Worked examples");
  for(const example of list(c.worked_examples))lines.push("### "+String(example.title||"Example"),String(example.problem||""),...list(example.steps).map((step:any,index:number)=>(index+1)+". "+String(step)),"**Answer:** "+String(example.answer||""));
  lines.push("","## Common mistakes");
  for(const mistake of list(c.common_mistakes))lines.push("- **"+String(mistake.mistake||"")+"** — "+String(mistake.correction||""));
  lines.push("","## Flashcards");
  for(const card of list(c.flashcards))lines.push("**Q:** "+String(card.question||""),"**A:** "+String(card.answer||""),card.visual_description?"Visual aid: "+card.visual_description:"");
  lines.push("","## Practice questions");
  for(const question of list(c.practice_questions))lines.push("### "+String(question.type||"Question"),String(question.prompt||""),...list(question.options).map((option:any,index:number)=>String.fromCharCode(65+index)+". "+String(option)),"**Answer:** "+String(question.correct_answer||""),"**Explanation:** "+String(question.explanation||""));
  lines.push("","## Visual aids");
  for(const visual of list(c.visual_aids))lines.push("### "+String(visual.title||visual.type||"Diagram"),String(visual.description||""),...list(visual.steps).map((step:any,index:number)=>(index+1)+". "+String(step)),...list(visual.labels).map((label:any)=>"- "+String(label)));
  lines.push("","## Revision checklist",...list(c.revision_checklist).map((value:any)=>"- [ ] "+String(value)));
  lines.push("","## Source references");
  for(const source of item.source_references||[])lines.push("- ["+String(source.title||source.organization||"Source")+"]("+String(source.url||"")+") — "+String(source.organization||"")+" ("+String(source.source_type||"reference")+")");
  return lines.filter(value=>value!==undefined).join("\n").trim()+"\n";
}

export default function LearningMaterialReviewQueue(){
  const [items,setItems]=useState<ReviewItem[]>([]);
  const [learners,setLearners]=useState<Record<string,Learner>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const refresh=useCallback(async()=>{
    if(!supabase){setError("StudySpace is not connected.");setLoading(false);return;}
    setLoading(true);setError("");
    try{
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(authError||!auth.user)throw new Error("Sign in again to review curriculum materials.");
      const {data,error:queueError}=await supabase.from("learning_material_review_queue").select("*")
        .eq("status","pending").order("created_at",{ascending:false}).limit(100);
      if(queueError)throw queueError;
      const rows=(queue||[]) as ReviewItem[];
      const ids=[...new Set(rows.map(row=>row.learner_id).filter(Boolean))];
      const {data:profiles,error:profileError}=ids.length
        ?await supabase.from("profiles").select("id,student_id,full_name,preferred_name").in("id",ids)
        :{data:[],error:null};
      if(profileError)throw profileError;
      setLearners(Object.fromEntries((profiles||[]).map((row:any)=>[row.id,row as Learner])));
      setItems(rows);
    }catch(reason){setError(reason instanceof Error?reason.message:"Curriculum review items could not be loaded.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void refresh();},[refresh]);

  const visible=useMemo(()=>{
    const term=search.trim().toLowerCase();
    if(!term)return items;
    return items.filter(item=>[item.title,item.subject_name,item.topic,item.country,item.curriculum,learners[item.learner_id]?.student_id,learners[item.learner_id]?.preferred_name,learners[item.learner_id]?.full_name].some(value=>String(value||"").toLowerCase().includes(term)));
  },[items,learners,search]);

  const review=async(item:ReviewItem,decision:"approved"|"rejected")=>{
    if(!supabase||busyId)return;
    setBusyId(item.id);setError("");setNotice("");
    let storagePath="";
    let resourceId="";
    let resourceSaved=false;
    try{
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(authError||!auth.user)throw new Error("Sign in again before reviewing this material.");
      const reviewNotes=String(notes[item.id]||"").trim();
      if(decision==="rejected"){
        const {error:updateError}=await supabase.from("learning_material_review_queue").update({
          status:"rejected",reviewed_by:auth.user.id,reviewed_at:new Date().toISOString(),review_notes:reviewNotes||"Rejected by Monitor review.",
        }).eq("id",item.id).eq("status","pending");
        if(updateError)throw updateError;
        setNotice("The generated material was rejected and will not be assigned to the learner.");
      }else{
        const markdown=toMarkdown(item);
        const blob=new Blob([markdown],{type:"text/markdown;charset=utf-8"});
        resourceId=crypto.randomUUID();
        storagePath=item.learner_id+"/curriculum-guides/"+item.id+"-"+slug(item.title)+".md";
        const {error:uploadError}=await supabase.storage.from("studyspace-resources").upload(storagePath,blob,{contentType:"text/markdown",upsert:true});
        if(uploadError)throw new Error("The approved study guide could not be saved: "+uploadError.message);
        const {error:resourceError}=await supabase.from("learning_resources").insert({
          id:resourceId,created_by:auth.user.id,title:item.title,description:item.summary,subject_name:item.subject_name,
          topic:item.topic||"",resource_type:"Notes",education_level:item.education_level||"",curriculum:item.curriculum||"",
          storage_path:storagePath,mime_type:"text/markdown",file_size:blob.size,
        });
        if(resourceError)throw new Error("The study guide file was saved, but its resource record failed: "+resourceError.message);
        resourceSaved=true;
        const {error:assignmentError}=await supabase.from("resource_assignments").upsert({
          resource_id:resourceId,learner_id:item.learner_id,assigned_by:auth.user.id,
        },{onConflict:"resource_id,learner_id"});
        if(assignmentError)throw new Error("The study guide was saved, but learner assignment failed: "+assignmentError.message);
        const {error:updateError}=await supabase.from("learning_material_review_queue").update({
          status:"approved",reviewed_by:auth.user.id,reviewed_at:new Date().toISOString(),
          review_notes:reviewNotes,published_resource_id:resourceId,
        }).eq("id",item.id).eq("status","pending");
        if(updateError)throw new Error("The study guide was assigned, but the review record could not be updated: "+updateError.message);
        setNotice("The curriculum study guide was approved and added to the learner's Student Library.");
      }
      await refresh();
    }catch(reason){
      if(storagePath&&!resourceSaved)await supabase.storage.from("studyspace-resources").remove([storagePath]);
      if(resourceId&&resourceSaved){
        await supabase.from("resource_assignments").delete().eq("resource_id",resourceId).eq("learner_id",item.learner_id);
        await supabase.from("learning_resources").delete().eq("id",resourceId);
        if(storagePath)await supabase.storage.from("studyspace-resources").remove([storagePath]);
      }
      setError(reason instanceof Error?reason.message:"The review action could not be completed.");
    }finally{setBusyId("");}
  };

  return <section className="monitor-material-review">
    <header className="monitor-material-review-head">
      <div><span className="monitor-kicker">ACADEMIC QUALITY CONTROL</span><h1>AI material review</h1><p>Review curriculum research and study guides before they are published to a learner's Student Library.</p></div>
      <button className="secondary-button" type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </header>
    {error&&<div className="monitor-alert error"><AlertCircle size={16}/>{error}</div>}
    {notice&&<div className="monitor-alert success"><CheckCircle2 size={16}/>{notice}</div>}
    <div className="monitor-material-review-toolbar"><label><SearchIcon/> <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search subject, learner, curriculum or title"/></label><span>{items.length} awaiting review</span></div>
    {loading?<div className="monitor-review-empty"><LoaderCircle className="spin" size={24}/> Loading review queue…</div>:!visible.length?<div className="monitor-review-empty"><ShieldCheck size={30}/><strong>No curriculum materials are awaiting review</strong><p>When a learner has no readable study resources, Study Space can prepare a curriculum guide here for your approval.</p></div>:<div className="monitor-material-review-list">{visible.map(item=>{
      const learner=learners[item.learner_id];
      const sources=item.source_references||[];
      const c=item.content||{};
      return <article className="monitor-material-review-card" key={item.id}>
        <div className="monitor-material-review-card-head"><div><span className="monitor-kicker">{item.subject_name} · {item.material_type.replace(/_/g," ")}</span><h2>{item.title}</h2><p>{item.summary}</p></div><span className="monitor-pending-pill">Pending review</span></div>
        <div className="monitor-material-review-meta">
          <span><strong>Learner</strong>{learner?.preferred_name||learner?.full_name||"Learner"} {learner?.student_id?"· "+learner.student_id:""}</span>
          <span><strong>Academic profile</strong>{[item.country,item.education_level,item.grade,item.course,item.curriculum,item.academic_year].filter(Boolean).join(" · ")||"Profile details unavailable"}</span>
          <span><strong>Requested</strong>{formatDate(item.created_at)}</span>
          <span><strong>Research sources</strong>{sources.length?sources.length+" source links":"No verified source links — manual verification required"}</span>
        </div>
        {item.review_notes&&<div className="monitor-material-review-warning"><AlertCircle size={15}/>{item.review_notes}</div>}
        <details className="monitor-material-review-preview"><summary><BookOpen size={15}/> Preview learning material</summary>
          <h3>Learning objectives</h3><ul>{list(c.learning_objectives).map((value:any,index:number)=><li key={index}>{String(value)}</li>)}</ul>
          <h3>Topic map</h3><div className="monitor-material-topic-grid">{list(c.topic_map).map((topic:any,index:number)=><div key={index}><strong>{topic.topic}</strong><p>{topic.description}</p><small>{topic.estimated_minutes?topic.estimated_minutes+" minutes":""}</small></div>)}</div>
          <h3>Key terms</h3><dl>{list(c.key_terms).map((term:any,index:number)=><div key={index}><dt>{term.term}</dt><dd>{term.definition}</dd></div>)}</dl>
          <h3>Concept sections</h3>{list(c.concept_sections).map((section:any,index:number)=><section className="monitor-material-concept" key={index}><strong>{section.heading}</strong><p>{section.explanation}</p>{section.example&&<blockquote>{section.example}</blockquote>}</section>)}
          <h3>Practice questions</h3>{list(c.practice_questions).map((question:any,index:number)=><div className="monitor-material-question" key={index}><strong>{index+1}. {question.prompt}</strong><p>Answer: {question.correct_answer}</p><small>{question.explanation}</small></div>)}
          <h3>Sources</h3>{sources.length?<ul>{sources.map((source:any,index:number)=><li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title||source.organization||source.url}<ExternalLink size={12}/></a> <small>{source.organization}</small></li>)}</ul>:<p>No external sources were attached. Verify the syllabus and references manually before approval.</p>}
        </details>
        <label className="monitor-material-review-notes">Review notes (optional)<textarea value={notes[item.id]||""} onChange={event=>setNotes(current=>({...current,[item.id]:event.target.value}))} placeholder="Record curriculum corrections, missing topics or approval notes…"/></label>
        <div className="monitor-material-review-actions"><button type="button" className="danger-button" onClick={()=>void review(item,"rejected")} disabled={Boolean(busyId)}><XCircle size={15}/> Reject</button><button type="button" className="primary-button" onClick={()=>void review(item,"approved")} disabled={Boolean(busyId)}>{busyId===item.id?<LoaderCircle className="spin" size={15}/>:<CheckCircle2 size={15}/>} Approve and assign</button></div>
      </article>;
    })}</div>}
  </section>;
}

function SearchIcon(){return <FileText size={15}/>}
