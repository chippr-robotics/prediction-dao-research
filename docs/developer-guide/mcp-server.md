# MCP Server — dependency-free agent access (spec 095)

`services/mcp-server` is a [Model Context Protocol](https://modelcontextprotocol.io) server that
lets an AI client — Claude Desktop, Claude Code, or anything else speaking MCP — read a member's
FairWins data and prepare unsigned transactions **using the member's own capability token**.

It is a client of the [Member API](member-api.md) and nothing more. It holds no key, mints no
token, and has no privilege the member did not hand it.

## Architecture

```
  MCP client (Claude Desktop / Claude Code / …)
        │  stdio JSON-RPC 2.0            │  POST /mcp  (one JSON-RPC message per request)
        ▼                                ▼  Authorization: Bearer fw1.…  (overrides env)
  ┌───────────────────────────────────────────────────────────────┐
  │  services/mcp-server    node >= 20, ESM, ZERO dependencies     │
  │                                                               │
  │  src/server.js      entry: config, transport selection         │
  │  src/transport/     stdio.js (default) · http.js (--http)      │
  │  src/jsonrpc.js     JSON-RPC 2.0 framing, ids, errors          │
  │  src/mcp.js         initialize · ping · list/call dispatch     │
  │  src/tools.js  ───► fetch(FAIRWINS_API_URL + path,            │
  │                           { Authorization: Bearer <token> })   │
  │  src/api.js         the single HTTP seam + honest failures     │
  │  src/resources.js   fairwins://openapi · ://status · ://guide   │
  │  src/guide.md       the embedded custody-model guide            │
  │  src/prompts.js     wager-review · portfolio-briefing           │
  └───────────────────────────────────────────────────────────────┘
        │
        ▼
  relay gateway   /v1/member/*   (member token required)
                  /v1/polymarket/137/markets · /v1/perps/pairs · /status   (public)
```

## Why it is shaped this way

**Zero dependencies, node built-ins only.** An MCP server is a program a member runs on their own
machine, pointed at their own account, holding a token that reads their data. Every transitive
dependency in it is a supply-chain path into that. The protocol is JSON-RPC over stdio or a small
HTTP POST — Node's `http`, `readline` and global `fetch` cover all of it, so an SDK would buy
convenience at the price of an audit surface nobody wants there. Tests run under `node:test`.

**Not a workspace member.** It is deliberately absent from the root `workspaces` array: it has no
dependencies to hoist and nothing to resolve, so adding it would churn the lockfile for no gain.
Spec 075 makes lockfile churn a real cost in this repo — Dependabot-triggered install breakage is
a recurring incident here, not a hypothetical.

**The server never creates a token.** It reads `FAIRWINS_API_TOKEN` (or the per-request
`Authorization` header in HTTP mode) and forwards it. Key creation requires a wallet signature and
lives in the app, where the member can see what they are signing. A server that could mint its own
credential would be a second, weaker way to get the same authority — and the weaker path is the one
that gets attacked.

**A failed upstream read is reported as unreadable, never fabricated.** Tools answer with
`isError: true` content naming what could not be read. An agent that receives "0 wagers" when the
subgraph was down will state that as fact to the member; an agent that receives "the wager index
for chain 137 could not be read" will not. This is the same rule the API enforces on the wire,
carried one hop further so it survives the model.

**No configuration ⇒ honest tools, not a crash.** With `FAIRWINS_API_URL` unset the server still
starts, lists its tools, and answers each call with an error explaining that it has no API base
URL. An MCP client that cannot enumerate tools shows the member nothing at all.

## Protocol

| Method | Behaviour |
|---|---|
| `initialize` | `protocolVersion` `2025-06-18`; capabilities `tools`, `resources`, `prompts`; `serverInfo.name` `fairwins-mcp`. |
| `notifications/initialized` | Accepted, no response (it is a notification). |
| `ping` | Empty result. |
| `tools/list` · `tools/call` | Below. |
| `resources/list` · `resources/read` | Below. |
| `prompts/list` · `prompts/get` | Below. |

Two transports:

- **stdio** (default) — one JSON-RPC message per line on stdin/stdout. This is what desktop MCP
  clients launch.
- **`--http <port>`** — `POST /mcp` carrying a single JSON-RPC message, plus `GET /healthz`. A
  per-request `Authorization: Bearer` header **overrides** `FAIRWINS_API_TOKEN`, which is what
  makes one hosted instance usable by more than one member without the instance holding anyone's
  credential.

## Tools

Every tool calls the gateway over HTTPS with JSON-schema'd inputs.

| Tool | Calls | Notes |
|---|---|---|
| `get_profile` | `/v1/member/me` | Token introspection: account, scopes, expiry, membership. |
| `get_membership` | `/v1/member/membership` | Three-state tier read. |
| `get_wagers` | `/v1/member/wagers` | Optional `chainId`. Per-chain state preserved verbatim. |
| `get_fees` | `/v1/member/fees` | Live FeeRouter rates. |
| `build_intent` | `/v1/member/intents/build` | Returns typed data. **The description states that this server cannot and will not sign it.** |
| `get_gateway_status` | `/status` | Public. Works with no token. |
| `get_prediction_markets` | `/v1/polymarket/137/markets?q=` | Public. |
| `get_perps_pairs` | `/v1/perps/pairs` | Public. |

`build_intent` is the only tool that touches a write path, and it stops one step short of one.
The typed data goes back to the member, who signs it in their wallet and submits it themselves or
through the public relay endpoint. The tool description says so in words, because the description
is what the model reads before deciding what to claim it did.

## Resources

| URI | Content |
|---|---|
| `fairwins://openapi` | Fetched live from `/v1/member/openapi.json`. |
| `fairwins://status` | Fetched live from `/status`. |
| `fairwins://guide` | Embedded markdown: how keys are created in the app, what the scopes mean, and the custody model — reads, quotes, and relay of member-signed payloads only. |

`fairwins://guide` is embedded rather than fetched so an agent can learn the custody model before
it has a working token, which is precisely the moment it is most likely to guess.

## Prompts

| Prompt | Arguments | Purpose |
|---|---|---|
| `wager-review` | `chainId?` | Walk the member's open wagers and their deadlines, naming any chain that could not be read. |
| `portfolio-briefing` | — | Membership, fees, and wagers in one briefing, with unreadable sources named. |

Both are instruction templates that reference the tools by name. Neither instructs the model to
act — there is nothing here to act with.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `FAIRWINS_API_URL` | to serve | Gateway base URL, e.g. `https://relay.fairwins.app`. Unset ⇒ tools return honest errors. |
| `FAIRWINS_API_TOKEN` | no | The member's own `fw1.…` token. **Secret.** In HTTP mode a request header overrides it. |

Client configuration examples (Claude Desktop / Claude Code JSON) live in
`services/mcp-server/README.md`.

## Deployment

`services/mcp-server/Dockerfile` builds from a standalone context on `node:20-alpine`, runs as
`USER node`, exposes **8790**, starts in HTTP mode, and health-checks `/healthz`. It is declared in
Terraform as a Cloud Run service (`fairwins-mcp-server`, and `-staging`) with **no secret
environment and no dedicated service account** — the service holds nothing, because the
authorisation arrives on each request. Scale-to-zero, single container.

## Invariants

- **No dependencies.** `package.json` has no `dependencies` and no `devDependencies` beyond what
  Node ships. A PR that adds one is a design change, not a convenience.
- **The server never creates, stores, or persists a token.** It reads one from the environment or a
  request header and forwards it.
- **The server never signs.** There is no signing code path and no key material.
- **A failed upstream read is `isError: true` naming the failure** — never an empty list, a zero,
  or a silently omitted field.
- **Public tools work without a token**, and say so, so a member can verify connectivity before
  handing over a credential.
- **The HTTP request header wins over the env token**, so a shared instance never mixes members.

## Tests

`services/mcp-server/test/` under `node:test`, no runner and no dependency:
`jsonrpc.test.js` (framing, ids, error shapes), `mcp.test.js` (handshake and method coverage),
`tools.test.js` (input schemas and upstream failure mapping), `stdio.test.js` and `http.test.js`
(both transports, including header-over-env token precedence).

## Related

- [Member API](member-api.md) — the API this server consumes.
- [Member API Operations](../runbooks/member-api-operations.md) — enabling and incident response.
- [Assistant & API access](../user-guide/assistant-and-api.md) — connecting an MCP client, for members.
- Spec: `specs/095-member-api-agentic-access/`.
