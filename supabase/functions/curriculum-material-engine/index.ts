import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertNoPersonalIdentifiers, generateWithFallback } from "../_shared/monitor-ai-provider.ts";

const APP_ORIGIN=Deno.env.get("APP_ORIGIN")??"https://mayendzeke.github.io";
const CURRENT_TERMS_VERSION="2026-11-24-v9";
const headers={
  "Access-Control-Allow-Origin":APP_ORIGIN,
  "Access-Control-Allow-Headers":"authorization, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
  "Vary":"Origin",
};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
function namedKey(name:string):string {
  const raw=Deno.env.get(name);if(!raw)return "";
  try{const value=JSON.parse(raw)?.default;return typeof value==="string"?value:"";}catch{return "";}
}
const serviceKey=()=>namedKey("SUPABASE_SECRET_KEYS")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const clean=(value:unknown,max=4000)=>typeof value==="string"?value.trim().slice(0,max):"";
function strings(value:unknown,max=12):string[] {
  return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string").map(item=>item.trim().slice(0,1000)).filter(Boolean).slice(0,max):[];
}
function objects(value:unknown,fields:string[],max=12):Record<string,unknown>[] {
  if(!Array.isArray(value))return [];
  return value.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)).slice(0,max).map(item=>{
    const result:Record<string,unknown>={};
    for(const field of fields){
      const raw=(item as Record<string,unknown>)[field];
      result[field]=field==="steps"||field==="labels"||field==="options"?strings(raw,10):clean(raw,field==="explanation"||field==="definition"?3000:1500);
    }
    return result;
  });
}
function validUrl(value:unknown):string {
  const raw=clean(value,1000);
  try{const url=new URL(raw);return url.protocol==="https:"||url.protocol==="http:"?url.toString():"";}catch{return "";}
}
function parseMaterial(text:string,subjectName:string,topic:string) {
  const raw=JSON.parse(text);
  const sourceReferences=Array.isArray(raw.source_references)?raw.source_references.map((item:any)=>({
    title:clean(item?.title,240),url:validUrl(item?.url),organization:clean(item?.organization,160),
    source_type:clean(item?.source_type,80),accessed_at:clean(item?.accessed_at,80),
  })).filter((item:any)=>item.url).slice(0,15):[];
  const content={
    title:clean(raw.title,200)||subjectName+" Study Guide",
    subject_name:subjectName,
    topic:topic||clean(raw.topic,180),
    summary:clean(raw.summary,12000),
    learning_objectives:strings(raw.learning_objectives,12),
    topic_map:objects(raw.topic_map,["topic","description","prerequisites","estimated_minutes"],20),
    key_terms:objects(raw.key_terms,["term","definition"],25),
    concept_sections:objects(raw.concept_sections,["heading","explanation","example","source_location"],15),
    worked_examples:objects(raw.worked_examples,["title","problem","steps","answer"],10),
    common_mistakes:objects(raw.common_mistakes,["mistake","correction"],10),
    flashcards:objects(raw.flashcards,["question","answer","visual_description"],25),
    practice_questions:objects(raw.practice_questions,["type","prompt","options","correct_answer","explanation"],20),
    visual_aids:objects(raw.visual_aids,["type","title","description","steps","labels"],5),
    revision_checklist:strings(raw.revision_checklist,20),
    source_map:objects(raw.source_map,["source_location","evidence"],20),
  };
  if(content.summary.length<120||content.learning_objectives.length<3||content.topic_map.length<4||content.concept_sections.length<3||content.flashcards.length<4||content.practice_questions.length<5) {
    throw new Error("The generated material did not meet the required curriculum coverage checks.");
  }
  return {content,sourceReferences};
}
function localAge(dob:string):number {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Mbabane",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part=(key:string)=>Number(parts.find(item=>item.type===key)?.value||0);
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if(!match)return -1;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const valid=new Date(Date.UTC(year,month-1,day));
  if(valid.getUTCFullYear()!==year||valid.getUTCMonth()!==month-1||valid.getUTCDate()!==day)return -1;
  let age=part("year")-year;if(part("month")<month||(part("month")===month&&part("day")<day))age--;
  return age;
}
function accessActive(profile:any):boolean {
  const now=Date.now();
  if(profile.subscription_tier)return Boolean(profile.subscription_expires_at&&new Date(profile.subscription_expires_at).getTime()>now);
  const started=profile.trial_started_at?new Date(profile.trial_started_at).getTime():NaN;
  const expires=profile.trial_expires_at?new Date(profile.trial_expires_at).getTime():NaN;
  return Number.isFinite(started)&&started<=now&&Number.isFinite(expires)&&expires>now;
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers});
  if(request.method!=="POST")return json(405,{error:"Method not allowed."});
  if(request.headers.get("Origin")!==APP_ORIGIN)return json(403,{error:"This StudySpace origin is not allowed."});
  const authorization=request.headers.get("Authorization")??"";
  const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()??"";
  const url=Deno.env.get("SUPABASE_URL")??"";
  const service=serviceKey();
  if(!url||!service)return json(503,{error:"Curriculum material services are not configured."});
  if(!token||token!==service)return json(401,{error:"Internal assessment service authentication is required."});
  const admin=createClient(url,service,{auth:{persistSession:false}});
  let body:any;try{body=await request.json();}catch{return json(400,{error:"Invalid request body."});}
  const learnerId=String(body.learnerId||"");
  const subjectName=clean(body.subjectName,120);
  const topic=clean(body.topic,180);
  if(!/^[0-9a-f-]{36}$/i.test(learnerId)||!subjectName)return json(400,{error:"A learner and registered subject are required."});
  const {data:profile,error:profileError}=await admin.from("profiles")
    .select("role,account_status,date_of_birth,country,institution_type,education_level,grade,course,qualification_level,curriculum,academic_year,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at,terms_accepted_at,terms_version")
    .eq("id",learnerId).maybeSingle();
  if(profileError||!profile||profile.role!=="learner"||profile.account_status!=="active")return json(403,{error:"An active learner account is required."});
  if(localAge(String(profile.date_of_birth||""))<9)return json(403,{error:"The learner must be at least 9 years old."});
  if(!profile.terms_accepted_at||profile.terms_version!==CURRENT_TERMS_VERSION||!accessActive(profile))return json(403,{error:"The learner's current StudySpace access and terms must be valid."});
  const {data:subject,error:subjectError}=await admin.from("student_subjects").select("id,name,category,description,difficulty_level,subject_type,credit_hours,weekly_minutes_target")
    .eq("learner_id",learnerId).ilike("name",subjectName).maybeSingle();
  if(subjectError||!subject)return json(404,{error:"The requested subject is not registered to this learner."});
  const {data:existing,error:existingError}=await admin.from("learning_material_review_queue").select("id,status,title,source_references")
    .eq("learner_id",learnerId).ilike("subject_name",subjectName).eq("status","pending").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existingError)return json(503,{error:"Existing curriculum review requests could not be checked."});
  if(existing)return json(200,{success:true,status:"pending_review",queueId:existing.id,title:existing.title,sourceCount:Array.isArray(existing.source_references)?existing.source_references.length:0,reused:true});

  const learnerContext={
    country:clean(profile.country,100)||"Country not recorded",
    institution_type:clean(profile.institution_type,100),
    education_level:clean(profile.education_level,100),
    grade:clean(profile.grade,100),
    course:clean(profile.course,180),
    qualification_level:clean(profile.qualification_level,120),
    curriculum:clean(profile.curriculum,160),
    academic_year:clean(profile.academic_year,80),
    subject:{
      name:clean(subject.name,120),category:clean(subject.category,100),description:clean(subject.description,1000),
      difficulty_level:clean(subject.difficulty_level,80),subject_type:clean(subject.subject_type,80),
      credit_hours:subject.credit_hours,weekly_minutes_target:subject.weekly_minutes_target,
    },
    requested_topic:topic||"Complete subject syllabus coverage",
    language:"English",
  };
  const systemPrompt="You are StudySpace's curriculum research and learning-material engine. Create a rigorous, age-appropriate, curriculum-aligned study guide for a learner aged 9 or older. Use Google Search grounding to find official curriculum authorities, national syllabus documents, examination-board specifications and reputable educational references relevant to the learner's country, curriculum, education level, grade and course. Prefer primary official sources. Do not fabricate URLs, citations, syllabus requirements, facts or exam-board rules. Distinguish confirmed syllabus coverage from useful supplementary learning. If the learner's exact curriculum cannot be verified, say so clearly and prepare a provisional guide for Monitor review. The profile context contains no learner name or personal identifier; do not ask for or infer one. Return JSON only with title, topic, summary, learning_objectives (at least 4), topic_map (at least 6 objects with topic, description, prerequisites, estimated_minutes), key_terms, concept_sections (at least 4), worked_examples, common_mistakes, flashcards (at least 6), practice_questions (at least 8 with type, prompt, options, correct_answer and explanation), visual_aids (0 to 3 structured diagram ideas), revision_checklist, source_map and source_references (each with title, url, organization, source_type and accessed_at). Provide practical guidance on what the learner must learn, practise and obtain. Never present unverified syllabus claims as official.";
  const prompt=JSON.stringify({learner_profile:learnerContext,request:"Prepare the subject study guide and learning roadmap for Monitor review.",material_scope:"Complete syllabus map plus the requested topic, if any."});
  try{assertNoPersonalIdentifiers(prompt);}catch(error){return json(400,{error:error instanceof Error?error.message:"Remove personal identifiers from the request."});}
  try{
    const generated=await generateWithFallback(prompt,{maxTokens:6500,jsonMode:true,systemPrompt,requiredJsonKeys:["title","summary","learning_objectives","topic_map","concept_sections","flashcards","practice_questions","source_references"],googleSearch:true});
    const parsed=parseMaterial(generated.text,subjectName,topic);
    const profileSnapshot={
      country:learnerContext.country,institution_type:learnerContext.institution_type,education_level:learnerContext.education_level,
      grade:learnerContext.grade,course:learnerContext.course,qualification_level:learnerContext.qualification_level,
      curriculum:learnerContext.curriculum,academic_year:learnerContext.academic_year,subject:learnerContext.subject,
    };
    const {data:created,error:createError}=await admin.from("learning_material_review_queue").insert({
      learner_id:learnerId,requested_by:null,title:parsed.content.title,summary:parsed.content.summary,
      subject_name:subjectName,topic:topic||parsed.content.topic,material_type:"study_notes",content:parsed.content,
      country:learnerContext.country,institution:learnerContext.institution_type,education_level:learnerContext.education_level,
      grade:learnerContext.grade,course:learnerContext.course,curriculum:learnerContext.curriculum,academic_year:learnerContext.academic_year,
      language:"English",source_references:parsed.sourceReferences,profile_snapshot:profileSnapshot,generator:generated.provider==="Google Gemini API"?"hybrid_ai_research":"hybrid_ai_fallback",
      status:"pending",
    }).select("id").single();
    if(createError||!created)throw new Error("The material review request could not be saved.");
    return json(200,{success:true,status:"pending_review",queueId:created.id,title:parsed.content.title,sourceCount:parsed.sourceReferences.length,reused:false});
  }catch(error){
    const message=error instanceof Error?error.message:"Curriculum material generation failed.";
    return json(503,{success:false,status:"failed",error:"StudySpace could not prepare the curriculum guide. The learner's existing files and assessments are unchanged.",detail:message.slice(0,400)});
  }
});
