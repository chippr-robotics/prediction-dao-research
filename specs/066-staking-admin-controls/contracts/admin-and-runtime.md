# Contract: AdminPanel Staking tab + member runtime read (spec 066, frontend)

UI contracts for the operator control surface and the member app’s runtime read of the `StakingRouter`.
Mirrors `ProtocolConfigTab`/`FeesTab` and the spec-065 staking flows.

## AdminPanel "Staking" tab (`frontend/src/components/admin/StakingTab.jsx`)

Props injected by `AdminPanel`: `{ signer, chainId, provider, runTx, pendingTx, isAdmin, isStakingAdmin,
isGuardian }`. Resolve the contract: `getContractAddressForChain('stakingRouter', chainId)` — `undefined`
⇒ render the honest "staking controls not deployed on this network" empty state (like FeesTab’s no-router
state).

**Reads (memoized `new ethers.Contract(addr, STAKING_ROUTER_ABI, provider)`):** provider addresses, the
validator allowlist (`validatorCount`/`validatorAt`), `paused()`, and the current `stake.lido`/`stake.polygon` rate (via
`fetchFeeQuote`, shown read-only with a pointer to the Fees tab). A `safe(p)=p.catch(()=>undefined)` wrapper
keeps one missing getter from blanking the panel.

**Writes (via the shared `runTx(fn, msg).then(refresh)`), client-validated before send:**

| Control | Gate | Call |
|---|---|---|
| Update provider address | `isStakingAdmin` | `setLidoContracts` / `setSpolContracts` / `setPolygonContracts` / `setFeeRouter` (validate `ethers.isAddress` && non-zero) |
| Add / remove validator | `isStakingAdmin` | `addValidator(vs)` / `removeValidator(vs)` (validate address; the contract rejects dup/absent) |
| Pause / resume staking | `isGuardian` | `pause()` / `unpause()` |
| Fee rate | (read-only here) | edited in the Fees tab (`FEE_ADMIN`) — link out |

**History:** `queryFilter` the router’s setter/pause events (+ FeeRouter `FeeBpsChanged` for the rate),
newest-first table with a Blockscout fallback link — identical to FeesTab’s history.

## Tab registration (four coordinated edits)

1. `admin/adminNav.js`: add `staking` to `ADMIN_TAB_ICONS`; add an `isStakingAdmin` param + `(isAdmin ||
   isStakingAdmin) && item('staking','Staking')` in the Protocol Config group.
2. `AdminPanel.jsx`: `const isStakingAdmin = hasRole(ROLES.STAKING_ADMIN)`; pass it into
   `buildAdminNavGroups`; add the `STAKING_ADMIN` `ROLE_HASHES` entry + `roleHomeContract` branch →
   `stakingRouter`; add the `<option>` to the grantable-role select; render `{activeTab==='staking' &&
   (isAdmin||isStakingAdmin) && <StakingTab … isGuardian={isGuardian} />}`.
3. `contexts/RoleContext.js`: add `ROLES.STAKING_ADMIN`, a `ROLE_INFO` entry, and append to `ADMIN_ROLES`.
4. On-chain: `STAKING_ADMIN_ROLE` exists + is granted on the `StakingRouter` (AccessControl).

## Member runtime read + fallback (`hooks/useStakingOptions.js`)

Resolve `getContractAddressForChain('stakingRouter', chainId)`:
- **present** → overlay the router’s provider addresses + validator allowlist + `paused` onto the options,
  and read the `stake.lido`/`stake.polygon` fee via `fetchFeeQuote`. When `paused`, the Stake area hides **new**-stake and
  shows the honest unavailable state (exits stay available).
- **absent/unreachable** → keep the spec-065 build-time constants verbatim (fee-free, direct staking,
  availability as configured). A present-but-unreadable router blocks only the fee-bearing path (never
  assume a lower rate), mirroring `fetchFeeQuote`.

## Member stake routing (`lib/staking/stakingActions.js` + `useStakingActions.js` + `StakeSheet.jsx`)

`buildStakeForOption` branches like `lib/earn/vaultActions.buildDepositCalls`:
- **fee applies + router available** → route through the router: Lido `stakeLido{value:net?gross}` (native,
  no approve leg) / sPOL approve-router + `stakeSpol(amount, maxFeeBps)`; delegated composes the fee-transfer
  + direct `buyVoucherPOL(net)` batch.
- **else** → the byte-identical spec-065 direct provider calls.

`useStakingActions.stake` threads the `feeQuote` (with `maxFeeBps`) into the ctx; `StakeSheet` discloses the
fee line and blocks on `feeBlocked` (fee-integration.md). The passkey/classic dual-rail via `useEarnSend` is
unchanged.
