# Data Model: Staking Fee Router, Admin Controls & Emergency Pause (spec 066)

Two layers: the on-chain `StakingRouter` storage (authoritative) and the client-side normalized shapes the
member app + admin tab consume. The fee **rate** is NOT stored here — it lives in the `FeeRouter`
(`stake.lido` / `stake.polygon`), read at use time.

## On-chain: StakingRouter storage (append-only, per network)

| Field | Type | Notes |
|---|---|---|
| roles | AccessControl | `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE` (UUPSManaged), `STAKING_ADMIN_ROLE` (config), `GUARDIAN_ROLE` (pause) |
| `feeRouter` | `address` | reference to the spec-060 FeeRouter (rate + treasury source of truth) |
| `stakeLidoServiceId` / `stakeSpolServiceId` | `bytes32` | `keccak256("stake.lido")` / `keccak256("stake.polygon")` — per-provider rate services read at stake time |
| `lidoSteth` / `lidoWsteth` | `address` | Lido liquid-staking contracts (this network) |
| `spolController` / `spolToken` | `address` | sPOL liquid-staking contracts |
| `polToken` / `polygonStakeManager` | `address` | POL token + delegation manager (delegated is member-direct; kept for config surface) |
| `validators` | `EnumerableSet.AddressSet` | curated ValidatorShare allowlist (add/remove/enumerate) |
| `paused` | (PausableUpgradeable) | per-network emergency pause; blocks liquid stake entrypoints |
| `__gap` | `uint256[N]` | trailing reserve for append-only upgrades |

**Setters (each `onlyRole(STAKING_ADMIN_ROLE)`, each emits an event):** `setFeeRouter`, `setLidoContracts`,
`setSpolContracts`, `setPolygonContracts`, `addValidator`, `removeValidator`. **Pause (`GUARDIAN_ROLE`):**
`pause()`, `unpause()`. Malformed/zero addresses and duplicate/absent validators revert with a typed error.

**Stake entrypoints (`nonReentrant whenNotPaused`), enforced fee-and-forward for LIQUID only:**

| Entrypoint | Flow |
|---|---|
| `stakeLido(uint16 maxFeeBps) payable → uint256 wstOut` | read `quoteFee(stake.lido, msg.value)`; require live ≤ `maxFeeBps` (else `FeeAboveQuoted`); send `fee`→`treasury()`; `Lido.submit{value: net}()`; wrap→wstETH; transfer wstETH to `msg.sender`; assert no residual |
| `stakeSpol(uint256 amount, uint16 maxFeeBps) → uint256 spolOut` | pull `amount` POL from member; `quoteFee(stake.polygon, amount)`/guard; `fee`→treasury; `buySPOL(net)`; transfer sPOL to member; assert no residual |

Reverts: `FeeAboveQuoted`, `ZeroAmount`, `ZeroAddress`, `Paused`, `ProviderCallFailed`, `ResidualFunds`.
Events: `LiquidStaked(provider, member, gross, fee, net, lstOut)` + the setter/pause events.

**Delegated staking is NOT an entrypoint here** — the member calls `ValidatorShare.buyVoucherPOL` directly
(non-custodial) and it is **fee-free in v1** (clarified 2026-07-23; see fee-integration.md).

## Client: StakingControlConfig (normalized from the router, per network)

| Field | Type | Source | Notes |
|---|---|---|---|
| `routerAddress` | address \| null | `getContractAddressForChain('stakingRouter', chainId)` | null ⇒ fall back to spec-065 constants |
| `providers` | `{ lido, spol, polygon }` addresses | router reads | overlays `config/staking.js` constants |
| `validators` | `address[]` | router `validators` set | overlays `CURATED_POLYGON_VALIDATORS` |
| `paused` | boolean | router `paused()` | true ⇒ hide new-stake (honest unavailable); exits unaffected |
| `stakingFeeBps` | `{ lido, polygon }` \| null | `fetchFeeQuote(stake.lido / stake.polygon)` | per-provider (liquid only); null/unavailable ⇒ fee-free; delegated always fee-free (v1) |
| `fetchedAt` | number | client clock | "as of" freshness |

Fallback contract: when `routerAddress == null` OR a read fails on a network that has a router, the app uses
the spec-065 build-time defaults (fee-free, direct staking, availability as configured) — never a broken or
fee-guessing screen (FR-009). A router present but unreadable **blocks the fee-bearing path** only, exactly
like `fetchFeeQuote` throwing when a router exists (never assume a lower rate).

## Client: StakeFeeQuote (reused from spec 060)

`fetchFeeQuote({ serviceId: FEE_SERVICES.STAKE_LIDO | STAKE_POLYGON, chainId, provider })` → `{ available,
bps, capBps, routerAddress }` (liquid options only). `splitFee(gross, bps) → { feeAmount, netAmount }`;
`bpsToPercent(bps)`. The StakeSheet discloses `feeAmount` + `netAmount` before signing and passes `bps` as
`maxFeeBps` (hard ceiling). Delegated options show no fee line (v1).

## Client: Staking Control Action (admin audit, from on-chain events)

Read via `queryFilter` on the StakingRouter (and the FeeRouter `FeeBpsChanged` for the rate): `{ type
(fee-change/pause/resume/address-change/validator-add/remove), network, field, before/after, actor,
timestamp, txHash }`. Rendered in the Staking tab history table (last 25, newest first), with a Blockscout
fallback link — mirroring the FeesTab history.

## Roles (frontend `ROLES` + on-chain)

| Role | Grants | Where checked |
|---|---|---|
| `STAKING_ADMIN` | provider addresses, validator allowlist | Staking tab config controls |
| `GUARDIAN` (existing) | per-network pause/resume | Staking tab pause controls |
| `FEE_ADMIN` (existing) | the `stake.lido` / `stake.polygon` fee rates | existing Fees tab (rate source of truth) |
| `ADMIN` (existing) | superset / portal entry | all |

## Deployment records (`deployments/<net>-chain<id>-v2.json`)

`contracts.stakingRouter` (proxy, frontend-consumed) + `contracts.stakingRouterImpl` (per-upgrade);
`stake.lido` + `stake.polygon` registered on the existing `contracts.feeRouter`. Synced to
`frontend/src/config/contracts.js` via the `stakingRouter` key.
