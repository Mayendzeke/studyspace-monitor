import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Check, CheckCircle2, ChevronDown, ClipboardList, Download, FileText,
  Filter, Plus, Save, Search, Send, Trash2, Upload, X,
} from 'lucide-react'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'true_false' | 'matching' | 'word_puzzle'
type Difficulty = 'Foundation' | 'Standard' | 'Advanced'
type Question = {
  id: string
  type: QuestionType
  prompt: string
  options: string[]
  answer: string
  explanation: string
  points: number
  difficulty: Difficulty
  topic: string
}
type ExerciseDraft = {
  id: string
  title: string
  subject: string
  level: string
  grade: string
  curriculum: string
  instructions: string
  duration: number
  dueDate: string
  questions: Question[]
  updatedAt: string
}
type ResourceRecord = { id: string; name: string; subject: string; topic: string; kind: string; size: number; savedAt: string }

const DRAFTS_KEY = 'studyspace-monitor-exercise-drafts-v1'
const RESOURCE_DB = 'studyspace-monitor-content-v1'
const RESOURCE_STORE = 'resources'
const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or false' },
  { value: 'matching', label: 'Matching pairs' },
  { value: 'word_puzzle', label: 'Word puzzle' },
]
const newQuestion = (): Question => ({ id: crypto.randomUUID(), type: 'multiple_choice', prompt: '', options: ['', '', '', ''], answer: '', explanation: '', points: 1, difficulty: 'Standard', topic: '' })
const readDrafts = (): ExerciseDraft[] => {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]') as ExerciseDraft[] } catch { return [] }
}
const openResourceDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(RESOURCE_DB, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(RESOURCE_STORE, { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export default function ContentStudio() {
  const [tab, setTab] = useState<'builder' | 'library' | 'assign'>('builder')
  const [drafts, setDrafts] = useState<ExerciseDraft[]>(readDrafts)
  const [resources, setResources] = useState<ResourceRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('Secondary')
  const [grade, setGrade] = useState('')
  const [curriculum, setCurriculum] = useState('')
  const [instructions, setInstructions] = useState('Read each question carefully and answer all questions.')
  const [duration, setDuration] = useState(30)
  const [dueDate, setDueDate] = useState('')
  const [questions, setQuestions] = useState<Question[]>([newQuestion()])
  const [editing, setEditing] = useState(0)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)

  useEffect(() => { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) }, [drafts])
  useEffect(() => {
    let alive = true
    openResourceDb().then(db => {
      const request = db.transaction(RESOURCE_STORE, 'readonly').objectStore(RESOURCE_STORE).getAll()
      request.onsuccess = () => { if (alive) setResources((request.result as ResourceRecord[]).sort((a,b) => b.savedAt.localeCompare(a.savedAt))) }
    }).catch(() => setNotice('This browser could not open local resource storage.'))
    return () => { alive = false }
  }, [])

  const totalPoints = useMemo(() => questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0), [questions])
  const filteredResources = resources.filter(r => `${r.name} ${r.subject} ${r.topic}`.toLowerCase().includes(search.toLowerCase()))

  const resetBuilder = () => {
    setActiveId(null); setTitle(''); setSubject(''); setLevel('Secondary'); setGrade(''); setCurriculum('')
    setInstructions('Read each question carefully and answer all questions.'); setDuration(30); setDueDate('')
    setQuestions([newQuestion()]); setEditing(0); setPreview(false)
  }
  const saveDraft = () => {
    if (!title.trim() || !subject.trim()) { setNotice('Add an assessment title and subject before saving.'); return }
    if (!questions.length || questions.some(q => !q.prompt.trim() || !q.answer.trim())) { setNotice('Every question needs a prompt and an answer key.'); return }
    const draft: ExerciseDraft = { id: activeId || crypto.randomUUID(), title: title.trim(), subject: subject.trim(), level, grade, curriculum, instructions, duration: Math.max(1, duration), dueDate, questions, updatedAt: new Date().toISOString() }
    setDrafts(current => [draft, ...current.filter(item => item.id !== draft.id)])
    setActiveId(draft.id); setNotice('Draft saved in this browser. It has not been published or assigned.')
  }
  const loadDraft = (draft: ExerciseDraft) => {
    setActiveId(draft.id); setTitle(draft.title); setSubject(draft.subject); setLevel(draft.level); setGrade(draft.grade)
    setCurriculum(draft.curriculum); setInstructions(draft.instructions); setDuration(draft.duration); setDueDate(draft.dueDate)
    setQuestions(draft.questions); setEditing(0); setPreview(false); setTab('builder'); setNotice('Draft loaded.')
  }
  const updateQuestion = (patch: Partial<Question>) => setQuestions(current => current.map((q, i) => i === editing ? { ...q, ...patch } : q))
  const addQuestion = () => { const q = newQuestion(); setQuestions(current => [...current, q]); setEditing(questions.length); setPreview(false) }
  const removeQuestion = (index: number) => { setQuestions(current => current.filter((_, i) => i !== index)); setEditing(Math.max(0, Math.min(editing, questions.length - 2))) }
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const db = await openResourceDb()
      const tx = db.transaction(RESOURCE_STORE, 'readwrite')
      for (const file of Array.from(files)) {
        const record: ResourceRecord & { blob: Blob; mimeType: string } = {
          id: crypto.randomUUID(), name: file.name, subject: subject.trim() || 'Uncategorised',
          topic: '', kind: file.type || 'unknown', size: file.size, savedAt: new Date().toISOString(),
          blob: file, mimeType: file.type || 'application/octet-stream',
        }
        tx.objectStore(RESOURCE_STORE).put(record)
      }
      tx.oncomplete = () => {
        const request = db.transaction(RESOURCE_STORE, 'readonly').objectStore(RESOURCE_STORE).getAll()
        request.onsuccess = () => setResources((request.result as ResourceRecord[]).sort((a,b) => b.savedAt.localeCompare(a.savedAt)))
        setNotice('Files saved to this browser only. They are not uploaded to a shared server.')
      }
      tx.onerror = () => setNotice('A file could not be saved. Check available browser storage.')
    } catch { setNotice('File storage is unavailable in this browser.') }
  }
  const downloadResource = async (id: string) => {
    const db = await openResourceDb()
    const request = db.transaction(RESOURCE_STORE, 'readonly').objectStore(RESOURCE_STORE).get(id)
    request.onsuccess = () => {
      const item = request.result as (ResourceRecord & { blob: Blob }) | undefined
      if (!item?.blob) return
      const url = URL.createObjectURL(item.blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = item.name; anchor.click()
      URL.revokeObjectURL(url)
    }
  }
  const deleteResource = async (id: string) => {
    const db = await openResourceDb()
    const tx = db.transaction(RESOURCE_STORE, 'readwrite'); tx.objectStore(RESOURCE_STORE).delete(id)
    tx.oncomplete = () => setResources(current => current.filter(r => r.id !== id))
  }

  const activeQuestion = questions[editing] || newQuestion()
  const labelFor = (type: QuestionType) => questionTypes.find(t => t.value === type)?.label || type

  return <div className="subpage content-studio-page">
    <div className="eyebrow">LEARNING MATERIALS</div>
    <h1>Content Studio</h1>
    <p className="page-subtitle">Create reusable learning resources and structured assessments for the Studyspace learner workspace.</p>
    <div className="setup-banner warning-banner">
      <div className="setup-banner-icon"><BookOpen size={21}/></div>
      <div className="setup-banner-copy"><strong>Local authoring mode</strong><p>Drafts and files are saved in this browser. Secure cloud storage, learner lists, publishing and assignment delivery are not connected yet.</p></div>
    </div>
    <div className="studio-tabs" role="tablist" aria-label="Content Studio sections">
      <button className={tab === 'builder' ? 'selected' : ''} onClick={() => setTab('builder')}><ClipboardList size={16}/> Assessment builder</button>
      <button className={tab === 'library' ? 'selected' : ''} onClick={() => setTab('library')}><FileText size={16}/> Resource library <span>{resources.length}</span></button>
      <button className={tab === 'assign' ? 'selected' : ''} onClick={() => setTab('assign')}><Send size={16}/> Assignment setup</button>
    </div>

    {notice && <div className="studio-notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}

    {tab === 'builder' && <div className="studio-builder-layout">
      <section className="panel studio-editor">
        <div className="panel-heading"><div><h2>Assessment details</h2><p>Set the learning context before adding questions</p></div><span className="studio-draft-count">{drafts.length} saved drafts</span></div>
        <div className="studio-form-grid">
          <label className="studio-field studio-field-wide">Assessment title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Algebra: Linear equations test"/></label>
          <label className="studio-field">Subject or module<input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics"/></label>
          <label className="studio-field">Education level<select value={level} onChange={e => setLevel(e.target.value)}><option>Primary</option><option>Secondary</option><option>High school</option><option>College</option><option>University</option></select></label>
          <label className="studio-field">Grade / year<input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. Form 3 / Year 1"/></label>
          <label className="studio-field">Curriculum<input value={curriculum} onChange={e => setCurriculum(e.target.value)} placeholder="e.g. Cambridge IGCSE"/></label>
          <label className="studio-field">Duration (minutes)<input type="number" min="1" max="300" value={duration} onChange={e => setDuration(Number(e.target.value))}/></label>
          <label className="studio-field">Due date (optional)<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label>
          <label className="studio-field studio-field-wide">Instructions<textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}/></label>
        </div>
        <div className="question-builder-heading"><div><h2>Questions</h2><p>{questions.length} question{questions.length === 1 ? '' : 's'} · {totalPoints} total marks</p></div><button className="subtle-button" onClick={addQuestion}><Plus size={15}/> Add question</button></div>
        <div className="question-editor-layout">
          <div className="question-list">
            {questions.map((q, index) => <button key={q.id} className={editing === index ? 'question-list-item active' : 'question-list-item'} onClick={() => { setEditing(index); setPreview(false) }}><span>{String(index + 1).padStart(2, '0')}</span><span><strong>{q.prompt.trim() || 'Untitled question'}</strong><small>{labelFor(q.type)} · {q.points} mark{q.points === 1 ? '' : 's'}</small></span></button>)}
            <button className="question-add-row" onClick={addQuestion}><Plus size={15}/> Add another</button>
          </div>
          <div className="question-edit-card">
            <div className="question-edit-top"><strong>Question {editing + 1}</strong><button className="icon-button" aria-label="Delete question" onClick={() => removeQuestion(editing)} disabled={questions.length === 1}><Trash2 size={16}/></button></div>
            <label className="studio-field">Question format<select value={activeQuestion.type} onChange={e => updateQuestion({ type: e.target.value as QuestionType, answer: '', options: e.target.value === 'multiple_choice' ? ['', '', '', ''] : activeQuestion.options })}>{questionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <label className="studio-field">Question prompt<textarea rows={3} value={activeQuestion.prompt} onChange={e => updateQuestion({prompt:e.target.value})} placeholder="Write a clear question or instruction..."/></label>
            {activeQuestion.type === 'multiple_choice' && <div className="question-options"><span className="field-caption">Answer options</span>{activeQuestion.options.map((option, index) => <label className="option-input" key={index}><b>{String.fromCharCode(65 + index)}</b><input value={option} onChange={e => updateQuestion({options:activeQuestion.options.map((v,i) => i === index ? e.target.value : v)})} placeholder={`Option ${index + 1}`}/></label>)}</div>}
            {activeQuestion.type === 'true_false' && <label className="studio-field">Correct answer<select value={activeQuestion.answer} onChange={e => updateQuestion({answer:e.target.value})}><option value="">Choose answer</option><option>True</option><option>False</option></select></label>}
            {activeQuestion.type === 'matching' && <p className="builder-hint">Enter matching pairs in the prompt (for example, “Term — definition”). The structured pair editor will be added in the next iteration.</p>}
            {activeQuestion.type === 'word_puzzle' && <p className="builder-hint">Enter the clue in the prompt and the expected word in the answer field.</p>}
            {activeQuestion.type !== 'true_false' && <label className="studio-field">Answer key<input value={activeQuestion.answer} onChange={e => updateQuestion({answer:e.target.value})} placeholder={activeQuestion.type === 'multiple_choice' ? 'Enter the exact correct option text' : 'Enter the expected answer'}/></label>}
            <label className="studio-field">Explanation / feedback<textarea rows={2} value={activeQuestion.explanation} onChange={e => updateQuestion({explanation:e.target.value})} placeholder="Explain why the answer is correct..."/></label>
            <div className="question-meta-grid">
              <label className="studio-field">Topic<input value={activeQuestion.topic} onChange={e => updateQuestion({topic:e.target.value})} placeholder="e.g. Algebra"/></label>
              <label className="studio-field">Difficulty<select value={activeQuestion.difficulty} onChange={e => updateQuestion({difficulty:e.target.value as Difficulty})}><option>Foundation</option><option>Standard</option><option>Advanced</option></select></label>
              <label className="studio-field">Marks<input type="number" min="0.5" step="0.5" value={activeQuestion.points} onChange={e => updateQuestion({points:Number(e.target.value)})}/></label>
            </div>
          </div>
        </div>
        <div className="studio-actions"><button className="subtle-button" onClick={() => setPreview(!preview)}><Search size={15}/>{preview ? 'Close preview' : 'Preview assessment'}</button><button className="primary-button" onClick={saveDraft}><Save size={16}/> Save draft</button></div>
        {preview && <div className="assessment-preview"><div><span className="eyebrow">STUDENT PREVIEW</span><h2>{title || 'Untitled assessment'}</h2><p>{instructions}</p><small>{subject || 'No subject'} · {duration} minutes · {totalPoints} marks</small></div>{questions.map((q,i) => <article key={q.id}><strong>{i+1}. {q.prompt || 'Question prompt'}</strong><small>{labelFor(q.type)} · {q.points} marks · {q.difficulty}</small>{q.type === 'multiple_choice' && q.options.map((o,j) => <p key={j}>{String.fromCharCode(65+j)}. {o || 'Option not entered'}</p>)}</article>)}</div>}
      </section>
      <aside className="panel draft-sidebar"><div className="panel-heading"><div><h2>Saved drafts</h2><p>Available on this browser</p></div><Save size={18}/></div>{drafts.length === 0 ? <div className="draft-empty">Your saved assessments will appear here.</div> : drafts.map(d => <div className="saved-draft" key={d.id}><div><strong>{d.title}</strong><small>{d.subject} · {d.questions.length} questions</small><small>Edited {new Date(d.updatedAt).toLocaleDateString()}</small></div><button className="subtle-button" onClick={() => loadDraft(d)}>Open</button></div>)}<button className="subtle-button full-width" onClick={resetBuilder}><Plus size={15}/> New assessment</button></aside>
    </div>}

    {tab === 'library' && <section className="panel studio-library-panel"><div className="panel-heading"><div><h2>Resource library</h2><p>Upload teaching materials and organise them by subject</p></div><FileText size={19}/></div><div className="resource-upload-zone"><Upload size={25}/><strong>Add learning materials</strong><p>PDF, DOC, DOCX, PPT, PPTX, TXT and common image formats. Files stay in this browser until secure cloud storage is connected.</p><label className="primary-button"><Plus size={16}/> Choose files<input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp" onChange={e => { void addFiles(e.target.files); e.currentTarget.value = '' }} hidden/></label></div><div className="resource-toolbar"><div className="resource-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resources..."/></div><span>{resources.length} files stored locally</span></div>{filteredResources.length === 0 ? <div className="draft-empty">No resources found. Add a file to begin building your library.</div> : <div className="resource-list">{filteredResources.map(r => <div className="resource-list-row" key={r.id}><span className="studio-file-icon"><FileText size={18}/></span><div><strong>{r.name}</strong><small>{r.subject} · {(r.size / 1024 / 1024).toFixed(2)} MB · {new Date(r.savedAt).toLocaleDateString()}</small></div><button className="icon-button" aria-label={`Download ${r.name}`} onClick={() => void downloadResource(r.id)}><Download size={16}/></button><button className="icon-button" aria-label={`Delete ${r.name}`} onClick={() => void deleteResource(r.id)}><Trash2 size={16}/></button></div>)}</div>}</section>}

    {tab === 'assign' && <section className="panel assignment-setup-panel"><div className="panel-heading"><div><h2>Assignment setup</h2><p>Prepare assignment details for when learner accounts are connected</p></div><Send size={19}/></div><div className="setup-banner warning-banner"><div className="setup-banner-icon"><Filter size={20}/></div><div className="setup-banner-copy"><strong>Assignment delivery is not active</strong><p>No learner accounts or secure backend are connected. This page does not send or publish anything.</p></div></div><div className="studio-form-grid"><label className="studio-field">Assessment draft<select value={activeId || ''} onChange={e => { const selected = drafts.find(d => d.id === e.target.value); if (selected) loadDraft(selected) }}><option value="">Select a saved assessment</option>{drafts.map(d => <option value={d.id} key={d.id}>{d.title} — {d.subject}</option>)}</select></label><label className="studio-field">Recipient group<select disabled><option>Connect learner accounts first</option></select></label><label className="studio-field">Assignment due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><label className="studio-field">Delivery status<input value="Draft — not published" readOnly/></label></div><div className="assignment-summary"><Check size={17}/><p>Once authentication and learner records are connected, this workflow will let you assign an approved assessment to one learner or a selected group and track submissions.</p></div></section>}
    <footer className="page-footer"><span>STUDYSPACE MONITOR <b>·</b> CONTENT STUDIO</span><span>Drafts are currently browser-local.</span></footer>
  </div>
}
