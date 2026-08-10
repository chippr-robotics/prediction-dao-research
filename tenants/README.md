# Tenant manifests (spec 072)

One directory per tenant; `tenants/<tenant-id>/manifest.json` is the **single source of
truth** for that tenant's identity, settings, and contract set. The default tenant is
`fairwins` — its manifest reproduces the FairWins product exactly, and a build with no
`VITE_TENANT_ID` set uses it.

- Schema: [`manifest.schema.json`](./manifest.schema.json) (structure) +
  `scripts/tenants/validate-tenant-manifest.js` (cross-manifest rules). Run
  `npm run tenants:validate` — CI gates on it.
- Feature catalog: [`features.json`](./features.json). A manifest may only enable listed
  features; an absent feature is absent from the tenant's nav/routes.
- Consumers: `frontend/src/config/tenant.js` (build-time, via `VITE_TENANT_ID`),
  deploy scripts (`TENANT_ID` env → tenant-salted CREATE2 + records under
  `deployments/tenants/<id>/`), gateway/subgraph provisioning, docs.

## Rules

1. **No secrets, ever.** Manifests are public config baked into client bundles.
2. **`id` is immutable once deployed** — CREATE2 salts derive from it; changing it after
   any deployment record exists would orphan the tenant's addresses. The validator
   enforces `id` == directory name.
3. **Domains are globally unique** across all manifests; the validator refuses collisions.
4. **`contractSet.mode`**:
   - `shared` — the tenant fronts the platform estate (`deployments/<network>-chain<id>-v2.json`).
     Cosmetic isolation only; operator-facing docs must disclose that asset isolation is
     not in effect (spec 072 FR-015).
   - `dedicated` — the tenant's own proxy instances, recorded at
     `deployments/tenants/<id>/<network>-chain<chainId>-v2.json` (same schema as the
     shared records). A dedicated tenant never falls back to shared addresses: absence is
     absence.
5. **Lifecycle** (`draft → live ⇄ suspended → retired`) changes are ordinary PRs — git
   history is the audit trail. Suspension never traps value: contracts don't know about
   suspension, and members keep the documented direct-claim path.
6. **Fees** are bps per spec-060 service id and must respect platform caps
   (`polymarket.taker` ≤ 100, `polymarket.maker` ≤ 50, others ≤ 250). On dedicated
   estates the same caps are enforced on-chain by the tenant's FeeRouter.

See `specs/072-white-label-tenants/` (spec, plan, research, data-model, quickstart) and
`docs/developer-guide/white-label-tenants.md`.
