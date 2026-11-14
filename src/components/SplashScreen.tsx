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
          <svg className="studyspace-splash-logo" viewBox="0 0 512 512" role="img" aria-label="Study Space graduation cap logo">
            <defs>
              <linearGradient id="studyspace-brand-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#927df5" />
                <stop offset="100%" stopColor="#5d45c8" />
              </linearGradient>
            </defs>
            <rect className="studyspace-logo-colour" x="8" y="8" width="496" height="496" rx="112" fill="url(#studyspace-brand-gradient)" />
            <g className="studyspace-logo-sketch" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round">
              <rect className="studyspace-logo-frame" x="8" y="8" width="496" height="496" rx="112" />
              <path className="studyspace-logo-cap-sketch" d="M112 215 256 143 400 215 256 288 112 215Z" />
              <path className="studyspace-logo-cap-sketch" d="M164 246v76c0 17 41 42 92 42s92-25 92-42v-76" />
              <path className="studyspace-logo-cap-sketch" d="M400 215v112" />
            </g>
            <g className="studyspace-logo-finish" fill="none" stroke="#fff" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round">
              <path d="M112 215 256 143 400 215 256 288 112 215Z" />
              <path d="M164 246v76c0 17 41 42 92 42s92-25 92-42v-76" />
              <path d="M400 215v112" />
            </g>
            <g className="studyspace-splash-pencil" aria-hidden="true">
              <path d="M0 0 12-12 34 10 22 22Z" fill="#f5d58a" stroke="#6e5a37" strokeWidth="2" />
              <path d="m0 0-5 17 17-5" fill="#f1d8ad" stroke="#6e5a37" strokeWidth="2" />
              <path d="m-5 17 7-2-5-5Z" fill="#4b4651" />
              <path d="m12-12 5-5 22 22-5 5Z" fill="#c4c9d3" stroke="#6e5a37" strokeWidth="2" />
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
