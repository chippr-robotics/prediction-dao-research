# Implementation Plan: Intent Relayer Infrastructure

**Branch**: `036-relayer-infrastructure` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-relayer-infrastructure/spec.md`

## Summary

Provide the production submitter that spec 035 (Intent-Based Signatures) left abstract: a **self-hosted, open-source gas relayer** that submits users' signed intents on-chain across Polygon (137), Amoy (80002), and Ethereum Classic mainnet (61) / Mordor (63), so users pay no gas and need no native token, with the on-chain effect always attributed to the signer.

Technical approach (from research): a **two-component service** — a thin FairWins-owned **relay gateway** (Node 20 + ethers v6, evolving `services/relayer/`) that owns all signer/intent policy (recover signer, verify intent binding, **sanctions re-screen on the signer fail-closed**, dedup, quotas + spend caps, fee-netting decline, back-pressure, audit, origin-lock, kill switch), fronting **OpenZeppelin Relayer** (OSS Rust, AGPL-3.0) as the **submission engine** that owns transaction mechanics (per-`(chain,wallet)` nonce lanes, gas estimation/bumping, inclusion tracking, RPC failover, KMS-held hot key). It is untrusted-by-design ("can censor, never steal"), optional and additive (100% self-submit fallback), and is a deliberate, documented, scoped exception to the platform's no-backend directive that **supersedes spec 035 SC-008 and resolves spec 035 FR-017**. Persistence is footprint-minimizing: on-chain is the record of record; audit → Cloud Logging + WORM (≥5yr); pending-nonce → reconstructed from chain; hot key → Secret Manager; shared Redis (Memorystore Basic) only at Phase-2 horizontal scale. The endpoint sits behind the same Cloudflare 451 geo-gate + origin-lock as the SPA.

## Technical Context

**Language/Version**: Relay gateway — Node.js 20 LTS + ethers v6 (Express + helmet), matching the repo toolchain and the existing `services/relayer/` prototype. Submission engine — OpenZeppelin Relayer (Rust, pinned 1.x), run as a configured container (not a code dependency). Contracts remain Solidity (unchanged here; the signer-attributed entrypoints they call are delivered by spec 035).

**Primary Dependencies**: OpenZeppelin Relayer (AGPL-3.0) + `openzeppelin-monitor`; Node/Express + ethers v6; Redis via Memorystore (Phase 2); GCP Secret Manager; GCP Cloud Logging + Log Router; Cloudflare (WAF geo rule + Transform Rule origin-lock). Reuses on-chain `ISanctionsGuard` + version-pinned target ABIs. Fallback engine: rrelayer (MIT). Not used: ERC-2771 forwarders, ERC-4337 bundlers.

**Storage**: On-chain = permanent record of record. Off-chain — audit trail → Cloud Logging → Log Router → WORM (GCS Bucket Lock or locked log bucket), ≥5yr; operational shared state (nonce lanes, dedup, rate-limit/spend counters) → in-process (Phase 1) / Redis Memorystore Basic (Phase 2); pending-nonce → reconstructed from chain on startup; hot key → Secret Manager (optional KMS remote-signing). No relational/document DB.

**Testing**: Vitest/Node unit + integration for the gateway (signer recovery, sanctions fail-closed, dedup idempotency, quota/spend-cap, fee-netting decline); integration against a staging chain (nonce-collision-free submission, stuck-tx re-price, RPC failover, self-submit fallback, kill switch, ≥2-instance correctness); **CI-gating k6 load test** (sustained + burst thresholds that fail the pipeline). ETC/Mordor legacy-gas submission validated end-to-end before reliance.

**Target Platform**: Linux containers on GCP Cloud Run (us-central1) behind the existing Cloudflare edge (`fairwins.app`). Submits to Polygon 137, Amoy 80002, ETC 61, Mordor 63.

**Project Type**: Self-hosted backend microservice (operated compute) — a documented, scoped exception to the no-backend directive — a FairWins gateway fronting an OSS engine; additive to the SPA + contracts + subgraph, never a single point of failure.

**Performance Goals**: sustain ≥3 intents/sec/chain; burst ≥20/sec for 30s; p95 accept→broadcast < 2s; zero nonce collisions (incl. ≥2 instances); RPC-failover error rate < 1% and back to baseline < 30s; stuck-tx re-priced within a bounded window without wedging the lane. Designed to scale horizontally.

**Constraints**: untrusted-by-design (censor-not-steal); no user funds / no authority; screen the signer, fail-closed; 100% self-submit fallback; hot key dedicated/low-value/spend-capped/Secret-Manager-held/segregated-from-floppy/never-logged/rotatable; ETC/Mordor legacy type-0 gas + `batchMaxCount:1`; **gasless USC payment on 61/63 blocked** (permit-only token) — no-stake intents + self-submit only there; version-pinned addresses/ABIs + startup check; graceful drain; network isolation; same Cloudflare 451 + origin-lock as SPA; AGPL-3.0 copyleft contained in the separate gateway; best-effort availability (no hard SLA); CI fail-loud; WCAG 2.1 AA for new client states.

**Scale/Scope**: early-stage with headroom; 4 networks, one nonce lane + gas wallet each; both spec-035 intent classes in v1 via a generic signer-attributed path; Phase 1 single instance, Phase 2 horizontal with shared Redis; audit ≥5yr; net-new footprint = one Cloud Run service in v1 (+Memorystore Basic +VPC connector at Phase 2).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| **I. Security-First Smart Contracts** | 036 ships **no new Solidity** (it consumes spec 035's signer-attributed entrypoints); its risk surface is the gateway (signer sanctions re-screen fail-closed, origin-lock, spend caps) and a hot key. Highest-risk items — hot key and compliance path — are explicitly contained (Secret Manager, low-value/capped/segregated key FR-017/FR-019a; fail-closed screening FR-013; untrusted-by-design FR-003). The gateway warrants a security review even though it is not a contract. | **PASS** (security review required for the gateway) |
| **II. Test-First & Coverage** | Gateway unit/integration + staging integration + CI-gating load test defined (FR-011, Technical Context → Testing). Failure/edge paths (fail-closed, dedup, stuck-tx, failover, self-submit, kill switch, multi-instance) are explicit acceptance criteria. | **PASS** |
| **III. Honest State, No Placeholders** | Inclusion tracking forbids false success (FR-006); honest intent status reused from 035 (FR-018/FR-027); network isolation (FR-024, SC-014); self-submit is real, not stubbed. The **USC/EIP-3009 gap is surfaced truthfully** (gasless payment on ETC/Mordor is blocked, not faked). | **PASS** |
| **IV. Fail Loudly in CI** | FR-026 makes build/lint/test/load-test/security scans gating with no `continue-on-error`; latency/throughput regressions fail the pipeline. | **PASS** |
| **V. Accessible, Consistent Frontend** | FR-027 requires the new client states (back-pressure, relayer-unavailable→self-submit, relayed-vs-pending) to meet WCAG 2.1 AA, reusing 035's status framework. | **PASS** |
| **Tech stack (new core technology)** | Introduces OpenZeppelin Relayer (Rust) + Redis + a backend service — **new core technologies** requiring justification (below in Complexity Tracking). | **PASS with justification** |
| **No-backend / fixed footprint** (documented directive, not a constitutional clause) | Operating a relayer overrides the directive. Taken as a **deliberate, documented, scoped exception** (FR-001/FR-004), user-decided 2026-07-01, bounded (stateless-to-users, non-custodial, optional, self-submit backstop), net-new footprint minimized to one Cloud Run service in v1. Recorded in Complexity Tracking + the FR-004 decision record; the `no-backend-footprint` memory is updated. | **PASS with justification** |
| **Key management** (air-gapped floppy for admin) | New hot-key pattern, contained: dedicated/low-value/spend-capped, Secret-Manager/KMS-held, segregated from the floppy admin keys, never logged, rotatable; worst case bounded to gas + censorship. | **PASS with justification** |
| **Archived code / deployments as source of truth** | No archived-code use; addresses/ABIs version-pinned to deployed proxies with a startup consistency check (FR-025). | **PASS** |

**Gate result: PASS** — no unjustified violations. The three "with justification" items are tracked in Complexity Tracking. Re-checked after Phase 1 design: unchanged (design keeps the exception minimal and the contract-free footprint).

## Project Structure

### Documentation (this feature)

```text
specs/036-relayer-infrastructure/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — decisions + Technical Context resolution
├── data-model.md        # Phase 1 output — relayer entities & state
├── quickstart.md        # Phase 1 output — runnable validation guide
├── contracts/           # Phase 1 output — relay gateway API + engine + webhook contracts
│   ├── relay-gateway-api.md
│   ├── engine-integration.md
│   └── frontend-relay-client.md
├── checklists/
│   └── requirements.md  # /speckit-specify + /speckit-clarify output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
services/
├── relay-gateway/                 # NEW — FairWins policy gateway (Node 20 + ethers v6 + Express)
│   ├── src/
│   │   ├── server.js              # HTTP API; origin-lock (X-Origin-Auth) middleware; /healthz
│   │   ├── intent/                # signer recovery (EIP-712 / EIP-3009), intent-binding validation, chain-id/expiry checks
│   │   ├── policy/                # sanctions re-screen (fail-closed), dedup, per-signer/global quotas, spend caps, fee-netting decline, back-pressure/queue
│   │   ├── engine/               # OZ Relayer REST client (submit) + status webhook handler
│   │   ├── audit/                 # structured audit events (intent→signer→txHash) to Cloud Logging
│   │   ├── config/                # per-chain config, version-pinned addresses/ABIs + startup consistency check, kill switch
│   │   └── config.js
│   ├── test/                      # Vitest unit + integration
│   ├── load/                      # k6 CI-gating load test (sustained + burst profiles)
│   └── Dockerfile
├── oz-relayer/                    # NEW — OpenZeppelin Relayer configuration (not our code)
│   └── config/                    # networks (137/80002/61/63; ETC legacy gas), signers (Secret Manager/KMS), rpc_urls failover, webhooks
└── relayer/                       # EXISTING prototype — demoted to reference/fallback baseline (not deployed)

frontend/
└── src/lib/relay/                 # generalize pools/gasless.js + relayerClient.js into a shared intent-relay client
                                   # (+ CSP connect-src + VITE_RELAYER_URL wiring for the perimeter endpoint)

infra/
├── cloudflare/                    # add relayer.fairwins.app host to the existing zone rules (geo WAF + origin-lock Transform)
└── (Cloud Logging Log Router sink + WORM bucket config; Secret Manager entry for the gas hot key)

cloudbuild.yaml                    # add a build+deploy step for the relay-gateway Cloud Run service
```

**Structure Decision**: A dedicated `services/relay-gateway/` (FairWins-owned policy) plus a configured `services/oz-relayer/` (OSS engine), with the legacy `services/relayer/` kept only as a reference baseline. Frontend changes are confined to a generalized relay client under `frontend/src/lib/relay/` plus CSP/env wiring. Infra changes reuse existing Cloud Run, Cloudflare, Cloud Logging, and Secret Manager — the only net-new operated component in v1 is the Cloud Run relay service (Memorystore + VPC connector are Phase-2 only). This matches the research §1 gateway/engine split and §3/§4 footprint & perimeter decisions.

## Complexity Tracking

> Deviations requiring justification (referenced from the Constitution Check).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Operating a backend service (overrides the no-backend / fixed-footprint directive)** | Spec 035's gasless UX requires a submitter that pays gas and holds a hot key; that cannot live on-chain, on IPFS, or on the declarative CDN edge. User decision (2026-07-01) to self-host over a managed vendor to retain ETC/Mordor coverage and control of the compliance path. | **Managed relayer (Gelato/Biconomy/OZ Defender):** no ETC/Mordor support, ERC-2771/4337-oriented, and OZ Defender is being sunset 2026-07-01. **Cloudflare Worker:** still net-new compute + a hot key and an unresolved "edge vs new compute" ruling. **No relayer (self-submit only):** abandons the core spec-035 UX. Exception is bounded (FR-003/FR-004) and net-new footprint minimized to one Cloud Run service. |
| **New core technology: OpenZeppelin Relayer (Rust) + Redis** | The hard, correctness-critical distributed-systems work (nonce lanes, gas bumping, inclusion tracking, RPC failover, KMS signing, multi-instance coordination) is exactly what a mature OSS relayer provides; rebuilding it in Node would be larger, riskier, and slower. Redis is the shared store the spec already budgets ("operated compute plus a datastore"). | **Harden the Node/Express prototype into the engine:** re-implements OZ Relayer's mechanics from scratch — more code, more bugs, no upstream maintenance. **A relational DB instead of Redis:** heavier footprint for ephemeral counters/locks; Redis is deferred to Phase 2 and never the record of authority (reconstruct-from-chain). |
| **New key-management pattern: persistent hot gas key** | A relayer must sign and pay gas continuously; the platform's air-gapped floppy flow (cold, per-signature) cannot serve an always-online submitter. | **Reuse the floppy admin key:** forbidden — would put upgrade authority online. Containment (dedicated/low-value/spend-capped/Secret-Manager-held/segregated/never-logged/rotatable) bounds worst case to gas loss + censorship, never user funds or authority. |

**AGPL-3.0 note (not a constitution violation, tracked here):** OZ Relayer is AGPL-3.0 (network copyleft). FairWins's own logic lives in the separately-licensed `relay-gateway` and communicates with the engine over its REST API (not linked), so the copyleft obligation is limited to the engine itself; if that boundary is ever deemed insufficient, **rrelayer (MIT)** is the pre-vetted drop-in engine.
