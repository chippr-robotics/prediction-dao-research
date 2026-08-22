# fairwins-mcp-server (spec 095)

The FairWins member API as a [Model Context Protocol](https://modelcontextprotocol.io) server, so an
AI agent can read a member's FairWins data and prepare actions for them to sign.

It **reads** and it **quotes**. It cannot sign, cannot submit, cannot move funds, and cannot create
a token. There is no configuration that changes any of that: this process holds no key, and the API
it talks to has no write route.

```
MCP client (Claude Desktop, Claude Code, an agent runtime)
   │  JSON-RPC 2.0 over stdio, or POST /mcp
   ▼
fairwins-mcp-server            ← zero dependencies, node built-ins only
   │  HTTPS + Authorization: Bearer <member capability token>
   ▼
FairWins gateway  /v1/member/*  (+ public /status, /v1/polymarket/*, /v1/perps/*)
   │  reads on-chain state, quotes typed data
   ▼
the member signs, in their own wallet, somewhere else entirely
```

## Zero dependencies, and not a workspace member

`package.json` has no `dependencies` and no `devDependencies`, and `services/mcp-server` is
deliberately absent from the root `workspaces` list. It contributes nothing to the root lockfile, so
it cannot be the reason a lockfile resolution breaks a build (spec 075), and a member installing this
on their own machine pulls no third-party code from us. Tests are `node:test`.

```bash
npm test            # node --test test/*.test.js
npm start           # stdio transport
node src/server.js --http 8790
```

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `FAIRWINS_API_URL` | to serve data | Gateway base URL, e.g. `https://relay.fairwins.app`. |
| `FAIRWINS_API_TOKEN` | for member tools | The member's own API token. Public tools work without it. |
| `FAIRWINS_TIMEOUT_MS` | no | Per-request upstream timeout, default `15000`. |
| `PORT` | no | Default port for `--http` when none is given on the command line. |

**Missing configuration is honest, not fatal.** With `FAIRWINS_API_URL` unset the server still boots
and still speaks MCP; every tool answers `api_unconfigured` and says what to set. A server that
exited instead would give the client a spawn failure and the member no explanation.

**Point it at the public gateway hostname, not at an origin behind it.** The platform edge injects
the gateway's origin-lock header in transit; a request that skips the edge is answered `403
origin_denied`, which is a deployment fact about the gateway, not a problem with your token.

## Getting a token

A token is created **by the member, in the FairWins app**: **Settings ▸ API access**. Creating one is
a signature in their own wallet — an off-chain EIP-712 capability grant naming the account, a key id,
the scopes granted and an expiry. Nothing is stored on the platform to issue it, and this server
never creates one.

The token is shown **once**. It is a credential: keep it out of shared configuration, never paste it
into a chat, and prefer short expiries. It can be withdrawn from the same panel at any time.

Scopes: `read:profile`, `read:membership`, `read:wagers`, `read:fees`, `build:intents`. A tool called
without its scope fails with `insufficient_scope` — that is the member declining, not an outage.

## Connecting a client

### stdio (Claude Desktop, Claude Code, most agent runtimes)

```json
{
  "mcpServers": {
    "fairwins": {
      "command": "node",
      "args": ["/absolute/path/to/services/mcp-server/src/server.js"],
      "env": {
        "FAIRWINS_API_URL": "https://relay.fairwins.app",
        "FAIRWINS_API_TOKEN": "fw1...."
      }
    }
  }
}
```

### HTTP

```json
{
  "mcpServers": {
    "fairwins": {
      "url": "http://127.0.0.1:8790/mcp",
      "headers": { "Authorization": "Bearer fw1...." }
    }
  }
}
```

In HTTP mode the per-request `Authorization: Bearer` header **overrides** `FAIRWINS_API_TOKEN` for
that request, so one process can serve several members without storing any of their credentials.

There is deliberately **no CORS header on any response**. MCP clients are agents, not browsers, so
CORS buys this endpoint nothing — while `Access-Control-Allow-Origin: *` would let any web page the
member has open script requests at a server that is holding their capability token. If a browser
surface ever needs this, it belongs behind an explicit origin allow-list, never a wildcard.

## Tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `get_profile` | `read:profile` | Introspect the token: account, key id, scopes, expiry, membership, revocation. |
| `get_membership` | `read:membership` | Tier and expiry on the membership reference chain. |
| `get_wagers` | `read:wagers` | The member's wagers, as a per-chain three-state envelope. |
| `get_fees` | `read:fees` | Live FeeRouter rates, each with its source (`chain` / `env-fallback`). |
| `build_intent` | `build:intents` | Unsigned EIP-712 typed data for a platform action. **The member signs it.** |
| `get_gateway_status` | — | Gateway health and which modules are live. Public. |
| `get_prediction_markets` | — | Polymarket markets the gateway proxies. Public, Polygon only. |
| `get_perps_pairs` | — | Aggregated perpetual-futures market data. Public, read-only. |

Resources: `fairwins://openapi` (fetched live from the gateway), `fairwins://status`,
`fairwins://guide` (embedded, so it reads even when the gateway does not).
Prompts: `wager-review`, `portfolio-briefing`.

## Reading results honestly

Every read resolves to `read`, `not-configured` (the platform has no endpoint for that chain), or
`unreadable` (the read failed). A tool that fails returns `isError: true` with the gateway's own
error code and reason, and says in as many words that the answer is **unknown**.

Nothing here converts a failure into an empty list, a zero, or a `false`. An agent told "no wagers"
when the truth is "the indexer timed out" will go on to say something untrue to a member, and that
is the one failure mode this server is most able to have.

## Container

```bash
docker build -f services/mcp-server/Dockerfile -t fairwins-mcp-server services/mcp-server
docker run --rm -p 8790:8790 -e FAIRWINS_API_URL=https://relay.fairwins.app fairwins-mcp-server
curl -fsS http://127.0.0.1:8790/healthz     # {"status":"ok"}
```

The build context is **this directory**, not the repo root, because there is nothing outside it to
copy: no workspace package, no lockfile, no install stage. `.github/workflows/container-build.yml`
builds this image and boots it on every change to `services/mcp-server/**`.

## See also

- `docs/developer-guide/mcp-server.md`
- `docs/developer-guide/member-api.md`
- `specs/095-member-api-agentic-access/`
