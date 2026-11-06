import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import LiveClassroomCall from './LiveClassroomCall'
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, Plus, Save, Sparkles, Users, MessageCircle, Send, ShieldCheck } from 'lucide-react'

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
  meetingUrl?: string
}
const KEY = 'studyspace-monitor-classroom-plans-v1'
const readPlans = (): LessonPlan[] => {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
async function describeEdgeFunctionError(reason: unknown, fallback: string): Promise<string> {
  const context = reason && typeof reason === "object" && "context" in reason
    ? (reason as { context?: unknown }).context
    : undefined;
  if (context instanceof Response) {
    const status = context.status;
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      const detail = typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string" ? payload.message : "";
      if (detail) return detail + " (HTTP " + status + ")";
    } catch {
      try {
        const detail = (await context.clone().text()).trim().slice(0, 240);
        if (detail) return detail + " (HTTP " + status + ")";
      } catch { /* Preserve the status if the response body is unavailable. */ }
    }
    return "The AI service rejected the request (HTTP " + status + ").";
  }
  return reason instanceof Error ? reason.message : fallback;
}

const blank = (): LessonPlan => ({ id: crypto.randomUUID(), title: '', subject: '', level: 'Secondary', grade: '', curriculum: '', date: new Date().toISOString().slice(0,10), duration: 45, objectives: '', sourceNotes: '', checkpoints: ['', '', ''], homework: '', homeworkDue: '', updatedAt: new Date().toISOString() })

export default function ClassroomStudio() {
  const [plans, setPlans] = useState<LessonPlan[]>(readPlans)
  const [draft, setDraft] = useState<LessonPlan>(blank)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiConnection, setAiConnection] = useState<'unchecked'|'checking'|'ready'|'error'>('unchecked')
  const [aiConnectionMessage, setAiConnectionMessage] = useState('')
  const [jaasConnection, setJaasConnection] = useState<'unchecked'|'checking'|'ready'|'error'>('unchecked')
  const [jaasConnectionMessage, setJaasConnectionMessage] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [learners, setLearners] = useState<{id:string;student_id:string|null;full_name:string;preferred_name:string;account_status:string}[]>([])
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])
  const [subjectManual, setSubjectManual] = useState(false)
  const [selectedLearners, setSelectedLearners] = useState<string[]>([])
  const [teacherMessages, setTeacherMessages] = useState<{id:string;sender_id:string;message:string;created_at:string}[]>([])\n  const [chatNotice, setChatNotice] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [sessionStatus, setSessionStatus] = useState<'scheduled'|'live'|'ended'|'cancelled'|null>(null)
  const [boardImage, setBoardImage] = useState('')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(plans)) } catch { setNotice('Browser storage is full. Export or remove old lesson plans.') } }, [plans])
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const loadClassOptions = async () => {
      const [learnerResult, subjectResult] = await Promise.all([
        supabase!.from('profiles').select('id,student_id,full_name,preferred_name,account_status')
          .eq('role','learner').eq('account_status','active').order('preferred_name'),
        supabase!.from('student_subjects').select('name').order('name')
      ]);
      if (!alive) return;
      if (learnerResult.error) setNotice('Learner list could not be loaded: ' + learnerResult.error.message);
      else setLearners((learnerResult.data ?? []) as typeof learners);
      if (subjectResult.error) {
        setNotice('Registered subjects could not be loaded. You can still enter a subject manually.');
      } else {
        const names = Array.from(new Set((subjectResult.data ?? []).map(row => String(row.name ?? '').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
        setSubjectOptions(names);
        setDraft(current => {
          if (current.subject.trim()) {
            if (!names.includes(current.subject)) setSubjectManual(true);
            return current;
          }
          if (names.length) return { ...current, subject: names[0] };
          return current;
        });
      }
    };
    void loadClassOptions();
    return () => { alive = false };
  }, [])
  useEffect(() => {
    if (!supabase || !draft.publishedSessionId) return;
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const load = async () => {
      const [{data: auth},{data: messages},{data: session},{data: board}] = await Promise.all([
        supabase!.auth.getUser(),
        supabase!.from('session_messages').select('id,sender_id,message,created_at').eq('session_id',draft.publishedSessionId).order('created_at'),
        supabase!.from('class_sessions').select('status,meeting_url').eq('id',draft.publishedSessionId).single(),
        supabase!.from('session_whiteboards').select('board_state').eq('session_id',draft.publishedSessionId).maybeSingle()
      ]);
      if (!alive) return;
      if (auth.user) setAdminId(auth.user.id);
      if (messages) setTeacherMessages(messages);
      if (session?.status) setSessionStatus(session.status);
      if (session?.meeting_url) setDraft(current=>({...current,meetingUrl:session.meeting_url}));
      const imageData=(board?.board_state as {imageData?:string}|null)?.imageData;
      if (imageData) setBoardImage(imageData);
      channel=supabase!.channel('monitor-session-'+draft.publishedSessionId)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'session_messages',filter:'session_id=eq.'+draft.publishedSessionId},payload=>{
          const row=payload.new as {id:string;sender_id:string;message:string;created_at:string};
          if(alive) {
            setTeacherMessages(current=>current.some(item=>item.id===row.id)?current:[...current,row]);
            if(row.sender_id!==adminId) {
              const sender=learners.find(item=>item.id===row.sender_id);
              setChatNotice('New message from '+(sender?.preferred_name||sender?.full_name||'a learner'));
              if('Notification' in window && Notification.permission==='granted') new Notification('Studyspace class chat',{body:(sender?.preferred_name||sender?.full_name||'A learner')+' sent a message.'});
            }
          }
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
    const {error}=await supabase.from('class_sessions').update({status,meeting_ready_at:null,updated_at:new Date().toISOString()}).eq('id',draft.publishedSessionId);
    if(error)setNotice('Session status could not be changed: '+error.message);
    else {setSessionStatus(status);setNotice(status==='live'?'Class is live. The teacher and assigned learners can now join the secured video room.':'Class has been ended.')}
  };

  const completePoints = useMemo(() => draft.checkpoints.map(x => x.trim()).filter(Boolean).slice(0,5), [draft.checkpoints])
  const update = (patch: Partial<LessonPlan>) => setDraft(current => ({ ...current, ...patch, updatedAt: new Date().toISOString() }))
  const checkAiConnection = async () => {
    if (!supabase) {
      setAiConnection('error');
      setAiConnectionMessage('Studyspace is not connected to the AI service.');
      return;
    }
    setAiConnection('checking');
    setAiConnectionMessage('Checking provider credentials and model availability…');
    try {
      const { data, error } = await supabase.functions.invoke('generate-lesson-recap', { body: { action: 'healthcheck' } });
      if (error) throw error;
      if (!data?.success || data?.verified !== true) throw new Error(data?.error || 'The AI connection could not be verified.');
      setAiConnection('ready');
      setAiConnectionMessage('AI is ready · ' + String(data.provider || 'Provider') + ' · ' + String(data.model || 'Configured model'));
    } catch (reason) {
      setAiConnection('error');
      setAiConnectionMessage(await describeEdgeFunctionError(reason, 'The AI connection could not be verified.'));
    }
  };

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
      update({
        title: draft.title.trim() || (draft.subject.trim() ? draft.subject.trim() + ' lesson' : 'Lesson recap'),
        subject: draft.subject.trim() || subjectOptions[0] || 'General learning',
        aiRecap: data.recap
      })
      setAiConnection('ready');
      setAiConnectionMessage('Last generation succeeded · ' + String(data.provider || 'AI provider') + ' · ' + String(data.model || 'configured model'));
      setNotice('AI draft generated. Review it for accuracy before sharing with learners.')
    } catch (reason) {
      const message = await describeEdgeFunctionError(reason, 'The AI recap could not be generated.');
      setAiConnection('error');
      setAiConnectionMessage(message);
      setNotice(message);
    } finally { setAiBusy(false) }
  }
  const checkJaasConnection = async () => {
    if (!supabase) {
      setJaasConnection('error');
      setJaasConnectionMessage('Studyspace is not connected to the secure video service.');
      return;
    }
    setJaasConnection('checking');
    setJaasConnectionMessage('Checking that Supabase can load the private key and sign a test JWT…');
    try {
      const { data, error } = await supabase.functions.invoke('jaas-token', { body: { action: 'healthcheck' } });
      if (error) throw new Error(await describeEdgeFunctionError(error, 'The JaaS connection test failed.'));
      if (!data?.success || data?.signed !== true) throw new Error(data?.error || 'Studyspace could not sign a JaaS test token.');
      setJaasConnection('ready');
      setJaasConnectionMessage('Private key loaded and test JWT signed. JaaS will be fully confirmed when a live room accepts the token.');
    } catch (reason) {
      setJaasConnection('error');
      setJaasConnectionMessage(reason instanceof Error ? reason.message : 'The JaaS connection test failed.');
    }
  };

  const publishSession = async () => {
    if (!supabase) { setNotice('Connect Supabase before publishing a class session.'); return }
    if (!draft.title.trim() || !draft.subject.trim() || selectedLearners.length === 0) { setNotice('Add a lesson title and subject, then select at least one active learner.'); return }
    setPublishing(true); setNotice('')
    try {
      const { data: authState } = await supabase.auth.getSession()
      const adminId = authState.session?.user.id
      if (!adminId) throw new Error('Administrator sign-in is required.')
      const startsAt = new Date(draft.date + 'T09:00:00').toISOString()
      const meetingUrl = 'https://8x8.vc/Studyspace-' + crypto.randomUUID().replace(/-/g,'')
      const { data: session, error: sessionError } = await supabase.from('class_sessions').insert({
        created_by: adminId, title: draft.title.trim(), subject_name: draft.subject.trim(),
        education_level: draft.level, grade: draft.grade, curriculum: draft.curriculum,
        objectives: draft.objectives, starts_at: startsAt, duration_minutes: draft.duration, status: 'scheduled', meeting_url: meetingUrl,
        meeting_ready_at: null
      }).select('id').single()
      if (sessionError || !session) throw sessionError || new Error('The class session could not be created.')
      const memberRows = selectedLearners.map(learner_id => ({session_id:session.id,learner_id}))
      const { error: memberError } = await supabase.from('class_session_members').insert(memberRows)
      if (memberError) { await supabase.from('class_sessions').delete().eq('id',session.id); throw memberError }
      const { error: notesError } = await supabase.from('session_lesson_notes').insert({
        session_id:session.id, summary:draft.aiRecap?.summary || draft.sourceNotes.slice(0,1200),
        key_points:draft.aiRecap?.keyPoints || completePoints,
        worked_example:draft.aiRecap?.workedExample || '', exit_question:draft.aiRecap?.exitQuestion || '', recap_markdown:draft.aiRecap ? JSON.stringify(draft.aiRecap) : '',
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
      update({publishedSessionId:session.id,meetingUrl})
      setSessionStatus('scheduled')
      setPlans(current => [{...draft,publishedSessionId:session.id,meetingUrl,updatedAt:new Date().toISOString()},...current.filter(plan=>plan.id!==draft.id)])
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
  const load = (plan: LessonPlan) => {
    setDraft(plan);
    setSubjectManual(!!plan.subject && !subjectOptions.includes(plan.subject));
    setSelected(plan.id);
    setNotice('Lesson plan loaded.');
  }
  const remove = (id: string) => { if (!window.confirm('Delete this local lesson plan?')) return; setPlans(current => current.filter(x => x.id !== id)); if (selected === id) { setSelected(null); setDraft(blank()) } }
  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ format: 'Studyspace classroom plans', version: 1, plans }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'studyspace-lesson-plans.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="subpage classroom-studio">
    <div className="eyebrow">TEACHING WORKSPACE</div><h1>Classroom Studio</h1>
    <p className="page-subtitle">Prepare short, focused lessons, student-friendly recaps and follow-up work for Today's Session.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><Sparkles size={21}/></div><div className="setup-banner-copy"><strong>Classroom delivery uses the Supabase backend</strong><p>Published lessons, learner assignments, teacher notes, homework and class chat are shared through Studyspace. Lesson-plan drafts remain in this browser until you publish them. Video uses authenticated JaaS on 8x8.vc. Studyspace issues a short-lived room token only after checking the signed-in account, class assignment and teacher permissions. Only the class creator receives moderator access.</p><div className="classroom-ai-actions"><button type="button" className="subtle-button" onClick={()=>void checkJaasConnection()} disabled={jaasConnection==='checking'}><ShieldCheck size={14}/>{jaasConnection==='checking'?'Checking JaaS…':'Check JaaS signing'}</button></div>{jaasConnectionMessage&&<small className={'classroom-ai-status '+(jaasConnection==='ready'?'is-ready':jaasConnection==='error'?'has-error':'')} role="status">{jaasConnectionMessage}</small>}</div></div>
    <div className="classroom-layout">
      <section className="panel classroom-editor">
        <div className="panel-heading"><div><h2>Lesson builder</h2><p>Keep each session simple and purposeful.</p></div><BookOpen size={19}/></div>
        <div className="classroom-form-grid">
          <label>Lesson title<input value={draft.title} onChange={e=>update({title:e.target.value})} placeholder="e.g. Linear equations"/></label>
          <label>Subject / module
            <select value={subjectManual || (draft.subject && !subjectOptions.includes(draft.subject)) ? '__other__' : draft.subject}
              onChange={e=>{const value=e.target.value;if(value==='__other__'){setSubjectManual(true);update({subject:''})}else{setSubjectManual(false);update({subject:value})}}}>
              <option value="">Choose a registered subject</option>
              {subjectOptions.map(name=><option key={name} value={name}>{name}</option>)}
              <option value="__other__">Other / enter manually</option>
            </select>
          </label>
          {(subjectManual || (!!draft.subject && !subjectOptions.includes(draft.subject))) && <label>Enter subject<input value={draft.subject} onChange={e=>update({subject:e.target.value})} placeholder="Type the subject or module"/></label>}
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
        <div className="classroom-ai-card"><Sparkles size={19}/><div><strong>AI lesson recap</strong><p>Generate a concise explanation, up to five key points, a worked example where relevant, and an understanding-check question from the teacher's material. Review all generated content before sharing it with learners.</p><small>Use anonymised lesson material only. Do not submit learner names, IDs, contact details or other personal information to an external AI provider.</small><div className="classroom-ai-actions"><button type="button" className="subtle-button" disabled={aiConnection==='checking'} onClick={() => void checkAiConnection()}><ShieldCheck size={14}/>{aiConnection==='checking'?'Checking AI…':'Test AI connection'}</button><button type="button" className="primary-button" disabled={aiBusy || ![draft.title,draft.subject,draft.grade,draft.curriculum,draft.objectives,draft.sourceNotes].some(value=>value.trim())} onClick={() => void generateRecap()}>{aiBusy ? 'Generating…' : 'Generate lesson recap'}</button></div>{aiConnectionMessage&&<small className={'classroom-ai-status '+(aiConnection==='ready'?'is-ready':aiConnection==='error'?'has-error':'')} role="status">{aiConnection==='ready'?<CheckCircle2 size={13}/>:aiConnection==='error'?<FileText size={13}/>:<ShieldCheck size={13}/>} {aiConnectionMessage}</small>}</div></div>
        {draft.aiRecap && <section className="classroom-generated-recap"><div><strong>AI-generated draft · review before publishing</strong><p>{draft.aiRecap.summary}</p></div><strong>Key points</strong><ul>{draft.aiRecap.keyPoints.map((point,index)=><li key={index}>{point}</li>)}</ul>{draft.aiRecap.workedExample && <><strong>Worked example</strong><p>{draft.aiRecap.workedExample}</p></>}{draft.aiRecap.exitQuestion && <><strong>Quick understanding check</strong><p>{draft.aiRecap.exitQuestion}</p></>}</section>}
        <label className="classroom-wide-field">Homework / next steps<textarea rows={3} value={draft.homework} onChange={e=>update({homework:e.target.value})} placeholder="A short follow-up task with clear instructions."/></label>
        <label className="classroom-date-field">Homework due date<input type="date" value={draft.homeworkDue} onChange={e=>update({homeworkDue:e.target.value})}/></label>
        <section className="classroom-assign-panel"><div><strong>Assign to learners</strong><small>Select the active learner accounts that should receive this session.</small></div>{learners.length ? <div className="classroom-learner-checks">{learners.map(learner=><label key={learner.id}><input type="checkbox" checked={selectedLearners.includes(learner.id)} onChange={e=>setSelectedLearners(current=>e.target.checked?[...current,learner.id]:current.filter(id=>id!==learner.id))}/><span><strong>{learner.preferred_name||learner.full_name||'Learner'}</strong><small>{learner.student_id||'Student ID unavailable'}</small></span></label>)}</div> : <p>No active learner accounts are available yet. Enrol learners from the Monitor dashboard first.</p>}<button className="primary-button" onClick={()=>void publishSession()} disabled={publishing||learners.length===0||selectedLearners.length===0}>{publishing?'Publishing…':'Publish session to selected learners'}</button>{draft.publishedSessionId&&<small>Published session ID: {draft.publishedSessionId}</small>}{draft.publishedSessionId&&<div className="classroom-live-panel">
        <div className="classroom-live-heading"><div><strong>Shared classroom controls</strong><small>Session status: {sessionStatus||'Loading'}</small></div><div>{sessionStatus==='scheduled'&&<button className="primary-button" onClick={()=>void changeSessionStatus('live')}>Start live class</button>}{sessionStatus==='live'&&<button className="subtle-button" onClick={()=>void changeSessionStatus('ended')}>End class</button>}{sessionStatus==='ended'&&<span className="classroom-session-ended">This lesson has ended. Learners can still review the lesson guide and homework.</span>}</div></div>
        {sessionStatus==='live'&&draft.publishedSessionId&&<LiveClassroomCall sessionId={draft.publishedSessionId} audience="teacher"/>}
        {sessionStatus==='scheduled'&&<p className="classroom-live-waiting">Start the lesson to open the embedded video room. Learners will see the same Join button in Today's Session.</p>}
        <div className="classroom-teacher-chat"><div className="classroom-chat-title"><MessageCircle size={16}/> Live class chat{chatNotice&&<small className="classroom-chat-notice" role="status">{chatNotice}</small>}</div><div className="classroom-chat-list">{teacherMessages.length?teacherMessages.map(item=><article key={item.id}><strong>{item.sender_id===adminId?'You':(learners.find(learner=>learner.id===item.sender_id)?.preferred_name||learners.find(learner=>learner.id===item.sender_id)?.full_name||'Unknown learner')}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></article>):<p>No messages yet. Learner messages will appear here.</p>}</div><form onSubmit={sendTeacherMessage}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} maxLength={4000} placeholder="Reply to your class…"/><button className="primary-button" type="submit" disabled={!chatDraft.trim()}><Send size={15}/> Send</button></form></div>
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
