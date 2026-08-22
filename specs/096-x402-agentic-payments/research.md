# Research: x402 pay-per-request access (096)

Phase 0 output. Sources: the x402 protocol specification (protocol version **2**, as published by
coinbase/x402, read 2026-08) and its `exact` EVM scheme; the shipped spec-095 module
(`services/relay-gateway/src/memberApi/**` and its tests); the gateway's payment-intent path
(`src/intent/verify.js`, `src/config/{index,chains}.js`, `src/engine/client.js`); the shared EIP-712
tables in `packages/intent-types/src/index.js`; the sanctions and quota primitives in
`src/policy/`; `services/mcp-server/**`; and `.specify/memory/constitution.md`.

References are to files as they exist on this branch.

---

## R1 — The wire format is x402 protocol version 2, taken as published

**Decision**: implement the protocol as specified rather than a FairWins-shaped approximation of it.
A `402` carries `{ x402Version, error?, resource, accepts[] }`; a retry carries the base64 JSON
`PaymentPayload` in an `X-PAYMENT` request header; a served paid request carries the base64 JSON
`SettlementResponse` in an `X-PAYMENT-RESPONSE` response header. Networks are named in **CAIP-2**
form (`eip155:137`), amounts are strings in the asset's own base units, and the `exact` scheme's
`extra` object carries the payment token's EIP-712 domain `name` and `version`.

**Rationale**: the entire value of x402 is that a client the platform has never met can complete the
exchange without reading this repository. Every deviation — a different header name, a numeric chain
id, an amount as a number — converts a protocol into a private API with a protocol's name on it, and
the agent runtimes that already speak x402 are exactly the callers this feature is for. The pieces
that are genuinely ours are the *values*: which operations are priced, at what, on which chain, and
to whom.

Two details are easy to get subtly wrong and are called out in the contract:

- **Amounts are strings in base units.** USDC has 6 decimals, so `"10000"` is one cent. A JSON number
  is a double; a price expressed as one is a rounding error waiting for a bigger price.
- **`extra.name` / `extra.version` are the *token's* EIP-712 domain**, not FairWins'. The signature
  is verified by the token contract, and a payload signed under a FairWins domain verifies nowhere.

**Alternatives rejected**: (a) a bespoke `X-FairWins-Payment` scheme — all of the cost, none of the
interoperability; (b) protocol version 1 — v2's `accepts[]` array is what lets one offer name several
acceptable assets or networks later without a breaking change.

## R2 — Self-settled through the existing engine; no facilitator

**Decision**: FairWins verifies and settles the payment itself, submitting the token call through
`src/engine/client.js` — the same relayer lane that already broadcasts every member-signed intent. No
x402 facilitator service is contacted, and none is depended on.

**Rationale**:

1. **The submission path already exists and is already policed.** `createEngineClient` takes a built
   transaction (`to`, `data`, `speed`) and nothing else; all policy stays in the gateway. A payment
   settlement is one more built transaction. A facilitator would be a second party in the value path
   whose availability decides whether FairWins can answer a request.
2. **Verification is arithmetic we already do.** Recovering the signer of an EIP-3009 authorisation
   under a token's domain is exactly what `recoverPaymentSigner` in `src/intent/verify.js` does for
   the `payment` intent class today. There is nothing to outsource.
3. **A facilitator would need trust it cannot be given.** Delegating verification means accepting
   somebody else's answer about whether the platform was paid.
4. **The gateway holds no key, and this does not change that.** The engine holds the relayer key, as
   it does for every other submission; the *payer's* authority is their own signature.

**Alternatives rejected**: (a) the reference facilitator — a runtime dependency in the money path for
work already implemented here; (b) requiring the payer to broadcast the transfer themselves and prove
it — that is a receipt-checking protocol, not x402, and it makes the agent pay gas on a chain it may
have no native balance on.

## R3 — `transferWithAuthorization`, not `receiveWithAuthorization`

**Decision**: the payer signs **`TransferWithAuthorization`**, and the gateway submits it.

**Rationale**: the two EIP-3009 legs differ only in who may submit them, and the header comment on
`packages/intent-types/src/index.js` says exactly why that matters. `ReceiveWithAuthorization`
requires `to == msg.sender`, so only the *recipient contract* can submit it — which is right for the
escrow pulls it is used for, where the escrow is both caller and recipient. Here the recipient is the
platform treasury, an address that submits nothing; the submitter is the relayer. That is
`TransferWithAuthorization`, and confusing the two produces an authorisation with the wrong submitter
rule that simply reverts. This is also the leg x402's `exact` EVM scheme names.

**The type table has one source.** `TRANSFER_WITH_AUTHORIZATION_TYPES` is imported from
`@fairwins/intent-types`; the token domain comes from the chain config the intent pipeline already
uses (`chains.js#tokenDomain` — `{ name: 'USD Coin', version: '2' }` on Polygon, `{ name: 'USDC' }` on
Amoy — with `paymentToken` as the verifying contract). **Never a local table and never a local
domain**: issue #1038 in this repo is precisely a correct type table under a drifted domain producing
signatures that verify nowhere.

**Alternatives rejected**: (a) `permit` + `transferFrom` — two transactions, an allowance left
standing, and a standing allowance to a platform contract is exactly the custody surface this feature
must not create; (b) a direct transfer the payer broadcasts — see R2.

## R4 — Verify completely, then settle. Never the reverse

**Decision**: every check runs before the token call is built, in a fixed order, each failure with
its own machine code: parse → offer match (scheme, network, asset, recipient) → amount ≥ price →
validity window with a settle buffer → signature recovers to the payer → sanctions screen →
not-already-spent → payer can pay → settle.

**Rationale**: the ordering is the safety property, not a style choice. Two failure shapes are
possible on a payment rail and only one of them is acceptable:

- *charged and not served* — money taken for nothing, and no way for the payer to recover it;
- *served and not charged* — a bug that costs the platform, and nobody else.

Verifying first makes the first shape unreachable: nothing is submitted until it is known to be
acceptable. That is also why an unavailable engine is a **refusal** rather than a free serve
(FR-015) — a settlement outage must not become a discount, and must not strand a payer either.

The **settle buffer** exists for the same reason. An authorisation valid for another two seconds is
valid at the moment it is checked and expired by the time it lands; refusing it costs the payer a
retry, and accepting it could cost them a payment that reverts after being submitted.

## R5 — Replay: best-effort here, durable on chain, and both said out loud

**Decision**: keep an in-process record of spent authorisation nonces, and state in the contract, the
docs and the runbook that it is Phase 1 — a restart forgets it — while the durable guarantee is the
token's own `authorizationState` mapping, which makes a replayed authorisation revert on chain.

**Rationale**: this is the spec-095 revocation situation exactly (`src/memberApi/revocation.js`,
`durable: false` on every answer), and it has the same correct answer: the weak guarantee is
disclosed, and the strong one is named. It is *stronger* here than there, because the fallback is not
"the grant eventually expires" but "the token contract refuses it outright" — the worst case of a
lost in-process set is a settlement that reverts and a request that is refused, not a double charge.

**Alternatives rejected**: (a) claiming durable replay protection — false; (b) adding a datastore to
the gateway to get it — the gateway persists nothing by design, and this feature is not the reason to
change that; (c) skipping the in-process check and relying purely on the chain — it would waste a
submission and a payer's gas allowance on every replayed request, and answer a fast, free "no" as a
slow, on-chain one.

## R6 — Externally-owned payers only, and the refusal says so

**Decision**: the payment signature is verified as an ordinary ECDSA recovery to
`authorization.from`. A contract account is refused with a reason that names the limitation.

**Rationale**: this looks like it contradicts the platform's own three-verdict rule (spec 084, and
spec 095's `auth_unverifiable`), and it does not — it is that rule applied one layer down. The party
that verifies a payment authorisation is **the token contract**, not FairWins, and USDC's EIP-3009
implementation checks an ordinary signature. An "unverifiable" verdict would be inviting a payer to
retry something the token will never accept. So the answer is a *known* refusal with a stated reason,
which is the honest verdict here — and the reason names the alternative (the membership rail, where
contract accounts are fully supported through ERC-1271).

What must not happen is a contract-account payer being told "invalid signature", which reads as "you
signed wrong" for a payer that signed correctly for a scheme this rail does not accept.

## R7 — A valid token is checked first, and is never charged

**Decision**: authentication runs before the paywall. The payment path is entered **only** when there
is no usable bearer credential; a request that presents a valid token never reaches it, even if a
payment is attached.

**Rationale**: two failure modes make this load-bearing rather than obvious. A member could be billed
for a request their membership already covers (charging twice for one thing), and a third party could
attach a payment to somebody else's authenticated request. Ordering the checks removes both: the
paywall is unreachable with a valid token in hand.

The corollary matters too — a request with an **invalid** token on a priced operation is refused for
the token's reason. "You must pay" is never the explanation for why a token was rejected; a member
whose key expired needs to hear that their key expired.

## R8 — Pricing is per operation class, zero means not for sale, and the treasury has no default

**Decision**: three configured prices — reads, typed-data builds, assistant turns — each in USDC base
units, each `0` meaning that class is **not offered** on the paid rail. The recipient
(`X402_PAY_TO`) is **required** when the rail is enabled and has **no default**.

**Rationale**:

1. **Per class, not per endpoint.** A new read endpoint should inherit an agreed price rather than
   ship unpriced (silently free) or arbitrarily priced (a number nobody agreed to).
2. **Zero is off, not free.** A zero price with an offer attached would advertise a free paid rail,
   which is a strictly worse way of saying "no credential required". Absence of an offer is the
   honest encoding.
3. **No default recipient, ever.** A default treasury address is a default destination for other
   people's money; a stale one is money sent to an address nobody holds. Boot-failing when the rail
   is enabled without one is the only safe behaviour, and it stays inside the `if (enabled)` branch
   so an unconfigured optional module can never take the relay path down (the spec-095 rule).
4. **Assistant turns are priced separately and highest** because they are the only operation with a
   marginal cost to the platform (model spend), and the only one where an unpriced loop is expensive
   rather than merely noisy.

## R9 — What a payment buys: one answer, as the payer

**Decision**: a settled payment authorises exactly the request it accompanied and creates nothing
that outlives it — no session, no credit, no balance. The paid request is served as the payer's own
account: screened like any other, and the actor of any built typed data forced to the payer address.

**Rationale**: a balance would make the platform a custodian of prepaid funds, which is the one thing
this design is shaped to avoid; a session would make a single payment into standing access. Forcing
the actor is the spec-095 invariant (`R8` there) applied to the new identity source: on the token
rail the actor is the token's account, on the paid rail it is the payer, and in neither case does the
request body get a say. Screening the payer is not optional either — a rail that skips screening for
callers who pay is a rail that sells the thing screening exists to prevent.

## R10 — The intermediary carries payments and never makes them

**Decision**: `services/mcp-server` surfaces a `402` whole — the full `accepts[]` plus a statement
that it holds no key and cannot pay — and forwards a caller-supplied `X-PAYMENT` header upstream
unaltered, returning the `X-PAYMENT-RESPONSE` receipt to whoever paid. It gains no key, no wallet and
no dependency.

**Rationale**: an intermediary that could pay would be an intermediary that could be *made* to pay by
anything that can call it — and the caller here is a language model. Two consequences shape the code:
the payment is never a **tool argument** (a tool argument is model-authored text, and the one thing a
model must not be able to author is a transfer authorisation), and the payload is forwarded
byte-for-byte rather than re-encoded (a re-encoded payload is a different signature payload).

Price discovery for a caller with no token is the public status surface, which reports whether the
rail is on and what each class costs — so an agent can learn the price without spending anything and
without a token.

**The stdio transport cannot carry a payment, and says so** rather than approximating it with an
environment variable: a payload replayable out of configuration would be a standing withdrawal, not a
single-use authorisation.

## R11 — Deliberately not built

- **No facilitator integration**, inbound or outbound. FairWins does not host one and does not call
  one (R2).
- **No credits, balances or top-ups.** Custody, immediately.
- **No FeeRouter service id.** Spec 060 is the single source of truth for fees charged to **members
  on their own transactions**; a per-request charge to a non-member for API access is a different
  thing, and registering it as a platform fee would make the fee surfaces say something untrue about
  what members pay. This is stated because the resemblance is close enough to be worth refusing
  explicitly.
- **No new chain and no new token.** The rail runs where the platform's payment token and its relayer
  lane already exist.
- **No pricing dynamics.** An operation class has a price or is not for sale (R8).
- **No contract change.** Nothing under `contracts/` is touched; USDC, EIP-3009 and the engine are
  already deployed.
