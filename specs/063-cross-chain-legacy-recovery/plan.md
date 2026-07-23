# Implementation Plan: Universal Acting-Account + Cross-Chain Legacy Recovery

**Branch**: `claude/account-recovery-sheets-6x10c5` (feature dir `063-cross-chain-legacy-recovery`) | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/063-cross-chain-legacy-recovery/spec.md`

## Summary

Two connected capabilities. **Part A**: make the existing shared "acting account" selection
(personal / vault / recovered-legacy) authoritative on *every* money-and-identity surface —
portfolio, Home actions, Receive address/QR, payment Requests, dashboard stats — not just Transfer
and Trade, so the displayed account is always the account that receives and sends. **Part B**: from
a recovered BIP-39 seed, derive keys for the other chains that seed controls — Bitcoin (full
hardware-wallet scan: BIP44/49/84/86 across multiple accounts, gap-limit discovery), Solana, and
Zcash (transparent) — surface each discovered balance as a derived, selectable acting account, and
let members send those funds. Technical approach: extend the `useActiveAccount` seam with an
effective-address per surface; add an **additive, HKDF-free** legacy seed entry point that leaves the
frozen passkey Bitcoin derivation untouched; add two net-new non-EVM wallet modules (Solana, Zcash)
built on the existing `@noble`/`@scure` primitives, each fronted by an optional relay-gateway proxy
with honest degradation. All key material stays in memory; gateways see only public addresses and
signed txs. **Monero is deferred** to a follow-up spec (its view-key-scanning privacy tension and
10 MB WASM signer are out of scope here), which removes the only FR-021 conflict from this feature.

## Technical Context

**Language/Version**: JavaScript (ES2022) / React 19 + Vite; Node services for the gateway.

**Primary Dependencies**: Existing — `ethers` v6, `@noble/hashes`, `@noble/curves`, `@scure/bip32`,
`@scure/bip39`, `@scure/base`, `@scure/btc-signer`. New — `@solana/kit` (Solana tx/RPC);
`@bitgo/utxo-lib` **test-only** (Zcash sighash differential oracle); optionally `micro-ed25519-hdkey`
(Solana SLIP-0010 if not hand-rolled). Promote transitive `@scure/bip39` + `@scure/base` to direct
deps. *(Monero deps deferred with Monero.)*

**Storage**: Browser userStorage (encrypted-at-rest recovery entries — reuse
`legacyRecoveredKeysStore`). New: per-chain derived-account ledger namespaces (public addresses +
balances only; keyed to include the source legacy address). No key material persisted.

**Testing**: Vitest (frontend). Unit: derivation vectors per chain/scheme, address encoding,
sighash vectors. Integration: acting-account propagation across surfaces; per-chain
discover→display→send against testnets/devnet/regtest where available.

**Target Platform**: Browsers (desktop + mobile web), same as the existing SPA.

**Project Type**: Web application (frontend SPA + optional Node relay-gateway). No smart contracts.

**Performance Goals**: Discovery communicates progress and completes for a typical multi-account
seed within a bounded, disclosed window; a slow/unreachable single chain never blocks others
(SC-008). Acting-account switches update surfaces with no reload (FR-008).

**Constraints**: Key material memory-only, never persisted-clear/logged/transmitted (FR-017/018);
the frozen passkey BTC derivation path is byte-for-byte unchanged (FR-019, SC-007); fail-safe UTXO
handling (FR-020); gateways receive only public addresses + signed txs (FR-021 — no exceptions now
that Monero is deferred); honest fee disclosure + hard fee ceiling (FR-012); testnet/mainnet never
mixed (FR-015); WCAG 2.1 AA (FR-023). Vite: prefer no node polyfills (drives `@solana/kit` over
web3.js v1).

**Scale/Scope**: 3 chains (1 extended + 2 net-new), 4 prioritized user stories, client-side only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First Smart Contracts | **N/A** | No `contracts/` changes — client-side + gateway only. |
| II. Test-First & Comprehensive Coverage | **PASS (planned)** | Every derivation/encoding path is vector-first; the Zcash sighash is gated on official ZIP-244 vectors + a differential oracle before mainnet; acting-account propagation and per-chain discover/send are integration-tested. Tests land with behavior. |
| III. Honest State, No Mocks in Shipped Paths | **PASS (planned)** | Discovery distinguishes "nothing found" from "unreachable" (FR-014); no phantom accounts; fee/finality disclosed truthfully; testnet/mainnet scoped (FR-015). Gateways optional and degrade honestly (spec-061 pattern). |
| IV. Fail Loudly in CI | **PASS (planned)** | Lint/test/build gate the pipeline; no `continue-on-error` on them. New chain modules ship with green vectors. |
| V. Accessible, Consistent Frontend | **PASS (planned)** | New surfaces meet WCAG 2.1 AA; ESLint errors block; network/address config comes from typed config modules, not hardcoded. |
| Key management (Additional Constraints) | **PASS (planned)** | Secrets/derived keys memory-only; only ciphertext persisted; audit records carry no key material (FR-022). With Monero deferred, gateways receive only public addresses + signed txs — no view-key exception. |
| New core technology justification | **NEEDS JUSTIFICATION → see Complexity Tracking** | `@solana/kit` and `@bitgo/utxo-lib` (test-only) are new libs. |
| Spec→Plan→Tasks→Implement | **PASS** | Feature flowed through the full Spec Kit workflow (spec-first, per direction). |

**Gate result**: PASS to proceed to design, with the new-dependency justifications recorded in
Complexity Tracking. With Monero deferred, no constitution/FR tension remains open.

## Project Structure

### Documentation (this feature)

```text
specs/063-cross-chain-legacy-recovery/
├── plan.md              # This file
├── research.md          # Phase 0 (done)
├── data-model.md        # Phase 1 (done)
├── quickstart.md        # Phase 1 (done)
├── contracts/           # Phase 1 (done) — derivation + gateway interface contracts
│   ├── derivation-contracts.md
│   └── gateway-endpoints.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   ├── solanaNetworks.js         # NEW string-id networks + isSolanaNetworkId
│   └── zcashNetworks.js          # NEW  (moneroNetworks.js deferred)
├── lib/
│   ├── recovery/
│   │   ├── legacyKeys.js         # EXTEND: expose recovered mnemonic → seed (memory-only)
│   │   └── crossChainDerive.js   # NEW: seed → {btc, solana, zcash} accounts (additive)
│   ├── bitcoin/
│   │   ├── derivation.js         # EXTEND (additive): HKDF-free seed entry + BIP44/49 purposes + account scan
│   │   └── addresses.js          # EXTEND: p2pkh / p2sh-p2wpkh encoders
│   ├── solana/                   # NEW: derive, address, balance(RPC), send(@solana/kit)
│   └── zcash/                    # NEW: derive, taddr, UTXO, v5 tx + ZIP-244 sighash (risk-quarantined)
│                                 # (monero/ deferred to a follow-up spec)
├── hooks/
│   ├── useActiveAccount.js       # (unchanged seam; consumed more widely)
│   ├── useEffectiveAccount.js    # NEW: per-surface effective address + capability
│   ├── usePortfolio.js           # EXTEND: honor acting account (address override / useAccountAssets)
│   ├── useLegacyAccounts.js      # EXTEND: include derived cross-chain accounts
│   └── useCrossChainDiscovery.js # NEW: run per-chain discovery, progress + honest states
└── components/
    ├── wallet/ (PortfolioPanel, RequestPanel, AddressQRModal callers)  # EXTEND to acting account
    ├── fairwins/ (HomeScreen, Dashboard, AccountDashboard)             # EXTEND stats/actions
    └── account/ (recovery panel, AccountSwitcher)                      # EXTEND: show derived accounts

services/relay-gateway/src/
├── solana/     # NEW optional RPC proxy (SOLANA_* env)
└── zcash/      # NEW optional Blockbook/lightwalletd proxy (ZCASH_* env)
                # (monero-lws/ deferred with Monero)
```

**Structure Decision**: Web-application layout. Part A is edits to existing hooks/components around
the established `useActiveAccount` seam. Part B adds isolated per-chain `lib/<chain>/` modules for
Solana and Zcash (mirroring `lib/bitcoin/`) plus optional gateway proxy modules (mirroring
`services/relay-gateway/src/bitcoin/`). The frozen Bitcoin derivation path is extended only
additively. Monero is deferred to a follow-up spec.

## Complexity Tracking

| Violation / Risk | Why Needed | Simpler Alternative Rejected Because |
|------------------|------------|--------------------------------------|
| New dep `@solana/kit` | Correct Solana tx wire format (compact-u16, blockhash lifetime, base64) is error-prone to hand-roll | `@solana/web3.js` v1 needs Buffer/bn.js node polyfills (against Vite/no-polyfill posture); hand-rolling risks malformed txs |
| Hand-rolled Zcash **ZIP-244 sighash** | `@scure/btc-signer` has no Zcash support; transparent-only makes it tractable | `@bitgo/utxo-lib` as the shipping signer is heavier + foreign to `@scure`; kept as a **test-only oracle** to validate the hand-rolled path instead |
| `@bitgo/utxo-lib` (test-only) | Differential cross-check of the Zcash sighash before mainnet | Trusting a hand-rolled sighash without an independent oracle is unacceptable for a fund-moving path |

*(The earlier Monero view-key/FR-021 tension is removed — Monero is deferred to a follow-up spec, so
this feature keeps the "gateways see only public addresses + signed txs" rule with no exception.)*

## Remaining scope confirmations

1. **Monero — deferred** to its own follow-up spec (view-key privacy decision + WASM signer). The
   research is retained in `research.md` for that spec.
2. **Zcash sighash validation is a hard CI gate**: the hand-rolled ZIP-244 transparent sighash must
   pass the official vectors AND a `@bitgo/utxo-lib` differential check before any mainnet path is
   enabled (encoded as a blocking task).
3. **Solana SPL tokens / Zcash shielded**: out of scope this version (native SOL only; transparent
   ZEC only) — disclosed at runtime (FR-016), candidates for a later spec.
