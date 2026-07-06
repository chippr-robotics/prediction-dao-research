// Spec 042 — pluggable per-framework connector resolver.
//
// ClearPath reads/acts on a DAO through a connector chosen by its governance framework, so the UI, data-source
// router, and notification source never branch on framework. Two connectors ship — OpenZeppelin Governor (0,
// ENS + any IGovernor DAO) and GovernorBravo/Compound (1, Uniswap). Adding a framework (Morpho, Aragon, …) is a
// new module + one entry in ORDERED — no consumer change (SC-006). See contracts/connector-interface.md.

import { ozGovernorConnector } from './ozGovernor'

// Detection order matters: OZ first (its COUNTING_MODE() probe is the tightest discriminator), then Bravo
// (proposalCount()+quorumVotes(), which OZ lacks). Append new connectors here. GovernorBravo (framework 1) is
// added alongside its module in the US3 phase.
const ORDERED = [ozGovernorConnector]

const BY_FRAMEWORK = ORDERED.reduce((m, c) => {
  m[c.framework] = c
  return m
}, {})

/** The connector for a known framework value, or null (→ read-only + deep-link) when unsupported. */
export function getConnector(framework) {
  return BY_FRAMEWORK[framework] ?? null
}

/**
 * Detect a DAO's governance framework by probing each connector's `matches` in priority order. Returns the
 * framework value (0 OZ, 1 Bravo) or the string `'unknown'` when none matches — the caller then tracks read-only
 * where feasible and offers a truthful deep-link rather than a broken action (FR-011). Each probe is
 * fault-isolated so one connector's revert never aborts detection.
 */
export async function detectFramework(reader, address) {
  for (const c of ORDERED) {
    try {
      if (await c.matches(reader, address)) return c.framework
    } catch {
      // this framework didn't match / reverted — try the next
    }
  }
  return 'unknown'
}

export { ozGovernorConnector }
