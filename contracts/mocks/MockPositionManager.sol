// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/external/INonfungiblePositionManager.sol";

/**
 * @title MockPositionManager
 * @notice Minimal stand-in for Uniswap V3's NonfungiblePositionManager so the spec-067
 *         LiquidityRouter's fee-and-mint path can be unit-tested without a fork. It records the
 *         `MintParams` it received verbatim — including `recipient`, the custody-critical field —
 *         and mints the position NFT to that recipient, so a test can prove the MEMBER owns the
 *         position and the router never does. NOT for production (contracts/mocks scope —
 *         constitution III).
 * @dev `consumeBps` models the real manager's partial consumption: Uniswap rarely spends both
 *      desired amounts exactly, and the unspent remainder is what the router must refund.
 *      The struct type is imported from the interface rather than redeclared so the calldata
 *      encoding the router produces is the encoding this mock decodes.
 *
 * @dev ── THE EXIT LEGS ARE MODELLED, AND THAT IS THE POINT ──────────────────────────────────────
 *      `positions`, `decreaseLiquidity` and `collect` are here because the member's way OUT of a
 *      position never touches `LiquidityRouter` — they call this contract directly, which is what
 *      makes "a router pause cannot trap a position" (FR-021/FR-024/FR-043) a testable claim rather
 *      than a design intention. The e2e pause flow drives a real withdrawal through them while the
 *      router is paused, so a change that quietly routed exits through FairWins would fail here.
 *      `ERC721Enumerable` is inherited for the same reason: the app discovers a member's positions
 *      with `balanceOf` + `tokenOfOwnerByIndex` (lib/liquidity/uniswapPositions.js) and against a
 *      plain ERC-721 a real position renders as no position at all.
 *
 *      Fee GROWTH is not modelled — `feeGrowthInside*LastX128` is always zero and `tokensOwed*`
 *      only ever holds principal released by `decreaseLiquidity`. Nothing here should be read as a
 *      model of Uniswap's accounting; it is a model of who is allowed to move the money.
 */
contract MockPositionManager is ERC721Enumerable {
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice The last `MintParams` this mock received, unmodified.
    INonfungiblePositionManager.MintParams public lastMint;

    uint256 public nextTokenId = 1;

    /// @notice Fraction of each desired amount actually pulled. 10_000 = spend both in full.
    uint16 public consumeBps = 10_000;

    /// @notice When set, `mint` returns zero liquidity — exercises the router's `MintFailed` guard.
    bool public zeroLiquidity;

    /**
     * @dev What this mock remembers per position. `amount0`/`amount1` are the assets still
     *      represented by `liquidity`, so a partial `decreaseLiquidity` releases its pro-rata share
     *      — a member withdrawing half gets half of what they put in, not a made-up number.
     */
    struct PositionState {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    mapping(uint256 => PositionState) private _positions;

    constructor() ERC721("Mock Uniswap V3 Position", "MOCK-POS") {}

    function setConsumeBps(uint16 consumeBps_) external {
        consumeBps = consumeBps_;
    }

    function setZeroLiquidity(bool zeroLiquidity_) external {
        zeroLiquidity = zeroLiquidity_;
    }

    /// @dev Pulls the consumed share of each leg from the caller (so a leftover approval or an
    ///      un-refunded remainder shows up as router balance in tests) and mints the NFT to
    ///      `params.recipient` — never to `msg.sender`, which is exactly the distinction the
    ///      custody assertions rely on. Slippage minimums are not modelled.
    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        lastMint = params;

        amount0 = (params.amount0Desired * consumeBps) / BPS_DENOMINATOR;
        amount1 = (params.amount1Desired * consumeBps) / BPS_DENOMINATOR;
        if (amount0 > 0) IERC20(params.token0).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(params.token1).transferFrom(msg.sender, address(this), amount1);

        tokenId = nextTokenId++;
        liquidity = zeroLiquidity ? 0 : uint128(amount0 + amount1);

        _positions[tokenId] = PositionState({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            amount0: amount0,
            amount1: amount1,
            tokensOwed0: 0,
            tokensOwed1: 0
        });

        _mint(params.recipient, tokenId);
    }

    /// @dev The tuple the app reads (lib/liquidity/uniswapPositions.js). Reverts on an unknown
    ///      token id, like the real manager — an unknown position is not an empty one.
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
        )
    {
        PositionState storage p = _positions[tokenId];
        require(p.token0 != address(0), "Invalid token ID");
        return (0, address(0), p.token0, p.token1, p.fee, p.tickLower, p.tickUpper, p.liquidity, 0, 0, p.tokensOwed0, p.tokensOwed1);
    }

    /**
     * @dev Releases a share of the position back to `tokensOwed*`, which `collect` then pays out.
     *      Gated on the CALLER owning (or being approved for) the NFT, like the real manager: a
     *      test that could exit somebody else's position would prove nothing about custody.
     */
    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(_isAuthorized(_ownerOf(params.tokenId), msg.sender, params.tokenId), "Not approved");
        require(block.timestamp <= params.deadline, "Transaction too old");
        PositionState storage p = _positions[params.tokenId];
        require(params.liquidity > 0 && params.liquidity <= p.liquidity, "Invalid liquidity");

        amount0 = (p.amount0 * params.liquidity) / p.liquidity;
        amount1 = (p.amount1 * params.liquidity) / p.liquidity;
        require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "Price slippage check");

        p.amount0 -= amount0;
        p.amount1 -= amount1;
        p.liquidity -= params.liquidity;
        p.tokensOwed0 += uint128(amount0);
        p.tokensOwed1 += uint128(amount1);
    }

    /// @dev Pays out what `decreaseLiquidity` released, to whoever the owner names.
    function collect(INonfungiblePositionManager.CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(_isAuthorized(_ownerOf(params.tokenId), msg.sender, params.tokenId), "Not approved");
        PositionState storage p = _positions[params.tokenId];

        amount0 = params.amount0Max < p.tokensOwed0 ? params.amount0Max : p.tokensOwed0;
        amount1 = params.amount1Max < p.tokensOwed1 ? params.amount1Max : p.tokensOwed1;
        p.tokensOwed0 -= uint128(amount0);
        p.tokensOwed1 -= uint128(amount1);

        if (amount0 > 0) IERC20(p.token0).transfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(p.token1).transfer(params.recipient, amount1);
    }
}
