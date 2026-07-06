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
| `nginx/bundler.conf.template` | origin-lock map (`$origin_denied`) + `/healthz` exempt + proxy to `127.0.0.1:3000` |
| `nginx/docker-entrypoint.sh` | derives `ORIGIN_LOCK_ENABLED` from whether `ORIGIN_LOCK_SECRET` is set (fail-open, never a 403-brick) |
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

## Rollout status + remaining steps

Progress as of 2026-07-06:
- ✅ nginx ingress image + `deploy/service.yaml` reconciled to the live `alto:v1.2.7` / Polygon 137 config.
- ✅ Auto-deploy wired into the root `cloudbuild.yaml` — **merging brings up the 2-container service
  LOCK-OFF** (fail-open): the nginx ingress goes live without breaking the working `run.app` URL.
- ✅ `bundler.fairwins.app` CNAME created (Cloudflare-proxied).
- ✅ Zone-wide `X-Origin-Auth` Transform Rule already in place (covers `*.fairwins.app`).
- ⚠️ **`bundler.fairwins.app` does NOT route to the service yet.** It returns Google's HTML 404 (the GFE
  doesn't recognize the Host), whereas the `run.app` URL returns alto's JSON 404. A bare CNAME→`*.run.app`
  is insufficient — Cloud Run routes by Host. Fix with **either** a Cloudflare **Host-header override** to
  the `*.run.app` origin (Origin Rule / Transform Rule → Rewrite Host), **or** a Cloud Run domain-mapping.

### Arm the lock (only after the front door works)

1. Confirm routing: `curl -s https://bundler.fairwins.app/` must return **alto's** JSON 404
   (`{"message":"Route GET:/ not found",...}`), not Google's HTML 404.
2. Point the SPA at the edge host: set `VITE_BUNDLER_URLS_POLYGON=https://bundler.fairwins.app` in the root
   `cloudbuild.yaml` (currently the transitional `run.app` URL). CSP already allows both hosts, so no CSP change.
3. Uncomment the `ORIGIN_LOCK_SECRET` env in `deploy/service.yaml` and merge (or run the manual config below).
4. Verify:
   ```sh
   curl -sI https://bundler.fairwins.app/healthz                                            # 200 (health exempt)
   curl -s -o /dev/null -w '%{http_code}\n' https://bundler.fairwins.app/                   # 200 (CF injects header)
   curl -s -o /dev/null -w '%{http_code}\n' https://fairwins-alto-bundler-<hash>.run.app/   # 403 (no CF header — locked)
   ```

To roll the bundler alone (without a frontend build), run the manual config:
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
