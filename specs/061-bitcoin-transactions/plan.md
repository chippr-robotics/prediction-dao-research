# Implementation Plan: Bitcoin Transactions

**Branch**: `claude/fairwins-bitcoin-transactions-xy9ca5` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/061-bitcoin-transactions/spec.md`

## Summary

Give every passkey member a non-custodial Bitcoin wallet inside their existing
FairWins account: the BIP32 root is derived client-side from the spec-041
PRF-recoverable master seed (no new seed phrase), addresses rotate (BIP84
native-segwit default, BIP86 taproot opt-in), balances/UTXOs/fees/broadcast and
Stamps recognition flow through a new relay-gateway `bitcoin` proxy module
(mempool.space-style upstream, same shape as `src/polymarket/`), transactions
are built and signed client-side as PSBTs with stamps-aware coin selection, and
BTC shows up in the portfolio under the existing `BTC` baseline with the
already-configured Chainlink BTC/USD feeds. Bitcoin is the first non-EVM
network: it lives in a separate string-keyed registry (never a fake numeric
chainId) and self-discloses portfolio/send/receive as its only capabilities.

## Technical Context

**Language/Version**: JavaScript (ES2022) — React 18 + Vite frontend; Node 20
Express-style relay-gateway. No Solidity changes (no contracts on Bitcoin).

**Primary Dependencies**:
- Frontend: `@scure/btc-signer` + `@scure/bip32` (new — audited, zero-native-dep
  successors to the `@noble` family already in `frontend/package.json`; PSBT
  construction/signing for P2WPKH + P2TR, bech32/bech32m address codecs),
  existing `@noble/hashes` (HKDF), existing passkey PRF stack
  (`frontend/src/lib/passkey/prfKeys.js`).
- Gateway: no new runtime deps — the `bitcoin` module follows
  `services/relay-gateway/src/polymarket/` (fetch upstream + TTL cache +
  quotas). Upstreams: a mempool.space-compatible Esplora REST API
  (config-swappable base URL, e.g. self-hosted mempool/electrs later) and a
  Bitcoin Stamps indexer API (stampchain.io-compatible, config base URL).

**Storage**: No new server storage (gateway stays stateless: cache + quotas
in-memory as today). Client: rotation cursor, chosen address type, and issued-
address metadata persist via the existing client persistence used by wallet
preferences; the BIP32 account **xpubs never leave the client** and key
material is memory-only (derived on demand from the master seed).

**Testing**: Vitest for all frontend logic (derivation vectors, address
codecs/validation, coin selection incl. stamps protection, fee math, rotation/
recovery scan); node test runner for the gateway module (same harness as
`polymarket` tests) with mocked upstreams; BIP32/84/86 published test vectors
pinned in unit tests. No Hardhat/contract tests (no contract changes).

**Target Platform**: Existing frontend browser targets (WebAuthn PRF-capable
browsers for wallet availability) + the existing relay-gateway Node deployment.

**Project Type**: Web application (frontend + gateway service); config-driven.

**Performance Goals**: Receive surface shows an address in <2s after unlock
(SC-001 budget is 15s incl. the PRF ceremony); portfolio BTC line resolves
within the existing portfolio scan budget (balance endpoint batched: one
gateway call per 50 addresses); fee quotes cached ≤60s.

**Constraints**: Non-custodial — no key material, xpub, or descriptor is ever
sent to any service; gateway sees only bare addresses/txids and signed raw
transactions. Fail-safe Stamps handling (unknown ⇒ protected). Honest
degradation when upstreams are down (stale-marked portfolio, blocked sends
with reasons, never silent zeros). No gasless/sponsorship on the BTC path.

**Scale/Scope**: Frontend: 1 new lib area (`frontend/src/lib/bitcoin/`), 1 new
hook, additions to 4 existing surfaces (receive modal, send form, portfolio,
network capabilities) — ~15 new/changed frontend files. Gateway: 1 new module
(~5 files) + config/env + tests. Per-account address cardinality: bounded by
BIP44 gap-limit-20 discovery; balance queries batch across issued addresses.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-first contracts** — PASS (no `contracts/` changes; nothing
  deployed on-chain). The highest-risk surface here is client key handling and
  transaction construction, which this plan treats with contract-grade rigor:
  explicit derivation contract ([contracts/key-derivation-btc.md](./contracts/key-derivation-btc.md)),
  published-vector tests, fail-safe coin selection, and a security review pass
  (`.github/agents/`) over the key/signing code even though it is not Solidity.
- **II. Test-first** — PASS. Every pure module (derivation, codecs, selection,
  fees, rotation scan) lands with Vitest suites incl. BIP test vectors;
  gateway module lands with mocked-upstream route tests; failure/edge paths
  (degraded stamps indexer, stale fee quote, insufficient funds, checksum
  failures) are explicit acceptance scenarios in the spec.
- **III. Honest state** — PASS by design. Pending vs confirmed value split
  (FR-009), stale-marking on upstream failure (FR-010), fee re-confirmation on
  quote drift (FR-012), fail-safe stamps protection (FR-019), capability
  self-disclosure incl. the PRF/passkey availability gate (FR-020). No mocks in
  shipped paths; test upstreams live only in test fixtures.
- **IV. Fail loudly in CI** — PASS. New tests join the existing gating suites;
  no `continue-on-error`. Gateway boot fails loudly on malformed bitcoin config
  (mirroring the polymarket fee-cap boot check).
- **V. Accessible, consistent frontend** — PASS. New UI reuses the existing
  receive-modal/send-form/portfolio components and their a11y patterns; axe/
  Lighthouse stay gating. No hand-copied contract addresses (none exist here);
  all endpoints/config flow from `networks`-style config and env.
- **Additional constraints** — new core technology (`@scure/btc-signer`,
  `@scure/bip32`) justified below in Complexity Tracking; floppy-keystore
  remains the admin-key workflow and is untouched; no secrets in the repo
  (Stamps/Esplora upstreams are public APIs; any future API key is gateway
  env, documented in `.env.example`).

**Post-design re-check (after Phase 1)**: PASS — design artifacts introduce no
new violations; the only tracked complexity items remain the two new client
crypto libraries and the parallel non-EVM network registry, both justified.

## Project Structure

### Documentation (this feature)

```text
specs/061-bitcoin-transactions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── key-derivation-btc.md    # master seed → BIP32/84/86 derivation contract
│   ├── bitcoin-gateway-api.md   # /v1/bitcoin/* REST contract
│   └── network-registry.md      # non-EVM network registry + capability contract
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/bitcoin/
│   ├── derivation.js        # masterSeed → HKDF → BIP32 root → BIP84/BIP86 accounts
│   ├── addresses.js         # address encode/decode/validate (bech32, bech32m, base58check), BIP-21
│   ├── wallet.js            # rotation state, issued-address ledger, gap-limit recovery scan
│   ├── coinSelection.js     # stamps-aware UTXO selection, dust rules, fee math, MAX
│   ├── psbt.js              # PSBT build + sign (P2WPKH/P2TR inputs, all output types)
│   └── gatewayClient.js     # thin client for /v1/bitcoin/* (balances, utxos, fees, broadcast, stamps)
├── hooks/
│   └── useBitcoinWallet.js  # unlock/derive, balances, send pipeline, pending tracking
├── config/
│   ├── bitcoinNetworks.js   # NEW string-keyed non-EVM registry ('bitcoin', 'bitcoin-testnet')
│   ├── networks.js          # + capability surfacing hooks for non-EVM entries (display only)
│   └── assetTaxonomy.js     # + native BTC instance under the existing BTC baseline
├── hooks/usePortfolio.js    # + bitcoin balance source branch (non-EVM, non-ethers)
├── components/
│   ├── ui/AddressQRModal.jsx        # + Bitcoin receive mode (rotation, type toggle, BIP-21 QR)
│   ├── ui/AddressInput.jsx          # + Bitcoin destination validation path
│   ├── ui/QRScanner.jsx / lib/addressBook/scanAddress.js  # + bitcoin: URI parsing
│   └── wallet/TransferForm.jsx      # + BTC asset path (fee line, no gasless, pending states)
└── (collectibles surface)           # + Bitcoin Stamps section (spec 055 pattern)

services/relay-gateway/src/
├── bitcoin/
│   ├── client.js            # Esplora + Stamps upstream fetchers (timeout/retry)
│   ├── normalize.js         # upstream → DTOs (balances, utxos, fees, tx status, stamps)
│   ├── routes.js            # /v1/bitcoin/* (killswitch → validation → quota → cache → fetch)
│   └── cache.js             # TTL caches per endpoint class
├── config/index.js          # + bitcoin env block (upstream URLs, TTLs, quotas, killswitch)
└── server.js                # + createBitcoinRouter wiring

frontend/src/lib/bitcoin/__tests__/   # Vitest suites (vectors, selection, codecs, rotation)
services/relay-gateway/test/bitcoin.test.js  # mocked-upstream route tests
docs/developer-guide/bitcoin.md      # developer guide (mirrors predict-polymarket.md)
docs/runbooks/bitcoin-operations.md  # upstream swap, killswitch, quota ops
```

**Structure Decision**: Web-application split matching the repo: pure Bitcoin
logic isolated under `frontend/src/lib/bitcoin/` (unit-testable, no React), one
orchestration hook, minimal diffs inside existing surfaces; gateway follows the
established module-per-integration pattern (`polymarket`/`opensea` →
`bitcoin`). No new packages/workspaces.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New core client libs `@scure/btc-signer` + `@scure/bip32` | Bitcoin tx construction (PSBT, taproot sighash, bech32m) and BIP32 derivation are consensus-critical; hand-rolling them is the real risk | `bitcoinjs-lib` needs `tiny-secp256k1` (WASM/native) and is far heavier; hand-written derivation/signing would be an audit liability; scure libs are audited, tree-shakeable, and share the `@noble` primitives already shipped |
| Parallel string-keyed `bitcoinNetworks.js` registry beside numeric `NETWORKS` | Bitcoin has no EVM chainId; every `NETWORKS` consumer assumes wagmi-switchable numeric ids | Overloading a fake numeric id (e.g. 0 or 8332) into `NETWORKS` would ripple through every chainId consumer (wagmi switchChain, contracts.js, subgraph routing) and create dishonest "switch wallet to Bitcoin" affordances |
| New gateway upstream class (Esplora + Stamps indexer) | Balances/UTXOs/fees/broadcast/stamps don't exist on any current upstream; client-direct calls would leak member address sets to third parties without quotas/killswitch | Direct-from-browser upstream calls bypass the platform's quota/killswitch/cache layer and CORS-pin the product to one public provider |
