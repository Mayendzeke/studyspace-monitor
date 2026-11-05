import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, Plus, Save, Sparkles, Users } from 'lucide-react'

type LessonPlan = {
  id: string
  title: string
  subject: string
  level: string
  grade: string
  curriculum: string
  date: string
  duration: number
  objectives: string
  sourceNotes: string
  checkpoints: string[]
  homework: string
  homeworkDue: string
  updatedAt: string
}
const KEY = 'studyspace-monitor-classroom-plans-v1'
const readPlans = (): LessonPlan[] => {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
const blank = (): LessonPlan => ({ id: crypto.randomUUID(), title: '', subject: '', level: 'Secondary', grade: '', curriculum: '', date: new Date().toISOString().slice(0,10), duration: 45, objectives: '', sourceNotes: '', checkpoints: ['', '', ''], homework: '', homeworkDue: '', updatedAt: new Date().toISOString() })

export default function ClassroomStudio() {
  const [plans, setPlans] = useState<LessonPlan[]>(readPlans)
  const [draft, setDraft] = useState<LessonPlan>(blank)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(plans)) } catch { setNotice('Browser storage is full. Export or remove old lesson plans.') } }, [plans])
  const completePoints = useMemo(() => draft.checkpoints.map(x => x.trim()).filter(Boolean).slice(0,5), [draft.checkpoints])
  const update = (patch: Partial<LessonPlan>) => setDraft(current => ({ ...current, ...patch, updatedAt: new Date().toISOString() }))
  const save = () => {
    if (!draft.title.trim() || !draft.subject.trim()) { setNotice('Add a lesson title and subject before saving.'); return }
    const saved = { ...draft, title: draft.title.trim(), subject: draft.subject.trim(), checkpoints: completePoints }
    setPlans(current => [saved, ...current.filter(x => x.id !== saved.id)])
    setSelected(saved.id); setDraft(saved); setNotice('Lesson plan saved in this browser. It is not yet synced to learners.')
  }
  const load = (plan: LessonPlan) => { setDraft(plan); setSelected(plan.id); setNotice('Lesson plan loaded.') }
  const remove = (id: string) => { if (!window.confirm('Delete this local lesson plan?')) return; setPlans(current => current.filter(x => x.id !== id)); if (selected === id) { setSelected(null); setDraft(blank()) } }
  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ format: 'Studyspace classroom plans', version: 1, plans }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'studyspace-lesson-plans.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="subpage classroom-studio">
    <div className="eyebrow">TEACHING WORKSPACE</div><h1>Classroom Studio</h1>
    <p className="page-subtitle">Prepare short, focused lessons, student-friendly recaps and follow-up work for Today's Session.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><Sparkles size={21}/></div><div className="setup-banner-copy"><strong>AI and learner delivery are backend-connected features</strong><p>This front end prepares the lesson structure. Once Supabase and the secure AI service are connected, lesson content can be generated from your supplied materials, reviewed, approved and delivered to selected learners.</p></div></div>
    <div className="classroom-layout">
      <section className="panel classroom-editor">
        <div className="panel-heading"><div><h2>Lesson builder</h2><p>Keep each session simple and purposeful.</p></div><BookOpen size={19}/></div>
        <div className="classroom-form-grid">
          <label>Lesson title<input value={draft.title} onChange={e=>update({title:e.target.value})} placeholder="e.g. Linear equations"/></label>
          <label>Subject<input value={draft.subject} onChange={e=>update({subject:e.target.value})} placeholder="Mathematics"/></label>
          <label>Level<select value={draft.level} onChange={e=>update({level:e.target.value})}><option>Primary</option><option>Secondary</option><option>College</option><option>University</option></select></label>
          <label>Grade / year<input value={draft.grade} onChange={e=>update({grade:e.target.value})} placeholder="Form 3"/></label>
          <label>Curriculum<input value={draft.curriculum} onChange={e=>update({curriculum:e.target.value})} placeholder="IGCSE, CAPS, etc."/></label>
          <label>Date<input type="date" value={draft.date} onChange={e=>update({date:e.target.value})}/></label>
          <label>Lesson length (minutes)<input type="number" min="10" max="240" value={draft.duration} onChange={e=>update({duration:Math.max(10,Math.min(240,Number(e.target.value)||45))})}/></label>
        </div>
        <label className="classroom-wide-field">Learning objectives<textarea rows={2} value={draft.objectives} onChange={e=>update({objectives:e.target.value})} placeholder="What should learners be able to explain or do by the end?"/></label>
        <div className="classroom-points-heading"><div><strong>Lesson checkpoints</strong><small>Only 3–5 memorable points. Avoid overloading the learner.</small></div><span>{completePoints.length}/5</span></div>
        <div className="classroom-checkpoints">{Array.from({length:Math.max(3,draft.checkpoints.length)},(_,i)=><label key={i}><span>{i+1}</span><input value={draft.checkpoints[i]||''} maxLength={180} onChange={e=>update({checkpoints:draft.checkpoints.map((v,j)=>j===i?e.target.value:v).concat(i>=draft.checkpoints.length?Array(i-draft.checkpoints.length+1).fill(''):[])})} placeholder={i===0?'First key idea':i===1?'Worked example':i===2?'Quick understanding check':'Optional extra point'}/></label>)}</div>
        <label className="classroom-wide-field">Source material / teacher notes<textarea rows={5} value={draft.sourceNotes} onChange={e=>update({sourceNotes:e.target.value})} placeholder="Paste the relevant notes, topic extract or teacher guidance that the AI should use. Do not include unrelated material."/></label>
        <div className="classroom-ai-card"><Sparkles size={19}/><div><strong>AI lesson recap</strong><p>Generation will use the lesson title, objectives and source material to create a short explanation, up to five key points, one worked example where relevant, and a quick exit question. It will not invent details beyond the supplied material.</p><small>Secure AI service not connected yet · No generated content is being claimed here.</small><button type="button" className="subtle-button" disabled title="Connect the secure AI service during the Supabase phase">Generate lesson recap</button></div></div>
        <label className="classroom-wide-field">Homework / next steps<textarea rows={3} value={draft.homework} onChange={e=>update({homework:e.target.value})} placeholder="A short follow-up task with clear instructions."/></label>
        <label className="classroom-date-field">Homework due date<input type="date" value={draft.homeworkDue} onChange={e=>update({homeworkDue:e.target.value})}/></label>
        <div className="classroom-actions"><button className="primary-button" onClick={save}><Save size={16}/> Save lesson plan</button><button className="subtle-button" onClick={exportPlan}>Export local plans</button><button className="subtle-button" onClick={()=>{setDraft(blank());setSelected(null);setNotice('New lesson started.')}}><Plus size={15}/> New lesson</button></div>
        {notice&&<p className="inline-message" role="status">{notice}</p>}
      </section>
      <aside className="panel classroom-side">
        <div className="panel-heading"><div><h2>Saved lessons</h2><p>{plans.length} local plan(s)</p></div><CalendarDays size={18}/></div>
        {plans.length?plans.map(plan=><article className="classroom-saved-plan" key={plan.id}><button onClick={()=>load(plan)}><strong>{plan.title}</strong><span>{plan.subject} · {plan.date}</span><small>{plan.checkpoints.length} lesson point(s) · {plan.duration} min</small></button><button className="text-button" onClick={()=>remove(plan.id)}>Delete</button></article>):<div className="classroom-empty"><FileText size={24}/><strong>No lesson plans yet</strong><span>Build a lesson and save it here.</span></div>}
        <div className="classroom-sync-note"><Users size={16}/><span>Saved plans are local to this administrator browser. Learner targeting, shared notes and delivery activate after Supabase is connected.</span></div>
        <div className="classroom-feature-row"><Clock3 size={16}/><span>Timed lesson outline</span></div><div className="classroom-feature-row"><ClipboardList size={16}/><span>Homework and due dates</span></div><div className="classroom-feature-row"><CheckCircle2 size={16}/><span>Review before publishing</span></div>
      </aside>
    </div>
  </div>
}
