# fairwins-mcp-server (spec 095)

The FairWins member API as a [Model Context Protocol](https://modelcontextprotocol.io) server, so an
AI agent can read a member's FairWins data and prepare actions for them to sign.

It **reads** and it **quotes**. It cannot sign, cannot submit, cannot move funds, cannot create a
token, and cannot pay. There is no configuration that changes any of that: this process holds no
key, and the API it talks to has no write route. Where the gateway prices a request (x402, spec
096), this server surfaces the price and **carries** a payment the caller made — it never makes one.

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
| `FAIRWINS_API_TOKEN` | for member tools | The member's own API token. Public tools work without it. **In `--http` mode this is a shared identity — see [below](#the-env-token-and---http).** |
| `FAIRWINS_TIMEOUT_MS` | no | Per-request upstream timeout, default `15000`. |
| `PORT` | no | Default port for `--http` when none is given on the command line. |
| `FAIRWINS_MCP_ALLOWED_ORIGINS` | no | Comma-separated browser origins to serve, same effect as `--allowed-origin`. |

Command-line options, all of them `--http`-only (passing one without `--http` is an error rather
than a silent no-op — the stdio transport has no socket to bind and no origin to check):

| Option | Default | Meaning |
| --- | --- | --- |
| `--host <address>` | `127.0.0.1` | Bind address. `0.0.0.0` on Cloud Run (`K_SERVICE` set), where the platform reaches the container from outside its network namespace. |
| `--allowed-origin <origin>` | — | Also serve browser requests from this exact origin. Repeatable. No wildcard. |
| `--allow-shared-token` | off | Serve `FAIRWINS_API_TOKEN` to callers who send no `Authorization` header. Without it, `--http` refuses to start when that variable is set. |

There is deliberately **no environment variable for a payment**. A payment is single-use and
per-request; one that could be replayed out of configuration would be a standing withdrawal. It
travels as an `X-PAYMENT` request header, in HTTP mode only.

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

A per-request `X-PAYMENT` header is forwarded the same way — see [Paying per request](#paying-per-request-x402-spec-096).

#### Where it listens

`--http` binds **`127.0.0.1`**. The MCP specification says a local server should, and the reason is
concrete: this endpoint answers for a member's capability token, and the difference between "a
process on my laptop" and "a service on the office network" should not be something you get by
default from a flag you added to try something out.

| How it is run | Binds | Why |
| --- | --- | --- |
| `node src/server.js --http 8790` | `127.0.0.1:8790` | The default. Nothing off this machine can reach it. |
| `node src/server.js --http 8790 --host 0.0.0.0` | `0.0.0.0:8790` | You asked. The boot log says out loud that the port is now reachable and that Origin checking is not authentication. |
| The container image | `0.0.0.0:$PORT` | The CMD passes `--host 0.0.0.0`, because the network namespace is the boundary — what is exposed is decided by your `-p` or the Cloud Run ingress, not by the bind address. A loopback-bound container would be unreachable through `-p` while its healthcheck, which curls loopback from inside, went on reporting healthy. |
| Cloud Run | `0.0.0.0:$PORT` | `K_SERVICE` is set. Backstop for a deployment that overrides the CMD; Cloud Run cannot route to a loopback-bound revision. |

#### Which origins it serves

There is deliberately **no CORS header on any response** — MCP clients are agents, not browsers, so
CORS buys this endpoint nothing, and `Access-Control-Allow-Origin: *` would be scriptable by any
page the member has open.

**Withholding CORS is not, however, a defence, and the `Origin` header is validated separately.**
CORS governs whether a browser lets a page *read* a response. It does not govern whether the request
is sent, and it does not govern whether the server executes it. A POST whose `Content-Type` is one
of the three CORS-safelisted values — `text/plain` among them — is a *simple request*: no preflight,
sent straight through. Before this check existed, `POST /mcp` with `Content-Type: text/plain` and
`Origin: https://evil.example` answered **200** with a full tools listing.

So, as the MCP Streamable HTTP specification requires ("servers MUST validate the `Origin` header on
all incoming connections", for DNS-rebinding defence):

| Request carries | Result |
| --- | --- |
| **No `Origin` header** | **Served.** curl, an agent runtime, an editor. A browser cannot omit one, so absence is evidence of not being the thing this check defends against. |
| A loopback origin (`http://localhost:*`, `http://127.0.0.0/8:*`, `http://[::1]:*`, https likewise) | Served, always. A rebinding attacker's page keeps *its* origin, so this grants them nothing — what it grants is the MCP Inspector and other local browser-based tooling. |
| An origin you allow-listed | Served. Exact match; default ports fold, so `https://a.example` and `https://a.example:443` are one entry. |
| Anything else, including `Origin: null` | **403 `origin_not_allowed`.** `null` is what a sandboxed iframe and a `file://` page send: a present origin that is not on the list, not an absent one. |

The check runs before routing, so `/healthz` and unknown paths are covered too. There is no
wildcard: `--allowed-origin '*'` is refused at startup rather than accepted and quietly never
matched.

#### The env token and `--http`

`--http` **refuses to start when `FAIRWINS_API_TOKEN` is set**, unless you pass
`--allow-shared-token`.

`FAIRWINS_API_TOKEN` is a fallback for requests that arrive with no `Authorization` header. Over
stdio that is exactly right and is what the variable is for: there is one caller by construction —
the client that spawned the process — and the token is that member's own, in that member's client
configuration. Over HTTP the population of callers is "everything that can open a socket to this
port", and the fallback silently promotes every one of them to that member: their scopes, their
wagers, their fee data, their quotas, and on a priced gateway their membership standing in place of
a payment.

It is fatal rather than a warning because a warning in a boot log is not read by the person
deploying, and it is a flag rather than a ban because a single-member HTTP deployment — one member,
one server, bound where only they can reach it — is a real thing. The flag makes it a decision
instead of an accident, and the boot log keeps saying what was accepted.

The usual answer is to leave it unset and have each caller send its own token:

```bash
# refuses to start
FAIRWINS_API_TOKEN=fw1.… node src/server.js --http 8790

# serves several members, holds none of their credentials
FAIRWINS_API_URL=https://relay.fairwins.app node src/server.js --http 8790
curl -H 'Authorization: Bearer fw1.…' -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://127.0.0.1:8790/mcp
```

The Cloud Run deployment sets no token at all (`infra/terraform/environments/*/main.tf` gives this
service `env` but no `secret_env`), which is why `allow_unauthenticated = true` there is not a hole:
the member token is the authorization, and the platform never holds one.

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

## Paying per request (x402, spec 096)

A FairWins gateway may price some operations and accept a **per-request payment** from an agent that
holds no member token. It substitutes for membership on that one call; a valid `fw1.…` token is
checked first and is **never charged**.

**This server cannot pay, and no configuration changes that.** It holds no key and signs nothing. It
carries a payment somebody else made, and reports the answer:

| Step | What happens |
| --- | --- |
| 1. Price it | `get_gateway_status` reports whether x402 is offered, on which network, and what each operation class costs. Free, and needs no token. Only `get_wagers`, `get_fees` and `build_intent` are priceable — token introspection, membership and the public market tools never are. |
| 2. Call it | A priced call with no accepted payment answers `isError: true` carrying the whole `accepts` offer — amount in base units, asset address, `payTo`, CAIP-2 network, and the token's own EIP-712 domain in `extra`. **A price, not an outage.** |
| 3. Sign it | The caller signs an EIP-3009 `transferWithAuthorization` matching one offer, under **the token's own** EIP-712 domain (the token contract verifies it, not FairWins). |
| 4. Retry it | The same tool call with an `X-PAYMENT: <base64 payload>` header. Forwarded upstream byte-for-byte. |
| 5. Read the receipt | On success the response carries `X-PAYMENT-RESPONSE` (the gateway's own bytes) and the tool result restates it. The transaction is **broadcast, not confirmed** — never describe it as final, and never retry assuming nothing was charged. |

```bash
curl -s -X POST http://127.0.0.1:8790/mcp \
  -H 'content-type: application/json' \
  -H "X-PAYMENT: $PAYMENT_B64" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_fees","arguments":{}}}' \
  -D - -o -
```

**HTTP mode only.** stdio has no per-call header, and `FAIRWINS_API_TOKEN`-style configuration
cannot carry a payment: a payload replayable from an env var would be a standing withdrawal, not a
single-use authorization. In stdio mode a 402 is still surfaced in full — the agent just has nowhere
to put the payment, and should use HTTP mode or ask a member for a token.

A payment is verified **before** it is settled, so a refused payment costs nothing and serves
nothing, and the refusal names its reason. A settled payment buys the answer to **one** request,
served as the payer's own account after the same sanctions screening every other caller gets.

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

The image's CMD is `--http --host 0.0.0.0`. See [Where it listens](#where-it-listens) for why the
container says that explicitly instead of inheriting the loopback default — and note that the same
image passes no token, so it is never the shared-identity case.

## See also

- `docs/developer-guide/mcp-server.md`
- `docs/developer-guide/member-api.md`
- `specs/095-member-api-agentic-access/`
