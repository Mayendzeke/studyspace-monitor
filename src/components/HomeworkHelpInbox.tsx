import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Image, MessageCircle, RefreshCw, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
type HelpRequest={id:string;learner_id:string;question_text:string;image_path:string|null;status:string;created_at:string;fallback_due_at:string;mia_response:string|null;teacher_response:string|null;last_fallback_error:string|null;learner_name?:string;image_url?:string};
const labels:Record<string,string>={waiting_for_teacher:"Waiting for teacher",mia_generating:"MIA preparing fallback",mia_replied:"MIA replied · teacher can follow up",teacher_replied:"Teacher replied",teacher_replied_after_mia:"Teacher follow-up sent",mia_failed:"MIA fallback needs attention"};
export default function HomeworkHelpInbox(){
 const [rows,setRows]=useState<HelpRequest[]>([]),[drafts,setDrafts]=useState<Record<string,string>>({}),[busy,setBusy]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setError("StudySpace cloud access is unavailable.");setLoading(false);return;}
  const {data,error:queryError}=await supabase.from("homework_help_requests").select("id,learner_id,question_text,image_path,status,created_at,fallback_due_at,mia_response,teacher_response,last_fallback_error").order("created_at",{ascending:false}).limit(40);
  if(queryError){setError("Homework inbox could not be loaded: "+queryError.message);setLoading(false);return;}
  const list=(data||[]) as HelpRequest[],ids=[...new Set(list.map(x=>x.learner_id))],names:Record<string,string>={};
  if(ids.length){const {data:profiles}=await supabase.from("profiles").select("id,preferred_name,full_name").in("id",ids);for(const p of profiles||[])names[p.id]=p.preferred_name||p.full_name||"Learner";}
  const next=await Promise.all(list.map(async row=>{let image_url:string|undefined;if(row.image_path){const {data:signed}=await supabase!.storage.from("studyspace-homework-help").createSignedUrl(row.image_path,600);image_url=signed?.signedUrl;}return {...row,learner_name:names[row.learner_id]||"Learner",image_url};}));
  setRows(next);setError("");setLoading(false);
 },[]);
 useEffect(()=>{void load();const t=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(t);},[load]);
 const reply=async(id:string)=>{if(!supabase||busy)return;const value=(drafts[id]||"").trim();if(value.length<2){setError("Write a response before sending.");return;}setBusy(id);setError("");try{const {data,error:invokeError}=await supabase.functions.invoke("reply-homework-help",{body:{requestId:id,reply:value}});if(invokeError)throw invokeError;if(!data?.success)throw new Error(data?.error||"The teacher reply was not saved.");setDrafts(current=>({...current,[id]:""}));await load();}catch(reason){setError(reason instanceof Error?reason.message:"The reply could not be sent.");}finally{setBusy("");}};
 return <section className="panel homework-inbox"><div className="panel-heading"><div><h2><MessageCircle size={18}/> School homework help inbox</h2><p>Teacher questions and photos. MIA fallback is triggered by the server-side timer after two minutes.</p></div><button className="icon-button" type="button" onClick={()=>void load()} aria-label="Refresh homework inbox"><RefreshCw size={16}/></button></div>
 {error&&<div className="homework-message error" role="alert">{error}</div>}
 {loading?<p className="homework-inbox-empty">Loading teacher inbox…</p>:rows.length===0?<p className="homework-inbox-empty">No school homework help requests have been received.</p>:rows.map(row=><article className="homework-inbox-card" key={row.id}>
  <div className="homework-inbox-meta"><strong>{row.learner_name}</strong><span>{labels[row.status]||row.status}</span><small>{new Date(row.created_at).toLocaleString()}</small></div>
  {row.question_text&&<p className="homework-inbox-question">{row.question_text}</p>}
  {row.image_url&&<a href={row.image_url} target="_blank" rel="noreferrer" className="homework-inbox-image"><Image size={14}/> Open learner's uploaded photo</a>}
  {row.last_fallback_error&&<p className="homework-message error">MIA fallback error: {row.last_fallback_error}</p>}
  {row.mia_response&&<div className="homework-response mia"><strong>MIA response</strong><p>{row.mia_response}</p></div>}
  {row.teacher_response&&<div className="homework-response teacher"><strong>Teacher response</strong><p>{row.teacher_response}</p></div>}
  {!row.teacher_response&&<div className="homework-reply-form"><textarea rows={3} value={drafts[row.id]||""} onChange={e=>setDrafts(current=>({...current,[row.id]:e.target.value}))} placeholder="Write a teacher explanation or guidance…"/><button className="primary-button" type="button" disabled={busy===row.id||!(drafts[row.id]||"").trim()} onClick={()=>void reply(row.id)}>{busy===row.id?"Sending…":"Reply to learner"} <Send size={14}/></button></div>}
  {row.teacher_response&&<small className="homework-inbox-sent"><CheckCircle2 size={13}/> Teacher response delivered</small>}
  {!row.mia_response&&!row.teacher_response&&<small className="homework-inbox-wait"><Clock3 size={13}/> MIA fallback eligible after {new Date(row.fallback_due_at).toLocaleTimeString()}</small>}
 </article>)}</section>;
}