import ContentStudio from './components/ContentStudio'
import ClassroomStudio from './components/ClassroomStudio'
import MonitorTodaySession from './components/MonitorTodaySession'
import HomeworkBuilder from './components/HomeworkBuilder'
import HomeworkHelpInbox from './components/HomeworkHelpInbox'
import AssessmentReviewQueue from './components/AssessmentReviewQueue'
import LearnerEngagementPage from './components/LearnerEngagementPage'
import LearnersPage from './components/LearnersPage'
import TeacherWeeklyTimetable from './components/TeacherWeeklyTimetable'
import MessagesPage from './components/MessagesPage'
import NotificationPreferencesPanel from './components/NotificationPreferencesPanel'
import StudyspaceNotificationListener from './components/StudyspaceNotificationListener'
import GuardianVerificationPage from './components/GuardianVerificationPage'
import SubscriptionsPage from './components/SubscriptionsPage'
import MiaStudio from './components/MiaStudio'
import TestimonialsInbox from './components/TestimonialsInbox'
import SplashScreen from './components/SplashScreen'
import AuthGate from './components/AuthGate'
import AdminMfaGate from './components/AdminMfaGate'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, Bell, BookOpen, PenTool,
  CheckCircle2, ChevronDown, CircleHelp, GraduationCap, LayoutDashboard,
  LockKeyhole, Menu, Plus, Settings, ShieldCheck,
  SlidersHorizontal, Users, X, KeyRound, Sparkles, Brain, Moon, Sun,
  Clock3, FileText, RefreshCw, TrendingUp, CreditCard, Download, CalendarDays, ShieldAlert, MessageCircle,
} from 'lucide-react'

type Page = 'Overview' | "Today's Session" | 'Learners' | 'Timetable' | 'Messages' | 'Guardian verification' | 'Subscriptions' | 'MIΛ' | 'Content Studio' | 'Classroom Studio' | 'Access PINs' | 'Academic progress' | 'Learning engagement' | 'Testimonials' | 'Settings'
type Theme = 'light' | 'dark'
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const navigation: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: "Today's Session", icon: CalendarDays },
  { label: 'Learners', icon: Users },
  { label: 'Messages', icon: MessageCircle },
  { label: 'Timetable', icon: CalendarDays },
  { label: 'MIΛ', icon: Brain },
  { label: 'Guardian verification', icon: ShieldCheck },
  { label: 'Subscriptions', icon: CreditCard },
  { label: 'Content Studio', icon: PenTool },
  { label: 'Classroom Studio', icon: BookOpen },
  { label: 'Academic progress', icon: Activity },
  { label: 'Learning engagement', icon: Sparkles },
  { label: 'Access PINs', icon: KeyRound },
  { label: 'Testimonials', icon: Users },
  { label: 'Settings', icon: Settings },
]

async function describeFunctionError(reason: unknown, fallback: string): Promise<string> {
  const context = reason && typeof reason === 'object' && 'context' in reason
    ? (reason as { context?: unknown }).context
    : undefined

  if (context instanceof Response) {
    const status = context.status
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown }
      const detail = typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string' ? payload.message : ''
      if (detail) return `${detail} (HTTP ${status})`
    } catch {
      try {
        const detail = (await context.clone().text()).trim().slice(0, 240)
        if (detail) return `${detail} (HTTP ${status})`
      } catch {
        // Keep the HTTP status even when the response body cannot be read.
      }
    }
    return `The server rejected the request (HTTP ${status}).`
  }

  return reason instanceof Error ? reason.message : fallback
}

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [splashElapsed, setSplashElapsed] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installHelpOpen, setInstallHelpOpen] = useState(false)
  const [isStandalone, setIsStandalone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches)
  const [adminAllowed, setAdminAllowed] = useState(false)
  const [mfaVerified, setMfaVerified] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [adminName, setAdminName] = useState('Administrator')
  const [helpCardOpen, setHelpCardOpen] = useState(true)
  const [helpCardFading, setHelpCardFading] = useState(false)
  const adminInitials = adminName.trim().split(/\s+/).map(part => part.charAt(0)).join('').slice(0, 2).toUpperCase() || 'AD'
  const handleMfaVerified = useCallback(() => setMfaVerified(true), [])

  useEffect(() => {
    if (!helpCardOpen) {
      setHelpCardFading(false)
      return
    }

    setHelpCardFading(false)
    const fadeTimer = window.setTimeout(() => setHelpCardFading(true), 9600)
    const dismissTimer = window.setTimeout(() => setHelpCardOpen(false), 10000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [helpCardOpen])

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashElapsed(true), 5200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const updateDisplayMode = () => setIsStandalone(displayMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    updateDisplayMode()
    displayMode.addEventListener('change', updateDisplayMode)
    return () => displayMode.removeEventListener('change', updateDisplayMode)
  }, [])

  useEffect(() => {
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    const installed = () => { setInstallPrompt(null); setInstallHelpOpen(false) }
    window.addEventListener('beforeinstallprompt', captureInstall)
    window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', captureInstall); window.removeEventListener('appinstalled', installed) }
  }, [])

  useEffect(() => {
    const openClassroom = () => { setPage('Classroom Studio'); setMobileOpen(false) }
    const openHomework = () => { setPage('Classroom Studio'); setMobileOpen(false) }
    window.addEventListener('studyspace-open-classroom-studio', openClassroom)
    window.addEventListener('studyspace-open-homework-builder', openHomework)
    return () => {
      window.removeEventListener('studyspace-open-classroom-studio', openClassroom)
      window.removeEventListener('studyspace-open-homework-builder', openHomework)
    }
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    const closeOnBack = () => setMobileOpen(false)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('popstate', closeOnBack)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); window.removeEventListener('popstate', closeOnBack) }
  }, [mobileOpen])

  useEffect(() => {
    if (!installHelpOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setInstallHelpOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape) }
  }, [installHelpOpen])

  const installMonitor = async () => {
    setMobileOpen(false)
    if (isStandalone || !installPrompt) { setInstallHelpOpen(true); return }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('studyspace-monitor-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('studyspace-monitor-theme', theme)
    } catch {
      // Theme still works for this session if browser storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (!nextSession) { setAdminAllowed(false); setMfaVerified(false); setPasswordRecovery(false) }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setAdminAllowed(false); return }
    let alive = true
    setAdminLoading(true)
    supabase.from('profiles').select('role,account_status,preferred_name,full_name').eq('id', session.user.id).single().then(({ data, error }) => {
      if (!alive) return
      if (error || data?.role !== 'admin' || data?.account_status !== 'active') {
        setAuthError('This account does not have active Studyspace administrator access.')
        setAdminAllowed(false)
        void supabase?.auth.signOut()
      } else {
        setAdminName(data.preferred_name || data.full_name || session.user.email || 'Administrator')
        setAdminAllowed(true)
        setAuthError('')
      }
      setAdminLoading(false)
    })
    return () => { alive = false }
  }, [session])

  const navigate = (next: Page) => {
    setPage(next)
    setMobileOpen(false)
  }

  if (!isSupabaseConfigured || !supabase) return <AuthGate mode="unconfigured" error="" onError={setAuthError} installAvailable={Boolean(installPrompt)} onInstall={() => void installMonitor()} />
  if (passwordRecovery) return <AuthGate mode="recovery" error={authError} onError={setAuthError} installAvailable={Boolean(installPrompt)} onInstall={() => void installMonitor()} />
  if (authLoading || adminLoading || !splashElapsed) return <SplashScreen theme={theme} />
  if (!session || !adminAllowed) return <AuthGate mode="signin" error={authError} onError={setAuthError} installAvailable={Boolean(installPrompt)} onInstall={() => void installMonitor()} />
  if (!mfaVerified) return <AdminMfaGate onVerified={handleMfaVerified} />

  return (
    <div className="app-shell" data-theme={theme}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><img className="brand-logo-image" src={import.meta.env.BASE_URL + "studyspace-monitor.svg"} alt="Study Space"/></div>
          <div className="brand-copy"><strong>studyspace<span>.</span></strong><small>MONITOR</small></div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <button type="button" className="workspace-switcher" onClick={() => navigate('Settings')} aria-label="Open workspace settings">
          <span className="workspace-avatar" aria-hidden="true">{adminInitials}</span>
          <span className="workspace-copy">
            <strong title={session.user.email || adminName}>{session.user.email || adminName}</strong>
            <small>Administrator workspace</small>
          </span>
          <ChevronDown size={16} className="muted-icon" />
        </button>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => navigate(label)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {helpCardOpen ? (
            <section className={`help-card ${helpCardFading ? 'is-fading' : ''}`} aria-label="Monitor setup help">
              <div className="help-card-top">
                <div className="help-icon"><CircleHelp size={18} /></div>
                <button
                  type="button"
                  className="help-card-close"
                  aria-label="Dismiss help card"
                  title="Dismiss help card"
                  onClick={() => setHelpCardOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <strong>Need a hand?</strong>
              <p>Your learner workspace is being prepared.</p>
              <button type="button" onClick={() => navigate('Settings')}>View setup guide <ArrowUpRight size={14} /></button>
            </section>
          ) : (
            <button
              type="button"
              className="help-card-reopen"
              aria-label="Reopen setup help"
              title="Reopen setup help"
              onClick={() => setHelpCardOpen(true)}
            >
              <CircleHelp size={18} />
            </button>
          )}
          <button type="button" className="nav-item monitor-sidebar-install" onClick={() => void installMonitor()}><Download size={18}/><span>{installPrompt ? 'Install Studyspace Monitor' : 'Install / add to device'}</span></button>
          <div className="sidebar-profile">
            <div className="profile-avatar">A</div>
            <div className="profile-copy"><strong>{adminName}</strong><small>Authenticated administrator</small></div>

          </div>
        </div>
      </aside>

      <StudyspaceNotificationListener />
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="monitor-install-button" onClick={() => void installMonitor()} title="Install Studyspace Monitor on this device"><Download size={15}/><span>{isStandalone ? 'Installed' : 'Install app'}</span></button>
            <div className="system-status"><span className="status-dot" /> MFA verified</div>
            <button className="theme-switch" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span><i className={theme === 'dark' ? 'switch-knob is-dark' : 'switch-knob'} />
            </button>
            <button type="button" className="icon-button" aria-label="Open messages" title="Messages" onClick={() => setPage('Messages')}><MessageCircle size={17}/></button>
            <NotificationCenter />
            <div className="top-avatar">{adminName.slice(0,1).toUpperCase()}</div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}><LockKeyhole size={16} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {page === 'Overview' && <Overview navigate={navigate} supabaseConfigured={isSupabaseConfigured} />}
          {page === "Today's Session" && <MonitorTodaySession onCreateLesson={() => navigate('Classroom Studio')} />}
          {page === 'Learners' && <LearnersPage onCreatePin={() => navigate('Access PINs')} />}
          {page === 'Timetable' && <TeacherWeeklyTimetable />}
          {page === 'Messages' && <MessagesPage onOpenHomework={() => setPage('Classroom Studio')} />}
          {page === 'Guardian verification' && <GuardianVerificationPage />}
          {page === 'Subscriptions' && <SubscriptionsPage />}
          {page === 'MIΛ' && <MiaStudio />}
          {page === 'Content Studio' && <ContentStudio />}
          {page === 'Classroom Studio' && <><ClassroomStudio /><HomeworkBuilder /><HomeworkHelpInbox /><AssessmentReviewQueue /></>}
          {page === 'Access PINs' && <PinPage />}
          {page === 'Academic progress' && <AcademicProgressPage />}
          {page === 'Learning engagement' && <LearnerEngagementPage />}
          {page === 'Testimonials' && <TestimonialsInbox />}
          {page === 'Settings' && <SettingsPage supabaseConfigured={isSupabaseConfigured} theme={theme} onThemeChange={setTheme} onOpenTimetable={() => navigate('Timetable')} />}

        </div>
      </main>
      {installHelpOpen && <div className="monitor-install-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInstallHelpOpen(false) }}><section className="monitor-install-dialog" role="dialog" aria-modal="true" aria-labelledby="monitor-install-title"><header><div><span className="eyebrow">STUDYSPACE MONITOR</span><h2 id="monitor-install-title">{isStandalone ? 'Monitor is installed' : 'Install on your device'}</h2><p>{isStandalone ? 'This page is already running in its standalone app window. Your administrator sign-in and MFA remain required.' : 'Use Monitor like an app, with its own icon and app window. Your administrator sign-in and MFA remain required.'}</p></div><button type="button" className="icon-button" onClick={() => setInstallHelpOpen(false)} aria-label="Close install instructions"><X size={18}/></button></header><div className="monitor-install-instructions"><article><strong>Android · Chrome</strong><p>On Android, open this exact Monitor address in Chrome, open the browser menu and choose <b>Install app</b>. Do not choose <b>Create shortcut</b>. When the menu only offers a shortcut, that browser/device is not offering a full standalone PWA install; try current Chrome or Samsung Internet on a supported device. The web app cannot turn a browser shortcut into a native Android package.</p></article><article><strong>Windows · Chrome or Edge</strong><p>Use the install icon in the address bar, or open the browser menu and choose <b>Install Studyspace Monitor</b>.</p></article><article><strong>iPhone / iPad · Safari</strong><p>Tap <b>Share</b>, choose <b>Add to Home Screen</b>, then confirm.</p></article><article><strong>Mac · Chrome or Safari</strong><p>In Chrome use <b>Install page as app</b>. In supported Safari versions, use <b>File → Add to Dock</b>.</p></article></div><footer><span>Requires an internet connection for the latest learner and administrator records. Offline caching does not bypass sign-in or access checks.</span><button type="button" className="primary-button" onClick={() => setInstallHelpOpen(false)}>Got it</button></footer></section></div>}
    </div>
  )
}


function NotificationCenter() {
  type ActivityItem = { id: number; event_type: string; created_at: string };
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!supabase) {
      setError("Notifications are unavailable because Studyspace is not connected.");
      setLoaded(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("audit_events")
        .select("id,event_type,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (queryError) throw queryError;
      setItems((data ?? []) as ActivityItem[]);
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recent activity could not be loaded.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void refresh();
  };

  return (
    <div className="notification-wrap">
      <button
        type="button"
        className="icon-button notification-button"
        aria-label="Notifications and recent activity"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <Bell size={18} />
        {items.length > 0 && <i />}
      </button>
      {open && (
        <section className="notification-popover" role="dialog" aria-label="Recent Studyspace activity">
          <div className="notification-popover-head">
            <div><strong>Recent activity</strong><small>Latest events recorded by Studyspace</small></div>
            <div>
              <button type="button" className="notification-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
              <button type="button" className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={16}/></button>
            </div>
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {loading && !loaded ? <p className="notification-empty">Loading activity…</p>
            : items.length ? <ul className="notification-list">
              {items.map(item => (
                <li key={item.id}>
                  <span className="notification-event-dot"/>
                  <div><strong>{item.event_type.replaceAll("_", " ")}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></div>
                </li>
              ))}
            </ul>
            : !error && <p className="notification-empty">No recent activity has been recorded yet.</p>}
        </section>
      )}
    </div>
  );
}


function AcademicProgressPage() {
  type Learner = {
    id: string;
    student_id: string | null;
    full_name: string;
    preferred_name: string;
    grade: string;
    curriculum: string;
    account_status: string;
  };
  type StudyRow = { learner_id: string; duration_minutes: number; started_at: string };
  type AttemptRow = { learner_id: string; score: number; total_points: number; submitted_at: string; marked_at: string | null };
  type PracticeRow = { learner_id: string; score: number | null; max_score: number | null; created_at: string };
  type AssignmentRow = { learner_id: string; id: string };
  type SubjectRow = { learner_id: string; name: string };
  type LearnerProgress = {
    learner: Learner;
    subjects: Set<string>;
    studyMinutes: number;
    assignments: number;
    submissions: number;
    score: number;
    possible: number;
    lastActivity: string;
  };

  const [learners, setLearners] = useState<LearnerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  type AssessmentDetail = { id:string; title:string; subject_name:string; score:number; total_points:number; submitted_at:string; marked_at:string|null; teacher_feedback:string };
  type MemoryDetail = { strengths:unknown; difficulties:unknown; goals:unknown; recent_topics:unknown; updated_at:string } | null;
  type RecordEvent = { id:string; event_type:string; score:number|null; max_score:number|null; duration_minutes:number|null; created_at:string; metadata:unknown };
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [assessmentRecords, setAssessmentRecords] = useState<AssessmentDetail[]>([]);
  const [recordEvents, setRecordEvents] = useState<RecordEvent[]>([]);
  const [learningMemory, setLearningMemory] = useState<MemoryDetail>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState('');

  const refresh = async () => {
    if (!supabase) {
      setError('The Studyspace database is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const [profileResult, studyResult, assignmentResult, attemptResult, practiceResult, subjectResult] = await Promise.all([
      supabase.from('profiles').select('id,student_id,full_name,preferred_name,grade,curriculum,account_status').eq('role','learner').order('preferred_name'),
      supabase.from('study_sessions').select('learner_id,duration_minutes,started_at').order('started_at',{ascending:false}),
      supabase.from('exercise_assignments').select('id,learner_id'),
      supabase.from('exercise_attempts').select('learner_id,score,total_points,submitted_at,marked_at').order('submitted_at',{ascending:false}),
      supabase.from('progress_events').select('learner_id,score,max_score,created_at').eq('event_type','weekly_test_attempt').order('created_at',{ascending:false}),
      supabase.from('student_subjects').select('learner_id,name'),
    ]);
    const failed = [profileResult.error,studyResult.error,assignmentResult.error,attemptResult.error,practiceResult.error,subjectResult.error].find(Boolean);
    if (failed) {
      setError('Academic progress could not be loaded. Check administrator permissions and the latest database migrations, then refresh.');
      setLearners([]);
      setLoading(false);
      return;
    }

    const progress = new Map<string,LearnerProgress>();
    for (const learner of (profileResult.data || []) as Learner[]) {
      progress.set(learner.id,{
        learner,
        subjects:new Set<string>(),
        studyMinutes:0,
        assignments:0,
        submissions:0,
        score:0,
        possible:0,
        lastActivity:'',
      });
    }
    for (const row of (subjectResult.data || []) as SubjectRow[]) {
      const item=progress.get(row.learner_id);
      if(item && row.name) item.subjects.add(row.name);
    }
    for (const row of (studyResult.data || []) as StudyRow[]) {
      const item=progress.get(row.learner_id);
      if(!item) continue;
      item.studyMinutes+=Math.max(0,Number(row.duration_minutes)||0);
      if(row.started_at && row.started_at>item.lastActivity) item.lastActivity=row.started_at;
    }
    for (const row of (assignmentResult.data || []) as AssignmentRow[]) {
      const item=progress.get(row.learner_id);
      if(item) item.assignments+=1;
    }
    for (const row of (attemptResult.data || []) as AttemptRow[]) {
      const item=progress.get(row.learner_id);
      if(!item) continue;
      item.submissions+=1;
      item.score+=Math.max(0,Number(row.score)||0);
      item.possible+=Math.max(0,Number(row.total_points)||0);
      const activity=row.marked_at||row.submitted_at;
      if(activity && activity>item.lastActivity) item.lastActivity=activity;
    }
    for (const row of (practiceResult.data || []) as PracticeRow[]) {
      const item=progress.get(row.learner_id);
      if(!item) continue;
      item.submissions+=1;
      item.score+=Math.max(0,Number(row.score)||0);
      item.possible+=Math.max(0,Number(row.max_score)||0);
      if(row.created_at && row.created_at>item.lastActivity) item.lastActivity=row.created_at;
    }
    setLearners([...progress.values()].sort((a,b)=>b.lastActivity.localeCompare(a.lastActivity)||a.learner.preferred_name.localeCompare(b.learner.preferred_name)));
    setUpdatedAt(new Date().toISOString());
    setLoading(false);
  };

  useEffect(()=>{void refresh();},[]);

  const loadLearnerRecord = async (learnerId:string) => {
    if (!supabase) return;
    setSelectedRecordId(learnerId);
    setRecordLoading(true);
    setRecordError('');
    try {
      const [assignmentRows, attemptRows, eventRows, memoryRow] = await Promise.all([
        supabase.from('exercise_assignments').select('id,exercise_set_id').eq('learner_id',learnerId),
        supabase.from('exercise_attempts').select('id,assignment_id,score,total_points,submitted_at,marked_at,teacher_feedback').eq('learner_id',learnerId).order('submitted_at',{ascending:false}).limit(100),
        supabase.from('progress_events').select('id,event_type,score,max_score,duration_minutes,created_at,metadata').eq('learner_id',learnerId).order('created_at',{ascending:false}).limit(50),
        supabase.from('mia_learning_memory').select('strengths,difficulties,goals,recent_topics,updated_at').eq('learner_id',learnerId).maybeSingle(),
      ]);
      const failed=[assignmentRows.error,attemptRows.error,eventRows.error,memoryRow.error].find(Boolean);
      if(failed) throw failed;
      const assignmentMap=new Map(((assignmentRows.data??[]) as {id:string;exercise_set_id:string}[]).map(x=>[x.id,x.exercise_set_id]));
      const exerciseSetIds=[...new Set([...assignmentMap.values()])];
      const exerciseSets=exerciseSetIds.length
        ? await supabase.from('exercise_sets').select('id,title,subject_name').in('id',exerciseSetIds)
        : {data:[],error:null};
      if(exerciseSets.error) throw exerciseSets.error;
      const sets=new Map(((exerciseSets.data??[]) as {id:string;title:string;subject_name:string}[]).map(x=>[x.id,x]));
      const rows=((attemptRows.data??[]) as {id:string;assignment_id:string;score:number;total_points:number;submitted_at:string;marked_at:string|null;teacher_feedback:string}[])
        .map(x=>{
          const set=sets.get(assignmentMap.get(x.assignment_id)||'');
          return {id:x.id,title:set?.title||'Assessment',subject_name:set?.subject_name||'General',score:Number(x.score)||0,total_points:Number(x.total_points)||0,submitted_at:x.submitted_at,marked_at:x.marked_at,teacher_feedback:x.teacher_feedback||''};
        });
      setAssessmentRecords(rows);
      setRecordEvents((eventRows.data??[]) as RecordEvent[]);
      setLearningMemory((memoryRow.data??null) as MemoryDetail);
    } catch(reason) {
      setRecordError(reason instanceof Error?reason.message:'The learner record could not be loaded.');
      setAssessmentRecords([]);
      setRecordEvents([]);
      setLearningMemory(null);
    } finally { setRecordLoading(false); }
  };

  const visible=learners.filter(item=>{
    const value=[item.learner.student_id,item.learner.full_name,item.learner.preferred_name,item.learner.grade,item.learner.curriculum].join(' ').toLocaleLowerCase();
    return value.includes(search.trim().toLocaleLowerCase());
  });
  const active=learners.filter(item=>item.learner.account_status==='active').length;
  const minutes=learners.reduce((sum,item)=>sum+item.studyMinutes,0);
  const attempts=learners.reduce((sum,item)=>sum+item.submissions,0);
  const scored=learners.reduce((sum,item)=>sum+item.possible,0);
  const earned=learners.reduce((sum,item)=>sum+item.score,0);
  const average=scored>0?Math.round(earned/scored*100):null;

  return <div className="subpage">
    <div className="welcome-row">
      <div><div className="eyebrow"><TrendingUp size={14}/> LEARNER OUTCOMES</div><h1>Academic <span>progress.</span></h1><p className="page-subtitle">Review study activity, assigned work and assessment performance across your learners.</p></div>
      <button className="primary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing…':'Refresh data'}</button>
    </div>
    <section className="stats-grid" aria-label="Academic progress summary">
      <StatCard label="LEARNERS" value={String(learners.length)} detail={active+' active accounts'} icon={<Users size={19}/>}/>
      <StatCard label="STUDY TIME" value={(minutes/60).toFixed(1)+'h'} detail="Recorded study sessions" icon={<Clock3 size={19}/>}/>
      <StatCard label="SUBMISSIONS" value={String(attempts)} detail="Completed assessments and practice tests" icon={<FileText size={19}/>}/>
      <StatCard label="AVERAGE SCORE" value={average===null?'—':average+'%'} detail={scored?'Across automatically scored work':'No scored work yet'} icon={<Activity size={19}/>}/>
    </section>
    <label className="learners-search"><span>Find a learner</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search by Student ID, name, grade or curriculum"/></label>
    {updatedAt&&<p className="subtle-note">Last refreshed {new Date(updatedAt).toLocaleString()} · Study time and submitted work are read from the shared Studyspace database.</p>}
    {error&&<p className="inline-message error-message" role="alert">{error}</p>}
    <section className="panel learners-list-panel">
      {loading?<div className="classroom-empty">Loading learner progress…</div>:visible.length?visible.map(item=>{
        const percent=item.possible>0?Math.round(item.score/item.possible*100):null;
        return <article className="learner-row" key={item.learner.id}>
          <div className="learner-avatar">{(item.learner.preferred_name||item.learner.full_name||'S').slice(0,1).toUpperCase()}</div>
          <div className="learner-identity"><strong>{item.learner.preferred_name||item.learner.full_name||'Learner'}</strong><span>{item.learner.student_id||'No Student ID'} · {item.learner.grade||'Grade not set'} · {item.learner.curriculum||'Curriculum not set'}</span><small>{item.subjects.size} subjects · {item.assignments} assigned · {item.submissions} submitted</small></div>
          <span className="pin-status">{percent===null?'No score yet':percent+'% average'}</span>
          <div className="learner-actions"><span className="subtle-note">{Math.floor(item.studyMinutes/60)}h {item.studyMinutes%60}m study</span><small>{item.lastActivity?new Date(item.lastActivity).toLocaleDateString():'No activity yet'}</small><button type="button" className="subtle-button" onClick={()=>void loadLearnerRecord(item.learner.id)}>View records</button></div>
        </article>;
      }):<div className="classroom-empty"><Activity size={25}/><strong>{search?'No matching learners':'No learner activity yet'}</strong><span>{search?'Try another search term.':'Learner study sessions and completed assessments will appear here as they use Studyspace.'}</span></div>}
    </section>
    <p className="subtle-note">Scores include submitted teacher assignments and self-practice tests. Written responses awaiting teacher marking may not yet have a final score.</p>
    {selectedRecordId && <section className="panel monitor-progress-records">
      {(() => {
        const selected=learners.find(x=>x.learner.id===selectedRecordId)?.learner;
        const points=assessmentRecords.slice().reverse().map((x,i)=>{
          const value=x.total_points>0?Math.max(0,Math.min(100,x.score/x.total_points*100)):0;
          return {value,x:24+(assessmentRecords.length===1?236:i*472/(assessmentRecords.length-1)),y:178-value*1.48};
        });
        const line=points.map(p=>p.x+","+p.y).join(" ");
        const arrayText=(value:unknown):string[]=>Array.isArray(value)?value.map(x=>typeof x==="string"?x:JSON.stringify(x)).filter(Boolean).slice(0,8):[];
        return <>
          <div className="panel-heading"><div><h2>Student academic record</h2><p>{selected?.preferred_name||selected?.full_name||'Selected learner'} · {selected?.student_id||'No Student ID'} · {selected?.grade||'Grade not set'}</p></div><div><button type="button" className="subtle-button" onClick={()=>void loadLearnerRecord(selectedRecordId)} disabled={recordLoading}><RefreshCw size={14}/> Refresh</button><button type="button" className="icon-button" aria-label="Close student record" onClick={()=>setSelectedRecordId(null)}><X size={15}/></button></div></div>
          {recordError&&<p className="inline-message error-message" role="alert">{recordError}</p>}
          {recordLoading?<div className="classroom-empty">Loading this learner’s records…</div>:<>
            <div className="monitor-record-stat-row">
              <article><span>TESTS MARKED</span><strong>{assessmentRecords.length}</strong></article>
              <article><span>AVERAGE RESULT</span><strong>{assessmentRecords.length?Math.round(assessmentRecords.reduce((n,x)=>n+(x.total_points?x.score/x.total_points*100:0),0)/assessmentRecords.length)+'%':'—'}</strong></article>
              <article><span>PROGRESS EVENTS</span><strong>{recordEvents.length}</strong></article>
            </div>
            <div className="monitor-record-chart">
              <div><strong>Assessment history</strong><span>Score percentage by submitted assessment</span></div>
              {assessmentRecords.length?<svg viewBox="0 0 520 205" role="img" aria-label="Learner assessment scores from zero to one hundred percent">
                {[0,25,50,75,100].map(v=><g key={v}><line x1="24" x2="496" y1={178-v*1.48} y2={178-v*1.48}/><text x="2" y={182-v*1.48}>{v}</text></g>)}
                <polyline points={line} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4"><title>{Math.round(p.value)}%</title></circle>)}
              </svg>:<p>No assessment scores are recorded yet.</p>}
            </div>
            <div className="monitor-record-assessments">
              <strong>Past tests and marked work</strong>
              {assessmentRecords.length?assessmentRecords.map(x=><article key={x.id}><div><strong>{x.title}</strong><span>{x.subject_name} · {x.submitted_at?new Date(x.submitted_at).toLocaleDateString():'Date not recorded'}</span>{x.teacher_feedback&&<small>Teacher feedback: {x.teacher_feedback}</small>}</div><b>{x.total_points?Math.round(x.score/x.total_points*100)+'%':'Awaiting score'}</b></article>):<p>No past test records yet.</p>}
            </div>
            <div className="monitor-record-mia">
              <strong><Sparkles size={15}/> MIΛ learning observations</strong>
              <div className="monitor-record-mia-grid">
                <article><b>Strengths</b>{arrayText(learningMemory?.strengths).length?<ul>{arrayText(learningMemory?.strengths).map((x,i)=><li key={i}>{x}</li>)}</ul>:<p>No strengths have been recorded yet.</p>}</article>
                <article><b>Areas to focus on</b>{arrayText(learningMemory?.difficulties).length?<ul>{arrayText(learningMemory?.difficulties).map((x,i)=><li key={i}>{x}</li>)}</ul>:<p>No focus areas have been recorded yet.</p>}</article>
              </div>
              {arrayText(learningMemory?.goals).length>0&&<p><b>Goals:</b> {arrayText(learningMemory?.goals).join(' · ')}</p>}
              {arrayText(learningMemory?.recent_topics).length>0&&<p><b>Recent topics:</b> {arrayText(learningMemory?.recent_topics).join(' · ')}</p>}
              <small>{learningMemory?.updated_at?'MIΛ notes last updated '+new Date(learningMemory.updated_at).toLocaleString():'MIΛ has not saved a learning summary for this learner yet.'}</small>
            </div>
            <div className="monitor-record-events"><strong>Other learning records</strong>{recordEvents.length?recordEvents.slice(0,12).map(x=><article key={x.id}><span>{x.event_type.replaceAll('_',' ')}</span><time>{new Date(x.created_at).toLocaleString()}</time>{x.score!==null&&x.max_score? <b>{x.score}/{x.max_score}</b>:null}</article>):<p>No other learning records recorded yet.</p>}</div>
          </>}
        </>;
      })()}
    </section>}
  </div>;
}

function Overview({ navigate, supabaseConfigured }: { navigate: (page: Page) => void; supabaseConfigured: boolean }) {
  const [stats, setStats] = useState<{ learners: number; activeLearners: number; activePins: number; sessions: number } | null>(null);
  const [activity, setActivity] = useState<{ id: number; event_type: string; created_at: string }[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const refreshOverview = async () => {
    if (!supabase) { setStatsLoading(false); setStatsError("Supabase is not configured."); return; }
    setStatsLoading(true);
    setStatsError("");
    const now = new Date().toISOString();
    const [learners, activeLearners, pins, sessions, events] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "learner"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "learner").eq("account_status", "active"),
      supabase.from("enrolment_pins").select("id", { count: "exact", head: true }).is("redeemed_at", null).is("revoked_at", null).gt("expires_at", now),
      supabase.from("study_sessions").select("id", { count: "exact", head: true }),
      supabase.from("audit_events").select("id,event_type,created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    const failed = [learners.error, activeLearners.error, pins.error, sessions.error, events.error].find(Boolean);
    if (failed) {
      setStatsError("Some dashboard data could not be loaded. Confirm the latest Studyspace database migrations and administrator permissions, then refresh.");
      setStats(null);
      setActivity([]);
    } else {
      setStats({
        learners: learners.count ?? 0,
        activeLearners: activeLearners.count ?? 0,
        activePins: pins.count ?? 0,
        sessions: sessions.count ?? 0,
      });
      setActivity((events.data ?? []) as { id: number; event_type: string; created_at: string }[]);
    }
    setStatsLoading(false);
  };

  useEffect(() => { void refreshOverview(); }, []);

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> ADMINISTRATOR CONSOLE</div>
          <h1>Your learning <span>at a glance.</span></h1>
          <p className="page-subtitle">Manage your learners, enrolment access and academic activity from one place.</p>
        </div>
        <button className="primary-button" onClick={() => navigate('Access PINs')}><Plus size={17} /> Generate PIN</button>
      </div>

      <div className="setup-banner">
        <div className="setup-banner-icon"><ShieldCheck size={21} /></div>
        <div className="setup-banner-copy">
          <strong>{supabaseConfigured ? 'Studyspace connection configured' : 'Connect your Studyspace workspace'}</strong>
          <p>{supabaseConfigured ? 'The Monitor is connected to the shared Studyspace project. Live dashboard records are checked below.' : 'The dashboard remains locked until its Supabase project URL and publishable key are configured.'}</p>
        </div>
        <button className="text-button" onClick={() => navigate('Settings')}>Connection settings <ArrowUpRight size={15} /></button>
      </div>

      <section className="stats-grid" aria-label="Workspace summary">
        <StatCard label="Total learners" value={statsLoading ? "…" : stats ? String(stats.learners) : "—"} detail={stats ? stats.activeLearners + " active" : "Live database count"} icon={<Users size={19} />} />
        <StatCard label="Active PINs" value={statsLoading ? "…" : stats ? String(stats.activePins) : "—"} detail="Unused and not expired" icon={<KeyRound size={19} />} />
        <StatCard label="Active learners" value={statsLoading ? "…" : stats ? String(stats.activeLearners) : "—"} detail="Accounts allowed to sign in" icon={<CheckCircle2 size={19} />} />
        <StatCard label="Study sessions" value={statsLoading ? "…" : stats ? String(stats.sessions) : "—"} detail="Recorded learner sessions" icon={<Activity size={19} />} />
      </section>
      <div className="dashboard-refresh-row">
        {statsError && <p className="inline-message error-message" role="alert">{statsError}</p>}
        <button className="subtle-button" onClick={() => void refreshOverview()} disabled={statsLoading}>{statsLoading ? "Refreshing…" : "Refresh live counts"}</button>
      </div>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div><h2>Recent activity</h2><p>Latest account and workspace events</p></div>
            <button className="subtle-button" onClick={() => void refreshOverview()} disabled={statsLoading}>Refresh <ArrowUpRight size={14} /></button>
          </div>
          {activity.length ? <div className="dashboard-activity-list">{activity.map(event => <article className="dashboard-activity-row" key={event.id}>
            <span className="activity-event-dot" />
            <div><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{new Date(event.created_at).toLocaleString()}</small></div>
          </article>)}</div> : <div className="empty-activity">
            <div className="empty-illustration">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="illustration-core"><Activity size={27} /></div>
              <span className="float-dot dot-one" /><span className="float-dot dot-two" />
            </div>
            <strong>{statsLoading ? "Loading recent activity…" : statsError ? "Activity is unavailable" : "Your activity feed is waiting"}</strong>
            <p>When administrators create invitations and learners join or study, their recorded events will appear here.</p>
          </div>}
        </section>

        <section className="panel quick-panel">
          <div className="panel-heading"><div><h2>Quick actions</h2><p>Manage your workspace</p></div><SlidersHorizontal size={17} className="muted-icon" /></div>
          <button className="quick-action" onClick={() => navigate('Access PINs')}>
            <span className="quick-icon purple"><KeyRound size={18} /></span>
            <span><strong>Access PINs</strong><small>Renew an expired learner account</small></span>
            <ArrowUpRight size={16} />
          </button>
          <button className="quick-action" onClick={() => navigate('Learners')}>
            <span className="quick-icon blue"><Users size={18} /></span>
            <span><strong>Manage learners</strong><small>View learner accounts</small></span>
            <ArrowUpRight size={16} />
          </button>
          <button className="quick-action" onClick={() => navigate('Content Studio')}>
            <span className="quick-icon green"><BookOpen size={18} /></span>
            <span><strong>Content Studio</strong><small>Prepare learning materials</small></span>
            <ArrowUpRight size={16} />
          </button>
          <div className="quick-note"><LockKeyhole size={14} /> Administrator access and privileged actions require verified MFA.</div>
        </section>
      </div>

      <footer className="page-footer"><span>STUDYSPACE MONITOR <b>·</b> FOUNDATION 0.3</span><span>Live workspace data.</span></footer>
    </>
  )
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>
}

function PinPage() {
  type LegacyPinRecord = { id: string; student_id: string | null; expires_at: string; redeemed_at: string | null; revoked_at: string | null; created_at: string };
  type ExpiredLearner = {
    id: string;
    student_id: string;
    full_name: string | null;
    preferred_name: string | null;
    subscription_tier: string | null;
    subscription_expires_at: string | null;
    trial_expires_at: string | null;
  };
  type PlanTier = "weekly" | "two_weeks" | "monthly";
  const [legacyPins, setLegacyPins] = useState<LegacyPinRecord[]>([]);
  const [expiredLearners, setExpiredLearners] = useState<ExpiredLearner[]>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("monthly");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newPin, setNewPin] = useState<{ pin: string; studentId: string; planTier: PlanTier; expiresAt: string } | null>(null);

  const refresh = async () => {
    if (!supabase) return;
    const [legacyResult, learnersResult] = await Promise.all([
      supabase.from("enrolment_pins")
        .select("id,student_id,expires_at,redeemed_at,revoked_at,created_at")
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("profiles")
        .select("id,student_id,full_name,preferred_name,subscription_tier,subscription_expires_at,trial_expires_at")
        .eq("role", "learner").eq("account_status", "active")
        .order("full_name", { ascending: true })
    ]);

    if (legacyResult.error) setError("Could not load legacy invitation history.");
    else setLegacyPins((legacyResult.data ?? []) as LegacyPinRecord[]);

    if (learnersResult.error) {
      setError("Could not load active learner records. Check administrator database permissions.");
      return;
    }
    const eligible = ((learnersResult.data ?? []) as ExpiredLearner[]).filter(learner => {
      if (!/^STU-[A-Z0-9]{8}$/.test(String(learner.student_id ?? ""))) return false;
      const expiry = learner.subscription_tier
        ? learner.subscription_expires_at
        : learner.trial_expires_at;
      return !expiry || new Date(expiry).getTime() <= Date.now();
    });
    setExpiredLearners(eligible);
    setSelectedLearnerId(current => eligible.some(learner => learner.id === current) ? current : (eligible[0]?.id ?? ""));
  };

  useEffect(() => { void refresh(); }, []);

  const selectedLearner = expiredLearners.find(learner => learner.id === selectedLearnerId);
  const planNames: Record<PlanTier, string> = {
    weekly: "Weekly · 7 days",
    two_weeks: "2 weeks · 14 days",
    monthly: "Monthly · 28 days",
  };

  const createPin = async () => {
    if (!supabase) { setError("Connect Supabase before issuing an access PIN."); return; }
    if (!selectedLearner?.student_id) { setError("Select a learner whose trial or current plan has expired."); return; }
    setBusy(true); setError(""); setNotice(""); setNewPin(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("create-access-pin", {
        body: { studentId: selectedLearner.student_id, planTier: selectedPlan }
      });
      if (invokeError) throw invokeError;
      if (data?.success !== true || !data?.pin || !data?.studentId || !data?.expiresAt) {
        throw new Error(data?.error || "The server did not return a new access PIN.");
      }
      setNewPin({
        pin: String(data.pin),
        studentId: String(data.studentId),
        planTier: selectedPlan,
        expiresAt: String(data.expiresAt),
      });
      setNotice("Renewal PIN issued. Copy it once and deliver it privately to the learner.");
      await refresh();
    } catch (reason) {
      setError(await describeFunctionError(reason, "Access PIN creation failed."));
    } finally {
      setBusy(false);
    }
  };

  const revokeLegacyPin = async (id: string) => {
    if (!supabase || !window.confirm("Revoke this unused legacy enrolment PIN? It cannot be redeemed afterwards.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("manage-enrolment-pin", { body: { pinId: id } });
      if (invokeError) throw invokeError;
      if (!data?.success) throw new Error(data?.error || "The legacy PIN could not be revoked.");
      setNotice(data.message || "Legacy PIN revoked.");
      await refresh();
    } catch (reason) {
      setError(await describeFunctionError(reason, "Legacy PIN revocation failed."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied. Deliver this information privately.");
    } catch {
      setNotice("Clipboard access is unavailable. Select and copy the value manually.");
    }
  };

  return <div className="subpage">
    <div className="eyebrow">ACCESS MANAGEMENT</div>
    <h1>Student Access PINs</h1>
    <p className="page-subtitle">New learners register directly in StudySpace Student. Issue a one-time PIN only for an existing learner after their 48-hour trial or current paid plan has expired.</p>

    <div className="panel pin-create-panel">
      <div className="panel-heading"><div><h2>Issue a renewal PIN</h2><p>Requires an active administrator session with MFA verified. The PIN is tied to one Student ID.</p></div><KeyRound size={20}/></div>
      {expiredLearners.length ? <>
        <div className="pin-create-controls access-pin-admin-controls">
          <label>Expired learner
            <select value={selectedLearnerId} onChange={event => { setSelectedLearnerId(event.target.value); setNewPin(null); }}>
              {expiredLearners.map(learner => <option key={learner.id} value={learner.id}>{learner.student_id} · {learner.preferred_name || learner.full_name || "Learner"}</option>)}
            </select>
          </label>
          <label>Access plan
            <select value={selectedPlan} onChange={event => { setSelectedPlan(event.target.value as PlanTier); setNewPin(null); }}>
              <option value="weekly">Weekly · 7 days</option>
              <option value="two_weeks">2 weeks · 14 days</option>
              <option value="monthly">Monthly · 28 days</option>
            </select>
          </label>
          <button type="button" className="primary-button" onClick={() => void createPin()} disabled={busy || !selectedLearner}>
            {busy ? "Working…" : "Generate renewal PIN"}
          </button>
        </div>
        <p className="subtle-note">Issue this PIN only after the learner’s payment has been verified. The PIN expires 24 hours after it is created; the selected access period starts when the learner redeems it.</p>
      </> : <div className="classroom-empty"><LockKeyhole size={24}/><strong>No expired learner accounts</strong><span>New learners can register without a PIN. Renewal PINs become available here after a learner’s free trial or paid plan ends.</span></div>}

      {newPin && <div className="pin-issued-card">
        <strong>Renewal PIN · shown once</strong>
        <div><span>Student ID</span><code>{newPin.studentId}</code><button type="button" className="subtle-button" onClick={() => void copy(newPin.studentId)}>Copy ID</button></div>
        <div><span>Access PIN</span><code>{newPin.pin}</code><button type="button" className="subtle-button" onClick={() => void copy(newPin.pin)}>Copy PIN</button></div>
        <small>{planNames[newPin.planTier]} · Expires {new Date(newPin.expiresAt).toLocaleString()}. The learner redeems it from the Subscription page using the same Student ID account.</small>
      </div>}
      {notice && <p className="inline-message" role="status">{notice}</p>}
      {error && <p className="inline-message error-message" role="alert">{error}</p>}
      <div className="setting-row"><div><strong>Refresh learner eligibility</strong><span>The list includes active learner accounts whose current trial or plan has ended.</span></div><button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    </div>

    <div className="panel pin-history-panel">
      <div className="panel-heading"><div><h2>Legacy enrolment invitation history</h2><p>{legacyPins.length} older record(s) · retained for audit and revocation</p></div><button type="button" className="subtle-button" onClick={() => void refresh()}>Refresh</button></div>
      {legacyPins.length ? <div className="pin-history-list">{legacyPins.map(pin => {
        const status = pin.redeemed_at ? "Redeemed" : pin.revoked_at ? "Revoked" : new Date(pin.expires_at).getTime() < Date.now() ? "Expired" : "Unused";
        return <article key={pin.id}><div><strong>{pin.student_id || "Student ID unavailable"}</strong><small>Created {new Date(pin.created_at).toLocaleDateString()} · Expires {new Date(pin.expires_at).toLocaleDateString()}</small></div><span className={"pin-status " + status.toLowerCase()}>{status}</span>{status === "Unused" && <button type="button" className="text-button" disabled={busy} onClick={() => void revokeLegacyPin(pin.id)}>Revoke</button>}</article>;
      })}</div> : <div className="classroom-empty"><KeyRound size={24}/><strong>No legacy invitations</strong><span>New learner registration is now self-service and does not use pre-issued Student IDs or PINs.</span></div>}
    </div>
  </div>;
}

function SettingsPage({ supabaseConfigured, theme, onThemeChange, onOpenTimetable }: {
  supabaseConfigured: boolean;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenTimetable: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<{ label: string; ok: boolean; detail: string }[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const [sessionError, setSessionError] = useState('');

  async function changeAdminPassword() {
    if (!supabase || passwordBusy) return;
    setPasswordError('');
    setPasswordNotice('');
    if (newPassword.length < 12) { setPasswordError('Use at least 12 characters for your new password.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('The password confirmation does not match.'); return; }
    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Your administrator password has been updated.');
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : 'Your password could not be updated. Try again.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function signOutOtherAdminSessions() {
    if (!supabase || sessionBusy) return;
    setSessionBusy(true);
    setSessionError('');
    setSessionNotice('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      setSessionNotice('Other signed-in Monitor sessions have been revoked. This device remains signed in and MFA stays required.');
    } catch (reason) {
      setSessionError(reason instanceof Error ? reason.message : 'Other sessions could not be revoked. Try again.');
    } finally {
      setSessionBusy(false);
    }
  }

  async function runWorkspaceChecks() {
    if (!supabase) return;
    setChecking(true);
    const results = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "learner"),
      supabase.from("student_timetable_entries").select("id", { count: "exact", head: true }),
      supabase.from("exercise_assignments").select("id", { count: "exact", head: true }),
      supabase.from("student_goals").select("learner_id", { count: "exact", head: true }),
    ]);
    const labels = ["Learner records", "Timetable records", "Homework assignments", "Student study plans"];
    setChecks(results.map((result, index) => ({
      label: labels[index],
      ok: !result.error,
      detail: result.error ? result.error.message : String(result.count ?? 0) + " record(s) accessible",
    })));
    setCheckedAt(new Date().toISOString());
    setChecking(false);
  }

  return <div className="subpage">
    <div className="eyebrow">CONFIGURATION &amp; OPERATIONS</div>
    <h1>Workspace settings</h1>
    <p className="page-subtitle">Control your Monitor workspace, inspect the shared StudySpace services and review the safeguards applied to learner accounts.</p>

    <div className="panel settings-card">
      <div className="panel-heading"><div><h2>Appearance</h2><p>Set the Monitor display theme on this device.</p></div><Sun size={19}/></div>
      <div className="theme-options" role="group" aria-label="Monitor appearance">
        <button type="button" className={theme === "light" ? "chosen" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}><Sun size={15}/> Light</button>
        <button type="button" className={theme === "dark" ? "chosen" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}><Moon size={15}/> Dark</button>
      </div>
    </div>

    <NotificationPreferencesPanel />

    <div className="panel settings-card">
      <div className="panel-heading"><div><h2>Administrator security</h2><p>Change the password for the account that controls StudySpace Monitor. MFA remains mandatory.</p></div><LockKeyhole size={19}/></div>
      <div className="settings-form-grid">
        <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="At least 12 characters"/></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter it again"/></label>
      </div>
      {passwordError && <p className="inline-message error-message" role="alert">{passwordError}</p>}
      {passwordNotice && <p className="inline-message" role="status">{passwordNotice}</p>}
      <div className="setting-row"><div><strong>Change administrator password</strong><span>Use a unique password that you do not reuse on another service.</span></div><button type="button" className="primary-button" onClick={() => void changeAdminPassword()} disabled={!supabaseConfigured || passwordBusy || !newPassword || !confirmPassword}>{passwordBusy ? 'Updating…' : 'Update password'}</button></div>
      {sessionError && <p className="inline-message error-message" role="alert">{sessionError}</p>}
      {sessionNotice && <p className="inline-message" role="status">{sessionNotice}</p>}
      <div className="setting-row"><div><strong>Other signed-in devices</strong><span>Revoke other Monitor browser sessions without signing out this device.</span></div><button type="button" className="secondary-button" onClick={() => void signOutOtherAdminSessions()} disabled={!supabaseConfigured || sessionBusy}><LockKeyhole size={15}/>{sessionBusy ? 'Revoking…' : 'Sign out other devices'}</button></div>
    </div>

    <div className="panel settings-card">
      <div className="panel-heading"><div><h2>Workspace diagnostics</h2><p>Run read-only checks against the shared learner, timetable, homework and study-plan records.</p></div><Activity size={19}/></div>
      <div className="setting-row">
        <div><strong>Database access check</strong><span>{checkedAt ? "Last checked " + new Date(checkedAt).toLocaleString() : "No diagnostic run has been completed in this session."}</span></div>
        <button type="button" className="primary-button" onClick={() => void runWorkspaceChecks()} disabled={!supabaseConfigured || checking}><RefreshCw size={15}/>{checking ? "Checking…" : "Run workspace checks"}</button>
      </div>
      {checks.length > 0 && <div className="privacy-list" aria-live="polite">{checks.map(item => <p key={item.label}><span className={item.ok ? "status-dot" : "status-dot status-error"}/><strong>{item.label}:</strong> {item.ok ? "Available" : "Check failed"} · {item.detail}</p>)}</div>}
    </div>

    <div className="panel settings-card">
      <div className="panel-heading"><div><h2>Connected applications</h2><p>Student and Monitor are two interfaces to the same StudySpace backend.</p></div><BookOpen size={19}/></div>
      <div className="settings-row"><div className="settings-symbol"><GraduationCap size={19}/></div><div><strong>StudySpace Student</strong><p>Open the learner-facing planner to inspect the student experience, assignments and study timetable.</p></div><a className="secondary-button" href="https://mayendzeke.github.io/planner/" target="_blank" rel="noreferrer">Open Student app <ArrowUpRight size={14}/></a></div>
      <div className="settings-divider"/>
      <div className="settings-row"><div className="settings-symbol"><CalendarDays size={19}/></div><div><strong>Central timetable</strong><p>View only the classes and lessons you have published to learners. Open an individual learner from Learners to inspect their timetable.</p></div><button type="button" className="secondary-button" onClick={onOpenTimetable}>Open timetable <ArrowUpRight size={14}/></button></div>
    </div>

    <div className="panel settings-card">
      <div className="panel-heading"><div><h2>Platform safeguards</h2><p>Critical controls stay enforced by the backend and cannot be weakened from a browser setting.</p></div><ShieldCheck size={19}/></div>
      <div className="settings-row"><div className="settings-symbol"><LockKeyhole size={19}/></div><div><strong>Administrator MFA</strong><p>Monitor requires a verified administrator AAL2 session before showing the workspace or allowing privileged actions.</p></div><span className="connection-pill"><i/> Required</span></div>
      <div className="settings-divider"/>
      <div className="settings-row"><div className="settings-symbol"><Users size={19}/></div><div><strong>Child and guardian verification</strong><p>Under-18 access remains subject to the StudySpace guardian-verification workflow. Do not bypass pending guardian consent from the account editor.</p></div><span className="connection-pill"><i/> Enforced</span></div>
      <div className="settings-divider"/>
      <div className="settings-row"><div className="settings-symbol"><ShieldAlert size={19}/></div><div><strong>Controlled learner enrolment</strong><p>New learners self-register without a pre-issued Student ID or PIN. The server generates each Student ID and starts a 48-hour trial for adult learners. After a trial or paid plan expires, an authorised administrator can issue a one-time renewal PIN tied to that learner. Minimum age 9, current Terms v8, guardian verification, rate limits and the 100-learner capacity control remain enforced.</p></div><span className="connection-pill"><i/> Open</span></div>
    </div>

    <div className="security-note"><LockKeyhole size={17}/><p><strong>Credential handling.</strong> Student IDs are generated automatically. Deliver renewal PINs and reset credentials directly to the learner. Never place a Supabase secret/service-role key, database password or function pepper in browser variables or frontend code.</p></div>
  </div>
}

export default App
