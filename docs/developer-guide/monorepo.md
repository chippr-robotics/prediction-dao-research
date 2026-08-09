# The monorepo: workspaces, packages, and the task graph

Spec 075. One root lockfile, 9 workspace members, and a Turborepo task graph over the npm scripts
that already existed.

## Layout

| Directory | Package name | Kind |
|---|---|---|
| *(root)* | `prediction-dao-research` | root project + contracts |
| `frontend` | `frontend` | host app |
| `frontend/miniapps/token-mint` | `@fairwins/miniapp-token-mint` | on-chain-committed package |
| `frontend/miniapps/clearpath` | `@fairwins/miniapp-clearpath` | on-chain-committed package |
| `services/relay-gateway` | `fairwins-relay-gateway` | service |
| `subgraph` | `prediction-dao-research-subgraph` | indexer |
| `tools/miniapp-build` | `@fairwins/miniapp-build` | shared build preset |
| `packages/intent-types` | `@fairwins/intent-types` | shared EIP-712 structs + actions |
| `packages/abi` | `@fairwins/abi` | **generated** contract ABIs |

`contracts/` is deliberately **not** a member. It is not an npm package — it is the root project's
single compilation unit, and it cannot be split: `paths.sources` is one directory, `.solcover.js`
documents that excluding `contracts/test/` collapses `WagerRegistry` coverage to ~5%, and
`FACET_PAIRS` needs both registry facets compiled together.

## Day-to-day

```bash
npm install                 # ONE install covers every workspace
npm run deps:reinstall      # the ONLY reliable recovery — see "Traps" below
npm run check:deps          # version skew, phantom imports, platform binaries
npm run codegen:abis        # regenerate packages/abi from compiled artifacts
npm run check:abis          # fail if the committed ABIs are stale

npm test --workspace fairwins-relay-gateway
npm run build --workspace @fairwins/miniapp-token-mint
npm ci --workspace <name> --include-workspace-root=false   # scoped install (CI)
```

## The task graph

`turbo.json` declares inputs and outputs so unchanged work is skipped. Targets wrap existing npm
scripts; Turborepo does not replace them.

```bash
npx turbo run check:abis check:deps tenants:validate check:storage-layout
npx turbo run test --filter=fairwins-relay-gateway
npx turbo run build --filter=...[origin/main]     # only what the diff touches
```

Verified behaviour (measured, not assumed):

- a **content** change to a `.sol` moves `//#compile` and `//#check:abis` — `touch` alone does not,
  because Turborepo hashes content, not mtimes
- a docs-only change re-runs nothing
- `//#check:storage-layout` is **never cached** — it reads `.openzeppelin/` (produced only by real
  on-chain transactions, unregenerable), `deployments/`, and takes a lockfile on
  `cache/validations.json`. A safety gate that has already reported success while checking nothing
  must actually execute.
- `cache/**` is an **output** of `//#compile`, because `cache/validations.json` is an *input* to the
  storage-layout gate rather than a discardable artifact
- `//#test:coverage` is an independent root, not a dependent of `//#compile` — `.solcover.js` sets
  `configureYulOptimizer`, so a coverage run cannot share the artifact cache
- an **exported** environment variable listed in `globalEnv` moves the cache key

### Known limitation: `.env` is invisible to the cache key

`hardhat.config.js` runs `dotenv.config()` **inside** the task process, after Turborepo has already
computed the hash. `globalEnv` only covers variables exported in the caller's shell.

**Confirmed empirically**: editing `AMOY_RPC_URL` in `.env` left the `//#test` hash unchanged —
and that variable switches the default test chain from a clean 1337 to an Amoy fork. So
`//#test` cache hits are **not sound** in a tree with a `.env` that sets a build-relevant variable.

Until dotenv is moved out of config evaluation (or a `dotEnv` declaration is added), run
`npx turbo run test --force` when a `.env` value matters. This is stated rather than hidden because
an undeclared input in Turborepo produces a **wrong cache hit, not an error**.

### Outside the graph entirely

Cypress, Slither, Medusa, Manticore, Matchstick (Docker-only on this host), mkdocs,
cloudbuild/gcloud, and every deploy/verify path. Roughly half the pipeline's toolchains are not npm
scripts. Any claim of "one task graph for the repo" would be false.

`deploy-contracts.yml` also has **no test dependency**, so the graph must not become the sole merge
gate while a commit can still deploy without its tests having run.

## Traps

**Never recover an install with `npm install`.** npm/cli#4828 silently drops
`@rollup/rollup-linux-x64-gnu` from *both* `node_modules` and `package-lock.json` on an incremental
install; every Vite build then dies, including the mini-app release path whose bytes are
keccak-committed on-chain. It happened four times during this conversion. Re-running `npm install`
cannot fix it — the lockfile is already wrong, so npm reports "up to date". Use
`npm run deps:reinstall`. `npm run check:deps` fails on a lockfile missing the binary.

**Anything contributing Solidity source is pinned exactly.** A caret range makes deployed bytecode a
function of when the lockfile was last resolved. `@chainlink/contracts` floating 1.3.0 → 1.5.0
changed `ChainlinkFunctionsOracleAdapter`'s bytecode; only the byte-diff gate caught it.
`test/config/CompilerTargets.test.js` fails on a floating range.

**A shared package must be resolvable by plain Node** — extensioned imports and an explicit
`exports` map. `frontend/src` has ~2,966 extensionless imports while the gateway is Node ESM, and
that asymmetry is precisely why the EIP-712 structs stayed duplicated for so long.

**A child workspace has no `node_modules/.bin`.** Everything hoists to the root.

**Every member is symlinked into the root `node_modules` by name**, so a package became importable
by name from the host. `packageBoundary.test.js` rejects that direction.

See also the `monorepo-workspace` and `monorepo-verify` skills.
