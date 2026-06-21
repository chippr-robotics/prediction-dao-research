---
description: "Task breakdown for Gift & Resell Memberships via Redeemable Voucher NFTs"
---

# Tasks: Gift & Resell Memberships via Redeemable Voucher NFTs

**Input**: Design documents from `/specs/026-membership-vouchers/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution Principle II is NON-NEGOTIABLE — minting handles USDC and redemption grants
access standing, so contract tests are written **before** the code and must fail first. The **entire existing
membership + wager suites MUST pass unchanged** (FR-023/SC-008).

**Hard dependency**: ⚠️ This feature ships as the **first in-place, append-only upgrade of the membership
proxy** delivered by **feature 027** (Upgradeable MembershipManager). 027 must be merged first;
`MembershipManager` already inherits `UUPSManaged` with a trailing `__gap` on this branch, so `redeemVoucher`
appends one slot (`voucher`) from that gap.

**Implementation status (2026-06-21)**: **Contract core complete and green** — `IMembershipVoucher`,
immutable `MembershipVoucher` (mint/burn/on-chain `tokenURI`/2.5%-cap-5% royalty), and the `redeemVoucher`
append-only upgrade on `MembershipManager` (fail-closed redeemer screening, Terms recording, single-use atomic
burn, CEI) are implemented with deploy/verify wiring. **281 passing / 5 pending / 0 failing** (17 new voucher/
redeem/integration tests), `check:storage-layout` validates the `voucher` append. Now also done: subgraph schema+mappings (T016, manifest data
sources are a deploy-time template since addresses/ABIs are network-gated), frontend mint+redeem UI with honest
privacy disclosure (T017/T018, 1500 frontend tests pass), and the voucher Medusa harness (T022). Remaining are
environment-/CI-gated: T019 (sync voucher ABI/address at deploy), T020 (docs), T021 (Slither CI), T023
(security-agent review), T024 (coverage CI), T026–T027 (Amoy/Polygon deploy via floppy keystore + sign-off).

**Design decisions (research.md)**: voucher is **immutable** (NOT upgradeable, D1); redeem-to-self in v1
(D2); mint price/treasury read live from `MembershipManager`, paid to treasury at mint (D3); manager-driven
burn (D4); on-chain Base64 `tokenURI` (D5); ERC-2981 royalty 2.5% / 5% hard ceiling (D6); voucher snapshots
`{role, tier, durationDays}` at mint (D7); redeemer-only fail-closed screening (D10).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (setup, foundational, integration, docs, polish, deployment carry no label)
- Exact file paths are included in every task.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, deploy/CI tooling in
`scripts/`, indexer in `subgraph/`, React app in `frontend/`, docs in `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the OZ token toolchain is available. No new deps (ERC721/ERC2981/Base64/Strings ship in
`@openzeppelin/contracts@5.4.0`, already present).

- [X] T001 Confirm `@openzeppelin/contracts@5.4.0` provides `token/ERC721/ERC721.sol`, `token/ERC721/extensions/ERC721Burnable.sol`, `token/common/ERC2981.sol`, `utils/Strings.sol`, `utils/Base64.sol`; run `npm run compile` baseline. (plan.md Technical Context)

**Checkpoint**: Toolchain confirmed; no new dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared interface the manager uses to talk to the voucher. Required by US2's redemption.

**⚠️ CRITICAL**: Depends on feature 027 (membership proxy) being in place. No user-story redemption work can begin until the interface exists.

- [X] T002 Create `contracts/interfaces/IMembershipVoucher.sol`: the subset the manager calls — `voucherInfo(uint256) returns (VoucherInfo{bytes32 role, IMembershipManager.Tier tier, uint32 durationDays})`, `burn(uint256)`, `ownerOf(uint256)`. (data-model.md; contracts/membership-voucher.md)

**Checkpoint**: The manager↔voucher interface compiles.

---

## Phase 3: User Story 1 - Buy a membership voucher and gift or resell it (Priority: P1) 🎯 MVP

**Goal**: A transferable, immutable ERC-721 voucher minted for USDC at a `(role, tier)`, conferring no
membership while held, with on-chain art and a best-effort EIP-2981 royalty to the treasury.

**Independent Test**: Mint a voucher for each tier by paying the tier price; confirm it appears in the wallet,
confers no membership (`hasActiveRole` false), transfers/resells, and exposes the 2.5% royalty. (spec US1)

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T003 [P] [US1] `test/access/MembershipVoucher.test.js`: mint pulls exactly `priceUSDC` USDC to treasury and snapshots `{role, tier, durationDays}`; minting an inactive/zero-price tier reverts; a held voucher confers no membership; transfer/resale moves the token with no membership effect; `royaltyInfo(id, price)` returns `(treasury, price*250/10000)`; `setRoyaltyBps(>500)` reverts (5% ceiling); `tokenURI` returns a non-empty `data:application/json;base64,` string; `burn` by non-manager/non-owner reverts. (FR-001..005b, FR-021/021a, SC-002/SC-009)

### Implementation for User Story 1

- [X] T004 [US1] Implement `contracts/access/MembershipVoucher.sol` (immutable): `ERC721 + ERC721Burnable + ERC2981 + AccessControl`; immutable `membershipManager`; `mint(role, tier)` (read price+treasury from manager, `SafeERC20.safeTransferFrom` minter→treasury, snapshot `VoucherInfo`, `_safeMint`, `nonReentrant`, emit `VoucherMinted`); `voucherInfo`; `burn` restricted to manager-or-owner; on-chain `tokenURI` (Base64 JSON + SVG); `royaltyInfo` (2.5% default → treasury) + `setRoyaltyBps` (≤500 bps); `supportsInterface`. (contracts/membership-voucher.md; research.md D1/D3/D5/D6/D7)
- [X] T005 [US1] Add deploy wiring stub in `scripts/deploy/deploy.js`: deploy `MembershipVoucher` (immutable, constructor takes the membership proxy address); record `membershipVoucher` in `deployments`. (FR-026)

**Checkpoint**: Vouchers can be minted, gifted, resold; they confer no membership; royalty + on-chain art work. MVP of the tradable instrument.

---

## Phase 4: User Story 2 - Redeem a voucher into a soulbound membership (Priority: P1)

**Goal**: Redeeming burns the voucher and writes a soulbound membership of the voucher's `(role, tier)` to the
redeemer, screened + Terms-recorded, indistinguishable downstream from a direct purchase.

**Independent Test**: From a held voucher, redeem; confirm burn, a correct-tier membership with fresh expiry +
reset counters, Terms recorded, and identical wager-gating behavior to a direct purchase. (spec US2)

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T006 [P] [US2] `test/access/MembershipManager.redeem.test.js`: redeem burns the voucher and writes the `(role, tier)` membership (clock starts now, counters reset); Terms hash recorded for the redeemer; redeem grants the tier minted for even after tier config changes (price/limits/active) post-mint; double-redeem (burned token) reverts; `setVoucher` admin-gated. (FR-006..010, FR-013, SC-009)
- [X] T007 [P] [US2] `test/integration/voucher-redeem-membership.test.js`: a redeemed membership behaves identically to a directly purchased one across `WagerRegistry` create/accept + usage limits (FR-008/SC-003).

### Implementation for User Story 2

- [X] T008 [US2] Extend `contracts/interfaces/IMembershipManager.sol`: add `setVoucher(address)`, `redeemVoucher(uint256 voucherId, bytes32 acceptedTermsHash)`, and `VoucherSet`/`MembershipRedeemed` events. (contracts/membership-manager-redeem-upgrade.md)
- [X] T009 [US2] Append to `contracts/access/MembershipManager.sol` (append-only — draws from the spec-027 `__gap`): `address public voucher`; `setVoucher(address) onlyRole(DEFAULT_ADMIN_ROLE)`; `redeemVoucher(voucherId, acceptedTermsHash) nonReentrant` implementing the CEI flow (own→!active→screen→burn→write membership→record Terms→emit). Reduce `__gap` by 1. No change to existing slots/signatures. (contracts/membership-manager-redeem-upgrade.md; FR-006..016, FR-024/025)
- [X] T010 [US2] Wire voucher↔manager in `scripts/deploy/deploy.js`: after deploying the voucher, call `MembershipManager.setVoucher(voucher)`; confirm the voucher's constructor points at the membership proxy. (FR-026)
- [X] T011 [US2] Run `npm run check:storage-layout` — the `voucher` append must validate as append-only on the membership proxy. (FR-024/SC of 027)

**Checkpoint**: A voucher redeems into a soulbound membership identical to a direct purchase; the append-only upgrade validates. Headline capability delivered.

---

## Phase 5: User Story 3 - Redeem privately to a fresh, unlinked wallet (Priority: P2)

**Goal**: Redeem from a fresh wallet unlinked to the trading wallet; no on-chain back-reference; honest
disclosure; relayer-compatible interface.

**Independent Test**: Transfer a voucher to a fresh wallet, redeem from it; confirm success without any minter
relationship and no stored back-reference; UI states pseudonymity honestly. (spec US3)

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T012 [P] [US3] In `test/access/MembershipManager.redeem.test.js`: redemption succeeds for any owner regardless of who minted (FR-017); the membership record stores no reference to the minting/selling wallet (FR-018); `redeemVoucher` keys only on `msg.sender` ownership (relayer-compatible, no caller assumptions beyond ownership — FR-019).

### Implementation for User Story 3

- [X] T013 [US3] Confirm `redeemVoucher` (T009) holds no back-reference and is `msg.sender`-keyed (no recipient param) — relayer/AA can be layered later without redesign. No code change expected beyond T009; this task verifies/locks the property. (FR-017/018/019)

**Checkpoint**: Private redeem-to-fresh-wallet works; pseudonymity is real and disclosed.

---

## Phase 6: User Story 4 - Compliance gating and failure resilience at redemption (Priority: P2)

**Goal**: Fail-closed redeemer screening; a blocked/failed redemption preserves the voucher (re-tradable); no
minter screening (recorded tradeoff).

**Independent Test**: Blocked redeemer reverts, voucher intact; a later eligible buyer redeems it; already-active
reverts; minting is never screened. (spec US4)

### Tests for User Story 4 (write first, must fail) ⚠️

- [X] T014 [P] [US4] In `test/access/MembershipManager.redeem.test.js`: a blocked redeemer (mock sanctions guard) reverts and the voucher is NOT burned and remains owned (FR-012/015); a redeemer with an active membership for that role reverts, voucher intact (FR-011); after a failed redemption the voucher transfers to a new eligible buyer who redeems successfully (SC-006); minting is NOT screened (FR-014).

### Implementation for User Story 4

- [X] T015 [US4] Confirm the CEI ordering in `redeemVoucher` (T009) screens BEFORE the burn so a blocked/failed redemption leaves the voucher intact; minting path performs no screening. Verify against T014. (FR-011/012/014/015)

**Checkpoint**: Redemption is fail-closed and failure-resilient; the recorded screening tradeoff holds.

---

## Phase 7: Integration (subgraph + frontend)

**Purpose**: Observability + honest, accessible UX, sourced only from synced artifacts.

- [X] T016 [P] Subgraph: add a `Voucher` entity (`status: Held | Redeemed`) to `subgraph/schema.graphql` and index `VoucherMinted`, ERC-721 `Transfer`, and `MembershipRedeemed` in `subgraph/src/mappings/`. (FR-026)
- [X] T017 [P] Frontend: mint flow (choose role+tier, approve+pay USDC) in `frontend/src/` consuming synced artifacts. (FR-001, Principle V)
- [X] T018 [P] Frontend: redeem flow (connect redeeming wallet, accept Terms, screen, redeem-to-this-wallet) with an **honest privacy disclosure** banner (public mints/transfers; pseudonymity, not ZK) and royalty display. WCAG 2.1 AA. (FR-013/020, Principle III/V)
- [X] T019 Run `npm run sync:frontend-contracts:*` so the frontend resolves the voucher address/ABI from artifacts (never hand-copied). (FR-026, Principle V)

**Checkpoint**: Vouchers are indexed and mint/gift/redeem is usable with honest disclosure.

---

## Phase 8: Documentation

- [X] T020 [P] Add `docs/` coverage: how vouchers work (buy/gift/resell/redeem), the redeemer-only screening tradeoff (FR-014), the utility-not-investment framing, and the on-chain `tokenURI`/royalty. Update `CLAUDE.md` if the membership surface guidance needs the voucher rail noted.

**Checkpoint**: Docs explain the voucher rail and its compliance posture.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Security gates for a USDC-handling + access-granting change.

- [ ] T021 [P] Slither on `MembershipVoucher` + the `redeemVoucher` surface — no new high/critical (reentrancy on mint/redeem, ERC721/2981); EthTrust-SL ≥ L2. (Principle I)
- [X] T022 [P] Add a Medusa harness `contracts/test/MembershipVoucherFuzzTest.sol`: invariants — a held voucher never yields membership; redeem is single-use; mint conserves treasury accounting; royalty ≤ 5%. (Principle I)
- [ ] T023 ⏳ REVIEW-GATED — smart-contract security-agent review (`.github/agents/`) of mint (fund handling) + redeemVoucher (fail-closed screening, least-privilege grant, single-use atomic burn, append-only storage). (Principle I)
- [X] T024 [P] Coverage — confirm new branches exercised by `test/access/MembershipVoucher.test.js` + `MembershipManager.redeem.test.js` + the integration test. (Principle II)
- [X] T025 Validate the quickstart locally (non-network parts): full existing membership + wager suites green; voucher mint/transfer/redeem scenarios pass; `check:storage-layout` passes the `voucher` append; redeemed membership == direct membership. (quickstart.md; SC-001..SC-010)

**Checkpoint**: Security gates pass; vouchers are safe and behavior-additive.

---

## Phase 10: Deployment (Amoy first, Polygon after sign-off)

**Purpose**: Deploy the immutable voucher and ship `redeemVoucher` as the first in-place upgrade of the
membership proxy.

> ⏳ **NETWORK-GATED — not runnable in this dev environment.** Requires live RPCs + the air-gapped floppy
> keystore and maintainer sign-off; depends on feature 027's membership proxy being deployed on the network.

- [X] T026 Deploy `MembershipVoucher` (immutable) to **Amoy** + **Mordor**; apply the `redeemVoucher` append-only upgrade to the membership proxy via `upgradeProxy`; `MembershipManager.setVoucher(voucher)`; verify + sync; record `membershipVoucher` + new `membershipManagerImpl`. (Both testnets feature-complete.)
- [ ] T027 After sign-off, repeat on **Polygon** mainnet (chainId 137): deploy voucher, apply the redeem upgrade, `setVoucher`, verify, sync, record. (SC-006) — pending the mainnet UUPS migration.

---

## Phase 11: Batch & gift convenience (helper)

**Purpose**: Buy a quantity of vouchers and gift them directly to an address in one transaction, and redeem by
picking from the wallet's held vouchers. Delivered by the immutable, custody-free `VoucherBatchMinter`
(FR-001a–FR-001d, FR-011a).

- [X] T028 New immutable `contracts/access/VoucherBatchMinter.sol`: `mintBatch(role, tier, quantity, recipient)` — pull `quantity × price` once, mint the batch, forward every token to `recipient` in the same tx, reset allowance; `nonReentrant` + `IERC721Receiver`; `MAX_QUANTITY = 50`; no admin/withdrawal/upgrade. (FR-001a–FR-001c)
- [X] T029 [P] `test/access/VoucherBatchMinter.test.js`: exact accounting, gift-to-recipient, no residual funds/allowance/NFTs, quantity bounds, zero-recipient, inactive tier, snapshot correctness (9 cases).
- [X] T030 [P] Frontend: `useVouchers.mintVouchers(role, tier, quantity, recipient)` routes through the helper for quantity > 1 / gifts and falls back to a direct single self-mint when the helper isn't deployed; `listMyVouchers()` enumerates holdings via a bounded `Transfer` scan; `VouchersPage` gains a quantity input, validated gift-address, live total, selectable held-voucher list, and graceful "not available yet" notes. (FR-001a/b/d, FR-011a)
- [X] T031 Deploy `VoucherBatchMinter` to **Amoy** + **Mordor** via `scripts/deploy/deploy-voucher-batch-minter.js` (does not touch the live UUPS proxies); verify (Mordor ✓ on Blockscout; Amoy verification blocked on the invalid Etherscan key); sync `voucherBatchMinter` into `frontend/src/config/contracts.js` per chain. Polygon pending the mainnet migration.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no deps.
- **Foundational (Phase 2)** → depends on Setup + feature 027 (membership proxy). BLOCKS US2.
- **US1 (Phase 3)** → depends on Setup; the voucher contract is standalone (only reads manager config).
- **US2 (Phase 4)** → depends on US1 (voucher exists) + Foundational (interface) + 027 (proxy to upgrade).
- **US3 (Phase 5)** & **US4 (Phase 6)** → depend on US2 (they test/harden `redeemVoucher`).
- **Integration (Phase 7)** → depends on US1/US2 (events to index, flows to surface).
- **Docs (Phase 8)** / **Polish (Phase 9)** → after the stories land.
- **Deployment (Phase 10)** → after Phase 9 gates; mainnet (T027) gated on T026 sign-off.

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (Principle II).
- Voucher contract (US1) before redemption (US2). Interface (T002) before redeemVoucher (T009).

### Parallel Opportunities

- US1 test (T003) ∥ US2/US4 tests once their files exist; the four test files are independent `[P]`.
- Integration: T016 (subgraph) ∥ T017/T018 (frontend) — different trees.
- Polish: T021/T022/T024 `[P]`; T023/T025 are gates.

---

## Parallel Example: contract tests

```bash
# Write the contract tests together (must fail before T004/T009):
Task T003: test/access/MembershipVoucher.test.js (mint/transfer/royalty/tokenURI/burn-auth)
Task T006: test/access/MembershipManager.redeem.test.js (redeem/burn/grant/drift/double-redeem)
Task T007: test/integration/voucher-redeem-membership.test.js (redeemed == direct via WagerRegistry)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Phase 1 Setup → Phase 2 Foundational (interface; 027 proxy in place).
2. US1 (voucher mint/gift/resell) → US2 (redeem into soulbound membership) — the two together are the usable feature.
3. **STOP and VALIDATE**: buy → gift → redeem end-to-end; redeemed membership == direct.

### Incremental Delivery

1. US1 → tradable voucher (gifting/resale).
2. US2 → redemption (the headline) — ships as the first in-place upgrade of the membership proxy.
3. US3 → private redeem-to-fresh-wallet. US4 → compliance/failure resilience.
4. Integration (subgraph + frontend) → Docs → Polish gates → Deploy (Amoy → sign-off → Polygon).

### Notes

- [P] = different files, no dependency on an incomplete task.
- Tests fail before implementation; commit after each task or logical group.
- Voucher is **immutable** (D1); only `redeemVoucher` is an upgrade (append-only on the membership proxy).
- ABIs/addresses reach the frontend ONLY through `sync:frontend-contracts` (Principle V).
- Keep the existing direct-USDC purchase rail untouched (FR-023).
