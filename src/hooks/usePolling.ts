import { useEffect, useRef } from 'react';

/**
 * Run a poll on an interval, but pause it while the tab is hidden.
 *
 * The dashboard alone had eleven independent pollers. Left running in a
 * background tab they keep hitting the Flask server and re-rendering for
 * nobody, which matters on a modest Windows 10 Pro box. Pausing on
 * `visibilitychange` removes that cost entirely and resumes instantly when the
 * tab is shown again.
 *
 * `enabled` lets a page switch polling off for its own reasons (for example
 * while a socket is delivering the same data).
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      saved.current();
      timer = setInterval(() => saved.current(), intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
