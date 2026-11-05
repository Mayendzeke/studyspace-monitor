import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AssessmentReviewQueue from './AssessmentReviewQueue'
import { Check, CheckCircle2, ClipboardList, Download, FileText, Filter, Plus, Save, Search, Send, Trash2, Upload, X, Eye, ShieldCheck } from 'lucide-react'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'true_false' | 'matching' | 'word_puzzle' | 'short_answer'
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
  storagePath?: string; cloudId?: string; blob?: Blob; mimeType?: string
}
type AssignmentDraft = { id: string; exerciseId: string; target: string; dueDate: string; availability: string; updatedAt: string; assignedCount?: number }

const DRAFTS_KEY = 'studyspace-monitor-exercise-drafts-v1'
const ASSIGNMENTS_KEY = 'studyspace-monitor-assignment-drafts-v1'
const RESOURCE_DB = 'studyspace-monitor-content-v1'
const RESOURCE_STORE = 'resources'
const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' }, { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or false' }, { value: 'matching', label: 'Matching pairs' },
  { value: 'word_puzzle', label: 'Word puzzle' }, { value: 'short_answer', label: 'Written response' },
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
  const [learners,setLearners] = useState<{id:string;student_id:string|null;full_name:string;preferred_name:string;grade:string;curriculum:string}[]>([])
  const [selectedLearner,setSelectedLearner] = useState('')
  const [cloudLoading,setCloudLoading] = useState(true)
  const [cloudError,setCloudError] = useState('')
  const [resourceAssignId,setResourceAssignId] = useState('')
  const [resourceAssignLearner,setResourceAssignLearner] = useState('')
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

  const mapCloudDraft = (set: any, questions: any[], answerKeys: any[]): ExerciseDraft => {
    const keys = new Map(answerKeys.map((item:any)=>[item.question_id,item.answer_key||{}]));
    return {
      id: String(set.id), title: String(set.title||''), subject: String(set.subject_name||''),
      level: String(set.education_level||'Secondary'), grade: String(set.grade||''),
      curriculum: String(set.curriculum||''), instructions: String(set.instructions||''),
      duration: Number(set.duration_minutes||30), dueDate: set.due_date||'',
      status: (set.review_status||'draft') as Status, updatedAt: String(set.updated_at||set.created_at),
      questions: questions.map((q:any)=>({
        id:String(q.id), type:q.question_type as QuestionType, prompt:String(q.prompt||''),
        options:Array.isArray(q.content?.options)?q.content.options:['','','',''],
        answer:String(keys.get(q.id)?.answer||''),
        acceptedAnswers:Array.isArray(keys.get(q.id)?.acceptedAnswers)?keys.get(q.id).acceptedAnswers:[],
        pairs:Array.isArray(keys.get(q.id)?.pairs)?keys.get(q.id).pairs:[{left:'',right:''},{left:'',right:''}],
        explanation:String(keys.get(q.id)?.explanation||''), points:Number(q.points||1),
        difficulty:(q.difficulty||q.content?.difficulty||'Standard') as Difficulty,
        topic:String(q.topic||q.content?.topic||''),
      })),
    };
  };

  async function saveCloudDraft(draft:ExerciseDraft, status:Status):Promise<ExerciseDraft> {
    if(!supabase) throw new Error('Supabase is not connected.');
    const {data:authState,error:authError}=await supabase.auth.getUser();
    if(authError||!authState.user) throw new Error('Sign in again to save content to Studyspace.');
    const {error:setError}=await supabase.from('exercise_sets').upsert({
      id:draft.id,created_by:authState.user.id,title:draft.title,instructions:draft.instructions,
      subject_name:draft.subject,education_level:draft.level,grade:draft.grade,curriculum:draft.curriculum,
      question_count:draft.questions.length,review_status:status,
      duration_minutes:draft.duration,due_date:draft.dueDate||null,updated_at:new Date().toISOString()
    },{onConflict:'id'});
    if(setError) throw setError;
    const {data:oldQuestions,error:oldError}=await supabase.from('exercise_questions').select('id').eq('exercise_set_id',draft.id);
    if(oldError) throw oldError;
    if(oldQuestions?.length){
      const {error:deleteError}=await supabase.from('exercise_questions').delete().eq('exercise_set_id',draft.id);
      if(deleteError) throw deleteError;
    }
    if(draft.questions.length){
      const rows=draft.questions.map((q,index)=>({
        id:q.id,exercise_set_id:draft.id,position:index+1,question_type:q.type,prompt:q.prompt,
        // Never put accepted answers, correct matching pairs, or explanations
        // in learner-readable question content. Matching choices are rotated so
        // the right-hand choices are not aligned with the correct left-hand item.
        content:{
          options:q.options,
          pairs:q.type==='matching'&&q.pairs.length>1
            ? q.pairs.map((pair,index)=>({left:pair.left,right:q.pairs[(index+1)%q.pairs.length].right}))
            : q.type==='matching'?q.pairs.map(pair=>({left:pair.left,right:pair.right})) : undefined,
          difficulty:q.difficulty,
          topic:q.topic
        },
        explanation:'',points:q.points,topic:q.topic,difficulty:q.difficulty,
      }));
      const {error:questionError}=await supabase.from('exercise_questions').insert(rows);
      if(questionError) throw questionError;
      const keys=draft.questions.map(q=>({
        question_id:q.id,
        answer_key:{answer:q.answer,acceptedAnswers:q.acceptedAnswers,pairs:q.type==='matching'?q.pairs:undefined,explanation:q.explanation}
      }));
      const {error:keyError}=await supabase.from('exercise_answer_keys').upsert(keys,{onConflict:'question_id'});
      if(keyError) throw keyError;
    }
    return {...draft,status,updatedAt:new Date().toISOString()};
  }

  async function loadCloudWorkspace() {
    if(!supabase){setCloudLoading(false);setCloudError('Supabase is not configured.');return;}
    try {
      const {data:authState,error:authError}=await supabase.auth.getUser();
      if(authError||!authState.user) throw new Error('Sign in again to access the cloud content workspace.');
      const adminId=authState.user.id;
      const [setsResult,learnersResult,resourcesResult,assignmentsResult,localResourceRecords]=await Promise.all([
        supabase.from('exercise_sets').select('*').eq('created_by',adminId).order('updated_at',{ascending:false}),
        supabase.from('profiles').select('id,student_id,full_name,preferred_name,grade,curriculum').eq('role','learner').eq('account_status','active').order('preferred_name'),
        supabase.from('learning_resources').select('*').eq('created_by',adminId).order('created_at',{ascending:false}),
        supabase.from('exercise_assignments').select('id,exercise_set_id,learner_id,due_at,available_at,assigned_at').order('assigned_at',{ascending:false}),
        openResourceDb().then(db=>new Promise<any[]>((resolve,reject)=>{const req=db.transaction(RESOURCE_STORE,'readonly').objectStore(RESOURCE_STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})),
      ]);
      if(setsResult.error) throw setsResult.error;
      if(learnersResult.error) throw learnersResult.error;
      if(resourcesResult.error) throw resourcesResult.error;
      if(assignmentsResult.error) throw assignmentsResult.error;
      const ids=(setsResult.data||[]).map(row=>row.id);
      let questions:any[]=[];let keys:any[]=[];
      if(ids.length){
        const qResult=await supabase.from('exercise_questions').select('*').in('exercise_set_id',ids).order('position');
        if(qResult.error) throw qResult.error;
        questions=qResult.data||[];
        const questionIds=questions.map(q=>q.id);
        if(questionIds.length){
          const kResult=await supabase.from('exercise_answer_keys').select('question_id,answer_key').in('question_id',questionIds);
          if(kResult.error) throw kResult.error;
          keys=kResult.data||[];
        }
      }
      let loaded=(setsResult.data||[]).map(set=>mapCloudDraft(set,questions.filter(q=>q.exercise_set_id===set.id),keys));
      const cloudIds=new Set(loaded.map(d=>d.id));
      const legacyDrafts=readDrafts().filter(d=>!cloudIds.has(d.id));
      for(const legacy of legacyDrafts){
        try{const saved=await saveCloudDraft(legacy,legacy.status);loaded.unshift(saved);cloudIds.add(saved.id);}
        catch{/* Preserve an offline-only draft when the network or schema is unavailable. */}
      }
      if(loaded.length||!readDrafts().length) setDrafts(loaded);
      const activeLearners=(learnersResult.data||[]) as typeof learners;
      setLearners(activeLearners);
      const groupedAssignments=new Map<string,any[]>();
      for(const row of assignmentsResult.data||[]){
        const key=String(row.exercise_set_id)+'|'+String(row.due_at||'');
        groupedAssignments.set(key,[...(groupedAssignments.get(key)||[]),row]);
      }
      const remotePlans:AssignmentDraft[]=[];
      for(const rows of groupedAssignments.values()){
        const first=rows[0];
        if(!first) continue;
        const learnerNames=rows.map(row=>activeLearners.find(student=>student.id===row.learner_id)).filter(Boolean);
        const firstLearner=learnerNames[0];
        const target=rows.length===activeLearners.length?'All learners':learnerNames.length===1&&firstLearner?(firstLearner.preferred_name||firstLearner.full_name||firstLearner.student_id||'One learner'):`${learnerNames.length} learners`;
        const release=first.available_at&&new Date(first.available_at).getTime()>Date.now()?'Scheduled for '+new Date(first.available_at).toLocaleDateString():'Immediately after publishing';
        remotePlans.push({id:String(first.id),exerciseId:String(first.exercise_set_id),target,dueDate:first.due_at?String(first.due_at).slice(0,10):'',availability:release,updatedAt:String(first.assigned_at||''),assignedCount:rows.length});
      }
      if(remotePlans.length) setAssignments(remotePlans);
      const localById=new Map(localResourceRecords.map((r:any)=>[String(r.id),r]));
      const cloudResources=(resourcesResult.data||[]).map((r:any)=>{
        const local=localById.get(String(r.id));
        return {id:String(r.id),cloudId:String(r.id),storagePath:r.storage_path,name:r.title,subject:r.subject_name||'Uncategorised',topic:r.topic||'',category:(r.resource_type||'Other') as ResourceCategory,description:r.description||'',kind:r.mime_type||'application/octet-stream',size:Number(r.file_size||0),savedAt:r.created_at,blob:local?.blob||undefined,mimeType:r.mime_type||'application/octet-stream'} as ResourceRecord;
      });
      const cloudResourceIds=new Set(cloudResources.map(r=>r.id));
      const legacyFiles=localResourceRecords.filter((r:any)=>!cloudResourceIds.has(String(r.id))&&r.blob instanceof Blob);
      for(const local of legacyFiles){
        try{
          const id=String(local.id);
          const path=adminId+'/resources/'+id+'/'+String(local.name).replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,100);
          const {error:uploadError}=await supabase.storage.from('studyspace-resources').upload(path,local.blob,{contentType:local.kind||local.mimeType||'application/octet-stream',upsert:true});
          if(uploadError) throw uploadError;
          const {data:row,error:insertError}=await supabase.from('learning_resources').insert({id,created_by:adminId,title:local.name,description:local.description||'',subject_name:local.subject||'Uncategorised',topic:local.topic||'',resource_type:local.category||'Other',education_level:'',curriculum:'',storage_path:path,mime_type:local.kind||local.mimeType||'application/octet-stream',file_size:local.size}).select('*').single();
          if(insertError) throw insertError;
          cloudResources.unshift({id:row.id,cloudId:row.id,storagePath:path,name:row.title,subject:row.subject_name,topic:row.topic,category:row.resource_type,description:row.description,kind:row.mime_type,size:row.file_size,savedAt:row.created_at,blob:local.blob,mimeType:row.mime_type});
        }catch{/* Keep this resource in local cache until cloud migration succeeds. */}
      }
      setResources(cloudResources);
      setCloudError('');
    }catch(reason){setCloudError(reason instanceof Error?reason.message:'The cloud content workspace could not be loaded.');}
    finally{setCloudLoading(false);}
  }

  useEffect(()=>{void loadCloudWorkspace();},[])

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
      } else if(q.type==='short_answer'){
        // Written responses are marked by a teacher after submission.
        if(q.explanation.trim().length>2000)errors.push(`Question ${n}: marking guidance must be under 2,000 characters.`)
      } else if(!q.answer.trim())errors.push(`Question ${n}: provide the answer key.`)
    })
    return errors
  }
  const saveDraft=async(status:Status='draft')=>{
    const errors=validationErrors()
    if(status!=='draft'&&errors.length){setNotice(errors[0]);return}
    if(!title.trim()||!subject.trim()){setNotice(errors[0]||'Add an assessment title and subject.');return}
    const d:ExerciseDraft={id:activeId||crypto.randomUUID(),title:title.trim(),subject:subject.trim(),level,grade,curriculum,instructions,duration:Math.max(1,Math.min(300,duration)),dueDate,questions,status,updatedAt:new Date().toISOString()}
    setDrafts(current=>[d,...current.filter(x=>x.id!==d.id)])
    setActiveId(d.id)
    try{
      const saved=await saveCloudDraft(d,status)
      setDrafts(current=>[saved,...current.filter(x=>x.id!==saved.id)])
      setNotice(status==='review'?'Assessment saved to Studyspace and submitted for review.':status==='approved'?'Assessment approved in Studyspace. Assign it to learners to publish.':'Draft saved securely to Studyspace.')
    }catch(reason){
      setNotice('The draft remains saved in this browser cache, but cloud saving failed: '+(reason instanceof Error?reason.message:'Unknown error.'))
    }
  }
  const setStatus=async(d:ExerciseDraft,status:Status)=>{
    if(status!=='draft'){
      const errors=validationErrors(d.questions,d.title,d.subject)
      if(errors.length){setNotice(`${d.title}: ${errors[0]}`);return}
    }
    try{
      if(!supabase) throw new Error('Supabase is not connected.')
      const {error}=await supabase.from('exercise_sets').update({review_status:status,updated_at:new Date().toISOString()}).eq('id',d.id)
      if(error) throw error
      setDrafts(current=>current.map(x=>x.id===d.id?{...x,status,updatedAt:new Date().toISOString()}:x))
      setNotice(status==='approved'?'Assessment approved in Studyspace. Assign it to learners to publish.':status==='review'?'Moved to the cloud review queue.':'Returned to draft.')
    }catch(reason){setNotice('The review status could not be saved to Studyspace: '+(reason instanceof Error?reason.message:'Unknown error.'))}
  }
  const addFiles=async(files:FileList|null)=>{
    if(!files?.length)return
    const allowed=/\.(pdf|doc|docx|ppt|pptx|txt|rtf|jpg|jpeg|png|webp|csv|xlsx)$/i
    const selected=Array.from(files)
    const invalid=selected.find(file=>!allowed.test(file.name))
    if(invalid){setNotice(`Unsupported file type: ${invalid.name}`);return}
    const oversized=selected.find(file=>file.size>25*1024*1024)
    if(oversized){setNotice(`${oversized.name} exceeds the 25 MB per-file limit.`);return}
    if(!supabase){setNotice('Connect the Studyspace cloud before uploading shared teaching resources.');return}
    try{
      const {data:authState,error:authError}=await supabase.auth.getUser()
      if(authError||!authState.user) throw new Error('Sign in again before uploading teaching resources.')
      const db=await openResourceDb()
      const uploaded:(ResourceRecord & {blob:Blob;mimeType:string})[]=[]
      for(const file of selected){
        const id=crypto.randomUUID()
        const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,100)||'resource'
        const storagePath=authState.user.id+'/resources/'+id+'/'+safeName
        const mimeType=file.type||'application/octet-stream'
        const {error:storageError}=await supabase.storage.from('studyspace-resources').upload(storagePath,file,{contentType:mimeType,upsert:false})
        if(storageError) throw new Error('Could not upload '+file.name+': '+storageError.message)
        const record={id,created_by:authState.user.id,title:file.name,description:uploadDescription.trim(),subject_name:uploadSubject.trim()||subject.trim()||'Uncategorised',topic:uploadTopic.trim(),resource_type:uploadCategory,education_level:level,curriculum,storage_path:storagePath,mime_type:mimeType,file_size:file.size}
        const {data:cloud,error:insertError}=await supabase.from('learning_resources').insert(record).select('*').single()
        if(insertError){
          await supabase.storage.from('studyspace-resources').remove([storagePath])
          throw new Error('Could not save resource details: '+insertError.message)
        }
        const localRecord:ResourceRecord & {blob:Blob;mimeType:string;storagePath:string;cloudId:string}={id:cloud.id,cloudId:cloud.id,storagePath,name:cloud.title,subject:cloud.subject_name,topic:cloud.topic,category:cloud.resource_type,description:cloud.description,kind:mimeType,size:file.size,savedAt:cloud.created_at,blob:file,mimeType}
        uploaded.push(localRecord)
        const tx=db.transaction(RESOURCE_STORE,'readwrite')
        tx.objectStore(RESOURCE_STORE).put(localRecord)
        await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
      }
      setResources(current=>[...uploaded,...current.filter(item=>!uploaded.some(next=>next.id===item.id))])
      setNotice(uploaded.length+' resource(s) uploaded securely and saved to the cloud library.')
    }catch(reason){setNotice(reason instanceof Error?reason.message:'Cloud upload failed.')}
  }
  const updateResource=async(id:string,patch:Partial<ResourceRecord>)=>{
    const resource=resources.find(item=>item.id===id)
    if(!resource||!supabase)return
    const cloudPatch:any={}
    if(patch.subject!==undefined)cloudPatch.subject_name=patch.subject
    if(patch.topic!==undefined)cloudPatch.topic=patch.topic
    if(patch.category!==undefined)cloudPatch.resource_type=patch.category
    if(patch.description!==undefined)cloudPatch.description=patch.description
    const {error}=await supabase.from('learning_resources').update(cloudPatch).eq('id',resource.cloudId||id)
    if(error){setNotice('Resource details could not be saved to the cloud: '+error.message);return}
    const db=await openResourceDb()
    const record={...resource,...patch}
    const tx=db.transaction(RESOURCE_STORE,'readwrite');tx.objectStore(RESOURCE_STORE).put(record)
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
    setResources(current=>current.map(item=>item.id===id?record:item))
  }
  const downloadResource=async(id:string)=>{
    const item=resources.find(resource=>resource.id===id)
    if(!item||!supabase)return
    try{
      let blob=item.blob
      if(!blob){
        const {data,error}=await supabase.storage.from('studyspace-resources').download(item.storagePath||'')
        if(error) throw error
        blob=data
        const db=await openResourceDb();const tx=db.transaction(RESOURCE_STORE,'readwrite')
        tx.objectStore(RESOURCE_STORE).put({...item,blob,mimeType:item.kind})
        await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
        setResources(current=>current.map(resource=>resource.id===id?{...resource,blob}:resource))
      }
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=item.name;link.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(reason){setNotice(reason instanceof Error?reason.message:'The resource could not be downloaded.')}
  }
  const deleteResource=async(id:string)=>{
    const item=resources.find(resource=>resource.id===id)
    if(!item||!supabase||!window.confirm('Delete this resource from the cloud library and remove its assignments?'))return
    try{
      const {data:assignments,error:assignmentError}=await supabase.from('resource_assignments').select('learner_id').eq('resource_id',item.cloudId||id)
      if(assignmentError) throw assignmentError
      if(assignments?.length){
        const {error}=await supabase.from('resource_assignments').delete().eq('resource_id',item.cloudId||id)
        if(error) throw error
      }
      if(item.storagePath){
        const {error}=await supabase.storage.from('studyspace-resources').remove([item.storagePath])
        if(error) throw error
      }
      const {error:deleteError}=await supabase.from('learning_resources').delete().eq('id',item.cloudId||id)
      if(deleteError) throw deleteError
      const db=await openResourceDb();const tx=db.transaction(RESOURCE_STORE,'readwrite');tx.objectStore(RESOURCE_STORE).delete(id)
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
      setResources(current=>current.filter(resource=>resource.id!==id))
      setNotice('Resource deleted from the cloud library.')
    }catch(reason){setNotice(reason instanceof Error?reason.message:'Resource deletion failed.')}
  }
  const createAssignment=async()=>{
    const selected=drafts.find(d=>d.id===assignmentExercise)
    if(!selected||selected.status!=='approved'){setNotice('Select an approved assessment first.');return}
    if(!supabase){setNotice('Connect the Studyspace cloud before assigning assessments.');return}
    const targets=assignmentTarget==='All learners'?learners:(learners.filter(student=>student.id===selectedLearner))
    if(!targets.length){setNotice('Choose at least one active learner.');return}
    try{
      const {data:authState,error:authError}=await supabase.auth.getUser()
      if(authError||!authState.user) throw new Error('Sign in again before assigning work.')
      const releaseAt=assignmentAvailability==='Immediately after publishing'||!assignmentDue
        ? new Date().toISOString()
        : new Date(assignmentDue+'T00:00:00').toISOString()
      const dueAt=assignmentDue?new Date(assignmentDue+'T23:59:59').toISOString():null
      const {error:publishError}=await supabase.from('exercise_sets').update({is_published:true,review_status:'approved',updated_at:new Date().toISOString()}).eq('id',selected.id)
      if(publishError) throw publishError
      const rows=targets.map(student=>({exercise_set_id:selected.id,learner_id:student.id,assigned_by:authState.user.id,due_at:dueAt,available_at:releaseAt}))
      const {data:created,error:assignmentError}=await supabase.from('exercise_assignments').upsert(rows,{onConflict:'exercise_set_id,learner_id'}).select('*')
      if(assignmentError) throw assignmentError
      const a:AssignmentDraft={id:crypto.randomUUID(),exerciseId:selected.id,target:assignmentTarget==='All learners'?'All learners':(targets[0].preferred_name||targets[0].full_name||targets[0].student_id||'One learner'),dueDate:assignmentDue,availability:assignmentAvailability,updatedAt:new Date().toISOString(),assignedCount:created?.length||targets.length}
      setAssignments(current=>[a,...current])
      setNotice('Assessment published and assigned to '+targets.length+' learner(s). It will appear in their Study & Exams workspace.')
    }catch(reason){setNotice('Assignment could not be published: '+(reason instanceof Error?reason.message:'Unknown error.'))}
  }
  const assignResourceToLearner=async()=>{
    if(!supabase||!resourceAssignId||!resourceAssignLearner){setNotice('Choose a resource and learner first.');return}
    const resource=resources.find(item=>item.id===resourceAssignId)
    if(!resource){setNotice('Resource not found.');return}
    try{
      const {data:authState,error:authError}=await supabase.auth.getUser()
      if(authError||!authState.user) throw new Error('Sign in again before assigning resources.')
      const {error}=await supabase.from('resource_assignments').upsert({resource_id:resource.cloudId||resource.id,learner_id:resourceAssignLearner,assigned_by:authState.user.id},{onConflict:'resource_id,learner_id'})
      if(error) throw error
      setNotice('Resource assigned successfully. It will appear in the learner’s Student Library.')
    }catch(reason){setNotice(reason instanceof Error?reason.message:'Resource assignment failed.')}
  }
  const resourceLabel=(r:ResourceRecord)=>r.topic?`${r.subject} · ${r.topic}`:r.subject

  return <div className="subpage content-studio-page">
    <div className="eyebrow">LEARNING MATERIALS</div><h1>Content Studio</h1>
    <p className="page-subtitle">Build question banks, organise teaching resources, review assessments and prepare assignments.</p>
    <div className={cloudError?'setup-banner warning-banner':'setup-banner'}><div className="setup-banner-icon"><ShieldCheck size={21}/></div><div className="setup-banner-copy"><strong>{cloudLoading?'Connecting to Studyspace…':cloudError?'Cloud workspace needs attention':'Cloud content workspace'}</strong><p>{cloudError||'Assessments, answer keys, teaching resources and learner assignments are stored in the shared Studyspace project. Your browser cache is retained for continuity.'}</p></div><button className="subtle-button" onClick={()=>void loadCloudWorkspace()} disabled={cloudLoading}>Refresh</button></div>
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
            {activeQuestion.type==='short_answer'&&<div className="builder-hint">Learners write a response. A teacher reviews it and awards marks in the Assignments review queue after submission.</div>}
            {activeQuestion.type==='word_puzzle'&&<><label className="studio-field">Clue<input value={activeQuestion.explanation} onChange={e=>updateQuestion({explanation:e.target.value})} placeholder="Give a clue without revealing the word"/></label><label className="studio-field">Answer word<input value={activeQuestion.answer} onChange={e=>updateQuestion({answer:e.target.value})} placeholder="Expected word"/></label><label className="studio-field">Accepted variants<input value={activeQuestion.acceptedAnswers.join(', ')} onChange={e=>updateQuestion({acceptedAnswers:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="Optional alternatives"/></label></>}
            {activeQuestion.type==='short_answer'&&<label className="studio-field">Teacher marking guidance (private)<textarea rows={3} value={activeQuestion.explanation} onChange={e=>updateQuestion({explanation:e.target.value})} placeholder="What should a strong response include? This guidance is shown only after marking."/></label>}
            {activeQuestion.type!=='word_puzzle'&&activeQuestion.type!=='short_answer'&&<label className="studio-field">Explanation / feedback<textarea rows={2} value={activeQuestion.explanation} onChange={e=>updateQuestion({explanation:e.target.value})} placeholder="Explain the correct answer..."/></label>}
            <div className="question-meta-grid"><label className="studio-field">Topic / unit<input value={activeQuestion.topic} onChange={e=>updateQuestion({topic:e.target.value})} placeholder="e.g. Algebra"/></label><label className="studio-field">Difficulty<select value={activeQuestion.difficulty} onChange={e=>updateQuestion({difficulty:e.target.value as Difficulty})}><option>Foundation</option><option>Standard</option><option>Advanced</option></select></label><label className="studio-field">Marks<input type="number" min="0.5" step="0.5" value={activeQuestion.points} onChange={e=>updateQuestion({points:Number(e.target.value)})}/></label></div>
          </div>
        </div>
        <div className="studio-actions"><button className="subtle-button" onClick={()=>setPreview(!preview)}><Eye size={15}/>{preview?'Close preview':'Preview'}</button><button className="subtle-button" onClick={()=>saveDraft('draft')}><Save size={15}/> Save draft</button><button className="primary-button" onClick={()=>saveDraft('review')}><Send size={15}/> Submit for review</button></div>
        {preview&&<div className="assessment-preview"><span className="eyebrow">LEARNER PREVIEW</span><h2>{title||'Untitled assessment'}</h2><p>{instructions}</p><small>{subject||'No subject'} · {duration} minutes · {totalPoints} marks</small>{questions.map((q,i)=><article key={q.id}><strong>{i+1}. {q.prompt||'Question prompt'}</strong><small>{labelFor(q.type)} · {q.points} marks · {q.difficulty}</small>{q.type==='multiple_choice'&&q.options.filter(Boolean).map((o,j)=><p key={j}>◯ {o}</p>)}{q.type==='matching'&&<><p>Match each item to the correct definition:</p>{q.pairs.map((p,j)=><p key={j}>{j+1}. {p.left||'Item'} → ______</p>)}<small>Available matches: {q.pairs.map(p=>p.right).filter(Boolean).reverse().join(' · ')}</small></>}{q.type==='fill_blank'&&<p>Answer: __________________</p>}{q.type==='true_false'&&<p>◯ True　 ◯ False</p>}{q.type==='word_puzzle'&&<p>Clue: {q.explanation}</p>}{q.type==='short_answer'&&<div className="assessment-preview-response"><small>Written response</small><textarea disabled rows={3} placeholder="Learner writes their answer here…"/></div>}</article>)}</div>}
      </section>
      <aside className="panel draft-sidebar"><div className="panel-heading"><div><h2>Assessment queue</h2><p>Cloud drafts and review states</p></div><ClipboardList size={18}/></div>{drafts.length===0?<div className="draft-empty">Your assessments will appear here.</div>:drafts.map(d=><div className="saved-draft" key={d.id}><div><strong>{d.title}</strong><small>{d.subject} · {d.questions.length} questions</small><span className={`status-chip status-${d.status}`}>{d.status}</span></div><button className="subtle-button" onClick={()=>loadDraft(d)}>Open</button></div>)}<button className="subtle-button full-width" onClick={resetBuilder}><Plus size={15}/> New assessment</button></aside>
    </div>}

    {tab==='library'&&<section className="panel studio-library-panel"><div className="panel-heading"><div><h2>Resource library</h2><p>Organise teaching materials by subject, topic and resource type</p></div><FileText size={19}/></div>
      <div className="resource-upload-zone"><Upload size={25}/><strong>Add learning materials</strong><p>PDF, Word, PowerPoint, text, CSV, Excel and image files · 25 MB maximum per file. Files are uploaded to the private Studyspace library and remain accessible only to you and the learners you assign them to.</p>
        <div className="resource-upload-fields"><label className="studio-field">Subject<input value={uploadSubject} onChange={e=>setUploadSubject(e.target.value)} placeholder="e.g. Mathematics"/></label><label className="studio-field">Topic / unit<input value={uploadTopic} onChange={e=>setUploadTopic(e.target.value)} placeholder="e.g. Algebra"/></label><label className="studio-field">Resource type<select value={uploadCategory} onChange={e=>setUploadCategory(e.target.value as ResourceCategory)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="studio-field">Description<input value={uploadDescription} onChange={e=>setUploadDescription(e.target.value)} placeholder="Optional note about this file"/></label></div>
        <label className="primary-button"><Plus size={16}/> Choose files<input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.csv,.xlsx" onChange={e=>{void addFiles(e.target.files);e.currentTarget.value=''}} hidden/></label>
      </div>
      <div className="resource-toolbar"><div className="resource-search"><Search size={16}/><input value={resourceSearch} onChange={e=>setResourceSearch(e.target.value)} placeholder="Search file, subject or topic..."/></div><select aria-label="Filter by subject" value={resourceSubjectFilter} onChange={e=>setResourceSubjectFilter(e.target.value)}><option>All</option>{subjects.map(s=><option key={s}>{s}</option>)}</select><select aria-label="Filter by resource type" value={resourceCategoryFilter} onChange={e=>setResourceCategoryFilter(e.target.value)}><option>All</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select aria-label="Sort resources" value={resourceSort} onChange={e=>setResourceSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div>
      <div className="resource-assignment-controls">
        <label className="studio-field">Resource to assign<select value={resourceAssignId} onChange={e=>setResourceAssignId(e.target.value)}><option value="">Choose a resource</option>{resources.map(resource=><option key={resource.id} value={resource.id}>{resource.name} — {resource.subject}</option>)}</select></label>
        <label className="studio-field">Learner<select value={resourceAssignLearner} onChange={e=>setResourceAssignLearner(e.target.value)}><option value="">Choose a learner</option>{learners.map(student=><option key={student.id} value={student.id}>{student.preferred_name||student.full_name||student.student_id||'Learner'} · {student.student_id||'No ID'}</option>)}</select></label>
        <button className="primary-button" onClick={()=>void assignResourceToLearner()} disabled={!resourceAssignId||!resourceAssignLearner}><Send size={15}/> Assign resource</button>
      </div><div className="resource-count-row"><span>{filteredResources.length} of {resources.length} resources</span><span><Filter size={13}/> Filters apply immediately</span></div>
      {filteredResources.length===0?<div className="draft-empty">No resources match these filters. Upload a file or change the search.</div>:<div className="resource-list">{filteredResources.map(r=><div className="resource-list-row resource-expanded-row" key={r.id}><span className="studio-file-icon"><FileText size={18}/></span><div className="resource-main"><strong>{r.name}</strong><small>{resourceLabel(r)} · {r.category} · {bytes(r.size)}</small><small>{r.description||'No description'} · Added {new Date(r.savedAt).toLocaleDateString()}</small><div className="resource-meta-edit"><input aria-label="Edit resource subject" value={r.subject} onChange={e=>setResources(current=>current.map(x=>x.id===r.id?{...x,subject:e.target.value}:x))} onBlur={e=>void updateResource(r.id,{subject:e.target.value})}/><input aria-label="Edit resource topic" value={r.topic} onChange={e=>setResources(current=>current.map(x=>x.id===r.id?{...x,topic:e.target.value}:x))} onBlur={e=>void updateResource(r.id,{topic:e.target.value})}/><select aria-label="Edit resource type" value={r.category} onChange={e=>void updateResource(r.id,{category:e.target.value as ResourceCategory})}>{categories.map(c=><option key={c}>{c}</option>)}</select></div></div><button className="icon-button" aria-label={`Download ${r.name}`} onClick={()=>void downloadResource(r.id)}><Download size={16}/></button><button className="icon-button" aria-label={`Delete ${r.name}`} onClick={()=>void deleteResource(r.id)}><Trash2 size={16}/></button></div>)}</div>}
    </section>}

    {tab==='assign'&&<div className="studio-builder-layout"><section className="panel assignment-setup-panel"><div className="panel-heading"><div><h2>Review and approve</h2><p>Only validated assessments can move to approved</p></div><ShieldCheck size={19}/></div>
      {drafts.length===0?<div className="draft-empty">Create an assessment first.</div>:drafts.map(d=><div className="review-card" key={d.id}><div><strong>{d.title}</strong><small>{d.subject} · {d.questions.length} questions · {d.questions.reduce((s,q)=>s+q.points,0)} marks</small><span className={`status-chip status-${d.status}`}>{d.status}</span></div><div className="review-actions"><button className="subtle-button" onClick={()=>loadDraft(d)}>Edit</button>{d.status!=='approved'&&<button className="primary-button" onClick={()=>setStatus(d,'approved')}><Check size={14}/> Approve</button>}{d.status==='approved'&&<button className="subtle-button" onClick={()=>setStatus(d,'draft')}>Return to draft</button>}</div></div>)}
      <div className="settings-divider"/><h2>Assignment preparation</h2><p className="builder-hint">Choose active learners. Published assessments appear in their Student Planner; correct answers remain server-side.</p>
      <div className="studio-form-grid"><label className="studio-field studio-field-wide">Approved assessment<select value={assignmentExercise} onChange={e=>setAssignmentExercise(e.target.value)}><option value="">Choose an approved assessment</option>{drafts.filter(d=>d.status==='approved').map(d=><option key={d.id} value={d.id}>{d.title} — {d.subject}</option>)}</select></label><label className="studio-field">Intended recipients<select value={assignmentTarget} onChange={e=>setAssignmentTarget(e.target.value)}><option>One learner</option><option>All learners</option></select></label>{assignmentTarget==='One learner'&&<label className="studio-field">Learner<select value={selectedLearner} onChange={e=>setSelectedLearner(e.target.value)}><option value="">Choose an active learner</option>{learners.map(student=><option key={student.id} value={student.id}>{student.preferred_name||student.full_name||student.student_id||'Learner'} · {student.student_id||'No ID'}</option>)}</select></label>}<label className="studio-field">Due date<input type="date" value={assignmentDue} onChange={e=>setAssignmentDue(e.target.value)}/></label><label className="studio-field studio-field-wide">Availability<select value={assignmentAvailability} onChange={e=>setAssignmentAvailability(e.target.value)}><option>Immediately after publishing</option><option>Schedule for due date</option></select></label></div><div className="studio-actions"><button className="primary-button" onClick={createAssignment}><Save size={15}/> Save assignment plan</button></div>
      </section><aside className="panel draft-sidebar"><div className="panel-heading"><div><h2>Assignment plans</h2><p>Cloud assignment records</p></div><Send size={18}/></div>{assignments.length===0?<div className="draft-empty">Your assignment plans will appear here.</div>:assignments.map(a=>{const d=drafts.find(x=>x.id===a.exerciseId);return <div className="saved-draft" key={a.id}><div><strong>{d?.title||'Assessment'}</strong><small>{a.target} · {a.dueDate||'No due date'}</small><small>{a.availability}</small></div></div>})}</aside></div>}
    {tab==='assign'&&<AssessmentReviewQueue/>}
    <footer className="page-footer"><span>STUDYSPACE MONITOR · CONTENT STUDIO</span><span>Cloud-backed assessments and resources</span></footer>
  </div>
}
