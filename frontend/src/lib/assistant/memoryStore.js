/**
 * Assistant conversation memory (spec 095) — ON THIS DEVICE ONLY.
 *
 * What this is: the last few turns of the member's conversation, kept so re-opening the panel does
 * not start from nothing. What it is NOT: a transcript service. It never leaves the browser, it is
 * DELIBERATELY ABSENT from `lib/backup/syncedObjects.js` (a test asserts it), and the member can
 * empty it from Settings with a count in front of them so "clear" is a fact they can check rather
 * than a promise they have to take.
 *
 * BOUNDED TWICE, ON PURPOSE. A message cap alone is not a size cap — one pasted contract dump would
 * blow past any per-message limit's intent — so the store trims to `MAX_MESSAGES` and then keeps
 * dropping the oldest until the serialized form fits `MAX_BYTES`. Trimming from the FRONT keeps the
 * most recent exchange, which is the part a follow-up question depends on.
 *
 * Retention is a member preference (`assistantPrefs.retainMemory`). This module does not read it:
 * the caller decides whether to persist, so "don't remember" means nothing is written at all rather
 * than something written and hidden.
 */
import { getUserPreference, removeUserPreference, saveUserPreference } from '../../utils/userStorage'

/** Wallet-scoped storage key. Versioned so a future shape change cannot be read as this one. */
export const ASSISTANT_MEMORY_KEY = 'assistant_memory_v1'

/** Hard caps. Both apply; whichever binds first wins. */
export const MAX_MESSAGES = 50
export const MAX_BYTES = 64 * 1024

const ROLES = new Set(['user', 'assistant'])

const listeners = new Set()

function notify() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // A bad subscriber must not break the write.
    }
  }
}

/** Subscribe to memory changes (the Settings card shows a live count). Returns an unsubscribe. */
export function subscribeAssistantMemory(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Coerce one stored turn into a message, or null. Anything else is dropped, never rendered. */
function toMessage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!ROLES.has(raw.role)) return null
  if (typeof raw.content !== 'string' || raw.content.length === 0) return null
  const at = Number(raw.at)
  return { role: raw.role, content: raw.content, at: Number.isFinite(at) && at > 0 ? at : null }
}

/**
 * Trim a message list to both caps, dropping from the front.
 * Exported because the bound is the interesting part of this module and is tested directly.
 */
export function trimMessages(messages, { maxMessages = MAX_MESSAGES, maxBytes = MAX_BYTES } = {}) {
  let out = messages.slice(-maxMessages)
  const size = (list) => new TextEncoder().encode(JSON.stringify(list)).length
  while (out.length > 1 && size(out) > maxBytes) out = out.slice(1)
  // A single message that is itself over the cap is kept rather than silently emptied: the member
  // typed it, it is already on their screen, and dropping it would make the panel forget the turn
  // it just answered.
  return out
}

/** This account's remembered conversation, oldest first. `[]` when there is nothing (or no wallet). */
export function loadMemory(account) {
  if (!account) return []
  const raw = getUserPreference(account, ASSISTANT_MEMORY_KEY, [], true)
  if (!Array.isArray(raw)) return []
  return raw.map(toMessage).filter(Boolean)
}

/** How many turns this device is holding. The number the Settings card shows next to "Clear". */
export function memoryCount(account) {
  return loadMemory(account).length
}

/**
 * Replace the remembered conversation with `messages` (trimmed to the caps).
 * @returns {Array} what was actually stored
 */
export function saveMemory(account, messages) {
  if (!account) return []
  const clean = (Array.isArray(messages) ? messages : []).map(toMessage).filter(Boolean)
  const trimmed = trimMessages(clean)
  saveUserPreference(account, ASSISTANT_MEMORY_KEY, trimmed, true)
  notify()
  return trimmed
}

/** Empty this account's memory on this device. */
export function clearMemory(account) {
  if (!account) return
  removeUserPreference(account, ASSISTANT_MEMORY_KEY, true)
  notify()
}
