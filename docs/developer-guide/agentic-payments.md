# Agentic payments — x402 pay-per-request (spec 096)

The [Member API](member-api.md) has one door: a capability token a **paid member** signed. This is
the second door on the same rooms. An agent that holds no FairWins credential can call a **priced**
operation, be told what it costs, pay for that one request in USDC, and be served.

The protocol is [x402](https://x402.org), version 2. FairWins verifies and settles the payment
itself — there is no facilitator in the path — and the settlement rides the **existing relay engine**,
the same lane every member-signed instruction already goes through.

**A member is never charged.** The bearer token is checked first; a request carrying a valid one never
reaches the payment path at all, even if a payment is attached to it.

**The platform takes no custody.** The payer signs a transfer of their own USDC to a published
treasury address, and the gateway submits that signed instruction. Nothing is escrowed, no balance is
held, no credit exists, and no platform key signs anything in the exchange.

## The exchange

```
  agent (holds a key, no FairWins account)              gateway (services/relay-gateway)
  ────────────────────────────────────────              ─────────────────────────────────
  GET /v1/member/fees                ─────────────────►  memberApi/routes.js
     (no Authorization)                                    │ bearer? no → priced? yes
                                                           ▼
                                                        src/x402/
  402  { x402Version: 2, resource,   ◄─────────────────    requirements.js  build the offer
         accepts: [ { scheme: "exact",
                      network: "eip155:137",
                      amount: "10000",
                      asset:  <USDC>,
                      payTo:  <treasury>,
                      extra: { assetTransferMethod: "eip3009",
                               name, version } } ] }
     │
     │  sign EIP-3009 TransferWithAuthorization
     │  under the TOKEN's EIP-712 domain
     ▼
  GET /v1/member/fees                ─────────────────►  verify.js   ordered checks, ALL of them
     X-PAYMENT: base64(payload)                            │ parse · offer match · amount · window
                                                           │ signature · sanctions · replay · balance
                                                           ▼
                                                        settle.js   transferWithAuthorization(...)
                                                           │  via src/engine/client.js  (no new key)
                                                           ▼
  200  { … the answer, for the PAYER }  ◄──────────────  served once the engine ACCEPTS
  X-PAYMENT-RESPONSE: base64({ transaction, network, payer, amount, settlement: "broadcast" })
```

Nothing in that picture holds the payer's money. The only thing FairWins adds to the transfer is a
submission.

## Why it is shaped this way

**Verification completes before anything is submitted.** A payment rail has exactly two ways to hurt
people: *charged and not served*, and *served and not charged*. Ordering the work removes the first
entirely — nothing reaches the engine until it is known to be acceptable — and the second is a stated
refusal (`503 settlement_unavailable`) rather than a quiet free serve. A settlement outage must not
become a discount, and must not strand a payer either.

**Settlement reuses the engine because a second submission path is a second policy surface.**
`src/engine/client.js` already takes a built transaction and broadcasts it under the chain's relayer
lane; a settlement is one more built transaction. Adding an x402 facilitator would put a third
party's availability and honesty in the value path for work this gateway already does — it recovers
EIP-3009 signers today, in `src/intent/verify.js`.

**`TransferWithAuthorization`, never `ReceiveWithAuthorization`.** The two structs are identical and
differ only in who may submit them. `Receive…` requires `to == msg.sender`, so only the recipient can
submit it — right for the escrow pulls it is used for, wrong here, where the recipient is a treasury
address that submits nothing and the submitter is the relayer. The type table comes from
`@fairwins/intent-types` and the domain from `config.chains[chainId].tokenDomain`; **never a local
copy of either** — issue #1038 in this repo is exactly a correct type table under a drifted domain,
producing signatures that verify nowhere.

**A price is not an outage, and zero is not free.** A `402` says the data is available for a tenth of
a cent; an agent that reports it as a failed read will tell a member something untrue. And a class
priced `0` is **not offered at all** — an offer for nothing would advertise a free paid rail, which
is a worse way of saying "no credential required".

**Replay protection is honest about which half is durable.** The in-process spent-nonce set does not
survive a restart, exactly like every other gateway store. The durable guarantee is the token
contract's own `authorizationState`: a replay that got past the service is rejected **on chain**, so
the worst case of losing the set is a wasted submission and a `503`, never a double charge. Both facts
are stated wherever replay is mentioned.

**Externally-owned payers only, and the refusal says so in words.** EIP-3009 is verified by the
**token**, whose implementation accepts an ordinary ECDSA signature — so a contract account's ERC-1271
endorsement would pass a gateway-side 1271 check and then **revert at the token**, stranding the
caller in a retry loop. An "unverifiable — retry" verdict would be inviting exactly that retry. The
answer is `payment_signature_invalid` whose **reason states that this rail takes EOA signatures
only**, and points at the membership rail where ERC-1271 is fully supported. A bare "invalid
signature" would read as "you signed wrong" to a payer who signed correctly for a scheme this rail
does not take, which is why the reason carries the explanation rather than the code alone.

## The wire

### The offer (HTTP 402)

```jsonc
{
  "x402Version": 2,
  "error": "payment_required",       // the specific code when a payment was refused
  "errorReason": "…",                // its sentence
  "resource": { "url": "…", "description": "…", "mimeType": "application/json" },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:137",        // CAIP-2, never a bare chain id
    "amount": "10000",              // base units, STRING (USDC has 6 decimals)
    "asset": "0x…",                 // the chain's paymentToken
    "payTo": "0x…",                 // X402_PAY_TO
    "maxTimeoutSeconds": 300,
    "extra": { "assetTransferMethod": "eip3009", "name": "USD Coin", "version": "2" }
  }]
}
```

`extra.name` / `extra.version` are the **token's** EIP-712 domain, not FairWins'. `accepts` is an
array because x402 v2 allows several offers; this deployment publishes one, and a client must still
read it as a list.

### The payment (`X-PAYMENT` request header)

`base64(JSON)`:

```jsonc
{ "x402Version": 2,
  "accepted": { /* the chosen accepts[] element, verbatim */ },
  "payload": { "signature": "0x…",
               "authorization": { "from": "0x…", "to": "0x…", "value": "10000",
                                  "validAfter": "…", "validBefore": "…", "nonce": "0x…" } } }
```

### The receipt (`X-PAYMENT-RESPONSE` response header)

`base64({ success, transaction, transactionId, network, payer, amount, settlement: "broadcast" })`.

**Acceptance is broadcast, not finality** — the same posture the relay rail takes. Every surface says
so, and a caller that reads `transaction` as "confirmed" will tell a member something untrue.

## Verification order

Each check has its own code, and every failure answers `402` with the offer restated so the agent can
correct in one round trip.

| # | Check | Failure |
|---|---|---|
| 1 | the header is base64 of a well-formed payload, at a version we speak | `payment_malformed` · `payment_version_unsupported` |
| 2 | `scheme` / `network` / `asset` match the published offer | `payment_scheme_unsupported` · `payment_network_mismatch` · `payment_asset_mismatch` |
| 3 | `authorization.to == payTo`; `value >= amount` | `payment_recipient_mismatch` · `payment_insufficient` |
| 4–5 | `validAfter <= now`; `validBefore >= now + settle buffer` | `payment_not_yet_valid` · `payment_expired` |
| 6 | the signature recovers to `authorization.from` under the token domain (EOA only) | `payment_signature_invalid` |
| 7 | sanctions screen the payer, **fail closed** | `403 sanctioned_signer` · `503 screening_unavailable` |
| 8 | the nonce is not already claimed in this process | `payment_replayed` |
| 9 | the payer holds the funds (an unreadable balance is **not** an accusation) | `payment_insufficient_balance` · `503 settlement_unavailable` |
| 10 | quota, now keyed on the **verified payer** | `429 quota_exceeded`; the nonce claim is released |
| 11 | settle through the engine | `503 settlement_unavailable`; the nonce claim is released |

The **settle buffer** (default 60 s) exists so a payer is not charged for a race: an authorisation
valid for another two seconds is valid when checked and expired when it lands — which is why
"expired" and "expires too soon" are one code. Both mean *sign another one*.

The 402 body carries the code in `error` and its sentence in `errorReason`. The house
`{ error: { code, reason } }` shape is used only for the outcomes that are **not the payer's to
fix** — screening, quota and settlement.

## Pricing

Prices are set per **operation class**, not per endpoint, so a new endpoint inherits an agreed price
rather than shipping silently free.

The class lives on the route record in `memberApi/contract.js` (`opClass`), so the module prices from
the same list it mounts from.

| Class | Operations | Env | Default |
|---|---|---|---|
| `read` | `GET /v1/member/wagers`, `GET /v1/member/fees` | `X402_PRICE_READ` | `10000` ($0.01) |
| `build` | `POST /v1/member/intents/build` | `X402_PRICE_BUILD` | `50000` ($0.05) |
| `assistant` | `POST /v1/member/assistant/chat` | `X402_PRICE_ASSISTANT` | `100000` ($0.10) |

**Five routes are never priced, for three reasons.** `openapi.json` — a client must be able to read
the specification before deciding to pay for anything, and charging for the description of the price
is a closed loop. `keys/revoke` — this is how a member withdraws a leaked key, the single worst place
on this API to put a price. `me`, `keys/status` and `membership` — all three answer questions **about
a token or a membership**, and a paid caller has neither; pricing them would mean inventing an
identity for a caller who presented none. What is priced is the **data and the work**.

`/status` publishes the live prices under `memberApi.x402`, which is also the **price-discovery
channel for a caller with no token** — an agent can learn what things cost without spending anything.
It carries public configuration only: never a treasury balance, never a settlement count. A class at
`0` reports **`null` there, not `"0"`**: "not offered" and "costs nothing" are different facts.

## What a settled payment buys

- **One operation.** No session, no credit, no balance, no standing entitlement. A balance would make
  the platform a custodian of prepaid funds, which is the thing this design exists to avoid.
- **Served as the payer.** The answer is computed for `authorization.from`, and
  `POST /v1/member/intents/build` forces the actor field to the **payer** — exactly as the membership
  rail forces it to the token's account, and never from the request body. The principal a payment
  produces is deliberately *not* a token: no key id, no window, no membership, and `scopes` holding
  exactly the one scope the served route requires.
- **No new capability.** The paid rail reaches the same read, quote and build operations. There is no
  scope that moves value on either rail.

## Agents and the MCP server

`services/mcp-server` **carries** payments and never makes them. A `402` is surfaced whole — the
complete `accepts[]` plus the statement that the server holds no key and cannot pay — and a
caller-supplied `X-PAYMENT` header is forwarded upstream byte-for-byte, with the gateway's own
`X-PAYMENT-RESPONSE` bytes returned to whoever paid.

Two shapes there are deliberate: a payment is **never a tool argument** (a tool argument is
model-authored text, and the one thing a model must not be able to author is a transfer
authorisation), and the payload is forwarded rather than re-encoded (a re-encoded payload is a
different signature payload). The stdio transport has no per-call header and therefore cannot carry a
payment; it says so rather than approximating one with an environment variable, which would be a
standing withdrawal rather than a single-use authorisation. See [MCP Server](mcp-server.md).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `X402_ENABLED` | `false` | Master switch. Off ⇒ the member API behaves exactly as spec 095. |
| `X402_KILLSWITCH` | `false` | On ⇒ the offer is withdrawn: priced routes refuse exactly as unpriced ones do and no payment is taken. Members unaffected. |
| `X402_CHAIN_ID` | the gateway's default chain | Settlement chain. When enabled it must be an enabled chain with a payment token, a token domain and an engine lane. |
| `X402_PAY_TO` | — | Treasury address. **Required when enabled, with no default** — a default is a default destination for other people's money. |
| `X402_SETTLE_BUFFER_SECONDS` | `60` | Minimum remaining validity a payment must carry. |
| `X402_MAX_TIMEOUT_SECONDS` | `300` | The `maxTimeoutSeconds` published in the offer. |
| `X402_PRICE_READ` / `_BUILD` / `_ASSISTANT` | `10000` / `50000` / `100000` | USDC base units. `0` ⇒ that class is not offered. All three at `0` fails the boot — an enabled rail that offers nothing. |
| `X402_NONCE_MAX` | `50000` | Bound on the in-process replay set. |

Boot-failing validation lives **inside** the `if (enabled)` branch, so an unconfigured optional module
can never take the relay path down — and an *enabled* one missing a treasury refuses to start rather
than guessing. Full list: [Configuration](../reference/configuration.md#x402-pay-per-request-gateway).

## Invariants

- **A valid capability token is checked first and is never charged**, even when a payment is also
  attached.
- **Verification completes before any submission.** A refused payment is never submitted and costs
  the payer nothing.
- **A settlement outage refuses.** Never a free serve, never an optimistic settle.
- **Acceptance is broadcast, not finality**, on every surface that reports it.
- **The gateway holds no key and no funds.** If either stops being true, this module has become a
  custodian.
- **A settled payment buys one operation**, served as the payer, with the actor of any built typed
  data forced to the payer address.
- **Zero price ⇒ no offer.** Zero is off, not free.
- **`openapi.json` and the key routes are never priced.**
- **A payment signature and nonce never reach a log or an audit record.** The audit line carries the
  operation, the payer, the amount and the settlement transaction — all four already public.
- **The struct table and the token domain have one source each**, `@fairwins/intent-types` and the
  chain config. A local copy of either is a defect.

## Tests

- Gateway: `services/relay-gateway/test/x402.test.js` — real `ethers.Wallet` signatures over the
  token's domain, an engine mock recording the settlement calldata, the whole refusal matrix, the
  never-charge-a-member invariant, both off-switches, and a zero-priced class answering `401` rather
  than `402`.
- Gateway: the spec-095 suites, unchanged, **with the rail enabled and everything priced** — the
  property that proves this feature is invisible to members.
- MCP server: `services/mcp-server/test/x402.test.js` under `node:test` — offer surfacing, the
  non-x402 402 fallback, byte-for-byte passthrough with no `Authorization` alongside, and the receipt
  round trip.

## Related

- [Member API](member-api.md) — the operations this rail prices, and the membership rail.
- [MCP Server](mcp-server.md) — the reference agent client, which carries payments and cannot make
  them.
- [Member API Operations](../runbooks/member-api-operations.md) — enabling, pricing, treasury and
  incident response.
- [Gasless intents](gasless-intents.md) — the EIP-3009 and relay-engine machinery this reuses.
- Spec: `specs/096-x402-agentic-payments/`.
