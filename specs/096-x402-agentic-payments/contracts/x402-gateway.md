# Contract: x402 pay-per-request (`/v1/member/*`) — spec 096

Producer: `services/relay-gateway/src/x402/{requirements,verify,settle,paywall}.js`, config block
`x402` in `src/config/index.js`, called from `src/memberApi/routes.js`.
Consumers: any x402-speaking agent runtime, and `services/mcp-server`.
Companion documents: [member-api.md](../../095-member-api-agentic-access/contracts/member-api.md)
(the operations being priced) and
[api-key-grant.md](../../095-member-api-agentic-access/contracts/api-key-grant.md) (the rail a member
uses instead).

Protocol: **x402, version 2**, `exact` scheme on EVM. Where this document and the published x402
specification disagree about the wire, the specification wins and this document is the bug.

> **Nothing here takes custody, and nothing here signs for anyone.** The payer signs a transfer of
> their own USDC to a published address; the gateway checks that signature, submits it through the
> relayer lane it already uses for member-signed instructions, and answers the request. There is no
> escrow, no balance, no credit and no platform key in the exchange. A member holding a valid
> capability token never enters this path at all.

---

## 1. Where the paywall sits

The bearer credential is checked **first**. The paywall is reached only when a request to a priced
operation has **no usable bearer credential**, and it is the last thing consulted before the request
would otherwise be refused.

| # | Stage | Outcome |
|---|---|---|
| 0–4 | CORS, origin lock, module + global killswitch, `memberApi.enabled` | unchanged from spec 095 |
| 5 | `Authorization: Bearer` present **and valid** | served on the membership rail. **No price, no offer, no charge** — even if `X-PAYMENT` is also present |
| 5a | `Authorization` present and **invalid**, with a fall-through verdict | refused *or* offered — see below |
| 6 | no credential, operation **not priced** | refused exactly as spec 095 refuses it (`401 invalid_token`). **Never a 402** |
| 7 | no credential, operation priced, no `X-PAYMENT` | **`402`** with the offer (§3) |
| 8 | no credential, operation priced, `X-PAYMENT` present | verify (§5) → settle (§6) → serve as the **payer** |

Stage 5 is the whole of FR-006 and is structural: the paywall is a function the route calls **after**
authentication has already declined to produce an account, so a valid token cannot reach it.

### Which token verdicts the paid rail may stand in for

Only these: `invalid_token`, `invalid_signature`, `token_expired`, `token_ttl_exceeded`,
`token_revoked`, `membership_required`. The 402 body then carries **that** verdict as its `error`, so
the diagnostic ("your key expired") survives instead of being replaced by a generic "pay me".

What is **excluded** matters more than what is included:

- **every `503`** — `auth_unverifiable`, `membership_unreadable`, `screening_unavailable` all mean a
  fact could not be established. Answering 402 there would invite an agent to pay because our RPC was
  slow, which is charging for our own outage;
- **`sanctioned_signer`** — there is no amount that makes a screened-out account servable, and
  offering one would be an offer to sell exactly the thing screening refuses;
- **`insufficient_scope`** — that caller *has* a working key, and the fix is a wider key, which is
  free;
- **`quota_exceeded`** — a rate limit is not a price.

`membership_required` is on the list, and is the point of the whole rail: pay-per-request substitutes
membership for one operation.

### The principal a settled payment produces

Shaped like an authenticated token so every handler is unchanged, but it is **not** one and says so:
no `keyId`, no validity window, no membership — a payer presented no key and the gateway does not
invent an identity for them. Its `scopes` is exactly the **one** scope the route being served
requires: a payment buys the operation it was quoted for and nothing adjacent.

## 2. Operation classes and pricing

Prices are set per **class**, not per endpoint, so a new endpoint inherits an agreed price rather
than shipping silently free.

The class lives on the route record in `memberApi/contract.js` (`opClass`), so `routes.js` prices
from the same list it mounts from and no second table can drift.

| Class | Operations | Env | Default |
|---|---|---|---|
| `read` | `GET /v1/member/wagers`, `GET /v1/member/fees` | `X402_PRICE_READ` | `10000` (= $0.01) |
| `build` | `POST /v1/member/intents/build` | `X402_PRICE_BUILD` | `50000` (= $0.05) |
| `assistant` | `POST /v1/member/assistant/chat` | `X402_PRICE_ASSISTANT` | `100000` (= $0.10 per message) |

- Amounts are **USDC base units** (6 decimals) as **strings** on the wire.
- **`0` means the class is not offered.** No offer is made and the request is refused exactly as it
  is today. Zero is *off*, not *free*.

**Five routes are deliberately unpriced (`opClass: null`), for three different reasons:**

| Route | Why it is never priced |
|---|---|
| `GET /v1/member/openapi.json` | A client must be able to read the specification before it can decide to pay for anything. Charging for the description of the price is a closed loop. |
| `POST /v1/member/keys/revoke` | This is how a member withdraws a leaked key. It is the single worst place on this API to put a price. |
| `GET /v1/member/me`, `GET /v1/member/keys/status` | Both introspect a **token**. A paid caller presented none, so there is nothing to answer; pricing them would mean inventing an identity for a caller who has none. |
| `GET /v1/member/membership` | The same reason one step along: the paid rail exists *because* the payer has no membership. Answering it would either fabricate a state or make a chain read the payer already paid for fail after settlement. |

What is priced is the **data and the work**: the account's own wagers, the live fee rates, a
typed-data build, and an assistant message.

## 3. The `402` answer

`Content-Type: application/json`, HTTP status **402**:

```jsonc
{
  "x402Version": 2,
  "error": "payment_required",              // machine code; the specific reason when a payment was refused
  "errorReason": "No payment was presented…",// human sentence for that code
  "resource": {
    "url": "https://relay.fairwins.app/v1/member/fees",
    "description": "Live platform fee rates",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:137",              // CAIP-2. NEVER a bare numeric chain id
      "amount": "10000",                    // base units, STRING
      "asset": "0x3c499c…",                 // the chain's paymentToken (USDC)
      "payTo": "0x…",                       // X402_PAY_TO
      "maxTimeoutSeconds": 300,             // X402_MAX_TIMEOUT_SECONDS
      "extra": {
        "assetTransferMethod": "eip3009",
        "name": "USD Coin",                 // the TOKEN's EIP-712 domain name
        "version": "2"                      // the TOKEN's EIP-712 domain version
      }
    }
  ]
}
```

Three fields are the ones an implementation gets subtly wrong:

- **`amount` is a string in base units.** A JSON number is a double; a price expressed as one is a
  rounding error waiting for a bigger price.
- **`network` is CAIP-2.** `eip155:137`, not `137` and not `"polygon"`.
- **`extra.name` / `extra.version` are the *token's* domain**, taken from
  `config.chains[chainId].tokenDomain` — the same source `src/intent/verify.js` uses to recover an
  EIP-3009 signer today. A payload signed under a FairWins domain verifies nowhere.

`accepts` is an array because x402 v2 allows several acceptable offers. This deployment publishes
**exactly one** (one chain, one asset); a client MUST still read it as a list.

## 4. The `X-PAYMENT` request header

`base64( JSON )` of an x402 v2 `PaymentPayload`:

```jsonc
{
  "x402Version": 2,
  "accepted": { /* the chosen element of accepts[], verbatim */ },
  "payload": {
    "signature": "0x…",                     // 65 bytes, r‖s‖v
    "authorization": {
      "from":        "0x…",                 // the payer
      "to":          "0x…",                 // MUST equal accepted.payTo
      "value":       "10000",               // base units, string; MUST be >= accepted.amount
      "validAfter":  "1750000000",
      "validBefore": "1750000300",
      "nonce":       "0x…"                  // bytes32, single use
    }
  }
}
```

`authorization` is the EIP-3009 **`TransferWithAuthorization`** struct, signed under the **token's**
EIP-712 domain:

```
domain  { name: extra.name, version: extra.version, chainId: <numeric chain id>, verifyingContract: <asset> }
types   TRANSFER_WITH_AUTHORIZATION_TYPES   // from @fairwins/intent-types — NEVER a local table
```

**`TransferWithAuthorization`, not `ReceiveWithAuthorization`.** The two structs are identical and
differ only in who may submit them: `Receive…` requires `to == msg.sender`, so only the recipient may
submit it. Here the recipient is a treasury address that submits nothing and the submitter is the
relayer, so `Transfer…` is the correct leg. Using the wrong one produces an authorisation that simply
reverts.

## 5. Verification order

Every check runs **before** any submission, and stops at the first failure. This ordering is the
safety property: nothing is submitted until it is known to be acceptable, so "charged and not served"
has no code path.

| # | Check | Failure |
|---|---|---|
| 1 | the header is base64 of JSON with the fields above | `402 payment_malformed` |
| 1a | `x402Version` is one this gateway speaks | `402 payment_version_unsupported` |
| 2 | `accepted.scheme` is offered | `402 payment_scheme_unsupported` |
| 2a | `accepted.network` matches the offer | `402 payment_network_mismatch` |
| 2b | `accepted.asset` matches the offer | `402 payment_asset_mismatch` |
| 3 | `authorization.to == payTo` | `402 payment_recipient_mismatch` |
| 3a | `value >= amount` | `402 payment_insufficient` |
| 4 | `validAfter <= now` | `402 payment_not_yet_valid` |
| 5 | `validBefore >= now + X402_SETTLE_BUFFER_SECONDS` (an already-past `validBefore` is the same failure) | `402 payment_expired` |
| 6 | signature recovers to `authorization.from` under the token domain | `402 payment_signature_invalid` |
| 7 | sanctions screen `from` (`policy/sanctions.js`, **fail closed**) | `403 sanctioned_signer` / `503 screening_unavailable` |
| 8 | `nonce` not already claimed in this process | `402 payment_replayed` |
| 9 | `from` holds at least `value` of the asset | `402 payment_insufficient_balance` |
| 9a | the balance read itself failed | `503 settlement_unavailable` — an unknown balance is not an accusation |
| 10 | quota, now keyed on the **verified payer** | `429 quota_exceeded` + `Retry-After`, and the nonce claim is **released** |
| 11 | settle (§6) | `503 settlement_unavailable`, and the nonce claim is **released** |

Every `402` body is the §3 shape with `error` set to the code and `errorReason` to its sentence, so a
client gets the reason **and** the offer it needs to correct against, in one answer. The house
`{ error: { code, reason } }` shape is used only for the outcomes that are not the payer's to fix —
`sanctioned_signer`, `screening_unavailable`, `quota_exceeded`, `settlement_unavailable`.

**Step 5 folds "expired" and "expires too soon" into one code on purpose.** Both mean the same thing
to a client — this authorisation cannot be settled, sign another — and the settle buffer exists so a
payer is not charged for a race: an authorisation valid for another two seconds is valid when checked
and expired when it lands.

**Step 6 is EOA-only, deliberately and documented.** EIP-3009 is verified by the **token**, whose
implementation accepts an ordinary ECDSA signature; a contract account's ERC-1271 endorsement would
pass a gateway-side 1271 check and then **revert at the token**, charging nobody but stranding the
caller in a retry loop. So the reason on `payment_signature_invalid` **says in words** that this rail
takes EOA signatures only, and points at the membership rail where ERC-1271 is fully supported. A
bare "invalid signature" with no explanation is not acceptable here — it reads as "you signed wrong"
to a payer who signed correctly for a scheme this rail does not take.

**Step 8 is honest about what it is.** The spent-nonce set is in process, bounded
(`X402_NONCE_MAX`, default 50 000), and **does not survive a restart** — the same Phase-1 posture as
every other gateway store. The durable guarantee is the token contract's own `authorizationState`: a
replay that got past this check is rejected on chain, so the worst case of losing the set is a wasted
submission and a `503`, never a double charge. Note the claim is **released** whenever the
authorisation was not actually submitted (steps 10 and 11), so a rate-limited or
settlement-failed payer can retry the same payload.

## 6. Settlement, and the `X-PAYMENT-RESPONSE` header

Settlement builds

```
transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)
```

against the chain's `paymentToken` and submits it through the **existing** engine client
(`src/engine/client.js`, the chain's `engineRelayerId` lane). The gateway holds no key: the engine
holds the relayer key exactly as it does for every other submission, and the payer's own signature is
what authorises the movement of their funds.

The operation is served once the engine **accepts** the submission. The response carries:

```
X-PAYMENT-RESPONSE: base64( {
  "success": true,
  "transaction": "0x…",        // the tx hash, when the engine returned one
  "transactionId": "…",        // the engine's own submission id
  "network": "eip155:137",
  "payer": "0x…",
  "amount": "10000",
  "settlement": "broadcast"    // stated out loud — NOT "confirmed", NOT "final"
} )
```

**Acceptance is broadcast, not finality.** This is the same posture the relay rail already takes, and
every surface repeats it: the response header, the MCP tool result, and the docs. A caller that reads
"transaction" as "confirmed" will tell a member something untrue.

If the engine cannot be reached, the request is refused `503 settlement_unavailable`, **nothing is
served and nothing is charged**. A settlement outage must not become a free tier, and must not strand
a payer either — which is exactly why verification (§5) completes first.

## 7. What a settled payment buys

- **One operation.** No session, no credit, no balance, no standing entitlement. A balance would make
  the platform a custodian of prepaid funds, which is the thing this design exists to avoid.
- **Served as the payer.** The paid request is answered for `authorization.from` — its own wagers,
  and typed data built for it. `POST /v1/member/intents/build` forces the actor field to the
  **payer** address, exactly as the membership rail forces it to the token's account — never a value
  from the request body.
- **No new capability.** The paid rail reaches the same read, quote and build operations the
  membership rail reaches. There is no scope that moves value on either.

## 8. `/status` contribution

The public `/status` `memberApi` block gains:

```jsonc
"x402": {
  "enabled": true,                 // honest liveness: false if EITHER killswitch is on,
                                   // or the member API itself is off
  "killSwitch": false,
  "network": "eip155:137",
  "priced": { "read": "10000", "build": "50000", "assistant": null }
}
```

Public configuration only — the same values that appear in every offer. **Never** a treasury balance,
a settlement count, or any other fact about platform funds. This block is also the **price-discovery
channel for a caller with no token**: an agent can learn what things cost without spending anything.

A class at `0` reports **`null`**, not `"0"`. "Not offered" and "costs nothing" are different facts,
and `"0"` would say the wrong one.

**Killing the rail withdraws the offer rather than inventing a refusal.** With `X402_KILLSWITCH=true`
(or the member API's own killswitch, or the gateway-wide one), `offers()` answers false, so the
paywall is never reached: a priced operation refuses exactly as an unpriced one does
(`401 invalid_token`), a request carrying `X-PAYMENT` is **not settled**, and member-authenticated
traffic is untouched. There is deliberately **no `x402_killed` code** — a caller with no credential
gets the same answer the pre-096 gateway gave, which is the honest one.

## 9. OpenAPI

Every priced operation gains, in the document the gateway serves:

- a `402` response documenting the §3 body (`PaymentRequirements` + an `accepts` item schema);
- the `X-PAYMENT` request header and the `X-PAYMENT-RESPONSE` response header;
- an `x402` tag whose description explains the exchange and states that a valid capability token is
  checked first and is never charged.

The document is a JS object interpolating the same constants the middleware enforces (spec 095 R6),
so the drift test extends to these: a priced route with no documented `402` fails the suite.

## 10. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `X402_ENABLED` | `false` | Master switch for the paid rail. Off ⇒ the member API behaves exactly as spec 095. |
| `X402_KILLSWITCH` | `false` | On ⇒ the offer is withdrawn: priced routes refuse exactly as unpriced ones do, and no payment is taken. Members unaffected. |
| `X402_CHAIN_ID` | the gateway's default chain | The chain payments are signed on and settle on. When enabled it must be an **enabled** chain that has a `paymentToken`, a `tokenDomain` and an engine lane; anything else fails the boot by name. |
| `X402_PAY_TO` | — | The treasury address payments are made to. **Required when enabled. There is deliberately no default** — a default is a default destination for other people's money, and a stale one is money sent to an address nobody holds. |
| `X402_SETTLE_BUFFER_SECONDS` | `60` | Minimum remaining validity a payment must have (check 6). |
| `X402_MAX_TIMEOUT_SECONDS` | `300` | `maxTimeoutSeconds` published in the offer. |
| `X402_PRICE_READ` | `10000` | Read class, USDC base units. `0` ⇒ not offered. |
| `X402_PRICE_BUILD` | `50000` | Build class. `0` ⇒ not offered. |
| `X402_PRICE_ASSISTANT` | `100000` | Assistant class. `0` ⇒ not offered. |
| `X402_NONCE_MAX` | `50000` | Bound on the in-process replay set. Phase 1 — see §5 step 8. |

All boot-failing validation lives **inside** `if (enabled)`, so an unconfigured optional module can
never take the gateway's relay path down — and an *enabled* one refuses to start when it is missing a
treasury, names a chain that is not enabled or has no payment token, prices **every** class at `0`
(which would enable a rail that offers nothing), or sets `X402_MAX_TIMEOUT_SECONDS` below the settle
buffer (which would publish an offer nothing could satisfy).

## 11. Logging and audit

- **A payment signature and a payment nonce are never logged and never written to an audit record.**
  They are credential-grade material: a signature is a bearer instrument until it is spent, and a
  nonce identifies which one. Treat both as `FORBIDDEN_KEYS` territory.
- An audit line for a settled payment carries the **operation, the payer, the amount and the
  settlement transaction** — all four already public, and together enough to reconcile.
- The `X-PAYMENT` header value is never echoed into a response body or a tool result.

## 12. Non-goals

- **No facilitator**, inbound or outbound. FairWins neither hosts one nor calls one.
- **No credits, balances, top-ups or refunds.** Each of them is custody.
- **No FeeRouter service id.** Spec 060 is the source of truth for fees charged to **members on their
  own transactions**; a per-request charge to a non-member for API access is a different thing, and
  registering it as a platform fee would make the member fee surfaces say something untrue.
- **No new token, chain or contract.** USDC, EIP-3009 and the engine are already deployed.
- **No write capability.** The paid rail reaches exactly the spec-095 operations and no others.
- **No pricing dynamics**, bidding or negotiation. A class has a price or is not for sale.
