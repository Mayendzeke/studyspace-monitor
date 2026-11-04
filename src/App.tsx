import ContentStudio from './components/ContentStudio'
import AuthGate from './components/AuthGate'
import AdminMfaGate from './components/AdminMfaGate'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, Bell, BookOpen, FileText, PenTool, ClipboardCheck,
  CheckCircle2, ChevronDown, CircleHelp, GraduationCap, LayoutDashboard,
  LockKeyhole, Menu, MoreHorizontal, Plus, Settings, ShieldCheck,
  SlidersHorizontal, Users, X, KeyRound, Sparkles, Moon, Sun,
} from 'lucide-react'

type Page = 'Overview' | 'Learners' | 'Content Studio' | 'Enrolment PINs' | 'Academic progress' | 'Settings'
type Theme = 'light' | 'dark'

const navigation: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Learners', icon: Users },
  { label: 'Content Studio', icon: PenTool },
  { label: 'Enrolment PINs', icon: KeyRound },
  { label: 'Academic progress', icon: Activity },
  { label: 'Settings', icon: Settings },
]

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminAllowed, setAdminAllowed] = useState(false)
  const [mfaVerified, setMfaVerified] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [adminName, setAdminName] = useState('Administrator')
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) { setAdminAllowed(false); setMfaVerified(false) }
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
  if (authLoading || adminLoading) return <div className="auth-screen"><div className="auth-card"><div className="auth-spinner" /><p>Verifying administrator access…</p></div></div>
  if (!session || !adminAllowed) return <AuthGate mode="signin" error={authError} onError={setAuthError} />
  if (!mfaVerified) return <AdminMfaGate onVerified={() => setMfaVerified(true)} />

  return (
    <div className="app-shell" data-theme={theme}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={23} strokeWidth={2.2} /></div>
          <div className="brand-copy"><strong>studyspace<span>.</span></strong><small>MONITOR</small></div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">SZ</div>
          <div className="workspace-copy"><strong>{adminName}</strong><small>Administrator workspace</small></div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => navigate(label)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {label === 'Learners' && <span className="nav-count">0</span>}
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
            <MoreHorizontal size={19} className="muted-icon" />
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
            <div className="system-status"><span className="status-dot" /> Authenticated</div>
            <button className="theme-switch" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span><i className={theme === 'dark' ? 'switch-knob is-dark' : 'switch-knob'} />
            </button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="top-avatar">{adminName.slice(0,1).toUpperCase()}</div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void supabase?.auth.signOut()}><LockKeyhole size={16} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {page === 'Overview' && <Overview navigate={navigate} />}
          {page === 'Learners' && <EmptyPage icon={<Users size={25} />} title="Learner accounts" description="When learner accounts are connected, select a learner's preferred name to open their individual workspace. From there, you will be able to review their subjects and progress, assign resources, and create learning activities for them." action="Create an enrolment PIN" onAction={() => navigate('Enrolment PINs')} />}
          {page === 'Content Studio' && <ContentStudio />}
          {page === 'Enrolment PINs' && <PinPage />}
          {page === 'Academic progress' && <EmptyPage icon={<Activity size={25} />} title="Academic progress" description="Once learners are connected, this area will summarise study activity, subject progress and planner engagement." />}
          {page === 'Settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}

function Overview({ navigate }: { navigate: (page: Page) => void }) {
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
          <strong>Let's connect your Studyspace workspace</strong>
          <p>The dashboard interface is ready. Connect a secure backend before creating real learner accounts or enrolment PINs.</p>
        </div>
        <button className="text-button" onClick={() => navigate('Settings')}>Continue setup <ArrowUpRight size={15} /></button>
      </div>

      <section className="stats-grid" aria-label="Workspace summary">
        <StatCard label="Total learners" value="0" detail="No accounts registered" icon={<Users size={19} />} />
        <StatCard label="Active PINs" value="0" detail="No invitations issued" icon={<KeyRound size={19} />} />
        <StatCard label="Linked accounts" value="0" detail="Planner connections" icon={<CheckCircle2 size={19} />} />
        <StatCard label="Study activity" value="—" detail="Waiting for learner data" icon={<Activity size={19} />} />
      </section>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div><h2>Recent activity</h2><p>Updates from your learner workspace</p></div>
            <button className="subtle-button" onClick={() => navigate('Academic progress')}>View all <ArrowUpRight size={14} /></button>
          </div>
          <div className="empty-activity">
            <div className="empty-illustration">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="illustration-core"><Activity size={27} /></div>
              <span className="float-dot dot-one" /><span className="float-dot dot-two" />
            </div>
            <strong>Your activity feed is waiting</strong>
            <p>When learners join and begin using their planners, their activity summaries will appear here.</p>
          </div>
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
          <button className="quick-action" onClick={() => navigate('Settings')}>
            <span className="quick-icon green"><Settings size={18} /></span>
            <span><strong>Workspace settings</strong><small>Connect your backend</small></span>
            <ArrowUpRight size={16} />
          </button>
          <div className="quick-note"><LockKeyhole size={14} /> Secure account controls will activate after backend setup.</div>
        </section>
      </div>

      <footer className="page-footer"><span>STUDYSPACE MONITOR <b>·</b> FOUNDATION 0.2</span><span>Built for focused learning.</span></footer>
    </>
  )
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>
}

function EmptyPage({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="subpage">
    <div className="eyebrow">STUDYSPACE WORKSPACE</div><h1>{title}</h1><p className="page-subtitle">{description}</p>
    <div className="panel large-empty"><div className="large-empty-icon">{icon}</div><h2>Nothing here just yet</h2><p>This section will populate when the secure backend is connected and learner data is available.</p>{action && onAction && <button className="primary-button" onClick={onAction}><Plus size={17} /> {action}</button>}</div>
  </div>
}

function PinPage() {
  return <div className="subpage">
    <div className="eyebrow">ACCESS MANAGEMENT</div><h1>Enrolment PINs</h1><p className="page-subtitle">Issue one-time invitations that connect a learner's planner to your monitoring workspace.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><LockKeyhole size={21} /></div><div className="setup-banner-copy"><strong>PIN generation is not active yet</strong><p>PINs must be generated and validated by a trusted server. This screen will not create pretend or browser-only PINs.</p></div></div>
    <div className="panel pin-explainer">
      <div className="pin-step"><span>01</span><div><strong>Generate an invitation</strong><p>The administrator creates a unique, single-use PIN for a learner.</p></div></div>
      <div className="pin-step"><span>02</span><div><strong>Learner registers once</strong><p>The learner enters the PIN and chooses their own password in Studyspace Planner.</p></div></div>
      <div className="pin-step"><span>03</span><div><strong>PIN is consumed</strong><p>The server validates and redeems the PIN. Future sign-ins use the learner's password.</p></div></div>
      <div className="pin-step"><span>04</span><div><strong>Administrator retains control</strong><p>You can revoke unused invitations and issue replacements. Existing learner passwords remain theirs.</p></div></div>
    </div>
  </div>
}

function SettingsPage() {
  return <div className="subpage">
    <div className="eyebrow">CONFIGURATION</div><h1>Workspace settings</h1><p className="page-subtitle">Prepare the secure services that power Studyspace Monitor.</p>
    <div className="panel settings-card">
      <div className="settings-row"><div className="settings-symbol"><ShieldCheck size={19} /></div><div><strong>Authentication and database</strong><p>Supabase project connection for administrator sign-in, learner records and secure PIN workflows.</p></div><span className="connection-pill"><i /> Not connected</span></div>
      <div className="settings-divider" />
      <div className="settings-row"><div className="settings-symbol"><BookOpen size={19} /></div><div><strong>Studyspace Planner integration</strong><p>Connect the learner planner to the same account and academic data services.</p></div><span className="connection-pill"><i /> Pending</span></div>
      <div className="settings-divider" />
      <div className="settings-row"><div className="settings-symbol"><LockKeyhole size={19} /></div><div><strong>Security controls</strong><p>Role-based access, row-level security, PIN expiry, one-time redemption and audit events.</p></div><span className="connection-pill"><i /> Pending</span></div>
    </div>
    <div className="security-note"><LockKeyhole size={17} /><p><strong>Security first.</strong> Do not enter real learner details or use this dashboard for live enrolment until authentication and database policies have been implemented and tested.</p></div>
  </div>
}

export default App
