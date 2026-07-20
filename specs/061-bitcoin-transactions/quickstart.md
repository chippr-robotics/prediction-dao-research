# Quickstart: Validating Bitcoin Transactions (spec 061)

Runnable validation guide. References:
[data-model.md](./data-model.md), [contracts/](./contracts/),
[research.md](./research.md).

## Prerequisites

- Node 20, repo installed (`npm install` at root and `frontend/`,
  `services/relay-gateway/`).
- A WebAuthn PRF-capable environment for end-to-end flows (Chrome + platform
  authenticator, or the Vitest PRF mocks for headless runs).
- Testnet4 coins from a public faucet (e.g. mempool.space testnet4 faucet)
  for live-network scenarios.

## 1. Unit suites (no network)

```bash
npm run test:frontend -- bitcoin        # lib/bitcoin/* suites
cd services/relay-gateway && npm test   # includes bitcoin route tests (mocked upstreams)
```

Expected: derivation vectors (fixed test seed → pinned bc1q/bc1p/tb1
addresses; BIP32/84/86 reference vectors), address codec accept/reject matrix
(incl. wrong-network, bad checksum, `0x…`), BIP-21 parsing, coin-selection
properties (stamps/unverified never selected; MAX net of fees; sub-dust change
folded into fee; in-flight coins locked), fee-quote staleness rules, gap-limit
recovery scan — all green.

## 2. Gateway smoke (live upstream, testnet)

```bash
cd services/relay-gateway
BTC_ENABLED=true npm start   # other BTC_* vars per contracts/bitcoin-gateway-api.md
curl -s localhost:PORT/v1/bitcoin/testnet/fees          # → { rates: {fast,normal,slow}, tipHeight }
curl -s -X POST localhost:PORT/v1/bitcoin/testnet/addresses \
  -H 'content-type: application/json' -d '{"addresses":["tb1q…"]}'
```

Expected: fee rates within clamps; address lookup returns confirmed/pending
sats + UTXOs matching mempool.space's testnet4 explorer for the same address.
With `BTC_ENABLED=false` both routes return 503 `bitcoin_disabled`. With
`BTC_STAMPS_URL` unset, `/stamps` returns `degraded: true`.

## 3. End-to-end member flows (frontend + gateway, testnet mode)

```bash
npm run frontend   # with the gateway from step 2 configured
```

Walk the spec's acceptance scenarios in-app (testnet mode):

1. **Receive + rotation (Story 1)**: sign in with a passkey → Receive →
   Bitcoin → address shown (<15s incl. PRF ceremony), labeled testnet, QR
   scannable by an external wallet. Request again → different address. Fund
   the *first* address from a faucet → balance appears.
2. **Portfolio (Story 2)**: portfolio shows the Bitcoin row summing all funded
   addresses; unconfirmed deposits shown pending, flipping to confirmed at 1
   conf; stop the gateway → row renders stale, not zero.
3. **Send (Story 3)**: send to one destination of each type (`m/n…` legacy,
   `2…`/`3…` script-hash, `tb1q…`, `tb1p…`); confirm screen shows fee line
   (BTC + USD) and total debit; invalid/mainnet/EVM destinations rejected with
   specific reasons; MAX leaves zero unspendable remainder; tx pending until
   confirmed on the explorer; fee paid ≤ quoted.
4. **Stamps (Story 4)**: with a Stamps-holding test address (or the mocked
   indexer fixture), collectibles shows the Stamp; MAX send leaves the
   stamps-bearing coin untouched; kill the stamps upstream → degraded banner
   and unverified coins excluded from spendable.
5. **Honesty (Story 5)**: Network tab lists Bitcoin with truthful
   capabilities; wager/pool/membership flows never offer BTC; send confirm
   never says gasless. Sign in with a non-PRF authenticator or injected EVM
   wallet → Bitcoin surfaces show the honest unavailable state.
6. **Recovery (SC-006)**: clear site data (or a second browser profile), sign
   in with the same passkey → all funded addresses and balances reappear with
   no Bitcoin-specific step; next receive address does not reuse any funded one.

## 4. Regression gate (SC-008)

```bash
npm run test:frontend && npm test
```

Expected: full existing suites pass unchanged — a member who never opens a
Bitcoin surface sees no behavioral difference.
