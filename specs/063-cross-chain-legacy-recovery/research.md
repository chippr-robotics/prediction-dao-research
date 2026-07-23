# Research: Universal Acting-Account + Cross-Chain Legacy Recovery

**Feature**: 063 | **Date**: 2026-07-23 | **Phase**: 0 (Outline & Research)

This document resolves the technical unknowns for deriving and operating Bitcoin, Solana,
Zcash (transparent), and Monero from a recovered BIP-39 seed, and for extending the shared
"acting account" seam to every surface. Decisions favor the existing `@noble`/`@scure` stack
and the spec-061 Bitcoin "optional gateway, honest degradation, never-stranded" pattern.

---

## A. Universal acting-account (Part A) — no new tech

**Decision**: Reuse the existing `useActiveAccount()` / `CustodyContext` seam. Introduce one
derived value — an **effective account address** (per surface) — computed exactly like
`DexContext.tradingAddress` and `TransferForm.actingAddress`:
`vault ? identity.vaultAddress : legacy/derived ? identity.address : connectedAddress`.

**Surfaces to convert** (each currently hardcodes the connected wallet — mapped in exploration):
- Portfolio: `usePortfolio` (add an optional `accountAddress` override, or select
  `useAccountAssets(actingAddress)` when acting) and `PortfolioPanel`; `usePredictPortfolio`.
- Receive: `AddressQRModal` callers — `WalletButton`, `Dashboard` — pass the acting address.
- Request: `RequestPanel` addresses the request to the acting account.
- Home/dashboard stats: `AccountDashboard` / `Dashboard` figures follow the acting account.

**Rationale**: The pattern is already proven in Transfer/Trade; this is wiring, not new
architecture. **Alternatives considered**: a brand-new "view-as" context (rejected — duplicates
the existing seam); pushing address as a prop through every tree (rejected — the context already
carries it).

**Key guard**: when the acting account has no address on a chain (a Safe vault has no BTC
address), the surface discloses "no address for this account on this chain" — never falls back
to another account (FR-007).

---

## B. Bitcoin — full hardware-wallet scan (US2)

**Decision**: Add an **additive, HKDF-free seed entry point** alongside the frozen passkey path.
The frozen path (`deriveBtcSeed` + `fairwins-btc-seed-v1`, BIP84/86, account 0) is untouched
(FR-019, SC-007). New: `HDKey.fromMasterSeed(bip39Seed)` where
`bip39Seed = ethers.Mnemonic.fromPhrase(phrase).computeSeed()` (or `@scure/bip39` mnemonicToSeed),
then derive per purpose/account.

**Derivation matrix to scan** (per account index `a = 0..N`, gap limit 20 on external chain
`/0/i`, include change `/1/i` in balance/spend accounting):
- BIP44 P2PKH `m/44'/0'/a'/0/i` → `1…`
- BIP49 P2SH-P2WPKH `m/49'/0'/a'/0/i` → `3…`
- BIP84 P2WPKH `m/84'/0'/a'/0/i` → `bc1q…`
- BIP86 P2TR `m/86'/0'/a'/0/i` → `bc1p…`
Account-level gap: stop after 1–2 consecutive empty accounts.

**New encoders needed**: `@scure/btc-signer` provides `p2wpkh`/`p2tr` (used today) and also
`p2pkh` and `p2sh(p2wpkh(...))` — so BIP44/BIP49 address encoding is available in the existing
lib; only the derivation-path expansion and account scanning are new. Reuse existing UTXO/stamp
handling, coin selection, PSBT signing, send/broadcast, and the gateway client unchanged.

**Rationale**: Bitcoin is the dominant hardware-wallet holding; reusing spec-061's stack keeps
the new surface small. **Alternatives**: bitcoinjs-lib (rejected — foreign to the `@scure` stack,
larger); deriving only BIP84/86 (rejected — misses legacy/hardware funds, the whole point).

**Fail-safe (FR-020)**: keep the existing "spendable only when positively verified stamp-free"
rule for every legacy-derived UTXO.

**Test vectors**: pin the canonical zero-mnemonic → address per purpose (BIP84/86 already pinned
by the frozen vectors; add BIP44/49 vectors; cross-check against iancoleman/BIP-standard).

---

## C. Solana (US3)

**Decision**: Derive with **SLIP-0010 ed25519** (hardened-only) using `@noble/hashes` HMAC-SHA512
+ `@noble/curves` ed25519 (both present) — or the tiny `micro-ed25519-hdkey` (deps: `@noble/hashes`
+ `@scure/base`). **Do NOT use `@scure/bip32`** (secp256k1 — wrong keys). Address = `base58` of the
raw 32-byte pubkey (`@scure/base`, **no checksum**). Build/sign/submit native SOL transfers with
**`@solana/kit`** (v2, tree-shakeable ESM, no `Buffer`/`bn.js` — Vite-clean); avoid `@solana/web3.js`
v1 (needs node polyfills). Read via plain `fetch` JSON-RPC.

**Coin type 501.** Scan schemes (cover what real wallets use):
- `m/44'/501'/i'/0'` (Phantom/Solflare default) and `m/44'/501'/i'` (Ledger) for `i = 0..N`.
- bare-seed `Keypair.fromSeed(seed[0:32])` (solana-cli/paper), derived once.
- Detect activity with `getSignaturesForAddress` (not just `getBalance` — finds emptied accounts);
  gap ~20 empty accounts.

**Data source**: route RPC through the **relay-gateway** (`SOLANA_*` env, parallel to `bitcoin/`),
public `api.mainnet-beta.solana.com` as never-stranded fallback; devnet + `solana-test-validator`
for tests.

**Pinned vector** (zero mnemonic, `m/44'/501'/0'/0'`): `HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk`
(also pin `m/44'/501'/0'` → `GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL` to guard scheme confusion).

**Rationale**: keypair + address need no heavy SDK; `@solana/kit` earns its place only for
compact-u16/blockhash/base64 tx assembly. **Alternatives**: `@solana/web3.js` v1 (rejected —
Buffer/bn.js polyfills); hand-rolling tx wire format (rejected — error-prone compact-u16/header).

---

## D. Zcash — transparent only (US4)

**Decision**: Derive BIP44 `m/44'/133'/a'/0/i` (coin type 133) with `@scure/bip32` (secp256k1,
P2PKH — Bitcoin-shaped). Encode t-addresses with `@scure/base` `base58check(sha256)` over a
**two-byte** version prefix + hash160 (verified working with repo libs). Mainnet P2PKH prefix
`0x1CB8` (`t1…`); testnet `0x1D25` (`tm…`).

**The risk center — transaction signing**: `@scure/btc-signer` does **not** support Zcash (no
`nVersionGroupId`/`nConsensusBranchId`/BLAKE2b sighash). Build a small, well-tested Zcash module:
v5 (NU5+) tx serializer + **ZIP-244 transparent sighash** using `@noble/hashes/blake2b` (confirmed
it supports the required 16-byte personalization + `dkLen:32`). Transparent-only collapses the
digest tree (sapling/orchard digests are fixed empty-bundle hashes), so only `header_digest` +
`transparent_digest` are implemented. **`nConsensusBranchId` MUST be fetched live** (lightwalletd
`GetLightdInfo` or explorer) — never hardcoded (a hardcoded branch id breaks at the next network
upgrade). ECDSA signing via `@noble/curves/secp256k1` (present).

**Validation gate (non-negotiable)**: the sighash MUST pass the official `zcash/zips` +
`zip244.py` vectors AND a differential cross-check against an independent implementation
(`@bitgo/utxo-lib` as an oracle, or a regtest node) before it touches mainnet.

**Data source**: Blockbook REST (UTXO/balance/broadcast) proxied through the relay-gateway
(`zcash/` module, parallel to `bitcoin/`); lightwalletd optional (only if we run/proxy gRPC-web).
No shielded scanning anywhere.

**Scan**: gap-limit-20 external chain `/0/i`, accounts 0..N (account gap ~1–2). Support testnet
coin type **1** and **133** (wallets diverge on testnet).

**Pinned vector** (zero mnemonic, `m/44'/133'/0'/0/0`, mainnet): `t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F`.

**Rationale**: transparent-only removes the hard shielded crypto; the residual risk is exactly one
module (the sighash), quarantined and vector-gated. **Alternatives**: `@bitgo/utxo-lib` as the
shipping signer (kept as fallback/oracle — heavier, foreign to `@scure`); shielded support
(explicitly out of scope this version, FR-016).

---

## E. Monero (US5) — heaviest, phased, with a spec decision required

**Decision**: **Phase Monero into two deliverables** (matches its P5 priority):
- **Phase 1 (view + balance, no WASM)**: derive the primary address + private view key with
  `@noble/curves` ed25519 + `@noble/hashes` keccak_256 + a ~50-line Monero base58 (block-based, NOT
  Bitcoin base58). Show balance via a **mymonero-compatible Light Wallet Server (LWS)**.
- **Phase 2 (send, follow-up)**: client-side RingCT/CLSAG signing via `mymonero-core` / `monero-ts`
  **WASM (~10 MB)**. Not hand-rollable.

**Derivation** (coin type 128): BIP-32/44 node at `m/44'/128'/a'/0'/0'` → `sc_reduce32(Keccak256(node))`
= private spend key; view key = `sc_reduce32(Keccak256(spend))`; public keys = scalar·G. **There is
NO single canonical BIP-39→Monero scheme** (iancoleman/Coinomi Keccak+sc_reduce vs. SLIP-0010 ed25519
variants; Ledger derives on-device). Mitigation: derive under both known conventions and probe each
for activity before presenting one; **pin a real mnemonic→address vector per origin-wallet convention
we claim to support** (a passing iancoleman vector does NOT prove Ledger). Address = Monero base58 of
`prefix(0x12 mainnet) || pubSpend || pubView || Keccak256(...)[0:4]` (95 chars).

**⚠ FR-021 CONFLICT (requires an explicit spec decision)**: Monero has no address-balance RPC;
reading a balance requires transmitting the **private view key** to a scanner. This contradicts
FR-021 as written ("external sources receive only public addresses + signed txs, never private
keys"). The view key cannot spend (funds stay safe) but is a confidentiality leak. Two resolutions:
- **(Recommended) Self-host the LWS behind the relay-gateway** (first-party infra) and carve a
  documented FR-021 exception for the view key, with honest member disclosure ("your view key is
  shared with FairWins' scanner to read your balance; it cannot move funds").
- **monero-ts WASM view-only wallet** so the view key never leaves the device — satisfies FR-021
  strictly, at 10 MB + slow-sync (restore-height unknown for legacy seeds) cost.
This is the single biggest open decision for US5 and is escalated to `/speckit-clarify`.

**⚠ Repo hazard**: `.claude/skills/floppy-keystore/scripts/chains.js#deriveMoneroKeys` uses a
**non-standard, wrong** scheme (SLIP-0010 bit-clamping instead of `sc_reduce32`). Do NOT reuse it.

**Rationale**: Phase-1 keeps the display path pure-JS and small; sending's WASM cost is deferred.
**Alternatives**: full scan+send in one shot (rejected — 10 MB WASM + high CLSAG risk for the least
common holding); native 25-word Monero seed import instead of BIP-39 (out of scope — the source is a
recovered BIP-39 seed).

---

## F. Cross-cutting decisions

- **Non-EVM network identity**: each new chain is a **string id** (`'solana'`, `'zcash'`, `'monero'`
  + testnet ids) in a config parallel to the numeric `NETWORKS` map, guarded by an `isXNetworkId`
  boundary (mirrors `bitcoinNetworks.js` / `isBitcoinNetworkId`). String ids MUST NEVER reach
  `getContractAddressForChain`/wagmi/subgraph code.
- **Key-material lifecycle (FR-017/018)**: derived seeds/keys are memory-only, held in
  non-reactive session internals (mirror `useBitcoinWallet` internals), dropped on lock/relock,
  account switch, and disconnect. Only the original secret's ciphertext is persisted. Nothing
  key-bearing enters logs or the activity ledger (audit records address/chain/time only).
- **Gateway trust boundary (FR-021)**: gateways receive only public addresses + signed raw txs
  (Monero view key is the sole, escalated exception above).
- **Derived-account portfolio surfacing**: each discovered non-EVM balance surfaces as a derived
  account in the portfolio (its own ledger namespace, keyed to include the source legacy address so
  it never collides with the passkey-derived wallet) and is selectable as an acting account (Part A).
- **Discovery states (FR-014)**: distinguish "scanned to gap limit, nothing" from "source
  unreachable"; never a phantom zero account, never an unreachable-as-zero.
- **Testnet scoping (FR-015)**: derivation + discovery honor the app's testnet/mainnet mode; never
  mix balances.

---

## G. Dependency summary

Already present (promote transitive `@scure/bip39`, `@scure/base` to direct deps):
`ethers`, `@noble/hashes`, `@noble/curves`, `@scure/bip32`, `@scure/bip39`, `@scure/base`,
`@scure/btc-signer`.

New (justify in plan under Additional Constraints — new core tech):
- `@solana/kit` (Solana tx assembly/RPC; tree-shakeable, no polyfills).
- `micro-ed25519-hdkey` *(optional — only if not hand-rolling SLIP-0010)*.
- `@mymonero/mymonero-lws-client` (Monero balance, Phase 1) and later `mymonero-core`/`monero-ts`
  WASM (Monero send, Phase 2).
- `@bitgo/utxo-lib` *(test/oracle only — differential check for the Zcash sighash; not shipped)*.

Gateway (`services/relay-gateway`) gains optional per-chain proxy modules (`solana/`, `zcash/`,
`monero-lws/`) mirroring `bitcoin/`, each honestly hiding/degrading when unconfigured.
