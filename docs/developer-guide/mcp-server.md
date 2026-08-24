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
  credential. A per-request `X-PAYMENT` header rides the same way — see below.

The HTTP transport binds **loopback** and validates **`Origin`**, and refuses one configuration
outright. Each of the three is load-bearing:

- **`--host` defaults to `127.0.0.1`** (`0.0.0.0` in the container image and on Cloud Run, where
  `K_SERVICE` is set and the platform routes in from outside the network namespace). `listen(port)`
  with no host binds every interface, which put a member's tools on the office network the moment
  somebody added `--http` to try something out.
- **A present, non-allow-listed `Origin` is refused with 403 `origin_not_allowed`; an ABSENT one is
  served.** Withholding CORS was never a defence: CORS decides whether a browser lets a page *read*
  a response, not whether the request is sent or executed, and a `text/plain` POST is CORS-safelisted
  — no preflight, straight through. Measured before the check existed: `Origin: https://evil.example`
  with `Content-Type: text/plain` got a 200 and a full tools listing. Loopback origins are always
  served (a rebinding attacker's page keeps *its* origin, so this costs nothing and keeps the MCP
  Inspector working); extra origins come from `--allowed-origin` / `FAIRWINS_MCP_ALLOWED_ORIGINS`,
  and there is no wildcard. `Origin: null` — a sandboxed iframe, a `file://` page — is a *present*
  origin and is refused.
- **`--http` with `FAIRWINS_API_TOKEN` set refuses to boot** unless `--allow-shared-token` is passed.
  The env token is a fallback for requests with no `Authorization` header; over stdio the caller
  population is one by construction, over HTTP it is everything that can open a socket, and the
  fallback promotes all of them to that one member. Both Cloud Run services are
  `allow_unauthenticated = true` and correspondingly set no token.

## Payments: it carries them, it never makes them (spec 096)

The gateway may price an operation and accept a [pay-per-request payment](agentic-payments.md) from a
caller with no member token. This server participates in exactly two ways.

Only three tools can ever be priced — `get_wagers`, `get_fees` and `build_intent`. `get_profile` and
`get_membership` never are (they answer questions about a token and a membership, and a paying caller
has neither), and the public tools are free by construction.

**A `402` is surfaced whole.** The tool result carries the complete `accepts[]` offer — amount, asset,
recipient, CAIP-2 network and the token's own EIP-712 domain — plus the statement that this server
holds no key and cannot pay, worded as a **price rather than an outage**. Flattening the offer (the
default behaviour of any generic HTTP error mapper, which would report `http_402`) would leave an
agent holding a price it cannot read and telling a member that available data is unavailable.

**An inbound `X-PAYMENT` header is forwarded upstream byte-for-byte**, and the gateway's own
`X-PAYMENT-RESPONSE` bytes are returned to whoever paid. The tool result restates the receipt and says
the transaction was **broadcast, not confirmed**.

Three shapes are deliberate:

- **A payment is never a tool argument.** A tool argument is model-authored text, and the one thing a
  model must not be able to author is a transfer authorisation. It travels as a transport header.
- **The payload is forwarded, not re-encoded.** A re-encoded payload is a different signature payload.
- **A supplied payment replaces the bearer for that call.** The paid rail serves the request as the
  *payer*; sending somebody else's token alongside a payment would ask two different questions at
  once, and is the shape in which a member gets charged for something their membership covers.

**stdio cannot carry a payment, and says so** rather than approximating one with an environment
variable: a payload replayable out of configuration would be a standing withdrawal, not a single-use
authorisation. Price discovery needs no token — `get_gateway_status` reports whether the rail is on
and what each class costs.

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
| `FAIRWINS_API_TOKEN` | no | The member's own `fw1.…` token. **Secret.** In HTTP mode a request header overrides it — and `--http` refuses to boot while it is set unless `--allow-shared-token` says the shared identity is intended. |
| `FAIRWINS_MCP_ALLOWED_ORIGINS` | no | Comma-separated browser origins the HTTP transport will serve, in addition to loopback. Same effect as repeating `--allowed-origin`. |

There is deliberately **no variable for a payment**: a payment is single-use and per-request, and one
replayable out of configuration would be a standing withdrawal. It travels as an `X-PAYMENT` request
header, in HTTP mode only.

Client configuration examples (Claude Desktop / Claude Code JSON) live in
`services/mcp-server/README.md`.

## Deployment

`services/mcp-server/Dockerfile` builds from a standalone context on `node:20-alpine`, runs as
`USER node`, exposes **8790**, starts in HTTP mode, and health-checks `/healthz`. It is declared in
Terraform as a Cloud Run service (`fairwins-mcp-server`, and `-staging`) with **no secret
environment and no dedicated service account** — the service holds nothing, because the
authorisation arrives on each request. Scale-to-zero, single container.

**Not deployed yet, and deliberately gated so a merge cannot deploy it.** No pipeline builds or
pushes this image — CI builds it to boot it and never pushes — so both Terraform modules sit behind
`manage_mcp_server`, default **false**. Terraform applies unattended on merge to `main`, and a Cloud
Run create against an absent image would fail and stop the estate's apply. Publishing the image and
flipping the flag is [runbook §3.8](../runbooks/member-api-operations.md). Until then the hosted
mode is unavailable and members run the server locally over **stdio**, which is the configuration
`services/mcp-server/README.md` documents.

## Invariants

- **No dependencies.** `package.json` has no `dependencies` and no `devDependencies` beyond what
  Node ships. A PR that adds one is a design change, not a convenience.
- **The server never creates, stores, or persists a token.** It reads one from the environment or a
  request header and forwards it.
- **The server never signs, and never pays.** There is no signing code path and no key material. It
  forwards a payment somebody else made, unaltered, and returns the receipt to them.
- **A failed upstream read is `isError: true` naming the failure** — never an empty list, a zero,
  or a silently omitted field.
- **Public tools work without a token**, and say so, so a member can verify connectivity before
  handing over a credential.
- **The HTTP request header wins over the env token**, so a shared instance never mixes members.

## Tests

`services/mcp-server/test/` under `node:test`, no runner and no dependency:
`jsonrpc.test.js` (framing, ids, error shapes), `mcp.test.js` (handshake and method coverage),
`tools.test.js` (input schemas and upstream failure mapping), `stdio.test.js` and `http.test.js`
(both transports, including header-over-env token precedence), and `x402.test.js` (offer surfacing,
the non-x402 402 fallback, byte-for-byte payment passthrough, and the receipt round trip).

## Related

- [Member API](member-api.md) — the API this server consumes.
- [Agentic payments](agentic-payments.md) — the pay-per-request rail this server carries payments for.
- [Member API Operations](../runbooks/member-api-operations.md) — enabling and incident response.
- [Assistant & API access](../user-guide/assistant-and-api.md) — connecting an MCP client, for members.
- Spec: `specs/095-member-api-agentic-access/`.
