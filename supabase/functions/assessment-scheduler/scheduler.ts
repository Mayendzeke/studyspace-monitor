export const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const difficultyWeight: Record<string,number> = { very_low:1, low:2, moderate:3, high:4, very_high:5 };
const typeWeight: Record<string,number> = { calculation:1.25, practical:1.2, essay:1.15, theory:1, memorisation:.95, language:1, mixed:1.1 };
const clamp = (n:number,min:number,max:number) => Math.min(max,Math.max(min,n));
const number = (v:unknown,fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const toMin = (v:string) => Number(v.slice(0,2))*60+Number(v.slice(3));
const fromMin = (v:number) => String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0");

export function workload(subject:Record<string,unknown>) {
  const performance=number(subject.recent_score,NaN);
  const weakness=Number.isFinite(performance)?clamp((70-performance)/20,0,2):.5;
  const difficulty=(difficultyWeight[String(subject.difficulty_level||"moderate")]||3)+weakness;
  const credits=clamp(number(subject.credit_hours,1)/3,.5,2.5);
  const type=typeWeight[String(subject.subject_type||"mixed")]||1.1;
  const weekly=clamp(number(subject.weekly_minutes_target,60)/60,.5,4);
  return {
    difficulty,
    workload:difficulty*credits*type*weekly,
    minutes:clamp(Math.round(15+difficulty*5+credits*5),20,60),
  };
}

export function expandPeriodWindows(startDate:string,endDate:string,windows:Record<string,unknown>[],preferredDays:number[]=[1,2,3,4,5]) {
  const output:Record<string,unknown>[]=[];
  const start=new Date(startDate+"T12:00:00Z");
  const end=new Date(endDate+"T12:00:00Z");
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)return output;
  for(let cursor=new Date(start);cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1)) {
    const date=cursor.toISOString().slice(0,10);
    const day=cursor.getUTCDay()||7;
    if(day>5||!preferredDays.includes(day))continue;
    for(const window of windows.filter(row=>number(row.day,-1)===day)) {
      const startTime=String(window.start||"").slice(0,5);
      const endTime=String(window.end||"").slice(0,5);
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||toMin(endTime)<=toMin(startTime))continue;
      output.push({day,date,start:startTime,end:endTime,id:String(window.id||"window")+"-"+date,preferencePenalty:number(window.preferencePenalty,0)});
    }
  }
  return output;
}

export function subtractBusyWindows(windows:Record<string,unknown>[], busy:Record<string,unknown>[]) {
  const output:Record<string,unknown>[]=[];
  for(const window of windows) {
    const day=number(window.day,-1);
    const date=String(window.date||"");
    const start=String(window.start||"").slice(0,5);
    const end=String(window.end||"").slice(0,5);
    if(day<1||day>5||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||toMin(end)<=toMin(start))continue;
    const blocks=busy.filter(row=>{
      const busyDate=String(row.date||"");
      return busyDate?busyDate===date:number(row.day,-2)===day;
    }).map(row=>({start:toMin(String(row.start||"").slice(0,5)),end:toMin(String(row.end||"").slice(0,5))}))
      .filter(row=>row.end>row.start).sort((a,b)=>a.start-b.start);
    let cursor=toMin(start);
    for(const block of blocks) {
      if(block.end<=cursor||block.start>=toMin(end))continue;
      if(block.start>cursor)output.push({day:DAYS[day-1],date:date||undefined,start:fromMin(cursor),end:fromMin(Math.min(block.start,toMin(end))),id:String(window.id||"")+"-"+cursor});
      cursor=Math.max(cursor,block.end);
      if(cursor>=toMin(end))break;
    }
    if(cursor<toMin(end))output.push({day:DAYS[day-1],date:date||undefined,start:fromMin(cursor),end,id:String(window.id||"")+"-"+cursor});
  }
  return output;
}

export function buildBalancedSchedule(subjects:Record<string,unknown>[], slots:Record<string,unknown>[], dailyLimit:number, questionCount=10) {
  const dayMap=new Map<string,{day:string;date?:string;workload:number;minutes:number;hard:number;count:number}>();
  for(const slot of slots) {
    const day=String(slot.day||"");
    const date=String(slot.date||"");
    const key=date||day;
    if(key&&!dayMap.has(key))dayMap.set(key,{day,date:date||undefined,workload:0,minutes:0,hard:0,count:0});
  }
  const remaining=slots.map((slot,index)=>({
    ...slot,id:String(slot.id||"slot-"+index),
    next:toMin(String(slot.start)),end:toMin(String(slot.end)),
  })).filter(slot=>Number.isFinite(slot.next)&&Number.isFinite(slot.end)&&slot.end>slot.next);
  const seen=new Set<string>();
  const ordered=subjects.filter(s=>s.id&&s.name&&!seen.has(String(s.id))&&(seen.add(String(s.id)),true))
    .map(subject=>({subject,profile:workload(subject)}))
    .sort((a,b)=>b.profile.workload-a.profile.workload||String(a.subject.name).localeCompare(String(b.subject.name)));
  const assignments:Record<string,unknown>[]=[];
  const conflicts:Record<string,unknown>[]=[];
  for(const {subject,profile} of ordered) {
    const options=remaining.filter(slot=>slot.end-slot.next>=profile.minutes).map(slot=>{
      const key=String(slot.date||slot.day||"");
      const day=dayMap.get(key)!;
      const hard=profile.difficulty>=4.5;
      const score=(hard&&day.hard>0?1000:0)+Math.max(0,day.minutes+profile.minutes-dailyLimit)*3+day.workload*12+day.count*4+number(slot.preferencePenalty,0);
      return {slot,day,score};
    }).sort((a,b)=>a.score-b.score||String(a.slot.date||"").localeCompare(String(b.slot.date||""))||DAYS.indexOf(String(a.slot.day))-DAYS.indexOf(String(b.slot.day))||a.slot.next-b.slot.next);
    if(!options.length) {
      conflicts.push({subjectId:subject.id,subjectName:subject.name,reason:"insufficient_available_capacity",requiredMinutes:profile.minutes});
      continue;
    }
    const {slot,day}=options[0];
    const start=fromMin(slot.next as number);
    const end=fromMin((slot.next as number)+profile.minutes);
    slot.next=(slot.next as number)+profile.minutes;
    day.workload+=profile.workload;day.minutes+=profile.minutes;day.count++;
    if(profile.difficulty>=4.5)day.hard++;
    assignments.push({
      subjectId:subject.id,subjectName:String(subject.name),day:slot.day,date:slot.date,slotId:slot.id,start,end,
      durationMinutes:profile.minutes,questionCount:clamp(Math.round(number(questionCount,10)),1,100),difficultyScore:Math.round(profile.difficulty*100)/100,
      workloadScore:Math.round(profile.workload*100)/100,subjectType:String(subject.subject_type||"mixed"),
      creditHours:number(subject.credit_hours,1),weeklyMinutesTarget:number(subject.weekly_minutes_target,60),
    });
  }
  for(const day of dayMap.values()) {
    if(day.minutes>dailyLimit)conflicts.push({reason:"daily_workload_limit_exceeded",day:day.date||day.day,requiredMinutes:day.minutes,limitMinutes:dailyLimit});
  }
  return {assignments,conflicts,dayLoads:[...dayMap.values()]};
}
