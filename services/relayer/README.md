# FairWins ZK-Wager Pool — Gas Relayer

A minimal, self-contained, **stateless gas relayer** for ZK-Wager Pool gasless joins (spec 034, US3).
It accepts a member's pre-signed EIP-3009 authorization and submits
`ZKWagerPool.joinWithAuthorization(...)` on their behalf, **paying the gas**. The member never needs the
native gas token to join a pool.

> **This is GAS INFRASTRUCTURE, not an app backend.** It is stateless, stores no user or business data,
> and holds only a gas-only key. See the [No-backend footprint note](#no-backend-footprint-note--maintainers-must-acceptreject)
> — it must be explicitly accepted by the maintainers.

---

## No-backend footprint note — maintainers MUST accept/reject

FairWins has a **standing "no app backend" directive**: the platform ships only SPA + nginx (Cloud Run),
contracts, IPFS, Cloudflare edge, and Cloud Logging — no application server. Spec 034's
`implementation-notes.md` deliberately reframed gasless join as *client-side signing + a pluggable
third-party relayer* precisely to avoid operating a FairWins server.

**This service is in tension with that directive.** A gas relayer is server-side infrastructure. It is
scoped as narrowly as possible to stay on the right side of the line:

- **It is not an app backend.** It handles no user accounts, no business logic, no off-chain state. It
  is a single, stateless function: "given a signed authorization, pay gas to submit it."
- **It is optional and additive.** With no relayer wired (`VITE_POOL_RELAYER_URL` unset), members join
  normally and pay their own gas (`ZKWagerPool.join`). Gasless never becomes a dependency.
- **It can censor, never steal** (see [Security model](#security-model)).

**Decision required:** the maintainers must explicitly **accept** running this service (it adds a
deployable component + a hot gas key to operate/fund/monitor) **or reject** it in favor of a managed
alternative (below). Until accepted, treat this directory as a reference implementation.

### Managed alternative (zero FairWins-operated infrastructure)

Instead of self-hosting, point the frontend at a **third-party relayer** — Gelato Relay, Biconomy, or
OpenZeppelin Relayer/Defender — which submits `joinWithAuthorization` and bills gas to a sponsorship
account. That keeps the footprint at zero FairWins servers. The trade-off is a third-party dependency
and (usually) a per-tx fee. This custom service exists for teams that want full control of the
submit path and the sanctions re-screen, or that can't use a SaaS relayer for compliance reasons.

---

## Why a custom Node service (not OpenZeppelin Relayer)?

OZ Relayer (the open-source Rust relayer) is excellent for general meta-tx relaying, but for *this*
single, compliance-gated endpoint a thin Node/Express service was chosen because:

1. **The relay path needs a custom pre-flight that OZ Relayer's policy engine doesn't express
   natively:** re-screen `from` against the network's on-chain `SanctionsGuard` and **fail closed** if
   screening can't be performed (FR-021d), plus verify the EIP-3009 authorization binds the right pool +
   `buyIn`. Doing this as a custom service keeps the security-critical check auditable in one ~200-line
   file rather than spread across relayer plugins/policies.
2. **The repo already standardizes on Node + ethers v6.** Reviewers read this in the same toolchain as
   the contracts/frontend; no new language/runtime to vet.
3. **Smaller attack surface for a one-endpoint service.** No transaction queue, no per-tx fee logic, no
   admin API — just validate, screen, submit.

If you prefer OZ Relayer/Defender, the **same pre-flight** (`src/relay.js#parseRequest` +
`relayPoolJoin`'s checks) is the validation/packer you put in front of it: screen `from`, verify the
auth binds `(pool, buyIn)`, then hand the call to the managed relayer instead of `poolContract.
joinWithAuthorization`. The frontend client (`relayerClient.js`) is relayer-agnostic — it just POSTs to
`VITE_POOL_RELAYER_URL`.

---

## Architecture

```
 member browser                      this relayer (gas infra)                 chain
 ──────────────                      ─────────────────────────                ─────
 sign EIP-3009 auth   ──POST──▶  /relay/pool-join
 (gasless.js:                       1. validate + normalize inputs
  signReceiveAuthorization)         2. auth.to == pool ? value/window sane?
                                    3. factory.poolAddressToId(pool) != 0  ──▶ ZKWagerPoolFactory
                                    4. pool.buyIn() == auth.value          ──▶ ZKWagerPool
                                    5. sanctionsGuard.isAllowed(from)?     ──▶ SanctionsGuard (FR-021d)
                                    6. signer.joinWithAuthorization(...)   ──▶ ZKWagerPool (pays gas)
                     ◀──{txHash}──  return tx hash                              │
                                                                               └─ token.receiveWithAuthorization
                                                                                  (EIP-3009 pull, replay-protected)
```

- **Stateless.** One provider + one gas-only signer per enabled chain, created at boot. No DB, no queue.
- **Allow-listed targets.** The relayer only submits to pools registered by the configured
  `ZKWagerPoolFactory` (`poolAddressToId(pool) != 0`). It will not submit to an arbitrary contract.
- **Files:**
  - `src/server.js` — Express app: helmet, JSON body limit, per-IP rate limit, `/healthz`, the route.
  - `src/relay.js` — input validation (`parseRequest`) + the full relay pipeline (`relayPoolJoin`).
  - `src/chains.js` — ethers v6 provider/signer/contract wiring + minimal ABIs.
  - `src/config.js` — env loading + fail-fast validation.

---

## Security model

The relayer is **untrusted by design** — the protocol does not rely on it being honest:

- **Cannot steal.** It never holds member funds. The member signs an EIP-3009
  `ReceiveWithAuthorization` bound to `(from, to=pool, value, nonce)`. The only thing the relayer can do
  with that signature is move exactly `value` from `from` into exactly that `pool`. It cannot redirect
  funds, change the amount, or reuse the auth.
- **Replay protection is on the token, not the relayer.** ERC-3009 consumes the `nonce` on use; a
  resubmitted authorization reverts at the token. The relayer holds no replay state and needs none.
- **Can only censor.** A malicious/broken relayer can refuse or drop a join. The mitigation is built in:
  with no relayer configured the member joins normally and pays their own gas. Censorship is therefore a
  liveness annoyance, never a safety issue.
- **Sanctions re-screen (FR-021d), fail-closed.** Before spending gas the relayer calls
  `SanctionsGuard.isAllowed(from)` for the target chain. If the wallet is screened out → `403 screened`.
  If screening **cannot be performed** (no guard configured while `REQUIRE_SANCTIONS_SCREEN=true`, or the
  guard call reverts) → `503 screening_unavailable` and the relay is refused. This duplicates the pool's
  authoritative on-chain `screen(from)` (which still runs in `joinWithAuthorization`), so screening can
  never be bypassed by going through the relayer.
- **Gas-only hot key.** `RELAYER_PRIVATE_KEY` should be a dedicated, low-value, hot key funded with just
  enough native gas per chain. **Do not** reuse the floppy-keystore admin key. Worst-case compromise =
  drained gas balance + censorship, never user funds.
- **Hardening:** `helmet`, `x-powered-by` off, 8 KB JSON body cap, per-IP rate limit, no stack traces in
  responses, non-root container, read-only root fs, `no-new-privileges`. Put TLS termination
  (Caddy/nginx/Cloud Run) in front; never expose the raw HTTP port publicly.

---

## API

### `POST /relay/pool-join`

Request:

```json
{
  "chainId": 80002,
  "pool": "0xPoolCloneAddress",
  "identityCommitment": "1234567890...",
  "authorization": {
    "from": "0xMember",
    "to": "0xPoolCloneAddress",
    "value": "10000000",
    "validAfter": "0",
    "validBefore": "1750000000",
    "nonce": "0x...32bytes...",
    "v": 27,
    "r": "0x...32bytes...",
    "s": "0x...32bytes..."
  }
}
```

Success `200`: `{ "txHash": "0x..." }`

Errors `{ "error": { "code", "message" } }`:

| status | code                    | meaning                                                        |
|--------|-------------------------|----------------------------------------------------------------|
| 400    | `bad_request`           | malformed/missing field                                        |
| 400    | `chain_not_enabled`     | chainId not in `ENABLED_CHAIN_IDS`                             |
| 400    | `auth_recipient_mismatch` | `authorization.to` != `pool`                                |
| 400    | `auth_expired` / `auth_not_yet_valid` | outside the EIP-3009 validity window           |
| 400    | `unknown_pool`          | `pool` not registered by the configured factory               |
| 400    | `value_mismatch`        | `authorization.value` != pool `buyIn`                         |
| 403    | `screened`              | `from` failed sanctions screening                             |
| 429    | `rate_limited`          | per-IP rate limit exceeded                                    |
| 502    | `factory_unreachable` / `pool_unreachable` / `submit_failed` | RPC/chain issue or on-chain revert |
| 503    | `screening_unavailable` | screening required but couldn't be performed (FR-021d)        |

### `GET /healthz`

`{ "ok": true, "service": "fairwins-pool-relayer", "enabledChainIds": [80002] }` — no secrets.

---

## Deploy

1. **Configure.** Copy the env template and fill it in (the gas key, per-chain RPCs, the deployed
   `zkWagerPoolFactory` + `sanctionsGuard` addresses — the *same* addresses the frontend resolves via
   `getContractAddressForChain`):

   ```bash
   cd services/relayer
   cp .env.example .env
   $EDITOR .env          # NEVER commit .env (gitignored by the repo root)
   ```

2. **Fund the gas key** with native gas token on each enabled chain.

3. **Run** (Docker):

   ```bash
   ./deploy.sh up        # build + start (docker compose)
   ./deploy.sh logs      # follow logs
   ./deploy.sh down      # stop
   curl -s http://localhost:8787/healthz
   ```

   Or dev / no-docker:

   ```bash
   npm install
   ./deploy.sh local     # node src/server.js, loads .env
   ```

4. **Front it with TLS** (Cloud Run, Caddy, or nginx) and restrict origins/IPs as appropriate. The
   service is stateless, so scale horizontally if needed (each instance shares the same gas key — watch
   for nonce contention; for high volume use a single instance or a nonce-managed relayer).

---

## Point the frontend at it

Set the relayer URL in the frontend build/runtime env (`frontend/.env`):

```
VITE_POOL_RELAYER_URL=https://relayer.yourdomain.example
```

The frontend client `frontend/src/lib/pools/relayerClient.js` reads this and POSTs the payload. Wire it
into the gasless flow as the `relayer` arg to `relayGaslessJoin` (from `frontend/src/lib/pools/gasless.js`):

```js
import { signReceiveAuthorization, relayGaslessJoin } from './lib/pools/gasless'
import { makePoolRelayer } from './lib/pools/relayerClient'

const relayer = makePoolRelayer() // null when VITE_POOL_RELAYER_URL is unset
const authorization = await signReceiveAuthorization({ signer, token, chainId, to: poolAddress, value: buyIn })
const { txHash } = await relayGaslessJoin(relayer, authorization, { pool: poolAddress, identityCommitment })
```

When `VITE_POOL_RELAYER_URL` is unset, `makePoolRelayer()` returns `null`, `relayGaslessJoin` throws a
clear "no relayer configured" error, and the UI falls back to a normal (gas-paying) join — gasless stays
purely additive, keeping the no-backend footprint intact when the relayer isn't operated.
