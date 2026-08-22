/**
 * String helpers shared across gateway modules.
 *
 * `stripTrailingSlashes` replaces the `replace(/\/+$/, '')` idiom every upstream client used on
 * its base URL. That regex is quadratic under backtracking (each of n trailing slashes restarts
 * the anchored run), which CodeQL flags as js/polynomial-redos wherever the string can be
 * library-influenced. The inputs here are operator-configured env URLs — not attacker data — but
 * a backward scan is the same one line of intent with no pathological case at all, so the whole
 * class is retired rather than argued about per call site (spec 095 hardening).
 */
export function stripTrailingSlashes(value) {
  const s = String(value ?? '')
  let end = s.length
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end -= 1
  return s.slice(0, end)
}
