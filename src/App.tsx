import ContentStudio from './components/ContentStudio'
import ClassroomStudio from './components/ClassroomStudio'
import AuthGate from './components/AuthGate'
import AdminMfaGate from './components/AdminMfaGate'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, Bell, BookOpen, PenTool,
  CheckCircle2, ChevronDown, CircleHelp, GraduationCap, LayoutDashboard,
  LockKeyhole, Menu, MoreHorizontal, Plus, Settings, ShieldCheck,
  SlidersHorizontal, Users, X, KeyRound, Sparkles, Moon, Sun,
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
          {page === 'Learners' && <LearnersPage />}
          {page === 'Content Studio' && <ContentStudio />}
          {page === 'Classroom Studio' && <ClassroomStudio />}
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'PIN creation failed.') }
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'PIN revocation failed.') }
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


function LearnersPage() {
  type Learner = { id: string; student_id: string | null; full_name: string; preferred_name: string; account_status: string; created_at: string; grade: string; curriculum: string }
  const [learners, setLearners] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [temporary, setTemporary] = useState<{ studentId: string; password: string } | null>(null)
  const refresh = async () => {
    if (!supabase) { setLoading(false); setError('Connect Supabase to load learner accounts.'); return }
    const { data, error: queryError } = await supabase.from('profiles')
      .select('id,student_id,full_name,preferred_name,account_status,created_at,grade,curriculum')
      .eq('role','learner').order('created_at',{ascending:false})
    if (queryError) setError('Learner records could not be loaded. Check the applied migrations and administrator access.')
    else { setLearners((data ?? []) as Learner[]); setError('') }
    setLoading(false)
  }
  useEffect(() => { void refresh() }, [])
  const manage = async (learner: Learner, action: 'disable' | 'enable' | 'reset_password') => {
    if (!supabase) return
    const label = action === 'disable' ? 'disable this learner account' : action === 'enable' ? 're-enable this learner account' : 'generate a new temporary password'
    if (!window.confirm('Are you sure you want to ' + label + '?')) return
    setBusyId(learner.id); setError(''); setNotice(''); setTemporary(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-learner-account',{body:{learnerId:learner.id,action}})
      if (invokeError) throw invokeError
      if (!data?.success) throw new Error(data?.error || 'The account action failed.')
      if (action === 'reset_password') {
        if (!data.temporaryPassword) throw new Error('The server did not return the temporary password.')
        setTemporary({studentId:learner.student_id || 'Student ID unavailable',password:data.temporaryPassword})
        setNotice('Password rotated. Copy the temporary password and deliver it privately; it will not be shown again.')
      } else { setNotice(data.message || 'Account updated.'); await refresh() }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The account action failed.') }
    finally { setBusyId('') }
  }
  const copyPassword = () => {
    if (!temporary) return
    if (!navigator.clipboard) { setNotice('Clipboard is unavailable. Select and copy the temporary password manually.'); return }
    void navigator.clipboard.writeText(temporary.password).then(()=>setNotice('Temporary password copied. Deliver it privately.')).catch(()=>setNotice('Clipboard access failed. Select and copy the password manually.'))
  }
  const visible = learners.filter(x => [x.student_id,x.full_name,x.preferred_name,x.grade,x.curriculum].some(v => (v || '').toLowerCase().includes(search.toLowerCase())))
  return <div className="subpage learners-page">
    <div className="eyebrow">LEARNER MANAGEMENT</div><h1>Learner accounts</h1><p className="page-subtitle">Review enrolled learners, control account access and rotate passwords without requiring student email addresses.</p>
    <div className="panel learners-toolbar"><div><strong>{learners.length} learner account(s)</strong><small>Account changes require administrator MFA.</small></div><button className="subtle-button" onClick={()=>void refresh()}>Refresh</button><button className="primary-button" onClick={()=>{window.dispatchEvent(new CustomEvent('studyspace-navigate-pins'))}}>Create enrolment PIN</button></div>
    <label className="learners-search"><span>Search learners</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Student ID, name, grade or curriculum"/></label>
    {notice&&<p className="inline-message" role="status">{notice}</p>}{error&&<p className="inline-message error-message" role="alert">{error}</p>}
    {temporary&&<div className="pin-issued-card"><strong>Temporary password · shown once</strong><div><span>Student ID</span><code>{temporary.studentId}</code></div><div><span>New password</span><code>{temporary.password}</code><button className="subtle-button" onClick={copyPassword}>Copy password</button></div><small>The previous password has been replaced. Deliver this password directly to the learner.</small></div>}
    <div className="panel learners-list-panel">
      {loading?<div className="classroom-empty">Loading learner accounts…</div>:visible.length?visible.map(learner=><article className="learner-row" key={learner.id}><div className="learner-avatar">{(learner.preferred_name||learner.full_name||'S').slice(0,1).toUpperCase()}</div><div className="learner-identity"><strong>{learner.preferred_name||learner.full_name||'Learner'}</strong><span>{learner.student_id||'No Student ID'} · {learner.grade||'Grade not set'} · {learner.curriculum||'Curriculum not set'}</span><small>Joined {new Date(learner.created_at).toLocaleDateString()}</small></div><span className={'pin-status '+learner.account_status}>{learner.account_status}</span><div className="learner-actions"><button className="text-button" disabled={!!busyId} onClick={()=>void manage(learner,'reset_password')}>Reset password</button>{learner.account_status==='active'?<button className="text-button danger-text" disabled={!!busyId} onClick={()=>void manage(learner,'disable')}>Disable</button>:<button className="text-button" disabled={!!busyId} onClick={()=>void manage(learner,'enable')}>Enable</button>}</div></article>):<div className="classroom-empty"><Users size={25}/><strong>{search?'No matching learners':'No learner accounts yet'}</strong><span>{search?'Try another search term.':'Generate an enrolment PIN and share the Student ID and PIN with a learner.'}</span></div>}
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
