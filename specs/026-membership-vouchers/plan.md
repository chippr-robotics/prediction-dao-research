# Implementation Plan: Gift & Resell Memberships via Redeemable Voucher NFTs

**Branch**: `claude/transferable-memberships-ch3hlw` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-membership-vouchers/spec.md`

## Summary

Add a **second membership-acquisition rail**: a transferable **voucher NFT** that can be bought, gifted, or
resold, and that **burns on redemption** to mint the platform's existing **soulbound, time-bound** membership
of the voucher's `(role, tier)`. The existing direct-USDC purchase path is unchanged and remains a parallel
rail. Sanctions screening and Terms acceptance happen **at redemption, on the redeemer** (fail-closed); privacy
is pragmatic (redeem from a fresh wallet — pseudonymity, not ZK); resale royalty is a best-effort EIP-2981 hint
(default 2.5%, 5% hard ceiling) to the treasury.

Technical approach (smallest change that satisfies the spec):

- **New immutable `MembershipVoucher` (ERC-721 + ERC-2981)**: permissionless `mint(role, tier)` priced from the
  `MembershipManager` tier config, paid in USDC to the treasury and **recognized at mint** (no escrow). Each
  token records a snapshot `{role, tier, durationDays}` so it is a self-contained bearer claim, immune to later
  config drift. On-chain `tokenURI` (Base64 JSON + SVG). The token is **deliberately immutable** (not
  upgradeable) — see Decision D1.
- **`MembershipManager` redeem upgrade (append-only)**: add a `voucher` address and a
  `redeemVoucher(voucherId, acceptedTermsHash)` that verifies caller ownership, reads the token's
  `{role, tier, durationDays}`, **burns** it, **screens the redeemer** (fail-closed), records Terms, rejects an
  already-active redeemer, and writes the soulbound membership — all atomic, single-use, least-privilege. This
  ships as the **first in-place, append-only upgrade** of the upgradeable `MembershipManager`.
- **Reuse the merged 025 primitives**: the redeem upgrade rides `contracts/upgradeable/UUPSManaged.sol`, the
  `scripts/deploy/lib/upgradeable.js` proxy/upgrade tooling, and the `npm run check:storage-layout` CI gate —
  all already merged via #724. Nothing in the proxy machinery is re-derived.
- **New immutable `VoucherBatchMinter` (batch & gift helper)**: the immutable voucher mints exactly one token
  to the caller, so "buy N" and "gift to an address" are delivered by a separate immutable, custody-free helper
  (`mintBatch(role, tier, quantity, recipient)`) that pulls `quantity × price` once, mints the batch, forwards
  every token to `recipient` in the same tx, and resets its allowance — atomic, no admin/withdrawal/upgrade,
  `MAX_QUANTITY = 50`. Strictly additive: when it isn't deployed, single self-mint still works and the UI
  degrades to an honest "not available yet" state (FR-001a–FR-001d). See Decision D1 (same immutability
  rationale as the voucher).
- **Integration**: subgraph indexes voucher mint/transfer/redeem; frontend adds buy-a-quantity / gift-to-address
  mint, a select-from-your-held-vouchers redeem (bounded `Transfer` scan, honest empty state), an honest privacy
  disclosure, and royalty display — sourced only from synced artifacts.

### ⚠️ Hard prerequisite (out of scope here, must land first)

`redeemVoucher` is an **append-only upgrade of the membership proxy**, which presupposes `MembershipManager`
is already behind a UUPS proxy. **It is not yet** — `contracts/access/MembershipManager.sol` is still the
non-upgradeable `AccessControl` version (`constructor`, no `__gap`). The **sibling "Upgradeable
MembershipManager" migration** (behavior-neutral conversion onto `UUPSManaged`, coexistence cutover — the exact
mirror of 025's WagerRegistry work) is a **separate spec that MUST be specified, planned, and deployed before
026 can be implemented or merged**. This plan treats that migration as an external dependency and does **not**
fold it in (per the spec's explicit out-of-scope). Recommended sequencing: *sibling migration → 026 voucher
feature as its first upgrade.*

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat 2.28); JavaScript/ES2022 for deploy/CI tooling; React + Vite
frontend; The Graph subgraph. All consume synced artifacts.

**Primary Dependencies**: `@openzeppelin/contracts@5.4.0` — `ERC721`, `ERC721Burnable`, `ERC2981`,
`Strings`, `Base64`, `SafeERC20` for the **immutable** voucher (no new dep). For the membership redeem upgrade:
`@openzeppelin/contracts-upgradeable@5.4.0` + `@openzeppelin/hardhat-upgrades@^3.9.0` + the merged
`UUPSManaged` base (all already present from #724). No new core technology is introduced.

**Storage**: On-chain — the immutable voucher holds its own `mapping(tokenId => VoucherInfo)`; the membership
proxy gains **one appended** config slot (`voucher`) consuming `__gap` (append-only; validated by CI). Off-chain
— `deployments/*.json` records the voucher address and the membership proxy/impl addresses (source of truth).

**Testing**: Hardhat unit (voucher mint/transfer/burn/royalty/`tokenURI`; redeem happy-path, fail-closed
screening, already-active reject, double-redeem reject, config-drift), integration (a redeemed membership is
indistinguishable from a directly purchased one across `WagerRegistry` create/accept/limits), an upgrade
-lifecycle test (membership V→V+1 state preserved, append-only), Slither + Medusa, OZ `validateUpgrade` in CI.
The **full existing membership and wager suites MUST pass unchanged** (FR-023/SC-008). Frontend: Vitest.

**Target Platform**: Polygon mainnet (137) + Amoy testnet (80002); local (1337) for dev. Mordor/ETC out of scope.

**Project Type**: Web3 monorepo — Solidity contracts + JS deploy/CI tooling + React frontend + Graph subgraph.

**Performance Goals**: Mint is O(1) (one USDC transfer + one SFT mint + struct write). On-chain `tokenURI` is a
view (no transaction gas for marketplaces). Redeem is O(1) (ownership read, burn, screen, membership write).
No unbounded loops.

**Constraints**: Mint handles user USDC and redemption grants access standing → Constitution Principle I in
full. Redeemer screening fails closed (FR-012); membership granting is least-privilege (no broad
`ROLE_MANAGER_ROLE` grant — FR-025); redeem is single-use/atomic (FR-010); the membership upgrade is
append-only with `__gap` + `validateUpgrade`. The resulting membership must be byte-for-byte the existing model
(FR-008). Privacy is honest pseudonymity, disclosed truthfully (FR-020, Principle III).

**Scale/Scope**: 2 live chains; 4 user stories; 27 functional requirements. Touches a new
`contracts/access/MembershipVoucher.sol`, an append-only edit to `contracts/access/MembershipManager.sol`
(post-migration), deploy script + `deployments/` schema (voucher address), subgraph schema/mappings, frontend
mint/gift/redeem UI, and tests. Reuses 025's proxy/upgrade/storage tooling unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: Mint custodies USDC; redemption grants access
  standing. Both are high-risk. Design commitments:
  - **Fail-closed screening (FR-012)**: `redeemVoucher` calls the existing `_screen(msg.sender)` **before** any
    effect; a blocked redeemer reverts, no membership is written, the voucher is **not** burned (FR-015) so it
    stays re-tradable.
  - **Least privilege (FR-025)**: redemption writes the membership through `MembershipManager`'s own internal
    grant path; the voucher contract is granted **only** the right to be burned by the manager — it is **not**
    given `ROLE_MANAGER_ROLE` or any broad granting power.
  - **Single-use, atomic, CEI (FR-010)**: redeem ordering is checks (ownership, not-active, screen) →
    effects (burn token, write membership, record Terms) → no external interactions; `nonReentrant` applied.
    Mint ordering is checks (active tier, price>0) → `SafeERC20.safeTransferFrom` to treasury → mint token;
    `nonReentrant` applied.
  - **Append-only storage**: the membership upgrade appends a single `voucher` slot after existing state,
    drawing from `__gap`; OZ `validateUpgrade` (CI) blocks any reorder/removal/retype before an upgrade applies.
  - **Uninitialized-impl defense**: inherited from `UUPSManaged` (`_disableInitializers()` in its constructor);
    the membership initializer stays one-time (delivered by the sibling migration; this upgrade adds no second
    initializer).
  - **Immutable voucher (D1)**: the bearer instrument's rules cannot change after purchase, and it presents the
    smallest possible upgrade attack surface on a USDC-taking contract.
  - **Tooling**: Slither (ERC721/2981 + reentrancy detectors) + Medusa clean (no new high/critical); OZ upgrade
    validation in CI; smart-contract security-agent review before merge; EthTrust-SL ≥ L2 with documented gaps.
    **PASS (commitments carried into research, data-model, contracts, and tasks).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: New voucher unit suite + redeem integration +
  membership upgrade-lifecycle test are written first; the **entire existing membership and wager suites must
  pass unchanged** against the redeemed-membership path (FR-008/FR-023/SC-008). Redemption failure/edge paths
  (blocked, already-active, double-redeem, config drift) are explicitly tested. **PASS.**
- **III. Honest State, No Mocks/Placeholders**: The privacy guidance states plainly that mints/transfers/burns
  are public and that fresh-wallet redemption is pseudonymity, not cryptographic unlinkability (FR-020). No
  mocks in shipped paths; membership/voucher data is network-scoped. **PASS.**
- **IV. Fail Loudly in CI**: `check:storage-layout`, the new contract tests, and Slither gate the pipeline; no
  `continue-on-error` on test/lint/build/security. **PASS.**
- **V. Accessible, Consistent Frontend**: Mint/gift/redeem UI meets WCAG 2.1 AA; the voucher address/ABI reach
  the frontend only via `sync:frontend-contracts` (never hand-copied). **PASS.**

**New core technology justification**: None. The voucher uses OZ `@openzeppelin/contracts` (already present);
the membership upgrade reuses the `contracts-upgradeable` + `hardhat-upgrades` deps introduced and justified by
025. No bespoke proxy, no new framework.

**Result**: All gates pass with the Principle I commitments above. No deviations → **Complexity Tracking not
required.** The single material risk is the *sequencing dependency* on the sibling migration (tracked in
Summary and Dependencies), not a constitution violation.

*Post-Phase 1 re-check*: The design adds one small immutable token contract and one append-only config slot +
function to the membership proxy, reuses all 025 proxy tooling, introduces no new fund-custody beyond a single
USDC→treasury transfer at mint, and grants no broad roles. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/026-membership-vouchers/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — D1..D13 decisions (immutable voucher, redeem-to-self, payment routing, on-chain URI, royalty, duration snapshot, dependency)
├── data-model.md        # Phase 1 — VoucherInfo entity, membership append-only slot, voucher + redemption state machines
├── quickstart.md        # Phase 1 — mint → gift/resell → redeem (incl. fresh-wallet) end-to-end validation guide
├── contracts/           # Phase 1
│   ├── membership-voucher.md                # Immutable ERC721+ERC2981 voucher: mint, burn-by-manager, tokenURI, royalty
│   └── membership-manager-redeem-upgrade.md # Append-only redeemVoucher upgrade: screen, T&C, grant, single-use
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify, /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── access/
│   ├── MembershipVoucher.sol        # NEW (immutable): ERC721 + ERC721Burnable + ERC2981; mint(role,tier);
│   │                                #   VoucherInfo{role,tier,durationDays}; on-chain tokenURI; royalty (2.5%/cap 5%)
│   ├── VoucherBatchMinter.sol       # NEW (immutable, custody-free): mintBatch(role,tier,quantity,recipient);
│   │                                #   buy-N + gift in one tx; MAX_QUANTITY=50; no admin/withdrawal/upgrade
│   └── MembershipManager.sol        # EDIT (append-only upgrade, post-migration): + address voucher; + setVoucher;
│                                    #   + redeemVoucher(voucherId, acceptedTermsHash); reduce __gap; new events
└── interfaces/
    ├── IMembershipManager.sol       # EDIT: + redeemVoucher / setVoucher surface + MembershipRedeemed event
    └── IMembershipVoucher.sol       # NEW: voucherInfo(tokenId) + burn(tokenId) surface used by the manager

test/
├── access/
│   ├── MembershipVoucher.test.js    # NEW: mint/price/transfer/burn-auth/royalty cap/tokenURI
│   ├── VoucherBatchMinter.test.js   # NEW: exact accounting, gift-to-recipient, no residual funds/allowance/NFTs,
│   │                                #   quantity bounds, zero-recipient, inactive tier, snapshot correctness
│   └── MembershipManager.redeem.test.js  # NEW: redeem happy + fail-closed + already-active + double-redeem + drift
├── integration/
│   └── voucher-redeem-membership.test.js # NEW: redeemed membership == direct membership across WagerRegistry
├── upgradeable/
│   └── MembershipManager.redeemUpgrade.test.js # NEW: V→V+1 append-only, state preserved, validateUpgrade
└── (existing membership + wager suites)  # MUST pass unchanged (FR-008/FR-023)

scripts/deploy/
├── deploy.js                        # EDIT: deploy MembershipVoucher (immutable) + VoucherBatchMinter; wire
│                                    #   voucher↔manager; apply redeem upgrade to the membership proxy
├── deploy-voucher-batch-minter.js   # NEW: targeted single-contract deploy of VoucherBatchMinter against an
│                                    #   already-deployed voucher (does NOT touch the live UUPS proxies)
└── (lib/upgradeable.js, check-storage-layout.js)  # REUSE unchanged (merged via #724)

subgraph/
├── schema.graphql                   # EDIT: + Voucher entity (status: Held/Redeemed) + VoucherRedeemed
└── src/*                            # EDIT: map VoucherMinted / Transfer / VoucherRedeemed

frontend/src/                        # EDIT: mint (choose role+tier, buy a quantity, optional gift-to-address,
│                                    #   approve+pay USDC via VoucherBatchMinter; single self-mint fallback),
│                                    #   redeem (pick from your held vouchers via a bounded Transfer scan, honest
│                                    #   empty state, accept T&C, screen), privacy disclosure, royalty display
deployments/*.json                   # EDIT: record membershipVoucher address (+ existing membership proxy/impl)
```

**Structure Decision**: Web3 monorepo. The feature is split into a **new immutable token** (`MembershipVoucher`)
and an **append-only upgrade** to the existing membership authority, the latter riding the merged `UUPSManaged`
base and 025's deploy/validate tooling without re-deriving any proxy primitive. The voucher is intentionally
not upgradeable (D1). Contract ABIs/addresses reach the frontend only through `sync:frontend-contracts`
(Principle V).

## Dependencies & Sequencing

1. **(Prerequisite, external)** Sibling "Upgradeable MembershipManager" migration — converts
   `MembershipManager` onto `UUPSManaged` (constructor→`initialize`, `__gap`, coexistence cutover),
   behavior-neutral. **Must merge and deploy before 026.** Mirrors 025; reuses the same tooling.
2. **(This feature, 026)** `MembershipVoucher` (immutable) + `redeemVoucher` append-only upgrade + integration.
   Ships as the **first in-place upgrade** of the membership proxy.
3. Already satisfied on this branch: 025 `UUPSManaged` base + proxy/upgrade/storage tooling (merged via #724).

## Complexity Tracking

> No constitution violations — section intentionally empty. (OZ ERC721/2981 are existing deps; the upgradeable
> deps were justified by 025. The sibling-migration dependency is a sequencing risk, surfaced above, not a
> deviation.)
