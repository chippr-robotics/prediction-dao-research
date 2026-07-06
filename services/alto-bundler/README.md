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
| `cloudbuild.yaml` | build/push `alto-bundler-nginx` |
| `deploy/service.yaml` | multi-container Cloud Run (nginx ingress + alto sidecar) — **alto env must be reconciled from the live service first** |

The origin lock is **fail-open by design**: no `ORIGIN_LOCK_SECRET` → `ORIGIN_LOCK_ENABLED=0` → all
traffic allowed. Mounting the Secret-Manager `origin-lock-secret` is the single switch that arms it, so
you cannot half-configure it into a deny-everything state.

## Staged rollout (never break the live bundler)

Because the SPA currently calls the bare `run.app` URL, and passkey is OFF until the bundler is wired,
roll out in this order so nothing 403s before its front door exists:

1. **Build the ingress image**
   ```sh
   gcloud builds submit services/alto-bundler --config services/alto-bundler/cloudbuild.yaml
   ```
2. **Reconcile alto's env** into `deploy/service.yaml` from the live service (do NOT guess it):
   ```sh
   gcloud run services describe fairwins-alto-bundler --region us-central1 --format export
   ```
   Copy the live `ALTO_*` env + the executor/utility key secret refs into the `alto` container block.
3. **Deploy the sidecar with the lock OFF** (omit `ORIGIN_LOCK_SECRET`) — behaviour-neutral; the bundler
   keeps working on the `run.app` URL while gaining the nginx ingress:
   ```sh
   gcloud run services replace services/alto-bundler/deploy/service.yaml --region us-central1
   ```
4. **Cloudflare (dashboard — needs CF access; no API creds in this repo):**
   - Add `bundler` CNAME → the Cloud Run service (or map the custom domain:
     `gcloud run domain-mappings create --service fairwins-alto-bundler --domain bundler.fairwins.app --region us-central1`).
   - Confirm the existing zone-wide Transform Rule injecting `X-Origin-Auth: <origin-lock-secret>`
     covers `bundler.fairwins.app` (it is scoped to `*.fairwins.app`, so it should already apply —
     verify with `curl -sI https://bundler.fairwins.app/healthz`).
5. **Arm the lock:** add the `ORIGIN_LOCK_SECRET` secret ref (already in `service.yaml`) and redeploy.
   Verify: a request **without** the header now 403s, a Cloudflare-proxied request 200s.
   ```sh
   curl -sI https://bundler.fairwins.app/healthz          # 200 (health is exempt)
   curl -s -o /dev/null -w '%{http_code}\n' https://fairwins-alto-bundler-<hash>.run.app/   # 403 (no CF header)
   ```
6. **Point the SPA at the edge host:** set `VITE_BUNDLER_URLS_POLYGON=https://bundler.fairwins.app` in
   `cloudbuild.yaml` and redeploy the SPA. The SPA CSP already allows both `bundler.fairwins.app` and the
   transitional `run.app` host (`frontend/nginx.conf*` connect-src), so no CSP change is needed.

## Rollback

Re-`replace` with the lock OFF (drop `ORIGIN_LOCK_SECRET`) to reopen instantly, or revert the SPA
`VITE_BUNDLER_URLS_POLYGON` to the `run.app` URL. The nginx sidecar adds no state; alto's executor
nonce continuity is preserved by `minScale: 1`.

## Also monitor

Add the alto **executor gas wallet** to the same balance/runway monitoring as the relayer gas wallets
(spec 036) — a drained executor silently fails every UserOp. The address is `ALTO_EXECUTOR_PRIVATE_KEYS`'
account; export its balance alongside the `GAS_WALLET_*` runway metrics.
