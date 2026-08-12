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
  // Spec 067 FR-039a / research R6: this label used to read the bare word "Pool", which becomes
  // indistinguishable from an Earn → Supply liquidity entry once both appear in the same feed.
  // "Pool" stays reserved for wager pools; the label spells that out.
  pools: { label: 'Wager Pool' },
  // Spec 043 custody (Safe multisig vault) events.
  custody: { label: 'Custody' },
  // Spec 035 intent lifecycle entries (emitted via useIntentAction's onActivity callback).
  intents: { label: 'Gasless' },
  // Spec 050 earn (lending & rewards) events.
  earn: { label: 'Earn' },
  // Spec 065 staking (liquid & delegated) events.
  staking: { label: 'Staking' },
  // Spec 067 cross-chain bridge (deposit, delivered, refunded, needs attention) events.
  bridge: { label: 'Bridge' },
  // Spec 067 Earn → Supply liquidity events (supply, withdraw, fee claim, pool closed).
  liquidity: { label: 'Liquidity' },
  // Spec 082/083 perpetual-futures events: orders the venue executed, rejected, froze or timed
  // out, plus position changes made on the venue's own app.
  perps: { label: 'Perps' },
}

/** Display label for a domain key (falls back to the key itself for an unknown/future domain). */
export function domainLabel(key) {
  return (key && DOMAIN_META[key]?.label) || key || 'Activity'
}
