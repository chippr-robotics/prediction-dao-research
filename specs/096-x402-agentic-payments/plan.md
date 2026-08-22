# Implementation Plan: x402 — Pay-Per-Request Access to the Member API

**Branch**: `claude/openapi-agentic-chat-7cv5re` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/096-x402-agentic-payments/spec.md`

## Summary

Add a **second authentication rail** to the spec-095 member API: an agent holding no capability token
may pay per request. A priced operation called with no usable bearer credential answers **HTTP 402**
with an x402 v2 `PaymentRequirements` offer; the agent signs an **EIP-3009
`TransferWithAuthorization`** on the chain's USDC to the platform treasury and repeats the request
with the base64 payload in an `X-PAYMENT` header; the gateway verifies it in a fixed order, settles
it through the **existing relay engine**, and serves the operation **as the payer's account**, with
the settlement reported in an `X-PAYMENT-RESPONSE` header.

The rail lives in a new optional gateway module (`services/relay-gateway/src/x402/`) following the
house pattern exactly — config block → boot validation inside `if (enabled)` → a seam the memberApi
routes call → a `/status` contribution. The **bearer path is checked first**, so a member with a
valid token is never priced, never offered and never charged. The MCP server gains 402 surfacing and
an `X-PAYMENT` passthrough; it holds no key and cannot pay.

**No contract changes, no deployment, no new token, no new chain.** USDC, its EIP-3009 entry point
and the relay engine are already deployed and already used by the payment-intent path.

## Technical Context

**Language/Version**: JavaScript (ES2022). Gateway: Node ≥ 20 ESM + Express 5. MCP server: Node ≥ 20
ESM, **zero dependencies**.

**Primary Dependencies**: existing only. The gateway already depends on `ethers` (signature recovery,
calldata encoding) and `@fairwins/intent-types` (`TRANSFER_WITH_AUTHORIZATION_TYPES`). No x402 SDK,
no facilitator client, no new package in any tree that has a lockfile. The MCP server stays
dependency-free and outside `workspaces`.

**Storage**: none new. The spent-authorisation record is an in-process bounded set with the same
Phase-1 semantics as every other gateway store, and that limit is stated in every surface that
reports it rather than hidden (R5).

**Testing**: Vitest for the gateway (`services/relay-gateway/test/x402.test.js`, supertest, real
`ethers.Wallet` signatures over the token domain, an engine mock recording the settlement calldata);
`node:test` for the MCP server (`services/mcp-server/test/x402.test.js`, a real `node:http` stub
gateway).

**Target Platform**: the relay gateway VM (Polygon/Amoy lanes), and the existing stateless MCP Cloud
Run service.

**Project Type**: service + service. **Zero frontend surface** — this rail is for agents; a member
never sees it, which is why the spec-094 coverage row is `memberFacing: false`.

**Performance Goals**: an unpaid priced request costs one config read and a JSON serialisation. A
paid request adds one signature recovery, one screening read, one balance read and one engine
submission; the balance read and the submission are the only network hops, both already bounded by
the primitives they reuse.

**Constraints**: the gateway persists nothing and holds no key; verification must complete before any
submission; a settlement outage must refuse rather than serve free; no payment signature or nonce may
reach a log or an audit field; every offer must name a network on which the payment token actually
exists.

**Scale/Scope**: 1 new gateway module (~5 files) + 3 gateway files modified (config, memberApi
routes, openapi); 3 MCP server files modified + 1 test; 1 new docs page + 4 extended; 1 coverage row.
No contract, no migration, no deployment record change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Security-first contracts | **PASS — engaged, not waived.** This feature **touches funds**: a payer signs a transfer of their own USDC and the platform submits it. That is exactly why it has a spec at all — the constitution's workflow rule forbids skipping the spec for anything touching funds, and this could otherwise have looked like "a middleware on an existing API". The principle's own text binds changes to `contracts/`, and **there are none**: no Solidity is added, changed, compiled or deployed; no storage layout moves; `npm run check:storage-layout` and the bytecode digest are unaffected because no input to them changes. What is on the value path is entirely pre-existing and already reviewed — the **deployed USDC token** (its EIP-3009 `transferWithAuthorization`, verified by the token itself), and the **deployed relay engine** lane the platform already submits member-signed instructions through. The value-path reasoning the principle demands is therefore in the spec (FR-008…FR-018) and in [contracts/x402-gateway.md](./contracts/x402-gateway.md) §4–§6: verification completes before any submission, so a rejected payment is never submitted; a settlement outage refuses rather than serving free; nothing is escrowed, so there is no balance to drain and no rescue function to need; and the payer's own signature is the only authority in the exchange. The gateway gains **no key** and **no custody** — the property that keeps this out of `contracts/` in the first place. |
| II. Test-first, comprehensive | **PASS** — the gateway suite covers the full refusal matrix (`payment_malformed`, `payment_version_unsupported`, `payment_scheme_unsupported`, `payment_network_mismatch`, `payment_asset_mismatch`, `payment_recipient_mismatch`, `payment_insufficient`, `payment_not_yet_valid`, `payment_expired`, `payment_signature_invalid`, `sanctioned_signer`, `screening_unavailable`, `payment_replayed`, `payment_insufficient_balance`, `settlement_unavailable`), signing with real `ethers.Wallet` keys over the **token's** domain; the never-charge-a-member invariant (a valid bearer bypasses the paywall even with a payment attached); the zero-price case answering 401 exactly as today, never 402; and both off-switches. The MCP server ships `node:test` coverage for 402 surfacing, byte-for-byte header passthrough, receipt return, and the not-an-offer fallback. |
| III. Honest state | **PASS (load-bearing)** — three claims this feature could make untruthfully, and does not. **"Settled"**: the engine accepting a submission is a **broadcast**, not finality, and every surface says so — the response header, the MCP tool result and the docs (FR-014). **"Not replayable"**: the in-process spent-nonce set does not survive a restart, so the durable guarantee is named as the token's own on-chain authorisation state rather than claimed here (FR-011). **"Unavailable"**: a settlement outage is refused as unavailable and never quietly served free — a discount presented as an outage, or an outage presented as a price, are both fabrications. A 402 is additionally never presented as a failed read: a price is not an absence. Cohort isolation is unchanged — an offer names one network and a payment for another is refused. |
| IV. Fail loudly in CI | **PASS** — no `continue-on-error` anywhere. Boot validation for the rail (chain enabled, payment token present, engine configured, treasury address well-formed) throws **inside** `if (enabled)`, so an unconfigured optional module can never take the relay path down, and an *enabled* one with no treasury refuses to start rather than defaulting a destination for other people's money. The new spec directory carries its `matrix.json` row (spec 094 gate), and the OpenAPI drift test extends to the 402 responses so a priced route cannot be undocumented. |
| V. Accessible, consistent frontend | **PASS (n/a)** — no frontend surface. This rail is agent-facing HTTP; no component, style or member journey changes, and no member-visible behaviour changes while the rail is off (FR-007). The brand and a11y gates are untouched because nothing they inspect moves. |

### New core technologies (constitution, *Additional Constraints*)

**None.** This is the shortest section in any recent plan here, and deliberately so:

- **x402 is a wire format, not a technology.** It is a status code, two headers and a JSON body. No
  SDK, no facilitator client, no runtime. The document that defines it is cited in the contract; the
  code that implements it is `JSON.stringify` and `Buffer.from(…, 'base64')`.
- **EIP-3009 verification and calldata are already in this gateway.** `src/intent/verify.js`
  recovers an EIP-3009 signer under a token domain today; `chains.js` already carries each chain's
  `tokenDomain` and `paymentToken`. This feature reuses both rather than adding a second notion of
  what a payment token is.
- **The engine client is already the submission path.** `src/engine/client.js` takes a built
  transaction; a settlement is one.

**Not** introduced: a facilitator dependency; a datastore; a signing key of any kind; an accounts,
credits or balance concept; a FeeRouter service (R11 — a per-request charge to a **non-member** for
API access is not a platform fee on a member transaction, and registering it as one would make the
fee surfaces say something untrue).

**Post-design re-check (after Phase 1)**: unchanged — no violations, no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/096-x402-agentic-payments/
├── spec.md                       # Feature specification
├── plan.md                       # This file
├── research.md                   # Phase 0 output — the wire facts and the decisions
├── quickstart.md                 # Phase 1 output — manual validation
├── contracts/
│   └── x402-gateway.md           # the wire contract: offer, payload, receipt, codes, config
├── checklists/requirements.md
└── tasks.md                      # Phase 2 output
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── x402/
│   │   ├── requirements.js       # [NEW] build the accepts[] offer for an operation class
│   │   ├── verify.js             # [NEW] the ordered checks — everything before any submission
│   │   ├── settle.js             # [NEW] transferWithAuthorization calldata + engine submission
│   │   └── paywall.js            # [NEW] the seam memberApi routes call when bearer auth is absent
│   ├── memberApi/
│   │   ├── routes.js             # [MODIFY] priced ops take the paywall path when no bearer credential
│   │   ├── contract.js           # [MODIFY] operation class per route + the x402 error codes
│   │   └── openapi.js            # [MODIFY] 402 response schema + header docs + the x402 tag
│   ├── config/index.js           # [MODIFY] `x402` config block; every env in the header comment
│   └── server.js                 # [MODIFY] /status memberApi block gains `x402`
├── .env.example                  # [MODIFY] X402_* documented
└── test/
    └── x402.test.js              # [NEW] real signatures, engine mock, the whole refusal matrix

services/mcp-server/              # still ZERO deps, still not a workspace member
├── src/api.js                    # [MODIFY] X-PAYMENT passthrough, 402 → PaymentRequiredError, receipt decode
├── src/tools.js                  # [MODIFY] surface the offer whole; receipt as a second content block
├── src/transport/http.js         # [MODIFY] inbound X-Payment → ctx; echo X-PAYMENT-RESPONSE
├── src/guide.md                  # [MODIFY] the paying-per-request section agents read first
├── README.md                     # [MODIFY] the same, for humans
└── test/x402.test.js             # [NEW] node:test

docs/
├── developer-guide/agentic-payments.md   # [NEW] spec 096, house style
├── developer-guide/member-api.md         # [MODIFY] the second rail, and that members are never charged
├── developer-guide/mcp-server.md         # [MODIFY] carries payments, never makes them
├── runbooks/member-api-operations.md     # [MODIFY] enable, price, treasury, killswitch, incidents
├── reference/configuration.md            # [MODIFY] the X402_* table
└── ../mkdocs.yml                         # [MODIFY] nav entry

frontend/cypress/coverage/matrix.json     # [MODIFY] the 096 row — memberFacing: false, with its reason
CLAUDE.md                                 # [MODIFY] extend the spec-095 bullet
```

**Structure Decision**: a **separate `x402/` module** rather than more files inside `memberApi/`,
because the two are different subjects: `memberApi/` decides what may be read, `x402/` decides
whether a caller has paid. Keeping them apart means the paywall is a seam the routes *call* rather
than a branch threaded through the auth middleware — which is what makes "a valid token never reaches
the payment path" a structural fact rather than a condition somebody has to keep right. It also
leaves the rail removable: delete the module and the member API is spec 095 again.

## Design Decisions (summary — full reasoning in research.md)

- **R1 The wire format is x402 v2, taken as published.** CAIP-2 networks, string base-unit amounts,
  `X-PAYMENT` / `X-PAYMENT-RESPONSE`, and `extra` carrying the **token's** EIP-712 domain. Every
  deviation would turn a protocol into a private API with a protocol's name on it, and interoperating
  with agent runtimes that already speak x402 is the entire point.
- **R2 Self-settled through the existing engine; no facilitator.** The submission path exists, is
  already policed, and takes a built transaction. A facilitator would put a third party's
  availability and honesty in the value path for work already implemented here.
- **R3 `TransferWithAuthorization`, not `ReceiveWithAuthorization`.** The two differ only in who may
  submit; the recipient here is a treasury address that submits nothing. The type table comes from
  `@fairwins/intent-types` and the domain from `chains.js#tokenDomain` — never a local copy (#1038).
- **R4 Verify completely, then settle.** The order is the safety property: nothing is submitted until
  it is known to be acceptable, so "charged and not served" has no code path. A settle buffer refuses
  an authorisation that could expire in flight rather than charging the payer for a race.
- **R5 Replay protection is best-effort here and durable on chain, and both are said out loud.** The
  in-process nonce set does not survive a restart; the token's own `authorizationState` is what makes
  a replay revert. The worst case of losing the set is a wasted submission, not a double charge.
- **R6 Externally-owned payers only, refused by name.** The token contract verifies the signature and
  accepts an ordinary ECDSA one; an "unverifiable" verdict would invite a retry the token will never
  accept. A contract account is told exactly that, and pointed at the membership rail where ERC-1271
  is fully supported.
- **R7 A valid token is checked first and is never charged**, even when a payment is attached —
  otherwise a third party could bill a member for an answer their membership already covers.
  Conversely an invalid token is refused for the token's reason: "you must pay" is never the
  explanation for why a key was rejected.
- **R8 Prices are per operation class; zero means not for sale; the treasury has no default.** A new
  read endpoint inherits an agreed price rather than shipping silently free. A default recipient is a
  default destination for other people's money, so an enabled rail without one refuses to start.
- **R9 A payment buys one answer, as the payer.** No session, no credit, no balance — a balance would
  make the platform a custodian. The payer is screened like every other caller, and the actor of any
  built typed data is forced to the payer address exactly as it is forced to the token's account.
- **R10 The MCP server carries payments and never makes them.** The payload is never a tool argument
  (a tool argument is model-authored text) and is forwarded byte-for-byte (a re-encoded payload is a
  different signature payload). stdio cannot carry one and says so rather than approximating it with
  an environment variable.
- **R11 Deliberately not built**: no facilitator, no credits or balances, no FeeRouter service id, no
  new chain or token, no pricing dynamics, no contract change.

## Complexity Tracking

No constitution violations. No entries.

The one judgement worth recording here rather than in a violation table: this feature **touches
funds** and therefore ran the full Spec Kit path, including a constitution check that engages
principle I in substance rather than dismissing it as "no contracts changed". The absence of a
Solidity diff is the *outcome* of the design — no escrow, no key, no custody — not a reason the
principle did not apply.
