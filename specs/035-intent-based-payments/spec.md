# Feature Specification: Intent-Based Signatures (Platform-Wide Gasless UX)

**Feature Branch**: `035-intent-based-payments`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "the smart contracts on the platform need to allow for intent based operations like eip 3009 transfer with authorization for our user interactions. this will allow users the most convenient user experience." — clarified in-session to: **the entire platform should operate as intent-based signatures, not just payments.**

## Summary

Today every core action on FairWins costs the user **two on-chain transactions and a native gas token**: a token `approve()` followed by the action itself (create a wager, accept a wager, join a pool, buy membership). A user who holds only the platform stablecoin but no native gas token (POL on Polygon, ETC on Mordor) is stranded — they cannot act at all.

This feature lets users **express what they want as a signed intent**, off-chain, at zero gas cost, and have a submitter broadcast it on-chain. The user signs once; there is no separate approval transaction and no requirement to hold a native gas token. The on-chain outcome is always bound to **the person who signed** — never to the submitter who relayed it — and all compliance, membership, and ownership checks apply to that signer.

One flow already proves the pattern end-to-end in the codebase (anonymous pool join via a signed payment authorization plus a working gas relayer), but it is dormant and unused in the product. This feature **generalizes that pattern to every user-facing action** and turns it on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign-to-stake for wagers, no gas and no approval (Priority: P1)

A user holding only the platform stablecoin (no native gas token) wants to create a wager and have their opponent accept it. Instead of approving a token spend and then paying gas for the create/accept transactions, each user **signs a single intent** ("stake X of my USDC into this wager") and taps confirm. A submitter carries it on-chain. Moments later the wager exists on-chain with the correct creator and opponent recorded, funded from each signer's own balance.

**Why this priority**: Wager creation and acceptance are the platform's primary revenue-driving actions and the most common reason users abandon: needing a native gas token they don't have, plus a confusing two-step approve-then-act flow. Removing both, for the single most-used flow, is the largest single UX win and the natural first slice to prove the end-to-end paradigm on the active mainnet contract (`WagerRegistry`).

**Independent Test**: With a wallet funded with stablecoin but **zero native gas token**, a user can create a wager and a second such wallet can accept it, each by signing exactly once. The resulting on-chain wager records the two signers as creator and opponent, escrowed from their own balances. Fully demonstrable without any other user story implemented.

**Acceptance Scenarios**:

1. **Given** a wallet with sufficient stablecoin and no native gas token, **When** the user signs a create-wager intent for stake X, **Then** the wager is created on-chain with `creator` = the signing wallet, X escrowed from that wallet, and the user paid no gas and signed no separate approval.
2. **Given** a pending wager and an opponent wallet with stablecoin but no native gas token, **When** the opponent signs an accept intent, **Then** the wager is accepted on-chain with `opponent` = the signing wallet and their stake escrowed.
3. **Given** a signed create intent, **When** it is submitted after its validity window has expired, **Then** it is rejected on-chain, no funds move, and the user is shown that the intent expired and can be re-signed.
4. **Given** a signed intent already submitted successfully, **When** the same signature is submitted again, **Then** the second submission is rejected and no double-charge occurs.

---

### User Story 2 - Sign-to-act for outcomes that move no new stake (Priority: P2)

A user wants to claim winnings, propose or approve a draw, decline, cancel/refund, or redeem a membership voucher — actions that require an on-chain transaction (and gas) today but move no *new* stake from the user. The user **signs an intent authorizing that action** and a submitter carries it on-chain. Winnings, refunds, and role grants land in the correct account — the signer's — even though the submitter sent the transaction.

**Why this priority**: This closes the "last mile." Without it, a user could stake gaslessly but still be blocked at claim time by lacking a native gas token — the worst outcome (money escrowed, can't retrieve it). It is P2 rather than P1 because these actions are less frequent than staking and, unlike staking, have no existing payment-authorization primitive to reuse, so they require a new signer-attributed authorization mechanism.

**Independent Test**: A wallet that won a wager and holds **zero native gas token** can claim its payout by signing once; the payout arrives in the winning wallet. Separately, a voucher holder with zero native gas token can redeem it by signing once and receives the membership tier.

**Acceptance Scenarios**:

1. **Given** a resolved wager the user won and a wallet with zero native gas token, **When** the user signs a claim intent, **Then** the payout is transferred to the winning wallet and the user paid no gas.
2. **Given** a wager the user created that is eligible to refund, **When** the user signs a refund intent, **Then** the refund is returned to the creator wallet (the signer), not the submitter.
3. **Given** a membership voucher owned by the user, **When** the user signs a redeem intent, **Then** the corresponding tier is granted to the signing wallet.
4. **Given** any action authorized by role or ownership (e.g. only the winner may claim, only the creator may cancel), **When** a submitter relays a signed intent, **Then** the on-chain authorization check passes for the **signer** and fails if the signer is not entitled — the submitter's own entitlement is never consulted.

---

### User Story 3 - Sign-to-join pools and buy membership under one unified flow (Priority: P2)

A user joins a group wager pool or purchases/upgrades/extends membership by signing a single intent, with no separate approval and no native gas token. The dormant pool-join gasless path is turned on in the product, and membership purchase gains the same capability, so all money-in actions across the platform share one consistent "sign once, pay no gas" experience.

**Why this priority**: Pool join already has proven on-chain and relayer plumbing that is simply not wired into the UI, so activating it is low-cost, high-visibility. Membership purchase is a recurring money-in action that today requires a fresh approval every time (the approval is exact-price, not infinite). Unifying both under the same intent flow removes recurring friction and makes the gasless experience consistent rather than one-off.

**Independent Test**: A wallet with stablecoin and zero native gas token can join an existing pool by signing once and appears as a pool member; a separate such wallet can purchase a membership tier by signing once and holds the tier afterward.

**Acceptance Scenarios**:

1. **Given** an open pool and a wallet with stablecoin but no native gas token, **When** the user signs a join intent, **Then** the wallet becomes a pool member with its buy-in escrowed and the user paid no gas.
2. **Given** a wallet eligible to purchase a membership tier, **When** the user signs a purchase intent, **Then** the tier is granted to the signing wallet and the price is paid from that wallet with no separate approval transaction.
3. **Given** the gasless pool-join path, **When** it is exercised from the product UI, **Then** it uses the same signer-attributed, sanctions-screened flow as all other intents (no behavioral divergence from the previously dormant path).

---

### User Story 4 - Never stranded: self-submit fallback and honest intent status (Priority: P2)

Whenever a submitter is unavailable, declines, or the user prefers to pay their own gas, the user can **submit their own signed intent directly** and complete the action by paying gas themselves. The product never presents a gasless-only dead end. At all times the status of an intent is shown truthfully — signed-but-not-yet-on-chain, submitted-and-pending, confirmed, expired, or failed — and never implies an outcome the chain has not reached.

**Why this priority**: A relayer/submitter is fungible, optional infrastructure — it can censor or go offline but must never be a single point of failure that traps user funds or blocks actions. Guaranteeing a self-submit fallback and honest status is a correctness and trust requirement (constitution: honest state, no implied finality), not a nice-to-have, so it ships alongside the gasless paths rather than after.

**Independent Test**: US4 is a cross-cutting guarantee that layers on US1–US3 rather than a standalone feature slice, and it is testable using the platform's pre-existing pay-your-own-gas path even before the gasless flows land: with no submitter reachable, the honest intent-status UI shows the correct state and offers a self-submit option that completes the action via the direct-call path, producing an on-chain result identical to the gasless path; intent status transitions are observable and accurate at each step.

**Acceptance Scenarios**:

1. **Given** no reachable submitter, **When** the user attempts a covered action, **Then** the product offers a self-submit option that completes the action with the user paying gas, and no funds are lost.
2. **Given** a signed intent awaiting submission, **When** the user views its status, **Then** it is shown as pending (not "done"), and only transitions to confirmed after the chain confirms it.
3. **Given** a signed intent that fails on-chain (expired, replayed, state changed, or screening failure), **When** the failure occurs, **Then** the user sees a specific reason and no funds have moved.

---

### Edge Cases

- **Submitter offline / rejects / out of gas funds** → the product falls back to self-submit; the user is informed and never stranded (US4).
- **Wrong stablecoin authorization domain** (native Circle USDC vs. bridged USDC.e differ in signing-domain version) → the signed payment authorization silently fails to verify; the system MUST surface a specific, actionable error rather than a stuck or ambiguous state, and MUST sign against the correct token for the active network.
- **Intent expires before it is mined** → clearly marked expired; no funds move; user may re-sign.
- **Replay / double-submit** (same intent submitted twice, or on a second network) → rejected on-chain; no double charge; intents are bound to a single chain, contract, action, and are single-use.
- **State changed between signing and submission** (wager already accepted, pool full or closed, voucher already redeemed, membership already active) → the intent reverts cleanly with no funds moved and the user is informed.
- **Signer becomes sanctioned, loses membership tier, or is account-frozen between signing and submission** → screening is evaluated against the **signer** at submission time, fail-closed; the submitter's status is irrelevant to the decision.
- **Multi-leg action where the payment leg lands but the action leg fails** → the action MUST be all-or-nothing so a user is never charged without receiving the action, and never receives the action without paying.
- **User changes their mind after signing but before submission** → the user can invalidate a signed-but-unsubmitted intent so it can never be executed.
- **Submitter attempts to alter, reorder, or repurpose an intent** (different amount, different counterparty, different action) → any deviation from what was signed causes the on-chain verification to fail; the submitter can only submit exactly what the user signed, or nothing.
- **Gas cost exceeds the fee netted from the stablecoin** (fee-netted mode) → the action is declined before any funds move rather than completing at a loss to the platform or overcharging the user beyond a disclosed cap.

## Requirements *(mandatory)*

### Functional Requirements

**Core intent model**

- **FR-001**: Users MUST be able to authorize each covered action by signing a single off-chain intent, with no separate token-approval transaction and without holding a native gas token.
- **FR-002**: The on-chain effect of every relayed intent MUST be attributed to the **signer** of the intent (as creator, opponent, winner, member, pool participant, voucher owner, or fund recipient), never to the submitter that broadcast it.
- **FR-003**: Every compliance, membership/tier, ownership, and account-status check that today evaluates the direct caller MUST instead evaluate the **signer** of the intent. In particular, sanctions screening MUST apply to the signer, fail-closed, so relaying can never bypass screening.
- **FR-004**: Each intent MUST be single-use and MUST carry a validity window (earliest and/or latest time it may execute); an intent MUST NOT be executable more than once, before or after its window, or after it has been invalidated.
- **FR-005**: Each intent MUST be bound to a specific network and to the specific action and parameters the user approved (amount, counterparty, target item), such that it cannot be replayed on another network or repurposed into a different action, amount, or counterparty.
- **FR-006**: Users MUST be able to invalidate a signed intent that has not yet been submitted, guaranteeing it can never subsequently execute.
- **FR-007**: Multi-leg actions (those combining a fund movement with a state change) MUST execute atomically — all legs succeed or none do — so a user is never charged without receiving the action and never receives the action without paying. A payment authorization MUST NOT be independently executable by any third party: it may move funds only as part of the same action, so no one can pull a user's stake without the corresponding action completing, and no stake is ever stranded in a contract without its action.

**Covered actions (scope = all user-facing flows)**

- **FR-008**: The system MUST support intent-based execution of the core wager lifecycle: create wager, accept wager (including open-challenge accept), claim payout, refund, cancel/decline, and draw proposal/approval/revocation.
- **FR-009**: The system MUST support intent-based execution of group wager pool actions that are already attributed to the signer (or to an anonymous membership proof) on **currently deployed** pools — namely join (via the existing signed payment-authorization path), member approval/vote, and claim — by activating the existing (currently dormant) gasless flow in the product. Pool actions that today identify the actor only as the direct caller (e.g. create pool, propose outcome, creator cancel/refund) can be offered gaslessly only for pools created from a future pool template, because deployed pools are immutable clones that cannot be retrofitted; this per-pool limitation MUST be surfaced honestly (FR-012). Gasless pool payment additionally depends on the pool network's stablecoin supporting signed authorization (see Assumptions); where it does not, pool actions remain self-submit.
- **FR-010**: The system MUST support intent-based execution of membership actions: purchase, upgrade, extend, and voucher redemption.
- **FR-011**: The system SHOULD support intent-based execution of the remaining user-owned on-chain writes — e.g. token creation/issuance (by a user holding the issuer role), external-DAO registration, and encrypted-backup pointer and key registration — with the on-chain effect attributed to the signer (per FR-002). (How an action is adapted to carry the signer is an implementation concern for the plan, not a user-observable requirement.)
- **FR-012**: For actions that depend on an external system the platform does not control (e.g. voting on an external DAO's own governance), the platform MUST NOT claim gasless support it cannot deliver; such actions are gasless only if and where the external system supports signer-attributed submission, and this limitation MUST be surfaced honestly.

**Submitter, gas funding, and fallback**

- **FR-013**: A submitter MUST be untrusted: it MAY delay or decline to submit an intent, but MUST NOT be able to alter, steal, misattribute, or repurpose it. The security posture is "can censor, cannot steal."
- **FR-014**: The system MUST always provide a self-submit path so that, when no submitter is available or the user prefers, the user can complete any covered action by paying their own gas, producing the identical on-chain result.
- **FR-015**: The system MUST support **two gas-funding models for the gasless path, selectable by administrators per network and/or per flow**: (a) platform-sponsored, where the submitter pays gas and the user needs no native token; and (b) fee-netted, where the gas cost is recovered from the user's stablecoin so the path is self-funding while the user still holds no native token.
- **FR-016**: In fee-netted mode, the fee charged to the user MUST be disclosed before signing and MUST be bounded; if the actual gas cost would exceed the disclosed/bounded fee, the action MUST be declined before any funds move rather than completing at a loss or overcharging. The fee recovery MUST settle atomically on-chain within the same action transaction (pulled from the signer as part of the atomic execution per FR-007), so the submitter never holds, escrows, or off-chain-accounts user funds.
- **FR-017**: The gasless path MUST NOT require FairWins to operate a new stateful application backend. The platform currently deploys **no FairWins-operated relayer**; the submitter MUST be either a third-party relaying service or the user's own wallet (self-submit). If a FairWins-operated stateless submitter is ever used, it remains optional, non-custodial, holds no user funds or authority, and its adoption requires an explicit maintainer decision (it is in tension with the standing no-backend directive).

**Status, honesty, and safety**

- **FR-018**: The product MUST surface intent status truthfully at every stage — signed (not yet submitted), submitted/pending, confirmed, expired, invalidated, or failed — and MUST NOT imply an outcome the chain has not reached.
- **FR-019**: On any intent failure (expiry, replay, state change, screening failure, wrong token domain, insufficient balance), the product MUST show a specific, actionable reason and MUST guarantee no funds moved as a result of the failed intent.
- **FR-020**: When the active network's platform stablecoin cannot support gasless payment, the user MUST be shown a clear, specific error rather than a silent or ambiguous failure, and MUST be able to fall back to self-submit.
- **FR-021**: All intent-based paths MUST preserve existing network isolation: an intent and its effects MUST be scoped to the active network and MUST NOT leak across testnet/mainnet boundaries.
- **FR-022**: Every intent-based path MUST reuse the platform's existing shared compliance (sanctions) and membership controls rather than re-implementing them.
- **FR-023**: All new intent UI — single-signature confirmation, status indicators, pre-sign fee disclosure, and error/reason surfaces — MUST meet WCAG 2.1 AA: state MUST NOT be conveyed by color or icon alone, status transitions MUST be announced to assistive technology, and error/reason text MUST be accessible.

### Key Entities *(include if feature involves data)*

- **Intent**: A signed, off-chain statement of a desired action. Attributes: the signer; the action type; the target network and contract/item; the action parameters (amount, counterparty, wager/pool/voucher identifier); a uniqueness marker (so it is single-use); and a validity window. It has no on-chain existence until submitted.
- **Payment Authorization**: The money leg of an intent — a signed authorization permitting a specific contract to pull a specific stablecoin amount from the signer exactly once, bound to recipient, amount, uniqueness marker, and validity window. Actions that move stake in include a payment authorization; actions that move no new stake do not.
- **Submitter (Relayer)**: The party that broadcasts a signed intent on-chain and pays the network gas. Untrusted and fungible: may censor or be offline, cannot alter/steal/misattribute. Runs stateless; there may be zero, one, or several, and the user can always be their own submitter.
- **Gas-Funding Policy**: The administrator-configured choice, per network/flow, of how gasless submissions are funded — platform-sponsored or fee-netted-from-stablecoin — including any bounded fee disclosed to the user.
- **Intent Status**: The lifecycle state of an intent as presented to the user — signed, submitted/pending, confirmed, expired, invalidated, or failed — reflecting true on-chain state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A wallet holding only the platform stablecoin with a **zero native-gas-token balance** can complete create-wager, accept-wager, claim-payout, pool-join, and membership-purchase end-to-end — each verified to succeed from a zero-native-balance wallet.
- **SC-002**: For money-in flows (create-wager, accept-wager, pool-join, membership-purchase), the number of user signatures required drops from two (approve + action) to **one**, and the number of separate approval transactions drops to **zero**.
- **SC-003**: In 100% of relayed actions, the resulting on-chain owner/creator/opponent/winner/member/recipient is the **signing wallet**, never the submitter — verified by reading resulting on-chain state.
- **SC-004**: Zero successful replays across testing: no intent can be executed twice, after expiry, after invalidation, or on a network other than the one it was signed for.
- **SC-005**: With no submitter available, 100% of covered flows (the FR-008–FR-010 core) still complete via self-submit, producing on-chain results identical to the gasless path — no flow has a gasless-only dead end.
- **SC-006**: Zero sanctioned or ineligible signers are able to complete an action via the intent path that they could not complete via a direct call — screening and membership gating on the signer are equivalent to the direct-call path (no compliance regression).
- **SC-007**: Intent status shown to users matches true on-chain state in 100% of observed transitions (no "done" shown before confirmation; every failure shows a specific reason with no funds moved).
- **SC-008**: The platform's deployment footprint does not grow — no stateful FairWins application backend is introduced. The submitter (a third-party relayer or the user's own wallet) holds no user funds and no authority; the gasless path works with zero FairWins-operated servers.
- **SC-009**: For no-new-stake flows (claim, refund, cancel/decline, draw propose/approve/revoke, voucher redeem), the native-gas-token requirement drops from required to **zero** — a single off-chain signature replaces a gas-paying transaction — with the action's on-chain effect attributed to the signer.
- **SC-010**: New intent UI passes automated accessibility checks (axe/Lighthouse) in CI at WCAG 2.1 AA, consistent with the platform's accessibility standard.

## Assumptions

- **Scope boundary** (per clarification): "Entire platform" means **all user-facing money and action flows** — wagers, group pools, and membership, plus best-effort coverage of other user-owned on-chain writes (FR-011/FR-012). Administrative, governance-authority, treasury, and upgrade operations remain on direct signing via the existing air-gapped floppy-keystore flow and are **out of scope**.
- **Gas funding** (per clarification): both **platform-sponsored** and **fee-netted-from-stablecoin** models are supported and **selectable by administrators per network/flow**; self-submit (user pays own gas) is always available as a fallback regardless of the configured model.
- **Target wallets**: self-custody wallets that can sign structured (typed) data. Smart-contract-wallet / account-abstraction native flows are out of scope for the first version.
- **Payment primitive**: the money leg uses a **sender/recipient-bound** signed authorization (EIP-3009 `receiveWithAuthorization`, matching the existing `ZKWagerPool.joinWithAuthorization` path) — never the front-runnable `transferWithAuthorization` variant — so the payment can only execute as part of the action transaction and cannot be pulled independently (enforcing FR-007). The platform stablecoin on each target network is assumed to support this. It is verified for native Circle USDC on Polygon and the Amoy faucet USDC. **Native vs. bridged USDC differ in their signing-domain version (native "2" vs. bridged "1"); a signature built with the wrong domain silently fails to verify**, so the correct token/domain for the active network must be used. **The Mordor stablecoin's support is unverified and is a gating dependency for gasless payment on that network** — until verified, Mordor gasless is limited to flows that do not require a signed stablecoin pull, or to self-submit.
- **Immutable pool clones**: deployed group-pool instances are immutable clones and cannot be retrofitted. Creator-only (direct-caller) pool actions can become gasless only for pools created from a future pool template; already-deployed pools offer gasless only for actions already attributed to the signer or an anonymous proof (join, vote, claim). See FR-009.
- **Definition of "covered flows"**: in the Success Criteria, "covered flows" means the P1/P2 core actions enumerated in FR-008–FR-010. The best-effort writes in FR-011/FR-012 are NOT counted toward the 100%-style criteria (SC-005) and are tracked separately.
- **Reference pattern already exists**: the platform already has one working end-to-end intent flow (anonymous pool join with a signed payment authorization) and one application-level typed-signature verifier (open-challenge accept). This feature **generalizes and activates** those patterns rather than introducing a new paradigm; it explicitly does not adopt a shared meta-transaction forwarder that would rewrite the effective caller for all calls, because nearly every existing check authorizes by the direct caller — instead the signer is threaded explicitly and screened, matching the existing pool-join approach.
- **Submitter is not a FairWins backend**: there is currently **no FairWins-operated relayer in the deployment footprint**; the pool-join relayer code that exists is not deployed and its use is an unresolved maintainer decision under the no-backend directive. The intended production submitter is a **third-party relaying service or the user's own wallet (self-submit)**, chosen specifically to avoid operating a FairWins server (FR-017).
- **New replay layer required for non-payment intents**: payment authorizations carry their own single-use protection via the stablecoin; actions that move no stake (claim, resolve, vote, membership grant, voucher redeem) have no such built-in protection today and require a new per-signer single-use/validity mechanism (FR-004).
- **Active networks**: Polygon mainnet (primary) and Polygon Amoy (testnet) are the initial targets; the dormant gasless pool-join infrastructure currently exists only where the pool factory is deployed (Mordor). Rollout order follows where the relevant contracts are live.
- **Deployment/keys**: contract logic that must change to accept an explicit signer ships as in-place upgrades of the existing upgradeable proxies where applicable (registry, membership) and preserves storage layout; deployer/admin actions continue to use the air-gapped keystore flow.
