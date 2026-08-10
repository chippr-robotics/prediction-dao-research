# Security Review: Bitcoin Transactions (spec 061, task T040)

**Date**: 2026-07-20 · **Scope**: `frontend/src/lib/bitcoin/*`,
`frontend/src/config/bitcoinNetworks.js`, `frontend/src/hooks/useBitcoinWallet.js`,
`services/relay-gateway/src/bitcoin/*` + config/server wiring · **Method**:
line-by-line review of the key-handling/signing/selection paths against the
constitution (principle I applied at contract-grade rigor to this non-Solidity
value path), the spec-061 contracts, and the invariant test suites; behaviors
cross-checked against the 141 frontend + 44 gateway tests added by this spec.

## Findings

| # | Severity | Location | Finding | Status |
|---|----------|----------|---------|--------|
| 1 | medium (fixed in-flight) | `frontend/src/config/networkCapabilities.js` | `getNetworkFeatures` resolved unknown ids through `getNetwork`'s default-network fallback, so bitcoin string ids reported Polygon's swap/ClearPath capabilities as available — a network-registry rule-1 leak (dishonest capability, no fund risk). Guarded with `isBitcoinNetworkId`; pinned by `bitcoinNetworkGuards.test.js`. | fixed |
| 2 | medium (fixed in-flight) | `frontend/src/components/wallet/TransferForm.jsx` | The asset dropdown received the raw EVM `quoteGaslessForAsset`, which could render a gasless marker on the Bitcoin row for passkey users (FR-015 violation — dishonest fee claim, no fund risk). Wrapped so `btc-native` options are always fee-paying; pinned by `TransferForm.bitcoin.test.jsx`. | fixed |
| 3 | low | `frontend/src/lib/bitcoin/wallet.js` (`ledgerStore`) | The issued-address ledger lives in client storage unauthenticated: local tampering could inject an attacker address that the UI then displays as a past receive address. Requires an already-compromised browser profile (at which point the DOM itself is attacker-controlled), and the rotation cursor never decreases, so funds at real addresses are unaffected; discovery rebuilds honest state from chain data. Accepted for v1; hardening option: MAC ledger entries under a PRF-derived key. | accepted |
| 4 | low | `services/relay-gateway/src/bitcoin/routes.js` | Server-side address validation is prefix/charset/length sanity only (documented); a syntactically-plausible-but-invalid address reaches the upstream as a lookup for a nonexistent address. No SSRF surface (the address is path/query data against a fixed config base URL, URL-encoded); cost bounded by quotas + ≤50 batch cap. Accepted — full checksum validation is client-side by design. | accepted |
| 5 | info | `frontend/src/lib/bitcoin/psbt.js` | BIP-340 aux randomness makes taproot witnesses non-deterministic across retries of the same plan; txid is unaffected. No security impact; noted so retry logic never assumes byte-identical raw transactions. | noted |
| 6 | info | `frontend/src/hooks/useBitcoinWallet.js` | JS cannot guarantee zeroization; seed/account refs are nulled on lock/account-change but copies may persist until GC. Inherent to the platform (same posture as the spec-041 PRF stack). | noted |

No critical or high findings. Findings 1–2 were caught by this spec's own
guard-rail/honesty test tasks during implementation and are fixed and pinned in
the committed test suites.

## Invariants verified (positive observations)

- **Key confinement**: `deriveBtcSeed`/`deriveAccount`/`receivePrivkey` never
  persist, log, or transmit key material; the gateway client sends bare
  addresses (≤50/batch) and signed raw hex only — no xpub/descriptor ever
  leaves the client (contract inv. 3–4; grep + call-graph verified).
- **Domain separation**: HKDF info `fairwins-btc-seed-v1` is exclusive; the
  derivation test suite proves the BTC tree differs from the spec-041 KEK path
  and pins BIP84/86 reference vectors plus FairWins fixture vectors.
- **No wrong keys**: non-PRF/uninitialized credentials surface `unavailable`;
  wrong-length seeds throw (never a silently different wallet).
- **Fail-safe stamps**: coin selection only ever spends `spendable`-classified,
  unlocked coins; degraded recognition ⇒ `unverified` ⇒ excluded, tested at
  every selection path incl. MAX (FR-018/019).
- **Fee ceiling**: the member-confirmed fee is enforced twice — plan-level and
  `buildAndSignTx`'s `FeeOverrunError` refusal before any signature; quotes
  expire in 60s with forced re-confirmation (FR-012).
- **Dust + conservation**: selection tests assert exact sats conservation
  (inputs = amount + fee + change), sub-dust change folded into the fee, and
  no dust outputs ever produced.
- **Double-spend locks**: in-flight outpoints are excluded from selection and
  released only on confirm/abandon (FR-014).
- **Wrong-network rejection**: bech32 HRP + base58 version checks reject
  cross-network destinations with an explicit reason at both prepare and
  psbt (network-typed `addOutputAddress`) layers.
- **Gateway governance**: killswitch → enabled → validation → quota → cache
  ordering verified by route tests; broadcasts never retried (a timed-out
  broadcast may have propagated); boot fails loudly on malformed `BTC_*`
  config; upstream failures map to 502 and the client renders stale-not-zero.
- **Non-EVM containment**: `isBitcoinNetworkId` guards pinned by tests at
  `getContractAddressForChain`, portfolio scan, selectable networks, and
  capability resolution — no bitcoin id reaches EVM-typed code.
