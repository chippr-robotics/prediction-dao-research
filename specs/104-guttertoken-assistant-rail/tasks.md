# Tasks: GutterToken assistant rail and client-side tools

**Input**: `spec.md`, `plan.md`, `docs/research/guttertoken-assistant-integration.md`

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Shared contract, gateway, MCP (WP-A)

- [x] T001 [P] [US3] Create `packages/assistant-contract` (`package.json`, exports `.`/`./prompt`/`./tools`/`./results`), declare in `frontend` + `services/relay-gateway`, add the four lockfile entries.
- [ ] T002 [US3] `src/prompt.js`: `buildSystemPrompt({ rail, hasMemberTools })` (no `surface`), `surfaceNote()`, tool/injection rules.
- [ ] T003 [US3] `src/tools.js`: `TOOL_DEFS` (8 read tools, sorted), `selectTools`, `toolsForMessages`, caps.
- [ ] T004 [US3] `src/results.js`: honest result helpers (`failedResultText`, `truncateResultText`, `toolResultBlock`).
- [ ] T005 [US3] Gateway `assistant.js`: consume the package, content-block validation, server-attached tools filtered by scopes, reject client `tools`, surface as trailing block, `tool_use` stop reason, `ASSISTANT_MAX_ROUNDS` (+ boot ceiling, `/status`).
- [ ] T006 [US3] OpenAPI `x-fairwins-tools`; tests `assistantContract.test.js`, `mcpToolParity.test.js`, memberApi assistant tests.
- [ ] T007 [US3] MCP server: `toolDefs.snapshot.json`, tools.js reads names/schemas from it, `build_intent` MCP-only, tests green.

## Phase 1: Frontend library (WP-B)

- [ ] T010 [P] [US2] `assistantPrefs.js` `provider` field + accessors.
- [ ] T011 [P] [US1] `guttertokenKeyStore.js` (wallet-scoped, redaction, format validation, `testGutterTokenKey`, subscribe) + syncedObjects absence test.
- [ ] T012 [P] [US1] `providers/guttertoken.js` (`sendGutterTokenTurn`, status → state mapping, constants).
- [ ] T013 [US1][US2] `resolveProvider.js` matrix.
- [ ] T014 [US3] `tools/executor.js` (route/public/local `find_in_app`) + `tools/toolLoop.js` (parallel results, rounds cap, events).
- [ ] T015 [US3] `conversation.js` `runAssistantTurn` for both rails; `assistantClient.js` block content + `sessionToken`.
- [ ] T016 Vitest coverage for T010–T015.

## Phase 1: Frontend UI (WP-C)

- [ ] T020 [US4] `appNav.js` Tools item `assistant`; `NAV_FEATURE_IDS`; `navSearchIndex` entries + keywords; WalletPage tab + Settings hash redirects; remove the two cards from Settings.
- [ ] T021 [US1][US2] `AssistantToolsPanel.jsx` (chooser with 3-state reasons, key card, API access, disclosure).
- [ ] T022 [US1] `GutterTokenKeySheet.jsx` (refuse on 401, save on unreachable, redaction).
- [ ] T023 [US1][US2][US3] `AssistantPanel.jsx` (badge, chooser step, optional grant offer → new thread, tool progress + sources, new error states, text-only memory).
- [ ] T024 [US1] `AssistantLauncher.jsx` gate via `resolveProvider`, membership read only when needed.
- [ ] T025 Component tests + axe light/dark.

## Phase 1: Legal, FinOps, tenant, docs (WP-D)

- [ ] T030 Privacy Policy §2/§5, Terms, Risk Disclosure amendments.
- [ ] T031 `referral-guttertoken` catalogue entry; `check:finops` + gate green.
- [ ] T032 Tenant feature `assistant-byok`, optional referral-code field, validator; `tenants:validate`.
- [ ] T033 Developer/user docs, configuration reference, CLAUDE.md bullet.

## Phase 2: E2E + screenshots

- [ ] T040 [US1][US2][US3][US4] Cypress no-chain specs (both viewport profiles) + `matrix.json` rows + regenerated `e2e-coverage-matrix.md`; update `38-assistant.cy.js` for the moved surface.
- [ ] T041 `scripts/ui/capture-assistant-rail.mjs` + actor-critic rounds; `screenshots/README.md`.

## Phase 3: Gates and delivery

- [ ] T050 `check:deps`, frontend lint, scoped Vitest, gateway + MCP tests, `check:finops`, `tenants:validate`, `e2e:matrix` diff.
- [ ] T051 Commit, push, update PR #1435.
