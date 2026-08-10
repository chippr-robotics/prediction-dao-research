# Quickstart: Launching a tenant

**Feature**: `072-white-label-tenants`

## Branding-only (shared estate) tenant

1. **Author the manifest** — copy `tenants/fairwins/manifest.json` to
   `tenants/<id>/manifest.json`; set `id`, identity, brand assets/theme tokens, domains,
   features; keep `contractSet.mode: "shared"`.
2. **Validate** — `npm run tenants:validate` (fails loudly on missing fields, domain
   collisions, over-cap fees, unresolved theme tokens).
3. **Build the instance** — `VITE_TENANT_ID=<id> npm run build` (from `frontend/`), or the
   Docker build with `--build-arg VITE_TENANT_ID=<id>` plus the tenant's
   `VITE_APP_URL`/relayer/subgraph args.
4. **Serve + bind domain** — deploy the image as its own service; bind the tenant domain
   at the edge per `infra/cloudflare/` (origin lock per instance).
5. **Verify** — the served app carries only the tenant's identity; value flows use the
   shared estate; the operator docs for the tenant state that asset isolation is not in
   effect (spec FR-015).

## Dedicated (isolated estate) tenant

1. Author + validate the manifest with `contractSet.mode: "dedicated"`.
2. **Deploy the estate** per enabled network:
   `TENANT_ID=<id> npx hardhat run scripts/deploy/deploy.js --network <network>`
   then the supplementary deployers the tenant's features need (fee router, pool factory,
   …). Records land in `deployments/tenants/<id>/<network>-chain<chainId>-v2.json`;
   addresses are deterministic under the tenant salt.
3. **Sync the frontend set** —
   `node scripts/utils/sync-frontend-contracts.js --tenant <id> --network <network> --chainId <chainId>`
   → `frontend/src/config/tenants/<id>.contracts.js`.
4. (Optional) **Gateway**: run a relay-gateway instance with `TENANT_ID=<id>` so its
   startup allowlist loads the tenant's records; per-tenant quotas/killswitch/paymaster.
   (Optional) **Subgraph**: deploy with the tenant's addresses; record URLs in the
   manifest.
5. Build, serve, bind domain as above.
6. **Prove isolation** — `npm test -- test/integration/tenant-isolation.test.js` covers
   the two-tenant probes (membership, admin authority, fee accrual, gateway refusal).

## Default tenant / regression

`npm run build` with no `VITE_TENANT_ID` is the FairWins product, byte-identical in
behavior; existing suites must pass unmodified.

## Lifecycle

Edit `lifecycle` in the manifest via PR (auditable): `draft → live ⇄ suspended → retired`.
Only a `live` tenant can produce a **production** build (the tenant-branding Vite plugin
refuses otherwise); preview a `draft` tenant with a non-production mode, e.g.
`VITE_TENANT_ID=<id> npx vite build --mode staging`.
Suspension serves the unavailability shell and never traps value — members retain the
documented direct-contract claim path.
