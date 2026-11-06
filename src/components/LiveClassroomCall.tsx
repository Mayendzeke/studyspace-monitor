import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mic, Video, X } from "lucide-react";

type JitsiApi = {
  dispose: () => void;
  executeCommand?: (command: string) => void;
  getNumberOfParticipants?: () => number;
  addEventListener: (event: string, callback: (payload?: unknown) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

let jitsiScriptPromise: Promise<void> | null = null;
let jitsiScriptDomain: string | null = null;

function loadJitsiScript(domain: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) {
    if (jitsiScriptDomain && jitsiScriptDomain !== domain) {
      return Promise.reject(new Error("A different Jitsi domain is already loaded. Refresh Studyspace before changing video providers."));
    }
    return Promise.resolve();
  }
  if (jitsiScriptPromise) {
    if (jitsiScriptDomain !== domain) {
      return Promise.reject(new Error("A different Jitsi domain is already loading. Refresh Studyspace before changing video providers."));
    }
    return jitsiScriptPromise;
  }

  jitsiScriptDomain = domain;
  jitsiScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>("script[data-studyspace-jitsi]");
    const created = !script;
    if (script && script.dataset.studyspaceJitsi && script.dataset.studyspaceJitsi !== domain) {
      reject(new Error("A different Jitsi provider script is already on this page. Refresh Studyspace and try again."));
      return;
    }
    if (!script) {
      script = document.createElement("script");
      script.src = "https://" + domain + "/external_api.js";
      script.async = true;
      script.dataset.studyspaceJitsi = domain;
    }
    const onLoad = () => {
      if (window.JitsiMeetExternalAPI) resolve();
      else reject(new Error("The video service loaded without its meeting API."));
    };
    const onError = () => reject(new Error("The video service could not be loaded. Check your connection and try again."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (created) document.head.appendChild(script);
    else if (window.JitsiMeetExternalAPI) resolve();
  }).catch(error => {
    jitsiScriptPromise = null;
    jitsiScriptDomain = null;
    throw error;
  });
  return jitsiScriptPromise;
}

function configuredMeetingDomain(): string {
  const value = (import.meta.env.VITE_STUDYSPACE_MEET_DOMAIN || "meet.jit.si").trim().toLowerCase();
  const domain = value.replace("https://", "").replace("http://", "").split("/")[0].replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) {
    throw new Error("The Studyspace video domain is not configured correctly.");
  }
  return domain;
}

function readRoom(meetingUrl: string): { domain: string; roomName: string } {
  const url = new URL(meetingUrl);
  if (url.protocol !== "https:" || url.hostname !== configuredMeetingDomain()) {
    throw new Error("This meeting link does not match the configured Studyspace video provider.");
  }
  const roomName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (!roomName || roomName.includes("/")) throw new Error("The meeting room name is invalid.");
  return { domain: url.hostname, roomName };
}

export default function LiveClassroomCall({
  meetingUrl,
  displayName,
  audience,
  meetingPassword,
  onRoomSecured,
}: {
  meetingUrl: string;
  displayName: string;
  audience: "student" | "teacher";
  meetingPassword?: string;
  onRoomSecured?: () => Promise<void>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const onRoomSecuredRef = useRef(onRoomSecured);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { onRoomSecuredRef.current = onRoomSecured; }, [onRoomSecured]);

  useEffect(() => {
    if (!open || !mountRef.current) return;
    let alive = true;
    let instance: JitsiApi | null = null;
    setLoading(true);
    setError("");
    setConnected(false);
    setRoomReady(false);
    setParticipantCount(0);
    setPasswordProtected(false);
    setSecurityError("");
    let roomSecurityReported = false;

    const start = async () => {
      try {
        const room = readRoom(meetingUrl);
        await loadJitsiScript(room.domain);
        if (!alive || !mountRef.current || !window.JitsiMeetExternalAPI) return;
        instance = new window.JitsiMeetExternalAPI(room.domain, {
          roomName: room.roomName,
          parentNode: mountRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: displayName.trim() || (audience === "teacher" ? "Teacher" : "Student") },
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: true,
            disableDeepLinking: true,
          },
        });
        apiRef.current = instance;
        const callInstance = instance;
        callInstance.addEventListener("participantRoleChanged", event => {
          const role = (event as { role?: string } | undefined)?.role;
          if (audience !== "teacher" || role !== "moderator" || !meetingPassword || roomSecurityReported) return;
          roomSecurityReported = true;
          callInstance.executeCommand?.("password", meetingPassword);
          const secure = onRoomSecuredRef.current;
          if (!secure) {
            if (alive) setSecurityError("Jitsi granted moderator access, but Studyspace could not confirm classroom readiness.");
            return;
          }
          void secure().then(() => {
            if (alive) setPasswordProtected(true);
          }).catch(reason => {
            if (alive) setSecurityError(reason instanceof Error ? "The room password was sent, but Studyspace could not unlock student access: " + reason.message : "The secure room could not be registered in Studyspace.");
          });
        });
        callInstance.addEventListener("passwordRequired", () => {
          if (audience === "student" && meetingPassword) {
            callInstance.executeCommand?.("password", meetingPassword);
          } else if (alive) {
            setSecurityError("This room requires a password that is not available to this account.");
          }
        });
        callInstance.addEventListener("videoConferenceJoined", () => {
          if (!alive) return;
          setConnected(true);
          setRoomReady(true);
          setLoading(false);
          setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 1);
          if (audience === "student" && meetingPassword) setPasswordProtected(true);
        });
        callInstance.addEventListener("participantJoined", () => {
          if (alive) setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 2);
        });
        callInstance.addEventListener("participantLeft", () => {
          if (alive) setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 1);
        });
        callInstance.addEventListener("videoConferenceLeft", () => {
          if (alive) { setConnected(false); setRoomReady(false); setParticipantCount(0); setPasswordProtected(false); setLoading(false); }
        });
        callInstance.addEventListener("readyToClose", () => {
          if (alive) { setConnected(false); setRoomReady(false); setParticipantCount(0); setPasswordProtected(false); setOpen(false); setLoading(false); }
        });
        instance.addEventListener("errorOccurred", () => {
          if (alive) { setError("The video room reported a problem. You can try again or open it in a new tab."); setLoading(false); }
        });
        setRoomReady(true);
        setLoading(false);
      } catch (reason) {
        if (alive) {
          setError(reason instanceof Error ? reason.message : "The video room could not be started.");
          setLoading(false);
        }
      }
    };
    void start();

    return () => {
      alive = false;
      if (instance) {
        try { instance.dispose(); } catch { /* The iframe may already have closed. */ }
      }
      if (apiRef.current === instance) apiRef.current = null;
    };
  }, [open, meetingUrl, displayName, audience, meetingPassword]);

  function leaveCall() {
    try { apiRef.current?.executeCommand?.("hangup"); } catch { /* Dispose still removes the embedded room. */ }
    setOpen(false);
    setConnected(false);
    setRoomReady(false);
    setParticipantCount(0);
    setPasswordProtected(false);
  }

  return (
    <section className="live-classroom-call">
      <div className="live-classroom-call-heading">
        <div>
          <strong><Video size={16} /> Video &amp; audio lesson</strong>
          <span><Mic size={13} /> Microphone and camera start muted. You choose when to enable them.</span>
        </div>
        <div className="live-classroom-call-actions">
          {!open ? (
            <button type="button" className="primary-button" onClick={() => setOpen(true)}>Join in Studyspace</button>
          ) : (
            <button type="button" className="secondary-button" onClick={leaveCall}><X size={14} /> Leave call</button>
          )}
          <a className="live-classroom-external" href={meetingUrl} target="_blank" rel="noreferrer">Open separately <ExternalLink size={13} /></a>
        </div>
      </div>
      {loading && <p className="live-classroom-call-status" role="status">Connecting to the classroom video service…</p>}
      {error && <p className="live-classroom-call-error" role="alert">{error}</p>}
      {open && roomReady && !connected && <p className="live-classroom-call-status" role="status">The video room is ready. Complete the name and microphone check in the meeting panel, then join the call.</p>}
      {connected && <p className="live-classroom-call-status" role="status">Connected · {participantCount} participant{participantCount===1?"":"s"} in this room. You can use the meeting controls below.</p>}
      {open && <div className="live-classroom-call-frame" ref={mountRef} aria-label="Video classroom" />}
      <p className="live-classroom-call-footnote">
        {connected ? "You are connected to the room. Use the meeting controls to mute, share your screen or leave." : "The room opens inside Studyspace. Allow microphone or camera access only when you are ready."}
        {" "}{passwordProtected ? "A session password is in use. The public Jitsi service is not tied to the learner's Studyspace identity." : meetingPassword && audience === "teacher" ? "Waiting for Jitsi moderator access so the teacher can set the room password. Learner access stays locked until Studyspace confirms readiness." : "This older or unprotected room has no Studyspace sign-in enforcement. Do not use it for sensitive lessons."}
      </p>
      {securityError && <p className="live-classroom-call-error" role="alert">{securityError}</p>}
    </section>
  );
}
