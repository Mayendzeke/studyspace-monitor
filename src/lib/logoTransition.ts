import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished?: Promise<void> };
};

/** Move the named splash logo into its permanent brand position when supported. */
export function runLogoHandoff(update: () => void): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    update();
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const transitionDocument = document as ViewTransitionDocument;
  if (reducedMotion || typeof transitionDocument.startViewTransition !== "function") {
    update();
    return;
  }
  try {
    transitionDocument.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}
