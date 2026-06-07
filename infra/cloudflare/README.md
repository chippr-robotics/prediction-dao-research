# Cloudflare edge configuration (Spec 007 — Compliance & Legal Gating)

Edge-side configuration for the geo gate and the nginx origin lock. **No new GCP infra**
(no load balancer / Cloud Armor) — these are Cloudflare zone settings on `fairwins.app`
(proxied / orange-cloud) consumed by the existing nginx on Cloud Run.

| File | Purpose | Spec |
|------|---------|------|
| [`waf-geo.md`](./waf-geo.md) | WAF custom rule: country gate → HTTP 451 | FR-001–FR-014, SC-001/003/013 |
| [`origin-lock.md`](./origin-lock.md) | Transform Rule: inject `X-Origin-Auth` secret header | FR-007/FR-008, SC-002/012 |

The origin lock is enforced in `frontend/nginx.conf.template` (verified by
`docker-entrypoint.sh` only when `ORIGIN_LOCK_SECRET` is set). The 451 body lives at
`frontend/public/451.html` (or as the Cloudflare custom response body).

> These runbooks can be promoted to IaC (Terraform `cloudflare_ruleset`) later; for now
> they are the source of truth for the manual/staged dashboard configuration.
