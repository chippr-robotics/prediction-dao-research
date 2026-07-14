# Requirements Quality Checklist: Predict — Polymarket Trading

Applied to `spec.md` before planning is finalized. Each item confirms the spec is
implementable, testable, and honest.

## Completeness

- [x] Every user story has a priority, an independent test, and acceptance scenarios.
- [x] The revenue mechanism (builder codes) and its two streams (builder fee + weekly
  rewards) are specified.
- [x] The builder fee rate (50 bps taker / 0 maker) and Polymarket's caps (100/50) are
  captured and made config, not hardcoded.
- [x] Edge cases cover unsupported network, passkey, outage, killswitch, fee-fetch
  failure, out-of-cap fee, USDC allowance, wrong network, resolved market, illiquidity.

## Honesty & constitution alignment

- [x] The builder fee is specified as an **additive real user cost** and required to be
  disclosed as its own line (FR-012) — the explicit divergence from Collect's no-cost
  referral is called out.
- [x] Live fees required; hardcoded fees prohibited (FR-010).
- [x] Shown total == charged total invariant stated (FR-011).
- [x] No custody, wallet-only signing, settlement on Polymarket's protocol (FR-004/SC-005).
- [x] Credentials server-side only; no client credential (FR-016/SC-006).
- [x] Never-stranded: trade proceeds even if unattributed; killswitch leaves a direct path
  (FR-015/FR-017).

## Testability

- [x] Each FR maps to at least one acceptance scenario or measurable success criterion.
- [x] Success criteria are measurable (SC-001..SC-010) and outcome-based.
- [x] Passkey ERC-1271 path and the honest-unavailable per-account fallback are testable
  (SC-009).

## Scope discipline

- [x] Out-of-scope list excludes market creation/resolution, liquidity provisioning,
  surcharges beyond the disclosed builder fee, custody, and contract changes.
- [x] Polygon-only scope stated (FR-018); no mainnet/testnet ambiguity.
- [x] No dependency of any value-path (wager/pool/payment) flow on this feature (FR-020).

## Open dependencies (resolve in planning / before launch)

- [ ] Confirm the exact builder-code parameter name/placement on the V2 order struct and
  `@polymarket/clob-client-v2` (`builder` bytes32 field per research D6) against the live SDK.
- [ ] Confirm Polymarket's builder-program ToS and any geographic/eligibility constraints.
- [ ] Confirm the CLOB validates our passkey account implementation's ERC-1271 signatures.
