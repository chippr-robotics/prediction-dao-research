# Contract: Target Graph

**Feature**: 074-monorepo-workspaces | **Phase 1 design artifact**

Every target wraps an npm script that **already exists**. Turborepo declares the graph; it does
not replace the commands. Ships **last** (Phase 6), after the pipeline is honest.

> **The governing rule**: Turborepo does not sandbox. An input you fail to declare produces a
> **wrong cache hit, not an error**. Every `inputs` list below is a safety claim.

---

## Global configuration

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": [
    "package-lock.json",
    "hardhat.config.js",     // not a pure function of the tree — see limitations
    ".solcover.js",
    "coverage-threshold-policy.json"
  ],
  "globalEnv": [
    "AMOY_RPC_URL", "AMOY_FORK_BLOCK",
    "MAINNET_RPC_URL", "OPTIMISM_RPC_URL", "BASE_RPC_URL", "ARBITRUM_RPC_URL", "POLYGON_RPC_URL",
    "FORCE_SOLCJS", "REPORT_GAS", "COVERAGE", "TZ",
    "VITE_TENANT_ID", "VITE_NETWORK_ID", "NODE_OPTIONS"
  ]
}
```

`remappings.txt` is deliberately **absent** — it has zero references outside `node_modules` and is
dead config (research R5).

---

## Targets

| Target | Runs | dependsOn | inputs | outputs | cacheable |
|---|---|---|---|---|---|
| `//:compile` | `hardhat compile` | — | `contracts/**/*.sol`, `hardhat.config.js` | `artifacts/**`, **`cache/**`** | ✅ |
| `//:test` | `hardhat test` | `//:compile` | `test/**`, `contracts/**/*.sol`, `scripts/deploy/lib/**`, `scripts/coverage/lib/**`, `scripts/operations/seed-local.js`, **`services/relay-gateway/src/paymaster/build.js`** | — | ✅ |
| `//:coverage` | `npm run test:coverage` | — *(independent root)* | `contracts/**/*.sol`, `test/**`, `.solcover.js` | `coverage/**` | ✅ |
| `//:check-storage-layout` | `npm run check:storage-layout` | `//:compile` | `artifacts/build-info/**`, `.openzeppelin/**`, `deployments/**`, `cache/validations.json` | — | ❌ **never** |
| `//:tenants-validate` | `npm run tenants:validate` | — | `tenants/**`, `scripts/tenants/**` | — | ✅ |
| `@fairwins/abi#codegen` | `node scripts/codegen/emit-abis.js` | `//:compile` | `artifacts/build-info/**`, `scripts/codegen/**`, the contract manifest | `packages/abi/src/**`, `packages/abi/json/**` | ✅ |
| `@fairwins/abi#check` | `emit-abis.js --check` | `//:compile` | same as `codegen` + `packages/abi/**` | — | ✅ |
| `@fairwins/intent-types#test` | `vitest run` | — | `packages/intent-types/**` | — | ✅ |
| `frontend#lint` | `eslint .` | `^build` | `frontend/src/**`, `frontend/eslint.config.js` | — | ✅ |
| `frontend#test` | **sharded** — see below | `^build` | `frontend/src/**`, `frontend/vite.config.js`, **`frontend/vite-plugins/**`**, **`tenants/**`**, `packages/*/src/**` | — | ✅ |
| `frontend#build` | `vite build` | `^build` | `frontend/src/**`, `frontend/public/**`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/vite-plugins/**`, `tenants/**` | `frontend/dist/**` | ✅ |
| `@fairwins/miniapp-*#build` | `vite build` | `@fairwins/miniapp-build#build` | the package `src/**` + its `vite.config.js` | `dist/**` | ✅ |
| `fairwins-relay-gateway#test` | `vitest run` | `^build` | `services/relay-gateway/**`, `deployments/**`, `packages/intent-types/**` | — | ✅ |
| `prediction-dao-research-subgraph#codegen` | `graph codegen` | `@fairwins/abi#codegen` | `subgraph/subgraph.yaml`, `subgraph/schema.graphql`, `packages/abi/json/**` | `subgraph/generated/**` | ✅ |
| `prediction-dao-research-subgraph#build` | `graph build` | `#codegen` | `subgraph/**` | `subgraph/build/**` | ✅ |

### Non-obvious declarations, and why

- **`cache/**` is an OUTPUT of `//:compile`** *(T5)* — `cache/validations.json` (1.6 MB) is an
  **input** to the storage-layout gate, written by `@openzeppelin/hardhat-upgrades`. Treating it as
  discardable breaks the gate.
- **`//:check-storage-layout` is never cacheable** *(T4)* — it reads `.openzeppelin/` (produced
  only by real on-chain transactions, unregenerable), `deployments/`, and takes a proper-lockfile
  on `validations.json`. It runs in seconds. It has already reported success while checking
  nothing once; it must actually execute.
- **`//:coverage` is an independent root, not a dependent of `//:compile`** *(T6)* — `.solcover.js`
  sets `configureYulOptimizer`, so a coverage run cannot share the artifact cache.
- **`//:test` declares `services/relay-gateway/src/paymaster/build.js`** — `test/account/
  PaymasterHashCrosscheck.test.js:16` dynamically imports it. Without this, a change to the
  paymaster hash builder (the AA34 guard) would not invalidate the contract suite.
- **`frontend#test` declares `tenants/**` and `frontend/vite-plugins/**`** — `tenantBrandingPlugin()`
  is in `vite.config.js`'s `plugins`, which vitest loads, and the whole vitest configuration
  (jsdom, setupFiles, aliases) lives in that file. Omitting them yields a green cached result after
  a tenant-manifest edit.

### `frontend#test` must be sharded

Modelling it as one unfiltered `vitest run` would make `turbo run test --filter=frontend` the exact
invocation that OOMs in this environment, while the scoped run a developer actually uses is
invisible to the graph and never caches. *(T7, research R10)*

Adopt Vitest `projects`: a `node`-environment project for the ~150 pure-logic `lib/`/`util/`
suites, a `jsdom` project for component suites, with `NODE_OPTIONS=--max-old-space-size=4096` and
`TZ=UTC` set on the target (CI parity — some suites hard-code UTC datetime strings).

---

## CI integration

Replace `test.yml`'s zero-`needs:` fan-out with:

```
turbo run lint test build check --filter=...[origin/main]
```

**Constraint (FR-043)**: the graph must not become the *sole* merge gate while deploy paths run
outside it. `deploy-contracts.yml` has no test dependency today; Phase 6 does not add one, so a
commit can still deploy without its tests having run. That gap is named, not silently inherited.

---

## Known limitations — stated, not hidden (FR-042)

1. **`.env` is invisible to the cache key.** `hardhat.config.js:3` runs `dotenv.config()` *inside*
   the task process, after Turborepo computes the hash. `globalEnv` only covers variables already
   exported in the caller's shell. `AMOY_RPC_URL` in an untracked `.env` silently switches the
   default test chain from a clean 1337 to an Amoy fork with **no cache-key movement**. Mitigate
   with a `dotEnv` declaration, or move dotenv out of config evaluation, or accept and document
   that `//:test` cache hits are unsound in any tree with a `.env`.
2. **`hardhat.config.js` is not a pure function of the tree** beyond `.env`: it scans `process.argv`
   for `--network` to choose the block-explorer config *shape*, and shells out to `mountpoint` via
   the floppy-key loader on **every** command including plain `compile`.
3. **Outside the graph entirely**: Cypress, Slither, Medusa, Manticore, Matchstick (Docker-only on
   this host), mkdocs, cloudbuild/gcloud, and all deploy/verify operations. Roughly half the
   pipeline's toolchains are not npm scripts. Any claim of "one task graph for the repo" would be
   false.
4. **Local setup mutates declared inputs.** `npm run setup:local` writes tracked `deployments/`
   records and rewrites `frontend/src/config/contracts.js` in place — both declared inputs. The
   standard local flow therefore dirties the tree and invalidates three targets.
5. **No remote cache in this feature.** Turborepo's remote cache is content-addressed over *your*
   declared inputs and inherits every unsoundness above; `CLAUDE.md` also carries a no-backend rule.

## Rollout

Run with `--force` (caching disabled) for an observation period and confirm outcomes match the
pre-turbo pipeline for **100% of targets** (SC-016) before any cache is trusted. *(FR-041)*
