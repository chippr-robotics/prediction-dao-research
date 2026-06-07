# Cloudflare origin lock — secret header (Spec 007: FR-007/FR-008)

Goal: the Cloud Run origin serves only requests that came **through Cloudflare**, so nobody
can hit the origin directly and bypass the geo gate. A bare Cloudflare-egress-IP allowlist
is **insufficient** (those IPs are shared across all Cloudflare tenants and could be used to
spoof `CF-IPCountry`). We authenticate the edge with a high-entropy shared secret header.

## 1. Secret (Secret Manager → Cloud Run env, like the Pinata JWT)

- Generate: `openssl rand -hex 32`.
- Store in GCP Secret Manager, e.g. secret name `origin-lock-secret`.
- Expose to the Cloud Run service as env var **`ORIGIN_LOCK_SECRET`** (Cloud Run → Edit &
  deploy → Variables & Secrets → reference the secret). The container entrypoint then
  enables enforcement automatically (`ORIGIN_LOCK_ENABLED=1`).
- Optionally wire it declaratively in `cloudbuild.yaml`'s deploy step once the secret exists:

  ```
  - '--update-secrets'
  - 'ORIGIN_LOCK_SECRET=origin-lock-secret:latest'
  ```

  (Left out of `cloudbuild.yaml` by default so deploys don't fail before the secret is created.)

## 2. Cloudflare Transform Rule (inject the header)

Rules → Transform Rules → **Modify Request Header** → When incoming requests match: *All
incoming requests* → **Set static**:

- Header name: `X-Origin-Auth`
- Value: the same secret value stored above.

(Up to 30 headers per rule; rotate the secret periodically — update Secret Manager and the
Transform Rule together.)

## 3. Enforcement (already implemented in this repo)

`frontend/nginx.conf.template` maps `${ORIGIN_LOCK_ENABLED}:$http_x_origin_auth` to
`$origin_denied` and returns **403** on mismatch in every served location; `/healthz` is
exempt for probes. `docker-entrypoint.sh` sets `ORIGIN_LOCK_ENABLED=1` only when the secret
is present (so dev/local stay open). The secret is never logged.

## 4. Verify (SC-002 / SC-012)

- [ ] Direct request to the `*.run.app` origin URL **without** `X-Origin-Auth` → 403.
- [ ] Direct request with a wrong `X-Origin-Auth` → 403.
- [ ] Request through `fairwins.app` (Cloudflare injects the header) → 200.
- [ ] `GET /healthz` → 200 regardless (probe exemption).

(Runtime-verified locally during implementation: no-header→403, wrong→403, correct→200,
healthz→200; disabled state allows all.)

## Future hardening (outside the current footprint — documented only)

Cloud Run ingress `internal-and-cloud-load-balancing` + a Global External ALB with
**frontend mTLS** (Certificate Manager trust config) validating Cloudflare Authenticated
Origin Pulls is the strongest cryptographic origin lock, but it adds an ALB + Cloud Armor
(new infra) and is therefore out of scope for v1.
