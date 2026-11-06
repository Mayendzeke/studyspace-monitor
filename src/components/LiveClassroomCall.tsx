import { useEffect, useRef, useState } from "react";
import { Mic, Video, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type JitsiApi = {
  dispose: () => void;
  executeCommand?: (command: string, ...args: unknown[]) => void;
  getNumberOfParticipants?: () => number;
  addEventListener: (event: string, callback: (payload?: unknown) => void) => void;
};

type JaasTokenResponse = {
  success: boolean;
  provider: "jaas";
  domain: "8x8.vc";
  appId: string;
  roomName: string;
  token: string;
  expiresAt: number;
  moderator: boolean;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

let jaasScriptPromise: Promise<void> | null = null;
let jaasScriptAppId: string | null = null;

function loadJaasScript(appId: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) {
    if (jaasScriptAppId && jaasScriptAppId !== appId) {
      return Promise.reject(new Error("A different JaaS application is already loaded. Refresh Studyspace before joining."));
    }
    jaasScriptAppId = appId;
    return Promise.resolve();
  }

  if (jaasScriptPromise) {
    if (jaasScriptAppId !== appId) {
      return Promise.reject(new Error("A different JaaS application is already loading. Refresh Studyspace before joining."));
    }
    return jaasScriptPromise;
  }

  jaasScriptAppId = appId;
  jaasScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>("script[data-studyspace-jaas]");
    const expectedSrc = "https://8x8.vc/" + encodeURIComponent(appId) + "/external_api.js";

    if (script && script.src !== expectedSrc) {
      reject(new Error("A different video service script is already on this page. Refresh Studyspace and try again."));
      return;
    }

    if (!script) {
      script = document.createElement("script");
      script.src = expectedSrc;
      script.async = true;
      script.dataset.studyspaceJaas = appId;
    }

    const onLoad = () => {
      if (window.JitsiMeetExternalAPI) resolve();
      else reject(new Error("JaaS loaded without its meeting API."));
    };
    const onError = () => reject(new Error("JaaS could not be loaded. Check your internet connection and try again."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
    else if (window.JitsiMeetExternalAPI) resolve();
  }).catch(error => {
    jaasScriptPromise = null;
    jaasScriptAppId = null;
    throw error;
  });

  return jaasScriptPromise;
}

async function getFunctionError(reason: unknown): Promise<string> {
  if (reason && typeof reason === "object" && "context" in reason) {
    const context = (reason as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof payload.error === "string") return payload.error;
        if (typeof payload.message === "string") return payload.message;
      } catch {
        // Use the general error below when the response is not JSON.
      }
      return "Studyspace could not issue a secure classroom token.";
    }
  }
  return reason instanceof Error ? reason.message : "Studyspace could not issue a secure classroom token.";
}

export default function LiveClassroomCall({
  sessionId,
  audience,
}: {
  sessionId: string;
  audience: "student" | "teacher";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !mountRef.current) return;
    let alive = true;
    let instance: JitsiApi | null = null;

    setLoading(true);
    setConnected(false);
    setRoomReady(false);
    setParticipantCount(0);
    setError("");

    const start = async () => {
      try {
        if (!supabase) throw new Error("Studyspace is not connected to its secure classroom service.");

        const { data, error: tokenError } = await supabase.functions.invoke("jaas-token", {
          body: { sessionId },
        });
        if (tokenError) throw new Error(await getFunctionError(tokenError));
        const credentials = data as JaasTokenResponse | null;

        if (
          !credentials?.success ||
          credentials.provider !== "jaas" ||
          credentials.domain !== "8x8.vc" ||
          typeof credentials.appId !== "string" ||
          typeof credentials.roomName !== "string" ||
          typeof credentials.token !== "string" ||
          !credentials.token
        ) {
          throw new Error(typeof data?.error === "string" ? data.error : "Studyspace returned an invalid JaaS meeting token.");
        }

        await loadJaasScript(credentials.appId);
        if (!alive || !mountRef.current || !window.JitsiMeetExternalAPI) return;

        instance = new window.JitsiMeetExternalAPI("8x8.vc", {
          roomName: credentials.roomName,
          jwt: credentials.token,
          parentNode: mountRef.current,
          width: "100%",
          height: "100%",
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinPageEnabled: true,
            disableDeepLinking: true,
          },
        });
        apiRef.current = instance;
        const callInstance = instance;

        callInstance.addEventListener("videoConferenceJoined", () => {
          if (!alive) return;
          setConnected(true);
          setRoomReady(true);
          setLoading(false);
          setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 1);
        });

        callInstance.addEventListener("participantJoined", () => {
          if (alive) setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 2);
        });

        callInstance.addEventListener("participantLeft", () => {
          if (alive) setParticipantCount(callInstance.getNumberOfParticipants?.() ?? 1);
        });

        callInstance.addEventListener("videoConferenceLeft", () => {
          if (alive) {
            setConnected(false);
            setParticipantCount(0);
            setLoading(false);
          }
        });

        callInstance.addEventListener("readyToClose", () => {
          if (alive) {
            setConnected(false);
            setRoomReady(false);
            setParticipantCount(0);
            setOpen(false);
            setLoading(false);
          }
        });

        callInstance.addEventListener("errorOccurred", () => {
          if (alive) {
            setError("The JaaS meeting reported a connection problem. Leave the room and try joining again.");
            setLoading(false);
          }
        });

        setRoomReady(true);
        setLoading(false);
      } catch (reason) {
        if (alive) {
          setError(reason instanceof Error ? reason.message : "The secure video classroom could not be started.");
          setLoading(false);
        }
      }
    };

    void start();

    return () => {
      alive = false;
      if (instance) {
        try {
          instance.dispose();
        } catch {
          // The iframe may already have closed.
        }
      }
      if (apiRef.current === instance) apiRef.current = null;
    };
  }, [open, sessionId, audience]);

  function leaveCall() {
    try {
      apiRef.current?.executeCommand?.("hangup");
    } catch {
      // Cleanup below still removes the embedded room.
    }
    setOpen(false);
    setConnected(false);
    setRoomReady(false);
    setParticipantCount(0);
  }

  return (
    <section className="live-classroom-call">
      <div className="live-classroom-call-heading">
        <div>
          <strong><Video size={16} /> Secure live lesson</strong>
          <span><Mic size={13} /> Studyspace verifies your class access. Microphone and camera start muted.</span>
        </div>
        <div className="live-classroom-call-actions">
          {!open ? (
            <button type="button" className="primary-button" onClick={() => setOpen(true)}>Join in Studyspace</button>
          ) : (
            <button type="button" className="secondary-button" onClick={leaveCall}><X size={14} /> Leave call</button>
          )}
        </div>
      </div>
      {loading && <p className="live-classroom-call-status" role="status">Verifying your Studyspace account and connecting to JaaS…</p>}
      {error && <p className="live-classroom-call-error" role="alert">{error}</p>}
      {open && roomReady && !connected && !loading && (
        <p className="live-classroom-call-status" role="status">The secure video room is ready. Complete the meeting microphone check, then join the call.</p>
      )}
      {connected && (
        <p className="live-classroom-call-status" role="status">
          Connected · {participantCount} participant{participantCount === 1 ? "" : "s"} in this room.
        </p>
      )}
      {open && <div className="live-classroom-call-frame" ref={mountRef} aria-label="Secure video classroom" />}
      <p className="live-classroom-call-footnote">
        {connected
          ? "You are connected to the Studyspace classroom. Use the meeting controls to mute, share your screen or leave."
          : "Only the teacher who created this live session and learners assigned to it can receive a room token. Enable your microphone or camera only when you are ready."}
      </p>
    </section>
  );
}
