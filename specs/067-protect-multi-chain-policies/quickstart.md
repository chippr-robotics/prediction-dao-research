# Quickstart: Protect Multi-Chain Vaults & Advanced Policy Engine

Validation guide proving the feature end-to-end. References:
[data-model.md](./data-model.md), [contracts/SafePolicyGuardV2.md](./contracts/SafePolicyGuardV2.md),
[contracts/frontend-integration.md](./contracts/frontend-integration.md).

## Prerequisites

```bash
npm install            # repo root (contracts)
cd frontend && npm install && cd ..
npm run compile
```

## 1. Contract suites (US2/US3 core + FR-010/011/012/013/021)

```bash
npx hardhat test test/custody/SafePolicyGuardV2.test.js
npx hardhat test test/integration/policy-guard-v2-safe.test.js
npm test               # full suite still green (v1 guard suites untouched)
```

Expected: unit suite covers matching/ordering (first-match, banding, same-scope alternative,
no-match denial), approver verification (approvedHashes, executor-implicit, removed owner),
per-rule windows, bounds, lockout-proofing, preview parity. Integration walks the spec's US2
Independent Test on a real Safe v1.4.1: rules `001 {A,B, 2-of-2, ≤L}` + `002 {C, 1-of-1, ≤L}` —
A+B within L executes, C alone within L executes, A alone reverts `RuleApproversMissing`, over-L
reverts `RulePerTxExceeded`; plus a reorder changing the governing rule and a v1→V2 upgrade.

```bash
npm run test:coverage  # SafePolicyGuardV2.sol present in coverage-threshold-policy.json
```

Static analysis + fuzzing (constitution I): Slither clean of new high/critical; Medusa stateful
run on rule matching/accounting invariants; security-agent review recorded.

## 2. Frontend suites (US1/US4/US5 + FR-001–008, 015–024)

```bash
cd frontend
npx vitest run src/test/custody/
npx vitest run src/test/SectionIconNav.test.jsx src/test/AppNavDrawer.test.jsx  # nav (FR-024, shipped)
npm run test:frontend  # full suite
```

Expected: multi-chain `useCustodyVaults` (no chain filter, per-vault isolation, chain names),
CustodyAddressField (paste/book/QR + validation), RuleList reorder via keyboard buttons with
renumbering, RuleComposer per-kind validation incl. shadow warnings, PolicyPanelV2 staging diff +
single-pending-change block, axe clean on every component.

## 3. Local end-to-end (hardhat)

```bash
npx hardhat node                                   # terminal 1
npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network localhost
npm run frontend                                   # terminal 2 (VITE_NETWORK_ID=1337)
```

Walk: Protect (Tools group) → create vault (owners via address book/QR; wizard states the chain)
→ Policy step → compose `001 A+B ≤ 100`, `002 C ≤ 100`, token limit, approved-contract rule from
the catalog → deploy → propose transfer violating 001 → approve to threshold → execute blocked
with "Rule 001…" message → reorder rules (drag and keyboard) → approve reorder → boundary tx now
governed by the new order.

## 4. Multi-chain acceptance (US1, staging wallets)

With vault references on two chains (e.g. Mordor + Polygon):
- Vault list shows both with chain badges regardless of connected network (FR-002/003).
- Opening the off-chain vault: read-only, switch prompt, no action submittable (FR-004, SC-001).
- On a custody chain without the V2 engine: policy honestly `unsupported`, vaults elsewhere still
  listed (FR-005).

## 5. Deployment validation (per network: 63, 61, 137)

```bash
npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network <net>
npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network <net>   # where missing
npm run sync:frontend-contracts -- --network <net> --chainId <id>
```

Verify: `deployments/<net>-chain<id>-v2.json` records `safePolicyGuardV2` (+ setup/hub) with
deploy blocks; `frontend/src/config/contracts.js` regenerated including
`DEPLOYMENT_BLOCKS_BY_CHAIN.safeProposalHub`; `SAFE_CONTRACTS` includes 61; proposal discovery
works on every custody chain (the pre-existing deployment-block gap is closed).

## Success criteria spot-checks

- SC-002: compose the full example policy in the UI in < 10 min guided only by on-screen text.
- SC-003: every blocked tx names its rule (or "no rule allows this") — check decode paths.
- SC-004: attempt any policy mutation without threshold approval — impossible by construction
  (guard config callable only by the vault itself).
- SC-005: two-rule reorder → approval → boundary tx governed by new order, < 3 min member effort.
- SC-007: `/wallet?tab=custody` deep link unchanged; Protect under Tools on drawer + bottom bar.
