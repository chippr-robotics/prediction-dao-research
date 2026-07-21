# Censor, Never Steal: Splitting a Relayer into a Policy Gateway and an Execution Engine

*How FairWins runs a hot gas key in production by making sure the service that decides is never the service that signs*

| | |
|---|---|
| **Series** | Gasless Rails (part 2 of 2) |
| **Part** | 10 of 34 |
| **Audience** | Infrastructure and backend engineers |
| **Tags** | `relayer`, `infrastructure`, `gasless`, `cloud-run`, `api-gateway` |
| **Reading time** | ~9 minutes |

---

## The button that spends someone else's money

In [part 1 of this series](../09-intent-based-gasless-payments/blog.md) we covered the protocol side of gasless intents: every actor action on the FairWins wager registry has an EIP-712 `…WithSig` twin, so a user with zero gas can sign a claim or an acceptance off-chain and let someone else pay to submit it. That post ended where this one begins — with an uncomfortable word: *someone*.

Someone has to run a server. That server has to hold a funded key, accept signed blobs from the open internet, and turn them into transactions it pays for. Every failure mode you can imagine is on the menu: the key gets stolen; a bot drains the gas wallet with ten thousand valid-but-worthless intents; a sanctioned wallet routes an action through your infrastructure; a single deliberately expensive transaction burns a week of gas budget; or the whole thing goes down at 2 a.m. and users with signed intents are stranded mid-wager.

FairWins had an extra constraint. The platform's standing directive is *no backend* — contracts, a static SPA, and a subgraph. The relayer is the deliberate, documented exception to that rule (spec 036 FR-001/FR-004), and being the exception raised the bar: if a server must exist, its blast radius has to be provably small.

The answer that shipped is a split. One service decides *whether a transaction should exist*. A different service decides *how it gets mined*. Neither can do the other's job, and the design goal is a one-liner from the architecture doc: the hosted stack can only ever **censor, never steal**.

## The split: policy in front, mechanics behind

The deployed footprint is a single Cloud Run service running three sidecar containers that talk over localhost:

- **`relay-gateway`** (`services/relay-gateway/`) — the policy front-end, written in-house. It terminates client traffic, recovers the signer from the EIP-712/EIP-3009 signature, and runs the full validation pipeline: kill switch → parse → chain active → payment-class support → target/action allow-list → signer recovery → param/window binding → dedup on the intent's `uniquenessMarker` → fail-closed sanctions re-screen → per-signer and global quotas → bounded-queue back-pressure → per-chain gas spend cap → fee check → encode the exact `…WithSig`/`…WithAuthorization` calldata.
- **`oz-relayer`** (`services/oz-relayer/`) — the execution engine, an unmodified [OpenZeppelin Relayer](https://docs.openzeppelin.com/relayer) built from source at a pinned tag. It owns everything the gateway deliberately doesn't: per-chain nonce lanes, gas pricing and bumping (legacy type-0 transactions on Ethereum Classic networks, EIP-1559 on Polygon), inclusion tracking, RPC failover, and the gas key itself — held in Cloud KMS on an HSM, never exportable.
- **Redis** — ephemeral queue state for the engine. Deliberately disposable: nonce and queue state reconstructs from chain, so losing it on restart is benign.

The seam between the two is intentionally narrow. The gateway's engine client (`services/relay-gateway/src/engine/client.js`) says it plainly:

```js
/**
 * The engine sees ONLY a built transaction ({to, value, data, speed}) — never a
 * FairWins intent or the recovered signer; all policy stays in the gateway.
 * ...
 * Written as a thin adapter interface so the engine is swappable (rrelayer/MIT
 * fallback exposes an equivalent submit + webhook surface) without touching policy.
 */
async submitTransaction({ relayerId, to, data, speed = 'fast' }) { ... }
```

That narrowness buys three things. First, the engine is **swappable** — it's an off-the-shelf OSS component behind a four-field interface, so if the project ever needs to change engines, no policy code moves. Second, the engine is **auditable by configuration**: its behavior is a declarative `config.json` (`services/oz-relayer/config/config.json`) with per-chain `gas_price_cap`, `min_balance`, and — crucially — `whitelist_receivers` pinning the gas key so it can only ever pay for calls into the FairWins proxy contracts. Third, the policy is **testable without a chain**: the gateway's pipeline is dependency-injected modules under `src/policy/`, exercised by vitest with every chain and engine access mocked.

Status flows back the other way, and it is deliberately honest (FR-006): the engine calls a webhook on the gateway with an HMAC-SHA256 signature over the raw body, verified timing-safe, and only after that webhook reports the transaction mined does `GET /v1/intents/:id` ever say `confirmed`. The gateway never guesses.

## Fail closed where money moves

The most instructive policy module is the sanctions re-screen (`services/relay-gateway/src/policy/sanctions.js`). The on-chain contracts already screen every actor through `ISanctionsGuard` — so why screen again in the gateway? Because the relayer pays gas *before* the contract gets a chance to revert, and "we paid to submit a sanctioned wallet's transaction" is a sentence nobody wants to write. The gateway therefore re-screens the *recovered* signer — not any client-asserted address — against the same on-chain guard, and the failure semantics are strict:

```js
} catch {
  // Fail closed: an unreachable/erroring guard is NEVER treated as allowed (SC-005).
  throw new GatewayError(503, 'screening_unavailable',
    'sanctions screening could not be performed; try again or self-submit')
}
if (!allowed) {
  throw new GatewayError(403, 'sanctioned_signer', 'signer failed sanctions screening')
}
```

Guard says no → `403`. Guard unreachable → `503`, never "assume fine and submit". The on-chain screen remains authoritative; this layer just guarantees the relayer's money never moves for a wallet the chain would reject.

The rest of the pipeline follows the same instinct. Only allow-listed `(targetContract, action)` pairs are ever encoded, and the target addresses are read from the version-pinned `deployments/*-chain<ID>-v2.json` records at startup — a mismatch fails boot (FR-025). Quotas are enforced per signer and globally, an estimated-gas spend cap bounds each chain per window, and a bounded queue turns overload into `429 backpressure` instead of an unbounded memory balloon.

## What a total compromise buys an attacker

The split makes the trust budget legible enough to fit in a table:

| Component | Holds | Can do | Cannot do |
|---|---|---|---|
| `relay-gateway` | two shared secrets (origin lock, webhook) | refuse/accept intents, screen, rate-limit | sign, move funds, forge a signer (it is *recovered*) |
| `oz-relayer` engine | a KMS key *handle* | sign gas transactions to allow-listed receivers | exceed the gas price cap, pay non-whitelisted addresses, spend user funds |
| Cloud KMS (HSM) | the secp256k1 gas key | produce signatures | export the private key |
| Gas wallet | a small gas balance | pay gas | anything else — no contract authority |

Compromise the entire hosted stack and you get: the gas balance, plus the ability to refuse service. No user funds are reachable — stakes sit in escrow contracts that verify every signature themselves. No admin authority is reachable — contract admin keys live on the air-gapped floppy keystore, an entirely separate custody tier. The on-chain entrypoints re-verify and re-screen everything regardless of what the gateway claims. That is what "censor, never steal" means as an engineering property rather than a slogan.

## One policy chassis, two gasless rails

FairWins runs two gasless rails, and here is where the split pays for itself twice. The first rail is the relayed intents above. The second (spec 050) is sponsored ERC-4337 UserOperations for passkey smart accounts: a self-hosted verifying paymaster contract (`contracts/account/FairWinsVerifyingPaymaster.sol`) reimburses a bundler — pimlico's **alto**, running as its own hardened service in `services/alto-bundler/` — from a FairWins-funded EntryPoint deposit.

A sponsored UserOp needs a per-operation authorization signature, served over [ERC-7677](https://eips.ethereum.org/EIPS/eip-7677). Rather than standing up a second policy service, the same gateway grew a `POST /v1/paymaster` route — and it *composes the same policy modules the intent path uses*. From `services/relay-gateway/src/paymaster/policy.js`:

> The killswitch, sanctions screen, and per-account/global quotas are the SAME modules the intent path uses (composed in the route); this module adds the two per-op ceilings that bound a single sponsored op's cost so one deliberately-expensive UserOp can't burn a large slice of the deposit.

So the paymaster path is: shared killswitch → shared sanctions screen → shared quota factory (keyed by smart account) → two new per-op ceilings (`gas_ceiling_exceeded`, `cost_ceiling_exceeded`) → KMS-signed approval with a short validity window. One perimeter, one audit stream, one kill switch — two economically distinct rails. Even the health endpoint unifies them: `/healthz` reports both the gas wallet's runway in hours and the paymaster's EntryPoint deposit runway, so operators watch one number pair for both rails.

The same chassis has since absorbed the platform's other gateway needs — the OpenSea collectibles proxy (specs 055/056) and the Polymarket trading proxy (spec 057) ride the same origin lock, killswitch, and quota machinery. The policy gateway turned out to be the platform's one reusable backend.

## Optional by construction: the never-stranded rule

Everything above would still be a liability if users *needed* it. They don't. Spec 036's FR-002 — the never-stranded rule — requires that every covered action completes via self-submit with an identical on-chain result when the relayer is stopped, killed, or censoring.

The client enforces this mechanically. Before requesting a signature, the SPA's intent client probes the gateway's status endpoint with a bounded ~2-second timeout. Probe fails, kill switch active, chain reported down, or any relay error mid-flow → the SPA silently routes the same action through the user's own wallet as a normal user-paid transaction. Same calldata target, same on-chain result; the only difference is who paid.

The paymaster rail has the same property in ERC-7677 terms: any error from `POST /v1/paymaster` — unsupported chain, unconfigured signer, ceiling exceeded — and the SPA rebuilds the UserOp without a paymaster and self-funds it, with the confirm UI honestly disclosing that the user pays.

Optionality also shapes operations (`docs/runbooks/relayer-operations.md`). The kill switch (FR-015) is boot-configurable and toggleable at runtime via `SIGUSR2`; flipping it turns `POST /v1/intents` into `503 killswitch_active` while status polling stays up and in-flight engine transactions still track to inclusion — no accepted intent is dropped, and every new one degrades to self-submit. Because the worst case is "users pay their own gas," the kill switch is cheap to pull, which means operators will actually pull it.

## Design decisions

**Build the policy, buy the engine.** Nonce management, gas bumping, and RPC failover are solved problems with sharp edges; the OpenZeppelin Relayer does them well, and FairWins runs it unmodified from a pinned tag (AGPL-safe — configured, never forked). The policy layer, by contrast, encodes FairWins-specific judgments — which contracts, which actions, whose signatures, what limits — that no off-the-shelf relayer could know. The split puts custom code exactly where the custom decisions are.

**Single instance first, honestly.** Phase 1 pins Cloud Run to one instance; dedup, quotas, and spend counters are in-process. That is admitted plainly in the README rather than hidden: restart loss is benign because the on-chain `uniquenessMarker` is single-use — a replayed intent can never double-spend — and a momentarily reset rate limit is a loosening, not a breach. The policy modules are factories with narrow interfaces precisely so Phase 2 can swap in shared Redis without touching the pipeline.

**Fail closed on money, fail soft on availability.** Sanctions screening and target pinning fail closed — the gateway would rather refuse than guess. Availability fails soft — every refusal degrades to self-submit. The asymmetry is the point: the only thing this infrastructure is allowed to break is its own usefulness.

**Document the wart.** The engine's Cloud KMS signer (v1.4.0) cannot use keyless workload identity and needs an exported service-account key — held in Secret Manager, scoped to `signerVerifier` only, flagged in the architecture doc as a tracked follow-up rather than quietly accepted. Known limitations written down are limitations that get fixed.

## Sources

- `specs/036-relayer-infrastructure/` — spec, plan, data model, API contracts
- `docs/architecture/relayer-infrastructure.md` — system context, topology, trust boundaries
- `docs/runbooks/relayer-operations.md` — kill switch, key rotation, funding
- `docs/developer-guide/gasless-intents.md` — protocol semantics (part 1 of this series)
- `services/relay-gateway/` — policy gateway (`src/policy/`, `src/engine/client.js`, `src/paymaster/`, `src/server.js`, `README.md`)
- `services/oz-relayer/config/config.json` — engine policies (gas caps, receiver whitelist)
- `services/alto-bundler/README.md` — bundler hardening for the sponsored-UserOp rail
- `specs/050-sponsored-paymaster/` + `docs/runbooks/paymaster-operations.md` — ERC-7677 sponsorship
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009), [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337), [ERC-7677](https://eips.ethereum.org/EIPS/eip-7677)
- [OpenZeppelin Relayer documentation](https://docs.openzeppelin.com/relayer)
