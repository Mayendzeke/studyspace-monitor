import { GraduationCap } from 'lucide-react'

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
          <div className="monitor-splash-mark"><GraduationCap size={29} strokeWidth={2.1} /></div>
          <div className="monitor-splash-wordmark">
            <strong>studyspace<span>.</span></strong>
            <small>MONITOR</small>
          </div>
        </div>
        <div className="monitor-splash-loader" aria-hidden="true"><span /></div>
        <p>Preparing your administrator workspace</p>
        <small className="monitor-splash-caption">SECURE ACCESS · LEARNER MANAGEMENT</small>
      </div>
      <div className="monitor-splash-footer"><GraduationCap size={14} /> LEARN · GROW · ACHIEVE</div>
    </main>
  )
}
