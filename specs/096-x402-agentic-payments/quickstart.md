# Quickstart: validating the x402 pay-per-request rail (096)

## Prerequisites

- `npm run deps:reinstall` has been run at least once on this checkout (never a bare `npm install` —
  see the `monorepo-workspace` skill).
- The spec-095 member API working locally. This rail is a second door on those rooms; if the rooms
  are shut there is nothing to price.
- An **EOA** with a USDC balance on the chain you point `X402_CHAIN_ID` at, and its private key
  available to a scratch script. This is the payer. A smart-contract account is useful too — it must
  be refused with a *named* limitation (§8).
- A relayer engine reachable from the gateway, or a stub that records what it was asked to submit.
  Settlement goes through the same lane as every other member-signed instruction.
- Node ≥ 20 for the MCP server (no install step — it has no dependencies).

## Scoped test runs (local — never run the full unfiltered vitest suite locally)

```bash
# The rail itself: the whole refusal matrix, the never-charge-a-member invariant, both off-switches
npm test --workspace fairwins-relay-gateway -- test/x402.test.js

# Spec 095 must be unchanged by this feature — with the rail ON and everything priced, these pass
# byte-identically. This is SC-002, and it is the test that matters most.
npm test --workspace fairwins-relay-gateway -- test/memberApiAuth.test.js test/memberApi.test.js

# The MCP server: 402 surfacing, header passthrough, receipt return (no runner dependency)
npm run test:mcp

# The coverage matrix must have a row for this spec directory, or CI fails
npx vitest run frontend/src/test/e2e-policy/
```

## Bringing the rail up locally

```bash
# services/relay-gateway/.env — OFF by default, on purpose
MEMBER_API_ENABLED=true

X402_ENABLED=true
X402_CHAIN_ID=137
X402_PAY_TO=0x…                 # REQUIRED. There is no default, deliberately.
X402_PRICE_READ=10000           # $0.01
X402_PRICE_BUILD=50000
X402_PRICE_ASSISTANT=0          # 0 = this class is NOT offered

npm run dev --workspace fairwins-relay-gateway
```

Sanity check before anything else — the rail must announce itself, and its prices, publicly:

```bash
curl -s localhost:8788/status | jq '.memberApi.x402'
# {
#   "enabled": true, "killSwitch": false, "network": "eip155:137",
#   "priced": { "read": "10000", "build": "50000", "assistant": null }
# }
```

Nothing about the treasury beyond the address that is already in every offer may appear here. If you
can read a balance or a settlement count from `/status`, that is a defect.

**Then delete `X402_PAY_TO` and restart.** The gateway must refuse to start and name what is missing.
A rail that boots without a recipient has invented a destination for other people's money.

## Manual validation

### 1. The offer (US1 / SC-001)

```bash
BASE=http://localhost:8788
curl -si "$BASE/v1/member/fees" | head -1        # HTTP/1.1 402 Payment Required
curl -s  "$BASE/v1/member/fees" | jq
```

Expect the §3 shape: `x402Version: 2`, a `resource`, and one `accepts` entry. Check each field for
the mistakes that are easy to make and invisible until an agent tries to pay:

- `amount` is a **string** in base units (`"10000"`, not `10000` and not `0.01`);
- `network` is **CAIP-2** (`eip155:137`, not `137`);
- `asset` is the chain's real USDC address, `payTo` is your configured treasury;
- `extra.name` / `extra.version` are the **token's** EIP-712 domain (`USD Coin` / `2` on Polygon) —
  **not** a FairWins domain. Cross-check against `src/config/chains.js#tokenDomain`.

Now set `X402_PRICE_READ=0`, restart, and repeat. Expect the ordinary spec-095 refusal
(`401 invalid_token`) and **no 402 at all**. Zero is *off*, not *free*.

### 2. Paying (US1 / SC-001, SC-003)

Sign a `TransferWithAuthorization` for the offer with the payer's key — the struct from
`@fairwins/intent-types` (`TRANSFER_WITH_AUTHORIZATION_TYPES`), under the **token's** domain
(`{ name, version, chainId, verifyingContract: asset }`) — base64 the payload, and retry:

```bash
curl -si "$BASE/v1/member/fees" -H "X-PAYMENT: $PAYLOAD_B64"
```

Expect: `200`, the live fee rates, and an `X-PAYMENT-RESPONSE` header. Decode it:

```bash
echo "$RECEIPT_B64" | base64 -d | jq
# { "success": true, "transaction": "0x…", "network": "eip155:137", "payer": "0x…", "amount": "10000" }
```

Then check the payer's USDC balance moved by **exactly** the offered amount, and confirm the engine
was asked to submit `transferWithAuthorization` against the chain's USDC — not against any FairWins
contract, and not from any platform-held balance.

### 3. A member is never charged (US2 / SC-002)

The single most important check in this document.

```bash
TOKEN='fw1.…'   # a valid capability token
curl -si "$BASE/v1/member/fees" -H "Authorization: Bearer $TOKEN" | head -1   # 200, no 402
curl -si "$BASE/v1/member/fees" -H "Authorization: Bearer $TOKEN" \
                                -H "X-PAYMENT: $PAYLOAD_B64" | head -1        # 200
```

Expect on the second call: served on the **membership** rail, **no** `X-PAYMENT-RESPONSE` header, and
the payer's balance unchanged. A member who presents a token must not be billable by anyone, including
by a third party attaching a payment to their request.

Then present an **expired** token on a priced operation. Expect a `402` whose `error` is
**`token_expired`**, not `payment_required` — the paid rail may stand in for that verdict, but the
diagnostic must survive. "You must pay" is never the stated reason a key was rejected.

Then present a token that is merely **under-scoped**, and one while the reference-chain RPC is
broken. Expect `403 insufficient_scope` and `503 auth_unverifiable` respectively, with **no offer at
all**: a caller with a working key needs a wider key (which is free), and an RPC outage is ours to
fix — charging for either would be selling our own failure.

### 4. Every refusal costs nothing (US3 / SC-003)

Run each of these and confirm, every time: a **distinct** `error` code, the offer restated so the
agent can correct, **no data** in the body, and **no change** to the payer's balance.

| Break this | Expect |
|---|---|
| corrupt the base64 | `payment_malformed` |
| change `payTo` to another address | `payment_recipient_mismatch` |
| set `value` one unit below the price | `payment_insufficient` |
| set `validAfter` in the future | `payment_not_yet_valid` |
| set `validBefore` in the past | `payment_expired` |
| set `validBefore` to `now + 5s` | `payment_expired` (the settle buffer — same code, because both mean *sign another one*) |
| sign with a different key | `payment_signature_invalid` |
| pay from a smart-contract account | `payment_signature_invalid`, whose **reason must say this rail takes EOA signatures only** and point at the membership rail |
| a screened address | `403 sanctioned_signer` |
| screening source down | `503 screening_unavailable` (fail closed) |
| replay a spent payload | `payment_replayed` |
| an empty payer balance | `payment_insufficient_balance` (an **unreadable** balance is `503 settlement_unavailable`, never an accusation) |
| engine unreachable | `503 settlement_unavailable`, **nothing served, nothing charged** |

The last row is the one to be most careful about: an outage must not become a free tier. Confirm the
body carries no data at all, then bring the engine back and confirm the same payload settles.

### 5. Replay, honestly (SC-003)

Replay a spent payload: refused `payment_replayed`. Now **restart the gateway** and replay it again.
Expect the settlement to be attempted and to fail on chain, answered `503 settlement_unavailable` —
and confirm the payer was **not** charged twice. Then confirm the documentation says exactly this:
in-process replay protection is best-effort, and the durable guarantee is the token's own
`authorizationState`. If any surface claims durable replay protection, that is the defect.

### 6. A payment buys one answer (SC-007)

Repeat the paid call with the **same** payload after a successful settlement: refused. There is no
session, no credit and no balance — confirm nothing in `/status` or any response implies otherwise.

Then pay for `POST /v1/member/intents/build` with an `actor`/`creator` field set to somebody else's
address in the body. Expect the built typed data to name the **payer** as the acting party. The
request body never gets a say — the same invariant the token rail has.

### 7. The off-switches (US4 / SC-010)

```bash
# X402_KILLSWITCH=true, restart
curl -si "$BASE/v1/member/fees" | head -1                             # 401, no offer
curl -si "$BASE/v1/member/fees" -H "X-PAYMENT: $PAYLOAD_B64" | head -1 # 401 — the offer is withdrawn,
                                                                      # and nothing was settled
curl -si "$BASE/v1/member/fees" -H "Authorization: Bearer $TOKEN"      # 200, unaffected
```

Then `X402_ENABLED=false`, restart, and re-run the whole spec-095 quickstart. Every path must behave
exactly as it did before this feature existed (SC-005).

### 8. Through the MCP server (US5 / SC-009)

```bash
FAIRWINS_API_URL=$BASE node services/mcp-server/src/server.js --http 8790

curl -s -X POST localhost:8790/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_fees","arguments":{}}}' | jq -r '.result.content[].text'
```

Expect the **whole** offer in the tool result — every field an agent must sign against — plus the
statement that this server holds no key and cannot pay, and wording that reads as a **price**, not as
an outage. Then retry with the payment:

```bash
curl -si -X POST localhost:8790/mcp -H 'content-type: application/json' \
  -H "X-PAYMENT: $PAYLOAD_B64" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_fees","arguments":{}}}'
```

Expect the data, an `X-PAYMENT-RESPONSE` header carrying the gateway's **original bytes**, and a
second content block restating the receipt with "broadcast, not confirmed". Confirm from the gateway
side that the forwarded `X-PAYMENT` header was byte-identical to what you sent, and that no
`Authorization` header rode along with it.

Finally, confirm the guide an agent reads first says all of this:
`resources/read` `fairwins://guide` → the **Paying per request** section.

### 9. Nothing leaks (SC-008)

```bash
# with the gateway's logs at their most verbose, after a full paid request
grep -c "$(echo "$PAYLOAD_B64" | cut -c1-24)" gateway.log   # 0
grep -ci "0x$(printf '%s' "$NONCE" | tail -c 16)" gateway.log  # 0
```

No payment signature and no authorisation nonce may appear in any log line, audit record or response
body. The operation, the payer, the amount and the settlement transaction may — all four are public
and together are what makes a payment reconcilable.

## End-to-end pointers

There is **no member-facing flow** here and therefore no Cypress spec: the rail is agent-facing HTTP
with no UI at either end. `frontend/cypress/coverage/matrix.json` carries the row as
`memberFacing: false` with that reason, and the gateway vitest suite is its gate. Adding a browser
test would be testing the absence of a surface.

## What "done" looks like

- An agent with **no FairWins credential** completes offer → payment → settlement → data in two HTTP
  requests, with no account and no onboarding (SC-001).
- The complete spec-095 suite passes **unchanged with the rail on and everything priced**, and no
  member-authenticated request ever enters the payment path (SC-002).
- Every refusal in §4 is distinguishable, costs the payer nothing, and serves no data (SC-003).
- No code path holds a payer's funds and no platform key signs anything (SC-004).
- `X402_ENABLED=false` restores spec-095 behaviour exactly (SC-005).
- The served OpenAPI document describes the 402 answer and both headers on every priced operation
  (SC-006).
- A paid build names the payer as the actor, always (SC-007).
- No signature and no nonce anywhere in logs, audit or bodies (SC-008).
- An MCP-connected agent gets the full offer plus "this server cannot pay", and can settle it itself
  (SC-009).
- The rail can be stopped without stopping the member API, and cannot be started without an
  explicitly configured treasury (SC-010).
