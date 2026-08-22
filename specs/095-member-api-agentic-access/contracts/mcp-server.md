# Contract: FairWins MCP server — spec 095

Producer: `services/mcp-server/src/{server,protocol,apiClient,tools,resources,prompts}.js`.
Upstream contract: [member-api.md](./member-api.md). Credential: [api-key-grant.md](./api-key-grant.md).

> **This server cannot sign, and it never holds a key.** It is a thin, dependency-free projection of
> the member API for AI agents: it reads what the member's own token permits and builds **unsigned**
> typed data the member signs somewhere else. It has no wallet, no signer, no seed, and no write path
> of its own — the tool descriptions say so, because an agent that believes it can submit will
> eventually tell a member that it did.

---

## 1. Shape and dependencies

`services/mcp-server/` is a standalone Node ≥ 20 ESM service with **zero dependencies** and it is
**not** a member of the repo's npm workspaces.

That is deliberate. The reference MCP SDK would pull a dependency tree into a lockfile whose
incremental-install failure mode is measured in this repository — a dropped optional platform binary
breaks every Vite build, including the on-chain mini-app release path, and `npm ci` does not repair
it. MCP over stdio is newline-delimited JSON-RPC 2.0; the methods below are a dispatch table over
`JSON.parse`, `JSON.stringify` and `process.stdin`. A service outside the workspaces with no
dependencies cannot move the lockfile at all.

Tests use `node:test` (`node --test`) for the same reason: no runner dependency.

## 2. Transports

**stdio (default).** One JSON-RPC message per line on stdin; one response per line on stdout.
**Nothing but protocol bytes may be written to stdout** — every log, warning and diagnostic goes to
stderr, because a stray `console.log` corrupts the stream and presents as an unexplained client
disconnect.

**HTTP (`--http <port>`).**

| Route | Behaviour |
|---|---|
| `POST /mcp` | one JSON-RPC message per request, one response per response body |
| `GET /healthz` | `200 {"status":"ok"}`; no auth, no member data, used by the container health check |

In HTTP mode a per-request `Authorization: Bearer <token>` header **overrides** the process-wide
`FAIRWINS_API_TOKEN`, so one deployed instance can serve several members without ever holding a
credential of its own. A request with neither is served, and its tools answer with the honest
"no token configured" error result described in §6 — not with an empty account.

The HTTP mode is a transport, not a trust boundary: it authenticates nobody, holds nothing, and is
useful only because the token it forwards is itself the authority.

## 3. JSON-RPC methods

| Method | Notes |
|---|---|
| `initialize` | `protocolVersion: "2025-06-18"`, `capabilities: { tools: {}, resources: {}, prompts: {} }`, `serverInfo: { name: "fairwins-mcp", version }` |
| `notifications/initialized` | accepted; no response (it is a notification) |
| `ping` | `{}` |
| `tools/list` | the eight tools of §4, with JSON Schema `inputSchema` |
| `tools/call` | `{ name, arguments }` → `{ content: [{type:"text", text}], isError? }` |
| `resources/list` | the three resources of §5 |
| `resources/read` | `{ uri }` → `{ contents: [{ uri, mimeType, text }] }` |
| `prompts/list` | the two prompts of §6 |
| `prompts/get` | `{ name, arguments }` → `{ description, messages: [...] }` |

Any other method answers JSON-RPC error `-32601` (method not found). A malformed frame answers
`-32700`; a message missing `method` answers `-32600`. A notification (no `id`) never produces a
response, including on error — answering one is a protocol violation that some clients treat as a
fatal desync.

## 4. Tools

Every tool calls the member API over HTTPS with the configured token. Every one is a **read or a
build**; none writes.

| Tool | Arguments | Upstream | Scope needed |
|---|---|---|---|
| `get_profile` | — | `GET /v1/member/me` | `read:profile` |
| `get_membership` | — | `GET /v1/member/membership` | `read:membership` |
| `get_wagers` | `chainId?` (integer) | `GET /v1/member/wagers` | `read:wagers` |
| `get_fees` | — | `GET /v1/member/fees` | `read:fees` |
| `build_intent` | `action` (string), `chainId` (integer), `params` (object) | `POST /v1/member/intents/build` | `build:intents` |
| `get_gateway_status` | — | `GET /status` | none (public) |
| `get_prediction_markets` | `q?` (string) | `GET /v1/polymarket/137/markets` | none (public) |
| `get_perps_pairs` | — | `GET /v1/perps/pairs` | none (public) |

`build_intent`'s description states, in the text an agent actually reads:

> Returns UNSIGNED EIP-712 typed data. This server cannot sign it and will not: the member's key is
> not here. Give the typed data to the member to sign in their wallet, then submit it through the
> platform's relay endpoint or from their own wallet.

The three public tools exist because an agent reasoning about a member's position is usually also
reasoning about the market — and routing those reads through the same server keeps the agent from
being pointed at some other data source of unknown provenance. They require no scope because the
underlying routes require no member.

### Result shape and the honesty rules

Success:

```jsonc
{ "content": [ { "type": "text", "text": "{\"account\":\"0x…\",…}" } ] }
```

Failure — **always `isError: true` with a stated reason**, never a plausible-looking empty answer:

```jsonc
{ "content": [ { "type": "text",
    "text": "Could not read membership: the platform could not reach the membership chain (membership_unreadable). This is retryable." } ],
  "isError": true }
```

| Situation | What the tool must say |
|---|---|
| `FAIRWINS_API_URL` unset | "This server has no FairWins API URL configured, so it cannot read anything." — **not** an empty result |
| no token (and none in the request) | "No member token is configured; ask the member to create one in the app under Settings → API access." |
| `401 token_expired` / `token_revoked` | name which — an agent must be able to tell "your key ran out" from "your key was withdrawn" |
| `503 auth_unverifiable` / `membership_unreadable` / `screening_unavailable` | say it is a failed check and **retryable**, never that the member lacks access |
| `403 insufficient_scope` | name the scope the operation needs so the member can mint a key that has it |
| `429` | say it is a rate limit and repeat the retry hint |
| a per-chain `unreadable` inside a 200 body | pass it through verbatim; **never** collapse an unreadable chain into "no wagers" |

The last row is the one that matters most in practice: a partial answer rendered as a whole one is how
an agent ends up telling a member they have no positions when a subgraph was simply down.

## 5. Resources

| URI | Content |
|---|---|
| `fairwins://openapi` | the live `GET /v1/member/openapi.json` document, `application/json` |
| `fairwins://status` | the live `GET /status` body, `application/json` |
| `fairwins://guide` | an **embedded** getting-started document, `text/markdown` |

`fairwins://guide` ships in the server's own bytes so it is readable before anything is configured. It
covers: how a member creates a key in the app (Settings → API access, one wallet signature, shown
once), what the scopes mean, how to configure this server, and the custody model in plain words —
**reads, quotes, and relaying bytes the member already signed; nothing else, ever.** It states that
the server cannot sign, that a token is a credential to guard, that revocation is best-effort on a
single gateway instance while the grant's expiry is the durable bound, and that the member should
prefer the shortest lifetime that suits the job.

The two live resources are fetched on read (never cached across reads) so an agent that re-reads
`fairwins://status` after an outage sees the current answer. A failed fetch is an error result, not a
stale body and not an empty document.

## 6. Prompts

| Name | Arguments | Purpose |
|---|---|---|
| `wager-review` | `chainId?` | Walk the member's open wagers: call `get_wagers`, name any chain that answered `unreadable` **as unknown rather than empty**, summarise deadlines and what each position needs next, and state that nothing will be signed or submitted. |
| `portfolio-briefing` | — | Combine `get_membership`, `get_wagers` and `get_fees` into a short briefing: membership state and expiry, open positions per chain with unread chains named, live platform fee rates, and an explicit list of what could not be read. |

Both templates instruct the agent to verify before advising, to state fees honestly, and never to
claim it performed an action. They are instructions, not authority: a prompt cannot grant a scope, and
an agent following one still hits the same refusals.

## 7. Configuration

| Env | Required | Notes |
|---|---|---|
| `FAIRWINS_API_URL` | to serve | e.g. `https://relay.fairwins.app`. Missing ⇒ every tool returns the honest not-configured error result; the process still starts and still speaks the protocol |
| `FAIRWINS_API_TOKEN` | no | the **member's own** token. The server never creates one, never renews one, and never writes one anywhere. In HTTP mode a per-request header overrides it |
| `FAIRWINS_ORIGIN_AUTH` | no | forwarded as `X-Origin-Auth` when the deployment sits behind the platform edge lock. It is a *platform* secret, not a member credential, and grants nothing on its own |
| `FAIRWINS_TIMEOUT_MS` | no | default `15000`; every upstream call is bounded by an `AbortController` |
| `PORT` | no | HTTP mode only; `--http <port>` wins |

The server holds **no** other credential: no model key, no gateway secret, no signer. It never writes
a token to disk, to a log, or to a response.

## 8. Deployment

`Dockerfile` with a **standalone build context** (`services/mcp-server` — there is no workspace
package to copy in): `node:20-alpine`, `USER node`, `EXPOSE 8790`, `CMD` running HTTP mode on 8790,
`HEALTHCHECK` on `/healthz`.

Cloud Run: `module "mcp_server"` (prod) / `module "mcp_server_staging"` at the existing shared-module
pin, min 0 / max 4, `cpu_idle = true`, `allow_unauthenticated = true`, `env` carrying only
`FAIRWINS_API_URL`. **No service account, no `secret_env`, no secret container**: the service is
stateless and secretless, so it needs no identity of its own — which also avoids widening the
Terraform apply identity's enumerated `actAs` grant. Single container on purpose: the shared module's
`ignore_changes` indexes `containers[0]`.

`allow_unauthenticated` is correct here precisely because the per-request member token is the
authority; an unauthenticated caller with no token reaches a server that can read nothing.

## 9. Client configuration

Stdio (the usual case — the token stays on the member's machine):

```jsonc
{
  "mcpServers": {
    "fairwins": {
      "command": "node",
      "args": ["/path/to/services/mcp-server/src/server.js"],
      "env": {
        "FAIRWINS_API_URL": "https://relay.fairwins.app",
        "FAIRWINS_API_TOKEN": "fw1.…"
      }
    }
  }
}
```

HTTP (a shared instance; each caller presents its own token):

```
POST https://mcp.fairwins.app/mcp
Authorization: Bearer fw1.…
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_membership","arguments":{}}}
```

The api-access mini-app generates the stdio snippet for the member, with the token slot left for them
to paste — the console never sees a token it did not just receive in memory, and never persists one.

## 10. Non-goals

1. **No signing, no submission, no key.** Not now and not behind a flag. An execution capability would
   be a separate spec with its own security lifecycle.
2. **No token issuance.** The server cannot create, renew or re-scope a grant; the member does that in
   the app, with their wallet.
3. **No persistence.** No transcript, no cache of member data, no state between calls.
4. **No dependency.** Adding one is a lockfile change to a repository where that has repeatedly broken
   the build; if a future need is genuine, it is a decision with its own justification, not a
   convenience.
5. **No fabricated answers.** A failed read is an error result. An unreadable chain inside a partial
   success stays named. The server never invents a value, and never lets an absence read as a fact.
