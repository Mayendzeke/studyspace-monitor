import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, Plus, Save, Sparkles, Users, MessageCircle, Send } from 'lucide-react'

type LessonRecap = { summary: string; keyPoints: string[]; workedExample: string; exitQuestion: string }
type LessonPlan = {
  id: string
  title: string
  subject: string
  level: string
  grade: string
  curriculum: string
  date: string
  duration: number
  objectives: string
  sourceNotes: string
  checkpoints: string[]
  homework: string
  homeworkDue: string
  aiRecap?: LessonRecap
  updatedAt: string
  publishedSessionId?: string
}
const KEY = 'studyspace-monitor-classroom-plans-v1'
const readPlans = (): LessonPlan[] => {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
const blank = (): LessonPlan => ({ id: crypto.randomUUID(), title: '', subject: '', level: 'Secondary', grade: '', curriculum: '', date: new Date().toISOString().slice(0,10), duration: 45, objectives: '', sourceNotes: '', checkpoints: ['', '', ''], homework: '', homeworkDue: '', updatedAt: new Date().toISOString() })

export default function ClassroomStudio() {
  const [plans, setPlans] = useState<LessonPlan[]>(readPlans)
  const [draft, setDraft] = useState<LessonPlan>(blank)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [learners, setLearners] = useState<{id:string;student_id:string|null;full_name:string;preferred_name:string;account_status:string}[]>([])
  const [selectedLearners, setSelectedLearners] = useState<string[]>([])
  const [teacherMessages, setTeacherMessages] = useState<{id:string;sender_id:string;message:string;created_at:string}[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [sessionStatus, setSessionStatus] = useState<'scheduled'|'live'|'ended'|'cancelled'|null>(null)
  const [boardImage, setBoardImage] = useState('')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(plans)) } catch { setNotice('Browser storage is full. Export or remove old lesson plans.') } }, [plans])
  useEffect(() => { if (!supabase) return; void supabase.from('profiles').select('id,student_id,full_name,preferred_name,account_status').eq('role','learner').eq('account_status','active').order('preferred_name').then(({data}) => setLearners((data ?? []) as typeof learners)) }, [])
  useEffect(() => {
    if (!supabase || !draft.publishedSessionId) return;
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const load = async () => {
      const [{data: auth},{data: messages},{data: session},{data: board}] = await Promise.all([
        supabase!.auth.getUser(),
        supabase!.from('session_messages').select('id,sender_id,message,created_at').eq('session_id',draft.publishedSessionId).order('created_at'),
        supabase!.from('class_sessions').select('status').eq('id',draft.publishedSessionId).single(),
        supabase!.from('session_whiteboards').select('board_state').eq('session_id',draft.publishedSessionId).maybeSingle()
      ]);
      if (!alive) return;
      if (auth.user) setAdminId(auth.user.id);
      if (messages) setTeacherMessages(messages);
      if (session?.status) setSessionStatus(session.status);
      const imageData=(board?.board_state as {imageData?:string}|null)?.imageData;
      if (imageData) setBoardImage(imageData);
      channel=supabase!.channel('monitor-session-'+draft.publishedSessionId)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'session_messages',filter:'session_id=eq.'+draft.publishedSessionId},payload=>{
          const row=payload.new as {id:string;sender_id:string;message:string;created_at:string};
          if(alive) setTeacherMessages(current=>current.some(item=>item.id===row.id)?current:[...current,row]);
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'session_whiteboards',filter:'session_id=eq.'+draft.publishedSessionId},payload=>{
          const image=(payload.new as {board_state?:{imageData?:string}}).board_state?.imageData;
          if(alive&&image) setBoardImage(image);
        }).subscribe();
    };
    void load();
    return ()=>{alive=false;if(channel&&supabase)void supabase.removeChannel(channel)};
  },[draft.publishedSessionId]);
  const [adminId,setAdminId] = useState('');
  const sendTeacherMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if(!supabase||!draft.publishedSessionId||!adminId||!chatDraft.trim())return;
    const {error}=await supabase.from('session_messages').insert({session_id:draft.publishedSessionId,sender_id:adminId,message:chatDraft.trim()});
    if(error)setNotice('Message could not be sent: '+error.message);else setChatDraft('');
  };
  const changeSessionStatus = async (status:'live'|'ended') => {
    if(!supabase||!draft.publishedSessionId)return;
    const {error}=await supabase.from('class_sessions').update({status,updated_at:new Date().toISOString()}).eq('id',draft.publishedSessionId);
    if(error)setNotice('Session status could not be changed: '+error.message);
    else {setSessionStatus(status);setNotice(status==='live'?'Class is now live.':'Class has been ended.')}
  };

  const completePoints = useMemo(() => draft.checkpoints.map(x => x.trim()).filter(Boolean).slice(0,5), [draft.checkpoints])
  const update = (patch: Partial<LessonPlan>) => setDraft(current => ({ ...current, ...patch, updatedAt: new Date().toISOString() }))
  const generateRecap = async () => {
    if (!supabase) { setNotice('Connect Supabase before using AI lesson recaps.'); return }
    setAiBusy(true); setNotice('Preparing a concise lesson recap…')
    try {
      const { data, error } = await supabase.functions.invoke('generate-lesson-recap', { body: {
        title: draft.title, subject: draft.subject, level: draft.level, grade: draft.grade,
        curriculum: draft.curriculum, objectives: draft.objectives, sourceNotes: draft.sourceNotes
      } })
      if (error) throw error
      if (!data?.success || !data?.recap) throw new Error(data?.error || 'The AI service did not return a recap.')
      update({ aiRecap: data.recap })
      setNotice('AI draft generated. Review it for accuracy before sharing with learners.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The AI recap could not be generated.')
    } finally { setAiBusy(false) }
  }
  const publishSession = async () => {
    if (!supabase) { setNotice('Connect Supabase before publishing a class session.'); return }
    if (!draft.title.trim() || !draft.subject.trim() || selectedLearners.length === 0) { setNotice('Add a lesson title and subject, then select at least one active learner.'); return }
    setPublishing(true); setNotice('')
    try {
      const { data: authState } = await supabase.auth.getSession()
      const adminId = authState.session?.user.id
      if (!adminId) throw new Error('Administrator sign-in is required.')
      const startsAt = new Date(draft.date + 'T09:00:00').toISOString()
      const { data: session, error: sessionError } = await supabase.from('class_sessions').insert({
        created_by: adminId, title: draft.title.trim(), subject_name: draft.subject.trim(),
        education_level: draft.level, grade: draft.grade, curriculum: draft.curriculum,
        objectives: draft.objectives, starts_at: startsAt, duration_minutes: draft.duration, status: 'scheduled'
      }).select('id').single()
      if (sessionError || !session) throw sessionError || new Error('The class session could not be created.')
      const memberRows = selectedLearners.map(learner_id => ({session_id:session.id,learner_id}))
      const { error: memberError } = await supabase.from('class_session_members').insert(memberRows)
      if (memberError) { await supabase.from('class_sessions').delete().eq('id',session.id); throw memberError }
      const { error: notesError } = await supabase.from('session_lesson_notes').insert({
        session_id:session.id, summary:draft.aiRecap?.summary || draft.sourceNotes.slice(0,1200),
        key_points:draft.aiRecap?.keyPoints || completePoints,
        worked_example:draft.aiRecap?.workedExample || '', recap_markdown:draft.aiRecap ? JSON.stringify(draft.aiRecap) : '',
        is_published:true, updated_by:adminId
      })
      if (notesError) { await supabase.from('class_sessions').delete().eq('id',session.id); throw notesError }
      if (draft.homework.trim()) {
        const { error: homeworkError } = await supabase.from('session_homework').insert({
          session_id:session.id,title:draft.homework.trim(),instructions:draft.homework.trim(),
          due_at:draft.homeworkDue ? new Date(draft.homeworkDue + 'T23:59:00').toISOString() : null,created_by:adminId
        })
        if (homeworkError) { await supabase.from('class_sessions').delete().eq('id',session.id); throw homeworkError }
      }
      const { error: boardError } = await supabase.from('session_whiteboards').insert({session_id:session.id,updated_by:adminId})
      if (boardError) { await supabase.from('class_sessions').delete().eq('id',session.id); throw boardError }
      update({publishedSessionId:session.id})
      setSessionStatus('scheduled')
      setPlans(current => current.map(plan => plan.id === draft.id ? {...plan,publishedSessionId:session.id} : plan))
      setNotice("Session published to " + selectedLearners.length + " learner(s). Their Today’s Session workspace can now load the shared lesson, notes and homework.")
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The class session could not be published.') }
    finally { setPublishing(false) }
  }
  const save = () => {
    if (!draft.title.trim() || !draft.subject.trim()) { setNotice('Add a lesson title and subject before saving.'); return }
    const saved = { ...draft, title: draft.title.trim(), subject: draft.subject.trim(), checkpoints: completePoints }
    setPlans(current => [saved, ...current.filter(x => x.id !== saved.id)])
    setSelected(saved.id); setDraft(saved); setNotice('Lesson plan saved in this browser. It is not yet synced to learners.')
  }
  const load = (plan: LessonPlan) => { setDraft(plan); setSelected(plan.id); setNotice('Lesson plan loaded.') }
  const remove = (id: string) => { if (!window.confirm('Delete this local lesson plan?')) return; setPlans(current => current.filter(x => x.id !== id)); if (selected === id) { setSelected(null); setDraft(blank()) } }
  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ format: 'Studyspace classroom plans', version: 1, plans }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'studyspace-lesson-plans.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="subpage classroom-studio">
    <div className="eyebrow">TEACHING WORKSPACE</div><h1>Classroom Studio</h1>
    <p className="page-subtitle">Prepare short, focused lessons, student-friendly recaps and follow-up work for Today's Session.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><Sparkles size={21}/></div><div className="setup-banner-copy"><strong>AI and learner delivery are backend-connected features</strong><p>This front end prepares the lesson structure. Once Supabase and the secure AI service are connected, lesson content can be generated from your supplied materials, reviewed, approved and delivered to selected learners.</p></div></div>
    <div className="classroom-layout">
      <section className="panel classroom-editor">
        <div className="panel-heading"><div><h2>Lesson builder</h2><p>Keep each session simple and purposeful.</p></div><BookOpen size={19}/></div>
        <div className="classroom-form-grid">
          <label>Lesson title<input value={draft.title} onChange={e=>update({title:e.target.value})} placeholder="e.g. Linear equations"/></label>
          <label>Subject<input value={draft.subject} onChange={e=>update({subject:e.target.value})} placeholder="Mathematics"/></label>
          <label>Level<select value={draft.level} onChange={e=>update({level:e.target.value})}><option>Primary</option><option>Secondary</option><option>College</option><option>University</option></select></label>
          <label>Grade / year<input value={draft.grade} onChange={e=>update({grade:e.target.value})} placeholder="Form 3"/></label>
          <label>Curriculum<input value={draft.curriculum} onChange={e=>update({curriculum:e.target.value})} placeholder="IGCSE, CAPS, etc."/></label>
          <label>Date<input type="date" value={draft.date} onChange={e=>update({date:e.target.value})}/></label>
          <label>Lesson length (minutes)<input type="number" min="10" max="240" value={draft.duration} onChange={e=>update({duration:Math.max(10,Math.min(240,Number(e.target.value)||45))})}/></label>
        </div>
        <label className="classroom-wide-field">Learning objectives<textarea rows={2} value={draft.objectives} onChange={e=>update({objectives:e.target.value})} placeholder="What should learners be able to explain or do by the end?"/></label>
        <div className="classroom-points-heading"><div><strong>Lesson checkpoints</strong><small>Only 3–5 memorable points. Avoid overloading the learner.</small></div><span>{completePoints.length}/5</span></div>
        <div className="classroom-checkpoints">{Array.from({length:Math.max(3,draft.checkpoints.length)},(_,i)=><label key={i}><span>{i+1}</span><input value={draft.checkpoints[i]||''} maxLength={180} onChange={e=>update({checkpoints:draft.checkpoints.map((v,j)=>j===i?e.target.value:v).concat(i>=draft.checkpoints.length?Array(i-draft.checkpoints.length+1).fill(''):[])})} placeholder={i===0?'First key idea':i===1?'Worked example':i===2?'Quick understanding check':'Optional extra point'}/></label>)}</div>
        <label className="classroom-wide-field">Source material / teacher notes<textarea rows={5} value={draft.sourceNotes} onChange={e=>update({sourceNotes:e.target.value})} placeholder="Paste the relevant notes, topic extract or teacher guidance that the AI should use. Do not include unrelated material."/></label>
        <div className="classroom-ai-card"><Sparkles size={19}/><div><strong>AI lesson recap</strong><p>Generation will use the lesson title, objectives and source material to create a short explanation, up to five key points, one worked example where relevant, and a quick exit question. It will not invent details beyond the supplied material.</p><small>Uses the configured Gemini provider. Do not include learner names, contact details or other personal information in source material.</small><button type="button" className="subtle-button" disabled={aiBusy || !draft.title.trim() || !draft.subject.trim() || (!draft.objectives.trim() && !draft.sourceNotes.trim())} onClick={() => void generateRecap()}>{aiBusy ? 'Generating…' : 'Generate lesson recap'}</button></div></div>
        {draft.aiRecap && <section className="classroom-generated-recap"><div><strong>AI-generated draft · review before publishing</strong><p>{draft.aiRecap.summary}</p></div><strong>Key points</strong><ul>{draft.aiRecap.keyPoints.map((point,index)=><li key={index}>{point}</li>)}</ul>{draft.aiRecap.workedExample && <><strong>Worked example</strong><p>{draft.aiRecap.workedExample}</p></>}{draft.aiRecap.exitQuestion && <><strong>Quick understanding check</strong><p>{draft.aiRecap.exitQuestion}</p></>}</section>}
        <label className="classroom-wide-field">Homework / next steps<textarea rows={3} value={draft.homework} onChange={e=>update({homework:e.target.value})} placeholder="A short follow-up task with clear instructions."/></label>
        <label className="classroom-date-field">Homework due date<input type="date" value={draft.homeworkDue} onChange={e=>update({homeworkDue:e.target.value})}/></label>
        <section className="classroom-assign-panel"><div><strong>Assign to learners</strong><small>Select the active learner accounts that should receive this session.</small></div>{learners.length ? <div className="classroom-learner-checks">{learners.map(learner=><label key={learner.id}><input type="checkbox" checked={selectedLearners.includes(learner.id)} onChange={e=>setSelectedLearners(current=>e.target.checked?[...current,learner.id]:current.filter(id=>id!==learner.id))}/><span><strong>{learner.preferred_name||learner.full_name||'Learner'}</strong><small>{learner.student_id||'Student ID unavailable'}</small></span></label>)}</div> : <p>No active learner accounts are available yet. Enrol learners from the Monitor dashboard first.</p>}<button className="primary-button" onClick={()=>void publishSession()} disabled={publishing||learners.length===0||selectedLearners.length===0}>{publishing?'Publishing…':'Publish session to selected learners'}</button>{draft.publishedSessionId&&<small>Published session ID: {draft.publishedSessionId}</small>}{draft.publishedSessionId&&<div className="classroom-live-panel">
        <div className="classroom-live-heading"><div><strong>Shared classroom controls</strong><small>Session status: {sessionStatus||'Loading'}</small></div><div>{sessionStatus==='scheduled'&&<button className="primary-button" onClick={()=>void changeSessionStatus('live')}>Start live class</button>}{sessionStatus==='live'&&<button className="subtle-button" onClick={()=>void changeSessionStatus('ended')}>End class</button>}</div></div>
        <div className="classroom-teacher-chat"><div className="classroom-chat-title"><MessageCircle size={16}/> Live class chat</div><div className="classroom-chat-list">{teacherMessages.length?teacherMessages.map(item=><article key={item.id}><strong>{item.sender_id===adminId?'You':'Learner'}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></article>):<p>No messages yet. Learner messages will appear here.</p>}</div><form onSubmit={sendTeacherMessage}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} maxLength={4000} placeholder="Reply to your class…"/><button className="primary-button" type="submit" disabled={!chatDraft.trim()}><Send size={15}/> Send</button></form></div>
        {boardImage&&<div className="classroom-board-preview"><strong>Shared worksheet / whiteboard</strong><img src={boardImage} alt="Latest shared classroom whiteboard"/></div>}
      </div>}</section>
        <div className="classroom-actions"><button className="primary-button" onClick={save}><Save size={16}/> Save lesson plan</button><button className="subtle-button" onClick={exportPlan}>Export local plans</button><button className="subtle-button" onClick={()=>{setDraft(blank());setSelected(null);setNotice('New lesson started.')}}><Plus size={15}/> New lesson</button></div>
        {notice&&<p className="inline-message" role="status">{notice}</p>}
      </section>
      <aside className="panel classroom-side">
        <div className="panel-heading"><div><h2>Saved lessons</h2><p>{plans.length} local plan(s)</p></div><CalendarDays size={18}/></div>
        {plans.length?plans.map(plan=><article className="classroom-saved-plan" key={plan.id}><button onClick={()=>load(plan)}><strong>{plan.title}</strong><span>{plan.subject} · {plan.date}</span><small>{plan.checkpoints.length} lesson point(s) · {plan.duration} min</small></button><button className="text-button" onClick={()=>remove(plan.id)}>Delete</button></article>):<div className="classroom-empty"><FileText size={24}/><strong>No lesson plans yet</strong><span>Build a lesson and save it here.</span></div>}
        <div className="classroom-sync-note"><Users size={16}/><span>Saved plans are local to this administrator browser. Learner targeting, shared notes and delivery activate after Supabase is connected.</span></div>
        <div className="classroom-feature-row"><Clock3 size={16}/><span>Timed lesson outline</span></div><div className="classroom-feature-row"><ClipboardList size={16}/><span>Homework and due dates</span></div><div className="classroom-feature-row"><CheckCircle2 size={16}/><span>Review before publishing</span></div>
      </aside>
    </div>
  </div>
}
