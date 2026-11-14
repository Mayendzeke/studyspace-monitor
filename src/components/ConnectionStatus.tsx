import { useEffect, useState } from "react";
import { CheckCircle2, WifiOff } from "lucide-react";

export default function ConnectionStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let recoveryTimer: number | undefined;
    const handleOffline = () => {
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      setOnline(false);
      setRestored(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setRestored(true);
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => setRestored(false), 3800);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (!navigator.onLine) handleOffline();
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
    };
  }, []);

  if (online && !restored) return null;
  return (
    <div className={"connection-status-banner " + (online ? "is-online" : "is-offline")} role="status" aria-live="polite" aria-atomic="true">
      <span className="connection-status-icon">{online ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}</span>
      <span className="connection-status-copy">
        <strong>{online ? "Back online. Nice comeback!" : "Connection lost — tiny study break."}</strong>
        <small>{online ? "Your device is connected again. Online features can resume." : "The internet stepped out. Reconnect to sync changes and use online features."}</small>
      </span>
      {!online && <span className="connection-status-pulse" aria-hidden="true"><i /></span>}
    </div>
  );
}
