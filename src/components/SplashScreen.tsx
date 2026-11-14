type Theme = "light" | "dark";
type Props = { theme?: Theme; displayName?: string };

export default function SplashScreen({ theme = "light", displayName = "Ayanda Zwane" }: Props) {
  const name = displayName.trim() || "Ayanda Zwane";
  return (
    <main className="studyspace-splash" data-theme={theme} role="status" aria-live="polite" aria-busy="true" aria-label="Study Space Monitor is loading">
      <div className="studyspace-splash-glow studyspace-splash-glow-one" />
      <div className="studyspace-splash-glow studyspace-splash-glow-two" />
      <div className="studyspace-splash-content">
        <div className="studyspace-splash-logo-stage">
          <svg className="studyspace-splash-logo studyspace-monitor-splash-logo" viewBox="0 0 512 512" role="img" aria-label="Study Space Monitor three-dimensional dashboard logo">
            <defs>
              <linearGradient id="monitor-splash-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#927df5" />
                <stop offset="55%" stopColor="#6b58ce" />
                <stop offset="100%" stopColor="#42348f" />
              </linearGradient>
              <linearGradient id="monitor-splash-screen" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f7f3ff" />
                <stop offset="100%" stopColor="#d9f8ef" />
              </linearGradient>
              <linearGradient id="monitor-splash-stand" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d8d0ff" />
                <stop offset="100%" stopColor="#9b8be9" />
              </linearGradient>
              <filter id="monitor-splash-shadow" x="-30%" y="-30%" width="160%" height="170%">
                <feGaussianBlur stdDeviation="12" />
              </filter>
            </defs>
            <g className="studyspace-monitor-logo-art">
              <rect width="512" height="512" rx="112" fill="url(#monitor-splash-bg)" />
              <circle cx="398" cy="108" r="76" fill="#fff" opacity=".07" />
              <ellipse cx="270" cy="409" rx="150" ry="24" fill="#211858" opacity=".35" filter="url(#monitor-splash-shadow)" />
              <path d="M92 116 356 72 425 115 160 164Z" fill="#d5ccff" />
              <path d="M160 164 425 115 425 311 160 361Z" fill="#4b3b9e" />
              <path d="M92 116 160 164 160 361 92 311Z" fill="#7967d8" />
              <path d="M113 133 350 94 398 124 161 168Z" fill="#43348e" />
              <path d="M161 168 398 124 398 289 161 337Z" fill="url(#monitor-splash-screen)" />
              <path d="M183 197 369 163" stroke="#a59ae8" strokeWidth="13" strokeLinecap="round" />
              <path d="M184 228 340 199" stroke="#c6c2e9" strokeWidth="10" strokeLinecap="round" />
              <path d="M183 258 321 233" stroke="#c6c2e9" strokeWidth="10" strokeLinecap="round" />
              <path d="M184 289 259 275" stroke="#70cdb8" strokeWidth="15" strokeLinecap="round" />
              <path d="M161 361 425 311 425 339 160 390Z" fill="#3c2d88" />
              <path d="M92 311 160 361 160 390 92 340Z" fill="#6554c3" />
              <path d="M229 349 294 337 310 386 215 403Z" fill="url(#monitor-splash-stand)" />
              <path d="M197 398 322 375 361 397 232 423Z" fill="#e6e0ff" />
              <path d="M197 398 232 423 361 397 322 375Z" fill="#b6a9f1" />
              <circle cx="373" cy="347" r="49" fill="#7be0c3" stroke="#fff" strokeWidth="10" />
              <path d="m350 348 15 15 31-36" fill="none" stroke="#254c64" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
          <span className="studyspace-splash-halo" />
        </div>
        <div className="studyspace-splash-wordmark">Study Space<span>.</span></div>
        <div className="studyspace-splash-divider" />
        <p className="studyspace-splash-welcome">{name} · Owner &amp; Administrator</p>
        <p className="studyspace-splash-tagline">A clear view of every learner, lesson and achievement.</p>
        <div className="studyspace-splash-progress" aria-hidden="true"><span /></div>
        <span className="studyspace-splash-status">PREPARING YOUR MONITOR WORKSPACE</span>
        <span className="studyspace-splash-footnote">ESWATINI · STUDY SPACE ADMINISTRATION</span>
      </div>
    </main>
  );
}
