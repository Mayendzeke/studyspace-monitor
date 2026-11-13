import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CalendarDays, CheckCircle2, Clock3, FileText, MessageCircle, RefreshCw, Send, Users, Video, BookOpen, ClipboardList, Presentation, Play, Square, PenLine, Eraser, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LiveClassroomCall from './LiveClassroomCall'

type SessionRow = {
  id: string; title: string; subject_name: string; education_level: string; grade: string
  curriculum: string; objectives: string; starts_at: string; status: 'scheduled'|'live'|'ended'|'cancelled'
  duration_minutes: number; meeting_url: string | null; created_by: string
}
type LearnerRow = { id: string; student_id: string | null; full_name: string; preferred_name: string }
type MessageRow = { id: string; sender_id: string; message: string; created_at: string }
type HomeworkRow = { id: string; title: string; instructions: string; due_at: string | null }
type Tab = 'Overview'|'Lesson guide'|'Class chat'|'Homework'|'Shared board'

const tabs: {label:Tab; icon:typeof BookOpen}[] = [
  {label:'Overview',icon:CalendarDays},{label:'Lesson guide',icon:BookOpen},
  {label:'Class chat',icon:MessageCircle},{label:'Homework',icon:ClipboardList},{label:'Shared board',icon:Presentation}
]
const statusLabel = (status: SessionRow['status']) => status === 'live' ? 'LIVE NOW' : status.charAt(0).toUpperCase()+status.slice(1)
const formatDate = (value:string) => new Date(value).toLocaleString([], {weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
const isToday = (value:string) => new Date(value).toDateString() === new Date().toDateString()

export default function MonitorTodaySession({ onCreateLesson }: { onCreateLesson: () => void }) {
  const [sessions,setSessions] = useState<SessionRow[]>([])
  const [activeId,setActiveId] = useState('')
  const [active,setActive] = useState<SessionRow|null>(null)
  const [learners,setLearners] = useState<LearnerRow[]>([])
  const [messages,setMessages] = useState<MessageRow[]>([])
  const [homework,setHomework] = useState<HomeworkRow[]>([])
  const [completedCounts,setCompletedCounts] = useState<Record<string,number>>({})
  const [lessonNotes,setLessonNotes] = useState<{summary:string;keyPoints:string[];workedExample:string;exitQuestion:string}>({summary:'',keyPoints:[],workedExample:'',exitQuestion:''})
  const [boardImage,setBoardImage] = useState('')
  const [adminId,setAdminId] = useState('')
  const [tab,setTab] = useState<Tab>('Overview')
  const [draftMessage,setDraftMessage] = useState('')
  const [loading,setLoading] = useState(true)
  const [refreshing,setRefreshing] = useState(false)
  const [sending,setSending] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [boardTool,setBoardTool] = useState<'pen'|'eraser'>('pen')
  const [boardInk,setBoardInk] = useState('#27324a')
  const [boardNotice,setBoardNotice] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  const refreshSessions = useCallback(async (preserve = true) => {
    if (!supabase) { setError('Studyspace is not connected to the classroom service.'); setLoading(false); return }
    setRefreshing(true); setError('')
    try {
      const {data:auth,error:authError} = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error('Sign in again to load your teaching sessions.')
      setAdminId(auth.user.id)
      const {data,error:queryError} = await supabase.from('class_sessions')
        .select('id,title,subject_name,education_level,grade,curriculum,objectives,starts_at,status,duration_minutes,meeting_url,created_by')
        .eq('created_by',auth.user.id).order('starts_at',{ascending:false}).limit(50)
      if (queryError) throw queryError
      const rows = (data ?? []) as SessionRow[]
      setSessions(rows)
      setActiveId(current => preserve && current && rows.some(row=>row.id===current) ? current :
        (rows.find(row=>row.status==='live')?.id || rows.find(row=>isToday(row.starts_at)&&row.status==='scheduled')?.id ||
         rows.find(row=>row.status==='scheduled')?.id || rows[0]?.id || ''))
    } catch(reason) { setError(reason instanceof Error ? reason.message : 'Teaching sessions could not be loaded.') }
    finally { setLoading(false); setRefreshing(false) }
  },[])

  useEffect(() => {
    void refreshSessions(false)
    if (!supabase) return
    let alive = true
    let channel: ReturnType<typeof supabase.channel>|null = null
    const setup = async () => {
      const {data:{user}} = await supabase!.auth.getUser()
      if (!alive || !user) return
      channel = supabase!.channel('monitor-todays-sessions-'+user.id)
        .on('postgres_changes',{event:'*',schema:'public',table:'class_sessions',filter:'created_by=eq.'+user.id},()=>{if(alive)void refreshSessions(true)})
        .subscribe()
    }
    void setup()
    const timer = window.setInterval(()=>{if(document.visibilityState==='visible')void refreshSessions(true)},30000)
    const onFocus=()=>{if(document.visibilityState==='visible')void refreshSessions(true)}
    window.addEventListener('focus',onFocus)
    return ()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);if(channel)void supabase!.removeChannel(channel)}
  },[refreshSessions])

  useEffect(() => {
    if (!activeId || !supabase) {
      setActive(null);setLearners([]);setMessages([]);setHomework([]);setCompletedCounts({});setBoardImage('')
      setLessonNotes({summary:'',keyPoints:[],workedExample:'',exitQuestion:''})
      return
    }
    let alive=true
    let channel: ReturnType<typeof supabase.channel>|null=null
    const load = async () => {
      const [sessionResult,memberResult,messageResult,noteResult,homeworkResult,boardResult] = await Promise.all([
        supabase!.from('class_sessions').select('id,title,subject_name,education_level,grade,curriculum,objectives,starts_at,status,duration_minutes,meeting_url,created_by').eq('id',activeId).single(),
        supabase!.from('class_session_members').select('learner_id').eq('session_id',activeId),
        supabase!.from('session_messages').select('id,sender_id,message,created_at').eq('session_id',activeId).order('created_at'),
        supabase!.from('session_lesson_notes').select('summary,key_points,worked_example,exit_question').eq('session_id',activeId).maybeSingle(),
        supabase!.from('session_homework').select('id,title,instructions,due_at').eq('session_id',activeId).order('created_at'),
        supabase!.from('session_whiteboards').select('board_state').eq('session_id',activeId).maybeSingle()
      ])
      if (!alive) return
      if (sessionResult.error || !sessionResult.data) throw sessionResult.error || new Error('This lesson is no longer available.')
      setActive(sessionResult.data as SessionRow)
      const memberIds=(memberResult.data??[]).map(row=>row.learner_id).filter(Boolean)
      if (memberIds.length) {
        const {data:profiles,error:profileError}=await supabase!.from('profiles').select('id,student_id,full_name,preferred_name').in('id',memberIds)
        if (profileError) throw profileError
        if (alive) setLearners((profiles??[]) as LearnerRow[])
      } else setLearners([])
      setMessages((messageResult.data??[]) as MessageRow[])
      setLessonNotes({summary:noteResult.data?.summary||'',keyPoints:Array.isArray(noteResult.data?.key_points)?noteResult.data.key_points:[],workedExample:noteResult.data?.worked_example||'',exitQuestion:noteResult.data?.exit_question||''})
      const tasks=(homeworkResult.data??[]) as HomeworkRow[]
      setHomework(tasks)
      if (tasks.length) {
        const {data:submissions,error:submissionError}=await supabase!.from('session_homework_submissions').select('homework_id,learner_id,completed_at').in('homework_id',tasks.map(item=>item.id))
        if (submissionError) throw submissionError
        const counts:Record<string,number>={}
        for(const row of submissions??[]) if(row.completed_at) counts[row.homework_id]=(counts[row.homework_id]||0)+1
        if (alive) setCompletedCounts(counts)
      } else setCompletedCounts({})
      setBoardImage((boardResult.data?.board_state as {imageData?:string}|null)?.imageData||'')
      channel=supabase!.channel('monitor-session-workspace-'+activeId)
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'class_sessions',filter:'id=eq.'+activeId},payload=>{
          if(!alive)return
          const row=payload.new as SessionRow
          setActive(current=>current?{...current,...row}:row)
          setSessions(current=>current.map(item=>item.id===row.id?{...item,...row}:item))
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'session_messages',filter:'session_id=eq.'+activeId},payload=>{
          if(!alive)return
          const row=payload.new as MessageRow
          setMessages(current=>current.some(item=>item.id===row.id)?current:[...current,row])
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'session_whiteboards',filter:'session_id=eq.'+activeId},payload=>{
          if(!alive)return
          setBoardImage((payload.new as {board_state?:{imageData?:string}}).board_state?.imageData||'')
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'session_homework',filter:'session_id=eq.'+activeId},()=>{if(alive)void load()})
        .subscribe()
    }
    void load().catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:'Session details could not be loaded.')})
    return ()=>{alive=false;if(channel&&supabase)void supabase.removeChannel(channel)}
  },[activeId])


  useEffect(() => {
    const canvas=canvasRef.current
    if(!canvas)return
    const context=canvas.getContext('2d')
    if(!context)return
    context.fillStyle='#ffffff'
    context.fillRect(0,0,canvas.width,canvas.height)
    if(!boardImage)return
    const image=new Image()
    image.onload=()=>{if(canvasRef.current&&!drawingRef.current){const ctx=canvasRef.current.getContext('2d');ctx?.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);ctx?.drawImage(image,0,0,canvasRef.current.width,canvasRef.current.height)}}
    image.src=boardImage
  },[boardImage,activeId])

  function boardPoint(event:ReactPointerEvent<HTMLCanvasElement>){
    const canvas=canvasRef.current!
    const rect=canvas.getBoundingClientRect()
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}
  }
  function startBoardDraw(event:ReactPointerEvent<HTMLCanvasElement>){
    const canvas=canvasRef.current
    const context=canvas?.getContext('2d')
    if(!canvas||!context)return
    drawingRef.current=true
    canvas.setPointerCapture(event.pointerId)
    const point=boardPoint(event)
    context.beginPath();context.moveTo(point.x,point.y)
    context.strokeStyle=boardTool==='eraser'?'#ffffff':boardInk
    context.lineWidth=boardTool==='eraser'?24:3
    context.lineCap='round';context.lineJoin='round'
  }
  function continueBoardDraw(event:ReactPointerEvent<HTMLCanvasElement>){
    if(!drawingRef.current)return
    const context=canvasRef.current?.getContext('2d')
    if(!context)return
    const point=boardPoint(event);context.lineTo(point.x,point.y);context.stroke()
  }
  async function saveBoard(){
    const canvas=canvasRef.current
    if(!canvas||!active||!supabase||!adminId)return
    const imageData=canvas.toDataURL('image/jpeg',0.55)
    setBoardNotice('Saving shared board…')
    const {error:saveError}=await supabase.from('session_whiteboards').upsert({session_id:active.id,board_state:{version:1,imageData},updated_by:adminId,updated_at:new Date().toISOString()},{onConflict:'session_id'})
    if(saveError){setBoardNotice('The shared board could not be saved. Your drawing remains here; reconnect and save again.');return}
    setBoardImage(imageData);setBoardNotice('Shared board saved. Learners can see the update in Today’s Session.')
  }
  function stopBoardDraw(){
    if(!drawingRef.current)return
    drawingRef.current=false
    void saveBoard()
  }
  async function clearBoard(){
    const canvas=canvasRef.current
    const context=canvas?.getContext('2d')
    if(!canvas||!context)return
    context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height)
    await saveBoard()
  }

  const changeStatus = async (status:'live'|'ended') => {
    if(!supabase||!active)return
    setNotice('')
    const {error:changeError}=await supabase.from('class_sessions').update({status,meeting_ready_at:null,updated_at:new Date().toISOString()}).eq('id',active.id).eq('created_by',adminId)
    if(changeError){setError('Session status could not be changed: '+changeError.message);return}
    setActive(current=>current?{...current,status}:current)
    setSessions(current=>current.map(item=>item.id===active.id?{...item,status}:item))
    setNotice(status==='live'?'Your class is live. Assigned learners can now join from Today’s Session.':'This class has ended. Learners can still access its lesson guide and homework.')
  }

  const sendMessage = async (event:React.FormEvent) => {
    event.preventDefault()
    if(!supabase||!active||!adminId||!draftMessage.trim())return
    setSending(true)
    const {error:sendError}=await supabase.from('session_messages').insert({session_id:active.id,sender_id:adminId,message:draftMessage.trim()})
    if(sendError)setError('Message could not be sent: '+sendError.message)
    else setDraftMessage('')
    setSending(false)
  }

  const todaySessions=sessions.filter(row=>isToday(row.starts_at))
  const selectedTab = (next:Tab) => setTab(next)

  return <div className="monitor-today-page">
    <div className="monitor-today-heading">
      <div><span className="eyebrow"><Video size={14}/> TEACHING WORKSPACE</span><h1>Today's <span>Session</span></h1><p className="page-subtitle">Run your live lessons and stay in sync with each learner’s classroom workspace.</p></div>
      <div className="monitor-today-heading-actions"><button className="subtle-button" type="button" onClick={()=>void refreshSessions(true)} disabled={refreshing}><RefreshCw size={15}/> Refresh</button><button className="primary-button" type="button" onClick={onCreateLesson}><BookOpen size={15}/> Build a lesson</button></div>
    </div>
    <div className="monitor-today-metrics">
      <article><span>Today's lessons</span><strong>{todaySessions.length}</strong><small>Scheduled for today</small></article>
      <article><span>Live now</span><strong>{sessions.filter(row=>row.status==='live').length}</strong><small>Students can join these rooms</small></article>
      <article><span>Assigned learners</span><strong>{learners.length}</strong><small>In the selected session</small></article>
      <article><span>Lesson duration</span><strong>{active?.duration_minutes||0}<small> min</small></strong><small>For the selected class</small></article>
    </div>
    {error&&<div className="monitor-today-alert" role="alert">{error}</div>}
    {notice&&<div className="monitor-today-notice" role="status">{notice}</div>}
    {loading?<div className="monitor-today-empty"><RefreshCw size={22}/>Loading your teaching sessions…</div>:sessions.length===0?<div className="monitor-today-empty"><CalendarDays size={28}/><strong>No published sessions yet</strong><p>Build a lesson in Classroom Studio, select the learners, then publish it. It will appear here and in each learner’s Today’s Session tab.</p><button className="primary-button" onClick={onCreateLesson}><BookOpen size={15}/> Create your first lesson</button></div>:<>
      <div className="monitor-today-layout">
        <aside className="monitor-today-list panel">
          <div className="panel-heading"><div><h2>My sessions</h2><p>{sessions.length} published lesson(s)</p></div><CalendarDays size={18}/></div>
          {sessions.map(row=><button type="button" key={row.id} className={'monitor-today-session-item'+(activeId===row.id?' active':'')} onClick={()=>setActiveId(row.id)}>
            <span className={'monitor-session-status '+row.status}>{statusLabel(row.status)}</span><strong>{row.title}</strong><span>{row.subject_name} · {row.grade||row.education_level}</span><small><Clock3 size={12}/>{formatDate(row.starts_at)}</small>
          </button>)}
        </aside>
        <section className="monitor-today-detail">
          {active&&<>
            <div className="monitor-today-session-header panel">
              <div><span className={'monitor-session-status '+active.status}>{statusLabel(active.status)}</span><h2>{active.title}</h2><p>{active.subject_name} · {active.education_level} · {active.grade}</p><small><CalendarDays size={13}/>{formatDate(active.starts_at)} · {active.duration_minutes} minutes</small></div>
              <div className="monitor-today-session-actions">
                {active.status==='scheduled'&&<button className="primary-button" onClick={()=>void changeStatus('live')}><Play size={15}/> Start live class</button>}
                {active.status==='live'&&<button className="danger-button" onClick={()=>void changeStatus('ended')}><Square size={14}/> End class</button>}
                {active.status==='ended'&&<span className="monitor-session-ended"><CheckCircle2 size={15}/> Session ended</span>}
              </div>
            </div>
            {active.status==='live'&&<div className="monitor-today-video panel"><LiveClassroomCall key={active.id} sessionId={active.id} audience="teacher"/></div>}
            <div className="monitor-today-tabs" role="tablist" aria-label="Session workspace">{tabs.map(item=><button type="button" role="tab" aria-selected={tab===item.label} className={tab===item.label?'active':''} key={item.label} onClick={()=>selectedTab(item.label)}><item.icon size={15}/>{item.label}</button>)}</div>
            {tab==='Overview'&&<div className="monitor-today-overview-grid">
              <section className="panel monitor-today-panel"><h3><Users size={16}/> Learners in this class</h3>{learners.length?<div className="monitor-today-roster">{learners.map(learner=><div key={learner.id}><span className="monitor-roster-avatar">{(learner.preferred_name||learner.full_name||'L').slice(0,1).toUpperCase()}</span><span><strong>{learner.preferred_name||learner.full_name}</strong><small>{learner.student_id||'StudySpace learner'}</small></span></div>)}</div>:<p className="monitor-today-muted">No learners are attached to this session.</p>}</section>
              <section className="panel monitor-today-panel"><h3><FileText size={16}/> Lesson objectives</h3><p>{active.objectives||'No objectives have been added to this lesson yet.'}</p><div className="monitor-today-mini-stats"><span><b>{learners.length}</b> learners</span><span><b>{homework.length}</b> homework task(s)</span><span><b>{messages.length}</b> class message(s)</span></div></section>
            </div>}
            {tab==='Lesson guide'&&<section className="panel monitor-today-panel"><h3><BookOpen size={16}/> Shared lesson guide</h3>{lessonNotes.summary?<><p>{lessonNotes.summary}</p>{lessonNotes.keyPoints.length>0&&<><h4>Key points</h4><ul>{lessonNotes.keyPoints.map((point,index)=><li key={index}>{point}</li>)}</ul></>}{lessonNotes.workedExample&&<><h4>Worked example</h4><p>{lessonNotes.workedExample}</p></>}{lessonNotes.exitQuestion&&<><h4>Check for understanding</h4><p>{lessonNotes.exitQuestion}</p></>}</>:<p className="monitor-today-muted">The lesson guide has not been published yet. Add or publish notes in Classroom Studio.</p>}</section>}
            {tab==='Class chat'&&<section className="panel monitor-today-panel monitor-today-chat"><h3><MessageCircle size={16}/> Shared class chat</h3><div className="monitor-today-message-list">{messages.length?messages.map(message=><article key={message.id} className={message.sender_id===adminId?'mine':''}><strong>{message.sender_id===adminId?'You':learners.find(learner=>learner.id===message.sender_id)?.preferred_name||learners.find(learner=>learner.id===message.sender_id)?.full_name||'Learner'}</strong><p>{message.message}</p><small>{new Date(message.created_at).toLocaleString([], {dateStyle:'short',timeStyle:'short'})}</small></article>):<div className="monitor-today-muted">No class messages yet. Students’ messages will appear here.</div>}</div><form className="monitor-today-compose" onSubmit={sendMessage}><input value={draftMessage} onChange={event=>setDraftMessage(event.target.value)} maxLength={2000} placeholder="Reply to your class…" aria-label="Class message"/><button className="primary-button" type="submit" disabled={!draftMessage.trim()||sending}><Send size={15}/>{sending?'Sending…':'Send'}</button></form></section>}
            {tab==='Homework'&&<section className="panel monitor-today-panel"><h3><ClipboardList size={16}/> Teacher-assigned homework</h3>{homework.length?homework.map(item=><article className="monitor-today-homework" key={item.id}><div><strong>{item.title}</strong><p>{item.instructions||'No additional instructions.'}</p><small>{item.due_at?'Due '+formatDate(item.due_at):'No due date'}</small></div><span>{(completedCounts[item.id]||0)+' / '+learners.length+' learners completed'}</span></article>):<p className="monitor-today-muted">No homework has been assigned for this lesson yet.</p>}</section>}
            {tab==='Shared board'&&<section className="panel monitor-today-panel"><h3><Presentation size={16}/> Shared worksheet / whiteboard</h3><div className="monitor-board-tools"><button type="button" className={boardTool==='pen'?'selected':''} onClick={()=>setBoardTool('pen')}><PenLine size={14}/> Pen</button><button type="button" className={boardTool==='eraser'?'selected':''} onClick={()=>setBoardTool('eraser')}><Eraser size={14}/> Eraser</button><input aria-label="Board pen colour" type="color" value={boardInk} onChange={event=>setBoardInk(event.target.value)}/><button type="button" onClick={()=>void clearBoard()}>Clear board</button><button type="button" className="primary-button" onClick={()=>void saveBoard()}><Save size={14}/> Save</button></div><div className="monitor-board-canvas-wrap"><canvas ref={canvasRef} width={1200} height={680} onPointerDown={startBoardDraw} onPointerMove={continueBoardDraw} onPointerUp={stopBoardDraw} onPointerCancel={stopBoardDraw} onPointerLeave={stopBoardDraw} aria-label="Shared classroom whiteboard"/></div><p className="monitor-today-muted">Draw here or erase parts of the board. Saved changes are shared with the students assigned to this lesson.</p>{boardNotice&&<p className="monitor-today-muted" role="status">{boardNotice}</p></section>}
          </>}
        </section>
      </div>
    </>}
  </div>
}
