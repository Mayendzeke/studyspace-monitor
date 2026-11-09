import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Plus, Minus, RefreshCw, Users, Pencil, Trash2, X, Save, FileText, Search, CheckCircle2, AlertCircle, MapPin, ZoomIn } from "lucide-react";
import { supabase } from "../lib/supabase";

type Learner = { id:string; full_name:string; preferred_name:string; student_id:string|null; education_level:string; grade:string; curriculum:string; course:string; account_status:string };
type Entry = { id:string; teacher_id:string; title:string; subject_name:string; education_level:string; grade:string; curriculum:string; course:string; day_of_week:number; starts_at:string; ends_at:string; location:string; notes:string; is_active:boolean; learnerIds:string[] };
type PersonalSlot = { id:string; learner_id:string; subject_name:string; title:string; day_of_week:number; starts_at:string; ends_at:string; notes:string };
type HomeworkItem = { id:string; title:string; subject:string; learner:string; dueAt:string; submitted:boolean };
type Draft = Omit<Entry,"id"|"teacher_id"|"is_active"|"learnerIds">;
const DAYS = [{label:"Monday",day:1},{label:"Tuesday",day:2},{label:"Wednesday",day:3},{label:"Thursday",day:4},{label:"Friday",day:5},{label:"Saturday",day:6},{label:"Sunday",day:0}];
const emptyDraft = ():Draft => ({title:"",subject_name:"",education_level:"",grade:"",curriculum:"",course:"",day_of_week:new Date().getDay(),starts_at:"08:00",ends_at:"09:00",location:"",notes:""});
const nameOf = (l:Learner) => l.preferred_name?.trim() || l.full_name?.trim() || "Learner";
const hhmm = (v:string) => (v || "").slice(0,5);
const mins = (v:string) => { const [h,m]=hhmm(v).split(":").map(Number); return (h||0)*60+(m||0); };
const dateTime = (v:string) => new Date(v).toLocaleString([], {weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

export default function TeacherWeeklyTimetable() {
  const [teacherId,setTeacherId]=useState("");
  const [learners,setLearners]=useState<Learner[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [subjects,setSubjects]=useState<string[]>([]);
  const [homework,setHomework]=useState<HomeworkItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [editorOpen,setEditorOpen]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(emptyDraft());
  const [selectedLearners,setSelectedLearners]=useState<string[]>([]);
  const [studentSearch,setStudentSearch]=useState("");
  const [personalSlots,setPersonalSlots]=useState<PersonalSlot[]>([]);
  const [subjectCustom,setSubjectCustom]=useState(false);
  const [zoom,setZoom]=useState(1);
  const touchDistance=useRef<number|null>(null);
  const touchZoom=useRef(1);

  const refresh=async(quiet=false)=>{
    if(!supabase){setError("Studyspace is not connected. Check your internet connection.");setLoading(false);return;}
    quiet?setRefreshing(true):setLoading(true);
    setError("");
    try {
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(authError||!auth.user) throw new Error("Your administrator session has expired. Sign in again.");
      const id=auth.user.id; setTeacherId(id);
      const [p,e,m,s,a,sets,attempts]=await Promise.all([
        supabase.from("profiles").select("id,full_name,preferred_name,student_id,education_level,grade,curriculum,course,account_status").eq("role","learner").eq("account_status","active").order("preferred_name"),
        supabase.from("teacher_timetable_entries").select("id,teacher_id,title,subject_name,education_level,grade,curriculum,course,day_of_week,starts_at,ends_at,location,notes,is_active").eq("teacher_id",id).eq("is_active",true).order("day_of_week").order("starts_at"),
        supabase.from("teacher_timetable_members").select("entry_id,learner_id"),
        supabase.from("student_subjects").select("learner_id,name"),
        supabase.from("exercise_assignments").select("id,exercise_set_id,learner_id,due_at").not("due_at","is",null).order("due_at").limit(150),
        supabase.from("exercise_sets").select("id,title,subject_name"),
        supabase.from("exercise_attempts").select("assignment_id,learner_id,submitted_at"),
      ]);
      const failure=[p.error,e.error,m.error,s.error,a.error,sets.error,attempts.error].find(Boolean);
      if(failure) throw failure;
      const learnerRows=(p.data??[]) as Learner[], membership=(m.data??[]) as {entry_id:string;learner_id:string}[];
      const memberMap=new Map<string,string[]>();
      membership.forEach(x=>memberMap.set(x.entry_id,[...(memberMap.get(x.entry_id)??[]),x.learner_id]));
      const nextEntries=((e.data??[]) as Omit<Entry,"learnerIds">[]).map(x=>({...x,learnerIds:memberMap.get(x.id)??[]}));
      let learnerAvailability: PersonalSlot[] = [];
      if (learnerRows.length) {
        const availability = await supabase.from("student_timetable_entries")
          .select("id,learner_id,subject_name,title,day_of_week,starts_at,ends_at,notes")
          .eq("timetable_kind","personal")
          .in("learner_id",learnerRows.map(learner => learner.id))
          .order("learner_id").order("day_of_week").order("starts_at");
        if (availability.error) throw availability.error;
        learnerAvailability = (availability.data ?? []) as PersonalSlot[];
      }
      const subjectSet=new Set<string>();
      (s.data??[] as {learner_id:string;name:string}[]).forEach(x=>{if(learnerRows.some(l=>l.id===x.learner_id)&&x.name?.trim())subjectSet.add(x.name.trim());});
      const setMap=new Map(((sets.data??[]) as {id:string;title:string;subject_name:string}[]).map(x=>[x.id,x]));
      const learnerMap=new Map(learnerRows.map(x=>[x.id,x]));
      const submitted=new Set(((attempts.data??[]) as {assignment_id:string;learner_id:string;submitted_at:string|null}[]).filter(x=>x.submitted_at).map(x=>x.learner_id+":"+x.assignment_id));
      const homeworkRows=((a.data??[]) as {id:string;exercise_set_id:string;learner_id:string;due_at:string}[]).flatMap(x=>{
        const set=setMap.get(x.exercise_set_id), learner=learnerMap.get(x.learner_id);
        return set&&learner?[{id:x.id,title:set.title,subject:set.subject_name||"General",learner:nameOf(learner),dueAt:x.due_at,submitted:submitted.has(x.learner_id+":"+x.id)}]:[];
      });
      setLearners(learnerRows);setEntries(nextEntries);setPersonalSlots(learnerAvailability);setSubjects([...subjectSet].sort((x,y)=>x.localeCompare(y)));
      setHomework(homeworkRows);
      if(quiet)setNotice("Timetable and homework refreshed.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Timetable records could not be loaded.");}
    finally{setLoading(false);setRefreshing(false);}
  };

  useEffect(()=>{
    void refresh();
    if(!supabase)return;
    const channel=supabase.channel("monitor-weekly-timetable")
      .on("postgres_changes",{event:"*",schema:"public",table:"teacher_timetable_entries"},()=>void refresh(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"teacher_timetable_members"},()=>void refresh(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"student_timetable_entries"},()=>void refresh(true))
      .subscribe();
    return()=>{void supabase?.removeChannel(channel);};
  },[]);

  const levels=[...new Set(learners.map(x=>x.education_level).filter(Boolean))].sort();
  const courses=[...new Set(learners.filter(x=>!draft.education_level||x.education_level===draft.education_level).map(x=>x.course).filter(Boolean))].sort();
  const grades=[...new Set(learners.filter(x=>(!draft.education_level||x.education_level===draft.education_level)&&(!draft.course||x.course===draft.course)).map(x=>x.grade).filter(Boolean))].sort();
  const eligible=useMemo(()=>learners.filter(x=>(!draft.education_level||x.education_level===draft.education_level)&&(!draft.course||x.course===draft.course)&&(!draft.grade||x.grade===draft.grade)&&(!draft.curriculum||x.curriculum===draft.curriculum)),[learners,draft.education_level,draft.course,draft.grade,draft.curriculum]);
  const visible=eligible.filter(x=>[nameOf(x),x.full_name,x.student_id,x.grade,x.course].join(" ").toLowerCase().includes(studentSearch.trim().toLowerCase()));
  const times=[...new Set([...entries.map(x=>hhmm(x.starts_at)),...personalSlots.map(x=>hhmm(x.starts_at))])].sort((a,b)=>mins(a)-mins(b));
  const today=new Date().getDay();
  const nameMap=new Map(learners.map(x=>[x.id,nameOf(x)]));
  const now=Date.now();
  const due=homework.filter(x=>!x.submitted&&Date.parse(x.dueAt)<=now).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
  const upcoming=homework.filter(x=>Date.parse(x.dueAt)>now).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)).slice(0,10);

  const beginNew=()=>{setEditingId(null);setDraft({...emptyDraft(),day_of_week:today});setSelectedLearners([]);setStudentSearch("");setSubjectCustom(false);setEditorOpen(true);};
  const beginEdit=(x:Entry)=>{setEditingId(x.id);setDraft({title:x.title,subject_name:x.subject_name,education_level:x.education_level,grade:x.grade,curriculum:x.curriculum,course:x.course,day_of_week:x.day_of_week,starts_at:hhmm(x.starts_at),ends_at:hhmm(x.ends_at),location:x.location,notes:x.notes});setSelectedLearners(x.learnerIds);setStudentSearch("");setSubjectCustom(!subjects.includes(x.subject_name));setEditorOpen(true);};
  const save=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!supabase||!teacherId||saving)return;
    if(!draft.subject_name.trim()){setError("Choose a subject before saving this timetable block.");return;}
    if(mins(draft.ends_at)<=mins(draft.starts_at)){setError("The end time must be later than the start time.");return;}
    setSaving(true);setError("");setNotice("");
    const payload={teacher_id:teacherId,title:draft.title.trim()||draft.subject_name.trim(),subject_name:draft.subject_name.trim(),education_level:draft.education_level,grade:draft.grade,curriculum:draft.curriculum,course:draft.course,day_of_week:draft.day_of_week,starts_at:draft.starts_at,ends_at:draft.ends_at,location:draft.location.trim(),notes:draft.notes.trim(),updated_at:new Date().toISOString()};
    try{
      if(editingId){
        const {error:updateError}=await supabase.from("teacher_timetable_entries").update(payload).eq("id",editingId);if(updateError)throw updateError;
        const {data:current,error:loadError}=await supabase.from("teacher_timetable_members").select("learner_id").eq("entry_id",editingId);if(loadError)throw loadError;
        const existing=(current??[] as {learner_id:string}[]).map(x=>x.learner_id);
        const remove=existing.filter(x=>!selectedLearners.includes(x)), add=selectedLearners.filter(x=>!existing.includes(x));
        if(remove.length){const {error:e}=await supabase.from("teacher_timetable_members").delete().eq("entry_id",editingId).in("learner_id",remove);if(e)throw e;}
        if(add.length){const {error:e}=await supabase.from("teacher_timetable_members").insert(add.map(learner_id=>({entry_id:editingId,learner_id})));if(e)throw e;}
      }else{
        const {data:created,error:createError}=await supabase.from("teacher_timetable_entries").insert(payload).select("id").single();
        if(createError||!created)throw createError??new Error("Could not create timetable entry.");
        if(selectedLearners.length){
          const {error:memberError}=await supabase.from("teacher_timetable_members").insert(selectedLearners.map(learner_id=>({entry_id:created.id,learner_id})));
          if(memberError){await supabase.from("teacher_timetable_entries").delete().eq("id",created.id);throw memberError;}
        }
      }
      setEditorOpen(false);setNotice(selectedLearners.length?"Timetable block saved and shared with the selected learners.":"Private timetable block saved. You can share it with learners later by editing it.");await refresh(true);
    }catch(reason){setError(reason instanceof Error?reason.message:"The timetable entry could not be saved.");}
    finally{setSaving(false);}
  };
  const remove=async(x:Entry)=>{
    if(!supabase||!window.confirm("Remove this class from the shared student timetable?"))return;
    const {error:e}=await supabase.from("teacher_timetable_entries").delete().eq("id",x.id);
    if(e)setError(e.message);else{setNotice("Class removed from the shared timetable.");await refresh(true);}
  };
  const setScale=(value:number)=>setZoom(Math.max(.75,Math.min(1.5,Math.round(value*100)/100)));
  const distance=(list:React.TouchList)=>list.length<2?null:Math.hypot(list[0].clientX-list[1].clientX,list[0].clientY-list[1].clientY);
  const touchStart=(event:React.TouchEvent<HTMLDivElement>)=>{const d=distance(event.touches);if(d){touchDistance.current=d;touchZoom.current=zoom;}};
  const touchMove=(event:React.TouchEvent<HTMLDivElement>)=>{const d=distance(event.touches);if(d&&touchDistance.current){setScale(touchZoom.current*d/touchDistance.current);}};
  const touchEnd=()=>{touchDistance.current=null;};
  const wheelZoom=(event:React.WheelEvent<HTMLDivElement>)=>{if(event.ctrlKey){event.preventDefault();setScale(zoom+(event.deltaY<0?.05:-.05));}};

  return <div className="subpage monitor-timetable-page">
    <div className="welcome-row"><div><div className="eyebrow"><CalendarDays size={14}/> WEEKLY TEACHING PLAN</div><h1>My weekly <span>timetable.</span></h1><p className="page-subtitle">One personal weekly plan. Add your own teaching blocks and choose whether to share each one with learners.</p></div><div className="monitor-timetable-header-actions"><button className="secondary-button" type="button" onClick={()=>void refresh(true)} disabled={refreshing}><RefreshCw size={15}/>{refreshing?"Refreshing…":"Refresh"}</button><button className="primary-button" type="button" onClick={beginNew}><Plus size={16}/> Add to timetable</button></div></div>
    {error&&<p className="inline-message error-message" role="alert"><AlertCircle size={15}/>{error}</p>}{notice&&<p className="inline-message" role="status"><CheckCircle2 size={15}/>{notice}</p>}
    {editorOpen&&<section className="panel monitor-timetable-editor"><div className="panel-heading"><div><h2>{editingId?"Edit timetable block":"Add a timetable block"}</h2><p>Build your own weekly plan. Sharing a block with learners is optional.</p></div><button type="button" className="icon-button" onClick={()=>setEditorOpen(false)} aria-label="Close editor"><X size={17}/></button></div><form onSubmit={event=>void save(event)}><div className="monitor-timetable-form-grid">
      <label>Class title<input maxLength={120} value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))} placeholder="e.g. Form 3 Mathematics"/></label>
      <label>Subject<select required value={subjectCustom?"__custom__":draft.subject_name} onChange={e=>{if(e.target.value==="__custom__"){setSubjectCustom(true);setDraft(v=>({...v,subject_name:""}));}else{setSubjectCustom(false);setDraft(v=>({...v,subject_name:e.target.value}));}}}><option value="">Choose subject</option>{subjects.map(s=><option key={s} value={s}>{s}</option>)}<option value="__custom__">Other / enter subject…</option></select></label>
      {subjectCustom&&<label>Subject name<input required maxLength={100} value={draft.subject_name} onChange={e=>setDraft(v=>({...v,subject_name:e.target.value}))}/></label>}
      <label>Education level<select value={draft.education_level} onChange={e=>setDraft(v=>({...v,education_level:e.target.value,course:"",grade:"",curriculum:""}))}><option value="">All levels</option>{levels.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Course / programme<select value={draft.course} onChange={e=>setDraft(v=>({...v,course:e.target.value,grade:""}))}><option value="">All courses</option>{courses.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Grade / year<select value={draft.grade} onChange={e=>setDraft(v=>({...v,grade:e.target.value}))}><option value="">All grades</option>{grades.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Curriculum<select value={draft.curriculum} onChange={e=>setDraft(v=>({...v,curriculum:e.target.value}))}><option value="">Any curriculum</option>{[...new Set(learners.filter(x=>(!draft.education_level||x.education_level===draft.education_level)&&(!draft.grade||x.grade===draft.grade)).map(x=>x.curriculum).filter(Boolean))].sort().map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label>Day<select value={draft.day_of_week} onChange={e=>setDraft(v=>({...v,day_of_week:Number(e.target.value)}))}>{DAYS.map(x=><option key={x.day} value={x.day}>{x.label}</option>)}</select></label>
      <label>Start time<input type="time" required value={draft.starts_at} onChange={e=>setDraft(v=>({...v,starts_at:e.target.value}))}/></label><label>End time<input type="time" required value={draft.ends_at} onChange={e=>setDraft(v=>({...v,ends_at:e.target.value}))}/></label>
      <label>Room / location<input maxLength={120} value={draft.location} onChange={e=>setDraft(v=>({...v,location:e.target.value}))} placeholder="Optional"/></label>
      <label className="monitor-form-wide">Notes<input maxLength={500} value={draft.notes} onChange={e=>setDraft(v=>({...v,notes:e.target.value}))} placeholder="Optional lesson focus or preparation"/></label>
    </div><div className="monitor-timetable-learner-picker"><div className="monitor-learner-picker-heading"><div><strong>Share with students · optional</strong><span>{selectedLearners.length} selected · {eligible.length} matching active students</span></div><label className="monitor-learner-search"><Search size={14}/><input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)} placeholder="Find a learner by name or ID"/></label></div><div className="monitor-learner-checklist">{visible.map(x=><label key={x.id}><input type="checkbox" checked={selectedLearners.includes(x.id)} onChange={e=>setSelectedLearners(v=>e.target.checked?[...v,x.id]:v.filter(id=>id!==x.id))}/><span><strong>{nameOf(x)}</strong><small>{x.student_id||"No ID"} · {x.grade||x.course||x.education_level}</small></span></label>)}{!visible.length&&<p>{eligible.length?"No learners match that search.":"No active learners match these filters."}</p>}</div><p className="monitor-timetable-help">Leave everyone unselected to keep this block on your private timetable. Selected learners will see a read-only copy in their Student Timetable.</p></div><div className="monitor-timetable-form-actions"><button type="button" className="secondary-button" onClick={()=>setEditorOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving||!draft.subject_name.trim()}><Save size={15}/>{saving?"Saving…":editingId?"Save changes":"Save timetable block"}</button></div></form></section>}
    <section className="panel monitor-weekly-panel">
      <div className="monitor-weekly-heading">
        <div><div className="eyebrow">MY WEEK</div><h2>Weekly timetable</h2><p>Days run down the left and times across the top. Your teaching blocks and learners’ personal study availability appear together in the same timetable.</p></div>
        <div className="monitor-weekly-controls">
          <div className="monitor-timetable-zoom" role="group" aria-label="Timetable zoom controls">
            <button type="button" className="icon-button" aria-label="Zoom out" onClick={()=>setScale(zoom-.1)} disabled={zoom<=.75}><Minus size={15}/></button>
            <button type="button" className="monitor-zoom-value" onClick={()=>setScale(1)} aria-label="Reset zoom">{Math.round(zoom*100)}%</button>
            <button type="button" className="icon-button" aria-label="Zoom in" onClick={()=>setScale(zoom+.1)} disabled={zoom>=1.5}><Plus size={15}/></button>
          </div><span className="monitor-zoom-hint"><ZoomIn size={13}/> Pinch or Ctrl + scroll</span>
        </div>
      </div>
      {loading?<div className="monitor-table-empty">Loading your timetable…</div>:!entries.length&&!personalSlots.length?<div className="monitor-table-empty"><CalendarDays size={25}/><strong>Your weekly timetable is ready</strong><span>Add a private teaching block, or let learner availability appear in the grid. You can share any block when you create or edit it.</span><button type="button" className="primary-button" onClick={beginNew}><Plus size={15}/> Add to timetable</button></div>:<div className="monitor-week-scroll" onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onWheel={wheelZoom}>
        <div className="monitor-week-zoom" style={{"--schedule-zoom":zoom} as React.CSSProperties}>
          <table className="monitor-week-table">
            <thead><tr><th className="monitor-time-head">DAY</th>{times.map(time=><th key={time}>{time}</th>)}</tr></thead>
            <tbody>{DAYS.map(day=><tr key={day.day}>
              <th className="monitor-time-cell">{day.label}</th>
              {times.map(time=>{
                const cell=entries.filter(entry=>entry.day_of_week===day.day&&hhmm(entry.starts_at)===time);
                const available=personalSlots.filter(slot=>slot.day_of_week===day.day&&hhmm(slot.starts_at)===time);
                return <td key={time} className={day.day===today?"is-today-column":""}>
                  {cell.map(entry=><article className="monitor-week-class" key={entry.id} onClick={()=>beginEdit(entry)}>
                    <strong>{entry.title}</strong><span>{entry.subject_name}</span><small>{hhmm(entry.starts_at)}–{hhmm(entry.ends_at)}</small>
                    {entry.learnerIds.length>0?<small><Users size={11}/>{entry.learnerIds.length} shared</small>:<small>Private · only you</small>}
                    {entry.learnerIds.length>0&&<div className="monitor-week-learner-tags">{entry.learnerIds.map(id=><span key={id}>{nameMap.get(id)||"Learner"}</span>)}</div>}
                    {entry.location&&<small><MapPin size={11}/>{entry.location}</small>}
                    <div className="monitor-week-actions"><button type="button" className="icon-button" onClick={event=>{event.stopPropagation();beginEdit(entry);}} aria-label={"Edit "+entry.title}><Pencil size={12}/></button><button type="button" className="icon-button danger-text" onClick={event=>{event.stopPropagation();void remove(entry);}} aria-label={"Delete "+entry.title}><Trash2 size={12}/></button></div>
                  </article>)}
                  {available.length>0&&<div className="monitor-week-availability">
                    <div className="monitor-week-availability-head"><Users size={12}/><strong>{available.length} learner{available.length===1?"":"s"} available</strong></div>
                    {available.map(slot=>{
                      const ready=(slot.notes||"").includes("[READY_FOR_STUDY]");
                      return <article className="monitor-week-availability-item" key={slot.id}>
                        <strong>{nameMap.get(slot.learner_id)||"Learner"}</strong>
                        <span>{slot.subject_name||slot.title||"Study time"}</span>
                        <small>{hhmm(slot.starts_at)}–{hhmm(slot.ends_at)} · {ready?"Ready to study":"Planned"}</small>
                      </article>;
                    })}
                  </div>}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </section>
    <section className="panel monitor-homework-panel"><div className="panel-heading"><div><h2>Homework tracker</h2><p>Track submitted and outstanding work by learner and deadline.</p></div><FileText size={19}/></div><div className="monitor-homework-grid"><div className="monitor-homework-column"><div className="monitor-homework-subhead"><strong>Due / overdue</strong><span>{due.length}</span></div>{due.length?due.map(x=><article key={x.id} className="monitor-homework-row"><div><strong>{x.title}</strong><span>{x.subject} · {x.learner}</span></div><time className={Date.parse(x.dueAt)<now?"is-overdue":"is-due"}>{dateTime(x.dueAt)}</time></article>):<p className="monitor-homework-empty"><CheckCircle2 size={16}/> No outstanding homework is overdue.</p>}</div><div className="monitor-homework-column"><div className="monitor-homework-subhead"><strong>Upcoming homework</strong><span>{upcoming.length}</span></div>{upcoming.length?upcoming.map(x=><article key={x.id} className="monitor-homework-row"><div><strong>{x.title}</strong><span>{x.subject} · {x.learner}</span></div><time>{dateTime(x.dueAt)}</time></article>):<p className="monitor-homework-empty">No upcoming deadlines are recorded yet.</p>}</div></div></section>
  </div>;
}
