type Props = { theme?: "dark" | "light"; displayName?: string };

export default function SplashScreen({ theme = "light", displayName = "" }: Props) {
  const name = displayName.trim();
  const isMonitor = true;

  return (
    <main
      className="studyspace-splash"
      data-theme={theme}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={isMonitor ? "Study Space Monitor is loading" : "Study Space is loading"}
    >
      <div className="studyspace-splash-glow studyspace-splash-glow-one" />
      <div className="studyspace-splash-glow studyspace-splash-glow-two" />
      <div className="studyspace-splash-content">
        <div className="studyspace-splash-logo-stage">
          <svg className="studyspace-splash-logo" viewBox="0 0 512 512" role="img" aria-label="Study Space graduation cap logo">
            <defs>
              <linearGradient id="studyspace-purple" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#927df5" />
                <stop offset="1" stopColor="#5d45c8" />
              </linearGradient>
            </defs>
            <rect className="studyspace-logo-colour" x="0" y="0" width="512" height="512" rx="112" fill="url(#studyspace-purple)" />
            <g className="studyspace-logo-sketch" fill="none" stroke="#fff" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round">
              <path className="studyspace-logo-cap-top" pathLength="1000" d="M112 215 256 143 400 215 256 288 112 215Z" />
              <path className="studyspace-logo-cap-base" pathLength="1000" d="M164 246v76c0 17 41 42 92 42s92-25 92-42v-76" />
              <path className="studyspace-logo-cap-tassel" pathLength="1000" d="M400 215v112" />
            </g>
          </svg>
          <span className="studyspace-splash-halo" />
        </div>
        <div className="studyspace-splash-wordmark">Study Space<span>.</span></div>
        <div className="studyspace-splash-divider" />
        <p className="studyspace-splash-welcome">
          {name ? `Welcome, ${name}` : isMonitor ? "Your teaching workspace" : "Your learning companion"}
        </p>
        <p className="studyspace-splash-tagline">
          {isMonitor
            ? "A clear space for every learner, lesson and achievement."
            : "A focused space for learning, teaching and progress."}
        </p>
        <div className="studyspace-splash-progress" aria-hidden="true"><span /></div>
        <span className="studyspace-splash-status">
          {isMonitor ? "PREPARING YOUR MONITOR WORKSPACE" : "PREPARING YOUR LEARNING SPACE"}
        </span>
        <span className="studyspace-splash-footnote">
          {isMonitor ? "LEARN · TEACH · GROW" : "LEARN · GROW · ACHIEVE"}
        </span>
      </div>
    </main>
  );
}
