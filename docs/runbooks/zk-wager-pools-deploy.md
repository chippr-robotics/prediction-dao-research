# Runbook: Deploying ZK-Wager Pools (spec 034)

How to add the **ZK-Wager Pools** factory (+ its immutable pool clone template) to a network that already has
the core stack deployed. This is a **targeted, append-only** deploy
(`scripts/deploy/deploy-zk-wager-pool-factory.js`): it reuses the network's recorded `sanctionsGuard` (and,
when enabled, `membershipManager`) and **appends** `zkWagerPoolFactory` / `zkWagerPoolFactoryImpl` /
`poolImpl` to the existing `deployments/<net>-chain<id>-v2.json` — it never touches the live UUPS proxies.

Background: [developer-guide/zk-wager-pools.md](../developer-guide/zk-wager-pools.md). The factory is a UUPS
proxy, so **changing its logic later is an in-place upgrade**, not a re-run of this script — see
[contract-upgrades.md](./contract-upgrades.md).

> **Why append-only?** `deploy.js` mints fresh proxies and would strand the existing deployment. Use this
> script to bring pools to a network where the rest of the stack already exists. Re-running it after
> `zkWagerPoolFactory` is recorded **aborts** by design.

## Prerequisites

- **Admin key** — mount the floppy keystore so the deployer/`UPGRADER_ROLE` admin can sign:
  ```bash
  npm run floppy:mount
  ```
  Falls back to `.env` `PRIVATE_KEY` only when the floppy is not mounted.
- **RPC + gas** — a working, **post-Spiral** RPC for the target network (pre-upgrade ETC/Mordor nodes lack
  PUSH0 and will fail the deploy). Fund the deployer with native gas. Pin gas where needed, e.g.
  `GAS_PRICE_WEI=30000000000` on Amoy (25 gwei floor) or `100000000000` on Mordor.
- **Existing deployment record** — `deployments/<net>-chain<id>-v2.json` must already exist with a
  `sanctionsGuard` (the script aborts otherwise; pools require sanctions screening, FR-021a).
- **`GRAPH_DEPLOY`** — the Graph Studio **deploy** key (in `.env`; this is the deploy key, NOT
  `GRAPH_API_KEY` which is the query key) for the subgraph publish step.

## Pre-flight

```bash
npm run compile
npm run check:storage-layout      # the factory is UUPS — validate append-only storage (CI-gated)
npm test                          # contract suite incl. test/pools/* must pass
```

## Per-network Semaphore handling

The Semaphore V4 singleton address is resolved from `scripts/deploy/lib/zkPoolConfig.js`, overridable via
`ZKPOOL_SEMAPHORE_<chainId>`.

| Network (chainId) | Semaphore | Action |
|-------------------|-----------|--------|
| Polygon (137), Amoy (80002) | **canonical V4 singleton** (`0x8A1f…693D`, same CREATE2 address across chains) | Use as-is. **Verify the Amoy address on-chain before relying on it** — testnet deployments can lag/redeploy. |
| Mordor (63) / ETC (61) | **none canonical** — `selfDeploySemaphore: true`, `evmVersion: shanghai` | **Self-deploy** `SemaphoreVerifier` + `Semaphore` first, then set `ZKPOOL_SEMAPHORE_<chainId>` to the self-deployed address — the script aborts if it is unset. **DEFERRED**: ship Polygon/Amoy first (canonical Semaphore, no relayer); defer ETC. |

## Sanctions / membership wiring (compliance)

The script always wires the recorded `sanctionsGuard`. Membership and screening posture are controlled by env:

| Env | Effect |
|-----|--------|
| `ZKPOOL_ENABLE_MEMBERSHIP=1` | Wire the recorded `membershipManager` under `POOL_PARTICIPANT_ROLE`. |
| `ZKPOOL_MEMBERSHIP_MANAGER=0x…` | Wire an explicit membership manager (overrides the above). |
| (neither set) | Membership gate **OFF** (open participation) — default, so participation isn't bricked before `POOL_PARTICIPANT_ROLE` tiers are configured. |
| `ZKPOOL_SCREENING_REQUIRED=1\|0` | Force the posture. Default: **true on mainnets (137, 61)**, false on testnets. When true, both the sanctions guard AND a membership manager MUST be non-zero or `initialize` reverts. |

> **No `MembershipManager.setAuthorizedCaller` is required (resolves T037).** In v1, `POOL_PARTICIPANT_ROLE`
> membership is **gate-only / view-only**: the factory and pools call **only** the `view`
> `IMembershipManager.checkCanCreate(account, POOL_PARTICIPANT_ROLE)`. They do **not** call the
> `onlyAuthorized` hooks `recordCreate` / `recordClose`, so the factory does **not** need to be an authorized
> caller. **Do NOT** run `setAuthorizedCaller` for the pool factory. (Contrast with `WagerRegistry`, which
> records counters and therefore must be authorized.) The only membership prerequisite for enabling the gate
> on a value-bearing network is that `POOL_PARTICIPANT_ROLE` **tiers/limits are configured** on the
> membership manager — otherwise leave the gate off (`ZKPOOL_SCREENING_REQUIRED=0`) for an open launch.

## Deploy

```bash
# Amoy (testnet first) — open participation, screening off:
GAS_PRICE_WEI=30000000000 \
  npx hardhat run scripts/deploy/deploy-zk-wager-pool-factory.js --network amoy

# Polygon (mainnet) — screening required, membership gate on (POOL_PARTICIPANT_ROLE tiers MUST exist first):
GAS_PRICE_WEI=100000000000 ZKPOOL_ENABLE_MEMBERSHIP=1 \
  npx hardhat run scripts/deploy/deploy-zk-wager-pool-factory.js --network polygon
```

The script: resolves Semaphore; loads the existing record; deploys the immutable `ZKWagerPool` template
(deterministic; constructor disables initializers); deploys `ZKWagerPoolFactory` behind a UUPS proxy via
`deployProxy` (init: `[admin, poolImpl, semaphore, sanctionsGuard, membershipManager, screeningRequired]`);
and **appends** `zkWagerPoolFactory`, `zkWagerPoolFactoryImpl`, `poolImpl`, `zkWagerPoolSemaphore` to the
deployment record. It prints the addresses and the next steps.

## Verify

```bash
npm run verify:<network>          # verifies the factory implementation + the pool template (empty ctor args)
```

The explorer links the proxy to its verified implementation.

## Sync the frontend

The frontend reads the factory address from the generated sync artifacts (`getContractAddressForChain`),
never hardcoded:

```bash
npm run sync:frontend-contracts -- --network <name> --chainId <id>
# or the per-net alias, e.g.:  npm run sync:frontend-contracts:amoy
```

This emits the `zkWagerPoolFactory` address into the frontend config and the JSON ABIs the subgraph manifest
consumes.

## Publish the subgraph

Pools are indexed dynamically (static `ZKWagerPoolFactory` data source → `Pool` template, mirroring the
`TokenFactory` → `TokenInstance` precedent). Add the factory address + a recent, **non-genesis** startBlock to
`subgraph/networks.json` for the network first.

```bash
cd subgraph && npm install
npm --prefix .. run sync:frontend-contracts:<net>   # regenerate the JSON ABIs the manifest consumes
npm run codegen
npm run build                                        # default = polygon-amoy; other nets: graph build --network <matic|mordor>
                                                     # NOTE: --network rewrites subgraph.yaml in place; restore: git checkout -- subgraph.yaml
graph auth $GRAPH_DEPLOY                             # Studio DEPLOY key (.env GRAPH_DEPLOY) — never commit
graph deploy fairwins-amoy    --studio --network polygon-amoy -l <ver>   # Amoy (80002)
graph deploy fairwins-polygon --studio --network matic        -l <ver>   # Polygon mainnet (canonical net id 'matic', not 'polygon')
# Mordor (63) is not supported by Studio → no subgraph; the frontend uses the bounded RPC fallback there.
```

Set the resulting endpoint as `VITE_SUBGRAPH_URL` (per network) in the frontend `.env`.

## Post-deploy checks

- The deployment record has `zkWagerPoolFactory` (proxy), `zkWagerPoolFactoryImpl`, `poolImpl`, and
  `zkWagerPoolSemaphore`.
- `createPool` works for a screened wallet and a pool is reachable by its 4-word phrase
  (`poolByPhrase` / `phraseOfPool`).
- On a value-bearing network: `screeningRequired == true`, `sanctionsGuard` and (if the gate is on)
  `membershipManager` are non-zero, and a sanctioned/non-member wallet is rejected at create/join.
- Confirm you did **not** grant the factory `MembershipManager.setAuthorizedCaller` (not needed in v1).

## Changing factory logic later

The factory is a UUPS proxy — **never re-run this deploy script** to change its logic (it aborts once
recorded, and re-running would mint a new proxy). Ship logic changes as an **in-place upgrade**
(`upgradeProxy({ name: "ZKWagerPoolFactory", proxyAddress })`) per
[contract-upgrades.md](./contract-upgrades.md), keeping storage append-only. To swap the **pool template**
(immutable clone logic for *new* pools only), call `setTemplate(newPoolImpl)` as `DEFAULT_ADMIN_ROLE` after
deploying a new template; existing pools are unaffected (clones are immutable).
</content>
</invoke>
