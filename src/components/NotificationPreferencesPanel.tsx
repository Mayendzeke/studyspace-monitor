import { useEffect, useState } from "react";
import { Bell, BellOff, Clock3, MessageCircle, Users, BookOpen, ClipboardCheck, CalendarDays, AlarmClock, Megaphone, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { StudyspaceNotificationPreferences } from "../lib/studyspaceNotifications";

const defaults: StudyspaceNotificationPreferences = {
  master_enabled: true, direct_messages: true, group_messages: true, group_activity: true,
  homework_assignments: true, assessment_updates: true, timetable_updates: true,
  study_reminders: true, system_announcements: true, quiet_hours_enabled: false,
  quiet_hours_start: "22:00", quiet_hours_end: "07:00",
};

const categories = [
  { key: "direct_messages", title: "Private messages", description: "New messages from teachers and connected students.", icon: MessageCircle },
  { key: "group_messages", title: "Group messages", description: "New messages in your study groups and classrooms.", icon: Users },
  { key: "group_activity", title: "Group activity", description: "Invitations, membership decisions and group changes.", icon: BookOpen },
  { key: "homework_assignments", title: "Homework and assignments", description: "New work, due-date changes and teacher assignment alerts.", icon: ClipboardCheck },
  { key: "assessment_updates", title: "Assessments and results", description: "New tests, marked work and published results.", icon: ClipboardCheck },
  { key: "timetable_updates", title: "Timetable and class updates", description: "Changes to lessons, classroom sessions and schedules.", icon: CalendarDays },
  { key: "study_reminders", title: "Study reminders", description: "Your planned study sessions and personal reminders.", icon: AlarmClock },
  { key: "system_announcements", title: "StudySpace announcements", description: "Important platform notices and service announcements.", icon: Megaphone },
] as const;

type CategoryKey = typeof categories[number]["key"];

export default function NotificationPreferencesPanel() {
  const [userId, setUserId] = useState("");
  const [prefs, setPrefs] = useState<StudyspaceNotificationPreferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState<NotificationPermission>(supported ? Notification.permission : "denied");

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (!supabase) { setError("Notification preferences are unavailable while StudySpace is disconnected."); setLoading(false); return; }
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Sign in to manage notification preferences.");
        const id = auth.user.id;
        const { data, error: queryError } = await supabase.from("studyspace_notification_preferences").select("*").eq("user_id", id).maybeSingle();
        if (queryError) throw queryError;
        if (live) { setUserId(id); setPrefs({ ...defaults, ...(data || {}), quiet_hours_start: (data?.quiet_hours_start || "22:00").slice(0,5), quiet_hours_end: (data?.quiet_hours_end || "07:00").slice(0,5) }); }
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : "Could not load notification settings.");
      } finally { if (live) setLoading(false); }
    };
    void load();
    return () => { live = false; };
  }, []);

  const save = async (next: StudyspaceNotificationPreferences) => {
    if (!supabase || !userId || saving) return;
    const previous = prefs;
    setPrefs(next); setSaving(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.from("studyspace_notification_preferences").upsert(
      { user_id: userId, ...next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (saveError) { setPrefs(previous); setError(saveError.message); }
    else setNotice("Notification preferences saved on your StudySpace account.");
    setSaving(false);
  };

  const toggle = (key: "master_enabled" | "quiet_hours_enabled" | CategoryKey, value: boolean) => {
    void save({ ...prefs, [key]: value });
  };

  const changeTime = (key: "quiet_hours_start" | "quiet_hours_end", value: string) => {
    void save({ ...prefs, [key]: value });
  };

  const enableBrowser = async () => {
    if (!supported) { setError("This browser does not support device notifications."); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") setNotice("Device notifications are allowed. Your category and quiet-hour settings still apply.");
    else if (result === "denied") setError("Notifications are blocked by your browser or device. Change the permission in its site settings.");
  };

  return <section className="ss-notification-preferences">
    <header className="ss-notification-pref-header">
      <div><span className="ss-notification-pref-eyebrow"><Bell size={14}/> NOTIFICATION CENTRE</span><h2>Notification controls</h2><p>Choose what StudySpace can alert you about. Your preferences follow your account across devices.</p></div>
      <span className="ss-notification-pref-status">{saving ? "Saving…" : loading ? "Loading…" : prefs.master_enabled ? <><Bell size={13}/> Alerts on</> : <><BellOff size={13}/> Silenced</>}</span>
    </header>
    {error && <p className="ss-notification-pref-message is-error" role="alert">{error}</p>}
    {notice && <p className="ss-notification-pref-message" role="status">{notice}</p>}
    <div className="ss-notification-master">
      <div><strong>All notifications</strong><span>Turn every optional alert on or off at once.</span></div>
      <label className="ss-toggle"><input type="checkbox" checked={prefs.master_enabled} onChange={e=>toggle("master_enabled",e.target.checked)} disabled={loading||saving}/><span/></label>
    </div>
    <div className="ss-notification-pref-grid">
      {categories.map(item => { const Icon=item.icon; return <label className={"ss-notification-pref-row"+(!prefs.master_enabled?" is-muted":"")} key={item.key}>
        <span className="ss-notification-pref-icon"><Icon size={17}/></span>
        <span className="ss-notification-pref-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
        <span className="ss-toggle"><input type="checkbox" checked={prefs[item.key]} onChange={e=>toggle(item.key,e.target.checked)} disabled={loading||saving}/><span/></span>
      </label>; })}
    </div>
    <div className="ss-notification-quiet">
      <div className="ss-notification-quiet-heading"><Clock3 size={17}/><div><strong>Quiet hours</strong><small>Pause optional notifications during your chosen rest period.</small></div>
        <label className="ss-toggle"><input type="checkbox" checked={prefs.quiet_hours_enabled} onChange={e=>toggle("quiet_hours_enabled",e.target.checked)} disabled={loading||saving}/><span/></label>
      </div>
      <div className="ss-notification-times"><label>From<input type="time" value={prefs.quiet_hours_start} onChange={e=>changeTime("quiet_hours_start",e.target.value)} disabled={loading||saving||!prefs.quiet_hours_enabled}/></label><label>Until<input type="time" value={prefs.quiet_hours_end} onChange={e=>changeTime("quiet_hours_end",e.target.value)} disabled={loading||saving||!prefs.quiet_hours_enabled}/></label></div>
    </div>
    <div className="ss-notification-device">
      <div><strong>Device notifications</strong><small>{!supported?"This browser does not support notifications.":permission==="granted"?"Browser permission is enabled; alerts are still controlled by the options above.":permission==="denied"?"Browser permission is blocked. Change it in your browser or phone settings.":"Allow StudySpace to show notifications on this device."}</small></div>
      {permission==="granted"?<span className="ss-notification-pref-status"><ShieldCheck size={13}/> Allowed</span>:permission==="default"?<button type="button" onClick={()=>void enableBrowser()} disabled={loading}>Enable on this device</button>:<span className="ss-notification-pref-status">Blocked</span>}
    </div>
    <p className="ss-notification-legal"><ShieldCheck size={13}/> Essential account-security and safeguarding notices are not disabled by optional notification controls. Device alerts require browser permission and an active StudySpace connection; alerts while the app is fully closed require a separate push service.</p>
  </section>;
}
