# Runbook: Member API and Assistant Operations (spec 095)

## 1. Overview

Operate the member-facing HTTP API on the relay gateway (`services/relay-gateway/src/memberApi/`),
the agentic assistant proxy inside it, and the `fairwins-mcp-server` Cloud Run service that
consumes it.

Hold four facts before touching anything:

1. **The gateway issues no credentials and stores no key material.** A member's API token is an
   EIP-712 grant they signed in their own wallet. There is no key table to protect, dump, or
   restore — and no operator action that can create, read, or extend a member's token.
2. **The only secret this feature adds is `ANTHROPIC_API_KEY`.** Everything else is public
   configuration. Treat that one key as production credential material; treat the rest as flags.
3. **Revocation is in-process and does not survive a restart.** Every revocation response says so
   (`durable: false`). Never tell a member their key is permanently dead — the durable bound on a
   compromised token is its signed `expiresAt`.
4. **Nothing here moves money.** Every endpoint reads, quotes, or returns unsigned typed data. An
   incident on this module cannot drain an account; it can leak reads or run up model spend.

Design: `specs/095-member-api-agentic-access/`. Developer detail:
[member-api.md](../developer-guide/member-api.md), [mcp-server.md](../developer-guide/mcp-server.md),
[agentic-chat.md](../developer-guide/agentic-chat.md).

---

## 2. Prerequisites

Before running any procedure below, confirm you have:

- `gcloud` authenticated against `chippr-bots-site-wp`, with IAP tunnel access to the gateway VM.
  **The GCP project is shared** — never touch a secret that is not named in this runbook. See
  [credential-rotation.md](credential-rotation.md).
- Access to the gateway's environment: `infra/vm/gateway/docker-compose.yml` for public config, and
  `infra/vm/common/fetch-secrets.sh` for secret delivery.
- Repository write access via the normal PR path. **Two of the changes below are code changes, not
  console changes** — adding a secret to `fetch-secrets.sh`, and adding a subgraph URL to a
  per-chain env — and both ship through `staging` → `main`.
- The gateway's public base URL for the environment you are operating
  (`https://relay.fairwins.app`, `https://relay-staging.fairwins.app`).

Know which state you are starting from before you change it:

```bash
curl -s https://relay.fairwins.app/status | jq '.memberApi'
# { "enabled": false, "killSwitch": false, "assistant": { "configured": false } }
```

---

## 3. Step-by-Step Instructions

### 3.1 Enable the Member API

Set the module's environment on the gateway and restart the unit.

| Variable | Default | Set it to | Notes |
|---|---|---|---|
| `MEMBER_API_ENABLED` | `false` | `true` | Master switch. Off ⇒ every path answers `503 member_api_unconfigured`. |
| `MEMBER_API_KILLSWITCH` | `false` | leave `false` | Module-scoped stop. See 3.3. |
| `MEMBER_API_MAX_TTL_DAYS` | `90` | leave, or lower | Ceiling on a grant's lifetime. Lowering it invalidates longer grants **immediately**. |
| `MEMBER_API_SUBGRAPH_<chainId>` | unset | a subgraph URL per enabled chain | Unset is honest: that chain reports `not-configured`. |

Do this in order:

1. Edit the gateway env in `infra/vm/gateway/docker-compose.yml`; open a PR; merge through
   `staging` first.
2. Restart the whole unit on the target VM (see 4.1). **Restart the unit, never a single
   container** — all containers share one network namespace.
3. Verify with 3.6 before announcing anything.

**Lower `MEMBER_API_MAX_TTL_DAYS` only deliberately.** The cap is evaluated per request against the
grant's own `issuedAt`/`expiresAt`, so dropping 90 → 30 rejects every outstanding 90-day token at
the next call with `401 token_ttl_exceeded`. That is a legitimate blunt control in an incident
(3.5), and a surprise outage if you do it casually.

### 3.2 Enable the assistant

The assistant is a **sub-config of the Member API module**. It cannot answer while
`MEMBER_API_ENABLED` is false, and the Member API killswitch takes it down with the module.

| Variable | Default | Notes |
|---|---|---|
| `ASSISTANT_ENABLED` | `false` | Off ⇒ `503 assistant_unconfigured`. |
| `ANTHROPIC_API_KEY` | — | **SECRET.** Missing ⇒ `503 assistant_unconfigured`. |
| `ASSISTANT_MODEL` | `claude-sonnet-5` | Public config. |
| `ASSISTANT_MAX_TOKENS` | `1024` | Public config. |

**Deliver `ANTHROPIC_API_KEY` through Secret Manager and `fetch-secrets.sh`. Never put it in
`docker-compose.yml`, a build arg, a Terraform variable, or a `VITE_` variable.**

1. Create the secret and add a version:

   ```bash
   gcloud secrets create ANTHROPIC_API_KEY --replication-policy=automatic   # first time only
   printf '%s' "$KEY" | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
   ```

2. Add the delivery line to the **gateway** container block in `infra/vm/common/fetch-secrets.sh`,
   beside the other optional vendor keys:

   ```sh
   emit "$GW" ANTHROPIC_API_KEY ANTHROPIC_API_KEY latest optional
   ```

   Mark it **`optional`**, not `required`. A missing assistant key must degrade the assistant to
   `503 assistant_unconfigured` — it must never abort the gateway boot and take the gasless relay
   path down with it. That is the never-stranded rule.

3. Ship that edit through `staging` → `main`. **A secret version alone does nothing**: secrets are
   read at boot into tmpfs, so the script must name the variable before the container can ever see
   it.

4. Set `ASSISTANT_ENABLED=true` in the gateway env, then restart the unit (4.1).

5. Verify `.memberApi.assistant.configured == true` at `/status`, then run one real chat turn from
   a member account and confirm a reply and non-zero `usage`.

**Rotate the key** by adding a new version and restarting the unit — the delivery line is pinned to
`latest`, so no code change is needed for a rotation, only for the first wiring. Retire the previous
version at the provider after the restart is verified.

### 3.3 Use the killswitch

Two switches exist. Choose by blast radius.

| Switch | Effect | Use when |
|---|---|---|
| `MEMBER_API_KILLSWITCH=true` | This module answers `503 member_api_killed`. Everything else on the gateway keeps working. | Abuse, quota exhaustion, or a defect confined to this module. |
| The gateway-wide killswitch | Every module answers `503 killswitch_active`. | A gateway-wide incident. Do not reach for this to stop the Member API. |
| `ASSISTANT_ENABLED=false` | The assistant answers `503 assistant_unconfigured`; reads keep working. | Model-provider incident, runaway spend, or bad model behaviour. |

Set the flag, restart the unit, confirm at `/status`, and state which switch you used in the
incident channel. Killing the assistant alone leaves members' data reads working — prefer the
narrowest switch that ends the incident.

### 3.4 Handle a revocation request

Understand what revocation does before you promise anything.

- A member revokes in the app: they sign an `ApiKeyRevocation` and the client POSTs it to
  `/v1/member/keys/revoke`. The endpoint is **self-authorising** — a valid signature is the
  authority, so no bearer token is needed and a member with a leaked token can still revoke it.
- The gateway adds the key id to an **in-process set**. That set is memory. **A gateway restart,
  a redeploy, or a scale event forgets it**, and the token becomes valid again until its signed
  `expiresAt`.
- The response says exactly that: `{ revoked: true, durable: false, reason: "…" }`. The app shows
  the member both facts — the revocation is registered on the live gateway, and the grant also
  expires on its own date.

Therefore:

1. **Re-submit the revocation after any gateway restart.** Tell the member to press revoke again,
   or replay the stored signed revocation. It is idempotent.
2. **Never state that a token is permanently disabled.** The durable bound is `expiresAt`.
3. **If a leaked token has a long life and the member cannot wait**, lower
   `MEMBER_API_MAX_TTL_DAYS` below its remaining lifetime and restart — that rejects it, and every
   other token longer than the new cap, at the next request. Announce it: it is a blunt control.

### 3.5 Incident playbook

| Symptom | Likely cause | Do this |
|---|---|---|
| Every member call returns `503 member_api_unconfigured` | `MEMBER_API_ENABLED` unset, or the unit restarted without the env | Check `/status`; re-apply the env; restart the unit (4.1). |
| Every call returns `503 member_api_killed` | The module killswitch is on | Confirm it was intentional. If not, clear it and restart. |
| Widespread `503 auth_unverifiable` | Reference-chain RPC is failing; ERC-1271 checks cannot run | **Do not "fix" this by accepting the signatures.** Check the RPC endpoint; this is a correct answer to an unknown. |
| Widespread `503 membership_unreadable` | Same RPC failure on the membership read | Same. A tier that cannot be read is not tier 0. |
| Widespread `403 sanctioned_signer` | Screening source misconfigured or answering wrongly | Screening fails closed by design. Investigate the source; do not bypass. |
| Sustained `429` from one account | One member's agent is hot-looping | Confirm from quota counters; contact the member. Kill the module (3.3) only if the gateway is degraded. |
| Assistant returns `503 assistant_unavailable` | Model provider unreachable, timing out, or refusing the key | Check the provider's status; verify the key reached the container (4.2). The SPA shows an honest unreachable state meanwhile. |
| Assistant returns `503 assistant_unconfigured` after a rotation | New secret version added but the unit was not restarted | Restart the unit. Secrets are read at boot. |
| Model spend spiking | Abuse or a client retry loop | Set `ASSISTANT_ENABLED=false`, restart, then investigate. Reads stay up. |
| A revoked key works again | The gateway restarted and forgot the in-process set | Expected. Re-submit the revocation (3.4). |
| A chain reports `not-configured` in `/wagers` | `MEMBER_API_SUBGRAPH_<chainId>` unset | This is honest, not an outage. Set the URL only if that chain should be readable. |
| The MCP service is unreachable | Cloud Run revision failing, or `FAIRWINS_API_URL` wrong | Check `GET /healthz` on the service, then its `FAIRWINS_API_URL`. It holds no secret — never look for one. |

**Escalate to a security incident, not a support ticket**, if any of these appear: an error body, a
log line, or an audit record containing a `fw1.` token, an assistant message body, or the value of
`ANTHROPIC_API_KEY`. Rotate the Anthropic key immediately in that last case (3.2) and follow
[credential-rotation.md](credential-rotation.md).

### 3.6 Verify honest state

Run this after every change. The point is not that the endpoints answer — it is that they answer
**correctly about what they could not do**.

1. **Disabled reads as disabled, not as absent.** With the module off, every path answers `503
   member_api_unconfigured` — not `404`. An operator must be able to tell "off" from "gone".
2. **A failed read is never a zero.** Point a `MEMBER_API_SUBGRAPH_<chainId>` at an unreachable
   host and confirm that chain resolves `unreadable` **with no `wagers` field at all**. An empty
   array there is a defect: it says "you have no wagers", which is a fabricated fact.
3. **An unset chain is `not-configured`, and does not alert.** Absence of configuration is not an
   outage.
4. **Unknown authentication is `503`, never `401`.** Break the reference-chain RPC and confirm a
   contract-account token yields `auth_unverifiable`, not `invalid_signature`.
5. **Unreadable membership is `503`, never `403`.** Same test on the membership read.
6. **Revocation admits it is not durable.** Confirm `durable: false` in both the revoke response
   and `/keys/status`.
7. **The assistant never invents.** With `ASSISTANT_ENABLED=false`, confirm the panel shows an
   honest unavailable state and **no reply text**.
8. **No secret is in any output.** Grep the boot log and one request's logs for `fw1.`, for the
   Anthropic key prefix, and for any chat content. All three must be absent.

---

## 4. Code Examples

### 4.1 Restart the gateway unit after a config or secret change

```bash
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo systemctl restart fairwins-secrets@gateway && sudo systemctl restart fairwins-stack@gateway'
```

Restart the whole unit, never one container: the containers share a network namespace, and
recreating the owner leaves the joiners in a stack that looks healthy and is not.

### 4.2 Confirm the assistant key reached the container without printing it

```bash
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo grep -c "^ANTHROPIC_API_KEY=" /run/fairwins/gateway.env'
# 1 = delivered, 0 = not delivered (fix fetch-secrets.sh, then restart)
```

Never `cat` an env file from `/run/fairwins/`. Count the line; do not read the value.

### 4.3 Check module state and the served contract

```bash
BASE=https://relay.fairwins.app

curl -s "$BASE/status" | jq '.memberApi'
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/v1/member/openapi.json"   # 200 enabled, 503 off
curl -s "$BASE/v1/member/openapi.json" | jq '{openapi, paths: (.paths|keys)}'
```

### 4.4 Exercise an authenticated read with a member's own token

Ask a member to generate a **short-lived, read-only** token for a support session and to revoke it
afterwards. Never ask for a long-lived one, and never store it.

```bash
TOKEN='fw1.…'   # supplied by the member, held for this shell only

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/member/me" | jq
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/member/wagers" \
  | jq '.chains | map_values(.state)'
```

Expect `read`, `not-configured` or `unreadable` per chain — never a bare list.

### 4.5 Prove the honest-failure path

```bash
# A chain whose subgraph is unreachable must omit `wagers` entirely.
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/member/wagers?chainId=137" \
  | jq '.chains["137"] | {state, hasWagers: (has("wagers"))}'
# { "state": "unreadable", "hasWagers": false }   ← correct
# { "state": "unreadable", "hasWagers": true  }   ← DEFECT: file it, do not work around it
```

### 4.6 Check the MCP service

```bash
curl -s https://fairwins-mcp-server-<hash>-uc.a.run.app/healthz

curl -s -X POST https://fairwins-mcp-server-<hash>-uc.a.run.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

The service holds no secret and no service account of its own. Authorisation arrives per request.

---

## 5. Troubleshooting

**`/status` shows `enabled: true` but calls still 503.** Read the code in the body.
`member_api_killed` is the module killswitch; `killswitch_active` is the gateway-wide one; both are
independent of `MEMBER_API_ENABLED`.

**A member says their key "stopped working" with no change on our side.** Check, in order: the
grant's `expiresAt` (decode the middle segment of the token — it is public JSON, not a secret in
itself, but do not paste a whole token anywhere); `MEMBER_API_MAX_TTL_DAYS` against that grant's
lifetime; their membership state; and only then screening. `401 token_ttl_exceeded` means we
lowered the cap under an already-signed grant.

**A member says a revoked key still works.** Expected after a gateway restart (3.4). Re-submit the
revocation and explain the expiry date.

**A browser client gets a CORS error carrying a bearer token.** Confirm `Authorization` is present
in `Access-Control-Allow-Headers`. It was added deliberately for this module; nothing else about
the CORS posture changed, and no credentials mode or cookie is involved.

**A chain shows `unreadable` and stays that way.** That is the subgraph, not this module. Confirm
the URL, then check the subgraph itself. Do not set the chain to `not-configured` to quieten it —
that would say "we never offered this" about a surface that is simply down.

**The assistant answers slowly, then fails.** The proxy uses an `AbortController` timeout; a
timeout surfaces as `503 assistant_unavailable`. Check provider latency before changing
`ASSISTANT_MAX_TOKENS`.

**You cannot find an API-key table, dump, or backup.** There is none. Issuance is a member
signature; the gateway holds nothing. If a procedure seems to require reading a member's key, the
procedure is wrong.

---

## 6. References

- [Member API](../developer-guide/member-api.md) — token format, verification order, endpoints.
- [MCP Server](../developer-guide/mcp-server.md) — the Cloud Run consumer.
- [Agentic Assistant](../developer-guide/agentic-chat.md) — opt-in model, memory, disclosures.
- [Credential rotation and connected systems](credential-rotation.md) — the shared-project rules
  and the boot-time secret model.
- [Relayer operations](relayer-operations.md) — the gateway this module lives in.
- [Infrastructure operations](infrastructure-operations.md) — the VM and Cloud Run estate.
- [Configuration](../reference/configuration.md#member-api-and-assistant-gateway) — every variable.
- [Assistant & API access](../user-guide/assistant-and-api.md) — what members are told.
- Spec: `specs/095-member-api-agentic-access/`.
