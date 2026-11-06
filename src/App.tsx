import ContentStudio from './components/ContentStudio'
import ClassroomStudio from './components/ClassroomStudio'
import LearnersPage from './components/LearnersPage'
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
  SlidersHorizontal, Users, X, KeyRound, Sparkles, Moon, Sun,
  Clock3, FileText, RefreshCw, TrendingUp,
} from 'lucide-react'

type Page = 'Overview' | 'Learners' | 'Content Studio' | 'Classroom Studio' | 'Enrolment PINs' | 'Academic progress' | 'Settings'
type Theme = 'light' | 'dark'

const navigation: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Learners', icon: Users },
  { label: 'Content Studio', icon: PenTool },
  { label: 'Classroom Studio', icon: BookOpen },
  { label: 'Enrolment PINs', icon: KeyRound },
  { label: 'Academic progress', icon: Activity },
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
  const [adminAllowed, setAdminAllowed] = useState(false)
  const [mfaVerified, setMfaVerified] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [adminName, setAdminName] = useState('Administrator')
  const handleMfaVerified = useCallback(() => setMfaVerified(true), [])

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

  if (!isSupabaseConfigured || !supabase) return <AuthGate mode="unconfigured" error="" onError={setAuthError} />
  if (passwordRecovery) return <AuthGate mode="recovery" error={authError} onError={setAuthError} />
  if (authLoading || adminLoading) return <SplashScreen theme={theme} />
  if (!session || !adminAllowed) return <AuthGate mode="signin" error={authError} onError={setAuthError} />
  if (!mfaVerified) return <AdminMfaGate onVerified={handleMfaVerified} />

  return (
    <div className="app-shell" data-theme={theme}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={23} strokeWidth={2.2} /></div>
          <div className="brand-copy"><strong>studyspace<span>.</span></strong><small>MONITOR</small></div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <button type="button" className="workspace-switcher" onClick={() => navigate('Settings')} aria-label="Open workspace settings">
          <span className="workspace-avatar">SZ</span>
          <span className="workspace-copy"><strong>{adminName}</strong><small>Administrator workspace</small></span>
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
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={18} /></div>
            <strong>Need a hand?</strong>
            <p>Your learner workspace is being prepared.</p>
            <button onClick={() => navigate('Settings')}>View setup guide <ArrowUpRight size={14} /></button>
          </div>
          <div className="sidebar-profile">
            <div className="profile-avatar">A</div>
            <div className="profile-copy"><strong>{adminName}</strong><small>Authenticated administrator</small></div>

          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="system-status"><span className="status-dot" /> MFA verified</div>
            <button className="theme-switch" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span><i className={theme === 'dark' ? 'switch-knob is-dark' : 'switch-knob'} />
            </button>
            <NotificationCenter />
            <div className="top-avatar">{adminName.slice(0,1).toUpperCase()}</div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}><LockKeyhole size={16} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {page === 'Overview' && <Overview navigate={navigate} supabaseConfigured={isSupabaseConfigured} />}
          {page === 'Learners' && <LearnersPage onCreatePin={() => navigate('Enrolment PINs')} />}
          {page === 'Content Studio' && <ContentStudio />}
          {page === 'Classroom Studio' && <ClassroomStudio />}
          {page === 'Enrolment PINs' && <PinPage />}
          {page === 'Academic progress' && <AcademicProgressPage />}
          {page === 'Settings' && <SettingsPage supabaseConfigured={isSupabaseConfigured} />}
        </div>
      </main>
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
          <div className="learner-actions"><span className="subtle-note">{Math.floor(item.studyMinutes/60)}h {item.studyMinutes%60}m study</span><small>{item.lastActivity?new Date(item.lastActivity).toLocaleDateString():'No activity yet'}</small></div>
        </article>;
      }):<div className="classroom-empty"><Activity size={25}/><strong>{search?'No matching learners':'No learner activity yet'}</strong><span>{search?'Try another search term.':'Learner study sessions and completed assessments will appear here as they use Studyspace.'}</span></div>}
    </section>
    <p className="subtle-note">Scores include submitted teacher assignments and self-practice tests. Written responses awaiting teacher marking may not yet have a final score.</p>
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
        <button className="primary-button" onClick={() => navigate('Enrolment PINs')}><Plus size={17} /> Generate PIN</button>
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
          <button className="quick-action" onClick={() => navigate('Enrolment PINs')}>
            <span className="quick-icon purple"><KeyRound size={18} /></span>
            <span><strong>Enrolment PINs</strong><small>Invite a learner to join</small></span>
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
  type PinRecord = { id: string; student_id: string | null; expires_at: string; redeemed_at: string | null; revoked_at: string | null; created_at: string }
  const [pins, setPins] = useState<PinRecord[]>([])
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [newPin, setNewPin] = useState<{ pin: string; studentId: string; expiresAt: string } | null>(null)

  const refresh = async () => {
    if (!supabase) return
    const { data, error: loadError } = await supabase.from('enrolment_pins')
      .select('id,student_id,expires_at,redeemed_at,revoked_at,created_at')
      .order('created_at', { ascending: false }).limit(30)
    if (loadError) setError('Could not load enrolment records. Check the database migration and administrator permissions.')
    else setPins((data ?? []) as PinRecord[])
  }
  useEffect(() => { void refresh() }, [])

  const createPin = async () => {
    if (!supabase) { setError('Connect Supabase before creating enrolment PINs.'); return }
    setBusy(true); setError(''); setNotice(''); setNewPin(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-enrolment-pin', { body: { expiresInDays: Number(expiresInDays) } })
      if (invokeError) throw invokeError
      if (!data?.pin || !data?.studentId) throw new Error(data?.error || 'The server did not return the new enrolment details.')
      setNewPin({ pin: data.pin, studentId: data.studentId, expiresAt: data.expiresAt })
      setNotice('New learner access created. Copy both values and deliver them privately.')
      await refresh()
    } catch (reason) { setError(await describeFunctionError(reason, 'PIN creation failed.')) }
    finally { setBusy(false) }
  }
  const revokePin = async (id: string) => {
    if (!supabase || !window.confirm('Revoke this unused enrolment PIN? It cannot be redeemed afterwards.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-enrolment-pin', { body: { pinId: id } })
      if (invokeError) throw invokeError
      if (!data?.success) throw new Error(data?.error || 'The PIN could not be revoked.')
      setNotice(data.message || 'PIN revoked.')
      await refresh()
    } catch (reason) { setError(await describeFunctionError(reason, 'PIN revocation failed.')) }
    finally { setBusy(false) }
  }
  const copy = (value: string) => { void navigator.clipboard?.writeText(value).then(() => setNotice('Copied. Deliver this information privately.')).catch(() => setNotice('Clipboard access is unavailable. Select and copy the value manually.')) }

  return <div className="subpage">
    <div className="eyebrow">ACCESS MANAGEMENT</div><h1>Enrolment PINs</h1><p className="page-subtitle">Create one-time invitations with a generated Student ID. PINs are hashed on the server and shown only once.</p>
    <div className="panel pin-create-panel">
      <div className="panel-heading"><div><h2>Create learner access</h2><p>Requires an authenticated administrator with MFA verified.</p></div><KeyRound size={20}/></div>
      <div className="pin-create-controls"><label>PIN expiry<select value={expiresInDays} onChange={e=>setExpiresInDays(e.target.value)}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label><button className="primary-button" onClick={()=>void createPin()} disabled={busy}>{busy?'Working…':'Generate Student ID + PIN'}</button></div>
      {newPin && <div className="pin-issued-card"><strong>New learner credentials · shown once</strong><div><span>Student ID</span><code>{newPin.studentId}</code><button className="subtle-button" onClick={()=>copy(newPin.studentId)}>Copy ID</button></div><div><span>One-time PIN</span><code>{newPin.pin}</code><button className="subtle-button" onClick={()=>copy(newPin.pin)}>Copy PIN</button></div><small>Expires {new Date(newPin.expiresAt).toLocaleString()}. Keep these details private and deliver them directly to the learner.</small></div>}
      {notice&&<p className="inline-message" role="status">{notice}</p>}{error&&<p className="inline-message error-message" role="alert">{error}</p>}
    </div>
    <div className="panel pin-history-panel">
      <div className="panel-heading"><div><h2>Recent invitations</h2><p>{pins.length} recent record(s)</p></div><button className="subtle-button" onClick={()=>void refresh()}>Refresh</button></div>
      {pins.length ? <div className="pin-history-list">{pins.map(pin=>{const status=pin.redeemed_at?'Redeemed':pin.revoked_at?'Revoked':new Date(pin.expires_at).getTime()<Date.now()?'Expired':'Unused';return <article key={pin.id}><div><strong>{pin.student_id || 'Student ID unavailable'}</strong><small>Created {new Date(pin.created_at).toLocaleDateString()} · Expires {new Date(pin.expires_at).toLocaleDateString()}</small></div><span className={'pin-status '+status.toLowerCase()}>{status}</span>{status==='Unused'&&<button className="text-button" disabled={busy} onClick={()=>void revokePin(pin.id)}>Revoke</button>}</article>})}</div> : <div className="classroom-empty"><KeyRound size={24}/><strong>No invitations yet</strong><span>Create a PIN to invite your first learner.</span></div>}
    </div>
  </div>
}


function SettingsPage({ supabaseConfigured }: { supabaseConfigured: boolean }) {
  return <div className="subpage">
    <div className="eyebrow">CONFIGURATION</div><h1>Workspace settings</h1><p className="page-subtitle">Prepare the secure services that power Studyspace Monitor.</p>
    <div className="panel settings-card">
      <div className="settings-row"><div className="settings-symbol"><ShieldCheck size={19} /></div><div><strong>Authentication and database</strong><p>The current deployment is connected to the Studyspace Supabase project. The latest automated smoke check confirmed that the public learner enrolment and sign-in Edge Functions respond from the student app origin; it does not certify every table or feature.</p></div><span className="connection-pill"><i /> {supabaseConfigured ? 'Auth functions checked' : 'Not configured'}</span></div>
      <div className="settings-divider" />
      <div className="settings-row"><div className="settings-symbol"><BookOpen size={19} /></div><div><strong>Studyspace Planner integration</strong><p>Student ID enrolment, sign-in and profile onboarding use the shared Supabase project. The student Planner synchronises its profile, subjects, tasks, study history, academic periods, calendar events and personal files when online, while retaining an account-separated offline copy. Assignments, submissions and live classroom sessions use the shared backend.</p></div><span className="connection-pill"><i /> Shared workspace</span></div>
      <div className="settings-divider" />
      <div className="settings-row"><div className="settings-symbol"><LockKeyhole size={19} /></div><div><strong>Security controls</strong><p>Administrator access is gated by verified MFA (AAL2). Server-side functions check active administrator permissions; learner sign-in and enrolment are rate-limited. Protected database operations also depend on the production RLS migrations.</p></div><span className="connection-pill"><i /> MFA-gated</span></div>
    </div>
    <div className="security-note"><LockKeyhole size={17} /><p><strong>Keep credentials private.</strong> Deliver Student IDs, one-time PINs and reset passwords directly to the learner. Never place a Supabase secret/service-role key, database password or function pepper in browser variables or frontend code.</p></div>
  </div>
}

export default App
