// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title INonfungiblePositionManager
/// @notice Minimal local view of Uniswap V3's NonfungiblePositionManager — the calls
///         `LiquidityRouter` makes to mint a full-range position, plus the exit calls the MEMBER
///         makes directly against their own position NFT.
///
/// @dev `MintParams.recipient` is what makes a platform fee chargeable here but not on Across's
///      HubPool (see IAcrossHubPool): the router can pull both tokens, skim the fee, and mint the
///      position NFT straight to the member — atomic, and custody-free across transactions.
///
///      Exits (`decreaseLiquidity`, `collect`, `burn`) are declared here for interface completeness
///      and for tests, but the router NEVER calls them: the member owns the NFT and calls the
///      position manager directly, so a router pause, misconfiguration, or upgrade can never block a
///      member from getting out (FR-021/FR-024/FR-043) and no withdrawal can ever carry a platform
///      fee (FR-030) — there is no code path that could charge one.
///
/// @dev ⚠️ This contract is NOT at the same address on every chain. Base's position manager differs
///      from the address Ethereum, Polygon, Arbitrum and Optimism share. Always resolve it per
///      network from that chain's own deployment record (spec 067 research R4b).
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        /// @dev The position NFT owner. `LiquidityRouter` MUST set this to the member (`msg.sender`),
        ///      never to itself — otherwise the router owns the position and the member cannot exit.
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    /// @dev Member-called exit leg. Never called by `LiquidityRouter`.
    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    /// @dev Member-called exit leg. Never called by `LiquidityRouter`.
    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function ownerOf(uint256 tokenId) external view returns (address);
}
