# Research: Member API, MCP Server & Agentic Assistant (095)

Phase 0 output. Sources: a full read of `services/relay-gateway/src/**` (server, config, policy,
audit, every route module) and its tests; `packages/intent-types/src/index.js` and the two parity
gates; `frontend/src/{App.jsx,main.jsx,pages/WalletPage.jsx,config/appNav.js,config/navSearchIndex.js}`
plus the nav, account, preference and storage seams; the spec-073/077 mini-app platform (build preset,
loader, host context, package-boundary gate); `infra/terraform/**` and `scripts/infra/check-iac-guardrails.js`;
the Cypress harness (`frontend/cypress/**`) and the spec-094 coverage gate; `docs/**`,
`frontend/src/legal/*.md`, `frontend/src/utils/legalDocs.js`, `mkdocs.yml`; `.specify/memory/constitution.md`.

Line references are to the files as they exist on this branch.

---

## R1 — The credential: a member-signed capability token, because the gateway is stateless

**Decision**: an API key is an EIP-712 **grant the member signs**, encoded as
`fw1.<base64url(grantJSON)>.<base64url(signature)>` and presented as `Authorization: Bearer`. The
gateway issues nothing and stores nothing to make a token valid.

**Rationale** (each point read, not inferred):

1. **Nothing in this gateway persists.** `src/intent/store.js:3-6`, `src/policy/dedup.js:14` and
   `src/policy/quotas.js:5-7` all carry the same "Phase 1: in-process (single instance). Phase 2:
   shared Redis" note; `src/opensea/cache.js:9-11` says the same for the TTL cache. The production
   container declares **no volume** (`infra/vm/gateway/docker-compose.yml`) and redis in that
   deployment is engine-scoped and ephemeral (`--save "" --appendonly no`). A server-issued API key
   *is* a durable record; this service has nowhere to keep one.
2. **A signed grant needs no record to be valid.** The signature is the authority; the gateway
   re-derives the account on every request, which is exactly what it already does for relayed intents
   (`src/intent/verify.js`, and the sanctions screen at `src/server.js:404` runs on the **recovered**
   signer, never a claimed one).
3. **There is no key table to steal.** The largest breach a server-issued scheme would create simply
   does not exist here.
4. **`ethers` is already a gateway dependency** (`services/relay-gateway/package.json:19-30`), so
   verification adds no package.

**Alternatives rejected**: (a) server-issued opaque keys — needs durable state the service does not
have, and introduces a credential the platform could impersonate a member with; (b) OAuth/JWT with a
platform signing key — same objection plus a key-management surface; (c) reusing `X-Origin-Auth` —
see R5, it is not identity at all.

## R2 — Revocation is the one stateful behaviour, so it is best-effort and says so

`src/policy/quotas.js` and friends set the precedent: in-process, single instance, honest about it.
A revocation register can therefore only be in-process, and a restart forgets it.

**Decision**: `POST /v1/member/keys/revoke` accepts a member-signed `ApiKeyRevocation` (self-
authorising — presenting the token is not required, and must not be, because the member may have lost
it), adds the key id to an in-process set, and answers `{ revoked: true, durable: false, reason: … }`.
`GET /v1/member/keys/status` answers the same two fields. Every client surface repeats both facts and
names the grant's own expiry as the bound the service can always keep.

This is why the lifetime cap (`MEMBER_API_MAX_TTL_DAYS`, default 90) is a hard refusal rather than a
default: with a weak revocation guarantee, the expiry is the real revocation, so a grant may not ask
for an unbounded one. Presenting `durable: true` would be precisely the fabricated-certainty failure
constitution III exists to prevent.

## R3 — Signing lives in the host; the console cannot sign, by design

The mini-app host object is frozen at ten keys — `appId, wallet, readProvider, contracts, network,
networks, store, audit, toast, navigate` (`frontend/src/lib/miniapps/hostContext.jsx:966-990`).
`wallet` exposes `address, connectedAddress, chainId, isConnected, submit, requestConnect,
switchChain` and **no signing primitive at all**: there is no `signMessage`, no `signTypedData`, no
signer handle. `wallet.submit` is a *transaction* rail that rebuilds `{to, value, data}` and drops
`batch`/`operation`.

Adding a signing key to that object would grant it permanently to **every** third-party package,
including untrusted ones — the host object is the whole of what a package gets, which is exactly why
it is small.

Two further hard limits on the package: `import.meta.env.*` evaluates to `undefined` inside a package
(`tools/miniapp-build/constants.js:109-118`, the `__MINIAPP_NO_INLINE_ENV__` prefix), and nothing in
`frontend/miniapps/**` may import `frontend/src/**` in either direction
(`frontend/src/test/miniapps/packageBoundary.test.js`, four checks, package list derived from disk at
`:214-223`). So the console cannot read the app's gateway URL either.

**Decision**: the console asks the member for the API base URL (persisted in `store`), holds a pasted
token in **component memory only** (`store` holds app state, never key material —
`frontend/src/lib/miniapps/store.js:47-49`), and deep-links key creation to
`/wallet?tab=settings#api-access` via `host.navigate`, stating in the UI that signing lives in the
app. Package naming is load-bearing: `appSlug(record.name)` must fold to `manifest.id`, so the listing
name "API Access" → `api-access`, and the package must be `@fairwins/miniapp-api-access` in
`frontend/miniapps/api-access/` for the boundary gate's name check to hold.

## R4 — The MCP server is dependency-free and outside the workspace

MCP over stdio is newline-delimited JSON-RPC 2.0. The methods this feature needs — `initialize`,
`ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`,
and accepting `notifications/initialized` — are a dispatch table over `JSON.parse`/`JSON.stringify`
and `process.stdin`. Node's built-ins express all of it.

**Decision**: `services/mcp-server/` has **zero dependencies**, is tested with `node:test`, and is
**not** added to the root `workspaces`.

**Rationale**: the lockfile is a measured hazard in this repo, not a theoretical one — CLAUDE.md
records that an incremental `npm install` silently drops an optional platform binary from both
`node_modules` and the lockfile, breaking every Vite build **including the on-chain mini-app release
path**, that `npm ci` does not fix it, and that 3 of 5 lockfile-touching Dependabot PRs in one week
triggered it. A service with no dependencies that is not a workspace member cannot move the lockfile
at all. The reference MCP SDK buys framing code we can write in a hundred lines and costs exactly the
exposure that has already broken this tree.

The Dockerfile therefore uses a **standalone build context** (`services/mcp-server`), unlike the
gateway's repo-root context — there is no workspace package to copy in, and the gateway's
`Dockerfile:17-36` comment records what happens when a workspace-linked package is half-copied
(builds green, dies at boot on `ERR_MODULE_NOT_FOUND`).

## R5 — Auth layering: the origin lock is transport, the token is identity

`src/server.js:184-193` is the only request authentication on client routes today: a single zone-wide
`X-Origin-Auth` shared secret, injected in transit by a Cloudflare Transform Rule, compared with
`timingSafeEqual` over SHA-256 digests, exempting only `/healthz`, `/status` and
`/v1/engine/webhook`. It carries **no member identity**. Grepping `Authorization` across
`services/relay-gateway/src/` returns exactly one hit, and it is *outbound*
(`src/engine/client.js:29`).

Two consequences:

1. **The capability token is genuinely new and strictly additive.** It authenticates a *member*; the
   origin lock authenticates *the platform edge*. Neither replaces the other, and an out-of-browser
   client (an MCP server, a script) reaching a production host must satisfy the edge lock as well —
   documented in the contract rather than worked around.
2. **CORS must gain one header.** `src/server.js:164` sets
   `Access-Control-Allow-Headers: 'Content-Type'` — a browser sending `Authorization` fails preflight
   **silently**. `Authorization` is added there with a comment; no credentials mode, no cookies, the
   origin allow-list unchanged. This is a deliberate, reviewed change to a line the inventory flags as
   affecting every module's posture.

The module also inherits the established optional-module shape verbatim (`src/perps/routes.js:109-156`):
module killswitch checked **before** the global one, mounted **unconditionally** so "off" is a
machine-readable 503 rather than a 404 (`server.js:658-660`, `:700-703`, `:730-731`), boot-fail
validation only inside `if (enabled)` (`config/index.js:455`, `:509`, `:566`), and the nested
`{ error: { code, reason } }` body from `src/errors.js:23-25` with `Retry-After` whenever
`retryAfterSec` is set. Bitcoin's flat `{ error, message }` body (`src/bitcoin/routes.js:105-106`) is
the documented exception and is **not** copied.

**Never log the token**: `src/audit/log.js:12` drops `signature|sig|intentSig|privateKey|key|secret|authorization`
from every audit line — a backstop, not a licence to pass a token into an audit field.

## R6 — The OpenAPI document is a JS object, not a generated artifact

There is **no OpenAPI or Swagger artifact for any shipped service in this repository**. The only
`openapi:` text is a design sketch in `docs/active_build/scalability-architecture.md:751` describing a
different API. The de-facto contracts are hand-written Markdown under `specs/*/contracts/*.md`, cited
by each router's module docstring (`perps/routes.js:4`, `bitcoin/routes.js:4`,
`polymarket/routes.js:4`).

**Decision**: author the document as `src/memberApi/openapi.js` exporting a plain object, served at
`GET /v1/member/openapi.json` (module must be enabled; no token required — a contract nobody can read
is not a contract). Authoring it in JS is the point: it interpolates the same `SCOPES` and error-code
constants the middleware enforces, so adding a scope or a code cannot leave the published contract
stale. A generator or a validation middleware would be a new toolchain buying nothing this does not
already give, and `specs/095-member-api-agentic-access/contracts/member-api.md` remains the prose
contract in the house style.

## R7 — An unverifiable answer is never a denial

Two legs of authentication can fail to *know* rather than to *reject*:

- **ERC-1271.** A contract account (a Safe, a passkey smart account) has no public key, so an ECDSA
  recovery that does not match the claimed account is exactly what a legitimate smart-account
  signature looks like from outside. Spec 084 encodes this as a three-verdict rule
  (`valid`/`invalid`/`unverifiable`) and CLAUDE.md restates it: "an RPC timeout is NOT a forged
  signature and must never render as one".
- **Membership.** `frontend/src/hooks/useRoleDetails.js:58-60,134-137` and
  `utils/blockchainService.js:936-938` both mark `readable: false` as *unknown*, never tier 0; the
  spec-071 estate rule makes `value` exist only in state `read`.

**Decision**: `503 auth_unverifiable` when the 1271 leg could not run, and `503 membership_unreadable`
when the reference-chain read failed — both distinct from `401 invalid_token` and
`403 membership_required`. Sanctions follow the gateway's existing fail-closed split
(`src/policy/sanctions.js:43-49`): `503 screening_unavailable` vs `403 sanctioned_signer`.

Membership is read on the **reference chain only** (`membershipChainId()`); `hasRoleOnChain` /
`getUserTierOnChain` ignore a passed chain on the `WAGER_PARTICIPANT` path by design
(`blockchainService.js:892-894`, `:921-922`), and the gateway mirrors that by resolving the first
enabled chain with a recorded `membershipManager` rather than trusting a caller-supplied chain.

## R8 — The intent builder: actor forced, no fourth rail

`packages/intent-types/src/index.js` is the single source: 27 `INTENT_TYPES` (`:114`), 29
`INTENT_ACTIONS` (`:387`), 5 `CONTRACT_DOMAINS` (`:51`) frozen with **nothing but** `name`/`version`
because any extra key would change the domain separator. Two gates keep it honest —
`test/intent/TypehashParity.test.js` (package ↔ Solidity, both directions) and
`services/relay-gateway/test/actionCoverage.test.js` (gateway ↔ package).

Facts that shape the builder:

- **The actor is the recovered signer, always.** `frontend/src/lib/relay/intentClient.js:177` sets
  `message[meta.actorField] = await signer.getAddress()` and `verifyIntent` re-derives it. The API
  therefore takes the actor from the **verified token**, never from `params`.
- **`poolJoin` has no intent struct** (`authOnly: true`, `authToParam: 'pool'`) — the EIP-3009
  authorisation *is* the intent. The builder returns that shape rather than synthesising a struct.
- **`invalidateNonce` is not relayable** and is refused with the documented reason
  (`services/relay-gateway/test/actionCoverage.test.js:20-31`: `signIntent` overwrites the struct
  nonce with a fresh uniqueness marker, so a relayed call could not express *which* nonce to burn).
- **The pool domain/target split is not simplifiable**: target = the factory, EIP-712
  `verifyingContract` = the clone from `params.pool` (`src/intent/verify.js:214-238`).
- **Targets come from the gateway's pinned set** (`config/index.js:239-256`), which is built from
  `deployments/*-chain<id>-v2.json` with an FR-025 boot check (`:214-237`). An unpinned target is
  refused with `target_not_allowlisted` (`verify.js:290-293`) — note `callsignRegistry` is defined in
  `ACTIONS` but not pinned today, so callsign actions are not buildable and the API says so rather
  than emitting calldata that would be refused downstream.
- **Submission reuses `POST /v1/intents`** (`server.js:335`) — the whole verify → dedup → screen →
  quota → spend-cap → engine pipeline already exists, and `selfSubmit` is mandatory at the client
  wiring (`lib/relay/useIntentAction.js` throws without it), so every build response names the
  self-submit alternative. No fourth rail, no removed fallback.

The new EIP-712 tables are **off-chain**: no Solidity verifies them, so they must not enter the
contract-verified set the parity gate iterates. They live in `packages/intent-types/src/offchain.js` —
same package (one source, per CLAUDE.md), separate file, so the gate's set stays exactly the
contract-verified one and a struct that is "a claim about a contract" can never be confused with one
that is "a claim about a server". They are additionally **re-exported from `index.js`** and given
their own `./offchain` entry in the package `exports`, so both trees keep one import specifier while
the two kinds of definition stay in different files. `canonicalScopeString` ships from the same module
rather than being written twice: the signer and the verifier must derive the identical string, and
duplicating that rule across two trees is exactly the drift this package exists to prevent — with an
unusually quiet failure mode, since a mismatch produces a token the member just signed being refused
as malformed on every request.

## R9 — The assistant: off by default, and structurally unable to act

There is no chat surface in the app today: a case-insensitive scan of `frontend/src/**` for
`chatbot|chat|conversational|llm|anthropic|openai` returns **zero** UI components, and `NavIcon`'s
glyph vocabulary (`frontend/src/components/nav/NavIcon.jsx:14-86`) has no chat/message/bot icon —
`NavIcon` returns `null` for an unknown name (`:90`), so a missing glyph fails silently and one must
be added.

Gating uses the established three-state idiom from `CallsignPanel.jsx:202-208,560-575`: `tierPending`
(membership `null`) renders "checking"; not-paid renders an **upgrade route**, never a disabled dead
control; unreadable renders nothing rather than a denial.

Storage: `frontend/src/utils/userStorage.js` is the only primitive — wallet-scoped keys
`fw_user_<addr>_<key>` default to **sessionStorage** unless the fourth argument is `true`
(`:17-19` throws with no address). Device-scoped values live in `fw_global_prefs`. Assistant
preferences and memory are wallet-scoped with `useLocalStorage = true`, and are **deliberately absent
from `frontend/src/lib/backup/syncedObjects.js`** — the precedent list there already excludes
`nav_sections`/`nav_density` (first-paint correctness), `network_endpoints` (credentials) and
`miniapp_favorites`, each with a test asserting the absence.

The session token is held **in module memory only**, cleared on disconnect or account change — the
same shape as Polymarket's L2 credentials, which live in `sessionStorage` and never reach the gateway
(`lib/predict/clobSession.js:4-30`).

Message content never reaches a log: `audit/log.js:12`'s forbidden-key set is a backstop; the audit
event carries counts only.

## R10 — Tethering the launcher: measure the nav, do not assume it

`SectionIconNav` (`frontend/src/components/nav/SectionIconNav.jsx`) self-gates
(`if (!isMobile || items.length < 2) return null`) and mounts in exactly two places —
`WalletPage.jsx:776-793` (inside the `isConnected` branch only) and `HomeScreen.jsx:198-203`. It is
therefore **absent** on `?tab=settings`, `?tab=network`, `?tab=membership` and on any disconnected
wallet view. Its height is **not a token**: consumers hardcode `84px` (`WalletPage.css:315-320`) and
`64px` (`ActionSheet.css:238-240`, `ConnectModal.css:233-237`).

Measured z-index ladder: `SectionIconNav` 1200; `app-nav-backdrop` 1400 / `.app-nav-drawer` 1401;
mobile sheets 1500; `NotificationSystem` 10001.

**Decision**: mount `<AssistantLauncher/>` in `AppLayout` beside `<AppNavDrawer/>` (`App.jsx:70`) —
the only seam that renders on every in-app route and no landing page. `position: fixed`, z-index
**1300**, `bottom` = safe-area + (nav present ? measured height + 8px : 16px) via a `ResizeObserver`
hook over `.section-icon-nav`, so it re-tethers when the nav appears or disappears. Anchored right, so
the desktop 64px `--app-nav-gutter-width` inset (`AppNavDrawer.css:455-457`) does not affect it. The
panel follows the `ActionSheet` idiom (backdrop 1500, rises from the bottom on mobile, centred card on
desktop, `padding-bottom` clearing the safe area).

Adding a chat id to `NAV_GROUPS` was **rejected**: it would give the surface a `?tab=`, a drawer row
and a search-index entry, and `appNav.js` is the only app→section→tab matrix (Wagers is the documented
precedent for a surface that is deliberately not a nav item). The two Settings cards follow the
verified five-step recipe (one `AccordionSection` inside the single `AccordionGroup`, plus a
`navSearchIndex` destination with `section: true` and a `hash`, which is what makes them both
searchable and deep-linkable through `accordionSectionForHash`).

## R11 — The legal documents must be amended, not appended to

`frontend/src/legal/` holds exactly three documents, imported `?raw`, and **the document's version is
its SHA-256** — `frontend/src/utils/legalDocs.js` freezes the canonicalisation in five steps with the
comment "changing any step changes every hash — never modify it". `material: true` is set for all
three and is the *operator's* re-consent flag, deliberately distinct from hash inequality.

Existing AI coverage is exactly two clauses, both about **platform-side** AI:
`risk-disclosure.md:92` (`## 13. Automation and AI-Agent Risk`) and `terms.md:80`
(`**4.6 Automated and AI components.**`). `privacy-policy.md` contains **no** AI, model, inference,
prompt or AI-processor language at all: its `## 2. What We Process` enumerates four categories and
closes with "We do **not** collect names, government IDs, emails, or payment-card data through the
Service", and `## 5. Sharing` permits only infrastructure providers, on-chain sanctions sources, and
legal requirement.

**Decision**: extend §13 and §4.6 (member-facing AI + API keys as credentials), and amend Privacy §2
with an explicit **opt-in** processing category (assistant conversation content, sent only while the
member has enabled the assistant; memory stays on the device and is member-clearable) plus API access
grants (public address, key id, scopes, validity, revocation records), and §5 with the model provider
as a processor for that content. The "we do not collect" sentence stays true as written. No fourth
document, no `LEGAL_LINKS` change — that constant is iterated by both `Footer.test.jsx` and
`WalletPage.test.jsx`, so an entry there automatically adds assertions, and it is not needed.

`docs/reference/api.md:1-4` says verbatim "there is no HTTP API and no backend". Shipping this feature
without correcting that sentence would leave a documented falsehood in the site's Reference section.

## R12 — Infrastructure: one stateless, secretless Cloud Run service

`infra/terraform/environments/prod/main.tf:235-253` (`module "spa"`) is the canonical Cloud Run
declaration; all eight module blocks in the tree share one pin,
`?ref=70498e2a2860f2e65cd2ce3919ca85d29678a1e3`, and `cloud-run-service` is **byte-identical between
that pin and modules-repo HEAD**, so no bump is needed (and a bump would touch every other block's
plan). The module already exposes every input required (`name`, `image`, scaling, `cpu`, `memory`,
`cpu_idle`, `allow_unauthenticated`, `env`, `secret_env`).

**Decision**: `module "mcp_server"` after `module "spa"` at the existing pin, name
`fairwins-mcp-server` (the `^fairwins[-_]` convention the guardrail's allow-list encodes), min 0 /
max 4, `cpu_idle = true`, `allow_unauthenticated = true`, and `env` carrying only the API base URL.

**No service account, no `secret_env`, no secret containers**: the service holds nothing. The member's
own token arrives per request. Avoiding a runtime service account also avoids widening
`fairwins-tf-apply@`'s `actAs` grant, which is enumerated to the two node SAs and is a deliberate
security boundary, not a config tweak.

**Single container on purpose**: the shared module's `ignore_changes` indexes
`template[0].containers[0].image`, and its README records that the list is "correct for a
single-container service and fragile for a multi-container one".

`imports.tf` gets a **comment only** — imports exist for adoption, and this service is new, so there
is nothing to import. Gates to re-run: `npm run check:iac` and `npm run test:iac-guardrails` (both
dependency-free Node; no Terraform binary needed). Note the guardrail scanner only inspects `resource`
blocks, so a module input is not judged by it — correctness of the name and the absence of secrets is
on the author here, not on the gate.

## R13 — End-to-end tier and the harness's one hard limitation

The admission rules (`docs/developer-guide/e2e-testing-policy.md:20-35`) put **all** of this
feature's member flows in the **no-chain tier**: nothing here signs a transaction that costs money.
The fast tier's dev server points `VITE_RELAYER_URL` at a dead port on purpose
(`frontend/package.json:11-12`), so a spec either intercepts `**/v1/member/**` itself with bodies
matching the producer, or asserts the honest unreachable state (alert present **and** list absent).

**One harness gap must be closed by this feature**: the web3 mock implements `personal_sign` as
`account.slice(2).repeat(4).slice(0,130)` — a deterministic non-signature that will not verify
(`frontend/cypress/support/commands.js:187-195`) — and implements **no** `eth_signTypedData_v4` at
all. The specs therefore extend the mock with a deterministic typed-data method alongside
`personal_sign`, and assert the *client-side* flow (one signature requested, token shown once, no
clear secret persisted via `cy.assertNoClearSecret`) against an intercepted gateway, rather than
pretending the mock's bytes verify.

A new `specs/095-*` directory **fails CI** until `frontend/cypress/coverage/matrix.json` has a row
(`frontend/src/test/e2e-policy/coverageMatrix.test.js` does set equality against `specs/`), and
`docs/developer-guide/e2e-coverage-matrix.md` is generated from it and diff-gated — never hand-edited.

## R14 — Enumerations a third mini-app package must join

Four hardcoded lists are the only ones not derived from disk, and a package missing from them is
invisible to the on-chain byte gate:

| File | What must change |
|---|---|
| root `package.json` → `build:miniapps` | add `@fairwins/miniapp-api-access` |
| root `package.json` → `publish:local:miniapps` | add `--app api-access` |
| `scripts/miniapps/record-build-digests.js:31` | `APPS = ["token-mint","clearpath"]` → add `api-access` |
| `specs/075-monorepo-workspaces/baseline-miniapp-builds.json` | re-record after a real build |

`packageBoundary.test.js`, `check-miniapp-versions.js` and `check-dependency-hygiene.js` all derive
their app list from disk and need no edit. The root `workspaces` glob `frontend/miniapps/*` already
covers the directory — but the install must be refreshed with `npm run deps:reinstall`, never
`npm install`.
