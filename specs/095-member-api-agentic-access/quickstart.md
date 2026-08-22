# Quickstart: validating the Member API, MCP server & assistant (095)

## Prerequisites

- `npm run deps:reinstall` has been run at least once on this checkout (never a bare `npm install` —
  see the `monorepo-workspace` skill; an incremental install silently drops a platform binary and
  breaks every Vite build).
- A browser wallet able to present an account with an **active paid membership** on the build's
  membership reference chain, plus one without, plus (ideally) one smart-contract account for the
  ERC-1271 path.
- Node ≥ 20 for the MCP server (no install step — it has no dependencies).

## Scoped test runs (local — never run the full unfiltered vitest suite locally)

```bash
# Gateway module: the whole refusal matrix, the actor-forcing invariant, disabled/killed codes,
# and that the mounted route set equals the documented one
npm test --workspace fairwins-relay-gateway -- test/memberApiAuth.test.js test/memberApi.test.js

# The off-chain EIP-712 tables must not have entered the contract-verified set
npx hardhat test test/intent/TypehashParity.test.js
npm test --workspace fairwins-relay-gateway -- test/actionCoverage.test.js

# MCP server (no runner dependency)
node --test services/mcp-server/test

# Frontend: grant encoding, the three-state gate, memory bounds, backup absence, axe
npx vitest run frontend/src/test/apiAccess/ frontend/src/test/assistant/

# Gates that must stay green
npx vitest run frontend/src/test/brand/ \
               frontend/src/test/miniapps/packageBoundary.test.js \
               frontend/src/test/nav/navSearchIndex.test.jsx \
               frontend/src/test/e2e-policy/

# Infrastructure guardrails (dependency-free node; no terraform binary needed)
npm run check:iac && npm run test:iac-guardrails
```

## Bringing the module up locally

```bash
# services/relay-gateway/.env — the module is OFF by default, on purpose
MEMBER_API_ENABLED=true
MEMBER_API_MAX_TTL_DAYS=90
MEMBER_API_SUBGRAPH_137=https://…            # omit a chain to see `not-configured` honestly

# the assistant is a separate switch; leave it off for steps 1-6
ASSISTANT_ENABLED=false

npm run dev --workspace fairwins-relay-gateway
npm run frontend
```

Sanity check before anything else — the module must announce itself on the public status surface:

```bash
curl -s localhost:8788/status | jq .memberApi
# { "enabled": true, "killSwitch": false, "assistant": { "configured": false } }
```

## Manual validation

### 1. Create a key (US1 / SC-001)

Connect a **paid** member, open `/wallet?tab=settings#api-access`. Name a key, tick `read:profile`
and `read:wagers`, pick 30 days, create.

Expect: **exactly one** wallet prompt; the token displayed **once** with a copy control and a plain
statement that it will not be shown again; the key then listed by label/id/scopes/expiry.

Then, in devtools: sweep `localStorage` and `sessionStorage` for the token string — it must appear in
**no** key, and not in the DOM. Only the metadata record under `fw_user_<addr>_api_access_keys` should
exist, and it must contain no signature and no token.

Repeat with a **non-paid** account: expect an upgrade route, never a disabled control. Repeat while
the membership read is still in flight: expect a "checking your membership" state, never a denial.

### 2. Use the key (US1 / SC-002, SC-003)

```bash
TOKEN=fw1.…
BASE=http://localhost:8788

curl -s $BASE/v1/member/me            -H "Authorization: Bearer $TOKEN" | jq
curl -s $BASE/v1/member/wagers        -H "Authorization: Bearer $TOKEN" | jq .chains
curl -s $BASE/v1/member/fees          -H "Authorization: Bearer $TOKEN" | jq
curl -s $BASE/v1/member/openapi.json  | jq '.paths | keys'      # no token needed
```

Expect `/me` to echo the grant's own claims plus a live `membership` block and
`revocation: { revoked: false, durable: false }`.

Expect `/wagers` to carry a **per-chain** state. Point one `MEMBER_API_SUBGRAPH_<id>` at an
unreachable host and confirm that chain reports `unreadable` — **not** `wagers: []`. Unset another and
confirm `not-configured`. The two are different facts and must render differently.

Now walk the refusal matrix and confirm each code is distinct:

| Try | Expect |
|---|---|
| `Authorization: Bearer nonsense` | `401 invalid_token` |
| a grant whose `expiresAt` is in the past | `401 token_expired` |
| a grant spanning 365 days | `401 token_ttl_exceeded` |
| a token with only `read:profile` against `/v1/member/fees` | `403 insufficient_scope` |
| a token for a non-paid account | `403 membership_required` |
| the membership RPC blackholed (devtools/hosts) | **`503 membership_unreadable`**, not a 403 |
| repeat a read past the quota | `429` with a `Retry-After` header |
| `MEMBER_API_KILLSWITCH=true`, restart | `503 member_api_killed` |
| `MEMBER_API_ENABLED=false`, restart | `503 member_api_unconfigured` — a 503 with a code, never a 404 |

Every error body must be exactly `{ "error": { "code": …, "reason": … } }`.

### 3. Contract accounts (SC-003)

With a smart-account signer, create a key and call `/me`. Expect success via the ERC-1271 leg. Then
blackhole the reference-chain RPC and call again: expect **`503 auth_unverifiable`**, never
`401 invalid_signature`. A smart-account signature and a forgery are indistinguishable without that
read, and reporting one as the other is the failure this step exists to catch.

### 4. Build an intent, and confirm the actor cannot be spoofed (SC-002)

```bash
curl -s $BASE/v1/member/intents/build -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"createWager","chainId":137,"params":{"creator":"0xdead…beef", … }}' | jq
```

Expect a `typedData` block whose actor field equals **the token's account**, not the address supplied
in `params`. Expect `submitVia` to name both the relay path and the self-submit alternative.

Then confirm the documented refusals: `action: "invalidateNonce"` → `400 unsupported_action` with a
stated reason; a `poolJoin` request → the EIP-3009 authorisation shape, **not** a synthesised struct;
an action whose target is not pinned on this deployment → `400 unsupported_action` naming it.

### 5. Revoke, honestly (US1 / SC-003)

Revoke the key from the Settings card. Expect one signature, then a message that states **both** that
the revocation is registered on the live service and when the grant expires on its own. Call `/me`
again: `401 token_revoked`.

Restart the gateway and call `/me` once more: it works again — which is exactly what
`durable: false` said. Confirm the card's copy already told the member that, before they needed to
know.

### 6. The console (US5 / SC-007)

Open the **API Access** app from the Apps catalog. Enter the base URL; the endpoint list renders from
the fetched OpenAPI document with each operation's summary and required scope. Paste the token and
introspect it; try a GET.

Then point it at an unreachable host: expect a stated failure **and no endpoint list**. "Nothing here"
and "we could not ask" must not be the same screen.

Reload the app: the base URL persists, the token is **gone** (it was never persisted). Use the
key-creation explainer and confirm it navigates to `/wallet?tab=settings#api-access` and says that
signing lives in the app.

### 7. The assistant, off (US3 / SC-005)

With `ASSISTANT_ENABLED=false` and the member preference at its shipped default (**off**): confirm no
launcher renders anywhere in the app, and that the network tab shows **zero** assistant requests.
This is the default state and it is the one most worth re-checking after any refactor.

### 8. The assistant, on (US3 / US4 / SC-006)

Set `ASSISTANT_ENABLED=true` and `ANTHROPIC_API_KEY=…`, restart, and enable the preference at
`/wallet?tab=settings#assistant-prefs`. Read the card: it must disclose what leaves the device, link
to the Privacy Policy, and its summary line must state the **actual** state.

- The launcher appears on in-app routes, sits **above** the bottom navigation on `/app` without
  covering it, and re-positions on `?tab=settings` where that navigation is absent.
- Open the drawer: the launcher recedes. Scroll down a long screen: it recedes and returns.
- With `prefers-reduced-motion: reduce` (devtools → Rendering): transitions are opacity only.
- First open after opting in asks the member to authorise a session — one signature, 24 h, kept in
  memory. Reload the page and confirm it asks again (it was never persisted).
- Exchange messages; confirm the reply carries the AI-generated / never-signs notice and that any
  suggested destination is a working in-app link.
- Stop the gateway and send another message: expect a stated failure with a retry, and **never** an
  invented reply. Set `ASSISTANT_ENABLED=false` and confirm the distinct "not configured" copy.
- Memory: confirm the entry count rises, clear it, confirm it returns to zero with no residue under
  `fw_user_<addr>_assistant_memory_v1`. Take a backup and confirm the memory and the preference are
  **absent** from the bundle.
- Switch accounts: confirm the session authorisation is gone and the memory is the new account's.

### 9. The MCP server (US2 / SC-004)

```bash
FAIRWINS_API_URL=http://localhost:8788 FAIRWINS_API_TOKEN=$TOKEN \
  node services/mcp-server/src/server.js
```

Then feed it, one JSON object per line:

```jsonc
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_membership","arguments":{}}}
{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"fairwins://guide"}}
```

Expect: `serverInfo.name === "fairwins-mcp"`; eight tools listed with JSON schemas; real membership
data; the embedded guide. Confirm **nothing but protocol JSON** reaches stdout.

Now the honesty cases: unset `FAIRWINS_API_URL` and call a tool — expect `isError: true` saying the
server is not configured, **not** an empty result. Use a revoked token — expect an error naming
revocation. Blackhole the membership RPC — expect an error that says the check failed and is
retryable, never "you have no membership".

HTTP mode:

```bash
node services/mcp-server/src/server.js --http 8790
curl -s localhost:8790/healthz
curl -s localhost:8790/mcp -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_profile","arguments":{}}}'
```

Confirm the per-request header wins over the process env, and that a request with no token anywhere
gets the honest not-configured answer rather than a plausible empty one.

### 10. Documentation and policy (SC-009)

- `docs/reference/api.md` no longer says the platform has no HTTP API.
- The three developer-guide pages and the runbook exist and are reachable from the mkdocs nav; the
  runbook is listed in `docs/runbooks/README.md`.
- `/privacy` names assistant conversations as an **opt-in** processing category and the model provider
  as a processor for them, names API access grants, and its "we do not collect…" sentence is still
  true.
- `/risk` §13 and `/terms` §4.6 cover member-facing AI and API keys as credentials.
- The legal link set is unchanged — there is no fourth document.

## End-to-end pointers

The member flows are **no-chain tier** (`frontend/cypress/e2e/fast/`): nothing here signs a
transaction that costs money. The fast tier's dev server points at a dead gateway on purpose, so each
spec either intercepts `**/v1/member/**` with bodies matching the producer, or asserts the honest
unreachable state.

```bash
npm run test:e2e:fast --workspace frontend        # both viewport legs run in CI
npx vitest run frontend/src/test/e2e-policy/      # matrix + assertion-depth gates
```

Flows covered: `assistant.opt-in`, `assistant.honest-unreachable`, `assistant.memory-clear`,
`api-access.create-key`, `api-access.revoke-key`, `api-access.console`.

Note the harness limit: the web3 mock's `personal_sign` is a deterministic non-signature and there was
no `eth_signTypedData_v4` at all before this feature added one. The specs therefore assert the
client-side flow (one prompt, shown once, `cy.assertNoClearSecret`) against an intercepted gateway —
they do not pretend the mock's bytes verify.

## Screenshot validation

Use the `actor-critic-screens` skill across both themes and both viewports for: the API access card
(empty, one key, token-shown-once, revoked), the assistant preferences card (off and on), the launcher
tethered above the bottom navigation and on a screen without one, and the assistant panel (thread,
unreachable, not-configured). Land the shots and a findings README under
`specs/095-member-api-agentic-access/screenshots/`. A state the harness cannot fabricate honestly is
documented as not photographed — never posed.

## What "done" looks like

- SC-001…SC-010 checked off against the steps above.
- With the module disabled, key creation still works and every dependent surface degrades honestly —
  no capability that existed before this feature is weaker after it.
- CI green: full vitest suite, gateway suite, brand and boundary gates, e2e-policy gates, both Cypress
  fast legs, `check:iac`.
