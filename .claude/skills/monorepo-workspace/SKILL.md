---
name: monorepo-workspace
description: Work with this repo's npm workspaces — add or change a dependency, add a workspace member or shared package, fix a broken install, or recover the lockfile. Use whenever npm install/ci misbehaves, a Vite build dies with "Cannot find module @rollup/rollup-linux-x64-gnu", a package cannot be resolved, you are adding a package under packages/, or you need to know which install command is safe. Covers the traps that have actually bitten this repo, not generic npm advice.
---

# Working in the FairWins monorepo (spec 075)

One root lockfile, 8 workspace members. Everything below was learned by it going wrong.

## Members — use the REAL names

`--workspace` takes the package `name`, not the directory. Guessing a scoped name fails with
`No workspaces found`.

| Directory | Package name |
|---|---|
| *(root)* | `prediction-dao-research` |
| `frontend` | `frontend` |
| `frontend/miniapps/token-mint` | `@fairwins/miniapp-token-mint` |
| `frontend/miniapps/clearpath` | `@fairwins/miniapp-clearpath` |
| `services/relay-gateway` | `fairwins-relay-gateway` |
| `subgraph` | `prediction-dao-research-subgraph` |
| `tools/miniapp-build` | `@fairwins/miniapp-build` |
| `packages/abi` | `@fairwins/abi` |
| `packages/intent-types` | `@fairwins/intent-types` |

`contracts/` is deliberately NOT a member — it is not an npm package, it is the root project's
single compilation unit. It cannot be split (see `specs/075-monorepo-workspaces/research.md` R2).

## RULE 1 — never recover with `npm install`

**npm/cli#4828**: an *incremental* `npm install` here silently drops optional platform binaries —
notably `@rollup/rollup-linux-x64-gnu` — from **both** `node_modules` and `package-lock.json`.
Every Vite build then dies with `Cannot find module @rollup/rollup-linux-x64-gnu`, including the
mini-app release path whose bytes are keccak-committed on-chain.

This happened **four separate times** during the spec-075 conversion.

Re-running `npm install` does **not** fix it: the lockfile is already wrong, so npm reports
"up to date" and changes nothing.

```bash
npm run deps:reinstall     # full re-resolve — the ONLY reliable recovery
```

Safe by construction: Solidity-source deps are exact-pinned (rule 2), so a re-resolve cannot move
compiled bytecode. After *any* dependency change, run `npm run check:deps` — it fails on a lockfile
missing the platform binary, so CI catches this instead of a developer.

## RULE 2 — anything that compiles into bytecode is pinned EXACTLY

A caret range on a package that contributes Solidity source makes deployed bytecode a function of
*when someone last resolved the lockfile*.

Not hypothetical: regenerating the lockfile floated `@chainlink/contracts` 1.3.0 → 1.5.0 and
**changed `ChainlinkFunctionsOracleAdapter`'s compiled bytecode**. `@uma/core` was drifting the same
way. Only the byte-diff gate caught it.

Exact-pinned today: `@openzeppelin/contracts`, `@openzeppelin/contracts-upgradeable`,
`@chainlink/contracts`, `@uma/core`, `@safe-global/safe-contracts`.

Adding a new `import "@vendor/..."` to a contract? Pin the version exactly **and** add it to
`SOLIDITY_SOURCE_PACKAGES` in `test/config/CompilerTargets.test.js`, which fails on a floating range.

## RULE 3 — a shared package must be resolvable by plain Node

`frontend/src` uses extensionless relative imports (Vite-resolved) — ~2,966 of them. The gateway is
plain Node ESM, which requires extensions. **That asymmetry is why the EIP-712 structs were
duplicated for so long: the gateway physically could not import the frontend's copy.**

Anything under `packages/` that both sides consume MUST:
- use **extensioned** relative imports (`./foo.js`, never `./foo`)
- declare an explicit `exports` map in its `package.json`
- have **zero** runtime dependencies where possible
- never import from `frontend/src`, `services/*/src`, or a Vite virtual module
  (`virtual:tenant` is the specific hazard — it is why frontend *config* is not extracted)

Verify before wiring consumers:
```bash
node -e 'import("./packages/<name>/src/index.js").then(m => console.log(Object.keys(m)))' --input-type=module
```

## Common operations

```bash
# add a dep to one workspace
npm pkg set 'dependencies.<pkg>'='^1.2.3' --prefix services/relay-gateway
npm run deps:reinstall

# run a workspace script
npm test  --workspace fairwins-relay-gateway
npm run build --workspace @fairwins/miniapp-token-mint

# scoped install (CI uses this so a service doesn't install the ~3000-package superset)
npm ci --workspace fairwins-relay-gateway --include-workspace-root=false
```

### Adding a workspace member
1. Create its `package.json` with a real `name` and `version`.
2. Add its glob to root `workspaces` (nested globs work — `frontend/miniapps/*` needs no moves).
3. Declare it in every consumer's manifest (`"*"` for workspace-internal).
4. `npm run deps:reinstall`, then `npm run check:deps`.
5. If it is on-chain-committed (a mini-app), run the byte gate — see the `monorepo-verify` skill.

## Gotchas that cost real time

- **A child workspace gets NO `node_modules/.bin`.** Everything hoists to the root. Two scripts
  hardcoded `frontend/node_modules/.bin/vite` and broke on day one
  (`scripts/miniapps/publish.js`, `frontend/src/test/miniapps/fixtures/regenerate.mjs`).
- **Every member is symlinked into root `node_modules` under its name**, so
  `import '@fairwins/miniapp-token-mint'` is newly resolvable from `frontend/src`. That is a
  boundary leak; `packageBoundary.test.js` checks it.
- **Workspaces do NOT enforce one version.** Conflicting ranges install *both*, silently. `npm run
  check:deps` is what enforces it.
- **Never add a bare root `overrides` for `ethers`.** The tree carries ethers 5.8.0 ×9 and 4.0.49 ×2
  for `@uma/core`, `@chainlink/contracts`, `@across-protocol/contracts`. An unscoped override forces
  an incompatible major onto them and breaks the install. Scope per-package, as the existing
  `@safe-global` override does.
- **Manifests do not enforce module boundaries.** Relative imports never consult `package.json`, and
  workspaces hoist bare specifiers. Enforcement is `packageBoundary.test.js` plus lint.
- **`npm run build` in `frontend/` fails locally** on `VITE_PINATA_JWT` in `.env`. That is a
  deliberate security guard, not a break. Use `npx vite build --mode development` to check bundling.
