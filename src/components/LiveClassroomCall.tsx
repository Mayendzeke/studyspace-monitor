import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mic, Video, X } from "lucide-react";

type JitsiApi = {
  dispose: () => void;
  executeCommand?: (command: string) => void;
  addEventListener: (event: string, callback: (payload?: unknown) => void) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

let jitsiScriptPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (jitsiScriptPromise) return jitsiScriptPromise;

  jitsiScriptPromise = new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>("script[data-studyspace-jitsi]");
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.dataset.studyspaceJitsi = "true";
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
    throw error;
  });
  return jitsiScriptPromise;
}

function readRoom(meetingUrl: string): { domain: string; roomName: string } {
  const url = new URL(meetingUrl);
  if (url.protocol !== "https:" || url.hostname !== "meet.jit.si") {
    throw new Error("This meeting link is not a supported Studyspace video room.");
  }
  const roomName = decodeURIComponent(url.pathname.replace(/^\\/+|\\/+$/g, ""));
  if (!roomName || roomName.includes("/")) throw new Error("The meeting room name is invalid.");
  return { domain: url.hostname, roomName };
}

export default function LiveClassroomCall({
  meetingUrl,
  displayName,
  audience,
}: {
  meetingUrl: string;
  displayName: string;
  audience: "student" | "teacher";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !mountRef.current) return;
    let alive = true;
    let instance: JitsiApi | null = null;
    setLoading(true);
    setError("");
    setConnected(false);

    const start = async () => {
      try {
        const room = readRoom(meetingUrl);
        await loadJitsiScript();
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
        instance.addEventListener("videoConferenceJoined", () => {
          if (alive) { setConnected(true); setLoading(false); }
        });
        instance.addEventListener("videoConferenceLeft", () => {
          if (alive) { setConnected(false); setLoading(false); }
        });
        instance.addEventListener("readyToClose", () => {
          if (alive) { setConnected(false); setOpen(false); setLoading(false); }
        });
        instance.addEventListener("errorOccurred", () => {
          if (alive) { setError("The video room reported a problem. You can try again or open it in a new tab."); setLoading(false); }
        });
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
  }, [open, meetingUrl, displayName, audience]);

  function leaveCall() {
    try { apiRef.current?.executeCommand?.("hangup"); } catch { /* Dispose still removes the embedded room. */ }
    setOpen(false);
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
      {open && <div className="live-classroom-call-frame" ref={mountRef} aria-label="Video classroom" />}
      <p className="live-classroom-call-footnote">
        {connected ? "You are connected to the room. Use the meeting controls to mute, share your screen or leave." : "The room opens inside Studyspace. Allow microphone or camera access only when you are ready."}
        {" "}This preview uses the public Jitsi service; room links are not protected by Studyspace sign-in.
      </p>
    </section>
  );
}
