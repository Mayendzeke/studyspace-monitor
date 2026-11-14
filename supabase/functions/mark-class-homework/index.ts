import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const SECONDARY_MODEL = "@cf/qwen/qwen3.8-27b";
function namedKey(name: string): string {
  try { return JSON.parse(Deno.env.get(name) ?? "{}")?.default ?? ""; } catch { return ""; }
}
function secretKey(): string {
  return namedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const allowedOrigin = Deno.env.get("APP_ORIGIN");
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
function mayContainPersonalIdentifier(value: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /\b(?:\+?268[\s-]?)?7[0-9](?:[\s-]?\d){6}\b/.test(value)
    || /\b(?:student\s*id|passport|identity\s*(?:number|no\.?|card)|national\s*id)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i.test(value);
}
async function markWithCloudflare(prompt: string): Promise<{mark:number;confidence:number;feedback:string;model:string}> {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "";
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "";
  if (!account || !token) throw new Error("Cloudflare Workers AI credentials are not configured.");
  const system = [
    "You are MIΛ, a careful educational assessment marker for StudySpace.",
    "Mark a student's submitted academic work against the exact instructions, rubric and maximum marks.",
    "Award fair partial credit. Accept equivalent wording and correct reasoning. Do not invent evidence or reward unsupported claims.",
    "If instructions/rubric are ambiguous or the response cannot be judged reliably, return confidence below 0.75.",
    "Return JSON only: { points_awarded: number, confidence: number, feedback: string }.",
    "points_awarded must be within zero and maximum_marks; confidence must be between zero and one. Feedback must be brief, supportive and explain one strength and one next step.",
    "Never include personal identifiers, provider details, or any fields beyond the required JSON object.",
  ].join(" ");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
  const errors: string[] = [];
  for (const model of [GEMMA_MODEL, SECONDARY_MODEL]) {
    try {
      const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account) + "/ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          model, messages, max_completion_tokens: 1200, temperature: 0.1, stream: false, store: false,
          response_format: { type: "json_object" },
          ...(model === GEMMA_MODEL ? { chat_template_kwargs: { enable_thinking: false, clear_thinking: true } } : { reasoning_effort: "low" }),
        }),
      });
      const raw = await response.text();
      let payload: any = {};
      try { payload = JSON.parse(raw); } catch {}
      if (!response.ok) throw new Error(model + " returned HTTP " + response.status);
      const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
      const rawText = choice?.message?.content;
      const text = typeof rawText === "string" ? rawText.trim()
        : Array.isArray(rawText) ? rawText.map((part: any) => typeof part?.text === "string" ? part.text : "").join("\n").trim()
        : "";
      const candidate = text.replace(/<think>[\s\S]*?<\/think>/gi,"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
      const parsed = JSON.parse(candidate) as Record<string,unknown>;
      const mark = Number(parsed.points_awarded);
      const confidence = Number(parsed.confidence);
      if (!Number.isFinite(mark) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("MIΛ returned an invalid mark.");
      return { mark, confidence, feedback: String(parsed.feedback || "").slice(0,2500), model };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "AI marking failed.");
    }
  }
  throw new Error(errors.join(" | ").slice(0,500));
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const publishable = namedKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const secret = secretKey();
  if (!token) return json(401, { error: "Sign in is required." });
  if (!url || !publishable || !secret) return json(503, { error: "Classroom marking is not configured." });

  const caller = createClient(url,publishable,{global:{headers:{Authorization:authorization!}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await caller.auth.getUser(token);
  if(authError||!auth.user)return json(401,{error:"Sign in is required."});
  const {data:profile,error:profileError}=await caller.from("profiles")
    .select("role,account_status,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at,terms_accepted_at,terms_version")
    .eq("id",auth.user.id).single();
  if(profileError||profile?.role!=="learner"||profile?.account_status!=="active")return json(403,{error:"An active learner account is required."});
  const now=Date.now();
  const paidExpiry=profile.subscription_expires_at?Date.parse(profile.subscription_expires_at):NaN;
  const trialStart=profile.trial_started_at?Date.parse(profile.trial_started_at):NaN;
  const trialExpiry=profile.trial_expires_at?Date.parse(profile.trial_expires_at):NaN;
  const paid=Boolean(profile.subscription_tier&&Number.isFinite(paidExpiry)&&paidExpiry>now);
  const trial=Boolean(!profile.subscription_tier&&Number.isFinite(trialStart)&&Number.isFinite(trialExpiry)&&trialStart<=now&&trialExpiry>now);
  if(!profile.terms_accepted_at||profile.terms_version!=="2026-11-09-v8")return json(403,{error:"Please accept the current StudySpace Terms and Conditions."});
  if(!paid&&!trial)return json(403,{error:"Your StudySpace access is paused. Choose a paid plan to continue."});

  let body:{homeworkId?:string;response?:string};
  try{body=await request.json();}catch{return json(400,{error:"Invalid request body."});}
  const homeworkId=String(body.homeworkId||"");
  const response=String(body.response||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(homeworkId)||!response)return json(400,{error:"A valid homework task and written response are required."});
  if(response.length>12000)return json(413,{error:"Your response is too long. Keep it under 12,000 characters."});

  const admin=createClient(url,secret,{auth:{persistSession:false}});
  const {data:homework,error:homeworkError}=await admin.from("session_homework")
    .select("id,session_id,title,instructions,due_at,created_by,total_points,marking_rubric")
    .eq("id",homeworkId).maybeSingle();
  if(homeworkError||!homework)return json(404,{error:"This homework is no longer available."});
  if(homework.due_at&&Date.parse(homework.due_at)<now)return json(403,{error:"The deadline has passed. Ask your teacher about submitting late."});
  const {data:membership,error:memberError}=await admin.from("class_session_members").select("learner_id")
    .eq("session_id",homework.session_id).eq("learner_id",auth.user.id).maybeSingle();
  if(memberError||!membership)return json(403,{error:"This homework is not assigned to your account."});

  const points=Number(homework.total_points||10);
  const submittedAt=new Date().toISOString();
  const {data:saved,error:saveError}=await admin.from("session_homework_submissions").upsert({
    homework_id:homework.id,learner_id:auth.user.id,response,submitted_at:submittedAt,completed_at:submittedAt,
    total_points:points,ai_score:null,ai_feedback:"",ai_marking_status:"pending",ai_marked_at:null,
    ai_marking_details:{},teacher_feedback:"",teacher_score:null,marked_by:null,marked_at:null,
  },{onConflict:"homework_id,learner_id"}).select("id").single();
  if(saveError||!saved)return json(503,{error:"Your homework was saved unsuccessfully. Please try again."});

  if(mayContainPersonalIdentifier(response)){
    const feedback="Your work is safely submitted. It may contain personal contact or identity information, so it was not sent for automated marking. Your teacher will review it.";
    const {error:privacyUpdateError}=await admin.from("session_homework_submissions").update({
      ai_marking_status:"teacher_review",
      ai_feedback:feedback,
      ai_marked_at:null,
      ai_marking_details:{teacher_review_required:true,reason:"possible_personal_identifier"},
    }).eq("id",saved.id);
    if(privacyUpdateError)return json(200,{success:true,submissionId:saved.id,score:null,totalPoints:points,markingStatus:"teacher_review",message:"Your submission is saved. Your teacher will review it privately."});
    return json(200,{success:true,submissionId:saved.id,score:null,totalPoints:points,markingStatus:"teacher_review",message:feedback});
  }

  try{
    const markingPrompt=JSON.stringify({
      homework_title:String(homework.title||"").slice(0,300),
      instructions:String(homework.instructions||"").slice(0,3000),
      teacher_marking_rubric:String(homework.marking_rubric||"").slice(0,4000),
      maximum_marks:points,
      learner_response:response,
    });
    const ai=await markWithCloudflare(markingPrompt);
    if(ai.mark<0||ai.mark>points)throw new Error("MIΛ returned a mark outside the permitted range.");
    const confidence=ai.confidence;
    const finalAuto=confidence>=0.75;
    const suggested=Math.round(ai.mark*100)/100;
    const {error:updateError}=await admin.from("session_homework_submissions").update({
      ai_score:finalAuto?suggested:null,
      ai_feedback:ai.feedback,
      ai_marking_status:finalAuto?"ai_marked":"teacher_review",
      ai_marked_at:new Date().toISOString(),
      ai_marking_details:{ai_suggested_mark:suggested,confidence,model:ai.model,teacher_review_required:!finalAuto},
    }).eq("id",saved.id);
    if(updateError)throw updateError;
    return json(200,{
      success:true,submissionId:saved.id,score:finalAuto?suggested:null,totalPoints:points,
      markingStatus:finalAuto?"ai_marked":"teacher_review",confidence,
      feedback:ai.feedback,
      message:finalAuto?"MIΛ has marked your homework. Your result is saved.":"Your work is saved. MIΛ could not confidently finalise the mark, so your teacher will review it.",
    });
  }catch(error){
    const detail=error instanceof Error?error.message.slice(0,350):"MIΛ could not mark this response.";
    await admin.from("session_homework_submissions").update({
      ai_marking_status:"marking_failed",
      ai_feedback:"Your work is safely submitted. Your teacher will mark it.",
      ai_marking_details:{teacher_review_required:true,reason:detail},
    }).eq("id",saved.id);
    return json(200,{
      success:true,submissionId:saved.id,score:null,totalPoints:points,
      markingStatus:"marking_failed",message:"Your work is saved. MIΛ could not mark it automatically, so your teacher will review it.",
    });
  }
});
