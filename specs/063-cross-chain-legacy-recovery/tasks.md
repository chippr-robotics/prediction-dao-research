---
description: "Task list for 063 — Universal Acting-Account + Cross-Chain Legacy Recovery"
---

# Tasks: Universal Acting-Account + Cross-Chain Legacy Recovery

**Input**: Design documents from `specs/063-cross-chain-legacy-recovery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the project constitution makes Test-First non-negotiable (Principle II). Every
derivation/encoding path is vector-first; the Zcash sighash is gated on official vectors + a
differential oracle before any mainnet path.

**Scope note**: Monero (was US5) is deferred to a follow-up spec. Active stories: US1–US4.

**Path conventions**: Web app — `frontend/src/`, tests `frontend/src/test/`, gateway
`services/relay-gateway/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [~] T001 `@scure/bip39` + `@scure/base` promoted to direct deps (lockfile synced). `@solana/kit` (US3) and `@bitgo/utxo-lib` (US4 oracle) still to add when those stories start.
- [ ] T002 [P] Create `frontend/src/config/solanaNetworks.js` (string ids `solana`/`solana-devnet`, `isSolanaNetworkId`) mirroring `bitcoinNetworks.js`, with unit test `frontend/src/test/config/solanaNetworks.test.js`.
- [ ] T003 [P] Create `frontend/src/config/zcashNetworks.js` (string ids `zcash`/`zcash-testnet`, `isZcashNetworkId`, mainnet coin type 133 + testnet dual 1/133, address prefixes) with unit test `frontend/src/test/config/zcashNetworks.test.js`.
- [ ] T004 [P] Add a shared non-EVM boundary guard helper (extend the existing `isBitcoinNetworkId` pattern) so string ids never reach `getContractAddressForChain`/wagmi; unit test the guard.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Blocks all user stories. US1 needs the effective-account seam; US2–US4 need the
memory-only seed exposure + discovery framework.

- [X] T005 [P] Create `frontend/src/hooks/useEffectiveAccount.js` — resolves the per-surface effective address from the acting identity (personal/vault/legacy/derived), reading Wallet/Custody contexts directly so it degrades without providers. Test `frontend/src/test/hooks/useEffectiveAccount.test.jsx` (6 tests).
- [ ] T006 Extend `frontend/src/contexts/CustodyContext.jsx` + `frontend/src/hooks/useActiveAccount.js` so a **derived external account** can be an acting identity (type `derived`, per-chain address), reusing the memory-only signer lifecycle (dropped on lock/switch/disconnect, FR-018). Tests in `frontend/src/test/custody/`.
- [ ] T007 Extend `frontend/src/lib/recovery/legacyKeys.js` to expose the recovered **mnemonic → BIP-39 seed** in memory only (never persisted/logged/transmitted, FR-017), plus a `dropSeed()` tied to the lock/switch/disconnect lifecycle. Test `frontend/src/test/recovery/legacySeed.memory.test.js` (asserts no seed in storage/logs).
- [ ] T008 Create `frontend/src/lib/recovery/crossChainDerive.js` skeleton — `deriveCrossChainAccounts(seed, {network, chains, accountRange, gapLimit})` returning the `DerivedExternalAccount[]` shape from data-model.md; raw-private-key path returns single EVM + at most one BTC address, NOT scannable (FR-013). Contract test `frontend/src/test/recovery/crossChainDerive.contract.test.js`.
- [ ] T009 [P] Create `frontend/src/hooks/useCrossChainDiscovery.js` — runs per-chain discovery with progress + honest `scanning|complete|unreachable|unsupported-holdings` states (FR-014), never phantom-zero, never unreachable-as-zero; a slow chain never blocks others (SC-008). Test `frontend/src/test/hooks/useCrossChainDiscovery.test.jsx`.
- [ ] T010 [P] Add derived-account portfolio ledger namespacing (key includes `sourceLegacyAddress` so a derived account never collides with the passkey-derived wallet); unit test the namespacing.

**Checkpoint**: Effective-account seam + memory-only seed + discovery framework ready.

---

## Phase 3: User Story 1 — Acting account applies everywhere (P1) 🎯 MVP

**Goal**: Every money-and-identity surface honors the selected acting account.

**Independent Test**: With a vault/legacy account selected, portfolio, Receive, Request, Home
actions, and dashboard stats all resolve to it; switching to personal resets them (SC-001/002).

### Tests for User Story 1 (write first, must fail)

- [ ] T011 [P] [US1] Integration test `frontend/src/test/acting/portfolioActingAccount.test.jsx` — portfolio holdings follow the acting account (personal/vault/legacy).
- [X] T012 [P] [US1] Integration test `frontend/src/test/acting/requestActingAccount.test.jsx` — payment Request recipient equals the acting vault (not the connected wallet), with the receiving-account disclosure; personal resets. (Receive-QR + no-address-on-chain assertions still to add.)
- [ ] T013 [P] [US1] Integration test `frontend/src/test/acting/homeDashboardActingAccount.test.jsx` — Home actions + dashboard stats follow the acting account; switching to personal resets.

### Implementation for User Story 1

- [X] T014 [US1] Extend `frontend/src/hooks/usePortfolio.js` with a backward-compatible `{accountAddress}` override so acting-account surfaces scope to the selected account (personal passes none → byte-identical).
- [~] T015 [P] [US1] `frontend/src/components/wallet/PortfolioPanel.jsx` now sources from the effective account. (`usePredictPortfolio.js` still to wire.)
- [~] T016 [P] [US1] Receive in `frontend/src/components/wallet/WalletButton.jsx` AND `frontend/src/components/fairwins/Dashboard.jsx` pass the effective address to `AddressQRModal`. (Explicit "no address on this chain" disclosure for non-EVM-incapable accounts still to add.)
- [X] T017 [P] [US1] `frontend/src/components/fairwins/RequestPanel.jsx` addresses the request to the effective account and discloses the receiving account.
- [ ] T018 [P] [US1] Update Home/dashboard: `frontend/src/components/fairwins/HomeScreen.jsx`, `frontend/src/components/account/AccountDashboard.jsx` quick actions + stats follow the effective account.
- [ ] T019 [US1] Ensure switching the acting account re-targets/resets any open send/request form (FR-008) across the above surfaces.

**Checkpoint**: US1 fully functional — the displayed account is always the account that sends/receives.

---

## Phase 4: User Story 2 — Bitcoin hardware-wallet recovery (P2)

**Goal**: Discover + move BTC a legacy seed holds across BIP44/49/84/86 and multiple accounts.

**Independent Test**: A seed with BTC on non-default paths/accounts is discovered and totaled
correctly; a send broadcasts; the frozen passkey vectors still pass (SC-003, SC-007).

### Tests for User Story 2 (write first, must fail)

- [X] T020 [P] [US2] Vector test `frontend/src/lib/bitcoin/__tests__/legacyDerivation.test.js` — pinned addresses per purpose (BIP44 `1…`, BIP49 `3…`, BIP84 `bc1q…` + BIP86 `bc1p…` matching PUBLISHED spec vectors), account index >0, external/change chains, testnet prefixes, validation (13 tests).
- [X] T021 [P] [US2] Frozen-path guard: the legacy module is separate from `derivation.js`; the vector test asserts the `fairwins-btc-seed-v1` constant is unchanged and the existing `derivation.test.js` (23 tests) still passes untouched (SC-007).
- [ ] T022 [P] [US2] Integration test `frontend/src/test/bitcoin/legacyDiscoverySend.test.js` — account-level gap scan finds funded account >0; no-history mnemonic ⇒ "no funds found" (not phantom); send builds a valid tx with fee ceiling enforced (testnet/regtest).

### Implementation for User Story 2

- [X] T023 [US2] New additive `frontend/src/lib/bitcoin/legacyDerivation.js` — HKDF-free `seedFromMnemonic` + `deriveLegacyAccount`/`legacyAddressAt`/`legacySigningKeyAt` across BIP44/49/84/86 + account/chain indices; frozen `derivation.js` untouched (FR-019). Memory-only.
- [X] T024 [P] [US2] New additive `frontend/src/lib/bitcoin/legacyAddresses.js` — `encodeLegacyAddress` adds `p2pkh` (BIP44) + `p2sh-p2wpkh` (BIP49), delegates segwit/taproot to the frozen encoder (`@scure/btc-signer`).
- [ ] T025 [US2] Add account-level + address gap-limit scanning to the Bitcoin discovery path; wire into `crossChainDerive` (`bitcoin`) and `useCrossChainDiscovery`.
- [ ] T026 [US2] Wire the recovered BTC account into the portfolio (derived-account ledger namespace) and make it selectable as an acting account (Part A) so US1 surfaces show/send it; reuse existing UTXO/stamp fail-safe (FR-020), coin selection, PSBT sign, broadcast.
- [ ] T027 [US2] Raw-private-key path: expose the single BTC address, UI states it isn't scannable (FR-013).

**Checkpoint**: Bitcoin recovery + send working; frozen path proven unchanged.

---

## Phase 5: User Story 3 — Solana recovery (P3)

**Goal**: Derive, display, and send native SOL from a recovered seed.

**Independent Test**: Derived address matches the pinned vector; devnet balance shows; a native SOL
send submits.

### Tests for User Story 3 (write first, must fail)

- [ ] T028 [P] [US3] Vector test `frontend/src/test/solana/derivation.vectors.test.js` — zero mnemonic `m/44'/501'/0'/0'` → `HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk`, plus `m/44'/501'/0'` scheme guard; SLIP-0010 ed25519 hardened-only.
- [ ] T029 [P] [US3] Unit test `frontend/src/test/solana/address.test.js` — base58 encode (no checksum) + `isValidSolanaAddress` (32-byte decode, accepts off-curve destinations).
- [ ] T030 [P] [US3] Integration test `frontend/src/test/solana/discoverySend.test.js` — scan `bip44Change`/`bip44`/`bareSeed` with `getSignaturesForAddress` activity detection; native SOL send builds+submits on devnet with fee disclosure.

### Implementation for User Story 3

- [ ] T031 [P] [US3] Create `frontend/src/lib/solana/derivation.js` — SLIP-0010 ed25519 (`@noble/hashes` HMAC-SHA512 + `@noble/curves`, NOT `@scure/bip32`); schemes `bip44Change`/`bip44`/`bareSeed`.
- [ ] T032 [P] [US3] Create `frontend/src/lib/solana/address.js` — base58 (`@scure/base`, no checksum) + validation.
- [ ] T033 [US3] Create `frontend/src/lib/solana/rpc.js` (fetch JSON-RPC: getBalance, getSignaturesForAddress, getLatestBlockhash, sendTransaction, getSignatureStatuses) + `frontend/src/lib/solana/send.js` (`@solana/kit` message build + ed25519 sign).
- [ ] T034 [P] [US3] Create optional gateway proxy `services/relay-gateway/src/solana/` (`SOLANA_*` env, `POST /v1/solana/rpc`), public-endpoint fallback (never-stranded); honest hide/degrade when unset.
- [ ] T035 [US3] Wire Solana into `crossChainDerive`/discovery + portfolio derived account + acting-account select (US1 surfaces).

**Checkpoint**: Solana recovery + send working (devnet-validated).

---

## Phase 6: User Story 4 — Zcash transparent recovery (P4)

**Goal**: Derive, display, and send transparent ZEC; disclose shielded is out of scope.

**Independent Test**: t-address matches the pinned vector; balance via Blockbook; a transparent send
broadcasts — only after the ZIP-244 sighash passes vectors + the differential oracle.

### Tests for User Story 4 (write first, must fail)

- [ ] T036 [P] [US4] Vector test `frontend/src/test/zcash/derivation.vectors.test.js` — zero mnemonic `m/44'/133'/0'/0/0` → `t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F` (mainnet) + `tm…` testnet; 2-byte-prefix base58check.
- [ ] T037 [US4] **Sighash gate** `frontend/src/test/zcash/zip244.vectors.test.js` — official ZIP-244 transparent vectors AND a `@bitgo/utxo-lib` differential cross-check (identical sighash + serialization). This test MUST pass before any mainnet send path is enabled.
- [ ] T038 [P] [US4] Integration test `frontend/src/test/zcash/discoverySend.test.js` — gap-limit scan finds transparent funds; shielded-only ⇒ honest disclosure (FR-016); transparent send builds with live branch id + fee ceiling (testnet).

### Implementation for User Story 4

- [ ] T039 [P] [US4] Create `frontend/src/lib/zcash/derivation.js` (`m/44'/133'/a'/0/i`, `@scure/bip32`) + `frontend/src/lib/zcash/addresses.js` (`base58check` 2-byte prefix t-addr encode/decode).
- [ ] T040 [US4] Create `frontend/src/lib/zcash/tx.js` — v5 (NU5+) serializer + `frontend/src/lib/zcash/sighash.js` ZIP-244 transparent sighash (`@noble/hashes/blake2b`, personalization), **risk-quarantined**; ECDSA sign via `@noble/curves/secp256k1`. Branch id fetched live, never hardcoded.
- [ ] T041 [P] [US4] Create optional gateway proxy `services/relay-gateway/src/zcash/` (`ZCASH_*`, Blockbook REST: utxo/address/info(branchId)/sendtx); honest hide/degrade.
- [ ] T042 [US4] Wire Zcash into `crossChainDerive`/discovery + portfolio derived account + acting-account select; gate the send path behind T037 passing.

**Checkpoint**: Zcash transparent recovery + send working, sighash independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T043 [P] Security sweep for SC-005: automated scan asserting no seed/private key/xprv appears in storage, network payloads, logs, or the activity ledger across all chains; run `/security-review`.
- [ ] T044 [P] Accessibility pass (WCAG 2.1 AA, FR-023) on all new/changed surfaces; axe/lint clean.
- [ ] T045 [P] Docs: `docs/developer-guide/cross-chain-recovery.md` + gateway runbook updates (`docs/runbooks/`), note Monero deferral.
- [ ] T046 Run `quickstart.md` scenarios A–D end-to-end; confirm testnet/mainnet never mixed (FR-015).
- [ ] T047 Full `frontend` Vitest suite + eslint green; ensure the frozen BTC vectors (T021) remain untouched.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** blocks all stories.
- **US1 (P1)** depends only on Phase 2 (the effective-account seam) — the MVP; no derivation needed.
- **US2/US3/US4** depend on Phase 2 (memory-only seed + discovery framework) and surface through US1's
  acting-account wiring. They are independent of each other and can run in parallel after Phase 2.
- **Polish (Phase 7)** after the desired stories.

### Within each story
- Tests written first and FAIL before implementation (constitution II).
- Derivation/encoding (vector-gated) before discovery; discovery before send; send gated on fee
  ceiling + (Zcash) the sighash oracle.

### Parallel opportunities
- Setup T002/T003/T004; Foundational T005/T009/T010; per-story test tasks marked [P]; the three
  chain `lib/<chain>/` modules (US2/US3/US4) once Phase 2 is done.

---

## Implementation Strategy

- **MVP** = Phase 1 + Phase 2 + **US1** (acting account everywhere) — the fund-safety fix, shippable
  alone with no new chains.
- **Increment 2** = US2 Bitcoin (highest-value cross-chain, reuses the spec-061 stack).
- **Increment 3** = US3 Solana.
- **Increment 4** = US4 Zcash (transparent), with the sighash oracle gate before mainnet.
- Each increment is independently testable and deployable; deferred: Monero.

## Notes
- [P] = different files, no incomplete-task dependency. [US#] maps to spec.md stories.
- Commit after each task or logical group; never persist/log/transmit key material.
- The frozen passkey BTC derivation path is never modified — only extended additively (T023).
