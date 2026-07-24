# Contract: StakingRouter (spec 066)

`contracts/staking/StakingRouter.sol` + `IStakingRouter.sol`. A per-network UUPS control surface + liquid
fee-and-forward router for the spec-065 staking service. **Value-bearing** (transiently custodies the stake
to skim the fee) → constitution I security review + Slither/Medusa + fork tests required.

## Inheritance & roles

```
contract StakingRouter is UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable {
  using EnumerableSet for EnumerableSet.AddressSet;
  bytes32 public constant STAKING_ADMIN_ROLE = keccak256("STAKING_ADMIN_ROLE"); // config
  bytes32 public constant GUARDIAN_ROLE      = keccak256("GUARDIAN_ROLE");       // emergency pause
  // UUPSManaged already provides DEFAULT_ADMIN_ROLE + UPGRADER_ROLE
}
```

`initialize(address admin, address feeRouter, LidoContracts, SpolContracts, PolygonContracts)`:
`__UUPSManaged_init(admin)` **first**, then `__ReentrancyGuard_init()`, `__Pausable_init()`; grant
`STAKING_ADMIN_ROLE` + `GUARDIAN_ROLE` to `admin` (in production these are held by a **multisig**, no
timelock — research R2b); store `feeRouter`, the per-provider service ids
`stakeLidoServiceId = keccak256("stake.lido")` / `stakeSpolServiceId = keccak256("stake.polygon")`, and the
provider addresses. Constructor calls `_disableInitializers()` (via UUPSManaged).

## Config setters — `onlyRole(STAKING_ADMIN_ROLE)`, each emits an event

| Method | Event | Guard |
|---|---|---|
| `setFeeRouter(address)` | `FeeRouterUpdated(old,new,actor)` | non-zero |
| `setLidoContracts(steth,wsteth)` | `LidoContractsUpdated(...)` | non-zero |
| `setSpolContracts(controller,token)` | `SpolContractsUpdated(...)` | non-zero |
| `setPolygonContracts(polToken,stakeManager)` | `PolygonContractsUpdated(...)` | non-zero |
| `addValidator(address validatorShare)` | `ValidatorAdded(vs,actor)` | not already present (`EnumerableSet.add` false ⇒ revert `AlreadyListed`) |
| `removeValidator(address validatorShare)` | `ValidatorRemoved(vs,actor)` | present (`remove` false ⇒ revert `NotListed`) |

Views: `validatorCount()`, `validatorAt(i)`, `isValidator(address)`, `feeRouter()`, provider getters.
Malformed/zero input reverts `ZeroAddress`.

## Emergency pause — `onlyRole(GUARDIAN_ROLE)`

`pause()` / `unpause()` (OZ `PausableUpgradeable`). `whenNotPaused` is applied to the **stake entrypoints
only** — never to any exit path (there are none here; members exit directly), so a pause blocks new liquid
stakes without trapping funds.

## Liquid fee-and-forward entrypoints — `nonReentrant whenNotPaused`

Both follow **checks → effects → interactions**, hold funds only within the call, and assert no residual at
the end. The fee is read live from the FeeRouter (R1) with a member consent ceiling.

```
// ETH → wstETH
function stakeLido(uint16 maxFeeBps) external payable nonReentrant whenNotPaused returns (uint256 wstOut) {
  uint256 gross = msg.value; require(gross > 0, ZeroAmount());
  (uint256 fee, uint256 net) = IFeeRouter(feeRouter).quoteFee(stakeLidoServiceId, gross);
  require(IFeeRouter(feeRouter).feeBps(stakeLidoServiceId) <= maxFeeBps, FeeAboveQuoted()); // consent ceiling
  address treasury = IFeeRouter(feeRouter).treasury();
  if (fee > 0 && treasury != address(0)) { (bool ok,) = treasury.call{value: fee}(""); require(ok); }
  else net = gross; // treasury unset ⇒ fee skipped, never lost (mirrors FeeRouter)
  ILido(lidoSteth).submit{value: net}(address(0));
  uint256 steth = IERC20(lidoSteth).balanceOf(address(this));
  IERC20(lidoSteth).forceApprove(lidoWsteth, steth);
  wstOut = IWstETH(lidoWsteth).wrap(steth);
  IERC20(lidoWsteth).safeTransfer(msg.sender, wstOut);
  IERC20(lidoSteth).forceApprove(lidoWsteth, 0);
  require(address(this).balance == 0, ResidualFunds());
  emit LiquidStaked(lidoWsteth, msg.sender, gross, fee, net, wstOut);
}

// POL → sPOL
function stakeSpol(uint256 amount, uint16 maxFeeBps) external nonReentrant whenNotPaused returns (uint256 spolOut) {
  require(amount > 0, ZeroAmount());
  IERC20(polToken).safeTransferFrom(msg.sender, address(this), amount);
  (uint256 fee, uint256 net) = IFeeRouter(feeRouter).quoteFee(stakeSpolServiceId, amount);
  require(IFeeRouter(feeRouter).feeBps(stakeSpolServiceId) <= maxFeeBps, FeeAboveQuoted());
  address treasury = IFeeRouter(feeRouter).treasury();
  if (fee > 0 && treasury != address(0)) IERC20(polToken).safeTransfer(treasury, fee); else net = amount;
  IERC20(polToken).forceApprove(spolController, net);
  spolOut = ISpol(spolController).buySPOL(net);
  IERC20(spolToken).safeTransfer(msg.sender, spolOut);
  IERC20(polToken).forceApprove(spolController, 0);
  require(IERC20(polToken).balanceOf(address(this)) == 0, ResidualFunds());
  emit LiquidStaked(spolToken, msg.sender, amount, fee, net, spolOut);
}
```

(Exact ABIs from the spec-065 provider research; `forceApprove`/reset mirror `depositToVaultWithFee`.)

## Delegated staking is intentionally NOT here

Polygon `buyVoucherPOL` binds the delegation to `msg.sender`; a router call would make the router the
delegator (custodial, un-exitable). The member calls `ValidatorShare` directly, and **delegated staking is
fee-free in v1** (clarified 2026-07-23 — no fee leg; research R2). The router still governs delegated
**config** (the validator allowlist + pause the member app honors).

## Storage discipline & upgrades

Append-only state above a trailing `uint256[N] private __gap`; never insert/reorder/remove; shrink the gap
by exactly the slots appended. `check:storage-layout` (CI-gating) validates upgrade safety via
`upgrades.validateUpgrade`. Ships as a fresh `deployProxy`; logic changes are in-place `upgradeProxy`.

## Security obligations (constitution I)

CEI + `nonReentrant` on both entrypoints; transient-only custody with a `ResidualFunds` assertion (no member
funds left after any tx — FR-016); `maxFeeBps` consent ceiling (`FeeAboveQuoted`); exact-amount approvals
reset to 0; provider/validator targets from curated config only; least-privilege UUPS upgrade gate; targets
EthTrust-SL L2+; Slither + Medusa clean; smart-contract security-agent review before merge; unit + **fork**
tests for the real submit/wrap/buySPOL legs.

### Security review (2026-07-23)

Smart-contract security-agent review completed — **no Critical/High findings; approved for integration**.
Fixes applied: **L1** — sweep stETH share-rounding dust to the member after `wrap` (no dust accrues in the
router); **L2** — the `FeeAboveQuoted` consent ceiling only bites when a fee is actually charged, so a
treasury-unset network (fee 0) never spuriously reverts a zero-fee stake. Added unit coverage: forced/donated
ETH cannot brick the relative residual invariant; zero-LST provider output reverts `ProviderCallFailed`.
**Accepted/documented (L3/Info):** `stakeSpol` fails **closed** for a non-standard `polToken`
(fee-on-transfer/rebasing) — the residual check reverts rather than mis-accounting (same assumption
`FeeRouter` documents); the treasury destination + consent ceiling are only as trustworthy as the
`STAKING_ADMIN` multisig that can `setFeeRouter` (ops-doc note). Slither + Medusa run in CI (whole-repo scan
covers `contracts/staking/`).
