# Tasks: Member API — Private Keys, MCP Server & Agentic Assistant

**Input**: Design documents from `/specs/095-member-api-agentic-access/`
**Prerequisites**: plan.md, research.md, contracts/member-api.md, contracts/api-key-grant.md,
contracts/mcp-server.md, quickstart.md

**Tests**: included — constitution principle II (test-first) is non-negotiable in this repo.
All paths are relative to the repository root. Local vitest runs must stay scoped (never a bare
`vitest run`). Never recover an install with `npm install` — use `npm run deps:reinstall`.

## Phase 1: Setup

- [X] T001 Verify baseline on the branch before any change: `npm test --workspace fairwins-relay-gateway`, `npx vitest run frontend/src/test/brand/ frontend/src/test/e2e-policy/`, `npm run check:iac` (record any pre-existing failures in the PR notes)
- [X] T002 Create the spec directory artifacts (`spec.md`, `plan.md`, `research.md`, `contracts/*.md`, `quickstart.md`, `checklists/requirements.md`) — the wire contracts are prerequisites for the gateway and MCP work, not documentation written afterwards

## Phase 2: Foundational (blocking prerequisites for all user stories)

- [X] T003 [P] Add `packages/intent-types/src/offchain.js`: `MEMBER_API_DOMAIN`, `MEMBER_API_GRANT_TYPES`, `MEMBER_API_REVOCATION_TYPES` and the shared `canonicalScopeString`, with the header comment stating these are **off-chain** (no Solidity verifier, deliberately no `chainId`/`verifyingContract`) and must never enter `CONTRACT_VERIFIED_TYPES` / `CONTRACT_DOMAINS`
- [X] T004 [P] Add the `./offchain` entry to `packages/intent-types/package.json` `exports`, re-export the four names from `src/index.js` so both trees keep one import specifier, and record in the package's own notes why this file sits outside both parity gates — a **separate file**, so "a claim about a contract" and "a claim about a server" can never be confused
- [X] T005 Confirm the parity gates still hold with the new tables present: `npx hardhat test test/intent/TypehashParity.test.js` and `npm test --workspace fairwins-relay-gateway -- test/actionCoverage.test.js` — if either flags the off-chain structs, the file placement is wrong, not the gate
- [X] T006 Add the `memberApi` config block to `services/relay-gateway/src/config/index.js` per contracts/member-api.md §14: `enabled`, `killSwitch`, `maxTtlDays`, `referenceChainId`, `membershipCacheTtlMs`, `clockSkewSec`, `revocationMaxEntries`, account-keyed quotas, the `MEMBER_API_SUBGRAPH_<chainId>` map, `timeoutMs`, plus the nested `assistant` sub-block; **all boot-fail validation inside `if (enabled)`**, and a missing `ANTHROPIC_API_KEY` deliberately **not** a boot failure (optional credential, fails closed at the route); document every var in the file header comment
- [X] T007 [P] Document the same vars in `services/relay-gateway/.env.example` beside the existing module blocks, with the model credential marked as an optional secret
- [X] T008a Create `services/relay-gateway/src/memberApi/contract.js`: the ONE declaration of `ROUTES`, `SCOPES`, the token prefix and the error codes, so `routes.js` mounts from it and `openapi.js` documents from it — a published document describing an endpoint the server does not serve fails at a member's request rather than at review
- [X] T008b Create `services/relay-gateway/src/memberApi/auth.js`'s token layer: `parseToken` (shape, `v`, address form, `keyId` length, scope vocabulary, `expiresAt > issuedAt`), `grantMessage` (the struct, with the scope string **re-derived from the array**, never trusted from the wire), and `verifyTypedSignature` returning a three-way `verified | invalid | unverifiable` from the ECDSA and ERC-1271 legs
- [X] T009 Create `services/relay-gateway/src/memberApi/revocation.js`: an in-process, bounded `(account, keyId)` register whose entries age out with the lifetime cap, and a single durability constant every response reads so no route can claim otherwise
- [X] T010 Create `services/relay-gateway/src/memberApi/membership.js`: reference-chain tier read (resolved once at boot, defaulting to the first enabled chain with a recorded `membershipManager`), three-state result, ~60 s cache that caches **only** `read` results — an unreadable membership is re-attempted, never pinned
- [X] T011 Complete `services/relay-gateway/src/memberApi/auth.js` with `createMemberAuth` — the bearer middleware implementing contracts/api-key-grant.md §6 in order — parse → expiry → TTL cap → recover → 1271 → revocation → membership → sanctions (reuse `policy/sanctions.js`, fail closed) → scope → quota; every failure a distinct `GatewayError` code; **`auth_unverifiable` and `membership_unreadable` are 503, never 401/403**
- [X] T012 Create `services/relay-gateway/src/memberApi/routes.js`: `createMemberApiRouter(config, deps)` with the `requireLive`/`quotaKey`/`guard`/`handleError` quartet copied from `perps/routes.js`, paths mounted from `contract.js` (never a second list), module killswitch checked **before** the global one, plus `memberApiStatus()` and `declaredPaths()` exports, and the contract doc cited in the module docstring
- [X] T013 Mount the router unconditionally in `services/relay-gateway/src/server.js` beside the other modules, construct its quota instances with `createQuotas({…, now: nowMs})`, and splice `memberApiStatus(config, {killSwitch})` into the `/status` body
- [X] T014 Add `Authorization` to `Access-Control-Allow-Headers` in `services/relay-gateway/src/server.js` with a comment stating why (a browser bearer token otherwise fails preflight silently) and what is deliberately unchanged: no credentials mode, no cookies, origin allow-list and `X-Origin-Auth` edge lock untouched
- [X] T015 Create `services/relay-gateway/test/memberApiHelpers.js` (real grants signed with the package's own tables — the off-chain structs have no typehash gate, so *this* is the gate: sign with the shared table and assert the gateway accepts it) and `test/memberApiAuth.test.js` + `test/memberApi.test.js` covering the full refusal matrix (`invalid_token`, `token_expired`, `token_ttl_exceeded`, `invalid_signature`, `auth_unverifiable`, `token_revoked`, `membership_required`, `membership_unreadable`, `sanctioned_signer`, `screening_unavailable`, `insufficient_scope`, `quota_exceeded` + `Retry-After`, `member_api_killed`, `member_api_unconfigured`, `origin_denied`), the exact nested error body, and that a disabled module never throws at boot

**Checkpoint**: the credential rail exists and is proven to refuse correctly; every user story can start.

## Phase 3: User Story 1 — A member creates a private API key (P1) 🎯 MVP

**Goal**: a paid member can mint, inspect and revoke a capability token from Settings, with the token
shown once and never persisted.

**Independent test**: quickstart.md §Manual validation steps 1, 2 and 5.

- [X] T016 [P] [US1] Create `frontend/src/lib/apiAccess/apiKeys.js`: grant construction (types imported from `@fairwins/intent-types/offchain` — never a local table), `keyId` from `crypto.getRandomValues`, canonical scope string shared with the gateway's rule, token encode/decode, and the metadata store over `userStorage` key `api_access_keys` (`useLocalStorage = true`, wallet-scoped, **metadata only**)
- [X] T017 [P] [US1] Add `frontend/src/test/apiAccess/apiKeys.test.js`: canonical scope ordering, round-trip encode/decode, that the stored record contains no token and no signature, and that a decoded grant with an unknown scope is refused
- [X] T018 [US1] Implement `GET /v1/member/me` and `GET /v1/member/keys/status` in the gateway module per contracts/member-api.md §5/§7 — `revocation.durable` is a constant `false`
- [X] T019 [US1] Implement `POST /v1/member/keys/revoke`: self-authorising (verifies the revocation signature; **no bearer token required or accepted as a substitute**), bounded `revokedAt`, response carrying `durable: false` and its reason
- [X] T020 [US1] Implement `GET /v1/member/membership` (three-state, reference chain only) and `GET /v1/member/fees` (through the existing FeeRouter reader — **no second fee store, no hardcoded bps**)
- [X] T021 [US1] Implement `GET /v1/member/wagers` in `services/relay-gateway/src/memberApi/wagers.js`: per-chain envelope, `MEMBER_API_SUBGRAPH_<chainId>` unset ⇒ `not-configured`, fetch failure ⇒ `unreadable`, `wagers` present **only** in `state: "read"`
- [X] T022 [US1] Create `frontend/src/components/account/ApiAccessPanel.jsx` + `.css`: one `AccordionSection id="api-access"` — paid-member three-state gate (pending → "checking"; not paid → upgrade route; unreadable → neither), create form (label, scope checkboxes, 7/30/90-day expiry), single `signTypedData` prompt, token shown **once** with copy + "this will not be shown again", key list with revoke, MCP snippet generator, link to the console. Gateway unreachable ⇒ keys still create, with an honest note about what needs the service
- [X] T023 [US1] Render the card inside the single settings `AccordionGroup` in `frontend/src/pages/WalletPage.jsx` (no second group — that would break "one card open at a time")
- [X] T024 [P] [US1] Add the `settings-api-access` destination to `frontend/src/config/navSearchIndex.js` (`navId: 'settings'`, `section: true`, `hash: '#api-access'`, keywords: api, key, token, mcp, agent, programmatic, developer) — this is what makes it both searchable and deep-linkable through `accordionSectionForHash`
- [X] T025 [P] [US1] Capture key created/revoked to the client activity ledger with **metadata only** (keyId, label, scopes — never a token), following the `captureLegacyRecovery` precedent, and add the `access` domain to both `frontend/src/data/notifications/domains.js` (`DOMAIN_META`) and `frontend/src/lib/notifications/deliveryPreferences.js` (`NOTIFICATION_CATEGORIES`) so the new category is delivered rather than silently off
- [X] T026 [US1] Add `frontend/src/test/apiAccess/ApiAccessPanel.test.jsx`: the three membership states, one signature per creation, the token rendered once and absent from storage afterwards, revoke copy naming both the registration and the expiry, and an axe pass

**Checkpoint**: US1 complete — a member can mint, inspect and revoke a working key end to end.

## Phase 4: User Story 2 — An AI agent connects over MCP (P1)

**Goal**: an MCP client with a member token can read, build and be honestly refused.

**Independent test**: quickstart.md §Manual validation step 9.

- [X] T027 [US2] Implement `POST /v1/member/intents/build` in `services/relay-gateway/src/memberApi/intents.js`: types/domains from `@fairwins/intent-types`, targets from the gateway's pinned `targetsByKey`, **actor forced to the token account**, `authOnly` actions returning their true EIP-3009 shape, `invalidateNonce` refused with a stated reason, unpinned targets refused naming the action and chain, `submitVia` always naming the self-submit alternative
- [X] T028 [US2] Extend `services/relay-gateway/test/memberApi.test.js` with the builder invariants: a `params`-supplied actor is overridden by the token account, `poolJoin` returns no synthesised struct, `invalidateNonce` is `400 unsupported_action`, and a pool build returns both the factory target and the clone `verifyingContract`
- [X] T029 [P] [US2] Create `services/relay-gateway/src/memberApi/openapi.js`: the OpenAPI 3.1 document as a JS object interpolating the shared `SCOPES` and error-code constants, every operation carrying `x-fairwins-scope`; serve it at `GET /v1/member/openapi.json` with **no token required** (module must be enabled)
- [X] T030 [P] [US2] Add the gateway test asserting `declaredPaths()` (mounted) equals the document's `paths` and that every operation's `x-fairwins-scope` equals the scope the middleware enforces for it — the property that makes a JS-object OpenAPI worth having
- [X] T031 [P] [US2] Create `services/mcp-server/package.json` — **zero dependencies**, `"type": "module"`, `"test": "node --test"`, engines node ≥ 20 — and do **not** add it to the root `workspaces`
- [X] T032 [US2] Create `services/mcp-server/src/protocol.js`: JSON-RPC 2.0 framing and the dispatch table (`initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`), `-32601`/`-32700`/`-32600` for the rest, and **no response to a notification, ever**
- [X] T033 [US2] Create `services/mcp-server/src/apiClient.js`: bounded `fetch` + `AbortController`, per-request token override, optional `X-Origin-Auth` forwarding, and an error mapper that turns each gateway code into an honest sentence (retryable vs definitive, scope named, revoked vs expired distinguished)
- [X] T034 [P] [US2] Create `services/mcp-server/src/tools.js`: the eight tools of contracts/mcp-server.md §4 with JSON-Schema inputs; failures are `isError: true` content; a per-chain `unreadable` is passed through verbatim and **never** collapsed into "no wagers"; `build_intent`'s description states the server cannot and will not sign
- [X] T035 [P] [US2] Create `services/mcp-server/src/resources.js` (`fairwins://openapi`, `fairwins://status`, `fairwins://guide` — the guide embedded in the server's own bytes so it reads before anything is configured) and `src/prompts.js` (`wager-review`, `portfolio-briefing`)
- [X] T036 [US2] Create `services/mcp-server/src/server.js`: stdio transport by default (**protocol bytes only on stdout**; every log to stderr) and `--http <port>` mode with `POST /mcp` + `GET /healthz`, the request header overriding the env token
- [X] T037 [P] [US2] Create `services/mcp-server/test/*.test.js` (`node:test`): protocol framing incl. the notification rule, tool schemas, the honest not-configured path with no API URL, error mapping per gateway code, and that an unreadable chain survives into the tool output
- [X] T038 [P] [US2] Create `services/mcp-server/Dockerfile` (standalone context, `node:20-alpine`, `USER node`, `EXPOSE 8790`, HTTP `CMD`, `HEALTHCHECK /healthz`) and `README.md` with the stdio and HTTP client snippets
- [X] T039 [US2] Declare the service in Terraform: `module "mcp_server"` in `infra/terraform/environments/prod/main.tf` after `module "spa"` and `module "mcp_server_staging"` in `environments/staging/main.tf`, at the **existing** module pin, single-container, min 0 / max 4, `allow_unauthenticated = true`, `env` carrying only `FAIRWINS_API_URL`, **no service account and no `secret_env`** — with the comment block explaining stateless/secretless/member-token-per-request; add a commented note under the Cloud Run section of `imports.tf` (new service, nothing to adopt)
- [X] T040 [US2] Run `npm run check:iac` and `npm run test:iac-guardrails`; keep the HCL in the file's existing 2-space aligned style (terraform fmt is unavailable in this environment)

**Checkpoint**: US2 complete — an agent can connect, read, build and be refused honestly.

## Phase 5: User Story 3 — The opt-in assistant (P2)

**Goal**: a paid member can turn the assistant on and get help, with every failure stated honestly and
no ability to act.

**Independent test**: quickstart.md §Manual validation steps 7 and 8.

- [X] T041 [US3] Implement `POST /v1/member/assistant/chat` in `services/relay-gateway/src/memberApi/assistant.js`: sub-module config, message bounds (≤20 / ≤4000 → `400 bad_request`), server-side system prompt carrying the safety rules, bounded `fetch` to the model provider, `503 assistant_unconfigured` vs `503 assistant_unavailable`, and **an audit line carrying counts only — never content**
- [X] T042 [P] [US3] Extend the gateway suite: bounds refusals, the two 503 codes distinguished, and an assertion that no audit sink line contains message text
- [X] T043 [P] [US3] Create `frontend/src/lib/assistant/assistantPrefs.js` (wallet-scoped, `useLocalStorage = true`, **enabled defaults to false**) and `frontend/src/lib/assistant/memoryStore.js` (`assistant_memory_v1`, bounded to 50 messages / 64 KB, `clear()`, `count()`)
- [X] T044 [P] [US3] Create `frontend/src/lib/assistant/assistantClient.js`: POSTs to the member API with a **memory-only** session token (short-lived grant, scopes `assistant:chat` + reads, 24 h), cleared on disconnect and account change, reusing the `lib/apiAccess` encoder; never persisted
- [X] T045 [P] [US3] Create `frontend/src/hooks/useBottomNavOffset.js`: a `ResizeObserver` over `.section-icon-nav` returning a live offset, because that nav is absent on Settings/Network/Membership and on any disconnected wallet view, and its height is not a token
- [X] T046 [P] [US3] Add the `chat` glyph to `frontend/src/components/nav/NavIcon.jsx` `ICON_PATHS` (an unknown name renders `null`, so a missing glyph fails silently)
- [X] T047 [US3] Create `frontend/src/components/assistant/AssistantLauncher.jsx` + `.css`: renders **nothing** unless tenant feature + connected wallet + positively-read paid membership + member preference all hold; `position: fixed`, z-index 1300 (above the 1200 nav, below the 1400 drawer backdrop), bottom offset from `useBottomNavOffset` + safe area, recedes on scroll-down and while the drawer or its own panel is open, ≤250 ms transitions, opacity-only under `prefers-reduced-motion`, 36×36 minimum target
- [X] T048 [US3] Create `frontend/src/components/assistant/AssistantPanel.jsx` + `.css`: `ActionSheet`-idiom bottom sheet (backdrop z 1500, safe-area padding, centred card on desktop), `role="dialog"` with an accessible name, replies in a **polite** live region, per-reply "AI-generated — verify before acting. The assistant never signs or submits.", in-app deep links for suggestions, and distinct honest states for unreachable vs `assistant_unconfigured` with a retry — **never a fabricated reply**
- [X] T049 [US3] Mount `<AssistantLauncher/>` in `AppLayout` in `frontend/src/App.jsx` after `<AppNavDrawer/>` — the only seam rendering on every in-app route and no landing page
- [X] T050 [P] [US3] Add the `assistant` feature id to `tenants/features.json`, `tenants/fairwins/manifest.json` and `tenants/example/manifest.json`, honoured by `isFeatureEnabled('assistant')` in the launcher; run `npm run tenants:validate`
- [X] T051 [US3] Add `frontend/src/test/assistant/AssistantLauncher.test.jsx` and `AssistantPanel.test.jsx`: renders nothing in each of the four gate-off cases, tethering when the nav is present and absent, the honest failure states, the reply notice, a polite (never assertive) live region, and an axe pass on the open panel

**Checkpoint**: US3 complete — the assistant helps, and cannot act.

## Phase 6: User Story 4 — Memory and privacy controls (P2)

**Goal**: the member can see and control exactly what happens, and the default is that nothing happens.

**Independent test**: quickstart.md §Manual validation step 8 (memory and backup assertions).

- [X] T052 [US4] Create `frontend/src/components/account/AssistantPreferencesPanel.jsx` + `.css`: one `AccordionSection id="assistant-prefs"` — master enable (**default off**), memory-retention toggle, "clear conversation memory" showing the entry count, plain-language disclosure of what leaves the device when enabled (and that nothing is sent while off) with a link to `/privacy`, and a summary line stating the **actual** state ("Off — nothing is sent")
- [X] T053 [US4] Render it in the settings `AccordionGroup` in `frontend/src/pages/WalletPage.jsx` and add the `settings-assistant` destination to `frontend/src/config/navSearchIndex.js` (`#assistant-prefs`; keywords: ai, assistant, chat, agent, memory, privacy)
- [X] T054 [P] [US4] Capture assistant enabled/disabled to the client activity ledger under the `access` domain (metadata only)
- [X] T055 [P] [US4] Add `frontend/src/test/assistant/assistantPrefs.test.js` and `memoryStore.test.js`: default off, bounds enforced, `clear()` leaves no residue, memory is account-scoped, and **both keys are absent from `frontend/src/lib/backup/syncedObjects.js`** (asserted the way the nav-preference absence already is)

**Checkpoint**: US4 complete — the opt-in is meaningful and reversible.

## Phase 7: User Story 5 — The developer console mini-app (P3)

**Goal**: a member or their developer can explore the API and generate MCP configuration.

**Independent test**: quickstart.md §Manual validation step 6.

- [X] T056 [P] [US5] Create the package skeleton `frontend/miniapps/api-access/{package.json,vite.config.js}`: name **`@fairwins/miniapp-api-access`** (the boundary gate derives the expected name from the directory), `appId: 'api-access'`, listing name "API Access" (folds to the id — `appSlug` identity is load-bearing), version read from `package.json`, `permissions: ['store','toast','navigate']`, `storeKeys: ['console']`, `contracts: []`
- [X] T057 [US5] Create `frontend/miniapps/api-access/src/entry.jsx` and the console views: base-URL input (persisted in `store`), pasted token held in **component memory only** (never `store` — it holds app state, never secrets), OpenAPI explorer (tag / path / summary / required scope), token introspection, try-it for GET operations, MCP snippet generator, and a key-creation explainer that deep-links `host.navigate('/wallet?tab=settings#api-access')` and states that signing lives in the app
- [X] T058 [US5] Render three states for every fetch (loading / unreachable / data); an unreachable source renders **no list** — "nothing here" and "we could not ask" must not be the same screen
- [X] T059 [P] [US5] Add `frontend/miniapps/api-access/src/style.css` (single stylesheet — the preset forces `cssCodeSplit: false`) and `src/__tests__/_host.jsx` copied from token-mint with `DECLARED` adjusted, plus tests for the three-state rendering and the token never reaching `store`
- [X] T060 [US5] **Integration-owned root edits** (report, do not make them from a package-scoped change): add the package to `build:miniapps` and `publish:local:miniapps` in the root `package.json`, add `"api-access"` to `APPS` in `scripts/miniapps/record-build-digests.js`, and re-record `specs/075-monorepo-workspaces/baseline-miniapp-builds.json` after a real build — a package missing from these four is invisible to the on-chain byte gate

**Checkpoint**: US5 complete — the console explains and explores, and still cannot sign.

## Phase 8: Polish & cross-cutting

- [X] T061 [P] Write `docs/developer-guide/member-api.md`, `docs/developer-guide/mcp-server.md` and `docs/developer-guide/agentic-chat.md` in the house style (`# Title (spec 095)`, ASCII architecture block, why-shaped-this-way, an Invariants section)
- [X] T062 [P] Write `docs/runbooks/member-api-operations.md` with the six required sections in imperative voice (Overview / Prerequisites / Step-by-Step / Code Examples / Troubleshooting / References): enabling and disabling, the module killswitch, model-credential rotation, revocation semantics and their limits, and an incident playbook
- [X] T063 [P] Index the new pages: `docs/runbooks/README.md` (Operations group) and `mkdocs.yml` `nav:` (three Developer Guide entries + the runbook)
- [X] T064 **Correct `docs/reference/api.md`** — it asserts "there is no HTTP API and no backend", which this feature falsifies; rewrite the intro to name both the on-chain interface and the member HTTP API, and link the contract
- [X] T065 [P] Document the new environment variables in `docs/reference/configuration.md` (`MEMBER_API_*`, `ASSISTANT_*`, `FAIRWINS_API_URL`/`FAIRWINS_API_TOKEN`)
- [X] T066 [P] Write `docs/user-guide/assistant-and-api.md`: enabling the assistant, creating a key, connecting an MCP client, what leaves the device, how to opt out and clear memory
- [X] T067 Amend `frontend/src/legal/privacy-policy.md` §2 (an explicit **opt-in** category: assistant conversation content sent to the platform and its model provider only while enabled, memory device-local and member-clearable; plus API access grants — address, key id, scopes, validity, revocation records) and §5 (the model provider as a processor for that content, only when enabled). Keep the "we do not collect names, government IDs, emails…" statement true. **Do not touch `legalDocs.js`'s canonicalisation or the registry**
- [X] T068 [P] Extend `frontend/src/legal/risk-disclosure.md` §13 (member-facing AI output may be wrong; verify before signing; the assistant never signs or submits; API keys let third-party agents read your data — guard them like credentials) and `frontend/src/legal/terms.md` §4.6 (member-side AI + token safeguarding, revocation semantics, keys cannot move funds). **No fourth legal document and no `LEGAL_LINKS` change**
- [X] T069 Add the `095-member-api-agentic-access` row to `frontend/cypress/coverage/matrix.json` (`memberFacing: true`) with the six flows — `assistant.opt-in`, `assistant.honest-unreachable`, `assistant.memory-clear`, `api-access.create-key`, `api-access.revoke-key`, `api-access.console` — each with status/tier/depth/risk and `path::TEST-ID` refs; a spec directory with no row fails CI
- [X] T070 Extend the web3 mock in `frontend/cypress/support/commands.js` with a deterministic `eth_signTypedData_v4` alongside `personal_sign`, without changing the existing methods' shapes
- [X] T071 [P] Write the fast-tier specs under `frontend/cypress/e2e/fast/`: `cy.mockWeb3Provider` before `cy.visit`, an RPC-transport membership stub in the `stubRegistry` idiom, glob-relative `**/v1/member/**` intercepts whose bodies match the producer, honest-unreachable assertions (alert present **and** list absent), `cy.assertNoClearSecret` for the token, and `{ delay: 0, log: false }` when typing secrets. No new dependency, no per-spec viewport, scoped `cy.contains`
- [X] T072 Regenerate the coverage doc (`npm run e2e:matrix`) — never hand-edit `docs/developer-guide/e2e-coverage-matrix.md`
- [X] T073 [P] Add the CLAUDE.md guardrail bullet for spec 095: the credential is a member-signed off-chain EIP-712 grant with one source (`@fairwins/intent-types/offchain`); no scope moves value and nothing here signs; `auth_unverifiable`/`membership_unreadable` are retryable 503s, never denials; revocation is in-process and every surface says so; the assistant is opt-in and default-off with device-local memory; the MCP server is dependency-free and outside the workspaces
- [X] T074 Screenshot validation via the `actor-critic-screens` skill: the API access card (four states), the assistant preferences card, the launcher tethered above the bottom nav and on a screen without one, and the assistant panel (thread / unreachable / not-configured) — both themes, both viewports, iterating until the critic passes; land shots + findings README under `specs/095-member-api-agentic-access/screenshots/`
- [X] T075 Full verification per the `monorepo-verify` skill: gateway suite, `node --test services/mcp-server/test`, scoped vitest for every touched suite plus `frontend/src/test/brand/ frontend/src/test/miniapps/packageBoundary.test.js frontend/src/test/e2e-policy/`, both Cypress fast legs, `npm run check:iac`, `npm run tenants:validate`, and confirm no `contracts/` file changed (the bytecode gate is unaffected — state this in the PR)
- [X] T076 Update `specs/095-member-api-agentic-access/spec.md` status → Implemented; check off the quickstart success criteria; open the PR against `staging` with a `feat(...)` title (this adds a member-facing capability and a new EIP-712 domain, so classify deliberately)

## Dependencies

- Phase 2 blocks everything. T003/T004 block T008b and T016; T008a blocks T012 and T029; T008b blocks
  T011; T011 blocks T012; T012 blocks T013/T014; T006 blocks T012 and T041.
- **US1 (Phase 3)** needs Phase 2 only and is the MVP — it is the story that proves the credential
  model. T016 blocks T022; T022 blocks T023/T026.
- **US2 (Phase 4)** needs Phase 2 and the read endpoints from T018/T020/T021; T029 blocks T035
  (`fairwins://openapi` fetches it) and T057 (the console renders it). T031 blocks T032–T038; T038
  blocks T039.
- **US3 (Phase 5)** needs Phase 2 and T016 (the session token reuses the encoder). T045/T046 block
  T047; T047 blocks T049.
- **US4 (Phase 6)** needs T043 (the stores it controls) and slots beside US3.
- **US5 (Phase 7)** needs T029 (the document it explores) and T022 (the destination it links to).
- **Phase 8** needs the surfaces it documents and photographs; T069/T070 block T071; T071 blocks T072.
- Suggested MVP: Phases 1–3 — a member-signed key that reads their own data, with every refusal
  honest. Phase 4 makes it useful to agents; Phases 5–6 add the assistant and its controls; Phase 7 is
  the convenience console; shipping requires through Phase 8.

## Parallel execution examples

- After T006: T007 (env docs), T008a/T008b (surface constants + token layer) and T016 (frontend lib)
  are parallel files in two trees.
- After T015: Phase 3 (T016–T026), Phase 4's MCP files (T031–T038) and Phase 5's libs (T043–T046) are
  three independent tracks in three different trees.
- T061–T066 (docs) run in parallel with T067–T068 (legal) and T075 (verification) once the surfaces
  exist.
- T034/T035 (tools, resources) are parallel; both depend only on T033.
