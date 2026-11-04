import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, GraduationCap, LockKeyhole, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { mode: 'unconfigured' | 'signin' | 'recovery'; error: string; onError: (message: string) => void }

export default function AuthGate({ mode, error, onError }: Props) {
  const [screen, setScreen] = useState<'signin' | 'reset' | 'update'>(() => mode === 'recovery' ? 'update' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setScreen('update')
    })
    return () => subscription.unsubscribe()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    onError('')
    setMessage('')
    setBusy(true)
    try {
      if (screen === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      } else if (screen === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + window.location.pathname,
        })
        if (resetError) throw resetError
        setMessage('If this email belongs to an account, Supabase will send a password-reset link.')
      } else {
        if (newPassword.length < 12) throw new Error('Use at least 12 characters for the new password.')
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
        if (updateError) throw updateError
        setMessage('Password updated by Supabase Auth. Sign in again with your new password.')
        await supabase.auth.signOut()
        setScreen('signin')
        setPassword('')
        setNewPassword('')
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'unconfigured') return <div className="auth-screen"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><GraduationCap size={23}/></div><div className="brand-copy"><strong>studyspace<span>.</span></strong><small>MONITOR</small></div></div>
    <div className="auth-lock-icon"><LockKeyhole size={25}/></div>
    <h1>Administrator access is locked</h1>
    <p>Supabase authentication must be configured before the Monitor dashboard can open. This prevents an unprotected public administrator console.</p>
    <div className="auth-security-list"><span><ShieldCheck size={16}/> Supabase-managed passwords</span><span><LockKeyhole size={16}/> Active administrator role required</span><span><Activity size={16}/> Audited privileged actions</span></div>
    <p className="auth-footnote">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment, then create and promote your administrator account through Supabase.</p>
  </section></div>

  return <div className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <div className="auth-brand"><div className="brand-mark"><GraduationCap size={23}/></div><div className="brand-copy"><strong>studyspace<span>.</span></strong><small>MONITOR</small></div></div>
    <div className="auth-lock-icon"><LockKeyhole size={25}/></div>
    <h1>{screen === 'signin' ? 'Administrator sign in' : screen === 'reset' ? 'Reset your password' : 'Choose a new password'}</h1>
    <p>{screen === 'signin' ? 'Sign in with your administrator account. Only active administrator profiles can open this workspace.' : screen === 'reset' ? 'Supabase Auth will send a secure password-reset link to your registered email.' : 'Set a new password for your Supabase account.'}</p>
    {screen !== 'update' && <label className="studio-field">Administrator email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com"/></label>}
    {screen === 'signin' && <label className="studio-field">Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {screen === 'update' && <label className="studio-field">New password<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 12 characters"/></label>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    {message && <div className="auth-success" role="status">{message}</div>}
    <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : screen === 'signin' ? 'Sign in securely' : screen === 'reset' ? 'Send reset link' : 'Update password'}</button>
    {screen === 'signin' ? <button type="button" className="auth-link" onClick={()=>{onError('');setScreen('reset')}}>Forgot password?</button> : <button type="button" className="auth-link" onClick={()=>{onError('');setMessage('');setScreen('signin')}}>Back to sign in</button>}
    <div className="auth-footnote">Passwords and reset tokens are handled by Supabase Auth. This dashboard does not store passwords.</div>
  </form></div>
}
