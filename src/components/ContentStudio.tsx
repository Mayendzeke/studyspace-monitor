import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, CheckCircle2, ClipboardList, Download, FileText, Filter, Plus, Save, Search, Send, Trash2, Upload, X, Eye, ShieldCheck } from 'lucide-react'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'true_false' | 'matching' | 'word_puzzle'
type Difficulty = 'Foundation' | 'Standard' | 'Advanced'
type Pair = { left: string; right: string }
type Question = {
  id: string; type: QuestionType; prompt: string; options: string[]; answer: string
  acceptedAnswers: string[]; pairs: Pair[]; explanation: string; points: number
  difficulty: Difficulty; topic: string
}
type Status = 'draft' | 'review' | 'approved'
type ExerciseDraft = {
  id: string; title: string; subject: string; level: string; grade: string; curriculum: string
  instructions: string; duration: number; dueDate: string; questions: Question[]
  status: Status; updatedAt: string
}
type ResourceCategory = 'Notes' | 'Revision' | 'Worksheet' | 'Past paper' | 'Reference' | 'Other'
type ResourceRecord = {
  id: string; name: string; subject: string; topic: string; category: ResourceCategory
  description: string; kind: string; size: number; savedAt: string
}
type AssignmentDraft = { id: string; exerciseId: string; target: string; dueDate: string; availability: string; updatedAt: string }

const DRAFTS_KEY = 'studyspace-monitor-exercise-drafts-v1'
const ASSIGNMENTS_KEY = 'studyspace-monitor-assignment-drafts-v1'
const RESOURCE_DB = 'studyspace-monitor-content-v1'
const RESOURCE_STORE = 'resources'
const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' }, { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or false' }, { value: 'matching', label: 'Matching pairs' },
  { value: 'word_puzzle', label: 'Word puzzle' },
]
const categories: ResourceCategory[] = ['Notes', 'Revision', 'Worksheet', 'Past paper', 'Reference', 'Other']
const newQuestion = (): Question => ({
  id: crypto.randomUUID(), type: 'multiple_choice', prompt: '', options: ['', '', '', ''],
  answer: '', acceptedAnswers: [], pairs: [{left:'',right:''},{left:'',right:''}],
  explanation: '', points: 1, difficulty: 'Standard', topic: '',
})
const readJson = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
const openResourceDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(RESOURCE_DB, 1)
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(RESOURCE_STORE)) request.result.createObjectStore(RESOURCE_STORE, {keyPath:'id'}) }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
const bytes = (n:number) => n < 1024*1024 ? `${(n/1024).toFixed(0)} KB` : `${(n/1024/1024).toFixed(2)} MB`
const readDrafts = (): ExerciseDraft[] => readJson<ExerciseDraft[]>(DRAFTS_KEY, []).map(d => ({
  ...d,
  status: d.status || 'draft',
  questions: (d.questions || []).map(q => ({
    ...q,
    acceptedAnswers: q.acceptedAnswers || [],
    pairs: q.pairs || [{left:'',right:''},{left:'',right:''}],
    options: q.options || ['', '', '', ''],
  })),
}))

export default function ContentStudio() {
  const [tab,setTab] = useState<'builder'|'library'|'assign'>('builder')
  const [drafts,setDrafts] = useState<ExerciseDraft[]>(readDrafts)
  const [assignments,setAssignments] = useState<AssignmentDraft[]>(() => readJson(ASSIGNMENTS_KEY,[]))
  const [resources,setResources] = useState<ResourceRecord[]>([])
  const [activeId,setActiveId] = useState<string|null>(null)
  const [title,setTitle] = useState(''); const [subject,setSubject] = useState('')
  const [level,setLevel] = useState('Secondary'); const [grade,setGrade] = useState('')
  const [curriculum,setCurriculum] = useState(''); const [instructions,setInstructions] = useState('Read each question carefully and answer all questions.')
  const [duration,setDuration] = useState(30); const [dueDate,setDueDate] = useState('')
  const [questions,setQuestions] = useState<Question[]>([newQuestion()]); const [editing,setEditing] = useState(0)
  const [notice,setNotice] = useState(''); const [preview,setPreview] = useState(false)
  const [resourceSearch,setResourceSearch] = useState(''); const [resourceSubjectFilter,setResourceSubjectFilter] = useState('All')
  const [resourceCategoryFilter,setResourceCategoryFilter] = useState('All'); const [resourceSort,setResourceSort] = useState('newest')
  const [uploadSubject,setUploadSubject] = useState(''); const [uploadTopic,setUploadTopic] = useState('')
  const [uploadCategory,setUploadCategory] = useState<ResourceCategory>('Notes'); const [uploadDescription,setUploadDescription] = useState('')
  const [assignmentExercise,setAssignmentExercise] = useState(''); const [assignmentTarget,setAssignmentTarget] = useState('One learner')
  const [assignmentDue,setAssignmentDue] = useState(''); const [assignmentAvailability,setAssignmentAvailability] = useState('Immediately after publishing')

  useEffect(()=>{ localStorage.setItem(DRAFTS_KEY,JSON.stringify(drafts)) },[drafts])
  useEffect(()=>{ localStorage.setItem(ASSIGNMENTS_KEY,JSON.stringify(assignments)) },[assignments])
  useEffect(()=>{
    let alive=true
    openResourceDb().then(db=>{
      const req=db.transaction(RESOURCE_STORE,'readonly').objectStore(RESOURCE_STORE).getAll()
      req.onsuccess=()=>{if(alive)setResources((req.result as (ResourceRecord & {blob:Blob})[]).map(r=>({...r,category:r.category||'Other',description:r.description||'',topic:r.topic||'',subject:r.subject||'Uncategorised'})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)))}
    }).catch(()=>setNotice('Browser file storage could not be opened.'))
    return ()=>{alive=false}
  },[])

  const totalPoints=useMemo(()=>questions.reduce((sum,q)=>sum+(Number(q.points)||0),0),[questions])
  const activeQuestion=questions[editing] || newQuestion()
  const labelFor=(type:QuestionType)=>questionTypes.find(t=>t.value===type)?.label || type
  const subjects=Array.from(new Set(resources.map(r=>r.subject).filter(Boolean))).sort()
  const filteredResources=resources.filter(r=>{
    const match=`${r.name} ${r.subject} ${r.topic} ${r.description}`.toLowerCase().includes(resourceSearch.toLowerCase())
    return match && (resourceSubjectFilter==='All'||r.subject===resourceSubjectFilter) && (resourceCategoryFilter==='All'||r.category===resourceCategoryFilter)
  }).sort((a,b)=>resourceSort==='name'?a.name.localeCompare(b.name):resourceSort==='oldest'?a.savedAt.localeCompare(b.savedAt):b.savedAt.localeCompare(a.savedAt))

  const resetBuilder=()=>{
    setActiveId(null);setTitle('');setSubject('');setLevel('Secondary');setGrade('');setCurriculum('')
    setInstructions('Read each question carefully and answer all questions.');setDuration(30);setDueDate('')
    setQuestions([newQuestion()]);setEditing(0);setPreview(false)
  }
  const loadDraft=(d:ExerciseDraft)=>{
    setActiveId(d.id);setTitle(d.title);setSubject(d.subject);setLevel(d.level);setGrade(d.grade);setCurriculum(d.curriculum)
    setInstructions(d.instructions);setDuration(d.duration);setDueDate(d.dueDate);setQuestions(d.questions);setEditing(0)
    setPreview(false);setTab('builder');setNotice('Assessment loaded.')
  }
  const updateQuestion=(patch:Partial<Question>)=>setQuestions(current=>current.map((q,i)=>i===editing?{...q,...patch}:q))
  const addQuestion=()=>{setQuestions(current=>[...current,newQuestion()]);setEditing(questions.length);setPreview(false)}
  const removeQuestion=(index:number)=>{setQuestions(current=>current.filter((_,i)=>i!==index));setEditing(Math.max(0,Math.min(editing,questions.length-2)))}
  const validationErrors=(list=questions, assessmentTitle=title, assessmentSubject=subject)=>{
    const errors:string[]=[]
    if(!assessmentTitle.trim())errors.push('Add an assessment title.')
    if(!assessmentSubject.trim())errors.push('Choose or enter a subject.')
    if(!list.length)errors.push('Add at least one question.')
    list.forEach((q,i)=>{
      const n=i+1
      if(!q.prompt.trim())errors.push(`Question ${n}: add the prompt.`)
      if(!(Number(q.points)>0))errors.push(`Question ${n}: marks must be greater than zero.`)
      if(q.type==='multiple_choice'){
        const opts=q.options.map(x=>x.trim()).filter(Boolean)
        if(opts.length<2)errors.push(`Question ${n}: add at least two answer options.`)
        if(!q.answer.trim()||!opts.includes(q.answer.trim()))errors.push(`Question ${n}: choose the correct answer from the options.`)
        if(new Set(opts).size!==opts.length)errors.push(`Question ${n}: answer options must be unique.`)
      } else if(q.type==='true_false'){
        if(!['True','False'].includes(q.answer))errors.push(`Question ${n}: select True or False as the answer.`)
      } else if(q.type==='matching'){
        const pairs=q.pairs.filter(p=>p.left.trim()&&p.right.trim())
        if(pairs.length<2)errors.push(`Question ${n}: add at least two complete matching pairs.`)
        if(pairs.length!==q.pairs.length)errors.push(`Question ${n}: complete or remove empty pairs.`)
      } else if(!q.answer.trim())errors.push(`Question ${n}: provide the answer key.`)
    })
    return errors
  }
  const saveDraft=(status:Status='draft')=>{
    const errors=validationErrors()
    if(status!=='draft'&&errors.length){setNotice(errors[0]);return}
    if(!title.trim()||!subject.trim()){setNotice(errors[0]||'Add an assessment title and subject.');return}
    const d:ExerciseDraft={id:activeId||crypto.randomUUID(),title:title.trim(),subject:subject.trim(),level,grade,curriculum,instructions,duration:Math.max(1,duration),dueDate,questions,status,updatedAt:new Date().toISOString()}
    setDrafts(current=>[d,...current.filter(x=>x.id!==d.id)])
    setActiveId(d.id)
    setNotice(status==='review'?'Assessment submitted to the local review queue.':status==='approved'?'Assessment approved locally. Publishing still requires the secure backend.':'Draft saved in this browser only.')
  }
  const setStatus=(d:ExerciseDraft,status:Status)=>{
    if(status!=='draft'){
      const errors=validationErrors(d.questions,d.title,d.subject)
      if(errors.length){setNotice(`${d.title}: ${errors[0]}`);return}
    }
    setDrafts(current=>current.map(x=>x.id===d.id?{...x,status,updatedAt:new Date().toISOString()}:x))
    setNotice(status==='approved'?'Assessment approved. It is not yet published to learners.':status==='review'?'Moved to review.':'Returned to draft.')
  }
  const addFiles=async(files:FileList|null)=>{
    if(!files?.length)return
    const allowed=/\.(pdf|doc|docx|ppt|pptx|txt|rtf|jpg|jpeg|png|webp|csv|xlsx)$/i
    const selected=Array.from(files)
    const invalid=selected.find(f=>!allowed.test(f.name))
    if(invalid){setNotice(`Unsupported file type: ${invalid.name}`);return}
    const oversized=selected.find(f=>f.size>25*1024*1024)
    if(oversized){setNotice(`${oversized.name} exceeds the 25 MB per-file limit.`);return}
    try{
      const db=await openResourceDb();const tx=db.transaction(RESOURCE_STORE,'readwrite')
      for(const file of selected){
        const record:ResourceRecord & {blob:Blob;mimeType:string}={id:crypto.randomUUID(),name:file.name,subject:uploadSubject.trim()||subject.trim()||'Uncategorised',topic:uploadTopic.trim(),category:uploadCategory,description:uploadDescription.trim(),kind:file.type||'application/octet-stream',size:file.size,savedAt:new Date().toISOString(),blob:file,mimeType:file.type||'application/octet-stream'}
        tx.objectStore(RESOURCE_STORE).put(record)
      }
      tx.oncomplete=()=>{
        const req=db.transaction(RESOURCE_STORE,'readonly').objectStore(RESOURCE_STORE).getAll()
        req.onsuccess=()=>setResources((req.result as (ResourceRecord & {blob:Blob})[]).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)))
        setNotice('Files saved in this browser. They are not shared with learners or other devices.')
      }
      tx.onerror=()=>setNotice('File storage failed. Check browser storage capacity.')
    }catch{setNotice('Browser file storage is unavailable.')}
  }
  const updateResource=async(id:string,patch:Partial<ResourceRecord>)=>{
    const db=await openResourceDb();const tx=db.transaction(RESOURCE_STORE,'readwrite');const store=tx.objectStore(RESOURCE_STORE)
    const req=store.get(id)
    req.onsuccess=()=>{if(req.result)store.put({...req.result,...patch})}
    tx.oncomplete=()=>{
      const read=db.transaction(RESOURCE_STORE,'readonly').objectStore(RESOURCE_STORE).getAll()
      read.onsuccess=()=>setResources((read.result as (ResourceRecord & {blob:Blob})[]).map(r=>({...r,category:r.category||'Other',description:r.description||'',topic:r.topic||'',subject:r.subject||'Uncategorised'})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)))
    }
  }
  const downloadResource=async(id:string)=>{
    const db=await openResourceDb();const req=db.transaction(RESOURCE_STORE,'readonly').objectStore(RESOURCE_STORE).get(id)
    req.onsuccess=()=>{
      const item=req.result as (ResourceRecord & {blob:Blob})|undefined
      if(!item?.blob)return
      const url=URL.createObjectURL(item.blob);const a=document.createElement('a');a.href=url;a.download=item.name;a.click()
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    }
  }
  const deleteResource=async(id:string)=>{
    if(!window.confirm('Delete this resource from this browser?'))return
    const db=await openResourceDb();const tx=db.transaction(RESOURCE_STORE,'readwrite');tx.objectStore(RESOURCE_STORE).delete(id)
    tx.oncomplete=()=>setResources(current=>current.filter(r=>r.id!==id))
  }
  const createAssignment=()=>{
    const selected=drafts.find(d=>d.id===assignmentExercise)
    if(!selected||selected.status!=='approved'){setNotice('Select an approved assessment first.');return}
    const a:AssignmentDraft={id:crypto.randomUUID(),exerciseId:selected.id,target:assignmentTarget,dueDate:assignmentDue,availability:assignmentAvailability,updatedAt:new Date().toISOString()}
    setAssignments(current=>[a,...current]);setNotice('Assignment plan saved locally. It has not been delivered to learners.')
  }
  const resourceLabel=(r:ResourceRecord)=>r.topic?`${r.subject} · ${r.topic}`:r.subject

  return <div className="subpage content-studio-page">
    <div className="eyebrow">LEARNING MATERIALS</div><h1>Content Studio</h1>
    <p className="page-subtitle">Build question banks, organise teaching resources, review assessments and prepare assignments.</p>
    <div className="setup-banner warning-banner"><div className="setup-banner-icon"><BookOpen size={21}/></div><div className="setup-banner-copy"><strong>Local content workspace</strong><p>Assessment drafts, assignment plans and uploaded files are currently saved in this browser only. They are not uploaded to Supabase or shared with learners or other devices.</p></div></div>
    <div className="studio-tabs" role="tablist" aria-label="Content Studio sections">
      <button className={tab==='builder'?'selected':''} onClick={()=>setTab('builder')}><ClipboardList size={16}/> Builder</button>
      <button className={tab==='library'?'selected':''} onClick={()=>setTab('library')}><FileText size={16}/> Resource library <span>{resources.length}</span></button>
      <button className={tab==='assign'?'selected':''} onClick={()=>setTab('assign')}><Send size={16}/> Review & assign</button>
    </div>
    {notice&&<div className="studio-notice" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}

    {tab==='builder'&&<div className="studio-builder-layout">
      <section className="panel studio-editor">
        <div className="panel-heading"><div><h2>Assessment details</h2><p>Define the class and assessment settings</p></div><span className="studio-draft-count">{drafts.length} assessments</span></div>
        <div className="studio-form-grid">
          <label className="studio-field studio-field-wide">Assessment title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Algebra: Linear equations test"/></label>
          <label className="studio-field">Subject / module<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Mathematics"/></label>
          <label className="studio-field">Education level<select value={level} onChange={e=>setLevel(e.target.value)}><option>Primary</option><option>Secondary</option><option>High school</option><option>College</option><option>University</option></select></label>
          <label className="studio-field">Grade / year<input value={grade} onChange={e=>setGrade(e.target.value)} placeholder="e.g. Form 3 / Year 1"/></label>
          <label className="studio-field">Curriculum<input value={curriculum} onChange={e=>setCurriculum(e.target.value)} placeholder="e.g. Cambridge IGCSE"/></label>
          <label className="studio-field">Duration (minutes)<input type="number" min="1" max="300" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
          <label className="studio-field">Due date (optional)<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
          <label className="studio-field studio-field-wide">Instructions<textarea rows={2} value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
        </div>
        <div className="question-builder-heading"><div><h2>Question editor</h2><p>{questions.length} questions · {totalPoints} total marks</p></div><button className="subtle-button" onClick={addQuestion}><Plus size={15}/> Add question</button></div>
        <div className="question-editor-layout">
          <div className="question-list">{questions.map((q,i)=><button key={q.id} className={editing===i?'question-list-item active':'question-list-item'} onClick={()=>{setEditing(i);setPreview(false)}}><span>{String(i+1).padStart(2,'0')}</span><span><strong>{q.prompt.trim()||'Untitled question'}</strong><small>{labelFor(q.type)} · {q.points} marks</small></span></button>)}<button className="question-add-row" onClick={addQuestion}><Plus size={15}/> Add another</button></div>
          <div className="question-edit-card">
            <div className="question-edit-top"><strong>Question {editing+1} of {questions.length}</strong><button className="icon-button" aria-label="Delete question" onClick={()=>removeQuestion(editing)} disabled={questions.length===1}><Trash2 size={16}/></button></div>
            <label className="studio-field">Question format<select value={activeQuestion.type} onChange={e=>updateQuestion({type:e.target.value as QuestionType,answer:'',acceptedAnswers:[],options:e.target.value==='multiple_choice'?['','','','']:activeQuestion.options})}>{questionTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <label className="studio-field">Prompt / instruction<textarea rows={3} value={activeQuestion.prompt} onChange={e=>updateQuestion({prompt:e.target.value})} placeholder="Write the question students will see..."/></label>
            {activeQuestion.type==='multiple_choice'&&<div className="question-options"><span className="field-caption">Answer choices — select the correct answer</span>{activeQuestion.options.map((option,i)=><div className="mc-option-row" key={i}><label className="option-input"><b>{String.fromCharCode(65+i)}</b><input value={option} onChange={e=>updateQuestion({options:activeQuestion.options.map((v,j)=>j===i?e.target.value:v)})} placeholder={`Option ${i+1}`}/></label><input type="radio" name={`correct-${activeQuestion.id}`} aria-label={`Mark option ${i+1} correct`} checked={activeQuestion.answer===option&&option!==''} onChange={()=>updateQuestion({answer:option})}/></div>)}</div>}
            {activeQuestion.type==='fill_blank'&&<><div className="builder-hint">Use <code>____</code> in the prompt to show where the missing word belongs.</div><label className="studio-field">Correct answer<input value={activeQuestion.answer} onChange={e=>updateQuestion({answer:e.target.value})} placeholder="Expected word or phrase"/></label><label className="studio-field">Other accepted answers (comma-separated)<input value={activeQuestion.acceptedAnswers.join(', ')} onChange={e=>updateQuestion({acceptedAnswers:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="Optional spelling or wording variants"/></label></>}
            {activeQuestion.type==='true_false'&&<label className="studio-field">Correct answer<select value={activeQuestion.answer} onChange={e=>updateQuestion({answer:e.target.value})}><option value="">Choose answer</option><option>True</option><option>False</option></select></label>}
            {activeQuestion.type==='matching'&&<div className="matching-editor"><div className="matching-title"><span className="field-caption">Matching pairs</span><button className="subtle-button" onClick={()=>updateQuestion({pairs:[...activeQuestion.pairs,{left:'',right:''}]})}><Plus size={14}/> Add pair</button></div>{activeQuestion.pairs.map((pair,i)=><div className="matching-pair" key={i}><input aria-label={`Pair ${i+1} left item`} value={pair.left} onChange={e=>updateQuestion({pairs:activeQuestion.pairs.map((p,j)=>j===i?{...p,left:e.target.value}:p)})} placeholder="Term / item"/><span>↔</span><input aria-label={`Pair ${i+1} match`} value={pair.right} onChange={e=>updateQuestion({pairs:activeQuestion.pairs.map((p,j)=>j===i?{...p,right:e.target.value}:p)})} placeholder="Definition / match"/><button className="icon-button" aria-label="Remove pair" disabled={activeQuestion.pairs.length<=2} onClick={()=>updateQuestion({pairs:activeQuestion.pairs.filter((_,j)=>j!==i)})}><X size={14}/></button></div>)}</div>}
            {activeQuestion.type==='word_puzzle'&&<><label className="studio-field">Clue<input value={activeQuestion.explanation} onChange={e=>updateQuestion({explanation:e.target.value})} placeholder="Give a clue without revealing the word"/></label><label className="studio-field">Answer word<input value={activeQuestion.answer} onChange={e=>updateQuestion({answer:e.target.value})} placeholder="Expected word"/></label><label className="studio-field">Accepted variants<input value={activeQuestion.acceptedAnswers.join(', ')} onChange={e=>updateQuestion({acceptedAnswers:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="Optional alternatives"/></label></>}
            {activeQuestion.type!=='word_puzzle'&&<label className="studio-field">Explanation / feedback<textarea rows={2} value={activeQuestion.explanation} onChange={e=>updateQuestion({explanation:e.target.value})} placeholder="Explain the correct answer..."/></label>}
            <div className="question-meta-grid"><label className="studio-field">Topic / unit<input value={activeQuestion.topic} onChange={e=>updateQuestion({topic:e.target.value})} placeholder="e.g. Algebra"/></label><label className="studio-field">Difficulty<select value={activeQuestion.difficulty} onChange={e=>updateQuestion({difficulty:e.target.value as Difficulty})}><option>Foundation</option><option>Standard</option><option>Advanced</option></select></label><label className="studio-field">Marks<input type="number" min="0.5" step="0.5" value={activeQuestion.points} onChange={e=>updateQuestion({points:Number(e.target.value)})}/></label></div>
          </div>
        </div>
        <div className="studio-actions"><button className="subtle-button" onClick={()=>setPreview(!preview)}><Eye size={15}/>{preview?'Close preview':'Preview'}</button><button className="subtle-button" onClick={()=>saveDraft('draft')}><Save size={15}/> Save draft</button><button className="primary-button" onClick={()=>saveDraft('review')}><Send size={15}/> Submit for review</button></div>
        {preview&&<div className="assessment-preview"><span className="eyebrow">LEARNER PREVIEW</span><h2>{title||'Untitled assessment'}</h2><p>{instructions}</p><small>{subject||'No subject'} · {duration} minutes · {totalPoints} marks</small>{questions.map((q,i)=><article key={q.id}><strong>{i+1}. {q.prompt||'Question prompt'}</strong><small>{labelFor(q.type)} · {q.points} marks · {q.difficulty}</small>{q.type==='multiple_choice'&&q.options.filter(Boolean).map((o,j)=><p key={j}>◯ {o}</p>)}{q.type==='matching'&&<><p>Match each item to the correct definition:</p>{q.pairs.map((p,j)=><p key={j}>{j+1}. {p.left||'Item'} → ______</p>)}<small>Available matches: {q.pairs.map(p=>p.right).filter(Boolean).reverse().join(' · ')}</small></>}{q.type==='fill_blank'&&<p>Answer: __________________</p>}{q.type==='true_false'&&<p>◯ True　 ◯ False</p>}{q.type==='word_puzzle'&&<p>Clue: {q.explanation}</p>}</article>)}</div>}
      </section>
      <aside className="panel draft-sidebar"><div className="panel-heading"><div><h2>Assessment queue</h2><p>Local drafts and review states</p></div><ClipboardList size={18}/></div>{drafts.length===0?<div className="draft-empty">Your assessments will appear here.</div>:drafts.map(d=><div className="saved-draft" key={d.id}><div><strong>{d.title}</strong><small>{d.subject} · {d.questions.length} questions</small><span className={`status-chip status-${d.status}`}>{d.status}</span></div><button className="subtle-button" onClick={()=>loadDraft(d)}>Open</button></div>)}<button className="subtle-button full-width" onClick={resetBuilder}><Plus size={15}/> New assessment</button></aside>
    </div>}

    {tab==='library'&&<section className="panel studio-library-panel"><div className="panel-heading"><div><h2>Resource library</h2><p>Organise teaching materials by subject, topic and resource type</p></div><FileText size={19}/></div>
      <div className="resource-upload-zone"><Upload size={25}/><strong>Add learning materials</strong><p>PDF, Word, PowerPoint, text, CSV, Excel and image files · 25 MB maximum per file. Files remain private to this browser until secure cloud storage is connected.</p>
        <div className="resource-upload-fields"><label className="studio-field">Subject<input value={uploadSubject} onChange={e=>setUploadSubject(e.target.value)} placeholder="e.g. Mathematics"/></label><label className="studio-field">Topic / unit<input value={uploadTopic} onChange={e=>setUploadTopic(e.target.value)} placeholder="e.g. Algebra"/></label><label className="studio-field">Resource type<select value={uploadCategory} onChange={e=>setUploadCategory(e.target.value as ResourceCategory)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="studio-field">Description<input value={uploadDescription} onChange={e=>setUploadDescription(e.target.value)} placeholder="Optional note about this file"/></label></div>
        <label className="primary-button"><Plus size={16}/> Choose files<input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.csv,.xlsx" onChange={e=>{void addFiles(e.target.files);e.currentTarget.value=''}} hidden/></label>
      </div>
      <div className="resource-toolbar"><div className="resource-search"><Search size={16}/><input value={resourceSearch} onChange={e=>setResourceSearch(e.target.value)} placeholder="Search file, subject or topic..."/></div><select aria-label="Filter by subject" value={resourceSubjectFilter} onChange={e=>setResourceSubjectFilter(e.target.value)}><option>All</option>{subjects.map(s=><option key={s}>{s}</option>)}</select><select aria-label="Filter by resource type" value={resourceCategoryFilter} onChange={e=>setResourceCategoryFilter(e.target.value)}><option>All</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select aria-label="Sort resources" value={resourceSort} onChange={e=>setResourceSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div>
      <div className="resource-count-row"><span>{filteredResources.length} of {resources.length} resources</span><span><Filter size={13}/> Filters apply immediately</span></div>
      {filteredResources.length===0?<div className="draft-empty">No resources match these filters. Upload a file or change the search.</div>:<div className="resource-list">{filteredResources.map(r=><div className="resource-list-row resource-expanded-row" key={r.id}><span className="studio-file-icon"><FileText size={18}/></span><div className="resource-main"><strong>{r.name}</strong><small>{resourceLabel(r)} · {r.category} · {bytes(r.size)}</small><small>{r.description||'No description'} · Added {new Date(r.savedAt).toLocaleDateString()}</small><div className="resource-meta-edit"><input aria-label="Edit resource subject" value={r.subject} onChange={e=>setResources(current=>current.map(x=>x.id===r.id?{...x,subject:e.target.value}:x))} onBlur={e=>void updateResource(r.id,{subject:e.target.value})}/><input aria-label="Edit resource topic" value={r.topic} onChange={e=>setResources(current=>current.map(x=>x.id===r.id?{...x,topic:e.target.value}:x))} onBlur={e=>void updateResource(r.id,{topic:e.target.value})}/><select aria-label="Edit resource type" value={r.category} onChange={e=>void updateResource(r.id,{category:e.target.value as ResourceCategory})}>{categories.map(c=><option key={c}>{c}</option>)}</select></div></div><button className="icon-button" aria-label={`Download ${r.name}`} onClick={()=>void downloadResource(r.id)}><Download size={16}/></button><button className="icon-button" aria-label={`Delete ${r.name}`} onClick={()=>void deleteResource(r.id)}><Trash2 size={16}/></button></div>)}</div>}
    </section>}

    {tab==='assign'&&<div className="studio-builder-layout"><section className="panel assignment-setup-panel"><div className="panel-heading"><div><h2>Review and approve</h2><p>Only validated assessments can move to approved</p></div><ShieldCheck size={19}/></div>
      {drafts.length===0?<div className="draft-empty">Create an assessment first.</div>:drafts.map(d=><div className="review-card" key={d.id}><div><strong>{d.title}</strong><small>{d.subject} · {d.questions.length} questions · {d.questions.reduce((s,q)=>s+q.points,0)} marks</small><span className={`status-chip status-${d.status}`}>{d.status}</span></div><div className="review-actions"><button className="subtle-button" onClick={()=>loadDraft(d)}>Edit</button>{d.status!=='approved'&&<button className="primary-button" onClick={()=>setStatus(d,'approved')}><Check size={14}/> Approve</button>}{d.status==='approved'&&<button className="subtle-button" onClick={()=>setStatus(d,'draft')}>Return to draft</button>}</div></div>)}
      <div className="settings-divider"/><h2>Assignment preparation</h2><p className="builder-hint">This creates a local delivery plan only. Learner targeting and actual delivery require connected accounts and server-side permissions.</p>
      <div className="studio-form-grid"><label className="studio-field studio-field-wide">Approved assessment<select value={assignmentExercise} onChange={e=>setAssignmentExercise(e.target.value)}><option value="">Choose an approved assessment</option>{drafts.filter(d=>d.status==='approved').map(d=><option key={d.id} value={d.id}>{d.title} — {d.subject}</option>)}</select></label><label className="studio-field">Intended recipients<select value={assignmentTarget} onChange={e=>setAssignmentTarget(e.target.value)}><option>One learner</option><option>Selected learners</option><option>All learners</option></select></label><label className="studio-field">Due date<input type="date" value={assignmentDue} onChange={e=>setAssignmentDue(e.target.value)}/></label><label className="studio-field studio-field-wide">Availability<select value={assignmentAvailability} onChange={e=>setAssignmentAvailability(e.target.value)}><option>Immediately after publishing</option><option>Schedule for due date</option><option>Manually release later</option></select></label></div><div className="studio-actions"><button className="primary-button" onClick={createAssignment}><Save size={15}/> Save assignment plan</button></div>
      </section><aside className="panel draft-sidebar"><div className="panel-heading"><div><h2>Assignment plans</h2><p>Saved locally · not delivered</p></div><Send size={18}/></div>{assignments.length===0?<div className="draft-empty">Your assignment plans will appear here.</div>:assignments.map(a=>{const d=drafts.find(x=>x.id===a.exerciseId);return <div className="saved-draft" key={a.id}><div><strong>{d?.title||'Assessment'}</strong><small>{a.target} · {a.dueDate||'No due date'}</small><small>{a.availability}</small></div></div>})}</aside></div>}
    <footer className="page-footer"><span>STUDYSPACE MONITOR · CONTENT STUDIO</span><span>Local browser storage · no student delivery</span></footer>
  </div>
}
