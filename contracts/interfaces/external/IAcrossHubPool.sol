// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IAcrossHubPool
/// @notice Minimal local view of Across Protocol's HubPool — the bridge-liquidity venue.
///         Ethereum mainnet ONLY: the HubPool is an L1 contract by design, which is why
///         bridge-liquidity supply is Ethereum-only while trading liquidity spans every Uniswap
///         network (spec 067 research R8).
///
/// @dev THERE IS NO `recipient` PARAMETER ON `addLiquidity`, AND THAT IS WHY BRIDGE-LIQUIDITY
///      SUPPLY IS FEE-FREE IN v1.
///
///      LP tokens are minted to `msg.sender`. A fee-skimming wrapper would therefore receive the LP
///      position itself, making FairWins the custodian of a position the member could then never
///      exit via `removeLiquidity` — violating FR-021 (always exitable) and FR-023 (non-custodial).
///
///      This is the same situation spec 066 already ruled on for delegated staking: a fee is charged
///      only where it can be charged atomically WITHOUT taking custody. So `LiquidityRouter` governs
///      these pools' curation and listing state but is deliberately NOT in their deposit path —
///      members call `addLiquidity`/`removeLiquidity` directly from their own wallet. No
///      `liquidity.bridge_lp` fee service is registered, because a settable rate that silently does
///      nothing is a worse admin surface than none at all.
///
///      See `specs/067-bridge-pool-liquidity/research.md` R3.
interface IAcrossHubPool {
    /// @notice Supply `l1TokenAmount` of `l1Token` and receive LP tokens. LP tokens go to
    ///         `msg.sender` — there is no recipient argument. Called directly by the member.
    function addLiquidity(address l1Token, uint256 l1TokenAmount) external payable;

    /// @notice Burn `lpTokenAmount` LP tokens and redeem the underlying plus accrued fees.
    ///         Called directly by the member; never routed through a FairWins contract.
    function removeLiquidity(address l1Token, uint256 lpTokenAmount, bool sendEth) external;

    /// @notice Current LP-token exchange rate for `l1Token`. NOT a view — it accrues fees before
    ///         returning, so reads must use a static call.
    function exchangeRateCurrent(address l1Token) external returns (uint256);

    /// @notice Current utilization of `l1Token`'s pool. NOT a view, for the same reason.
    function liquidityUtilizationCurrent(address l1Token) external returns (uint256);
}
