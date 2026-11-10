import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Paperclip, Search, RefreshCw, FileText, Check, AlertCircle, Users, Megaphone, Plus, X, UserRound, Pin, Archive, ArchiveRestore } from "lucide-react";
import { supabase } from "../lib/supabase";
import StudyspaceGroupsPanel from "./StudyspaceGroupsPanel";
import SystemAnnouncementsPanel from "./SystemAnnouncementsPanel";
import EmojiPicker from "./EmojiPicker";

type Contact={contact_id:string;display_name:string;grade:string;contact_type:string};
type Message={id:string;sender_id:string;recipient_id:string;body:string;attachment_path:string|null;attachment_name:string;attachment_mime:string;attachment_size:number;created_at:string;read_at:string|null;delivered_at:string|null;edited_at:string|null;unsent_at:string|null;deleted_for_everyone_at:string|null};
type ConversationFilter="all"|"unread"|"pinned"|"archived";
const readContactIds=(key:string):string[]=>{try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value.filter((id):id is string=>typeof id==="string"):[];}catch{return [];}};

const allowedTypes=["image/jpeg","image/png","image/webp","application/pdf","text/plain"];
const extensionFor=(file:File)=>({ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","text/plain":"txt" } as Record<string,string>)[file.type]||"";

export default function MessagesPage({onOpenHomework}:{onOpenHomework:()=>void}){
  const [userId,setUserId]=useState("");
  const [mailbox,setMailbox]=useState<"inbox"|"sent"|"groups"|"announcements">("inbox");
  const [conversationFilter,setConversationFilter]=useState<ConversationFilter>("all");
  const [pinnedIds,setPinnedIds]=useState<string[]>([]);
  const [archivedIds,setArchivedIds]=useState<string[]>([]);
  const [threadSearch,setThreadSearch]=useState("");
  const [presence,setPresence]=useState<Record<string,string>>({});
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [messages,setMessages]=useState<Message[]>([]);
  const [hiddenMessageIds,setHiddenMessageIds]=useState<string[]>([]);
  const [editingMessageId,setEditingMessageId]=useState<string|null>(null);
  const [editingMessageDraft,setEditingMessageDraft]=useState("");
  const [selected,setSelected]=useState("");
  const [query,setQuery]=useState("");
  const [draft,setDraft]=useState("");
  const [emojiOpen,setEmojiOpen]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [signedUrls,setSignedUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [composeOpen,setComposeOpen]=useState(false);
  const [composeSearch,setComposeSearch]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);

  const loadMessages=async()=>{
    if(!supabase||!userId)return;
    const {data,error:e}=await supabase.from("direct_messages").select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at,read_at,delivered_at,edited_at,unsent_at,deleted_for_everyone_at").or("sender_id.eq."+userId+",recipient_id.eq."+userId).order("created_at",{ascending:true}).limit(400);
    if(e)throw e;
    const rows=(data??[]) as Message[];setMessages(rows);const {data:deleted,error:deleteError}=await supabase.from("direct_message_user_deletions").select("message_id").eq("user_id",userId);if(deleteError)throw deleteError;setHiddenMessageIds((deleted??[]).map(x=>x.message_id));const undelivered=rows.filter(m=>m.recipient_id===userId&&!m.delivered_at);if(undelivered.length)void supabase.from("direct_messages").update({delivered_at:new Date().toISOString()}).in("id",undelivered.map(m=>m.id));
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
      const contactRows=(contactData??[]) as Contact[];
      setContacts(contactRows);
      setSelected(current=>current&&contactRows.some(x=>x.contact_id===current)?current:(contactRows[0]?.contact_id??""));
      const {data:messageData,error:messageError}=await supabase.from("direct_messages").select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at,read_at,delivered_at,edited_at,unsent_at,deleted_for_everyone_at").or("sender_id.eq."+data.user.id+",recipient_id.eq."+data.user.id).order("created_at",{ascending:true}).limit(400);
      if(messageError)throw messageError;
      const messageRows=(messageData??[]) as Message[];setMessages(messageRows);const {data:deletedRows,error:deletedError}=await supabase.from("direct_message_user_deletions").select("message_id").eq("user_id",data.user.id);if(deletedError)throw deletedError;setHiddenMessageIds((deletedRows??[]).map(x=>x.message_id));const undelivered=messageRows.filter(m=>m.recipient_id===data.user.id&&!m.delivered_at);if(undelivered.length)void supabase.from("direct_messages").update({delivered_at:new Date().toISOString()}).in("id",undelivered.map(m=>m.id));
      const {data:presenceRows}=await supabase.from("studyspace_user_presence").select("user_id,last_seen_at").in("user_id",contactRows.map(x=>x.contact_id));const pmap:Record<string,string>={};(presenceRows??[]).forEach((x:any)=>pmap[x.user_id]=Date.now()-new Date(x.last_seen_at).getTime()<120000?"online":x.last_seen_at);setPresence(pmap);
    }catch(reason){setError(reason instanceof Error?reason.message:"Messages could not be loaded.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{
    if(!userId)return;
    setPinnedIds(readContactIds("studyspace:"+userId+":monitor-messages:pinned"));
    setArchivedIds(readContactIds("studyspace:"+userId+":monitor-messages:archived"));
  },[userId]);
  const toggleContactPreference=(contactId:string,kind:"pinned"|"archived")=>{
    const current=kind==="pinned"?pinnedIds:archivedIds;
    const next=current.includes(contactId)?current.filter(id=>id!==contactId):[...current,contactId];
    if(kind==="pinned")setPinnedIds(next);else setArchivedIds(next);
    try{if(userId)localStorage.setItem("studyspace:"+userId+":monitor-messages:"+kind,JSON.stringify(next));}catch{/* Preference remains available during this session. */}
  };
  useEffect(()=>{
    if(!supabase||!userId)return;
    const channel=supabase.channel("monitor-direct-messages-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"direct_messages"},()=>void loadMessages().catch(e=>setError(e.message||"New messages could not be refreshed.")))
      .on("postgres_changes",{event:"*",schema:"public",table:"direct_message_user_deletions",filter:"user_id=eq."+userId},()=>void loadMessages().catch(e=>setError(e.message||"Message visibility could not be refreshed.")))
      .on("postgres_changes",{event:"*",schema:"public",table:"studyspace_user_presence"},payload=>{const row=payload.new as {user_id:string;last_seen_at:string};if(row?.user_id)setPresence(v=>({...v,[row.user_id]:Date.now()-new Date(row.last_seen_at).getTime()<120000?"online":row.last_seen_at}));})
      .subscribe();
    return()=>{void supabase?.removeChannel(channel);};
  },[userId]);
  useEffect(()=>{
    if(!supabase||!userId||mailbox==="groups")return;
    const heartbeat=()=>{if(document.visibilityState==="visible")void supabase!.from("studyspace_user_presence").upsert({user_id:userId,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"user_id"});};
    heartbeat();
    const timer=window.setInterval(heartbeat,45000);
    window.addEventListener("focus",heartbeat);
    document.addEventListener("visibilitychange",heartbeat);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",heartbeat);document.removeEventListener("visibilitychange",heartbeat);};
  },[userId,mailbox]);
  const visibleContacts=useMemo(()=>contacts.filter(c=>{
    const sentMatch=mailbox!=="sent"||messages.some(m=>m.sender_id===userId&&m.recipient_id===c.contact_id);
    const textMatch=(c.display_name+" "+c.grade).toLowerCase().includes(query.trim().toLowerCase());
    const pinned=pinnedIds.includes(c.contact_id),archived=archivedIds.includes(c.contact_id);
    const unread=messages.some(m=>m.sender_id===c.contact_id&&m.recipient_id===userId&&!m.read_at);
    const filterMatch=conversationFilter==="archived"?archived:conversationFilter==="unread"?unread&&!archived:conversationFilter==="pinned"?pinned&&!archived:!archived;
    return sentMatch&&textMatch&&filterMatch;
  }).sort((a,b)=>{
    const pinOrder=Number(pinnedIds.includes(b.contact_id))-Number(pinnedIds.includes(a.contact_id));
    if(pinOrder)return pinOrder;
    const last=(id:string)=>messages.reduce((latest,m)=>m.sender_id===id||m.recipient_id===id?Math.max(latest,new Date(m.created_at).getTime()):latest,0);
    return last(b.contact_id)-last(a.contact_id);
  }),[contacts,query,messages,mailbox,userId,conversationFilter,pinnedIds,archivedIds]);
  const composeContacts=useMemo(()=>contacts.filter(c=>(c.display_name+" "+c.grade).toLowerCase().includes(composeSearch.trim().toLowerCase())),[contacts,composeSearch]);
  const draftWords=draft.trim()?draft.trim().split(/\s+/).length:0;
  const thread=messages.filter(m=>!hiddenMessageIds.includes(m.id)&&((m.sender_id===userId&&m.recipient_id===selected)||(m.sender_id===selected&&m.recipient_id===userId)));
  const selectedContact=contacts.find(c=>c.contact_id===selected);
  const presenceLabel=(id:string)=>presence[id]==="online"?"Online":presence[id]?"Last seen "+new Date(presence[id]).toLocaleString():"Offline";
  const unreadByContact=new Map<string,number>();
  messages.filter(m=>m.recipient_id===userId&&!m.read_at).forEach(m=>unreadByContact.set(m.sender_id,(unreadByContact.get(m.sender_id)||0)+1));
  const filteredThread=threadSearch.trim()?thread.filter(m=>(m.body+" "+m.attachment_name).toLowerCase().includes(threadSearch.trim().toLowerCase())):thread;
  const unreadConversationCount=contacts.filter(c=>(unreadByContact.get(c.contact_id)||0)>0).length;
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
  const canEditMessage=(m:Message)=>m.sender_id===userId&&!m.unsent_at&&!m.deleted_for_everyone_at&&Date.now()-new Date(m.created_at).getTime()<120000;
  const beginEditMessage=(m:Message)=>{if(!canEditMessage(m)){setError("Messages can only be edited by their sender within two minutes.");return;}setEditingMessageId(m.id);setEditingMessageDraft(m.body);setNotice("");setError("");};
  const saveEditedMessage=async(m:Message)=>{
    const body=editingMessageDraft.trim();
    if(!supabase||!userId||editingMessageId!==m.id)return;
    if(!body||body.length>2000||body.split(/\\s+/).filter(Boolean).length>350){setError("Edited messages must contain 1–2,000 characters and no more than 350 words.");return;}
    if(!canEditMessage(m)){setEditingMessageId(null);setError("The two-minute edit window has expired.");return;}
    const {error:e}=await supabase.from("direct_messages").update({body}).eq("id",m.id).eq("sender_id",userId);
    if(e)setError(e.message);else{setEditingMessageId(null);setNotice("Message edited.");await loadMessages();}
  };
  const unsendMessage=async(m:Message)=>{
    if(!supabase||!userId||m.sender_id!==userId||m.unsent_at||m.deleted_for_everyone_at)return;
    if(!window.confirm("Unsend this message for everyone? The content will be replaced with a message-unsent notice."))return;
    const oldPath=m.attachment_path;
    const {error:e}=await supabase.from("direct_messages").update({body:"This message was unsent.",attachment_path:null,attachment_name:"",attachment_mime:"",attachment_size:0,unsent_at:new Date().toISOString()}).eq("id",m.id).eq("sender_id",userId);
    if(e){setError(e.message);return;}
    if(oldPath)try{await supabase.storage.from("studyspace-direct-messages").remove([oldPath]);}catch{/* The message is already unsent; keep the conversation state. */}
    setEditingMessageId(null);setNotice("Message unsent for everyone.");await loadMessages();
  };
  const deleteMessageForEveryone=async(m:Message)=>{
    if(!supabase||!userId||m.sender_id!==userId||m.unsent_at||m.deleted_for_everyone_at)return;
    if(!window.confirm("Delete this message for everyone? Its content and attachment will be removed from all participants' conversations."))return;
    const oldPath=m.attachment_path;
    const {error:e}=await supabase.from("direct_messages").update({body:"This message was deleted.",attachment_path:null,attachment_name:"",attachment_mime:"",attachment_size:0,deleted_for_everyone_at:new Date().toISOString()}).eq("id",m.id).eq("sender_id",userId);
    if(e){setError(e.message);return;}
    if(oldPath)try{await supabase.storage.from("studyspace-direct-messages").remove([oldPath]);}catch{/* Message deletion already succeeded. */}
    setEditingMessageId(null);setNotice("Message deleted for everyone.");await loadMessages();
  };
  const deleteMessageForMe=async(m:Message)=>{
    if(!supabase||!userId)return;
    if(!window.confirm("Delete this message from your view only? Other participants will still see it."))return;
    const {error:e}=await supabase.from("direct_message_user_deletions").upsert({message_id:m.id,user_id:userId},{onConflict:"message_id,user_id",ignoreDuplicates:true});
    if(e){setError(e.message);return;}
    setHiddenMessageIds(old=>old.includes(m.id)?old:[...old,m.id]);
    setNotice("Message deleted from your view.");
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
      <button className={mailbox==="announcements"?"is-active":""} onClick={()=>setMailbox("announcements")}><Megaphone size={14}/> Announcements</button>
    </nav>
    {mailbox==="announcements"?<SystemAnnouncementsPanel/>:mailbox==="groups"?<StudyspaceGroupsPanel/>:
    <section className="monitor-messages-shell">
      <aside className="monitor-contact-panel">
        <div className="monitor-contact-heading"><div><strong>Learners</strong><span>{contacts.length} available</span></div><button type="button" className="monitor-compose-button" onClick={()=>{setComposeSearch("");setComposeOpen(true);}} aria-label="Compose a new message" title="Compose a new message"><Plus size={17}/><span>New</span></button></div>
        <label className="monitor-contact-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a learner"/></label>
        <nav className="ss-conversation-filters" aria-label="Conversation filters">
          <button type="button" className={conversationFilter==="all"?"is-active":""} onClick={()=>setConversationFilter("all")}>All <span>{contacts.length-archivedIds.filter(id=>contacts.some(c=>c.contact_id===id)).length}</span></button>
          <button type="button" className={conversationFilter==="unread"?"is-active":""} onClick={()=>setConversationFilter("unread")}>Unread <span>{unreadConversationCount}</span></button>
          <button type="button" className={conversationFilter==="pinned"?"is-active":""} onClick={()=>setConversationFilter("pinned")}>Pinned <span>{pinnedIds.filter(id=>contacts.some(c=>c.contact_id===id)&&!archivedIds.includes(id)).length}</span></button>
          <button type="button" className={conversationFilter==="archived"?"is-active":""} onClick={()=>setConversationFilter("archived")}>Archived <span>{archivedIds.filter(id=>contacts.some(c=>c.contact_id===id)).length}</span></button>
        </nav>
        <div className="monitor-contact-list">
          {visibleContacts.map(c=>{
            const last=messages.filter(m=>m.sender_id===c.contact_id||m.recipient_id===c.contact_id).at(-1);
            const unread=unreadByContact.get(c.contact_id)||0;
            const pinned=pinnedIds.includes(c.contact_id),archived=archivedIds.includes(c.contact_id);
            return <div className="ss-contact-row" key={c.contact_id}>
              <button type="button" className={"monitor-contact-item"+(selected===c.contact_id?" is-active":"")} onClick={()=>{setSelected(c.contact_id);setThreadSearch("");}}>
                <span className="monitor-contact-avatar">{c.display_name.trim().slice(0,1).toUpperCase()}</span>
                <span className="monitor-contact-copy"><strong>{c.display_name} <i className={presence[c.contact_id]==="online"?"ss-presence-dot is-online":"ss-presence-dot"} title={presenceLabel(c.contact_id)}/></strong><small>{last?.body||last?.attachment_name||c.grade||"Start a private conversation"}</small><small className="monitor-presence-meta">{last?new Date(last.created_at).toLocaleString([], {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):presenceLabel(c.contact_id)}</small></span>
                {unread>0&&<i className="monitor-contact-unread">{unread>9?"9+":unread}</i>}
              </button>
              <div className="ss-contact-row-actions">
                <button type="button" title={pinned?"Unpin conversation":"Pin conversation"} aria-label={pinned?"Unpin conversation":"Pin conversation"} onClick={()=>toggleContactPreference(c.contact_id,"pinned")}><Pin size={13}/></button>
                <button type="button" title={archived?"Restore conversation":"Archive conversation"} aria-label={archived?"Restore conversation":"Archive conversation"} onClick={()=>toggleContactPreference(c.contact_id,"archived")}>{archived?<ArchiveRestore size={13}/>:<Archive size={13}/>}</button>
              </div>
            </div>;
          })}
          {!loading&&!visibleContacts.length&&<p className="monitor-message-empty">{conversationFilter==="unread"?"No unread conversations.":conversationFilter==="pinned"?"No pinned conversations yet.":conversationFilter==="archived"?"No archived conversations.":"No learners match your search."}</p>}
        </div>
      </aside>
      <section className="monitor-conversation">
        {selectedContact?<><header className="monitor-conversation-head"><div><span className="monitor-contact-avatar">{selectedContact.display_name.trim().slice(0,1).toUpperCase()}</span><div><strong>{selectedContact.display_name}</strong><small>{selectedContact.grade||"Studyspace learner"} · {presenceLabel(selectedContact.contact_id)} · Private direct messages</small></div></div><span className="monitor-secure-label"><Check size={13}/> Private</span></header>
          <div className="ss-thread-search"><label><Search size={14}/><input value={threadSearch} onChange={e=>setThreadSearch(e.target.value)} placeholder="Search this conversation"/></label><span>{filteredThread.length} messages</span></div>
          <div className="monitor-message-list">
            {loading&&!thread.length?<p className="monitor-message-empty">Loading conversation…</p>:filteredThread.length?filteredThread.map(m=><article key={m.id} className={"monitor-message-bubble"+(m.sender_id===userId?" is-outgoing":"")}><div>{editingMessageId===m.id?<div className="ss-message-edit"><textarea value={editingMessageDraft} maxLength={2000} onChange={e=>setEditingMessageDraft(e.target.value)}/><div><button type="button" onClick={()=>void saveEditedMessage(m)}>Save edit</button><button type="button" onClick={()=>setEditingMessageId(null)}>Cancel</button></div></div>:m.unsent_at?<p className="ss-message-unsent">This message was unsent.</p>:m.deleted_for_everyone_at?<p className="ss-message-unsent">This message was deleted.</p>:m.body&&<p>{m.body}</p>}{!m.unsent_at&&!m.deleted_for_everyone_at&&m.attachment_path&&<a className="monitor-message-attachment" href={signedUrls[m.id]||"#"} target="_blank" rel="noreferrer" onClick={e=>{if(!signedUrls[m.id])e.preventDefault();}}><FileText size={16}/><span>{m.attachment_name||"Attachment"}<small>{formatBytes(m.attachment_size)}</small></span></a>}</div><time>{new Date(m.created_at).toLocaleString([], {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}{m.edited_at&&!m.unsent_at&&!m.deleted_for_everyone_at&&<small className="ss-message-edited">Edited</small>}{m.sender_id===userId&&<small className="monitor-message-status">{m.read_at?"Seen":m.delivered_at?"Delivered":"Sent"}</small>}</time><details className="ss-message-actions"><summary aria-label="Message actions">⋯</summary><div>{m.sender_id===userId&&!m.unsent_at&&canEditMessage(m)&&<button type="button" onClick={()=>beginEditMessage(m)}>Edit</button>}{m.sender_id===userId&&!m.unsent_at&&!m.deleted_for_everyone_at&&<button type="button" onClick={()=>void unsendMessage(m)}>Unsend</button>}{m.sender_id===userId&&!m.unsent_at&&!m.deleted_for_everyone_at&&<button type="button" onClick={()=>void deleteMessageForEveryone(m)}>Delete for everyone</button>}<button type="button" onClick={()=>void deleteMessageForMe(m)}>Delete for me</button></div></details></article>):thread.length>0?<div className="monitor-message-empty">No messages match your search.</div>:<div className="monitor-message-empty"><MessageCircle size={25}/><strong>No messages yet</strong><span>Start a private conversation with {selectedContact.display_name}.</span></div>}
            <div ref={bottomRef}/>
          </div>
          <form className="monitor-message-composer" onSubmit={send}>
            {file&&<div className="monitor-message-file"><FileText size={14}/><span>{file.name} · {formatBytes(file.size)}</span><button type="button" onClick={()=>{setFile(null);if(fileRef.current)fileRef.current.value="";}} aria-label="Remove attachment">×</button></div>}
            <div className="monitor-message-compose-row"><button type="button" className="icon-button" aria-label="Attach file" onClick={()=>fileRef.current?.click()}><Paperclip size={17}/></button><input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" onChange={e=>setFile(e.target.files?.[0]||null)}/><div className="ss-message-input-wrap">{emojiOpen&&<EmojiPicker onSelect={emoji=>{setDraft(value=>value+emoji);setEmojiOpen(false);}}/>}<textarea value={draft} maxLength={2000} rows={2} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" aria-label="Message text"/></div><button type="button" className="icon-button ss-emoji-toggle" aria-label="Add emoji" title="Add emoji" onClick={()=>setEmojiOpen(v=>!v)}>😊</button><button type="submit" className="primary-button" disabled={sending||(!draft.trim()&&!file)||draftWords>350||draft.length>2000}><Send size={15}/>{sending?"Sending…":"Send"}</button></div><div className="monitor-message-limits"><span>Up to 350 words / 2,000 characters · Attachments up to 5 MB</span><span>{draftWords}/350 words · {draft.length}/2,000</span></div>
          </form>
        </>:<div className="monitor-message-empty"><MessageCircle size={28}/><strong>{loading?"Opening your inbox…":"Select a learner"}</strong><span>Choose a learner from the list to view or start a conversation.</span></div>}
      </section>
    </section>}
    {composeOpen&&<div className="monitor-compose-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setComposeOpen(false);}}>
      <section className="monitor-compose-dialog" role="dialog" aria-modal="true" aria-labelledby="monitor-compose-title">
        <header className="monitor-compose-dialog-head">
          <div><span className="eyebrow">NEW CONVERSATION</span><h2 id="monitor-compose-title">Who would you like to message?</h2><p>Start a private learner conversation or open your group spaces.</p></div>
          <button type="button" className="icon-button" onClick={()=>setComposeOpen(false)} aria-label="Close new message"><X size={18}/></button>
        </header>
        <div className="monitor-compose-type-switch" role="group" aria-label="Conversation type">
          <button type="button" className="is-active" aria-pressed="true"><UserRound size={16}/> Individual</button>
          <button type="button" onClick={()=>{setMailbox("groups");setComposeOpen(false);}}><Users size={16}/> Group conversation</button>
        </div>
        <label className="monitor-compose-search"><Search size={16}/><input autoFocus value={composeSearch} onChange={event=>setComposeSearch(event.target.value)} placeholder="Search learners by name or grade"/></label>
        <div className="monitor-compose-contacts">
          {composeContacts.map(contact=><button type="button" key={contact.contact_id} onClick={()=>{setSelected(contact.contact_id);setMailbox("inbox");setComposeOpen(false);setComposeSearch("");}}>
            <span className="monitor-contact-avatar">{contact.display_name.trim().slice(0,1).toUpperCase()}</span>
            <span><strong>{contact.display_name}</strong><small>{contact.grade||"Studyspace learner"} · Private conversation</small></span>
            <MessageCircle size={16}/>
          </button>)}
          {!composeContacts.length&&<p>{loading?"Loading learner directory…":"No learners match that search."}</p>}
        </div>
        <footer>Direct messages are private to the selected learner and authorised StudySpace administrators.</footer>
      </section>
    </div>}
  </div>;
}
