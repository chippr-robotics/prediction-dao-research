# Research: Bitcoin Transactions (spec 061)

Phase 0 output. Each entry: Decision / Rationale / Alternatives considered.
All Technical Context unknowns from plan.md are resolved here.

## R1. Bitcoin key material: derive from the spec-041 master seed

**Decision**: The Bitcoin wallet root is derived client-side from the existing
per-account master seed (`frontend/src/lib/passkey/prfKeys.js`):

```
masterSeed (32B, spec 041, PRF-recoverable)
  → HKDF-SHA256(salt = 32 zero bytes, info = "fairwins-btc-seed-v1", L = 64)
  → BIP32 root (via @scure/bip32 HDKey.fromMasterSeed)
  → account nodes m/84'/{coin}'/0' (native segwit) and m/86'/{coin}'/0' (taproot)
      coin = 0' mainnet, 1' testnet
```

Full normative detail in [contracts/key-derivation-btc.md](./contracts/key-derivation-btc.md).

**Rationale**: FR-001/FR-003 demand a deterministic, recoverable wallet with no
new backup artifact. The master seed already has exactly those properties: it is
recoverable on any device via a PRF ceremony, syncs to added controllers
(`wrapForController`), and is the documented root for "derived keys = existing
derivation stack fed from masterSeed". A domain-separated HKDF step guarantees
the Bitcoin tree can never collide with any other consumer of the seed, and the
64-byte output matches BIP32's recommended seed entropy.

**Consequences (documented honestly in UI/capabilities)**:
- The Bitcoin wallet is available exactly where the master seed is: passkey
  accounts on PRF-capable authenticators. Injected/WalletConnect EVM wallets
  and non-PRF authenticators get the honest capability-off state (same
  degradation model as spec-041 encrypted features). This is FR-020 territory,
  not a hidden limitation.
- Keys are memory-only; xpubs/descriptors never leave the client (gateway sees
  bare addresses only).

**Alternatives considered**:
- *New BIP39 mnemonic per member*: violates FR-001 (new backup artifact) and
  reintroduces the seed-phrase UX passkeys were adopted to remove.
- *Server-side or MPC custody*: violates FR-002 and the platform's
  non-custodial model; large new trust surface.
- *Derive from the passkey P-256 key directly*: WebAuthn signatures are
  non-deterministic and the P-256 private key is unextractable; PRF is the only
  deterministic exportable secret — and spec 041 already standardized routing
  it through the master seed.

## R2. Client Bitcoin library: @scure/btc-signer + @scure/bip32

**Decision**: Use `@scure/btc-signer` (PSBT construction/signing, P2WPKH +
P2TR spends, address codecs incl. bech32m) and `@scure/bip32` (HD derivation),
pinned exact versions.

**Rationale**: Audited (Cure53 lineage shared with `@noble`), zero native/WASM
dependencies (pure JS over `@noble/curves` secp256k1 — the frontend already
ships `@noble/curves`/`@noble/hashes`), small and tree-shakeable, supports
taproot key-path spends and BIP-341 sighash. Keeps the whole signing path
auditable JS in our bundle.

**Alternatives considered**:
- *bitcoinjs-lib + ecpair + tiny-secp256k1*: the floppy-keystore CLI uses it,
  but it drags a WASM secp256k1 into the browser bundle, is heavier, and its
  taproot support still leans on external ECC injection. Fine for a Node CLI,
  wrong fit for the Vite bundle.
- *bdk-wasm / rust WASM kits*: strongest engines but a new toolchain + large
  WASM payloads; unjustified for v1 scope (constitution: simplicity).

## R3. Non-EVM network representation: parallel string-keyed registry

**Decision**: New `frontend/src/config/bitcoinNetworks.js` exporting
`BITCOIN_NETWORKS` keyed by string ids `'bitcoin'` (mainnet) and
`'bitcoin-testnet'` (testnet4), each with name, address prefixes (`bc1`/`tb1`),
explorer (mempool.space URL patterns), capability set
(`{ portfolio, send, receive }` true; everything else false), and the
testnet/mainnet pairing. Numeric `NETWORKS` in `networks.js` is untouched;
network-listing surfaces (Network tab / capabilities panel) additionally render
non-EVM entries as display-only rows (no wagmi switchChain affordance — there
is no "switching your wallet to Bitcoin"). Contract resolution
(`getContractAddressForChain`) never sees these ids. Normative shape in
[contracts/network-registry.md](./contracts/network-registry.md).

**Rationale**: Every `NETWORKS` consumer assumes a numeric, wagmi-switchable
EVM chainId (provider construction, contracts.js, subgraph routing, chain
toggles). A fake numeric id would silently flow into those consumers; a
parallel registry makes non-EVM support explicit and type-checkable at each
integration point, and matches the honest-capability pattern (spec 048) for
networks that only do value transfer.

**Alternatives considered**: fake numeric chainId in `NETWORKS` (rejected —
ripple + dishonest switch affordances); CAIP-2 style rekeying of the whole
registry (rejected — repo-wide churn far beyond v1 scope).

## R4. Gateway module: Esplora-compatible upstream behind /v1/bitcoin/*

**Decision**: New `services/relay-gateway/src/bitcoin/` following the
`polymarket` module shape (`client.js` / `normalize.js` / `routes.js` /
`cache.js`), mounted as `/v1/bitcoin/*`:

- `POST /v1/bitcoin/:network/addresses` — batch balance + UTXO lookup for ≤50
  addresses per call (POST because address sets exceed URL limits).
- `GET  /v1/bitcoin/:network/fees` — recommended fee rates (fastest/normal/slow,
  sat/vB) + current tip height.
- `POST /v1/bitcoin/:network/tx` — broadcast raw signed tx (hex body).
- `GET  /v1/bitcoin/:network/tx/:txid` — confirmation status.
- `GET  /v1/bitcoin/:network/stamps?addresses=…` — Stamps holdings for
  addresses, with a `degraded` flag when the indexer is unreachable.

Upstreams are config-URL Esplora-compatible APIs (default
`https://mempool.space/api` and `/testnet4/api`; swappable to self-hosted
mempool/electrs) plus a stampchain.io-compatible Stamps indexer base URL.
Killswitch → param validation → per-IP+global quotas → TTL cache (fees 30s,
balances/UTXOs 15s, tx status 15s, stamps 5min) → normalize to DTOs. Boot
fails loudly on malformed bitcoin config; the module is optional — unset env
disables the routes and the frontend capability soft-fails (Bitcoin surfaces
hide/degrade honestly). Full contract in
[contracts/bitcoin-gateway-api.md](./contracts/bitcoin-gateway-api.md).

**Rationale**: Identical governance to existing external-data proxies (quotas,
killswitch, caching, no client-held keys), keeps member address-set queries off
third-party CORS endpoints, and lets ops swap to self-hosted infrastructure by
env change alone (runbook). Esplora is the de-facto REST standard (mempool.space,
blockstream.info, self-hosted electrs all speak it).

**Alternatives considered**: browser-direct mempool.space calls (rejected — no
quota/killswitch, leaks address sets, CORS fragility); running a full node +
custom indexer for v1 (rejected — heavy ops for no v1 functional gain; the
config-swappable upstream keeps that door open); WebSocket push for deposits
(deferred — polling within the existing portfolio refresh cadence satisfies
the spec; noted as future work).

## R5. Address rotation & recovery: BIP44 gap-limit discovery

**Decision**: Rotation is index-based on the external chain (`…/0/i`) of the
active account (BIP84 or BIP86 per member preference). A fresh receive shows
the lowest index never yet displayed; issued-address metadata (index, type,
first-shown) persists client-side via the existing wallet-preference
persistence (and rides spec-032 sync where available). Recovery never trusts
that cache: on unlock, the wallet runs standard gap-limit-20 discovery per
account chain against the gateway batch endpoint until 20 consecutive unused
addresses are seen, rebuilding the issued set and the rotation cursor
(`next = highest used index + 1`, never below the cached cursor). All
discovered-or-issued addresses are monitored forever (FR-005).

**Rationale**: FR-003/FR-004/FR-005 and SC-002/SC-006 exactly describe BIP44
discovery semantics; using the standard means external tooling (and any future
wallet-export feature) agrees with our view of funds. Cursor-never-decreases
prevents address reuse even when the local cache is stale.

**Alternatives considered**: server-side registry of issued addresses
(rejected — server learns the full wallet graph; client cache + deterministic
rescan achieves FR-003 without it); no look-ahead window (rejected — breaks
"sender pays an address far ahead" edge case and standard recovery).

## R6. Stamps recognition & protection: indexer + fail-safe coin policy

**Decision**: Stamps data comes from the gateway `stamps` endpoint (indexer-
backed). Coin selection classifies every UTXO as `spendable` only when (a) the
stamps lookup succeeded for its address set and (b) the UTXO is not referenced
by any Stamp *and* (c) it is not an obviously data-carrying output
(bare-multisig heuristic belt-and-braces). Anything else — stamp-bearing,
unverified because the indexer is degraded, or unconfirmed inbound — is
excluded from spendable balance and from selection. The UI shows
`total`, `pending`, and `protected` components so total ≠ spendable is always
explained (FR-018); degraded recognition surfaces a banner (FR-019). Stamps
render in the collectibles surface using the spec-055 section pattern with the
indexer's image/asset metadata.

**Rationale**: Stamps live in specific UTXOs (classic Stamps encode data in
bare multisig outputs; SRC-20 in the tx envelope) — spending the UTXO destroys
or transfers the asset. Only fail-safe classification satisfies the spec's
"prefer over-protection" edge case. Heuristics alone can't identify all Stamps
(hence indexer), and the indexer alone can be down (hence fail-safe default).

**Alternatives considered**: heuristics-only (misses indexer-known stamps on
clean-looking UTXOs); blocking all sends when the indexer is down (rejected —
worse availability than fail-safe exclusion, which keeps verified-clean coins
spendable... note: on *first* fetch failure nothing is verified, so sends block
with an honest reason — same outcome as spec scenario 4).

## R7. Transaction construction: PSBT, fee policy, dust, RBF

**Decision**:
- Inputs: P2WPKH and P2TR (our own UTXOs only). Outputs: any standard type —
  P2PKH, P2SH, P2WPKH/P2WSH (bech32 v0), P2TR (bech32m v1) — via
  `@scure/btc-signer` address codecs.
- Fee = selected rate (sat/vB from `/fees`, member picks normal by default) ×
  estimated vsize; quote pinned at confirm time with a freshness window (60s);
  a stale or upward-revised quote forces re-confirmation (FR-012). Fee shown in
  BTC + USD (existing BTC/USD price source).
- Coin selection: accumulative largest-first over spendable coins with change;
  MAX = sum(spendable) − fee(all-inputs tx, no change). Change below the dust
  threshold (546 sats legacy-equivalent; 330 sats for P2TR/P2WPKH outputs) is
  folded into the fee rather than creating dust (FR-013).
- RBF signaling on (sequence 0xfffffffd); v1 ships no fee-bump UI but
  broadcast-replaceability keeps the door open (documented).
- Concurrency: coins referenced by an in-flight (broadcast, unconfirmed) send
  are locked locally and excluded from selection (FR-014).
- Validation rejects wrong-network prefixes (`tb1`/`bcrt1` on mainnet and vice
  versa), bech32/bech32m checksum failures, EVM `0x` input, and unknown witness
  versions, each with a specific message (FR-011). BIP-21 `bitcoin:` URIs parse
  address + `amount` (FR-016).

**Rationale**: Matches the spec's fee-honesty and dust requirements with the
simplest selection algorithm that satisfies them; vsize estimation for
P2WPKH/P2TR inputs is deterministic enough for honest quotes (witness sizes are
fixed-bound), and folding sub-dust change into fees is standard practice.

**Alternatives considered**: branch-and-bound selection (better privacy/fees,
more complexity — deferred; selection is isolated in `coinSelection.js` so the
algorithm can be upgraded without surface changes); CPFP/RBF bump UI (deferred).

## R8. Portfolio & pricing integration

**Decision**: `assetTaxonomy.js` gains a native-Bitcoin instance under the
existing `BTC` baseline (`UNDERLYING_META.BTC` gets `homeNetwork: 'bitcoin'`),
kind `'btc-native'`, scoped to the new string network ids. `usePortfolio.js`
adds a bitcoin balance source alongside the EVM scan: when the member's
Bitcoin wallet is available (capability on + wallet unlocked or cached issued
addresses present), it calls the gateway batch endpoint and yields confirmed /
pending / protected components. Aggregation reuses the existing native+wrapped
roll-up so native BTC and WBTC form one "Bitcoin" row (spec scenario 2).
Pricing reuses the already-configured Chainlink BTC/USD feeds
(`priceFeeds.js`: chains 1 & 137) keyed by underlying `BTC` — zero new price
infrastructure. Unreachable balance source ⇒ the position renders stale/
unavailable, never zero (FR-010).

**Rationale**: The taxonomy/price layers were explicitly built with BTC as a
baseline underlying; this is the designed seam. Balance-source branching in
`usePortfolio` keeps EVM code paths untouched (FR-022/SC-008).

**Alternatives considered**: separate Bitcoin portfolio panel (rejected —
violates the one-portfolio aggregation UX and duplicates pricing).

## R9. Bitcoin test network: testnet4

**Decision**: `'bitcoin-testnet'` = **testnet4** (mempool.space
`/testnet4/api`), paired with `'bitcoin'` mainnet under the existing
testnet/mainnet toggle semantics (FR-021). Address prefixes `tb1…` (same as
testnet3 — codecs unchanged), coin type 1'.

**Rationale**: testnet3 is deprecated/reset-prone and faucet-hostile since
2024; testnet4 is the maintained successor with public Esplora endpoints.
Signet was considered but testnet4 has broader faucet/explorer support and
matches the "one public test network" scope in the spec assumptions.

**Alternatives considered**: signet (viable fallback — one env URL swap away);
regtest (dev-only; not a shared testnet for QA flows).

## R10. Where Bitcoin appears (and does not)

**Decision**: Surfaces gaining Bitcoin: receive (AddressQRModal Bitcoin mode),
send (TransferForm asset entry + AddressInput/QRScanner validation), portfolio
(+ collectibles for Stamps), network capability listing, activity (send/receive
entries with pending states). Surfaces explicitly untouched: wager/pool/
membership creation, swap, earn, predict, gasless/relayer, callsigns, address
book EVM validation (address book may store BTC addresses only if it already
supports free-form entries — otherwise deferred and documented). The BTC send
path never touches `useTransfer`'s EVM routing table; it is a parallel
`useBitcoinWallet.send` pipeline so the never-stranded EVM logic stays intact.

**Rationale**: FR-020/FR-022 — additive integration, zero regression surface.
