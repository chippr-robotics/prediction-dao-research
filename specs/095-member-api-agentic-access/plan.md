# Implementation Plan: Member API — Private Keys, MCP Server & Agentic Assistant

**Branch**: `claude/openapi-agentic-chat-7cv5re` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/095-member-api-agentic-access/spec.md`

## Summary

Add a **member-authenticated HTTP surface** to the existing relay gateway (`services/relay-gateway/src/memberApi/`)
whose credential is an **EIP-712 capability token the member signs** — `fw1.<grant>.<signature>`,
presented as `Authorization: Bearer`. The gateway verifies it per request (parse → expiry + lifetime
cap → ECDSA/ERC-1271 recovery → revocation → membership on the reference chain → sanctions → scope →
quota) and stores nothing to issue one. The module serves an **OpenAPI 3.1 document authored as a
plain JS object** so it interpolates the same scope and error-code constants the middleware enforces;
token introspection; three-state reads for membership, wagers and live FeeRouter rates; an
intent-building endpoint that returns unsigned typed data with the actor forced to the token account;
and an optional assistant chat proxy.

Three consumers ride it: a **dependency-free MCP server** (`services/mcp-server/`, node built-ins
only, stdio + optional HTTP), an **api-access mini-app** (a real spec-073 registry package that
cannot sign), and an **opt-in assistant** in the SPA (default OFF, launcher tethered above the bottom
nav, memory device-local, session token in memory only). The three live legal documents are amended
in the same change, and `docs/reference/api.md` — which today asserts there is no HTTP API — is
corrected.

No contract changes. No new deployment. No second write rail: submission of a signed payload reuses
the existing `POST /v1/intents`, and every build response names the self-submit fallback.

## Technical Context

**Language/Version**: JavaScript (ES2022). Gateway: Node ≥ 20 ESM + Express 5. MCP server: Node ≥ 20
ESM, **zero dependencies**. Frontend: React 19 + Vite (rolldown) + wagmi/viem + ethers v6.

**Primary Dependencies**: existing only in every tree that has a lockfile.
The gateway already depends on `express`, `ethers` and `@fairwins/intent-types`; the EIP-712 types
for this feature are added to that package rather than declared locally. `services/mcp-server` adds
**no** dependency and is deliberately **not** a workspace member (see R4). The Anthropic Messages API
is reached with the platform's global `fetch` — no SDK.

**Storage**: none new server-side. The gateway remains stateless: the revocation register is an
in-process set with the same Phase-1 semantics as every other gateway store, and that is disclosed in
the response body rather than hidden. Client-side: key **metadata** in wallet-scoped `userStorage`
(`api_access_keys`), assistant preferences and bounded conversation memory likewise — all three
deliberately absent from the backup registry.

**Testing**: Vitest for the gateway (`services/relay-gateway/test/`, supertest) and the frontend
(scoped runs locally, full suite in CI); `node:test` for the MCP server (no runner dependency);
Cypress fast tier for the member-facing flows; `vitest-axe` for the new panels.

**Target Platform**: FairWins SPA (all tenants, `assistant` feature-gated), the relay gateway VM, and
a new stateless Cloud Run service for the MCP server.

**Project Type**: Web + service. Frontend + gateway module + standalone service + one registry
package. **Zero contract changes.**

**Performance Goals**: authentication adds one cached membership read (~60 s TTL) and one screening
read per account; a fully cached authenticated read costs one signature recovery. Quotas are keyed on
the **verified account**, not the caller IP — `trust proxy` is unset and nginx fronts the container,
so an IP key would pool every member into one bucket.

**Constraints**: the gateway persists nothing and runs single-instance; the origin lock
(`X-Origin-Auth`) is a transport lock injected by the edge and is **not** member identity — the
capability token is a genuinely new, additive auth layer that neither replaces nor bypasses it;
CORS must gain `Authorization` in its allowed-headers line for browser callers; three-state reads
everywhere; no secret may reach an audit field; the mini-app host object gains **no** new key.

**Scale/Scope**: 1 new gateway module (~8 files) + 2 gateway files modified; 1 new service (~10
files); 1 new registry package (~8 files); ~10 new frontend modules + 6 modified; 3 legal documents,
4 docs pages + 2 corrected; 2 Terraform roots; 6 new Cypress flows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Security-first contracts | **PASS (n/a)** — no change under `contracts/`. The grant is an **off-chain** EIP-712 structure with no Solidity verifier, no chainId and no verifyingContract; nothing is deployed and no storage layout moves. The one place this feature touches on-chain semantics is read-only: it verifies contract-account signatures via ERC-1271 and reads membership, fees and sanctions. Access control **is** in scope per the constitution's own emphasis, and it is reasoned explicitly in the spec (FR-001…FR-009) and in [contracts/api-key-grant.md](./contracts/api-key-grant.md): a token authorises reads, quotes, and the forwarding of member-signed bytes, and no scope in the vocabulary can move value. |
| II. Test-first, comprehensive | **PASS** — gateway suite covers the full refusal matrix (malformed / expired / over-lifetime / revoked / unverifiable / membership-required / membership-unreadable / sanctioned / screening-unavailable / insufficient-scope / over-quota), the actor-forcing invariant on built intents, and the disabled/killed 503 codes. The MCP server ships `node:test` suites for protocol framing and honest tool errors. Frontend suites cover grant encoding, the three-state gate, memory bounds, the backup-absence assertion, and axe on both new panels. Cypress fast-tier specs cover the six member flows. Local runs stay scoped; the full suite runs in CI. |
| III. Honest state | **PASS (load-bearing)** — this is the principle the whole feature is shaped by. Every read resolves `read` / `not-configured` / `unreadable` and a value exists only on `read`; an unreadable membership is a retryable 503, never tier 0; an unverifiable ERC-1271 leg is a retryable 503, never a 401 (the spec-084 three-verdict precedent); a revocation the service cannot durably keep says so in its own response body; the assistant never renders a fabricated reply and never claims to have acted; the console's unreachable state renders no list. Cohort isolation is unchanged — reads never cross the testnet/mainnet boundary. |
| IV. Fail loudly in CI | **PASS** — no `continue-on-error` is added anywhere. The new module's configuration validation throws at boot **only** when the module is enabled, so an unconfigured optional feature can never stop the relay path; the assistant boot-fails on a malformed model configuration when enabled. The new spec directory carries its `matrix.json` row (spec 094 gate), and the mini-app package joins the byte-digest baseline so the on-chain byte gate actually looks at it. |
| V. Accessible, consistent frontend | **PASS** — WCAG 2.1 AA on both Settings cards and the assistant panel: `role="dialog"` with an accessible name, a **polite** live region for replies (never assertive — an assistant streaming into an assertive region interrupts the member), visible focus, a 36×36 minimum target on the launcher, and `prefers-reduced-motion` reducing every transition to opacity. Styling uses `theme.css` tokens only — no hex, no restated `font-family`, links on `--accent-color`, opaque status surfaces. No contract address or ABI is hand-copied: the API resolves targets from the gateway's pinned `targetsByKey`, which is built from `deployments/`. |

### New core technologies (constitution, *Additional Constraints*)

The stack of record is Solidity+Hardhat / React+Vite+Vitest / The Graph. Three additions are
introduced here, each justified and each deliberately *not* a new dependency:

1. **An HTTP authentication layer inside the existing Express gateway.** Not a new server, framework
   or runtime — a middleware in a service that already exists, already parses JSON, already screens
   signers and already applies quotas. The alternative (a separate auth service) would add a
   deployment, a second place for member identity to live, and a network hop between the token check
   and the reads it authorises. The token is verified with `ethers`, already a gateway dependency.
2. **A dependency-free MCP JSON-RPC server** (`services/mcp-server/`). MCP is the protocol AI clients
   speak; serving it is the entire point of the ask. The reference SDK was **rejected**: this repo's
   lockfile is a measured hazard (spec 075 — an incremental install silently drops a platform binary
   and breaks every Vite build, including the on-chain mini-app release path), and MCP over stdio is
   line-delimited JSON-RPC 2.0 that Node's built-ins express directly. The server is therefore not a
   workspace member at all, adds nothing to the lockfile, and is tested with `node:test`.
3. **The Anthropic Messages API as an optional upstream.** The assistant needs a model; the platform
   does not host one. It is reached with global `fetch` behind an `AbortController` timeout — the
   same shape as every other upstream in this gateway (`perps/client.js`, `opensea/client.js`) — so
   no SDK enters the lockfile. It is configured independently of the rest of the module and is **off
   by default**, so the API ships whole with no model provider at all.

**Not** introduced: an OpenAPI generator or validation middleware (the document is a plain JS object,
see R6); a session/cookie layer (there is no session — every request re-verifies); a database (the
gateway stays stateless); a second fee store (rates are read from the FeeRouter).

**Post-design re-check (after Phase 1)**: unchanged — no violations, no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/095-member-api-agentic-access/
├── spec.md                       # Feature specification
├── plan.md                       # This file
├── research.md                   # Phase 0 output — condensed inventory findings
├── quickstart.md                 # Phase 1 output — manual validation
├── contracts/
│   ├── member-api.md             # the wire contract (paths, auth, codes, scopes)
│   ├── api-key-grant.md          # EIP-712 grant/revocation, token format, verification order
│   └── mcp-server.md             # the MCP surface (tools/resources/prompts, JSON-RPC)
├── checklists/requirements.md
└── tasks.md                      # Phase 2 output
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── memberApi/
│   │   ├── contract.js           # [NEW] ROUTES + SCOPES + error codes — the ONE list routes.js mounts and openapi.js documents
│   │   ├── routes.js             # [NEW] router: absolute /v1/member/* paths, guard/handleError quartet, /status contribution
│   │   ├── auth.js               # [NEW] token parse, EIP-712 digest, ECDSA + ERC-1271 legs, the ordered bearer middleware
│   │   ├── revocation.js         # [NEW] in-process revocation register (durable: false, stated in every response)
│   │   ├── membership.js         # [NEW] reference-chain tier read, ~60s cache, three-state
│   │   ├── openapi.js            # [NEW] the OpenAPI 3.1 document as a JS object (iterates contract.js)
│   │   ├── wagers.js             # [NEW] per-chain subgraph reads, three-state envelope
│   │   ├── intents.js            # [NEW] typed-data builder over @fairwins/intent-types + pinned targets
│   │   └── assistant.js          # [NEW] model-provider Messages proxy (optional sub-module)
│   ├── config/index.js           # [MODIFY] memberApi + assistant config block; header env docs
│   └── server.js                 # [MODIFY] mount router; CORS allowed-headers gains Authorization; /status splice
├── .env.example                  # [MODIFY] MEMBER_API_* / ASSISTANT_* documented
└── test/
    ├── memberApiHelpers.js       # [NEW] real grants signed with the package's own tables
    ├── memberApiAuth.test.js     # [NEW] the refusal matrix — the gate the off-chain structs have instead of typehash parity
    └── memberApi.test.js         # [NEW] supertest suite over createApp(): routes, envelopes, mounted-set == documented-set

packages/intent-types/
├── src/offchain.js               # [NEW] MEMBER_API_DOMAIN / _GRANT_TYPES / _REVOCATION_TYPES + canonicalScopeString (no Solidity verifier)
├── src/index.js                  # [MODIFY] re-exports the four, so both trees keep ONE import specifier
└── package.json                  # [MODIFY] "./offchain" export + the note on why it is outside both parity gates

services/mcp-server/              # [NEW] standalone, ZERO deps, NOT a workspace member
├── package.json                  # no dependencies; "test": "node --test"
├── src/server.js                 # stdio JSON-RPC transport + --http mode (POST /mcp, GET /healthz)
├── src/protocol.js               # initialize/ping/tools/resources/prompts dispatch
├── src/apiClient.js              # bounded fetch to the member API; honest error mapping
├── src/tools.js                  # 8 tools, JSON-schema'd, isError content on failure
├── src/resources.js              # fairwins://openapi | status | guide
├── src/prompts.js                # wager-review, portfolio-briefing
├── test/*.test.js                # node:test
├── Dockerfile                    # node:20-alpine, USER node, EXPOSE 8790, HEALTHCHECK /healthz
└── README.md                     # MCP client configuration snippets

frontend/src/
├── components/
│   ├── account/
│   │   ├── ApiAccessPanel.jsx / .css          # [NEW] Settings card `api-access`
│   │   └── AssistantPreferencesPanel.jsx/.css # [NEW] Settings card `assistant-prefs`
│   ├── assistant/
│   │   ├── AssistantLauncher.jsx / .css       # [NEW] floating launcher, tethered above the bottom nav
│   │   └── AssistantPanel.jsx / .css          # [NEW] bottom-sheet chat panel
│   └── nav/NavIcon.jsx                        # [MODIFY] new `chat` glyph
├── lib/
│   ├── apiAccess/apiKeys.js                   # [NEW] grant building/encoding + metadata store
│   └── assistant/{assistantPrefs,memoryStore,assistantClient}.js  # [NEW]
├── hooks/useBottomNavOffset.js                # [NEW] ResizeObserver over .section-icon-nav
├── config/navSearchIndex.js                   # [MODIFY] settings-api-access / settings-assistant destinations
├── pages/WalletPage.jsx                       # [MODIFY] two cards into the single settings AccordionGroup
├── App.jsx                                    # [MODIFY] mount <AssistantLauncher/> in AppLayout
└── legal/{privacy-policy,risk-disclosure,terms}.md  # [MODIFY] see FR-027/FR-028

frontend/miniapps/api-access/     # [NEW] @fairwins/miniapp-api-access (registry package)
├── package.json, vite.config.js
└── src/{entry.jsx, console/*.jsx, style.css, __tests__/{_host.jsx,*.test.jsx}}

tenants/{features.json, fairwins/manifest.json, example/manifest.json}   # [MODIFY] `assistant` feature

infra/terraform/environments/{prod,staging}/{main.tf,imports.tf}         # [MODIFY] mcp-server Cloud Run

docs/
├── developer-guide/{member-api,mcp-server,agentic-chat}.md              # [NEW]
├── runbooks/member-api-operations.md                                    # [NEW]
├── runbooks/README.md, ../mkdocs.yml                                    # [MODIFY] index + nav
├── reference/api.md                                                     # [MODIFY] corrects "there is no HTTP API"
├── reference/configuration.md                                           # [MODIFY] new envs
└── user-guide/assistant-and-api.md                                      # [NEW]

frontend/cypress/
├── coverage/matrix.json                       # [MODIFY] row for 095 with six flows
├── support/commands.js                        # [MODIFY] mock gains eth_signTypedData_v4
└── e2e/fast/3x-{assistant,api-access}.cy.js   # [NEW]
```

**Structure Decision**: the gateway module follows the established optional-module shape exactly
(config block → router factory → unconditional mount → `/status` contribution → contract doc cited in
the module docstring), so it inherits the origin lock, the killswitch, the error body and the quota
primitives rather than re-implementing them. The MCP server is a **separate service, not a workspace
member**, because it has no dependencies and adding it to the lockfile buys nothing and risks the
known install hazard. The console is a true registry package under `frontend/miniapps/`, which is why
it cannot sign — and that limitation is the design, not an obstacle.

## Design Decisions (summary — full reasoning in research.md)

- **R1 The credential is a member-signed capability token, because the gateway is stateless by
  design.** Nothing in the gateway persists — `intent/store.js`, `policy/dedup.js`, `policy/quotas.js`
  and `opensea/cache.js` are in-process Maps with "Phase 2: shared Redis" notes, and the container
  declares no volume. A server-issued API key needs a durable record to *be* a key; a signed grant
  needs none, because the signature carries its own authority. This also removes the largest possible
  breach: there is no key table to steal.
- **R2 Revocation is the one genuinely stateful behaviour, so it is best-effort and says so.** The
  register is in-process and a restart forgets it. Every response carries `durable: false` with a
  reason, and every surface repeats it alongside the grant's own expiry. The alternative — implying a
  permanent revocation — would be exactly the kind of claim this repo's honest-state rule exists to
  forbid. The short default lifetime cap is what makes the weak guarantee tolerable.
- **R3 Signing lives in the host, never in the mini-app.** The host object's ten keys are the entire
  privileged surface and contain **no** `signMessage`/`signTypedData`; adding one would grant it
  permanently to every third-party package, including untrusted ones. So the console explains where
  keys are made and deep-links there, and the SPA card owns the signature. This is why US1 (host) and
  US5 (console) are separate stories rather than one screen.
- **R4 The MCP server is dependency-free and outside the workspace.** MCP over stdio is
  newline-delimited JSON-RPC 2.0; `initialize`, `tools/list`, `tools/call`, `resources/*`, `prompts/*`
  and `ping` are a small dispatch table. The official SDK would pull a dependency tree into a lockfile
  whose incremental-install failure mode is measured and repeatedly triggered by Dependabot here.
  Keeping the service out of `workspaces` means it can never move the lockfile at all.
- **R5 `Authorization` is added to the gateway's CORS allowed-headers, deliberately and with a
  comment.** Today that line is `Content-Type` only, so a browser sending a bearer token fails
  preflight silently. Nothing else changes: no credentials mode, no cookies, the origin allow-list and
  the `X-Origin-Auth` edge lock are untouched. The token is a *member* credential; the origin lock is
  a *transport* lock; they are additive and neither substitutes for the other.
- **R6 The OpenAPI document is a JS object, not a generated artifact.** Authoring it in JS lets it
  interpolate the same `SCOPES` and error-code constants the middleware enforces, so a scope added to
  the vocabulary appears in the published contract without a second edit — which is the property that
  matters. A generator or validation middleware would be a new toolchain earning nothing the object
  does not already give.
- **R7 An unverifiable answer is never a denial.** Two legs of authentication can fail to *know*: the
  ERC-1271 check (a chain read — a smart-account signature and a forgery are indistinguishable
  without it) and the membership read. Both answer 503 with their own code, not 401/403. This is the
  spec-084 three-verdict rule applied to authentication, and it is the difference between "your key
  is bad" and "we could not check".
- **R8 The actor is the token account, always.** The intent builder sets the action's actor field from
  the verified token, never from the request body — mirroring the relay's own invariant, where
  `signIntent` sets the actor and `verifyIntent` re-derives it. `authOnly` actions return their true
  EIP-3009 shape rather than a synthesised struct, and `invalidateNonce` is refused with a stated
  reason because a relayed call cannot express which nonce to burn.
- **R9 The assistant is off by default and structurally unable to act.** It renders nothing until a
  tenant feature, a connected wallet, a positively-read paid membership and an explicit member opt-in
  all hold; its own scope grants chat and reads and nothing else; its session token lives in memory
  only; its memory never leaves the device or enters the backup registry; and message content never
  reaches a log or an audit field (the audit logger's forbidden-key list is a backstop, not a
  substitute for not passing it).
- **R10 The launcher measures the bottom nav rather than assuming it.** `SectionIconNav` is absent on
  Settings, Network, Membership and on any disconnected wallet view, and its height is not a token —
  existing consumers hardcode 84px and 64px. A `ResizeObserver` hook reads the live element so the
  launcher re-tethers when the nav appears or disappears, and sits at z-index 1300: above the nav
  (1200), below the drawer backdrop (1400).
- **R11 The legal documents are amended, not appended to.** The Risk Disclosure already has an
  automation/AI section and the Terms an automated-components clause; both are extended. The Privacy
  Policy has *no* AI language at all and asserts a closed list of what is processed — shipping member
  chat without amending it would make a live, versioned, consent-bound document say something false.
  No fourth legal document is added and the legal link set is unchanged.
- **R12 The MCP service is stateless and secretless on Cloud Run.** It holds no key, no member data
  and no gateway credential: the member's own token arrives per request (HTTP mode) or per process
  (stdio). So it needs no service account, no `secret_env`, and no `actAs` widening — the shape of the
  existing `module "spa"` block with `env` for the API base URL and nothing else. Single-container on
  purpose: the shared module's `ignore_changes` indexes `containers[0]`.

## Complexity Tracking

No constitution violations. No entries.

The three technologies named in the Constitution Check are recorded there rather than here because
each is an *addition permitted by the Additional Constraints with justification in the plan*, not a
deviation from a principle: none of them relaxes security-first review (no contracts change), none
introduces an untested path (each ships its own suite), none renders unverified state as fact, none
weakens CI, and none ships inaccessible UI.
