import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const APP_ORIGIN="https://mayendzeke.github.io";
const headers={"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
function namedKey(name:string):string{try{return JSON.parse(Deno.env.get(name)??"{}")?.default??"";}catch{return"";}}
function publicKey(){return namedKey("SUPABASE_PUBLISHABLE_KEYS")||Deno.env.get("SUPABASE_ANON_KEY")||"";}
function secretKey(){return namedKey("SUPABASE_SECRET_KEYS")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return json(405,{error:"Method not allowed."});
 if(request.headers.get("Origin")!==APP_ORIGIN)return json(403,{error:"This StudySpace origin is not allowed."});
 const authorization=request.headers.get("Authorization")||"",token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 const url=Deno.env.get("SUPABASE_URL")||"",anon=publicKey(),service=secretKey();
 if(!token)return json(401,{error:"Administrator sign-in is required."});
 if(!url||!anon||!service)return json(503,{error:"Teacher reply service is not configured."});
 const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await caller.auth.getUser(token);if(authError||!auth.user)return json(401,{error:"Administrator sign-in is required."});
 const {data:aal}=await caller.auth.mfa.getAuthenticatorAssuranceLevel(token);if(aal?.currentLevel!=="aal2")return json(403,{error:"Administrator multi-factor authentication is required."});
 const {data:profile}=await caller.from("profiles").select("role,account_status").eq("id",auth.user.id).single();
 if(profile?.role!=="admin"||profile.account_status!=="active")return json(403,{error:"Active administrator access is required."});
 let body:Record<string,unknown>;try{body=await request.json();}catch{return json(400,{error:"Invalid request body."});}
 const id=String(body.requestId||""),reply=String(body.reply||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||reply.length<2||reply.length>5000)return json(400,{error:"A valid homework request and a reply of 2-5000 characters are required."});
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:row,error:loadError}=await admin.from("homework_help_requests").select("id,status,teacher_response").eq("id",id).maybeSingle();
 if(loadError||!row)return json(404,{error:"Homework request not found."});
 if(row.teacher_response)return json(409,{error:"A teacher response has already been sent for this request."});
 if(!["waiting_for_teacher","mia_generating","mia_replied","mia_failed"].includes(row.status))return json(409,{error:"This homework request is no longer awaiting a teacher response."});
 const nextStatus=row.status==="mia_replied"?"teacher_replied_after_mia":"teacher_replied";
 const {data:saved,error:saveError}=await admin.from("homework_help_requests").update({teacher_response:reply,teacher_id:auth.user.id,teacher_replied_at:new Date().toISOString(),status:nextStatus,updated_at:new Date().toISOString()}).eq("id",id).eq("status",row.status).is("teacher_response",null).select("id,status").maybeSingle();
 if(saveError||!saved)return json(409,{error:"The request changed while you were replying. Refresh the inbox and try again."});
 return json(200,{success:true,status:saved.status});
});