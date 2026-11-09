import { useEffect, useState } from "react";
import { AlertCircle, Megaphone, Send, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
};

export default function SystemAnnouncementsPanel() {
  const [userId, setUserId] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!supabase) {
      setError("StudySpace is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your administrator session has expired. Sign in again.");
      const id = auth.user.id;
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", id).single();
      if (profileError) throw profileError;
      if (profile?.role !== "admin") {
        setAuthorised(false);
        throw new Error("Only an authorised StudySpace Monitor administrator can publish system announcements.");
      }
      setUserId(id);
      setAuthorised(true);
      const { data, error: queryError } = await supabase
        .from("studyspace_announcements")
        .select("id,title,body,created_by,is_published,published_at,expires_at")
        .order("published_at", { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      setItems((data ?? []) as Announcement[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Announcements could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || saving || !authorised) return;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 120) {
      setError("The announcement title must contain 3–120 characters.");
      return;
    }
    if (cleanBody.length < 3 || cleanBody.length > 2000) {
      setError("The announcement message must contain 3–2,000 characters.");
      return;
    }
    const expiry = expiresAt ? new Date(expiresAt) : null;
    if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) {
      setError("Choose an expiry time in the future.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const { error: insertError } = await supabase.from("studyspace_announcements").insert({
      title: cleanTitle,
      body: cleanBody,
      created_by: userId,
      is_published: true,
      ...(expiry ? { expires_at: expiry.toISOString() } : {}),
    });
    if (insertError) {
      setError(insertError.message);
    } else {
      setTitle("");
      setBody("");
      setExpiresAt("");
      setNotice("Announcement published to eligible learners. Their notification settings and quiet hours still apply.");
      await load();
    }
    setSaving(false);
  }

  async function withdraw(id: string) {
    if (!supabase || !authorised || saving) return;
    if (!window.confirm("Withdraw this announcement? It will no longer be visible to learners.")) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("studyspace_announcements")
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Announcement withdrawn.");
      await load();
    }
    setSaving(false);
  }

  return <section className="panel settings-card studyspace-announcements-panel">
    <div className="panel-heading">
      <div><h2><Megaphone size={18}/> System announcements</h2><p>Publish important service and learning notices to eligible learners. Learners can silence this category in their notification controls.</p></div>
      <ShieldCheck size={19}/>
    </div>
    {error && <p className="inline-message error-message" role="alert"><AlertCircle size={15}/>{error}</p>}
    {notice && <p className="inline-message" role="status">{notice}</p>}
    {authorised && <form className="settings-form-grid" onSubmit={publish}>
      <label className="settings-field">Announcement title
        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} minLength={3} required placeholder="e.g. Scheduled maintenance"/>
      </label>
      <label className="settings-field">Message
        <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={2000} minLength={3} required rows={4} placeholder="Write a clear notice for StudySpace learners."/>
      </label>
      <label className="settings-field">Optional expiry
        <input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)}/>
        <small>Leave blank for an announcement that remains published until withdrawn.</small>
      </label>
      <button type="submit" className="primary-button" disabled={loading || saving || !title.trim() || !body.trim()}>
        <Send size={15}/>{saving ? "Publishing…" : "Publish to learners"}
      </button>
    </form>}
    <div className="settings-divider"/>
    <div className="panel-heading"><div><h3>Recent announcements</h3><p>{items.filter(item => item.is_published && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())).length} currently active</p></div></div>
    {loading ? <p className="monitor-message-empty">Loading announcements…</p> : items.length ? <div className="studyspace-announcements-list">
      {items.map(item => {
        const expired = !!item.expires_at && new Date(item.expires_at).getTime() <= Date.now();
        const active = item.is_published && !expired;
        return <article className="panel settings-card" key={item.id}>
          <div className="panel-heading"><div><strong>{item.title}</strong><p>{new Date(item.published_at).toLocaleString()} · {active ? "Published" : item.is_published ? "Expired" : "Withdrawn"}</p></div>
            {active && <button type="button" className="secondary-button" onClick={() => void withdraw(item.id)} disabled={saving}><XCircle size={14}/> Withdraw</button>}
          </div>
          <p className="studyspace-announcement-body">{item.body}</p>
          {item.expires_at && <small>Expires {new Date(item.expires_at).toLocaleString()}</small>}
        </article>;
      })}
    </div> : <p className="monitor-message-empty">No system announcements have been published yet.</p>}
  </section>;
}
