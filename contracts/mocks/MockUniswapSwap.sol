// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev TEST-ONLY stand-ins for Uniswap V3's QuoterV2 and SwapRouter02 (spec 033).
 *
 *      A local node has no Uniswap deployment, so the swap surface has nothing to quote against
 *      and nothing to execute through. These two contracts answer exactly the two calls the app
 *      makes — `quoteExactInputSingle` and `exactInputSingle` — over a fixed, per-pair rate that
 *      the deployer sets.
 *
 *      WHAT A TEST BUILT ON THESE CAN AND CANNOT CLAIM. It can claim that the app quoted, told the
 *      member a number, obtained the approval, encoded the swap, and that the member's two balances
 *      then moved by the amounts the quote named. That is the whole of `trade.swap-quote-and-execute`
 *      as a MEMBER experiences it. It cannot claim anything about Uniswap's pricing, tick maths or
 *      routing — those are Uniswap's, are not ours to regress, and a mock asserting them would be
 *      asserting its own arithmetic.
 *
 *      The rate is deliberately LINEAR and tier-independent: `quote.js` probes several fee tiers and
 *      keeps the deepest fill, so a mock that varied by tier would make the winning tier a property
 *      of this file rather than of the routing code under test.
 *
 *      NEVER deploy these to a real network. They hold their own `tokenOut` float and hand it out on
 *      demand; on a public chain that is a faucet, not a router.
 */

/// @dev Shared rate table: `rate[tokenIn][tokenOut]` is how many tokenOut-wei one tokenIn-wei buys,
///      scaled by 1e18. Zero means "no pool" — which is how the app learns a pair is unroutable.
contract MockUniswapRates {
    mapping(address => mapping(address => uint256)) public rate;

    function setRate(address tokenIn, address tokenOut, uint256 rate18) external {
        rate[tokenIn][tokenOut] = rate18;
    }

    function amountOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        return (amountIn * rate[tokenIn][tokenOut]) / 1e18;
    }

    /**
     * @dev This contract doubles as the FACTORY stand-in, and always answers "no pool".
     *
     *      The only caller is `lib/portfolio/prices.js#readDexSpotUsd`, which walks the fee tiers
     *      looking for a pool to read `slot0` from. These doubles model a RATE, not a pool — there
     *      is no `sqrtPriceX96` here that would mean anything — so `address(0)` is the truthful
     *      answer, and the price path's own no-pool branch (return null, fall back to another
     *      source) is then exercised rather than bypassed. Inventing a pool would put a fabricated
     *      USD price in front of a member.
     */
    function getPool(address, address, uint24) external pure returns (address) {
        return address(0);
    }
}

/// @dev TEST-ONLY QuoterV2. Reverts where the pair has no rate, exactly as the real quoter reverts
///      where a fee tier holds no pool — `quote.js` catches that and moves on, and a mock that
///      returned zero instead would take a different branch than production does.
contract MockUniswapQuoter {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    error NoPool();

    MockUniswapRates public immutable rates;

    constructor(MockUniswapRates rates_) {
        rates = rates_;
    }

    /// @dev `nonpayable` to match QuoterV2's real mutability — the app reaches it with `staticCall`,
    ///      and a `view` here would let a caller that forgot `staticCall` still work locally while
    ///      failing against the real quoter.
    function quoteExactInputSingle(QuoteExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        uint256 out = rates.amountOut(params.tokenIn, params.tokenOut, params.amountIn);
        if (out == 0) revert NoPool();
        return (out, 0, 1, 120000);
    }
}

/// @dev TEST-ONLY SwapRouter02. Pulls `amountIn` from the caller and pays `amountOut` to
///      `recipient` from its own float, enforcing `amountOutMinimum` because that is the member's
///      slippage consent and a router that ignored it would make the app's slippage handling
///      untestable.
contract MockUniswapSwapRouter {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    error NoPool();
    error TooLittleReceived();
    error InsufficientFloat();

    MockUniswapRates public immutable rates;

    constructor(MockUniswapRates rates_) {
        rates = rates_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        amountOut = rates.amountOut(params.tokenIn, params.tokenOut, params.amountIn);
        if (amountOut == 0) revert NoPool();
        if (amountOut < params.amountOutMinimum) revert TooLittleReceived();
        if (IERC20(params.tokenOut).balanceOf(address(this)) < amountOut) revert InsufficientFloat();

        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
