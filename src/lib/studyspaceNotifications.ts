import { supabase } from "./supabase";

export type StudyspaceNotificationCategory =
  | "direct_messages"
  | "group_messages"
  | "group_activity"
  | "homework_assignments"
  | "assessment_updates"
  | "timetable_updates"
  | "study_reminders"
  | "system_announcements";

export type StudyspaceNotificationPreferences = Record<StudyspaceNotificationCategory, boolean> & {
  master_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const defaults: StudyspaceNotificationPreferences = {
  master_enabled: true,
  direct_messages: true,
  group_messages: true,
  group_activity: true,
  homework_assignments: true,
  assessment_updates: true,
  timetable_updates: true,
  study_reminders: true,
  system_announcements: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

function inQuietHours(startValue: string, endValue: string) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startValue);
  const end = toMinutes(endValue);
  return start === end ? true : start < end ? current >= start && current < end : current >= start || current < end;
}

export async function showStudyspaceNotification(
  userId: string,
  category: StudyspaceNotificationCategory,
  title: string,
  body: string,
  tag: string,
  icon = "/favicon.svg",
  groupId?: string,
) {
  if (!supabase || !userId || typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const { data, error } = await supabase
      .from("studyspace_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return;
    const prefs = { ...defaults, ...(data || {}) } as StudyspaceNotificationPreferences;
    if (!prefs.master_enabled || !prefs[category]) return;
    if (prefs.quiet_hours_enabled && inQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) return;
    if (groupId) {
      const { data: groupPreference } = await supabase
        .from("studyspace_group_notification_preferences")
        .select("muted")
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .maybeSingle();
      if (groupPreference?.muted) return;
    }

    const options: NotificationOptions = {
      body,
      icon,
      tag,
      data: { destination: "/" },
    };
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    // Notification delivery must never interrupt the study workspace.
  }
}
