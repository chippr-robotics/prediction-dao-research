/**
 * Domain metadata for the unified activity feed (spec 031). The machine `key` is the entry `domain`
 * (= the source key); `label` is the human tag shown in the feed and the per-domain filter. Keep this the
 * single place the UI learns a domain's display name so adding a source needs no feed edits.
 */
export const DOMAIN_META = {
  wagers: { label: 'Wager' },
  dao: { label: 'DAO' },
  token: { label: 'Token' },
  membership: { label: 'Membership' },
  pools: { label: 'Pool' },
  // Spec 043 custody (Safe multisig vault) events.
  custody: { label: 'Custody' },
  // Spec 035 intent lifecycle entries (emitted via useIntentAction's onActivity callback).
  intents: { label: 'Gasless' },
}

/** Display label for a domain key (falls back to the key itself for an unknown/future domain). */
export function domainLabel(key) {
  return (key && DOMAIN_META[key]?.label) || key || 'Activity'
}
