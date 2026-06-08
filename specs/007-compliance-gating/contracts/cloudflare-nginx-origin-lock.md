# Contract: Cloudflare geo gate + nginx origin lock (no new infra)

Edge configuration + the existing nginx — no load balancer, Cloud Armor, or backend
(FR-001…FR-013, FR-007/FR-008). All within the current footprint.

## Cloudflare (zone: fairwins.app, proxied/orange-cloud)

### Geo gate — WAF custom rule
- Field: `ip.src.country` (ISO 3166-1 alpha-2).
- **Allowlist posture (default)**: `not (ip.src.country in {<ALLOWED…>})` → **Block**.
  Denylist posture available: `(ip.src.country in {<BLOCKED…>})` → Block.
- The deny set ALWAYS includes the locked OFAC bucket (`CU IR KP SY` + Crimea/Donetsk/
  Luhansk handling) and `US` (current posture) regardless of posture (FR-003/FR-004).
- Block action → **custom response 451** (Pro+; status 400-499; body ≤2KB; HTML/JSON) with a
  human-readable "Unavailable For Legal Reasons" explanation (FR-006). Free-plan fallback:
  default block page (no custom 451 body).
- Staging: validate new rules in **Log/observe** mode before Block (FR-011).
- `XX` (unknown country) and any rule-evaluation failure ⇒ Block under allowlist (FR-012).

### Origin lock — Transform Rule (request header)
- "Set static": add `X-Origin-Auth: <HIGH_ENTROPY_SECRET>` on every request to the origin.
- Secret stored in Secret Manager → Cloud Run env → nginx (same pattern as the Pinata JWT);
  rotated periodically. A bare CF-IP allowlist is **not** sufficient (shared CF IPs).

### Evidence headers
- `CF-IPCountry` (country-of-record) and `CF-Connecting-IP` (client IP) forwarded to origin.

## nginx (`frontend/nginx.conf.template`, existing container)

- **Verify** `$http_x_origin_auth` equals the configured secret; if missing/wrong →
  `return 403;` (origin lock — FR-007/FR-008). Place before serving the SPA and before the
  Pinata proxy.
- **Forward** `CF-IPCountry` / `CF-Connecting-IP` into the access log so the Cloud Run
  request logs are the geo/IP evidence tier (FR-009/FR-051). Do not log the secret (FR-052).
- Serve `/451.html` content for the Cloudflare custom response if hosted at origin (optional;
  Cloudflare can serve it directly).

## Cloud Run
- Ingress stays as today (no LB added). The nginx secret-header check is the origin lock;
  direct `run.app` hits without the secret get 403.
- **Future hardening (out of footprint, documented only)**: ingress
  `internal-and-cloud-load-balancing` + Global External ALB + frontend mTLS / Authenticated
  Origin Pulls for cryptographic edge auth (R4).

## Acceptance (maps to SCs)
- Blocked-country request → 451 at Cloudflare, no origin hit (SC-001/SC-003).
- Direct origin request without `X-Origin-Auth` → 403 (SC-002/SC-012).
- Edge rule-eval failure / unknown country → denied (SC-013).
