/**
 * The one thing this console remembers (spec 095).
 *
 * `store['console'] = { baseUrl }` — the gateway address the member typed, and nothing else.
 *
 * WHAT IS DELIBERATELY NOT HERE: the bearer token. The host store rides the member's encrypted
 * backup and is documented as app state, never key material; a token is a credential that grants
 * read access to a member's account to whoever holds it, so writing one here would put it into a
 * backup blob and into a namespace nothing in the UI surfaces. It lives in React state for the life
 * of the mount instead, which the connection card says out loud.
 *
 * The store namespace is already scoped to the ACTING account by the host, so nothing here keys by
 * address — a member operating as a vault gets the vault's saved gateway, which is the right
 * reading of "whose console is this".
 */

/** The single declared store key (see `storeKeys` in vite.config.js). */
export const CONSOLE_KEY = 'console'

/**
 * Read the saved settings. Never throws, and never invents a value: an absent or malformed record
 * yields an empty `baseUrl`, which the console renders as "not saved yet" rather than as a default
 * it would then claim the member had chosen.
 */
export function readConsoleSettings(store) {
  const raw = store && typeof store.get === 'function' ? store.get(CONSOLE_KEY, null) : null
  const baseUrl = raw && typeof raw === 'object' && typeof raw.baseUrl === 'string' ? raw.baseUrl : ''
  return { baseUrl }
}

/**
 * Persist the base URL, preserving any other field a later version of this package may have added.
 *
 * `store.set` reports rather than throws — it returns `false` for a quota failure, an unserialisable
 * value or a no-op write. A `false` is passed straight through so the caller can say "saved for
 * this session only" instead of showing a success it did not get.
 */
export function writeBaseUrl(store, baseUrl) {
  if (!store || typeof store.set !== 'function') return false
  const current = typeof store.get === 'function' ? store.get(CONSOLE_KEY, null) : null
  const next = { ...(current && typeof current === 'object' ? current : {}), baseUrl }
  return store.set(CONSOLE_KEY, next) !== false
}
