# Runbook: Tenant Operations

Operating white-label tenants (spec 072). Developer-facing architecture lives in
`docs/developer-guide/white-label-tenants.md`; this runbook is the operator's procedure
reference. Every step here is auditable: manifests and deployment records are
repo-tracked, so the PR history IS the tenant audit log (SC-005).

## Launch a branding-only (shared-estate) tenant

1. Author `tenants/<id>/manifest.json` (copy `tenants/example/`, set real values,
   `contractSet.mode: "shared"`, `lifecycle: "draft"`). **No secrets in manifests.**
2. `npm run tenants:validate` — fix everything it names.
3. Preview: `VITE_TENANT_ID=<id> npx vite build --mode staging` (a draft tenant cannot
   produce a production build — the lifecycle gate refuses).
4. Merge the manifest PR; flip `lifecycle` to `live` in a second PR when contracted.
5. Build the instance image: the standard `cloudbuild.yaml` pipeline with the tenant's
   substitutions — `VITE_TENANT_ID=<id>`, `VITE_APP_URL=https://<tenant-domain>`, and the
   tenant's relayer/subgraph URLs (or none). One image = one tenant = one Cloud Run
   service (`<service>-<tenant-id>`).
6. Bind the tenant domain at the edge (Cloudflare): DNS → the tenant's service, plus the
   origin-lock Transform Rule with that instance's `ORIGIN_LOCK_SECRET`
   (`infra/cloudflare/origin-lock.md`). Unbound domains must never route to any tenant's
   instance (spec 072 edge case) — do not add wildcard routes.
7. **Disclose to the tenant in writing that a shared-estate tenant has cosmetic isolation
   only** (FR-015): value flows use the platform's shared contracts and treasury.

## Provision a dedicated (isolated-estate) tenant

1. Manifest as above with `contractSet.mode: "dedicated"`; list not-yet-deployed chains
   in `contractSet.pendingChains` while `live` (honest absence, FR-008).
2. Per enabled network, deploy with the tenant salt (floppy-keystore workflow as usual):
   `TENANT_ID=<id> npx hardhat run scripts/deploy/deploy.js --network <network>`
   then the supplementary deployers the tenant's features need (`deploy-fee-router.js`,
   `deploy-wager-pool-factory.js`, …). Records land in
   `deployments/tenants/<id>/<network>-chain<chainId>-v2.json`; addresses are
   deterministic per tenant salt — a re-run reproduces them.
   **The tenant id is immutable once deployed** (salts derive from it).
3. Hand over / configure tenant admin keys: the deploy admin holds
   `DEFAULT_ADMIN_ROLE`/`FEE_ADMIN_ROLE` on the TENANT's contracts only. Fee caps are
   enforced on-chain by the tenant's own FeeRouter (spec 060 caps apply per instance).
4. Generate the frontend set:
   `node scripts/utils/sync-frontend-contracts.js --tenant <id> --network <network> --chainId <chainId>`
   → commit `frontend/src/config/tenants/<id>.contracts.json`. A live dedicated tenant
   without this file fails the build — that is the no-fallback guarantee working.
5. Optional per-tenant gasless rails: run a dedicated relay-gateway process with
   `TENANT_ID=<id>` (its FR-025 allowlist then only contains the tenant's addresses;
   quotas/killswitch/paymaster deposits are per-process = per-tenant). Optional subgraph:
   deploy with the tenant's addresses, record URLs in the manifest.
6. Build/serve/bind as in the shared flow.
7. Prove isolation before go-live:
   `npx hardhat test test/integration/tenant-isolation.test.js` and the gateway
   `test/tenant.test.js` suite must be green, and a manual spot-check on the tenant's
   instance must show only tenant contracts in use (SC-002 probes).

## Suspend / resume a tenant

- Flip `lifecycle` to `suspended` via PR; production builds are refused, and the served
  instance should be scaled to the unavailability shell.
- **A suspension never traps value** (FR-013): the contracts do not know about
  suspension. Members can always claim/settle directly against the tenant's contracts
  (addresses are public in `deployments/tenants/<id>/`); include those addresses and the
  ABI pointer in the suspension notice.
- Resume = flip back to `live` + redeploy the instance.

## Graduate shared → dedicated (FR-015)

1. Provision the dedicated estate (above) while the tenant stays live on shared.
2. Repoint the manifest: `contractSet.mode: "dedicated"` in one PR.
3. Rebuild/redeploy the instance. New activity opens on the dedicated estate.
4. Positions opened on the shared estate remain claimable at their original addresses —
   the old instance's contracts stay resolvable forever; communicate the cutover date and
   the direct-claim path for any stragglers.

## Retire a tenant

Flip `lifecycle` to `retired`, decommission the service and domain binding, keep the
manifest + deployment records in the repo permanently (the estate's addresses must stay
discoverable for direct claims).
