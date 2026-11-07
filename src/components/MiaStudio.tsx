import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, Brain, BookOpen, CalendarDays, GraduationCap, Lightbulb, MessageCircle, Send, Sparkles, Trash2, ClipboardCheck, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type AcademicProfile = { id: string; education_level: string | null; grade: string | null; curriculum: string | null; course: string | null }
type SubjectRow = { learner_id: string; name: string }
type MiaActivity = 'lesson' | 'assessment' | 'schedule' | 'worksheet' | 'teaching' | 'support'
type LessonHandoff = { title: string; subject: string; level: string; grade: string; course: string; curriculum: string; duration: number; content: string }
const lessonHandoffKey = 'studyspace-monitor-mia-lesson-handoff-v1'
type GuidedDraft = {
  level: string
  grade: string
  course: string
  subject: string
  curriculum: string
  topic: string
  duration: string
  approach: string
  assessmentType: string
  marks: string
  studyHours: string
  studyDays: string
  supportFocus: string
  resourceStyle: string
  worksheetType: string
  questionCount: string
}
const welcome: ChatMessage = {
  id: 'mia-welcome',
  role: 'assistant',
  content: "Hello. I'm MIA — Mayendzeke's Artificial Intelligence. Choose a guided task to prepare a lesson, assessment, worksheet, study plan or learner-support strategy. I will use the academic options already recorded in StudySpace where available.",
}
const activities = [
  { id: 'lesson' as const, icon: BookOpen, title: 'Prepare a lesson', description: 'Build lesson objectives, teaching steps, activities, timings and a quick assessment.' },
  { id: 'assessment' as const, icon: ClipboardCheck, title: 'Create an assessment', description: 'Generate age-appropriate questions, marks, an answer key and marking guidance.' },
  { id: 'schedule' as const, icon: CalendarDays, title: 'Plan a study schedule', description: 'Create a realistic weekly revision plan around the learner’s level and study hours.' },
  { id: 'worksheet' as const, icon: FileText, title: 'Make a worksheet', description: 'Prepare practice questions, worked examples and answers for a selected topic.' },
  { id: 'teaching' as const, icon: Lightbulb, title: 'Find teaching ideas', description: 'Explore practical, engaging activities and low-cost teaching resources.' },
  { id: 'support' as const, icon: GraduationCap, title: 'Plan learner support', description: 'Create a focused support plan for a topic, skill gap or exam-preparation need.' },
]
const standardLevels = ['Primary school', 'Secondary school', 'High school / Sixth form', 'College', 'University']
const commonSubjects = ['Mathematics', 'English', 'Siswati', 'Science', 'Biology', 'Chemistry', 'Physics', 'Agriculture', 'ICT / Computer Science', 'Geography', 'History', 'Business Studies', 'Economics', 'Accounting', 'French', 'Literature']
const curriculumDefaults = ['Eswatini National Curriculum', 'Cambridge IGCSE', 'Cambridge International AS & A Level', 'CAPS', 'International Baccalaureate (IB)', 'Pearson Edexcel']
const initialGuided = (): GuidedDraft => ({
  level: '', grade: '', course: '', subject: '', curriculum: '', topic: '', duration: '45',
  approach: 'Interactive explanation and guided practice', assessmentType: 'Class test', marks: '30',
  studyHours: '5', studyDays: '5 days', supportFocus: 'Understanding a difficult topic',
  resourceStyle: 'Low-cost resources', worksheetType: 'Practice worksheet', questionCount: '10',
})
const storageKey = (userId: string) => 'studyspace-monitor-mia-chat:' + userId
function loadMessages(userId: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]')
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((item): item is ChatMessage =>
        item && typeof item.id === 'string' && ['user', 'assistant'].includes(item.role)
        && typeof item.content === 'string'
      ).slice(-30)
      if (valid.length) return valid
    }
  } catch { /* Start a clean local conversation if storage is unavailable. */ }
  return [welcome]
}
async function edgeError(reason: unknown): Promise<string> {
  const context = reason && typeof reason === 'object' && 'context' in reason
    ? (reason as { context?: unknown }).context : undefined
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown }
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
    } catch { /* Fall through to the original error. */ }
    return 'MIA could not complete the request (HTTP ' + context.status + ').'
  }
  return reason instanceof Error ? reason.message : 'MIA could not complete the request. Check your connection and try again.'
}
const unique = (values: (string | null | undefined)[]) => Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => !!value))).sort((a, b) => a.localeCompare(b))

export default function MiaStudio() {
  const [userId, setUserId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([welcome])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [profiles, setProfiles] = useState<AcademicProfile[]>([])
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([])
  const [profileNotice, setProfileNotice] = useState('')
  const [activeGuide, setActiveGuide] = useState<MiaActivity | null>(null)
  const [guided, setGuided] = useState<GuidedDraft>(initialGuided)
  const [subjectManual, setSubjectManual] = useState(false)
  const [curriculumManual, setCurriculumManual] = useState(false)
  const [lessonHandoff, setLessonHandoff] = useState<LessonHandoff | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    async function restore() {
      if (!supabase) { setError('StudySpace is not connected to its secure AI service.'); return }
      const [{ data, error: authError }, { data: profileData, error: profileError }, { data: subjectsData, error: subjectsError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id,education_level,grade,curriculum,course').eq('role', 'learner').eq('account_status', 'active'),
        supabase.from('student_subjects').select('learner_id,name').order('name'),
      ])
      if (!alive) return
      if (authError || !data.user) { setError('Sign in again to use MIA.'); return }
      setUserId(data.user.id)
      setMessages(loadMessages(data.user.id))
      if (!profileError) setProfiles((profileData ?? []) as AcademicProfile[])
      else setProfileNotice('Some learner profile options could not be loaded. Standard education-level options are still available.')
      if (!subjectsError) setSubjectRows(((subjectsData ?? []) as SubjectRow[]).filter(row => !!row.name?.trim()))
      else setProfileNotice('Registered subject options could not be loaded. You can still choose a common subject or enter one manually.')
    }
    void restore()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    if (!activeGuide) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveGuide(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape) }
  }, [activeGuide])

  const saveMessages = (next: ChatMessage[]) => {
    setMessages(next)
    if (userId) {
      try { localStorage.setItem(storageKey(userId), JSON.stringify(next.slice(-30))) }
      catch { /* The conversation remains available for this session. */ }
    }
  }

  const sendMessage = async (value: string, includeHistory = true, lessonContext?: Omit<LessonHandoff, 'content'>) => {
    const clean = value.trim()
    if (!clean || busy || !supabase || !userId) return
    setError('')
    setDraft('')
    setBusy(true)
    const previousMessages = messages
    const history = includeHistory ? previousMessages.filter(item => item.id !== 'mia-welcome').slice(-12) : []
    const next = [...previousMessages, { id: crypto.randomUUID(), role: 'user' as const, content: clean }]
    saveMessages(next)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('mia-monitor-assistant', {
        body: { message: clean, history: history.map(item => ({ role: item.role, content: item.content })) },
      })
      if (invokeError) throw new Error(await edgeError(invokeError))
      if (!data?.success || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'MIA did not return a usable response.')
      }
      const completed = [...next, { id: crypto.randomUUID(), role: 'assistant' as const, content: data.reply }]
      saveMessages(completed)
      if (lessonContext) setLessonHandoff({ ...lessonContext, content: data.reply })
      setRemaining(typeof data.remainingDailyRequests === 'number' ? data.remainingDailyRequests : null)
    } catch (reason) {
      setError(await edgeError(reason))
      setDraft(clean)
      saveMessages(previousMessages)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    await sendMessage(draft)
  }

  const openGuide = (activity: MiaActivity) => {
    setGuided(initialGuided())
    setSubjectManual(false)
    setCurriculumManual(false)
    setActiveGuide(activity)
  }

  const guideProfiles = useMemo(() => {
    const levelRows = profiles.filter(item => item.education_level === guided.level)
    const courseRows = guided.course ? levelRows.filter(item => item.course === guided.course) : levelRows
    return guided.grade ? courseRows.filter(item => item.grade === guided.grade) : courseRows
  }, [profiles, guided.level, guided.course, guided.grade])
  const levelOptions = unique([...standardLevels, ...profiles.map(item => item.education_level)])
  const levelRows = profiles.filter(item => item.education_level === guided.level)
  const courseOptions = unique(levelRows.map(item => item.course))
  const courseRows = guided.course ? levelRows.filter(item => item.course === guided.course) : levelRows
  const gradeOptions = unique(courseRows.map(item => item.grade))
  const scopedRows = guided.grade ? courseRows.filter(item => item.grade === guided.grade) : courseRows
  const scopedIds = new Set(scopedRows.map(item => item.id))
  const registeredSubjects = unique(subjectRows.filter(item => scopedIds.has(item.learner_id)).map(item => item.name))
  const subjectOptions = unique([...registeredSubjects, ...commonSubjects])
  const curriculumOptions = unique([...scopedRows.map(item => item.curriculum), ...curriculumDefaults])

  const setGuideField = (patch: Partial<GuidedDraft>) => setGuided(current => ({ ...current, ...patch }))
  const buildGuidedRequest = () => {
    const activity = activities.find(item => item.id === activeGuide)
    const academic = [
      guided.level && 'Education level: ' + guided.level,
      guided.grade && 'Grade / year: ' + guided.grade,
      guided.course && 'Course / programme: ' + guided.course,
      guided.subject && 'Subject / module: ' + guided.subject,
      guided.curriculum && 'Curriculum / syllabus: ' + guided.curriculum,
      guided.topic.trim() && 'Topic / learning focus: ' + guided.topic.trim(),
    ].filter(Boolean).join('\n')
    let requirements = ''
    if (activeGuide === 'lesson') requirements = 'Prepare a complete ' + guided.duration + '-minute lesson. Teaching approach: ' + guided.approach + '. Include measurable learning objectives, a timed lesson sequence, teacher and learner activities, suitable resources, differentiation for varied ability levels, a short formative assessment with answers, and optional homework.'
    if (activeGuide === 'assessment') requirements = 'Create a ' + guided.assessmentType.toLowerCase() + ' worth ' + guided.marks + ' marks. Include clear instructions, a balanced range of question types and difficulty, marks per question, a complete answer key and a practical marking guide.'
    if (activeGuide === 'schedule') requirements = 'Create a realistic weekly study and revision schedule for ' + guided.studyHours + ' hours per week across ' + guided.studyDays + '. Include focused blocks, short breaks, spaced review, practice questions and a weekly progress check. Do not invent school timetable details.'
    if (activeGuide === 'worksheet') requirements = 'Create a ' + guided.worksheetType.toLowerCase() + ' with ' + guided.questionCount + ' questions. Use age-appropriate language, a gradual increase in difficulty, worked examples where useful, and a complete answer key.'
    if (activeGuide === 'teaching') requirements = 'Suggest at least five practical ways to teach this topic. Resource preference: ' + guided.resourceStyle + '. Include a short activity sequence, materials, learner participation, differentiation and a quick way to check understanding.'
    if (activeGuide === 'support') requirements = 'Design a supportive teaching and learning plan. Main need: ' + guided.supportFocus + '. Include likely learning barriers, a short intervention sequence, accessible practice, ways to check progress and next steps. Avoid labelling or making assumptions about a learner.'
    return 'Act as MIA, the StudySpace teaching assistant. Use the following selected academic context and do not ask me to re-enter it:\n' + (academic || 'Education context not yet specified.') + '\n\nTask: ' + (activity?.title || 'Teaching support') + '\n' + requirements + '\n\nWrite in clear, well-structured sections. Keep the material age-appropriate and practical. State any assumptions and ask only for information that is genuinely essential. Do not invent curriculum requirements.'
  }
  const submitGuide = () => {
    if (!activeGuide || !guided.topic.trim()) return
    const prompt = buildGuidedRequest()
    const lessonContext = activeGuide === 'lesson' ? {
      title: guided.topic.trim(), subject: guided.subject, level: guided.level, grade: guided.grade,
      course: guided.course, curriculum: guided.curriculum, duration: Number(guided.duration) || 45,
    } : undefined
    setLessonHandoff(null)
    setActiveGuide(null)
    void sendMessage(prompt, false, lessonContext)
  }

  const openLessonInClassroom = () => {
    if (!lessonHandoff) return
    try {
      localStorage.setItem(lessonHandoffKey, JSON.stringify({ ...lessonHandoff, createdAt: new Date().toISOString() }))
      setLessonHandoff(null)
      window.dispatchEvent(new CustomEvent('studyspace-open-classroom-studio'))
    } catch {
      setError('The lesson draft could not be handed to Classroom Studio. Check browser storage and try again.')
    }
  }

  const clearConversation = () => {
    saveMessages([welcome])
    setError('')
  }

  return (
    <section className="mia-page">
      <div className="mia-hero">
        <div className="mia-brand-mark"><Sparkles size={25}/></div>
        <div className="mia-hero-copy">
          <span className="eyebrow">MAYENDZEKE'S ARTIFICIAL INTELLIGENCE</span>
          <h1>MIA <span>· Your StudySpace companion</span></h1>
          <p>Your teaching assistant for lesson planning, assessments, worksheets, study schedules and learner support. Choose an activity and complete a few selections; type only the topic or details that are not already in StudySpace.</p>
        </div>
        <div className="mia-availability"><i/> Administrator assistant</div>
      </div>

      <div className="mia-capabilities">
        <article><BookOpen size={18}/><strong>Lesson preparation</strong><span>Objectives, timed teaching steps, learner activities, differentiation and checks for understanding.</span></article>
        <article><Brain size={18}/><strong>Assessments</strong><span>Quizzes, class tests, exam practice, answer keys and marking guidance.</span></article>
        <article><GraduationCap size={18}/><strong>Learner support</strong><span>Targeted intervention ideas, revision plans and support for difficult topics.</span></article>
        <article><MessageCircle size={18}/><strong>StudySpace guidance</strong><span>Help with teaching workflows, classroom preparation and practical admin questions.</span></article>
      </div>

      <div className="mia-workspace">
        <div className="mia-chat-heading">
          <div><strong><Bot size={18}/> MIA conversation</strong><small>Choose a guided task below, or type a custom request when you need to.</small></div>
          <div className="mia-chat-tools">
            {remaining !== null && <span className="mia-remaining">{remaining} requests left today</span>}
            <button type="button" className="secondary-button" onClick={clearConversation}><Trash2 size={14}/> Clear chat</button>
          </div>
        </div>

        <div className="mia-guided-launch">
          <div><strong>Start a guided task</strong><span>These options stay available while you chat with MIA.</span></div>
          <div className="mia-prompt-grid">
            {activities.map(({ id, icon: Icon, title, description }) => (
              <button type="button" key={id} className="mia-prompt-card" onClick={() => openGuide(id)}>
                <span><Icon size={18}/></span><strong>{title}</strong><small>{description}</small><em>Choose options <span aria-hidden="true">→</span></em>
              </button>
            ))}
          </div>
        </div>

        <div className="mia-message-list" ref={scrollRef} aria-live="polite">
          {messages.map(item => (
            <article key={item.id} className={'mia-message mia-message-' + item.role}>
              <span className="mia-message-avatar">{item.role === 'assistant' ? <Sparkles size={15}/> : 'You'}</span>
              <div className="mia-message-bubble">
                <small>{item.role === 'assistant' ? 'MIA' : 'YOU'}</small>
                <p>{item.content}</p>
              </div>
            </article>
          ))}
          {busy && <article className="mia-message mia-message-assistant"><span className="mia-message-avatar"><Sparkles size={15}/></span><div className="mia-message-bubble"><small>MIA</small><p className="mia-thinking">Preparing your response…</p></div></article>}
        </div>

        {lessonHandoff && <div className="mia-lesson-handoff"><div><strong><BookOpen size={16}/> Your lesson draft is ready</strong><p>MIA has prepared the lesson content. Open it in Classroom Studio to edit, save locally or publish it to selected learners.</p></div><button type="button" className="primary-button" onClick={openLessonInClassroom}>Create in Classroom Studio <span aria-hidden="true">→</span></button></div>}
        {error && <p className="mia-error" role="alert">{error}</p>}
        {profileNotice && <p className="mia-profile-notice" role="status">{profileNotice}</p>}
        <form className="mia-compose" onSubmit={send}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(draft) } }}
            placeholder="Only for a custom request or a detail that is not available in the options above…"
            rows={2}
            maxLength={4000}
            disabled={busy || !userId}
            aria-label="Custom message to MIA"
          />
          <div className="mia-compose-footer">
            <span>Enter to send · Shift + Enter for a new line · Do not include learner names, IDs or private personal information.</span>
            <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !userId}><Send size={15}/>{busy ? 'Working…' : 'Send to MIA'}</button>
          </div>
        </form>
        <p className="mia-disclaimer">Guided choices use academic profile details and registered subjects already in StudySpace. Only the selected level, grade, course, subject and curriculum are included in the request; learner names and IDs are not sent. MIA does not change accounts, subscriptions, timetables or assessments. Review generated teaching material before sharing it.</p>
      </div>

      {activeGuide && (
        <div className="mia-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveGuide(null) }}>
          <section className="mia-guided-dialog" role="dialog" aria-modal="true" aria-labelledby="mia-guided-title">
            <header className="mia-guided-header">
              <div><span className="eyebrow">MIA GUIDED WORKSPACE</span><h2 id="mia-guided-title">{activities.find(item => item.id === activeGuide)?.title}</h2><p>Choose from information already recorded in StudySpace. Only the topic needs to be typed to start.</p></div>
              <button type="button" className="mia-dialog-close" onClick={() => setActiveGuide(null)} aria-label="Close guided workspace"><X size={19}/></button>
            </header>
            <div className="mia-guided-body">
              <div className="mia-guided-section-title"><strong>Academic context</strong><span>Options from active learner profiles</span></div>
              <div className="mia-guided-grid">
                <label>Education level<select value={guided.level} onChange={event => { setSubjectManual(false); setCurriculumManual(false); setGuideField({ level: event.target.value, grade: '', course: '', subject: '', curriculum: '' }) }}><option value="">Choose education level</option>{levelOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                {['College', 'University'].includes(guided.level) && <label>Course / programme<select value={guided.course} onChange={event => setGuideField({ course: event.target.value, grade: '', subject: '', curriculum: '' })}><option value="">All courses / programmes</option>{courseOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>}
                <label>{guided.level === 'Primary school' ? 'Grade / class' : guided.level === 'Secondary school' ? 'Form / grade' : ['College', 'University'].includes(guided.level) ? 'Year of study' : 'Grade / year'}<select value={guided.grade} onChange={event => setGuideField({ grade: event.target.value, subject: '', curriculum: '' })} disabled={!guided.level}><option value="">Any grade / year</option>{gradeOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                <label>Subject / module<select value={subjectManual ? '__other__' : guided.subject} onChange={event => { const other = event.target.value === '__other__'; setSubjectManual(other); setGuideField({ subject: other ? '' : event.target.value }) }} disabled={!guided.level}><option value="">Choose a subject</option>{subjectOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>
                {subjectManual && <label>Enter subject / module<input value={guided.subject} onChange={event => setGuideField({ subject: event.target.value })} placeholder="Type the subject or module"/></label>}
                <label>Curriculum / syllabus<select value={curriculumManual ? '__other__' : guided.curriculum} onChange={event => { const other = event.target.value === '__other__'; setCurriculumManual(other); setGuideField({ curriculum: other ? '' : event.target.value }) }}><option value="">Choose a curriculum</option>{curriculumOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>
                {curriculumManual && <label>Enter curriculum / syllabus<input value={guided.curriculum} onChange={event => setGuideField({ curriculum: event.target.value })} placeholder="Type the curriculum or syllabus"/></label>}
              </div>
              <p className="mia-guided-hint">{guideProfiles.length ? 'These selections match ' + guideProfiles.length + ' active learner profile(s). Registered subjects for this group are included above.' : 'No matching learner profiles are recorded for this combination yet. You can still choose common subjects and continue.'}</p>

              <div className="mia-guided-section-title"><strong>What should MIA work on?</strong><span>One required detail</span></div>
              <label className="mia-guided-topic">Topic / learning focus<input autoFocus value={guided.topic} onChange={event => setGuideField({ topic: event.target.value })} placeholder="e.g. Linear equations, photosynthesis, essay writing" required/></label>

              {activeGuide === 'lesson' && <div className="mia-guided-grid mia-guided-options"><label>Lesson duration<select value={guided.duration} onChange={event => setGuideField({ duration: event.target.value })}>{['30','45','60','75','90','120'].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Teaching approach<select value={guided.approach} onChange={event => setGuideField({ approach: event.target.value })}>{['Interactive explanation and guided practice','Direct instruction','Discussion and collaborative learning','Practical / hands-on activity','Revision and exam preparation','Project-based learning'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'assessment' && <div className="mia-guided-grid mia-guided-options"><label>Assessment type<select value={guided.assessmentType} onChange={event => setGuideField({ assessmentType: event.target.value })}>{['Class test','Short quiz','Diagnostic assessment','End-of-topic test','Exam practice','Practical assessment'].map(value => <option key={value}>{value}</option>)}</select></label><label>Total marks<select value={guided.marks} onChange={event => setGuideField({ marks: event.target.value })}>{['10','15','20','30','40','50','60','80','100'].map(value => <option key={value} value={value}>{value} marks</option>)}</select></label></div>}
              {activeGuide === 'schedule' && <div className="mia-guided-grid mia-guided-options"><label>Study hours per week<select value={guided.studyHours} onChange={event => setGuideField({ studyHours: event.target.value })}>{['2','3','4','5','6','8','10','12','15'].map(value => <option key={value}>{value}</option>)}</select></label><label>Available study days<select value={guided.studyDays} onChange={event => setGuideField({ studyDays: event.target.value })}>{['2 days','3 days','4 days','5 days','6 days','7 days'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'teaching' && <div className="mia-guided-grid mia-guided-options"><label>Resource preference<select value={guided.resourceStyle} onChange={event => setGuideField({ resourceStyle: event.target.value })}>{['Low-cost resources','No special equipment','Digital / technology-supported','Hands-on materials','A mix of approaches'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'support' && <div className="mia-guided-grid mia-guided-options"><label>Main support need<select value={guided.supportFocus} onChange={event => setGuideField({ supportFocus: event.target.value })}>{['Understanding a difficult topic','Building foundational skills','Exam preparation and revision','Improving confidence and participation','Catching up after missed lessons','Extension for an advanced learner'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'worksheet' && <div className="mia-guided-grid mia-guided-options"><label>Worksheet type<select value={guided.worksheetType} onChange={event => setGuideField({ worksheetType: event.target.value })}>{['Practice worksheet','Revision worksheet','Worked-example sheet','Homework exercise','Exam-style practice'].map(value => <option key={value}>{value}</option>)}</select></label><label>Number of questions<select value={guided.questionCount} onChange={event => setGuideField({ questionCount: event.target.value })}>{['5','8','10','12','15','20','25'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
            </div>
            <footer className="mia-guided-footer">
              <span>Academic options are selectable. You can change them before sending.</span>
              <div><button type="button" className="secondary-button" onClick={() => setActiveGuide(null)}>Cancel</button><button type="button" className="primary-button" disabled={!guided.topic.trim() || busy || !userId} onClick={submitGuide}><Sparkles size={15}/> Ask MIA</button></div>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
