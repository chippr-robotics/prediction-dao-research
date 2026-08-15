# Cloudflare edge configuration (Spec 007 — Compliance & Legal Gating)

> **⚠ NO LONGER THE SOURCE OF TRUTH (spec 087).** The geo gate and the origin lock are declared in
> `infra/terraform/modules/cloudflare-zone` and applied from `infra/terraform/environments/prod`.
> The documents here are now **operational reference**: they explain what each rule does and why it
> is shaped the way it is, which the Terraform carries forward as comments.
>
> Both rulesets are **authoritative for their Cloudflare phase** — an apply replaces the entire rule
> list for that phase, so a rule added through the dashboard and not declared in Terraform is
> **deleted on the next apply**. If you add one during an incident, declare it in the same hour.
>
> Changing the deny set is a compliance decision, not a config tweak; the module is under CODEOWNERS.

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

> These runbooks **have been** promoted to IaC (`cloudflare_ruleset`, spec 087). They are retained
> as the record of intent behind each rule; the applied configuration lives in Terraform.

## Tenant domains (spec 072)

Each white-label tenant instance is its own origin (one Cloud Run service per tenant)
behind its own domain(s) from `tenants/<id>/manifest.json`. Per tenant domain:

- DNS routes ONLY to that tenant's service — never a shared/wildcard route. A domain no
  manifest claims must not resolve to any tenant's instance (unknown domains land on
  Cloudflare's default response, not another tenant's brand).
- The geo gate and origin lock apply per zone/domain exactly as documented above, with a
  per-instance `ORIGIN_LOCK_SECRET` (secrets are never shared across tenants).
- Domain uniqueness across manifests is validator-enforced (`npm run tenants:validate`);
  edge config must mirror it — one domain, one tenant, one origin.

See `docs/runbooks/tenant-operations.md` for the full launch procedure.
