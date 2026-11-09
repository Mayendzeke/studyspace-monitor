import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const MODEL="@cf/google/gemma-4-26b-a4b-it";
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
function namedKey(name:string):string{try{return JSON.parse(Deno.env.get(name)??"{}")?.default??"";}catch{return"";}}
function serviceKey(){return namedKey("SUPABASE_SECRET_KEYS")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
async function generate(prompt:string,imageUrl?:string):Promise<string>{
 const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim(),token=Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim();
 if(!account||!token)throw new Error("Cloudflare Workers AI is not configured.");
 const content:any=[{type:"text",text:prompt}];if(imageUrl)content.push({type:"image_url",image_url:{url:imageUrl}});
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/ai/v1/chat/completions",{
  method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},signal:AbortSignal.timeout(65000),
  body:JSON.stringify({model:MODEL,messages:[
   {role:"system",content:"You are MIA, a careful and supportive StudySpace homework tutor. This service is for educational purposes only: answer school or university coursework questions and explain concepts, methods and worked steps. If the request is not clearly educational or is unrelated to school or academic learning, refuse briefly and redirect the learner to a coursework question. Do not provide general personal, medical, legal, financial, political, relationship or other non-educational advice. Explain the method step by step at the learner's level, help them understand rather than encouraging copying, and state assumptions if a photo is unclear. Never invent a source or citation. Keep the answer focused and practical."},
   {role:"user",content}
  ],max_completion_tokens:1800,temperature:0.25,stream:false,store:false,chat_template_kwargs:{enable_thinking:false,clear_thinking:true}})
 });
 const raw=await response.text();let payload:any={};try{payload=JSON.parse(raw);}catch{}
 const ray=response.headers.get("cf-ray")||"not-provided";
 if(!response.ok)throw new Error("Cloudflare Workers AI returned HTTP "+response.status+". Reference: "+ray);
 const choice=Array.isArray(payload?.choices)?payload.choices[0]:undefined,body=choice?.message?.content;
 const value=typeof body==="string"?body.trim():Array.isArray(body)?body.map((part:any)=>typeof part==="string"?part:typeof part?.text==="string"?part.text:"").join("\n").trim():typeof choice?.text==="string"?choice.text.trim():"";
 if(!value)throw new Error("MIA returned no readable explanation. Reference: "+ray);
 return value.slice(0,9000);
}
Deno.serve(async request=>{
 if(request.method!=="POST")return json(405,{error:"Method not allowed."});
 const cronToken=request.headers.get("x-studyspace-cron-token")||"";
 if(cronToken.length<48)return json(401,{error:"Scheduled worker authentication required."});
 const url=Deno.env.get("SUPABASE_URL")||"",secret=serviceKey();
 if(!url||!secret)return json(503,{error:"Scheduled homework service configuration is incomplete."});
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {data:valid,error:tokenError}=await admin.rpc("verify_studyspace_homework_cron_token",{p_token:cronToken});
 if(tokenError||valid!==true)return json(401,{error:"Scheduled worker authentication failed."});
 const {data:pending,error:pendingError}=await admin.from("homework_help_requests").select("id,learner_id,question_text,image_path,fallback_attempts")
  .eq("status","waiting_for_teacher").lte("fallback_due_at",new Date().toISOString()).order("fallback_due_at",{ascending:true}).limit(5);
 if(pendingError)return json(503,{error:"Pending homework requests could not be loaded."});
 let claimedCount=0,answeredCount=0,skippedCount=0;
 for(const candidate of pending||[]){
  const {data:claimed,error:claimError}=await admin.rpc("claim_studyspace_homework_fallback",{p_request_id:candidate.id});
  if(claimError){skippedCount++;continue;}
  const row=Array.isArray(claimed)?claimed[0]:claimed;if(!row?.id){skippedCount++;continue;}claimedCount++;
  try{
   let imageUrl:string|undefined;
   if(row.image_path){const {data:signed,error:imageError}=await admin.storage.from("studyspace-homework-help").createSignedUrl(row.image_path,120);if(imageError)throw new Error("The uploaded homework image could not be opened for AI review.");imageUrl=signed.signedUrl;}
   const prompt=["A learner has requested help with a school or university homework question.","Explain the relevant concept and a sensible method, with a worked step or example where helpful.","Do not claim certainty if the image is unreadable. Ask the learner to upload a clearer photo or type missing details.","For higher education, be appropriately technical. Do not fabricate references, authors, DOIs or URLs.","Learner's written question:",String(row.question_text||"(The learner supplied an image rather than typed text.)").slice(0,5000),"Give an understandable explanation, not an answer-only response."].join("\n");
   const answer=await generate(prompt,imageUrl);
   const {data:saved,error:saveError}=await admin.from("homework_help_requests").update({status:"mia_replied",mia_response:answer,mia_replied_at:new Date().toISOString(),last_fallback_error:null,updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","mia_generating").select("id").maybeSingle();
   if(saveError)throw new Error("MIA's explanation could not be delivered to the learner.");if(saved?.id)answeredCount++;else skippedCount++;
  }catch(error){
   const attempts=Number(row.fallback_attempts||1);
   await admin.from("homework_help_requests").update({status:attempts>=5?"mia_failed":"waiting_for_teacher",last_fallback_error:(error instanceof Error?error.message:"AI fallback failed.").slice(0,350),updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","mia_generating");
  }
 }
 return json(200,{success:true,inspected:pending?.length||0,claimed:claimedCount,answered:answeredCount,skipped:skippedCount});
});