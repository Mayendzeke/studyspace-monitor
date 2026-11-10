import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Bot, Brain, BookOpen, CalendarDays, GraduationCap, Lightbulb, MessageCircle, Send, Sparkles, Trash2, ClipboardCheck, FileText, X, Library } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type AcademicProfile = { id: string; education_level: string | null; grade: string | null; curriculum: string | null; course: string | null }
type SubjectRow = { learner_id: string; name: string }
type MiaActivity = 'lesson' | 'assessment' | 'schedule' | 'worksheet' | 'teaching' | 'support' | 'research'
type ProviderHealthSnapshot = { provider?: string; model?: string; fallbackUsed?: boolean; providerNotice?: string | null; providers?: { gemini?: { configured: boolean; model: string }; gemma?: { configured: boolean; model: string }; primary?: string; backup?: string; secondaryModel?: string }; verified?: boolean };
type LessonHandoff = { title: string; subject: string; level: string; grade: string; course: string; curriculum: string; duration: number; content: string }
type HomeworkHandoff = { level: string; grade: string; course: string; subject: string; curriculum: string; topic: string; instructions: string; dueDate?: string; questionCount?: number; pointsPerQuestion?: number }
const lessonHandoffKey = 'studyspace-monitor-mia-lesson-handoff-v1'
const miaHomeworkHandoffKey = 'studyspace-monitor-homework-handoff-v1'
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
const welcomeText = "Welcome to MIΛ. Your StudySpace assistant helps with lesson planning, assessments, worksheets and learner support. Use anonymised, non-confidential teaching material only."
const activities = [
  { id: 'lesson' as const, icon: BookOpen, title: 'Prepare a lesson', description: 'Build lesson objectives, teaching steps, activities, timings and a quick assessment.' },
  { id: 'assessment' as const, icon: ClipboardCheck, title: 'Create an assessment', description: 'Generate age-appropriate questions, marks, an answer key and marking guidance.' },
  { id: 'schedule' as const, icon: CalendarDays, title: 'Plan a study schedule', description: 'Create a realistic weekly revision plan around the learner’s level and study hours.' },
  { id: 'worksheet' as const, icon: FileText, title: 'Make a worksheet', description: 'Prepare practice questions, worked examples and answers for a selected topic.' },
  { id: 'teaching' as const, icon: Lightbulb, title: 'Find teaching ideas', description: 'Explore practical, engaging activities and low-cost teaching resources.' },
  { id: 'support' as const, icon: GraduationCap, title: 'Plan learner support', description: 'Create a focused support plan for a topic, skill gap or exam-preparation need.' },
  { id: 'research' as const, icon: Library, title: 'Support college / university research', description: 'Guide tertiary learners through credible sources, citations, research and their own academic writing.' },
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
        item && typeof item.id === 'string' && item.id !== 'mia-welcome'
        && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string'
      ).slice(-30)
      return valid
    }
  } catch { /* Start a clean local conversation if storage is unavailable. */ }
  return []
}
function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    operation.then(value => { window.clearTimeout(timer); resolve(value) }, error => { window.clearTimeout(timer); reject(error) })
  })
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
    return 'MIΛ could not complete the request (HTTP ' + context.status + ').'
  }
  return reason instanceof Error ? reason.message : 'MIΛ could not complete the request. Check your connection and try again.'
}
const unique = (values: (string | null | undefined)[]) => Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => !!value))).sort((a, b) => a.localeCompare(b))

export default function MiaStudio() {
  const [userId, setUserId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [providerHealth, setProviderHealth] = useState<ProviderHealthSnapshot | null>(null)
  const [providerHealthError, setProviderHealthError] = useState('')
  const [checkingProviders, setCheckingProviders] = useState(false)
  const [welcomeVisible, setWelcomeVisible] = useState(true)
  const [welcomeFading, setWelcomeFading] = useState(false)
  const welcomeFadeTimer = useRef<number | null>(null)
  const welcomeDismissTimer = useRef<number | null>(null)
  const dismissWelcome = () => {
    if (welcomeFadeTimer.current !== null) {
      window.clearTimeout(welcomeFadeTimer.current)
      welcomeFadeTimer.current = null
    }
    setWelcomeFading(true)
    if (welcomeDismissTimer.current !== null) window.clearTimeout(welcomeDismissTimer.current)
    welcomeDismissTimer.current = window.setTimeout(() => {
      setWelcomeVisible(false)
      welcomeDismissTimer.current = null
    }, 450)
  }
  const [profiles, setProfiles] = useState<AcademicProfile[]>([])
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([])
  const [profileNotice, setProfileNotice] = useState('')
  const [activeGuide, setActiveGuide] = useState<MiaActivity | null>(null)
  const [guided, setGuided] = useState<GuidedDraft>(initialGuided)
  const [subjectManual, setSubjectManual] = useState(false)
  const [curriculumManual, setCurriculumManual] = useState(false)
  const [gradeManual, setGradeManual] = useState(false)
  const [courseManual, setCourseManual] = useState(false)
  const [lessonHandoff, setLessonHandoff] = useState<LessonHandoff | null>(null)
  const [homeworkHandoff, setHomeworkHandoff] = useState<HomeworkHandoff | null>(null)
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
      if (authError || !data.user) { setError('Sign in again to use MIΛ.'); return }
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
    welcomeFadeTimer.current = window.setTimeout(dismissWelcome, 4200)
    return () => {
      if (welcomeFadeTimer.current !== null) window.clearTimeout(welcomeFadeTimer.current)
      if (welcomeDismissTimer.current !== null) window.clearTimeout(welcomeDismissTimer.current)
    }
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

  const checkProviderHealth = async () => {
    if (!supabase || !userId || checkingProviders) return;
    setCheckingProviders(true);
    setProviderHealthError('');
    try {
      const { data, error: invokeError } = await withTimeout(supabase.functions.invoke('mia-monitor-assistant', { body: { action: 'healthcheck' } }), 80000, 'The provider health check timed out. Try again.');
      if (invokeError) throw new Error(await edgeError(invokeError));
      if (!data?.success || !data?.verified) throw new Error(typeof data?.error === 'string' ? data.error : 'The AI providers did not return a verified test response.');
      setProviderHealth(data as ProviderHealthSnapshot);
    } catch (reason) {
      setProviderHealth(null);
      setProviderHealthError(await edgeError(reason));
    } finally {
      setCheckingProviders(false);
    }
  };

  const sendMessage = async (value: string, includeHistory = true, lessonContext?: Omit<LessonHandoff, 'content'>, homeworkContext?: HomeworkHandoff) => {
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
      const { data, error: invokeError } = await withTimeout(supabase.functions.invoke('mia-monitor-assistant', {
        body: { message: clean, history: history.map(item => ({ role: item.role, content: item.content })) },
      }), 90000, 'MIΛ did not respond within 90 seconds. Your message has been restored so you can retry.');
      if (invokeError) throw new Error(await edgeError(invokeError))
      if (!data?.success || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'MIΛ did not return a usable response.')
      }
      const notice = typeof data.providerNotice === 'string' && data.providerNotice.trim()
        ? [{ id: crypto.randomUUID(), role: 'assistant' as const, content: data.providerNotice }]
        : []
      const completed = [...next, ...notice, { id: crypto.randomUUID(), role: 'assistant' as const, content: data.reply }]
      saveMessages(completed)
      if (lessonContext) setLessonHandoff({ ...lessonContext, content: data.reply })
      if (homeworkContext) setHomeworkHandoff({ ...homeworkContext, instructions: (homeworkContext.instructions + '\n\nMIA-generated teaching material to use as the source for the interactive questions:\n' + data.reply).slice(0, 2000) })
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
    setGradeManual(false)
    setCourseManual(false)
    setActiveGuide(activity)
  }

  const guideProfiles = useMemo(() => {
    const levelRows = profiles.filter(item => item.education_level === guided.level)
    const courseRows = guided.course ? levelRows.filter(item => item.course === guided.course) : levelRows
    return guided.grade ? courseRows.filter(item => item.grade === guided.grade) : courseRows
  }, [profiles, guided.level, guided.course, guided.grade])
  const levelOptions = unique([...standardLevels, ...profiles.map(item => item.education_level)])
  const showResearchSupport = profiles.some(item => /college|university|tertiary/i.test(item.education_level || ''))
  const levelRows = profiles.filter(item => item.education_level === guided.level)
  const courseOptions = unique(levelRows.map(item => item.course))
  const courseRows = guided.course && !courseManual ? levelRows.filter(item => item.course === guided.course) : levelRows
  const profileGradeOptions = unique(courseRows.map(item => item.grade))
  const defaultGrades: Record<string, string[]> = {
    'Primary school': ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7'],
    'Secondary school': ['Form 1','Form 2','Form 3'],
    'High school / Sixth form': ['Form 4','Form 5','Lower Sixth','Upper Sixth'],
    College: ['Year 1','Year 2','Year 3','Year 4'],
    University: ['Year 1','Year 2','Year 3','Year 4','Postgraduate'],
  }
  const gradeOptions = profileGradeOptions.length ? profileGradeOptions : (defaultGrades[guided.level] || [])
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
    if (activeGuide === 'lesson') requirements = 'Prepare a complete ' + guided.duration + '-minute lesson. Teaching approach: ' + guided.approach + '. Format the response as Markdown using these exact headings in this order: ## Lesson overview, ## Learning objectives, ## Timed lesson sequence, ## Teacher and learner activities, ## Resources, ## Differentiation, ## Lesson checkpoints, ## Formative assessment and answers, ## Homework. Put the content directly under each heading. Make objectives measurable, use realistic timings, keep lesson checkpoints to 3–5 short items, and include answers for the formative assessment.'
    if (activeGuide === 'assessment') requirements = 'Create a ' + guided.assessmentType.toLowerCase() + ' worth ' + guided.marks + ' marks using exactly ' + guided.questionCount + ' questions. Include clear instructions, a balanced range of question types and difficulty, marks per question that add up to the requested total, a complete answer key and a practical marking guide.'
    if (activeGuide === 'schedule') requirements = 'Create a realistic weekly study and revision schedule for ' + guided.studyHours + ' hours per week across ' + guided.studyDays + '. Include focused blocks, short breaks, spaced review, practice questions and a weekly progress check. Do not invent school timetable details.'
    if (activeGuide === 'worksheet') requirements = 'Create a ' + guided.worksheetType.toLowerCase() + ' with ' + guided.questionCount + ' questions. Use age-appropriate language, a gradual increase in difficulty, worked examples where useful, and a complete answer key.'
    if (activeGuide === 'teaching') requirements = 'Suggest at least five practical ways to teach this topic. Resource preference: ' + guided.resourceStyle + '. Include a short activity sequence, materials, learner participation, differentiation and a quick way to check understanding.'
    if (activeGuide === 'support') requirements = 'Design a supportive teaching and learning plan. Main need: ' + guided.supportFocus + '. Include likely learning barriers, a short intervention sequence, accessible practice, ways to check progress and next steps. Avoid labelling or making assumptions about a learner.'
    if (activeGuide === 'research') requirements = 'Act as an academic research coach for a college/university learner, not a ghostwriter. Prioritise a credible source plan and references before writing guidance. First identify the research question and key concepts; then provide a source-search strategy (Google Scholar, subject databases, library catalogue, official and institutional sources as appropriate), search terms, source-evaluation criteria and a shortlist of reliable sources with full bibliographic details, DOI/stable URL only when known and verifiable. Never fabricate references or claim to have verified a source that you cannot verify. Use the referencing style specified by the institution; if unknown, ask or label APA 7 as provisional. Provide example in-text citations and reference-list formatting, explain the evidence and limitations, propose a thesis and outline, and give a brief illustrative example only. Do not write a complete assignment, essay or report for submission. Include a section explaining the concepts, a student-authored work checklist and 2–3 questions to check understanding. The learner must read the sources and write their own analysis.'
    return 'Act as MIΛ, the StudySpace teaching assistant. Use the following selected academic context and do not ask me to re-enter it:\n' + (academic || 'Education context not yet specified.') + '\n\nTask: ' + (activity?.title || 'Teaching support') + '\n' + requirements + '\n\nWrite in clear, well-structured sections. Keep the material age-appropriate and practical. State any assumptions and ask only for information that is genuinely essential. Do not invent curriculum requirements.'
  }
  const submitGuide = () => {
    if (!activeGuide || !guided.topic.trim()) return
    if (activeGuide === 'lesson' && (!guided.level || !guided.subject.trim())) return
    if ((activeGuide === 'assessment' || activeGuide === 'worksheet') && (!guided.level || !guided.grade || !guided.subject.trim())) return
    if (activeGuide === 'research' && (!/college|university|tertiary/i.test(guided.level) || !guided.subject.trim())) return
    const prompt = buildGuidedRequest()
    const lessonContext = activeGuide === 'lesson' ? {
      title: guided.topic.trim(), subject: guided.subject, level: guided.level, grade: guided.grade,
      course: guided.course, curriculum: guided.curriculum, duration: Number(guided.duration) || 45,
    } : undefined
    const homeworkContext = activeGuide === 'assessment' || activeGuide === 'worksheet' ? {
      title: guided.topic.trim(), subject: guided.subject, level: guided.level, grade: guided.grade,
      course: guided.course, curriculum: guided.curriculum, topic: guided.topic.trim(),
      instructions: 'MIΛ ' + (activeGuide === 'assessment' ? guided.assessmentType : guided.worksheetType) + ' · ' + (activeGuide === 'assessment' ? guided.marks + ' marks · ' : '') + guided.questionCount + ' requested questions. Use this generated material as source guidance when creating an interactive question set.',
      questionCount: Number(guided.questionCount) || 10,
      pointsPerQuestion: activeGuide === 'assessment' ? Math.max(0.25, Number(guided.marks) / Math.max(1, Number(guided.questionCount) || 10)) : 1,
    } : undefined
    setLessonHandoff(null)
    setHomeworkHandoff(null)
    setActiveGuide(null)
    void sendMessage(prompt, false, lessonContext, homeworkContext)
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

  const openHomeworkInClassroom = () => {
    if (!homeworkHandoff) return
    try {
      localStorage.setItem(miaHomeworkHandoffKey, JSON.stringify({ ...homeworkHandoff, createdAt: new Date().toISOString() }))
      setHomeworkHandoff(null)
      window.dispatchEvent(new CustomEvent('studyspace-open-homework-builder'))
    } catch {
      setError('The MIΛ assessment could not be handed to the interactive homework builder. Check browser storage and try again.')
    }
  }

  const clearConversation = () => {
    saveMessages([])
    setError('')
  }

  return (
    <section className="mia-page">
      {welcomeVisible && <div className={`mia-welcome-toast${welcomeFading ? ' is-fading' : ''}`} role="status" aria-live="polite">
        <span className="mia-welcome-toast-mark"><Sparkles size={17}/></span>
        <div><strong>Welcome to MIΛ</strong><span>{welcomeText}</span></div>
        <button type="button" onClick={dismissWelcome} aria-label="Dismiss welcome message"><X size={15}/></button>
      </div>}
      <div className="mia-hero">
        <div className="mia-brand-mark"><Sparkles size={25}/></div>
        <div className="mia-hero-copy">
          <span className="eyebrow">MAYENDZEKE'S ARTIFICIAL INTELLIGENCE</span>
          <h1>MIΛ <span>· Your StudySpace companion</span></h1>
          <p>Your teaching assistant for lesson planning, assessments, worksheets, study schedules and learner support. Choose an activity and complete a few selections; type only the topic or details that are not already in StudySpace.</p>
        </div>
        <div className="mia-availability"><i/> Administrator assistant</div>
      </div>

      <div className="mia-provider-banner" role="note">
        <strong>Gemini free-tier API · Gemma 4 automatic backup</strong>
        <span>Gemini is used first. When its free API quota is reached or the service is unavailable, Gemma 4 takes over automatically. Google may use free-tier API content to improve its services, so submit anonymised, non-confidential teaching material only. Never submit learner names, Student IDs, contact details or sensitive records.</span>
      </div>

      {providerHealth && <div className="mia-provider-health-panel" role="status">
        <div className="mia-provider-health-top"><strong><Activity size={16}/> Live AI provider test passed</strong><span>{providerHealth.provider} · {providerHealth.model}</span></div>
        <div className="mia-provider-health-grid">
          <span><strong>Gemini primary</strong><small>{providerHealth.providers?.gemini?.configured ? 'Configured and eligible for requests' : 'Not configured — add the Gemini API key in Supabase secrets'}</small></span>
          <span><strong>Gemma 4 backup</strong><small>{providerHealth.providers?.gemma?.configured ? 'Cloudflare credentials configured' : 'Cloudflare credentials missing'}</small></span>
        </div>
        {providerHealth.providerNotice && <p>{providerHealth.providerNotice}</p>}
      </div>}
      {providerHealthError && <p className="mia-error" role="alert">{providerHealthError}</p>}
      <div className="mia-capabilities">
        <article><BookOpen size={18}/><strong>Lesson preparation</strong><span>Objectives, timed teaching steps, learner activities, differentiation and checks for understanding.</span></article>
        <article><Brain size={18}/><strong>Assessments</strong><span>Quizzes, class tests, exam practice, answer keys and marking guidance.</span></article>
        <article><GraduationCap size={18}/><strong>Learner support</strong><span>Targeted intervention ideas, revision plans and support for difficult topics.</span></article>
        <article><MessageCircle size={18}/><strong>StudySpace guidance</strong><span>Help with teaching workflows, classroom preparation and practical admin questions.</span></article>
      </div>

      <div className="mia-workspace">
        <div className="mia-chat-heading">
          <div><strong><Bot size={18}/> MIΛ conversation</strong><small>Choose a guided task below, or type a custom request when you need to.</small></div>
          <div className="mia-chat-tools">
            <button type="button" className="secondary-button" onClick={() => void checkProviderHealth()} disabled={checkingProviders || !userId}><Activity size={14}/>{checkingProviders ? 'Checking AI…' : 'Test AI providers'}</button>
            <button type="button" className="secondary-button" onClick={clearConversation}><Trash2 size={14}/> Clear chat</button>
          </div>
        </div>

        <div className="mia-guided-launch">
          <div><strong>Start a guided task</strong><span>These options stay available while you chat with MIΛ.</span></div>
          <div className="mia-prompt-grid">
            {activities.filter(item => item.id !== 'research' || showResearchSupport).map(({ id, icon: Icon, title, description }) => (
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
                <small>{item.role === 'assistant' ? 'MIΛ' : 'YOU'}</small>
                <p>{item.content}</p>
              </div>
            </article>
          ))}
          {busy && <article className="mia-message mia-message-assistant"><span className="mia-message-avatar"><Sparkles size={15}/></span><div className="mia-message-bubble"><small>MIΛ</small><p className="mia-thinking">Preparing your response…</p></div></article>}
        </div>

        {lessonHandoff && <div className="mia-lesson-handoff"><div><strong><BookOpen size={16}/> Your lesson draft is ready</strong><p>MIΛ has prepared the lesson content. Open it in Classroom Studio to edit, save locally or publish it to selected learners.</p></div><button type="button" className="primary-button" onClick={openLessonInClassroom}>Create in Classroom Studio <span aria-hidden="true">→</span></button></div>}
        {homeworkHandoff && <div className="mia-lesson-handoff"><div><strong><ClipboardCheck size={16}/> Your interactive assessment draft is ready</strong><p>Convert MIΛ's generated material into a question-by-question student form. You can edit questions, set recipients and due dates, review the answer key, then publish it through StudySpace Homework.</p></div><button type="button" className="primary-button" onClick={openHomeworkInClassroom}>Build interactive homework <span aria-hidden="true">→</span></button></div>}
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
            aria-label="Custom message to MIΛ"
          />
          <div className="mia-compose-footer">
            <span>Enter to send · Shift + Enter for a new line · Do not include learner names, IDs or private personal information.</span>
            <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !userId}><Send size={15}/>{busy ? 'Working…' : 'Send to MIΛ'}</button>
          </div>
        </form>
        <p className="mia-disclaimer">Guided choices use academic profile details and registered subjects already in StudySpace. Only selected academic details, the topic and task settings are included in a guided request; learner names and IDs are not sent. MIΛ does not change accounts, subscriptions, timetables or assessments. Review generated teaching material before sharing it.</p>
      </div>

      {activeGuide && (
        <div className="mia-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveGuide(null) }}>
          <section className="mia-guided-dialog" role="dialog" aria-modal="true" aria-labelledby="mia-guided-title">
            <header className="mia-guided-header">
              <div><span className="eyebrow">MIΛ GUIDED WORKSPACE</span><h2 id="mia-guided-title">{activities.find(item => item.id === activeGuide)?.title}</h2><p>Choose the education level and subject for a lesson. Existing grades, courses and curricula appear automatically; enter a missing detail only when necessary.</p></div>
              <button type="button" className="mia-dialog-close" onClick={() => setActiveGuide(null)} aria-label="Close guided workspace"><X size={19}/></button>
            </header>
            <div className="mia-guided-body">
              <div className="mia-guided-section-title"><strong>Academic context</strong><span>Options from active learner profiles</span></div>
              <div className="mia-guided-grid">
                <label>Education level<select value={guided.level} onChange={event => { setSubjectManual(false); setCurriculumManual(false); setGradeManual(false); setCourseManual(false); setGuideField({ level: event.target.value, grade: '', course: '', subject: '', curriculum: '' }) }}><option value="">Choose education level</option>{levelOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                {['College', 'University'].includes(guided.level) && <><label>Course / programme<select value={courseManual ? '__other__' : guided.course} onChange={event => { const other = event.target.value === '__other__'; setCourseManual(other); setGradeManual(false); setSubjectManual(false); setCurriculumManual(false); setGuideField({ course: other ? '' : event.target.value, grade: '', subject: '', curriculum: '' }) }}><option value="">All courses / programmes</option>{courseOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>{courseManual && <label>Enter course / programme<input value={guided.course} onChange={event => setGuideField({ course: event.target.value })} placeholder="Type the course or programme"/></label>}</>}
                <label>{guided.level === 'Primary school' ? 'Grade / class' : guided.level === 'Secondary school' ? 'Form / grade' : ['College', 'University'].includes(guided.level) ? 'Year of study' : 'Grade / year'}<select value={gradeManual ? '__other__' : guided.grade} onChange={event => { const other = event.target.value === '__other__'; setGradeManual(other); setSubjectManual(false); setCurriculumManual(false); setGuideField({ grade: other ? '' : event.target.value, subject: '', curriculum: '' }) }} disabled={!guided.level}><option value="">Any grade / year</option>{gradeOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>{gradeManual && <label>Enter grade / year<input value={guided.grade} onChange={event => setGuideField({ grade: event.target.value })} placeholder="Type the grade, form or year"/></label>}
                <label>Subject / module<select value={subjectManual ? '__other__' : guided.subject} onChange={event => { const other = event.target.value === '__other__'; setSubjectManual(other); setGuideField({ subject: other ? '' : event.target.value }) }} disabled={!guided.level}><option value="">Choose a subject</option>{subjectOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>
                {subjectManual && <label>Enter subject / module<input value={guided.subject} onChange={event => setGuideField({ subject: event.target.value })} placeholder="Type the subject or module"/></label>}
                <label>Curriculum / syllabus<select value={curriculumManual ? '__other__' : guided.curriculum} onChange={event => { const other = event.target.value === '__other__'; setCurriculumManual(other); setGuideField({ curriculum: other ? '' : event.target.value }) }}><option value="">Choose a curriculum</option>{curriculumOptions.map(item => <option key={item} value={item}>{item}</option>)}<option value="__other__">Other / enter manually</option></select></label>
                {curriculumManual && <label>Enter curriculum / syllabus<input value={guided.curriculum} onChange={event => setGuideField({ curriculum: event.target.value })} placeholder="Type the curriculum or syllabus"/></label>}
              </div>
              <p className="mia-guided-hint">{guideProfiles.length ? 'These selections match ' + guideProfiles.length + ' active learner profile(s). Registered subjects for this group are included above.' : 'No matching learner profiles are recorded for this combination yet. You can still choose common subjects and continue.'}</p>

              <div className="mia-guided-section-title"><strong>What should MIΛ work on?</strong><span>One required detail</span></div>
              <label className="mia-guided-topic">Topic / learning focus<input autoFocus value={guided.topic} onChange={event => setGuideField({ topic: event.target.value })} placeholder="e.g. Linear equations, photosynthesis, essay writing" required/></label>

              {activeGuide === 'lesson' && <div className="mia-guided-grid mia-guided-options"><label>Lesson duration<select value={guided.duration} onChange={event => setGuideField({ duration: event.target.value })}>{['30','45','60','75','90','120'].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Teaching approach<select value={guided.approach} onChange={event => setGuideField({ approach: event.target.value })}>{['Interactive explanation and guided practice','Direct instruction','Discussion and collaborative learning','Practical / hands-on activity','Revision and exam preparation','Project-based learning'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'assessment' && <div className="mia-guided-grid mia-guided-options"><label>Assessment type<select value={guided.assessmentType} onChange={event => setGuideField({ assessmentType: event.target.value })}>{['Class test','Short quiz','Diagnostic assessment','End-of-topic test','Exam practice','Practical assessment'].map(value => <option key={value}>{value}</option>)}</select></label><label>Total marks<select value={guided.marks} onChange={event => setGuideField({ marks: event.target.value })}>{['10','15','20','30','40','50','60','80','100'].map(value => <option key={value} value={value}>{value} marks</option>)}</select></label><label>Number of questions<select value={guided.questionCount} onChange={event => setGuideField({ questionCount: event.target.value })}>{['5','8','10','12','15','20','25'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'schedule' && <div className="mia-guided-grid mia-guided-options"><label>Study hours per week<select value={guided.studyHours} onChange={event => setGuideField({ studyHours: event.target.value })}>{['2','3','4','5','6','8','10','12','15'].map(value => <option key={value}>{value}</option>)}</select></label><label>Available study days<select value={guided.studyDays} onChange={event => setGuideField({ studyDays: event.target.value })}>{['2 days','3 days','4 days','5 days','6 days','7 days'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'teaching' && <div className="mia-guided-grid mia-guided-options"><label>Resource preference<select value={guided.resourceStyle} onChange={event => setGuideField({ resourceStyle: event.target.value })}>{['Low-cost resources','No special equipment','Digital / technology-supported','Hands-on materials','A mix of approaches'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'support' && <div className="mia-guided-grid mia-guided-options"><label>Main support need<select value={guided.supportFocus} onChange={event => setGuideField({ supportFocus: event.target.value })}>{['Understanding a difficult topic','Building foundational skills','Exam preparation and revision','Improving confidence and participation','Catching up after missed lessons','Extension for an advanced learner'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
              {activeGuide === 'worksheet' && <div className="mia-guided-grid mia-guided-options"><label>Worksheet type<select value={guided.worksheetType} onChange={event => setGuideField({ worksheetType: event.target.value })}>{['Practice worksheet','Revision worksheet','Worked-example sheet','Homework exercise','Exam-style practice'].map(value => <option key={value}>{value}</option>)}</select></label><label>Number of questions<select value={guided.questionCount} onChange={event => setGuideField({ questionCount: event.target.value })}>{['5','8','10','12','15','20','25'].map(value => <option key={value}>{value}</option>)}</select></label></div>}
            </div>
            <footer className="mia-guided-footer">
              <span>Select the education level and subject for lessons. Research support is restricted to college and university learners; enter the assignment topic or question.</span>
              <div><button type="button" className="secondary-button" onClick={() => setActiveGuide(null)}>Cancel</button><button type="button" className="primary-button" disabled={!guided.topic.trim() || (activeGuide === 'lesson' && (!guided.level || !guided.subject.trim())) || (activeGuide === 'research' && (!/college|university|tertiary/i.test(guided.level) || !guided.subject.trim())) || busy || !userId} onClick={submitGuide}><Sparkles size={15}/> Ask MIΛ</button></div>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
