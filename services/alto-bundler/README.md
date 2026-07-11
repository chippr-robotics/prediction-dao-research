# alto bundler — origin-lock edge hardening (spec 041 SC-009 / spec 036 FR-029)

The ERC-4337 bundler (pimlico **alto**) that backs passkey/smart-account UserOperations must not sit on
a bare public Cloud Run URL: alto has no auth of its own, so an open URL lets anyone spend its executor
gas. This brings the bundler to the same posture as the SPA and relay-gateway — **Cloudflare-fronted at
`bundler.fairwins.app`, gated by the zone-wide `X-Origin-Auth` origin lock**, with a thin nginx ingress
sidecar validating the secret in front of a localhost-only alto sidecar.

```
browser ─▶ bundler.fairwins.app ─▶ Cloudflare (Transform Rule: +X-Origin-Auth) ─▶ Cloud Run
                                                                                    ├─ nginx :8080  (validates X-Origin-Auth)
                                                                                    └─ alto  :3000  (localhost only)
```

## What's here

| File | Purpose |
|---|---|
| `nginx/bundler.conf.template` | origin-lock map (`$origin_denied`, `map_hash_bucket_size 128`) + **CORS allow-list** (`$cors_allow_origin`) + `/healthz` exempt + proxy to `127.0.0.1:3000` |
| `nginx/docker-entrypoint.sh` | derives `ORIGIN_LOCK_ENABLED` from whether `ORIGIN_LOCK_SECRET` is set (fail-open, never a 403-brick); trims the secret |
| `nginx/Dockerfile` | `nginx:1.27-alpine` + `envsubst` |
| `cloudbuild.yaml` | manual/isolated rollout — build the nginx image + `gcloud run services replace` the full 2-container spec |
| `deploy/service.yaml` | multi-container Cloud Run (nginx ingress + alto sidecar) — **alto env reconciled to live `alto:v1.2.7` / Polygon 137 (2026-07-06)** |

**Auto-deploy:** the root `cloudbuild.yaml` (fired by the `^main$` Cloud Build trigger on every merge)
builds `alto-bundler-nginx:$COMMIT_SHA` and `gcloud run services replace`s this service — so merging a
change here rolls the bundler out automatically. (It redeploys on *every* main merge; add a
`--included-files services/alto-bundler/**` trigger later if you want to scope it.)

The origin lock is **fail-open by design**: no `ORIGIN_LOCK_SECRET` → `ORIGIN_LOCK_ENABLED=0` → all
traffic allowed. Mounting the Secret-Manager `origin-lock-secret` is the single switch that arms it, so
you cannot half-configure it into a deny-everything state.

## CORS (why the bundler needs it)

The SPA (`fairwins.app`) and the bundler (`bundler.fairwins.app`) are **different origins**, so viem's
browser bundler client makes a **cross-origin** request: its `application/json` UserOp POST
(`eth_estimateUserOperationGas` / `eth_sendUserOperation`) triggers a CORS preflight. The origin lock is
*orthogonal* to CORS — it lets the request through, but the browser still blocks it unless the response
carries `Access-Control-Allow-Origin`. alto emits no CORS headers and 404s `OPTIONS`, so before this the
first passkey transfer failed with viem's `UserOperationExecutionError: … HTTP request failed` **even
though the bundler was healthy server-side** (`eth_chainId` → `0x89`). The nginx ingress now:

- answers the preflight `OPTIONS` itself, **before** the origin lock (browsers can't attach
  `X-Origin-Auth` to a preflight, and `OPTIONS` is side-effect-free), and
- echoes an allow-listed `Origin` on the actual response.

The allow-list lives in the `$cors_allow_origin` map in `nginx/bundler.conf.template` — **keep it in sync
with the relay-gateway's `ALLOWED_ORIGINS`** (`services/relay-gateway/src/server.js`), which this mirrors.
Add one line per SPA origin. A non-allow-listed `Origin` gets no header, so it stays denied by the browser.

## Rollout status

**LIVE + origin-lock ARMED on Polygon 137 (2026-07-06).** 2-container service (nginx ingress + alto
`v1.2.7` sidecar), SPA points at `bundler.fairwins.app`, Cloudflare Host-override routes it to the
`*.run.app` origin and injects `X-Origin-Auth` zone-wide. Verified:

```sh
# direct run.app (no Cloudflare header)         -> 403 (locked)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://fairwins-alto-bundler-<hash>.run.app/ \
  -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# bundler.fairwins.app (Cloudflare injects header) -> 200 {"result":"0x89"}
curl -s -X POST https://bundler.fairwins.app/ \
  -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Use a **JSON-RPC POST** (`eth_chainId`) for external health checks — **not** `/healthz`: Cloud Run's GFE
intercepts the startup-probe path `/healthz` and returns its own 404 for *external* requests (the internal
probe hits nginx:8080 directly and passes fine). `curl https://bundler.fairwins.app/health` → `"OK"` also
works (alto's own route, proxied).

### Deploy gotchas (all three cost a failed rollout — baked into the config now)

1. **alto needs a `startupProbe`** — Cloud Run rejects the spec because nginx `depends_on` alto
   (`container-dependencies`); the depended-upon container must declare one. TCP probe on `:3000`.
2. **`map_hash_bucket_size 128`** in `bundler.conf.template` — the *armed* map key `"1:<64-hex secret>"`
   is 66 bytes, over nginx's default 64-byte bucket, so **armed** nginx fails to boot (`could not build
   map_hash`). Lock-off is fine (`"1:__unset__"` is short), which is why this only bites on arming.
3. **The entrypoint trims `ORIGIN_LOCK_SECRET`** — Cloud Run injects Secret Manager values verbatim
   including a trailing newline; nginx exact-matches, so an untrimmed secret 403s *every* Cloudflare
   request (the Node relay-gateway trims, so it was unaffected — that's the tell).

**Manual `services replace` caveat:** the `:latest` tag gets deduped/cached by Cloud Run, so a manual
`gcloud run services replace` may keep the old image. Pin the digest (`alto-bundler-nginx@sha256:…`) for a
one-off deploy. CI is unaffected — it seds `:latest`→`:$COMMIT_SHA` (a unique tag) before replacing.

To roll the bundler alone (without a frontend build):
```sh
gcloud builds submit . --config services/alto-bundler/cloudbuild.yaml
```

## Rollback

Re-`replace` with the lock OFF (drop `ORIGIN_LOCK_SECRET`) to reopen instantly, or revert the SPA
`VITE_BUNDLER_URLS_POLYGON` to the `run.app` URL. The nginx sidecar adds no state; alto's executor
nonce continuity is preserved by `minScale: 1`.

## Also monitor

Add the alto **executor gas wallet** to the same balance/runway monitoring as the relayer gas wallets
(spec 036) — a drained executor silently fails every UserOp. The address is `ALTO_EXECUTOR_PRIVATE_KEYS`'
account; export its balance alongside the `GAS_WALLET_*` runway metrics.
