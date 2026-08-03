# Contract: Workspace Layout

**Feature**: 075-monorepo-workspaces | **Phase 1 design artifact**

The declared shape of the workspace. Names are the **real** `name` fields measured from each
manifest — no renames occur in this feature (research R11).

---

## Root manifest changes

```jsonc
{
  "name": "prediction-dao-research",
  "private": true,                    // ADDED — currently absent; only 5 of 6 manifests are private
  "engines": { "node": ">=22.0.0" },  // ADDED — matches frontend; services declare >=20
  "workspaces": [
    "frontend",
    "frontend/miniapps/*",            // nested glob — VERIFIED accepted by npm 11.6.0
    "services/relay-gateway",
    "services/relayer",
    "subgraph",
    "tools/miniapp-build",
    "packages/*"                      // NEW — intent-types, abi
  ]
}
```

`contracts/` is deliberately **not** a member. It is not an npm package; it is the root project's
single compilation unit (research R2).

## Members

| Path | Real package name | Kind | Lockfile today |
|---|---|---|---|
| *(root)* | `prediction-dao-research` | root project + contracts | ✅ kept — becomes the only one |
| `frontend` | `frontend` | host app | ❌ deleted |
| `frontend/miniapps/token-mint` | *(new)* `@fairwins/miniapp-token-mint` | on-chain-committed package | — none, **no manifest at all** |
| `frontend/miniapps/clearpath` | *(new)* `@fairwins/miniapp-clearpath` | on-chain-committed package | — none, **no manifest at all** |
| `services/relay-gateway` | `fairwins-relay-gateway` | service | ❌ deleted |
| `services/relayer` | `fairwins-pool-relayer` | service | — none today (FR-014) |
| `subgraph` | `prediction-dao-research-subgraph` | indexer | ❌ deleted |
| `tools/miniapp-build` | `@fairwins/miniapp-build` | shared build preset | — none today |
| `packages/intent-types` | *(new)* `@fairwins/intent-types` | shared | n/a |
| `packages/abi` | *(new)* `@fairwins/abi` | shared, generated | n/a |

**Net**: 4 lockfiles + 2 unlocked units → **1 lockfile covering 9 members**. *(FR-013, SC-008)*

## Verified npm 11.6.0 behaviour

Measured in a scratch workspace, because all three change the design:

| Behaviour | Result | Design consequence |
|---|---|---|
| Nested glob `app/sub/*` | ✅ both members resolved | `frontend/miniapps/*` needs **no directory moves** |
| Child `node_modules/.bin` | **NONE** — all bins hoist to root | Every hardcoded child bin path breaks *(FR-018)* |
| Member symlinked into root `node_modules` by name | ✅ `@x/a -> ../../app/sub/a` | **New by-name boundary leak** *(FR-046)* |
| Conflicting ranges (`^7` vs `^6`) | exit 0, **both installed**, no warning | Workspaces do **not** enforce one version *(research R4)* |

## Version resolution

**Do not** add a bare root `overrides: { "ethers": ... }`. Measured: the root lockfile carries
`ethers` 5.8.0 **nine times** and 4.0.49 **twice** for `@uma/core`, `@chainlink/contracts`,
`@across-protocol/contracts`, `@gnosis.pm/zodiac`. An unscoped override forces an
API-incompatible major onto all of them.

Instead:

1. Align declared **ranges** — only 5 deps appear in >1 manifest and only `ethers` disagrees
   (root `^6.16.0`, frontend `^6.17.0`, gateway `^6.16.0` whose own lock already floated to
   6.17.0, relayer `^6.16.0` unlocked). A single lockfile dedupes them.
2. If a hard pin is ever needed, **scope it per-package**, exactly as the existing
   `overrides: { "@safe-global/safe-contracts": { "ethers": "$ethers" } }` already does.
3. Enforce with a dependency-version check in CI — workspaces make drift *visible and singular*,
   not impossible. *(FR-015)*

## Prerequisite commit (before the workspace change)

Drop four **unused** frontend dependencies — measured zero import sites in `frontend/src`:
`@uniswap/v3-sdk`, `jsbi`, `@walletconnect/ethereum-provider`, `@walletconnect/modal`.

`@uniswap/v3-sdk` is what drags `@openzeppelin/contracts@3.4.2-solc-0.7` into
`frontend/node_modules` against the root's exact 5.4.0. Under one hoisted tree the top-level OZ
slot becomes contested, and that is the one plausible route by which merging trees could change
which OpenZeppelin a Solidity import resolves to. Ships as its **own commit** so it is
independently revertible.

*(Correction carried from verification: `remappings.txt` is **not** the mechanism — it has zero
references outside `node_modules`. The hazard is hoisting.)*

## Call sites that break and must change in the same PR

| Site | Problem |
|---|---|
| `scripts/miniapps/publish.js:54` | hardcodes `<repo>/frontend/node_modules/.bin/vite` — **verified broken** under workspaces |
| `frontend/src/test/miniapps/fixtures/regenerate.mjs:60` | same hardcoded pattern — and this is the harness Phase 3's own byte gate depends on |
| 6 relative imports of `tools/miniapp-build` | become `@fairwins/miniapp-build` by name |
| root `lock:sync` script | `npm --prefix frontend install --package-lock-only` becomes incoherent |
| root `test:frontend`, `frontend` scripts | `npm --prefix frontend` / `cd frontend` still work but should route through the workspace |
| ~27 `npm ci` sites across 9 workflows | plus every `cache-dependency-path` pointing at a deleted lockfile |
| Service jobs | must use `npm ci --workspace <name> --include-workspace-root=false` so the gateway does not regress from ~299 to ~2,100 packages |
| 5 Dockerfiles | root, `frontend/Dockerfile` (already dead post-spec-072 — delete), `services/relay-gateway/Dockerfile:12-13`, `services/relayer/Dockerfile:7`, `subgraph/matchstick.Dockerfile` |
| `.dockerignore` | the root lockfile must be present in every service build context |
| Setup docs | `cd frontend && npm install` appears in 5 documents and becomes wrong *(FR-017)* |

## Hard gate before the subgraph lockfile is discarded

`subgraph/package-lock.json` is the only record of how `@graphprotocol/graph-cli@0.80.0` +
`graph-ts@0.35.1` + `matchstick-as@0.6.0` resolve, and graph-cli bundles its own
AssemblyScript/gluegun stack into a root tree that already carries five `ethers` majors plus
hardhat and typechain. **`graph codegen && graph build` must succeed under the merged tree before
that lockfile is deleted.** *(research R12.4)*
