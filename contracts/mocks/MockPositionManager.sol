// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
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
 */
contract MockPositionManager is ERC721 {
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice The last `MintParams` this mock received, unmodified.
    INonfungiblePositionManager.MintParams public lastMint;

    uint256 public nextTokenId = 1;

    /// @notice Fraction of each desired amount actually pulled. 10_000 = spend both in full.
    uint16 public consumeBps = 10_000;

    /// @notice When set, `mint` returns zero liquidity — exercises the router's `MintFailed` guard.
    bool public zeroLiquidity;

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
        _mint(params.recipient, tokenId);
    }
}
