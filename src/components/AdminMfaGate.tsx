import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { onVerified: () => void }
export default function AdminMfaGate({ onVerified }: Props) {
  const [loading,setLoading]=useState(true)
  const [factorId,setFactorId]=useState('')
  const [challengeId,setChallengeId]=useState('')
  const [qrCode,setQrCode]=useState('')
  const [secret,setSecret]=useState('')
  const [code,setCode]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [enrolling,setEnrolling]=useState(false)

  useEffect(()=>{
    let alive=true
    const prepare=async()=>{
      if(!supabase){setError('Authentication is not configured.');setLoading(false);return}
      try{
        const {data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if(assuranceError)throw assuranceError
        if(assurance.currentLevel==='aal2'){if(alive)onVerified();return}
        const {data:factorData,error:factorError}=await supabase.auth.mfa.listFactors()
        if(factorError)throw factorError
        const verified=factorData.totp.find(f=>f.status==='verified')
        const pending=factorData.totp.find(f=>f.status==='unverified' && f.friendly_name==='Studyspace Monitor administrator')
        if(verified || pending){
          // Reuse an existing factor. A page refresh during setup must not
          // attempt to enrol a second factor with the same friendly name.
          const factor=verified || pending
          const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id})
          if(challengeError)throw challengeError
          if(alive){setFactorId(factor.id);setChallengeId(challenge.id);setEnrolling(false)}
        }else{
          const {data:enrollment,error:enrollError}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Studyspace Monitor administrator'})
          if(enrollError)throw enrollError
          if(alive){setFactorId(enrollment.id);setQrCode(enrollment.totp.qr_code);setSecret(enrollment.totp.secret);setEnrolling(true)}
        }
      }catch(err){if(alive)setError(err instanceof Error?err.message:'Could not prepare administrator MFA.')}
      finally{if(alive)setLoading(false)}
    }
    void prepare()
    return()=>{alive=false}
  },[onVerified])

  const verify=async(event:FormEvent)=>{
    event.preventDefault()
    if(!supabase||!factorId)return
    setBusy(true);setError('')
    try{
      let currentChallenge=challengeId
      if(!currentChallenge){
        const {data,error:challengeError}=await supabase.auth.mfa.challenge({factorId})
        if(challengeError)throw challengeError
        currentChallenge=data.id
      }
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId,challengeId:currentChallenge,code:code.trim()})
      if(verifyError)throw verifyError
      onVerified()
    }catch(err){setError(err instanceof Error?err.message:'The verification code was not accepted.')}
    finally{setBusy(false)}
  }

  if(loading)return <div className="auth-screen"><div className="auth-card"><div className="auth-spinner"/><p>Preparing administrator two-factor security…</p></div></div>
  return <div className="auth-screen"><form className="auth-card" onSubmit={verify}>
    <div className="auth-lock-icon"><ShieldCheck size={26}/></div>
    <h1>{enrolling?'Secure your administrator account':'Verify your identity'}</h1>
    <p>{enrolling?'Set up an authenticator app for this administrator account. Scan the QR code, then enter the six-digit code it generates.':'Enter the current six-digit code from your registered authenticator app to continue.'}</p>
    {enrolling&&qrCode&&<div className="mfa-qr"><img src={qrCode} alt="Authenticator setup QR code"/><small>Scan using an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</small></div>}
    {enrolling&&secret&&<div className="mfa-secret"><small>Manual setup key</small><code>{secret}</code></div>}
    <label className="studio-field">6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"/></label>
    {error&&<div className="auth-error" role="alert">{error}</div>}
    <button className="primary-button auth-submit" disabled={busy||code.length!==6}>{busy?'Verifying…':enrolling?'Enable two-factor authentication':'Verify and continue'}</button>
    <div className="auth-footnote"><Activity size={13}/> Studyspace Monitor requires administrator MFA. Learner accounts will use their own Supabase Auth credentials.</div>
  </form></div>
}
