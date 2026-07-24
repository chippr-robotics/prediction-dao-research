# Staking Operations (spec 066)

Operator guide for the on-chain **StakingRouter** — the per-network control surface for the
spec-065 staking service. It governs provider addresses, the curated validator allowlist, and a
per-network **emergency pause**, and it charges the spec-060 platform fee on **liquid** staking
(routing it to the treasury). Delegated staking is **fee-free in v1** and stays a direct member call.

> The staking **fee rate** is NOT set here. It lives on the spec-060 `FeeRouter` (services
> `stake.lido` / `stake.polygon`) and is edited from the AdminPanel **Fees** tab by a
> **Fee Administrator** (`FEE_ADMIN_ROLE`). The Staking tab shows the live rate read-only.

## Roles (least privilege)

| Role | Grants | Held by |
|---|---|---|
| `STAKING_ADMIN_ROLE` | provider addresses + validator allowlist | multisig (Safe) |
| `GUARDIAN_ROLE` | emergency `pause()` / `unpause()` | multisig (Safe) |
| `FEE_ADMIN_ROLE` (spec 060) | the `stake.lido` / `stake.polygon` rate | multisig (Safe) |
| `UPGRADER_ROLE` / `DEFAULT_ADMIN_ROLE` (UUPSManaged) | upgrades / role admin | multisig (Safe) |

There is **no on-chain timelock** (FR-018): the emergency pause is instant; config changes rely on
multi-party approval. After deploy, transfer all roles from the deployer EOA to the multisig and
renounce the deployer (the deploy script prints an ADMIN HANDOFF reminder).

## Deploy & wire

Prerequisite: the spec-060 `FeeRouter` is deployed on the network with a treasury set.

```
npx hardhat run scripts/deploy/deploy-staking-router.js --network <net>
npm run sync:frontend-contracts -- --network <net> --chainId <id>
```

The script deploys the UUPS proxy, records `stakingRouter` / `stakingRouterImpl` in
`deployments/<net>-chain<id>-v2.json`, and registers `stake.lido` + `stake.polygon` on the existing
FeeRouter (ConfigOnly, cap 250 bps, rate 0). Provider addresses default to the Ethereum-mainnet L1
contracts (override via `LIDO_STETH`/`LIDO_WSTETH`/`SPOL_*`/`POL_TOKEN_L1`/`POLYGON_STAKE_MANAGER`).
Logic changes ship as in-place UUPS upgrades (`scripts/deploy/lib/upgradeable.js#upgradeProxy`), never
a fresh redeploy; run `npm run check:storage-layout` first.

## 🚨 Emergency pause (do this FIRST in an incident)

A suspected provider exploit, a misbehaving validator, or a contract address in doubt — stop new
staking on the network immediately:

1. AdminPanel → **Staking** tab (as a `GUARDIAN`).
2. Click **Pause staking**. It is a single on-chain tx with **no timelock** and no dependency on any
   optional service (relay-gateway, etc.) — it works even when non-essential infra is degraded.
3. Within one member refresh (≤ 60 s) the member Stake area stops offering new stakes and shows the
   honest unavailable state; the option rows show a **Paused** badge.

**Members can always exit.** Pause blocks only new liquid stakes (`whenNotPaused` on the stake
entrypoints). Unstake, withdraw, and reward-claim never route through the router, so funds are never
trapped. Resolve the incident, then **Resume staking**. Both actions appear in the tab's history.

## Set / change the staking fee

1. AdminPanel → **Fees** tab (as a `FEE_ADMIN`).
2. Set the rate for **Stake — Lido** (`stake.lido`) or **Stake — Polygon liquid staking**
   (`stake.polygon`), in basis points, ≤ the 250 bps cap (the contract refuses more).
3. Members see the new rate on their next Stake confirmation as its own line
   ("FairWins platform fee … / You stake …"). A member is never charged above the rate they were
   shown (`maxFeeBps` ceiling). A rate of **0** shows no fee line and is byte-identical to fee-free
   staking. Delegated staking never shows a fee.

The fee is charged atomically inside `stakeLido` / `stakeSpol`: the router skims the fee to the
treasury and forwards the net to the provider in one tx (never custodial across transactions).

## Manage provider addresses

AdminPanel → **Staking** tab (as a `STAKING_ADMIN`). Each provider group shows its current value.
Enter the new address(es) and confirm — invalid or zero addresses are rejected before the wallet
prompt. The member flow resolves the new addresses at runtime; the change is in the tab's history.

- **Set Lido** — stETH + wstETH
- **Set sPOL** — controller + sPOL token
- **Set Polygon** — POL token + StakeManager (delegated config)
- **Set FeeRouter** — the FeeRouter reference the router reads the rate/treasury from

## Curate the validator allowlist

AdminPanel → **Staking** tab (as a `STAKING_ADMIN`). The current on-chain allowlist is listed with a
**Remove** action; **Add validator share** appends a new one (duplicates and zero/absent entries are
rejected by the contract). Removing a validator stops it being offered for **new** delegations
immediately; members already delegated to it keep the position and can still unstake/withdraw.

## Audit history

The Staking tab renders the router's setter + pause events (newest first) with actor and time, plus a
Blockscout link. Fee-rate changes are in the **Fees** tab history (`FeeBpsChanged`).

## Safe fallback

On a network with **no** StakingRouter deployed, or when the router/fee read fails, the member app
falls back to the spec-065 behavior — fee-free, direct staking, availability as configured — and never
shows a broken or fee-guessing screen. A present-but-unreadable router blocks only the fee-bearing
path (never an assumed rate); exits remain available.

See also: `docs/developer-guide/staking-integration.md`, `docs/runbooks/fee-operations.md`,
`docs/runbooks/contract-upgrades.md`, `specs/066-staking-admin-controls/`.
