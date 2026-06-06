/**
 * Dev-only debug logging.
 *
 * `log` / `warn` emit to the console only in development builds, or when the
 * page URL carries `?debug=1` (a support-session escape hatch). In production
 * they are no-ops, so user identifiers and session shape never reach the
 * browser console, error-tracking ingestion, or screen-share/bug-report
 * screenshots. See docs/remediation/16-console-logging.md.
 *
 * Use `console.error` directly for genuine errors — those SHOULD surface in
 * production for telemetry, so they are intentionally not routed through here.
 */
const isDebugEnabled = (): boolean => {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
};

const enabled = isDebugEnabled();

export const log = (...args: unknown[]): void => {
  if (enabled) console.log(...args);
};

export const warn = (...args: unknown[]): void => {
  if (enabled) console.warn(...args);
};
