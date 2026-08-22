/**
 * Programmatic-access activity source (spec 095 / spec 031).
 *
 * Announces the two facts a member should never learn about only by going to look: an API key
 * appeared or was withdrawn, and the assistant was switched on or off. Both change what can reach
 * the account and what leaves the device, which is why they get a feed entry rather than only a
 * toast — a toast is single-slot and auto-dismissing, so it is not a record of anything.
 *
 * PURELY LOCAL. There is no network read here at all: the key metadata store and the assistant
 * preference are the source of truth, and both live in this browser. `ok` is therefore always true —
 * `ok: false` is the ONLY thing that raises the member-facing "couldn't refresh" notice, and this
 * source can never fail to find out, so claiming it could would put an outage banner in front of
 * people for nothing.
 *
 * FIRST SIGHT IS A BASELINE, AT THE SOURCE LEVEL. The per-refId rule ("a refId with no prior
 * snapshot emits nothing") cannot be used on its own here, because a genuinely new key IS a refId
 * with no prior snapshot — applying it literally would mean the one event worth announcing is the
 * one that never announces. So the source records `aux.seeded` on its first cycle for a scope,
 * baselines everything it can see, and emits nothing. Every cycle after that, an unseen key id is a
 * key that was just minted. A cold start, a new device and a chain switch all re-baseline, so
 * nothing is ever retroactively announced.
 */
import { listKeyRecords, shortKeyId } from '../../../lib/apiAccess/apiKeys'
import { loadAssistantPrefs } from '../../../lib/assistant/assistantPrefs'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, nextAux: {}, currentIds: [], actionNeededById: {} }

const KEYS_LINK = Object.freeze({ to: '/wallet?tab=settings#api-access' })
const ASSISTANT_LINK = Object.freeze({ to: '/wallet?tab=settings#assistant-prefs' })

/** The assistant switch has one refId; a key uses its own id. */
const ASSISTANT_REF = 'assistant'

function describeKey(record) {
  return record.label ? `“${record.label}”` : shortKeyId(record.keyId)
}

export const accessSource = {
  key: 'access',
  label: 'Programmatic access',
  async detect({ account, chainId, nowMs, prior }) {
    if (!account) return EMPTY

    const priorSnapshots = prior?.snapshots || {}
    const seeded = prior?.aux?.seeded === true

    const keys = listKeyRecords(account)
    const assistant = loadAssistantPrefs(account)

    const nextSnapshots = {}
    const entries = []

    for (const record of keys) {
      const refId = record.keyId
      const snapshot = { revoked: Boolean(record.revokedAt), label: record.label || '' }
      nextSnapshots[refId] = snapshot

      if (!seeded) continue
      const before = priorSnapshots[refId]
      if (!before) {
        entries.push({
          id: `access:${chainId}:key-created:${refId}`,
          domain: 'access',
          refId,
          type: 'api_key_created',
          message: `API key ${describeKey(record)} was created. Anyone holding it can read this account's data.`,
          severity: 'info',
          actionable: false,
          link: KEYS_LINK,
          createdAt: record.issuedAt ? record.issuedAt * 1000 : nowMs,
          read: false,
        })
      } else if (!before.revoked && snapshot.revoked) {
        entries.push({
          id: `access:${chainId}:key-revoked:${refId}`,
          domain: 'access',
          refId,
          type: 'api_key_revoked',
          message: `API key ${describeKey(record)} was revoked.`,
          severity: 'info',
          actionable: false,
          link: KEYS_LINK,
          createdAt: record.revokedAt ? record.revokedAt * 1000 : nowMs,
          read: false,
        })
      }
    }

    const assistantSnapshot = { enabled: assistant.enabled === true }
    nextSnapshots[ASSISTANT_REF] = assistantSnapshot
    const priorAssistant = priorSnapshots[ASSISTANT_REF]
    if (seeded && priorAssistant && priorAssistant.enabled !== assistantSnapshot.enabled) {
      entries.push({
        // The id carries the state, so switching back and forth produces two distinguishable
        // entries rather than one the engine's append-dedup would swallow.
        id: `access:${chainId}:assistant-${assistantSnapshot.enabled ? 'on' : 'off'}:${Math.floor(nowMs / 1000)}`,
        domain: 'access',
        refId: ASSISTANT_REF,
        type: assistantSnapshot.enabled ? 'assistant_enabled' : 'assistant_disabled',
        message: assistantSnapshot.enabled
          ? 'The assistant is on. Your messages are sent to the FairWins gateway and its model provider while it is enabled.'
          : 'The assistant is off. Nothing is sent.',
        severity: 'info',
        actionable: false,
        link: ASSISTANT_LINK,
        createdAt: nowMs,
        read: false,
      })
    }

    return {
      ok: true,
      entries,
      nextSnapshots,
      nextAux: { seeded: true },
      currentIds: Object.keys(nextSnapshots),
      actionNeededById: {},
    }
  },
}

export default accessSource
