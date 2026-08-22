# FairWins MCP server — getting started

This server connects an AI agent to **one member's** FairWins data through the FairWins member API.
It is read-and-quote only.

## What this server can and cannot do

It **can**: read the member's profile, membership tier, wagers (per chain), and the live platform
fee rates; assemble unsigned EIP-712 typed data for a platform action; read public market data and
the gateway's health.

It **cannot**: sign anything, submit anything, move any funds, or create a token. It holds no
private key, no seed phrase and no wallet, and the API it talks to has no write route. There is no
configuration that changes this — the absence is the design, not a default.

**No one should ever be asked for a private key or a recovery phrase in order to use this server.**
If something claims otherwise, it is not FairWins.

## The custody model, plainly

1. The **member** creates a token in the FairWins app: **Settings ▸ API access**. Creating one is a
   signature in their own wallet — an off-chain EIP-712 *capability grant* naming the account, a key
   id, the scopes granted, and an expiry. Nothing is stored on the platform to issue it.
2. The token is shown **once**. It is a credential: treat it exactly like a password, keep it out of
   shared configuration files, and never paste it into a chat.
3. The gateway verifies the signature on every request and checks that the account still holds an
   active paid membership. A token authorises the gateway to **answer questions about that member**.
   It never authorises anyone, including this server, to act as them.
4. To act, the **member signs** — in their own wallet, on their own device. `build_intent` returns
   the typed data for them to review and sign; the signed result is relayed through the gateway's
   public intent route or submitted directly from their wallet. Both paths always remain open.
5. A token can be withdrawn at any time from the same panel. Revocation is registered on the live
   gateway and the grant's signed expiry is the bound that survives a gateway restart — so keep
   expiries short.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `FAIRWINS_API_URL` | to serve data | Gateway base URL, e.g. `https://relay.fairwins.app`. Unset ⇒ every tool answers with a configuration error rather than pretending. |
| `FAIRWINS_API_TOKEN` | for member tools | The member's own token. Public tools (`get_gateway_status`, `get_prediction_markets`, `get_perps_pairs`) work without it. |

In HTTP mode a per-request `Authorization: Bearer <token>` header overrides the environment token,
so one process can serve several members without any of their tokens being stored in it.

## Scopes

A token carries only the scopes the member ticked when they created it:

- `read:profile` — `get_profile`
- `read:membership` — `get_membership`
- `read:wagers` — `get_wagers`
- `read:fees` — `get_fees`
- `build:intents` — `build_intent`
- `assistant:chat` — the in-app assistant (not exposed as a tool here)

A tool called without its scope fails with `insufficient_scope`. That is the member declining, not
an outage: ask them to create a token with the scope, rather than retrying.

## Reading results honestly

Every read resolves to one of three states, and the difference matters more than it looks:

- **read** — a real answer.
- **not-configured** — the platform has no indexer/endpoint for that chain. Not "no data".
- **unreadable** — the read failed. Not "zero", not "none", not an empty list.

When a tool returns `isError: true`, the answer is **unknown**. Say so. Reporting an unreadable
balance as zero, or a timed-out wager list as "you have no wagers", is the one failure mode that
turns a broken read into a false statement to a member.

## Resources and prompts

- `fairwins://openapi` — the full OpenAPI 3.1 document, including every buildable action.
- `fairwins://status` — the gateway's live module and killswitch state.
- `fairwins://guide` — this document.
- Prompts: `wager-review`, `portfolio-briefing`.
