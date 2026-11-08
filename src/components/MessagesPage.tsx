import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Paperclip, Search, RefreshCw, FileText, Check, CheckCheck, AlertCircle, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import StudyspaceGroupsPanel from "./StudyspaceGroupsPanel";

type Contact={contact_id:string;display_name:string;grade:string;contact_type:string};
type Message={id:string;sender_id:string;recipient_id:string;body:string;attachment_path:string|null;attachment_name:string;attachment_mime:string;attachment_size:number;created_at:string;read_at:string|null;delivered_at:string|null};

const allowedTypes=["image/jpeg","image/png","image/webp","application/pdf","text/plain"];
const extensionFor=(file:File)=>({ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","text/plain":"txt" } as Record<string,string>)[file.type]||"";

export default function MessagesPage({onOpenHomework}:{onOpenHomework:()=>void}){
  const [userId,setUserId]=useState("");
  const [mailbox,setMailbox]=useState<"inbox"|"sent"|"groups">("inbox");
  const [presence,setPresence]=useState<Record<string,string>>({});
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [messages,setMessages]=useState<Message[]>([]);
  const [selected,setSelected]=useState("");
  const [query,setQuery]=useState("");
  const [draft,setDraft]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [signedUrls,setSignedUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);

  const loadMessages=async()=>{
    if(!supabase||!userId)return;
    const {data,error:e}=await supabase.from("direct_messages").select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at,read_at,delivered_at").or("sender_id.eq."+userId+",recipient_id.eq."+userId).order("created_at",{ascending:true}).limit(400);
    if(e)throw e;
    const rows=(data??[]) as Message[];setMessages(rows);const undelivered=rows.filter(m=>m.recipient_id===userId&&!m.delivered_at);if(undelivered.length)void supabase.from("direct_messages").update({delivered_at:new Date().toISOString()}).in("id",undelivered.map(m=>m.id));
  };
  const refresh=async()=>{
    if(!supabase)return;
    setLoading(true);setError("");
    try{
      const {data,error:e}=await supabase.auth.getUser();
      if(e||!data.user)throw new Error("Your session has expired. Sign in again.");
      setUserId(data.user.id);
      const {data:contactData,error:contactError}=await supabase.rpc("get_studyspace_message_contacts");
      if(contactError)throw contactError;
      const rows=(contactData??[]) as Contact[];
      setContacts(rows);
      setSelected(current=>current&&rows.some(x=>x.contact_id===current)?current:(rows[0]?.contact_id??""));
      const {data:messageData,error:messageError}=await supabase.from("direct_messages").select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at,read_at,delivered_at").or("sender_id.eq."+data.user.id+",recipient_id.eq."+data.user.id).order("created_at",{ascending:true}).limit(400);
      if(messageError)throw messageError;
      const rows=(messageData??[]) as Message[];setMessages(rows);const undelivered=rows.filter(m=>m.recipient_id===data.user.id&&!m.delivered_at);if(undelivered.length)void supabase.from("direct_messages").update({delivered_at:new Date().toISOString()}).in("id",undelivered.map(m=>m.id));
      const {data:presenceRows}=await supabase.from("studyspace_user_presence").select("user_id,last_seen_at").in("user_id",rows.map(x=>x.contact_id));const pmap:Record<string,string>={};(presenceRows??[]).forEach((x:any)=>pmap[x.user_id]=Date.now()-new Date(x.last_seen_at).getTime()<120000?"online":x.last_seen_at);setPresence(pmap);
    }catch(reason){setError(reason instanceof Error?reason.message:"Messages could not be loaded.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{
    if(!supabase||!userId)return;
    const channel=supabase.channel("monitor-direct-messages-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"direct_messages"},()=>void loadMessages().catch(e=>setError(e.message||"New messages could not be refreshed.")))
      .on("postgres_changes",{event:"*",schema:"public",table:"studyspace_user_presence"},payload=>{const row=payload.new as {user_id:string;last_seen_at:string};if(row?.user_id)setPresence(v=>({...v,[row.user_id]:Date.now()-new Date(row.last_seen_at).getTime()<120000?"online":row.last_seen_at}));})
      .subscribe();
    return()=>{void supabase?.removeChannel(channel);};
  },[userId]);
  useEffect(()=>{
    if(!supabase||!userId)return;
    const heartbeat=()=>{if(document.visibilityState==="visible")void supabase!.from("studyspace_user_presence").upsert({user_id:userId,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"user_id"});};
    heartbeat();
    const timer=window.setInterval(heartbeat,45000);
    window.addEventListener("focus",heartbeat);
    document.addEventListener("visibilitychange",heartbeat);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",heartbeat);document.removeEventListener("visibilitychange",heartbeat);};
  },[userId]);
  const visibleContacts=useMemo(()=>contacts.filter(c=>(mailbox!=="sent"||messages.some(m=>m.sender_id===userId&&m.recipient_id===c.contact_id))&&(c.display_name+" "+c.grade).toLowerCase().includes(query.trim().toLowerCase())),[contacts,query,messages,mailbox,userId]);
  const draftWords=draft.trim()?draft.trim().split(/\s+/).length:0;
  const thread=messages.filter(m=>(m.sender_id===userId&&m.recipient_id===selected)||(m.sender_id===selected&&m.recipient_id===userId));
  const selectedContact=contacts.find(c=>c.contact_id===selected);
  const presenceLabel=(id:string)=>presence[id]==="online"?"Online":presence[id]?"Last seen "+new Date(presence[id]).toLocaleString():"Offline";
  const unreadByContact=new Map<string,number>();
  messages.filter(m=>m.recipient_id===userId&&!m.read_at).forEach(m=>unreadByContact.set(m.sender_id,(unreadByContact.get(m.sender_id)||0)+1));
  useEffect(()=>{
    if(!selected||!userId||!supabase)return;
    const unread=messages.filter(m=>m.sender_id===selected&&m.recipient_id===userId&&!m.read_at);
    if(unread.length)void supabase.from("direct_messages").update({read_at:new Date().toISOString()}).eq("sender_id",selected).eq("recipient_id",userId).is("read_at",null);
  },[selected,userId,messages.length]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[thread.length,selected]);
  useEffect(()=>{
    let alive=true;
    const loadFiles=async()=>{
      if(!supabase)return;
      const pending=thread.filter(m=>m.attachment_path&&!signedUrls[m.id]);
      if(!pending.length)return;
      const pairs=await Promise.all(pending.map(async m=>{
        const {data,error:e}=await supabase!.storage.from("studyspace-direct-messages").createSignedUrl(m.attachment_path!,1800);
        return [m.id,e?"" : data.signedUrl] as const;
      }));
      if(alive)setSignedUrls(current=>({...current,...Object.fromEntries(pairs.filter(x=>x[1]))}));
    };
    void loadFiles();
    return()=>{alive=false;};
  },[thread.map(m=>m.id+":"+(m.attachment_path||"")).join("|")]);

  const send=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!supabase||!userId||!selected||sending)return;
    const body=draft.trim();
    if(!body&&!file)return;
    if(body.length>2000){setError("Messages are limited to 2,000 characters.");return;}
    if(body&&body.split(/\s+/).length>350){setError("Messages are limited to 350 words.");return;}
    if(file&&(file.size>5*1024*1024||!allowedTypes.includes(file.type))){setError("Attachments must be a PDF, JPG, PNG, WebP or TXT file up to 5 MB.");return;}
    setSending(true);setError("");setNotice("");
    let path:string|null=null;
    try{
      if(file){
        const extension=extensionFor(file);
        if(!extension)throw new Error("This attachment type is not supported.");
        path=userId+"/"+crypto.randomUUID()+"."+extension;
        const {error:uploadError}=await supabase.storage.from("studyspace-direct-messages").upload(path,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
      }
      const {error:insertError}=await supabase.from("direct_messages").insert({
        sender_id:userId,recipient_id:selected,body,
        attachment_path:path,attachment_name:file?.name||"",
        attachment_mime:file?.type||"",attachment_size:file?.size||0
      });
      if(insertError)throw insertError;
      setDraft("");setFile(null);if(fileRef.current)fileRef.current.value="";
      await loadMessages();
      setNotice("Message sent.");
    }catch(reason){
      if(path)await supabase.storage.from("studyspace-direct-messages").remove([path]);
      setError(reason instanceof Error?reason.message:"Message could not be sent.");
    }finally{setSending(false);}
  };
  const formatBytes=(size:number)=>size<1024*1024?Math.max(1,Math.round(size/1024))+" KB":(size/1024/1024).toFixed(1)+" MB";

  return <div className="subpage monitor-messages-page">
    <div className="welcome-row"><div><div className="eyebrow"><MessageCircle size={14}/> PRIVATE LEARNER COMMUNICATION</div><h1>Messages <span>in one place.</span></h1><p className="page-subtitle">A private channel between the Monitor and each learner. Attachments stay in a private Studyspace bucket.</p></div><div className="monitor-messages-header-actions"><button type="button" className="secondary-button" onClick={onOpenHomework}><FileText size={14}/> Homework help inbox</button><button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/>{loading?"Refreshing…":"Refresh inbox"}</button></div></div>
    {error&&<p className="inline-message error-message" role="alert"><AlertCircle size={15}/>{error}</p>}
    {notice&&<p className="inline-message" role="status">{notice}</p>}
    <nav className="ss-mailbox-tabs" aria-label="Message folders">
      <button className={mailbox==="inbox"?"is-active":""} onClick={()=>setMailbox("inbox")}><MessageCircle size={14}/> Inbox</button>
      <button className={mailbox==="sent"?"is-active":""} onClick={()=>setMailbox("sent")}><Send size={14}/> Sent</button>
      <button className={mailbox==="groups"?"is-active":""} onClick={()=>setMailbox("groups")}><Users size={14}/> Groups</button>
    </nav>
    {mailbox==="groups"?<StudyspaceGroupsPanel/>:
    <section className="monitor-messages-shell">
      <aside className="monitor-contact-panel">
        <div className="monitor-contact-heading"><strong>Learners</strong><span>{contacts.length}</span></div>
        <label className="monitor-contact-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a learner"/></label>
        <div className="monitor-contact-list">
          {visibleContacts.map(c=>{
            const last=messages.filter(m=>m.sender_id===c.contact_id||m.recipient_id===c.contact_id).at(-1);
            const unread=unreadByContact.get(c.contact_id)||0;
            return <button type="button" key={c.contact_id} className={"monitor-contact-item"+(selected===c.contact_id?" is-active":"")} onClick={()=>setSelected(c.contact_id)}>
              <span className="monitor-contact-avatar">{c.display_name.trim().slice(0,1).toUpperCase()}</span>
              <span className="monitor-contact-copy"><strong>{c.display_name} <i className={presence[c.contact_id]==="online"?"ss-presence-dot is-online":"ss-presence-dot"} title={presenceLabel(c.contact_id)}/></strong><small>{last?.body||last?.attachment_name||c.grade||"Start a private conversation"}</small></span>
              {unread>0&&<i className="monitor-contact-unread">{unread>9?"9+":unread}</i>}
            </button>;
          })}
          {!loading&&!visibleContacts.length&&<p className="monitor-message-empty">No learners match your search.</p>}
        </div>
      </aside>
      <section className="monitor-conversation">
        {selectedContact?<><header className="monitor-conversation-head"><div><span className="monitor-contact-avatar">{selectedContact.display_name.trim().slice(0,1).toUpperCase()}</span><div><strong>{selectedContact.display_name}</strong><small>{selectedContact.grade||"Studyspace learner"} · {presenceLabel(selectedContact.contact_id)} · Private direct messages</small></div></div><span className="monitor-secure-label"><Check size={13}/> Private</span></header>
          <div className="monitor-message-list">
            {loading&&!thread.length?<p className="monitor-message-empty">Loading conversation…</p>:thread.length?thread.map(m=><article key={m.id} className={"monitor-message-bubble"+(m.sender_id===userId?" is-outgoing":"")}><div>{m.body&&<p>{m.body}</p>}{m.attachment_path&&<a className="monitor-message-attachment" href={signedUrls[m.id]||"#"} target="_blank" rel="noreferrer" onClick={e=>{if(!signedUrls[m.id])e.preventDefault();}}><FileText size={16}/><span>{m.attachment_name||"Attachment"}<small>{formatBytes(m.attachment_size)}</small></span></a>}</div><time>{new Date(m.created_at).toLocaleString([], {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}{m.sender_id===userId&&<small className="monitor-message-status">{m.read_at?"Seen":m.delivered_at?"Delivered":"Sent"}</small>}</time></article>):<div className="monitor-message-empty"><MessageCircle size={25}/><strong>No messages yet</strong><span>Start a private conversation with {selectedContact.display_name}.</span></div>}
            <div ref={bottomRef}/>
          </div>
          <form className="monitor-message-composer" onSubmit={send}>
            {file&&<div className="monitor-message-file"><FileText size={14}/><span>{file.name} · {formatBytes(file.size)}</span><button type="button" onClick={()=>{setFile(null);if(fileRef.current)fileRef.current.value="";}} aria-label="Remove attachment">×</button></div>}
            <div className="monitor-message-compose-row"><button type="button" className="icon-button" aria-label="Attach file" onClick={()=>fileRef.current?.click()}><Paperclip size={17}/></button><input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" onChange={e=>setFile(e.target.files?.[0]||null)}/><textarea value={draft} maxLength={2000} rows={2} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" aria-label="Message text"/><button type="submit" className="primary-button" disabled={sending||(!draft.trim()&&!file)||draftWords>350||draft.length>2000}><Send size={15}/>{sending?"Sending…":"Send"}</button></div><div className="monitor-message-limits"><span>Up to 350 words / 2,000 characters · Attachments up to 5 MB</span><span>{draftWords}/350 words · {draft.length}/2,000</span></div>
          </form>
        </>:<div className="monitor-message-empty"><MessageCircle size={28}/><strong>{loading?"Opening your inbox…":"Select a learner"}</strong><span>Choose a learner from the list to view or start a conversation.</span></div>}
      </section>
    </section>}
  </div>;
}
