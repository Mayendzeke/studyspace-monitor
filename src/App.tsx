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

  const navigate = (next: Page) => {
    setPage(next)
    setMobileOpen(false)
  }

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
          <div className="workspace-copy"><strong>Administrator</strong><small>Studyspace workspace</small></div>
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
            <div className="profile-copy"><strong>Admin account</strong><small>Backend not connected</small></div>
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
            <div className="system-status"><span className="status-dot" /> Setup mode</div>
            <button className="theme-switch" role="switch" aria-checked={theme === 'dark'} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span><i className={theme === 'dark' ? 'switch-knob is-dark' : 'switch-knob'} />
            </button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="top-avatar">A</div>
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

function ContentStudio() {
  const activityTypes = [
    { title: 'Multiple choice', detail: 'Single or multiple correct answers', icon: <ClipboardCheck size={19} /> },
    { title: 'Fill in the blank', detail: 'Type the missing word or phrase', icon: <PenTool size={19} /> },
    { title: 'Matching pairs', detail: 'Connect terms, definitions or images', icon: <Activity size={19} /> },
    { title: 'True or false', detail: 'Quick knowledge checks', icon: <CheckCircle2 size={19} /> },
  ]
  return <div className="subpage">
    <div className="eyebrow">LEARNING MATERIALS</div><h1>Content Studio</h1>
    <p className="page-subtitle">Prepare resources and interactive exercises, then assign them to individual learners or groups.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><LockKeyhole size={21} /></div><div className="setup-banner-copy"><strong>Publishing is waiting for secure storage and learner accounts</strong><p>This workspace is a design preview. Uploads, assignments and student delivery will activate after the backend and access policies are connected.</p></div></div>
    <div className="studio-grid">
      <section className="panel studio-panel">
        <div className="panel-heading"><div><h2>Resource library</h2><p>Materials you can prepare for learners</p></div><FileText size={19} className="muted-icon" /></div>
        <div className="studio-resource-types">
          {['PDF books and worksheets','Word documents and notes','Study guides and revision sheets','Teacher-created interactive PDFs'].map(item => <div className="studio-resource-row" key={item}><span className="studio-file-icon"><FileText size={17}/></span><strong>{item}</strong><span className="studio-coming">PLANNED</span></div>)}
        </div>
        <button className="primary-button" disabled><Plus size={16}/> Add resource</button>
        <p className="studio-footnote">Files will be stored in private, access-controlled storage. Only assigned learners will be able to open them.</p>
      </section>
      <section className="panel studio-panel">
        <div className="panel-heading"><div><h2>Activity builder</h2><p>Choose an exercise format to create</p></div><PenTool size={19} className="muted-icon" /></div>
        <div className="activity-type-list">{activityTypes.map(item => <div className="activity-type-row" key={item.title}><span className="studio-file-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="studio-coming">PLANNED</span></div>)}</div>
        <button className="primary-button" disabled><Plus size={16}/> Create activity</button>
      </section>
    </div>
    <section className="panel studio-panel assignment-panel">
      <div className="panel-heading"><div><h2>Assignment delivery</h2><p>Control who receives each resource or activity</p></div><Users size={19} className="muted-icon" /></div>
      <div className="assignment-preview-grid"><div><span>RECIPIENTS</span><strong>Individual learners or groups</strong></div><div><span>SUBJECT</span><strong>Link to a learner's subject</strong></div><div><span>DEADLINE</span><strong>Set a due date and time</strong></div><div><span>RESULTS</span><strong>Track submissions and scores</strong></div></div>
      <p className="studio-footnote">The learner app will show assigned resources and activities in a dedicated Learning Hub. Learners can also upload their own reference books and notes to their private library when personal file storage is enabled.</p>
    </section>
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
