type Theme = 'light' | 'dark'

export default function SplashScreen({ theme = 'light' }: { theme?: Theme }) {
  return (
    <main
      className="monitor-splash"
      data-theme={theme}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Studyspace Monitor is loading"
    >
      <div className="monitor-splash-glow monitor-splash-glow-one" />
      <div className="monitor-splash-glow monitor-splash-glow-two" />
      <div className="monitor-splash-content">
        <div className="monitor-splash-brand">
          <div className="monitor-splash-mark"><img src={import.meta.env.BASE_URL + "studyspace-monitor.svg"} alt="Study Space"/></div>
          <div className="monitor-splash-wordmark">
            <strong>studyspace<span>.</span></strong>
            <small>MONITOR</small>
          </div>
        </div>
        <div className="monitor-splash-loader" aria-hidden="true"><span /></div>
        <p>Manage learners, create lessons and follow academic progress.</p>
      </div>
    </main>
  )
}
