# Tasks: x402 — Pay-Per-Request Access to the Member API

**Input**: Design documents from `/specs/096-x402-agentic-payments/`
**Prerequisites**: plan.md, research.md, contracts/x402-gateway.md, quickstart.md

**Tests**: included — constitution principle II (test-first) is non-negotiable in this repo, and this
feature touches funds. All paths are relative to the repository root. Local vitest runs must stay
scoped (never a bare `vitest run`). Never recover an install with `npm install` — use
`npm run deps:reinstall`.

## Phase 1: Setup

- [X] T001 Verify baseline on the branch before any change: `npm test --workspace fairwins-relay-gateway`, `npm run test:mcp`, `npx vitest run frontend/src/test/e2e-policy/` (record any pre-existing failures in the PR notes)
- [X] T002 Create the spec directory artifacts (`spec.md`, `plan.md`, `research.md`, `contracts/x402-gateway.md`, `quickstart.md`, `checklists/requirements.md`) — the wire contract is a prerequisite for the gateway and MCP work, not documentation written afterwards. The constitution check in `plan.md` MUST engage principle I in substance: this touches funds, and the absence of a Solidity diff is the *outcome* of the design, not a reason the principle did not apply

## Phase 2: Foundational (blocking prerequisites for all user stories)

- [ ] T003 Add the `x402` config block to `services/relay-gateway/src/config/index.js` per contracts/x402-gateway.md §10: `enabled`, `killSwitch`, `chainId`, `payTo`, `settleBufferSeconds`, `maxTimeoutSeconds`, and the three class prices as **strings of base units**. All boot-failing validation **inside `if (enabled)`**: the chain must be enabled and carry a `paymentToken`, a `tokenDomain` and an engine lane; `payTo` must be a well-formed address with **no default**. Document every variable in the file header comment
- [ ] T004 [P] Document the same variables in `services/relay-gateway/.env.example` beside the existing module blocks, stating that `X402_PAY_TO` has no default on purpose and that a price of `0` means the class is not offered
- [ ] T005 Add the operation-class map and the x402 error codes to `services/relay-gateway/src/memberApi/contract.js` — the class per route, and every code from contracts §5 — so `routes.js` prices from it and `openapi.js` documents from it, and neither can hold a second list
- [ ] T006 Create `services/relay-gateway/src/x402/requirements.js`: build the `accepts[]` offer for an operation class from config — CAIP-2 `network`, **string** base-unit `amount`, the chain's `paymentToken` as `asset`, `payTo`, `maxTimeoutSeconds`, and `extra` carrying `assetTransferMethod: 'eip3009'` plus the **token's** EIP-712 `name`/`version` from `config.chains[chainId].tokenDomain`. A class priced `0` produces **no offer at all**
- [ ] T007 Create `services/relay-gateway/src/x402/verify.js`: the ordered checks of contracts §5, each with its own code, **all of them before any submission**. `TRANSFER_WITH_AUTHORIZATION_TYPES` from `@fairwins/intent-types` and the domain from the chain config — **never a local table and never a local domain** (#1038). Screening reuses `policy/sanctions.js`, fail closed. Contract-account payers are EOA-only refusals whose **reason names the limitation** — a bare "invalid signature" is not acceptable
- [ ] T008 Create `services/relay-gateway/src/x402/settle.js`: encode `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)` against the chain's `paymentToken` and submit through the **existing** `engineClient` — injected, never constructed here, and never a new signer. Engine unreachable ⇒ `503 settlement_unavailable` with nothing served
- [ ] T009 Create `services/relay-gateway/src/x402/paywall.js`: the seam the routes call when there is **no usable bearer credential** — returns either a 402 answer or `{ payer }` for a settled payment. The in-process spent-nonce set lives here, bounded, with the Phase-1 comment naming the token's own `authorizationState` as the durable guarantee
- [ ] T010 Wire the paywall into `services/relay-gateway/src/memberApi/routes.js` on the priced operations only, **after** authentication has declined to produce an account. A valid bearer MUST short-circuit before the paywall is reachable — including when a payment is also attached. `openapi.json` and the key routes are never priced
- [ ] T011 Splice `x402: { enabled, killSwitch, network, priced }` into the `/status` `memberApi` block in `services/relay-gateway/src/server.js` — public configuration only, **never** a treasury balance or a settlement count
- [ ] T012 Create `services/relay-gateway/test/x402.test.js`: real `ethers.Wallet` signatures over the **token's** domain (the EIP-3009 idiom the intent tests already use), an engine mock recording the settlement calldata, and the full matrix — 402 shape when unauthenticated on a priced op; **a valid bearer bypasses the paywall, even with a payment attached**; every verification failure code; `403 sanctioned_signer`; a settled payment serving the op with `X-PAYMENT-RESPONSE`; engine down ⇒ `503` and **nothing served**; killswitch and module-off codes; an in-process replay refused; a class priced `0` answering `401` as before and **never** `402`

**Checkpoint**: the rail exists, refuses correctly, and cannot charge a member.

## Phase 3: User Story 1 — An agent with no account pays for one answer (P1) 🎯 MVP

**Goal**: offer → payment → settlement → data, for a caller with no FairWins credential.

**Independent test**: quickstart.md §1, §2.

- [ ] T013 [US1] Confirm the served answer is computed for `authorization.from` — the paid request reads the **payer's** membership, wagers and profile, not an anonymous or platform-scoped view
- [ ] T014 [US1] Force the actor of `POST /v1/member/intents/build` to the **payer** address on the paid rail, exactly as it is forced to the token account on the membership rail, and extend the gateway suite with a body-supplied actor being overridden
- [ ] T015 [US1] Return the settlement as a base64 `X-PAYMENT-RESPONSE` header (`success`, `transaction`, `network`, `payer`, `amount`) and assert its shape in the suite; every surface that reports it says **broadcast, not finality**

**Checkpoint**: US1 complete — the exchange works end to end for a caller the platform has never met.

## Phase 4: User Story 2 — A member's agent rides free (P1)

**Goal**: the paid rail is invisible to everyone who already paid.

**Independent test**: quickstart.md §3.

- [ ] T016 [US2] Run the whole spec-095 gateway suite with the rail **enabled and everything priced**; it must pass unchanged. Any diff is a defect in this feature, never a test to update
- [ ] T017 [US2] Assert that a valid bearer with `X-PAYMENT` attached is served on the membership rail with **no** settlement, and that the engine mock recorded nothing
- [ ] T018 [US2] Assert that an expired or revoked token on a priced operation is refused for the **token's** reason — "you must pay" is never the stated cause of a rejected key

**Checkpoint**: US2 complete — members cannot be charged, by us or by anyone else.

## Phase 5: User Story 3 — A refused payment costs nothing (P1)

**Goal**: every failure is distinct, free, and serves nothing.

**Independent test**: quickstart.md §4, §5.

- [ ] T019 [US3] Assert the verify-before-settle ordering directly: for every failure code, the engine mock must have been asked to submit **nothing**
- [ ] T020 [US3] Assert `503 settlement_unavailable` when the engine is down — no data in the body, no charge, and the payload still settles after the engine returns
- [ ] T021 [P] [US3] Assert every 402 body restates the offer alongside its `error` code, so an agent can correct in one round trip

**Checkpoint**: US3 complete — the two ways a payment rail hurts people are both unreachable.

## Phase 6: User Story 4 — Operating it (P2)

**Goal**: it can be priced, watched and stopped.

**Independent test**: quickstart.md §7, and the boot check in §Bringing the rail up.

- [ ] T022 [US4] Assert the boot refusal: enabled with no `X402_PAY_TO`, an unknown chain, a chain with no `paymentToken`, or no engine lane — each fails loudly and names what is missing, and **only** inside `if (enabled)`
- [ ] T023 [US4] Assert the killswitch: the offer is withdrawn (a priced route refuses exactly as an unpriced one does), a request carrying a payment settles **nothing**, and member traffic is unaffected
- [ ] T024 [P] [US4] Extend `services/relay-gateway/src/memberApi/openapi.js` with the `402` response schema, the `X-PAYMENT` / `X-PAYMENT-RESPONSE` header documentation and an `x402` tag description, and extend the openapi/routes drift test so a priced route with no documented `402` fails

**Checkpoint**: US4 complete — an operator can price it, read it and stop it.

## Phase 7: User Story 5 — The MCP server carries payments (P3)

**Goal**: the reference agent client surfaces the price and forwards a payment it cannot make.

**Independent test**: quickstart.md §8.

- [X] T025 [US5] `services/mcp-server/src/api.js`: a `402` carrying an `accepts[]` becomes a `PaymentRequiredError` holding the offer whole (decoded **before** the generic error mapping, which would flatten it to `http_402`); an `xPayment` option becomes an `X-PAYMENT` header forwarded byte-for-byte; a supplied payment **replaces** the bearer for that call; `decodeSettlement` reads the receipt and never throws
- [X] T026 [US5] `services/mcp-server/src/tools.js`: a 402 renders the full `accepts[]` plus "this server cannot pay — it holds no key and signs nothing", worded as a **price, not an outage**; a settled call appends the receipt as a second content block saying broadcast-not-confirmed. A payment is never a tool **argument**
- [X] T027 [US5] `services/mcp-server/src/transport/http.js`: inbound `X-Payment` → per-request context; the upstream `X-PAYMENT-RESPONSE` echoed back as the gateway's **original bytes**. stdio documents that it cannot carry a payment rather than approximating it with an env var
- [X] T028 [P] [US5] `services/mcp-server/test/x402.test.js` (`node:test`): offer surfaced whole; a non-x402 402 stays an ordinary error; passthrough byte-for-byte with no `Authorization` alongside; receipt returned and decoded; a rejected payment restates the offer with its reason and no receipt; `paymentFrom` and `decodeSettlement` unit cases
- [X] T029 [P] [US5] Update `services/mcp-server/README.md` and `src/guide.md` (the resource an agent reads first) with the paying-per-request flow, the price-discovery step via `get_gateway_status`, and the stdio limitation

**Checkpoint**: US5 complete — an agent can discover the price, pay it itself, and read the receipt.

## Phase 8: Polish & cross-cutting

- [X] T030 [P] Write `docs/developer-guide/agentic-payments.md` in the house style (`# Title (spec 096)`, ASCII exchange diagram, why-shaped-this-way, an Invariants section)
- [X] T031 [P] Extend `docs/developer-guide/member-api.md` (the second rail, and that a member is never charged) and `docs/developer-guide/mcp-server.md` (carries payments, never makes them)
- [X] T032 [P] Extend `docs/runbooks/member-api-operations.md` with an x402 section: enabling, choosing and changing the treasury, pricing, the two off-switches (stop **offering** vs stop **taking**), the replay posture, and the incident rows
- [X] T033 [P] Document the `X402_*` variables in `docs/reference/configuration.md`, and add the new page to `mkdocs.yml` `nav:`
- [X] T034 Add the `096-x402-agentic-payments` row to `frontend/cypress/coverage/matrix.json` — `memberFacing: false` with the reason (agent-facing HTTP rail, no member surface; the gateway vitest suite is its gate). A spec directory with no row fails CI
- [ ] T035 Regenerate the coverage doc (`npm run e2e:matrix`) — never hand-edit `docs/developer-guide/e2e-coverage-matrix.md`
- [X] T036 [P] Extend the spec-095 bullet in `CLAUDE.md` with the x402 rail: never applies to a member's bearer request; the payer is screened; settlement rides the existing engine; prices are env config with `0` = off
- [ ] T037 Full verification per the `monorepo-verify` skill: the gateway suite (including spec-095's, unchanged, with the rail on), `npm run test:mcp`, `npx vitest run frontend/src/test/e2e-policy/`, and confirm **no `contracts/` file changed** — state in the PR that the bytecode and storage-layout gates are therefore unaffected
- [ ] T038 Update `specs/096-x402-agentic-payments/spec.md` status → Implemented; check off the quickstart success criteria; open the PR against `staging` with a `feat(...)` title, and say in the description that this feature **touches funds** and why no contract changed

## Dependencies

- Phase 2 blocks everything. T003 blocks T006/T007/T008; T005 blocks T010 and T024; T006 blocks T009;
  T007 and T008 block T009; T009 blocks T010; T010 blocks T011 and T012.
- **US1 (Phase 3)** needs Phase 2 only and is the MVP — it is the story the whole feature exists for.
- **US2 (Phase 4)** needs T010 (the short-circuit it asserts) and is the gate on shipping at all.
- **US3 (Phase 5)** needs T007/T008 and is where the verify-before-settle ordering is proven.
- **US4 (Phase 6)** needs T003 (boot validation) and T011 (`/status`).
- **US5 (Phase 7)** needs only the wire contract, so it is independent of the gateway work and can be
  built in parallel against contracts/x402-gateway.md.
- **Phase 8** needs the surfaces it documents; T034 blocks T035.
- Suggested MVP: Phases 1–4 — the exchange plus the proof that members are untouched by it. Phase 5
  is required before any deployment that takes real money; Phases 6–8 are required before merge.

## Parallel execution examples

- After T003: T004 (env docs), T005 (surface constants) and the whole of Phase 7 (the MCP server,
  which needs only the contract) are three independent tracks.
- T006/T007/T008 are three files with one dependency each on config, and can be written together.
- T030–T033 (docs) run in parallel with T034 (the coverage row) and T036 (CLAUDE.md).
