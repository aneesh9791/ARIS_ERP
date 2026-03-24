/**
 * serverDate.js
 * Fetches the server's configured timezone once on import,
 * then provides a `today()` helper that always returns the
 * correct local date in the server's timezone (e.g. Asia/Kolkata).
 *
 * Change TZ= in the backend .env to switch regions — no frontend deploy needed.
 */

let _tz = null; // cached timezone string

// Kick off the fetch immediately on module load
const _ready = fetch('/api/server-time')
  .then(r => r.json())
  .then(d => { _tz = d.timezone; })
  .catch(() => { /* keep _tz = null, fall back to Intl below */ });

/**
 * Returns today's date as YYYY-MM-DD in the server's timezone.
 * Safe to call synchronously — uses Intl system timezone as fallback
 * if the server fetch hasn't resolved yet (e.g. first render before fetch).
 */
export function today() {
  const tz = _tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/** Resolves when the server timezone has been fetched. Await this in
 *  critical paths (e.g. app startup) to guarantee accuracy. */
export const serverTZReady = _ready;
