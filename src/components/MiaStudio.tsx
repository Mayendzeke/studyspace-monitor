import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Bot, Brain, BookOpen, CalendarDays, GraduationCap, Lightbulb, MessageCircle, Send, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
const welcome: ChatMessage = {
  id: 'mia-welcome',
  role: 'assistant',
  content: "Hello. I'm MIA — Mayendzeke's Artificial Intelligence. I can help you prepare lessons for different education levels, develop assessments, plan teaching activities, support learner progress and work through StudySpace administration questions. What would you like to work on?",
}
const prompts = [
  { icon: BookOpen, title: 'Prepare a lesson', text: 'Help me prepare a 45-minute lesson. Ask me for the level, grade, subject and topic, then create clear objectives, teaching steps and a short assessment.' },
  { icon: Brain, title: 'Create an assessment', text: 'Help me design an age-appropriate assessment with a mix of question types, an answer key and marking guidance.' },
  { icon: CalendarDays, title: 'Plan a study schedule', text: 'Help me build a realistic weekly study and revision schedule for a learner. Ask for the school timetable and available study hours.' },
  { icon: Lightbulb, title: 'Teaching ideas', text: 'Give me practical, low-cost, engaging ways to teach a difficult topic to learners with different ability levels.' },
]
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

export default function MiaStudio() {
  const [userId, setUserId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([welcome])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    async function restore() {
      if (!supabase) { setError('StudySpace is not connected to its secure AI service.'); return }
      const { data, error: authError } = await supabase.auth.getUser()
      if (!alive) return
      if (authError || !data.user) { setError('Sign in again to use MIA.'); return }
      setUserId(data.user.id)
      setMessages(loadMessages(data.user.id))
    }
    void restore()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  const saveMessages = (next: ChatMessage[]) => {
    setMessages(next)
    if (userId) {
      try { localStorage.setItem(storageKey(userId), JSON.stringify(next.slice(-30))) }
      catch { /* The conversation remains available for this session. */ }
    }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value || busy || !supabase || !userId) return
    setError('')
    setDraft('')
    setBusy(true)
    const history = messages.filter(item => item.id !== 'mia-welcome').slice(-12)
    const next = [...messages, { id: crypto.randomUUID(), role: 'user' as const, content: value }]
    saveMessages(next)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('mia-monitor-assistant', {
        body: { message: value, history: history.map(item => ({ role: item.role, content: item.content })) },
      })
      if (invokeError) throw new Error(await edgeError(invokeError))
      if (!data?.success || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'MIA did not return a usable response.')
      }
      const completed = [...next, { id: crypto.randomUUID(), role: 'assistant' as const, content: data.reply }]
      saveMessages(completed)
      setRemaining(typeof data.remainingDailyRequests === 'number' ? data.remainingDailyRequests : null)
    } catch (reason) {
      setError(await edgeError(reason))
      setDraft(value)
      saveMessages(messages)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const clearConversation = () => {
    const next = [welcome]
    saveMessages(next)
    setError('')
  }

  return (
    <section className="mia-page">
      <div className="mia-hero">
        <div className="mia-brand-mark"><Sparkles size={25}/></div>
        <div className="mia-hero-copy">
          <span className="eyebrow">MAYENDZEKE'S ARTIFICIAL INTELLIGENCE</span>
          <h1>MIA <span>· Your StudySpace companion</span></h1>
          <p>Eswatini's first AI — here to support your teaching, lesson preparation, learner support and day-to-day StudySpace work.</p>
        </div>
        <div className="mia-availability"><i/> Administrator assistant</div>
      </div>

      <div className="mia-capabilities">
        <article><BookOpen size={17}/><strong>Lesson preparation</strong><span>Plan for primary, secondary, high school, college and university learners.</span></article>
        <article><Brain size={17}/><strong>Assessments</strong><span>Develop questions, marking guides and revision activities.</span></article>
        <article><GraduationCap size={17}/><strong>Learner support</strong><span>Explore differentiated teaching and academic support strategies.</span></article>
        <article><MessageCircle size={17}/><strong>StudySpace guidance</strong><span>Get help thinking through workflows and administration.</span></article>
      </div>

      <div className="mia-workspace">
        <div className="mia-chat-heading">
          <div><strong><Bot size={17}/> MIA conversation</strong><small>Replies are generated using the configured StudySpace AI provider.</small></div>
          <div className="mia-chat-tools">
            {remaining !== null && <span className="mia-remaining">{remaining} requests left today</span>}
            <button type="button" className="secondary-button" onClick={clearConversation}><Trash2 size={14}/> Clear chat</button>
          </div>
        </div>

        {messages.length === 1 && (
          <div className="mia-prompt-grid">
            {prompts.map(({ icon: Icon, title, text }) => (
              <button type="button" key={title} className="mia-prompt-card" onClick={() => { setDraft(text); inputRef.current?.focus() }}>
                <span><Icon size={16}/></span><strong>{title}</strong><small>{text}</small>
              </button>
            ))}
          </div>
        )}

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
          {busy && <article className="mia-message mia-message-assistant"><span className="mia-message-avatar"><Sparkles size={15}/></span><div className="mia-message-bubble"><small>MIA</small><p className="mia-thinking">Thinking through your request…</p></div></article>}
        </div>

        {error && <p className="mia-error" role="alert">{error}</p>}
        <form className="mia-compose" onSubmit={send}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(event as unknown as FormEvent) } }}
            placeholder="Ask MIA to help with a lesson, assessment, learner support or StudySpace…"
            rows={2}
            maxLength={4000}
            disabled={busy || !userId}
            aria-label="Message MIA"
          />
          <div className="mia-compose-footer">
            <span>Enter to send · Shift + Enter for a new line · Do not include sensitive learner information.</span>
            <button className="primary-button" type="submit" disabled={busy || !draft.trim() || !userId}><Send size={15}/>{busy ? 'Working…' : 'Send to MIA'}</button>
          </div>
        </form>
        <p className="mia-disclaimer">MIA can help create ideas and drafts, but it does not access learner records or make changes to accounts, subscriptions, timetables or assessments. Review AI-generated teaching material before sharing it with learners.</p>
      </div>
    </section>
  )
}
