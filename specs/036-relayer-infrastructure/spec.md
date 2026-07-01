# Feature Specification: Intent Relayer Infrastructure

**Feature Branch**: `036-relayer-infrastructure`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "take a step back and create a spec for the relayer as it will be a crucial piece of infrastructure. based on the design of [spec 035] we must /speckit-specify a relayer capable of managing the load" — with the direction to "use an open source option."

## Summary

Spec 035 (Intent-Based Signatures) lets users authorize any core action by signing a single off-chain intent, which a **submitter** broadcasts on-chain so the user pays no gas and needs no native token. Spec 035 deliberately left the submitter abstract and even flagged that operating a FairWins relayer was an *unresolved* decision under the platform's no-backend directive.

This feature specifies that submitter as first-class infrastructure: a **production-grade, self-hosted, open-source gas relayer** that reliably submits users' signed intents across every network the platform serves, under realistic (bursty, early-stage) load, without dropping, stalling, double-submitting, or mis-attributing them — and that is safe (untrusted-by-design, "can censor, cannot steal"), compliant (screens the *signer*, fail-closed), operable (observable, funded, alertable, rotatable), and always backstopped by the guaranteed self-submit path so it is never a single point of failure.

The platform already contains a **fragile reference relayer** (`services/relayer/`, built for pool joins in spec 034: stateless single-endpoint, but with no nonce management, no gas-price bumping, no inclusion tracking, a single RPC per chain, in-memory per-IP rate limiting, and console-only logging). This feature adopts an open-source relayer (hardening that reference or an equivalent OSS project) and raises it to production quality.

### The no-backend decision (recorded here)

The platform enforces a **fixed-footprint / no application backend** rule (documented in `docs/developer-guide/architecture.md` and made binding by the spec 007 clarification: "no backend, no new compute"). A relayer is server-side infrastructure with a persistent hot key, so it is in genuine tension with that rule. **The maintainer decision — left open by spec 035 — is hereby made: FairWins will operate a self-hosted, open-source relayer as a deliberate, documented, scoped exception.** It was chosen over a managed third-party service specifically to (a) support Ethereum Classic (Mordor/ETC), which managed relayers generally do not, and (b) as defense-in-depth — refuse to pay gas for a signer the on-chain guard would reject, while **on-chain screening remains authoritative** (the relayer is never the compliance gate). The relayer is **stateless with respect to user business data and authority, but operationally stateful**: it keeps an append-only audit log, a shared rate-limit/dedup store, and persisted pending-nonce state, so it does introduce operated compute plus a datastore — that is the honest scope of the exception. It is bounded by the requirements below: the relayer holds no user funds and no contract authority, is optional and additive (removing it degrades gracefully to self-submit), and can censor but never steal. This decision **supersedes spec 035's SC-008 and resolves its open FR-017** ("no stateful FairWins backend; third-party or self-submit"): a stateful, FairWins-operated relayer is now permitted under the bounds recorded here.

## Clarifications

### Session 2026-07-01

- Q: Which spec-035 intent types does the relayer submit in v1 — payment-carrying (EIP-3009) only, or all? → A: **All 035 intent types in v1** (payment-carrying **and** no-stake signer-attributed), via a generic signer-attributed submission path (FR-028).
- Q: Should the relayer endpoint sit behind the same Cloudflare geo-gate (451) + origin-lock as the SPA? → A: **Yes — same edge perimeter** (FR-029), so the relayer is not a geo/compliance bypass and serves only platform-origin traffic.
- Q: How long must the relayer retain request→signer→txHash audit records? → A: **On-chain is the permanent record of record; retain request-side audit metadata ≥ 5 years** (AML-aligned) (FR-021).
- Q: What availability posture for v1? → A: **Best-effort, no hard uptime SLA**; the guaranteed self-submit fallback is the availability backstop (monitor + alert, no HA over-investment at early-stage).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gasless submission stays reliable under real load (Priority: P1)

An end user submits a signed intent during normal activity and during bursts (e.g. a market-close claim rush). The relayer accepts it, broadcasts promptly, tracks it to inclusion, and returns an honest status — without failures caused by transaction-nonce collisions, under-priced/stuck transactions, or a single flaky RPC endpoint. Throughput and latency stay within stated targets, and when arrival exceeds capacity the service sheds load predictably instead of collapsing.

**Why this priority**: "Capable of managing the load" is the entire point of this spec. A relayer that mis-manages its single hot-wallet nonce or never watches for inclusion will silently strand transactions and report false success — the worst failure for a funds-adjacent system. This is the core capability; everything else hardens or backstops it.

**Independent Test**: Drive the relayer at the stated sustained rate and burst profile against a test/staging chain and confirm: zero nonce collisions, every accepted intent reaches inclusion or a truthful failure, latency stays within the p95 target, and beyond capacity the service returns explicit back-pressure responses rather than timing out.

**Acceptance Scenarios**:

1. **Given** concurrent signed intents arriving on one chain, **When** the relayer submits them from its single gas wallet, **Then** transaction nonces are allocated without collision and no submission is dropped as "replacement underpriced."
2. **Given** a submitted transaction that becomes under-priced (fee spike), **When** it fails to be included within the expected window, **Then** the relayer re-prices/replaces it (or cancels and retries) rather than wedging every later transaction, and the user's status reflects the true state.
3. **Given** the primary RPC endpoint for a chain is failing or rate-limiting, **When** intents arrive, **Then** the relayer fails over to an alternate endpoint and continues serving, without turning every intent into an error.
4. **Given** arrival rate exceeds the configured capacity, **When** the queue reaches its bound, **Then** the relayer responds with explicit back-pressure (retry-after) and the client offers self-submit, rather than accepting unbounded work and failing all of it.

---

### User Story 2 - Never stranded: liveness and guaranteed self-submit (Priority: P1)

Whenever the relayer is down, censoring, out of gas funds, or simply slow, the app detects this within a bounded time and the user completes the same action via self-submit (paying their own gas), producing an identical on-chain result. The relayer is explicitly untrusted: it can delay or refuse, but it can never alter, steal, mis-attribute, or trap a user's funds.

**Why this priority**: The relayer is a convenience layer over user-owned funds; it must never become a single point of failure that blocks access to escrowed money. This is the safety contract inherited from spec 035 (FR-013/FR-014, SC-005) and is what makes operating a relayer acceptable under the no-backend exception at all.

**Independent Test**: With the relayer stopped (or returning errors, or with an empty gas wallet), every covered action still completes via self-submit within the stated time-to-fallback, yielding the same on-chain result as the relayed path; and no relayer response can change the signer, amount, counterparty, or recipient of an intent.

**Acceptance Scenarios**:

1. **Given** the relayer is unreachable or times out, **When** a user attempts a covered action, **Then** the app detects unavailability within the bounded health/timeout budget and offers self-submit, which completes the action.
2. **Given** the relayer's gas wallet is empty, **When** it cannot fund submissions, **Then** it reports this honestly (does not accept-and-drop), and the user falls back to self-submit.
3. **Given** any relayer response, **When** the intent lands on-chain, **Then** the signer, amount, counterparty, and recipient match exactly what the user signed — the relayer cannot deviate.
4. **Given** a global incident, **When** operators activate the kill switch, **Then** the relayer cleanly stops accepting intents and all flows continue via self-submit.

---

### User Story 3 - Compliant and abuse-resistant submission (Priority: P2)

The relayer screens the **signer** of each intent against the shared sanctions guard at submission time and fails closed if screening is unavailable. Because it pays gas for strangers, it resists spam and griefing: it dedups retried intents, enforces per-signer and global quotas and spend caps, and cannot have its gas wallet drained by cheap, valid-looking requests.

**Why this priority**: Screening on the signer (not the submitter) is a hard compliance requirement from spec 035 (FR-003) — relaying must never become a sanctions bypass. And a relayer that pays gas is a direct financial target; without abuse controls a single funded attacker drains the wallet and takes the whole gasless path down. P2 because US1/US2 must exist first, but this is required before any public exposure.

**Independent Test**: A sanctioned signer's intent is refused; when the guard is unavailable, submission is refused (not allowed through); a duplicate intent is a no-op returning the original result rather than a second on-chain submission; and a flood of requests is bounded by quotas/spend caps without draining the gas wallet.

**Acceptance Scenarios**:

1. **Given** an intent whose signer is sanctioned, **When** it is submitted, **Then** the relayer refuses it (screening applied to the signer, not the relayer).
2. **Given** the sanctions guard is unreachable, **When** an intent arrives, **Then** the relayer refuses (fails closed) and alerts, rather than submitting unscreened.
3. **Given** the same signed intent submitted twice (client retry), **When** the relayer receives the duplicate, **Then** it returns the original outcome without a second on-chain submission or wasted gas.
4. **Given** a burst of requests from one signer or source beyond quota, **When** they arrive, **Then** they are rate-limited/rejected and per-window spend caps prevent gas-wallet drain, with the limits enforced consistently across all relayer instances.

---

### User Story 4 - Operable, observable, with a funded and secured hot wallet (Priority: P2)

An operator can see the relayer's health and spend (throughput, latency, revert rate, gas spent, queue/nonce-lane depth, wallet balance), is alerted before the gas wallet runs dry or when screening degrades, and can rotate the hot key. The hot gas key is a dedicated, low-value, spend-capped key strictly segregated from the air-gapped floppy-keystore admin keys, so its worst-case compromise is bounded to lost gas and censorship — never user funds or contract authority.

**Why this priority**: A gas-spending service you cannot see or fund is unoperable; the reference relayer emits only console errors and has no balance monitoring, so a draining wallet or stuck lane is invisible until users report failures. The hot-key model is also a genuinely new key-management pattern for this platform (whose admin keys are cold/air-gapped) and must be contained explicitly.

**Independent Test**: Operational dashboards/alerts fire on a simulated low balance and on a simulated screening outage; a key-rotation procedure swaps the hot key with no lost or double-submitted intents; and audit records link each submitted intent to its signer and resulting transaction hash.

**Acceptance Scenarios**:

1. **Given** the gas wallet balance falls below the runway threshold, **When** it crosses the line, **Then** an alert fires with enough lead time to top up before submissions fail.
2. **Given** a screening or RPC outage, **When** error rates cross thresholds, **Then** operators are alerted (not left to discover it via user reports).
3. **Given** a scheduled key rotation, **When** the operator swaps the hot key, **Then** in-flight intents are drained safely and no intent is lost or double-submitted.
4. **Given** any submitted intent, **When** operators review the audit trail, **Then** there is an append-only record linking intent → signer → transaction hash.
5. **Given** the hot key is compromised, **When** the worst case is assessed, **Then** exposure is bounded to the capped gas balance and censorship — the key holds no contract authority and is never the floppy admin key.

---

### User Story 5 - Multi-chain coverage including ETC/Mordor, with honest fee accounting (Priority: P3)

The relayer serves each configured network — Polygon and Amoy, and Ethereum Classic (Mordor/ETC) which managed services generally will not — each with its own independent nonce lane and gas wallet. In fee-netted funding mode it keeps per-chain accounting of native-gas spend versus stablecoin fee revenue, declines any submission whose estimated gas exceeds the user's bounded fee, and never submits at a loss.

**Why this priority**: Self-hosting was chosen largely to keep ETC/Mordor coverage, so multi-chain must be first-class. Fee-netted accounting is required for the self-funding gas model but is lower priority than getting reliable, safe submission working on the primary chains first.

**Independent Test**: With two or more chains configured, intents on each are served on independent nonce lanes without cross-chain interference; and in fee-netted mode, a submission whose estimated gas exceeds the bounded fee is declined before any funds move, while per-chain ledgers reconcile gas spend against fee revenue.

**Acceptance Scenarios**:

1. **Given** multiple configured chains, **When** intents arrive concurrently on each, **Then** each chain has its own nonce lane and gas wallet and a problem on one chain does not stall another.
2. **Given** a network (e.g. Mordor/ETC) unsupported by managed relayers, **When** it is configured, **Then** the self-hosted relayer serves it using the same code path as other chains.
3. **Given** fee-netted mode, **When** estimated gas for an intent exceeds the user's disclosed/bounded fee, **Then** the relayer declines before any funds move (no loss-making submission).
4. **Given** recovered stablecoin fees, **When** per-chain accounting runs, **Then** native-gas spend and stablecoin fee revenue are reconciled per chain so the correct chain's gas wallet can be refunded.

---

### Edge Cases

- **Concurrent submissions collide on the hot-wallet nonce** → serialized per-`(chain, wallet)` allocation with bounded in-flight depth and gap recovery; zero collisions is a hard target (US1).
- **A transaction is broadcast but never mined** (under-priced / fee spike) → detected, re-priced or cancelled; it must not silently wedge the nonce lane or report false success.
- **RPC endpoint fails, rate-limits, or returns stale data** → automatic failover to an alternate; static reads cached; a single provider is never a hard dependency.
- **Duplicate intent submitted** → idempotent no-op returning the original transaction hash; no second broadcast, no wasted gas (protocol-safe via the on-chain uniqueness marker, but the relayer must not pay twice).
- **Sanctions guard unavailable** → fail closed (refuse + alert), never submit unscreened.
- **Gas wallet runs dry mid-burst** → honest failure + alert; users fall back to self-submit; no accept-and-drop.
- **Hot key compromised** → bounded to capped gas loss + censorship; documented rotation runbook; never touches user funds or admin authority.
- **Relayer scaled to multiple instances** → nonce ownership partitioned or centrally coordinated, and rate-limit/dedup state shared, so replication adds throughput without correctness loss (naive replication would multiply rate limits and collide on nonces).
- **Contract proxy upgraded (spec 025/027 style)** → relayer's addresses/ABIs are version-pinned with a startup consistency check; it never submits to a stale target or mis-screens against an old guard.
- **New build deployed while intents are in flight** → graceful drain (finish or safely park in-flight work, persist pending-nonce state); health-gated rollout with rollback; no dropped or double-submitted intents.
- **Estimated gas exceeds the bounded fee (fee-netted)** → decline before any funds move.
- **Relayer deliberately censors a specific user** → user is not blocked; self-submit path yields the identical on-chain result (the untrusted-by-design guarantee).

## Requirements *(mandatory)*

### Functional Requirements

**Deployment model & footprint exception**

- **FR-001**: The relayer MUST be provisioned as a **self-hosted, open-source** service the platform operates, recorded as a deliberate, documented, scoped exception to the fixed-footprint / no-application-backend directive.
- **FR-002**: The relayer MUST remain **optional and additive**: with the relayer disabled or absent, every covered action MUST still complete via self-submit with an identical on-chain result (inherited from spec 035 SC-005). Removing the relayer MUST NOT strand funds or block any action.
- **FR-003**: The relayer MUST hold **no user funds and no contract authority**, and MUST persist no user business data (operational state — audit log, dedup/rate-limit store, pending-nonce state — is permitted and expected, per FR-004/FR-021); it MUST be untrusted-by-design — able to delay or refuse (censor) but never to alter, steal, mis-attribute, or repurpose an intent (inherited from spec 035 FR-002/FR-013).
- **FR-004**: The footprint exception MUST be captured in a durable decision record covering rationale, scope (including the operated compute and the datastore the relayer requires), worst-case exposure, and the conditions under which it holds. The record MUST cross-link the canonical no-backend statements it overrides — `docs/developer-guide/architecture.md` and the spec 007 clarification — and MUST note that it supersedes spec 035's SC-008 and resolves spec 035's FR-017, so the exception is discoverable from the rule it overrides.

**Submission correctness (the "manage the load" core)**

- **FR-005**: The relayer MUST allocate transaction nonces **without collision** under concurrent submissions — a single serialized writer per `(chain, gas-wallet)` lane, a bounded in-flight/pipeline depth, and detection/recovery for a dropped or gapped nonce so one failure cannot wedge the lane.
- **FR-006**: The relayer MUST track each submission to **inclusion**, not merely broadcast; it MUST NOT report success for a transaction that has not been included. It MUST estimate fees, and re-price/replace (bump) or cancel a transaction that is not included within an expected window.
- **FR-007**: The relayer MUST use **at least two independent RPC endpoints per chain** with automatic health-based failover, and SHOULD cache static reads, so no single provider outage or rate-limit halts submission.
- **FR-008**: The relayer MUST handle **duplicate/retried intents idempotently** — coalescing in-flight duplicates and returning the original result — so a client retry never causes a second on-chain submission or double gas spend.
- **FR-009**: The relayer MUST apply **bounded queueing and back-pressure**: when arrival exceeds capacity it MUST shed load explicitly (e.g. retry-after), prioritise time-critical intents (near-expiry, high-value), and never accept unbounded work that then fails en masse.

**Capacity & performance**

- **FR-010**: The relayer MUST meet stated, **configurable capacity targets** — a sustained intents/sec rate and a burst profile (rate held for a duration) per chain and in aggregate — and MUST be designed to **scale horizontally** to raise those targets later (early-stage now, headroom by design).
- **FR-011**: The relayer MUST meet stated **latency targets** for accept→broadcast and broadcast→inclusion, validated by a **repeatable, CI-gating load test** that exercises the sustained and burst profiles; a regression past the configured latency/throughput targets MUST fail the pipeline.
- **FR-012**: When run as multiple instances, the relayer MUST preserve correctness — **nonce ownership partitioned per instance or centrally coordinated**, and rate-limit/dedup state shared — so adding instances adds throughput without collisions or multiplied limits.

**Trust, safety & compliance**

- **FR-013**: The relayer MUST screen the **signer** of each intent against the shared sanctions guard on the submission critical path and **fail closed** (refuse + alert) if screening is unavailable — never submit unscreened, never screen the relayer instead of the signer (inherited from spec 035 FR-003).
- **FR-014**: The relayer MUST resist abuse/DoS: **per-signer and global quotas**, a **per-window gas spend cap (rate-limiting)**, consistent enforcement across instances (shared/distributed limiter), and protection for expensive paths, such that a flood of valid-looking requests cannot drain the gas wallet or exhaust RPC quota. (This per-window rate cap is distinct from the absolute per-key exposure cap in FR-018.)
- **FR-015**: Operators MUST have a **global kill switch** that cleanly stops the relayer accepting intents, after which all flows continue via self-submit.
- **FR-016**: The client/app MUST detect relayer unavailability, censorship, or slowness within a **bounded time-to-fallback** and automatically offer self-submit (inherited from spec 035 FR-014); this fallback MUST be tested as the liveness escape hatch.

**Gas wallet & key management**

- **FR-017**: The relayer's gas wallet MUST use a **dedicated, low-value, hot key** that is **strictly segregated from the air-gapped floppy-keystore admin keys** and holds no contract authority, so worst-case compromise is bounded to the capped gas balance plus censorship — never user funds or upgrade authority.
- **FR-018**: The relayer MUST enforce an **absolute per-key exposure cap** (distinct from FR-014's per-window rate cap) and MUST monitor gas-wallet balance with a **low-balance alert and a runway target** (hours of peak burn) giving enough lead time to top up before submissions fail.
- **FR-019**: The relayer MUST support **hot-key rotation** via a documented procedure that drains in-flight work safely and loses/double-submits no intents.
- **FR-019a**: The hot gas key MUST be held in managed secret storage (KMS / secret manager) — never in plaintext committed config — with least-privilege access, and MUST NEVER appear in logs, telemetry (FR-020), or the audit trail (FR-021), consistent with the platform's key-management constraint.

**Observability & audit**

- **FR-020**: The relayer MUST emit **structured operational telemetry** — at minimum intents/sec, accept→inclusion latency, revert rate by reason, gas spent, queue/nonce-lane depth, and gas-wallet balance — with **alert thresholds** on the failure modes above (low balance, screening/RPC degradation, nonce-lane stall).
- **FR-021**: The relayer MUST maintain an **append-only audit trail** linking each submitted intent to its signer and resulting transaction hash, sufficient for compliance review, without persisting user secrets. On-chain data is the permanent record of record; the relayer MUST retain this request-side audit metadata for an AML-aligned window of **at least 5 years**.

**Multi-chain & fee accounting**

- **FR-022**: The relayer MUST serve **every configured network** — Polygon, Amoy, and Ethereum Classic (Mordor/ETC) — with an independent nonce lane and gas wallet per chain, such that a fault on one chain does not stall another. ETC/Mordor support is a **required capability** (a primary reason for self-hosting), **sequenced after the primary chains are reliable** — its delivery therefore sits in a lower-priority story (US5), reflecting sequencing, not importance.
- **FR-023**: In fee-netted funding mode, the relayer MUST keep **per-chain accounting** of native-gas spend versus stablecoin fee revenue, MUST **decline any submission whose estimated gas exceeds the user's bounded fee before any funds move**, and MUST NOT submit at a loss (inherited from spec 035 FR-015/FR-016). Fee recovery MUST settle atomically **on-chain to a segregated fee recipient that is NOT the hot gas key** (per spec 035 FR-016 — the relayer never escrows or off-chain-accounts user funds); the per-chain ledger is a **read-model derived from on-chain receipts**, and any refill of the hot gas wallet from recovered fees is an explicit, separate settlement step that keeps the hot key genuinely low-value.

**Consistency with the platform**

- **FR-024**: The relayer MUST preserve **network isolation** — an intent and its effects are scoped to their target network and never cross testnet/mainnet boundaries (inherited from spec 035 FR-021).
- **FR-025**: The relayer's contract **addresses and ABIs MUST be version-pinned to the deployed proxy version**, with a startup consistency check, so after an in-place upgrade it never submits to a stale target or screens against an old guard. Deploys MUST be **graceful** (drain/park in-flight, persist pending-nonce state, health-gated rollout with rollback).
- **FR-026**: The relayer's CI MUST fail loudly (constitution Principle IV): build, lint, type-check, test, the FR-011 load test, and security scans are **gating** steps with no `continue-on-error`; performance/latency regressions past the configured targets and critical security findings MUST fail the pipeline.
- **FR-027**: The new user-facing states this feature introduces — back-pressure / retry-after messaging, relayer-unavailable → offer-self-submit, and relayed-vs-pending status — MUST meet the platform accessibility standard (WCAG 2.1 AA), reusing spec 035's intent-status framework (spec 035 FR-023): state MUST NOT be conveyed by color/icon alone and MUST be announced to assistive technology.

**Submission scope & perimeter** *(clarified 2026-07-01)*

- **FR-028**: From v1 the relayer MUST submit **both** intent classes spec 035 defines — payment-carrying intents (EIP-3009 sender/recipient-bound authorizations) **and** no-stake signer-attributed intents (claim, refund, cancel/decline, draw propose/approve/revoke, voucher redeem, pool propose/vote/claim) — via a **generic signer-attributed submission path**, not only the payment primitive. (This depends on spec 035's signer-attributed authorization + replay-nonce layer being delivered — see Assumptions.)
- **FR-029**: The relayer endpoint MUST sit behind the **same Cloudflare geo-gate (HTTP 451) and origin-lock perimeter as the SPA**, so it is not a geo/compliance bypass and serves only platform-origin traffic — adding the relayer MUST NOT weaken geo/jurisdiction enforcement.

### Key Entities *(include if feature involves data)*

- **Relayer Service**: The self-hosted, open-source submitter that receives signed intents and broadcasts them on-chain, paying gas. Stateless with respect to user business data and authority, but **operationally stateful** — it maintains a durable append-only audit log, a shared rate-limit/dedup store, and persisted pending-nonce state (i.e. it requires operated compute plus a datastore). Optional, additive, untrusted-by-design.
- **Nonce Lane**: The per-`(chain, gas-wallet)` serialized submission channel that owns transaction-nonce allocation, in-flight depth, and stuck/replacement handling for that wallet on that chain.
- **Gas Wallet (Hot Key)**: A dedicated, low-value, spend-capped, monitored, rotatable key per chain that funds submissions. Segregated from cold/air-gapped admin keys; holds no contract authority.
- **Capacity Profile**: The configurable load model the relayer must meet — sustained rate, burst profile, per-chain and aggregate — plus derived limits (RPC call budget, gas runway, latency SLOs, queue depth) that make "manage the load" testable.
- **Fee Ledger**: A per-chain **read-model derived from on-chain receipts** of native-gas spend versus recovered stablecoin fees (fee-netted mode), used to decline loss-making submissions and drive refills. The relayer does not escrow or off-chain-account user funds; recovered fees settle on-chain to a segregated fee recipient that is not the hot gas key.
- **Audit Record**: Append-only entry linking a submitted intent to its signer and transaction hash for compliance review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The relayer sustains the configured target rate and burst profile per chain with **zero transaction-nonce collisions** and no accepted-then-silently-dropped submissions, verified by a repeatable load test. (Early-stage instantiation, tunable: sustain ≥ 3 intents/sec/chain, burst ≥ 20 intents/sec for 30s, across the configured chains.)
- **SC-002**: **p95 accept→broadcast latency < 2s** at the target load, and every accepted intent reaches inclusion or a truthful failure status — no intent is reported "done" before it is included on-chain.
- **SC-003**: With the primary RPC endpoint for a chain forced to fail, the relayer continues serving that chain via failover — user-visible error rate returns to baseline within **30s** of the failure and stays **below 1%** during failover.
- **SC-004**: With the relayer stopped, unreachable, out of gas, or in kill-switch, **100% of covered flows still complete via self-submit** within the bounded time-to-fallback, producing on-chain results identical to the relayed path.
- **SC-005**: **Zero** intents are submitted for a sanctioned signer, and **zero** intents are submitted while the sanctions guard is unavailable (fail-closed), across testing.
- **SC-006**: A duplicate-intent flood and a single-source request flood cause **no second on-chain submission** and **no gas-wallet drain** — spend stays within the configured per-window cap.
- **SC-007**: A simulated low gas-wallet balance and a simulated screening/RPC outage each **trigger an operator alert** before user-visible failure; the gas-wallet runway alert fires with ≥ the configured lead time (target ≥ 12h of peak burn).
- **SC-008**: A hot-key rotation and a rolling deploy each complete with **zero lost or double-submitted intents** (graceful drain verified).
- **SC-009**: Every submitted intent has an **audit record** linking it to its signer and transaction hash; worst-case hot-key compromise is demonstrably bounded to the capped gas balance and censorship (no path to user funds or contract authority).
- **SC-010**: The relayer serves **all configured chains including ETC/Mordor** on independent nonce lanes; in fee-netted mode, **100% of loss-making submissions (estimated gas > bounded fee) are declined before funds move**, and per-chain ledgers **reconcile** — recorded native-gas spend per chain equals the on-chain gas used by that chain's wallet within a stated tolerance, and recovered fee revenue is attributed to the correct chain.
- **SC-011**: A durable decision record for the footprint exception exists and captures rationale, scope (operated compute + datastore), worst-case exposure, and conditions, and cross-links the canonical no-backend statements plus spec 035 FR-017/SC-008.
- **SC-012**: With **≥ 2 relayer instances** serving one chain under the SC-001 load/burst profile, there are **zero cross-instance nonce collisions** and per-signer/global rate limits and per-window spend caps are **not multiplied by instance count** (the limiter is shared).
- **SC-013**: After an artificial fee spike, a stuck transaction is **re-priced/replaced and included within a bounded window**, and subsequent nonces in that lane are **not stalled** (the lane does not wedge).
- **SC-014**: An intent scoped to one network is **never accepted or submitted against another** — a testnet-signed intent is rejected under a mainnet configuration, and vice versa.
- **SC-015**: The hot gas key's balance and worst-case exposure stay bounded by the configured per-key cap and are **not inflated by accumulated fee revenue** (recovered fees do not accrue to the hot key).
- **SC-016**: The relayer endpoint refuses traffic the SPA's geo-gate would block and rejects non-platform-origin requests (origin-lock), verified equivalently to the SPA — adding the relayer opens **no** geo/compliance bypass.
- **SC-017**: Every submitted intent's request→signer→txHash audit record is retained for **≥ 5 years**; on-chain records remain permanently available as the record of record.
- **SC-018**: **Both** intent classes — payment-carrying (EIP-3009) and no-stake signer-attributed — are submittable via the relayer in v1, each attributed on-chain to the signer.

## Assumptions

- **Host model** (per clarification): **self-hosted, open-source** relayer operated by FairWins — chosen over managed third-party services to keep control of the compliance-critical path and to support ETC/Mordor, which managed relayers generally do not cover. This is a deliberate, documented exception to the no-backend directive (FR-001/FR-004).
- **Load target** (per clarification): **early-stage with headroom** — modest sustained rate with bursty peaks, designed to scale horizontally later. The SC-001/SC-002 numbers are instantiated conservatively and are configuration knobs, not hard-coded ceilings.
- **Availability posture** (per clarification): **best-effort availability with no hard uptime SLA** for v1 — the guaranteed self-submit fallback (US2 / SC-004) is the availability backstop; operators monitor and alert (FR-018/FR-020) rather than invest in multi-region HA at early-stage.
- **v1 intent scope** (per clarification): the relayer submits **all** spec-035 intent classes from v1 (FR-028), not just the payment primitive. This **depends on spec 035 delivering its signer-attributed authorization + replay-nonce layer** (035 FR-004/FR-011) for the no-stake intents; where that layer is not yet live for a given action, that action falls back to self-submit until it is.
- **This spec depends on and inherits spec 035** (Intent-Based Signatures). The intent format, signer-attribution, honest-status UX, gas-funding models (sponsored + fee-netted), and the self-submit guarantee are defined there; this spec specifies the infrastructure that executes those intents and refines spec 035's open FR-017 submitter decision into the concrete self-hosted choice above.
- **Payment/relay primitive**: payment-carrying intents use sender/recipient-bound signed authorizations (EIP-3009 `receiveWithAuthorization`-style) submitted on behalf of an EOA-signing user; the relayer submits these as ordinary signed calls. This is **not** ERC-2771 (trusted-forwarder meta-tx) and **not** ERC-4337 (bundler/smart-account) — a caveat that constrains which open-source relayers actually fit and that MUST be verified during planning (the chosen OSS relayer must submit a bare EIP-3009-authorized call for an EOA on all target chains, including ETC). Per the v1 intent scope above, the relayer additionally submits spec 035's **no-stake signer-attributed intents** through the same generic submission path (FR-028), so the chosen relayer must handle arbitrary signer-attributed calls, not only the EIP-3009 primitive.
- **Specific open-source product selection is deferred to `plan.md`** — the reference `services/relayer/` is the starting candidate; the plan will choose/harden the concrete OSS project against FR-005…FR-025 and the EIP-3009/EOA/ETC fit requirement. The spec constrains capabilities, not the product.
- **Key management**: the relayer's hot gas key is a new, contained pattern distinct from the platform's air-gapped floppy-keystore admin flow; the floppy flow remains the source of authority for admin/upgrade actions and is never used by the relayer.
- **Concrete per-network target volumes** (Polygon mainnet vs Amoy vs Mordor) will be set in planning to instantiate the capacity profile; the early-stage defaults above stand until then.
- **Compute placement**: the service runs on operated compute (the platform's existing container/edge stack is the likely host); whether any part can live on CDN edge compute is a planning question and does not change these capability requirements.
