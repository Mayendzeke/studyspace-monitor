import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { showStudyspaceNotification } from "../lib/studyspaceNotifications";

type DirectMessageEvent = { id?: string; sender_id?: string; body?: string; attachment_name?: string };
type GroupMessageEvent = { id?: string; sender_id?: string; body?: string; attachment_name?: string };
type GroupInviteEvent = { id?: string; group_id?: string };

export default function StudyspaceNotificationListener() {
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (live) setUserId(data.user?.id || "");
    });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || "");
    });
    return () => {
      live = false;
      auth.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel("studyspace-notifications-" + userId)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
        filter: "recipient_id=eq." + userId,
      }, payload => {
        const row = payload.new as DirectMessageEvent;
        if (!row.id || row.sender_id === userId) return;
        void showStudyspaceNotification(
          userId, "direct_messages", "New private message",
          row.body?.trim() || (row.attachment_name ? "Attachment: " + row.attachment_name : "Open your inbox to view the message."),
          "studyspace-direct-" + row.id,
          import.meta.env.BASE_URL + "studyspace-monitor.svg",
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "studyspace_group_messages",
      }, payload => {
        const row = payload.new as GroupMessageEvent;
        if (!row.id || row.sender_id === userId) return;
        void showStudyspaceNotification(
          userId, "group_messages", "New group message",
          row.body?.trim() || (row.attachment_name ? "Attachment: " + row.attachment_name : "Open your study groups to view the message."),
          "studyspace-group-" + row.id,
          import.meta.env.BASE_URL + "studyspace-monitor.svg",
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "studyspace_group_invites",
        filter: "invitee_id=eq." + userId,
      }, payload => {
        const row = payload.new as GroupInviteEvent;
        if (!row.id) return;
        void showStudyspaceNotification(
          userId, "group_activity", "Study group invitation",
          "You have been invited to join a StudySpace group.",
          "studyspace-group-invite-" + row.id,
          import.meta.env.BASE_URL + "studyspace-monitor.svg",
          row.group_id,
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "studyspace_group_members",
      }, payload => {
        const row = payload.new as { membership_status?: string; membership_source?: string };
        if (row.membership_status !== "pending" || row.membership_source !== "request") return;
        void showStudyspaceNotification(
          userId, "group_activity", "New group join request",
          "A student has requested access to a StudySpace group. Review the request in Messages → Groups.",
          "studyspace-group-request-" + (payload.new as { group_id?: string; learner_id?: string }).group_id + "-" + (payload.new as { learner_id?: string }).learner_id,
          import.meta.env.BASE_URL + "studyspace-monitor.svg",
          (payload.new as { group_id?: string }).group_id,
        );
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "studyspace_group_members",
        filter: "learner_id=eq." + userId,
      }, payload => {
        const row = payload.new as { group_id?: string; membership_source?: string };
        if (!row.group_id || !["auto_match", "class_auto"].includes(row.membership_source || "")) return;
        void showStudyspaceNotification(
          userId, "group_activity", "You've joined a study group",
          "A group has been added because your StudySpace profile matches its class or subject.",
          "studyspace-group-joined-" + row.group_id,
          import.meta.env.BASE_URL + "studyspace-monitor.svg",
          row.group_id,
        );
      })
      .subscribe();

    return () => { void supabase?.removeChannel(channel); };
  }, [userId]);

  return null;
}
