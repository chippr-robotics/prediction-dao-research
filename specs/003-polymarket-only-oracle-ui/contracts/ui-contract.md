# Phase 1 Contract: config + UI surface contract

For a frontend feature, the "interface" is the exposure config it exposes and the
per-surface behavior each consumer must honor.

## Config interface (single source of truth)

```text
// constants/wagerDefaults.js
VITE_ORACLE_MODELS            // env: 'polymarket-only' (default) | 'all'
EXPOSED_ORACLE_RESOLUTION_TYPES  // derived: ResolutionType[]; default [Polymarket]
isOracleModelExposed(rt)      // helper: boolean (rt ∈ exposed set)
```

- Default (unset / unrecognized value) MUST resolve to **Polymarket-only**.
- `'all'` MUST resolve to the full four-model array (today's behavior).
- Polymarket is ALWAYS in the array.

## Per-surface acceptance contract (what "done" means)

- **FriendMarketsModal — oracle selection (1v1 AND Make an Offer)**:
  - Renders only `EXPOSED_ORACLE_RESOLUTION_TYPES` as choices — in both the 1v1 and
    the Make an Offer (`resolutionCategory='all'`) flows.
  - With one exposed model: oracle resolution defaults to Polymarket and **no
    multi-tab oracle chooser / empty selector** is shown (FR-002).
  - No keyboard/DOM/programmatic path selects a hidden model (FR-001).
  - Polymarket market-search → condition-link → create works unchanged (FR-003).
  - A pre-selected hidden model (deep link/draft) falls back to Polymarket.
- **Dashboard / OnboardingTutorial copy**: names only Polymarket as the auto-
  settlement source when Polymarket-only; full wording when `all` (FR-004).
- **LandingPage footer "Oracles" list** (folded from 004): only the Polymarket link
  when Polymarket-only; Chainlink/UMA links restored when `all`; no landing/marketing
  page contains "Chainlink"/"UMA" text (FR-004/SC-003).
- **Display of existing wagers**: a hidden-model wager still shows its model name
  and resolves — `RESOLUTION_TYPE_LABELS` and read/settlement paths unchanged (FR-006).
- **Reversibility**: setting `VITE_ORACLE_MODELS=all` restores all four models in
  the selector AND the copy with no other change (SC-004).

## Test contract (FR / Constitution II)

A component/unit test MUST assert:
1. Default flag → the oracle selector offers exactly one model (Polymarket); no
   Chainlink/UMA option is selectable.
2. Flag = `all` → the selector offers all four models.
3. (Display) a wager whose model is Chainlink/UMA still renders its label.

## Out of scope (explicit)

- `components/admin/OracleAdaptersTab.jsx` and all contracts/ABIs/deployments —
  untouched.
- Removing/deleting Chainlink/UMA UI code (we flag it off, not out).
