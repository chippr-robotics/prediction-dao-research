# Runbook: Bitcoin Operations (spec 061)

The bitcoin module of the relay-gateway proxies public Bitcoin data
(balances/UTXOs, fees, broadcast, tx status, Stamps) behind
`/v1/bitcoin/:network/*` with quotas, TTL caches, and a killswitch. It is
stateless — no wallet data, no keys — and optional: disabled, the frontend
hides/degrades every Bitcoin surface honestly.

## Config (relay-gateway env — see `.env.example`)

| Var | Default | Notes |
|---|---|---|
| `BTC_ENABLED` | `false` | master switch; `false` ⇒ all routes 503 `bitcoin_disabled` |
| `BTC_ESPLORA_URL` | `https://mempool.space/api` | mainnet Esplora-compatible upstream |
| `BTC_ESPLORA_TESTNET_URL` | `https://mempool.space/testnet4/api` | testnet4 upstream |
| `BTC_STAMPS_URL` | unset | Stamps indexer (stampchain.io-compatible); unset ⇒ stamps endpoint `degraded: true` |
| `BTC_MAX_FEE_RATE` | `500` | sat/vB clamp on fee responses |
| `BTC_QUOTA_PER_IP` / `BTC_QUOTA_GLOBAL` | polymarket parity | read quotas; writes (broadcast) are tighter |
| `BTC_KILLSWITCH` | `false` | ops kill: all routes 503 `bitcoin_killed` |
| `BTC_TIMEOUT_MS` / `BTC_RETRIES` | `5000` / `1` | upstream tuning; broadcasts are never retried |

Boot fails loudly on malformed URLs or nonsensical clamps when
`BTC_ENABLED=true` — a bad deploy dies visibly, not silently.

## Playbooks

**Kill Bitcoin now** (incident): set `BTC_KILLSWITCH=true` and restart (or the
global runtime killswitch if the whole gateway is implicated). Frontend
surfaces degrade to honest unavailable states; member funds are unaffected
(keys are client-side; self-custody continues in any external wallet via the
same standard derivation paths).

**Swap upstream** (rate-limited / down / self-host): point
`BTC_ESPLORA_URL`(+`_TESTNET_`) at any Esplora-compatible API — public
alternatives (blockstream.info) or self-hosted mempool/electrs. No code
change; the client-side fee-dialect fallback handles both mempool.space
`fees/recommended` and Esplora `fee-estimates` shapes.

**Stamps indexer degraded/down**: no action is strictly required — the
frontend fails SAFE (all unverified coins are protected; members see a
degraded-recognition banner and reduced spendable balance, never a lost
Stamp). Restore or swap `BTC_STAMPS_URL` to clear it. Degraded results cache
only 30s, so recovery is fast.

**Fee spikes**: quotes are clamped to `BTC_MAX_FEE_RATE` and expire client-side
after 60s; raise the clamp only deliberately (it caps what members can be
quoted, and the confirmed quote is a hard signing ceiling).

**Quota exhaustion (429s)**: raise `BTC_QUOTA_*` or lower portfolio poll
pressure; balance lookups batch ≤50 addresses per call and cache 15s, so
sustained 429s usually mean abuse, not organic load.

**Testnet4 notes**: `'bitcoin-testnet'` is testnet4 (testnet3 is deprecated).
Faucets: mempool.space testnet4 faucet. If testnet4 resets or the upstream
drops it, swap the testnet URL (signet is the fallback candidate — one env
change, but note coinType stays 1' so derived addresses are unchanged).

## Monitoring

- 502 `upstream_unavailable` rate — upstream health (portfolio shows stale,
  sends block honestly; prolonged ⇒ swap upstream).
- 400 `broadcast_rejected` reasons — surfaced verbatim to members; spikes may
  indicate fee-estimation drift (check `BTC_MAX_FEE_RATE` vs mempool).
- stamps `degraded: true` ratio — indexer health (drives protected-balance UX).
