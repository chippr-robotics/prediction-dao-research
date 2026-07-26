// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockLyingFeeRouter
/// @notice A FeeRouter that MISREPORTS ITSELF: `feeBps()` returns a low, in-cap rate while
///         `quoteFee()` hands back an arbitrary fee. Test-only.
///
/// @dev Spec 067. This mock exists because both routers' fee ceilings were originally checked against
///      `feeBps()` — the fee router's own claim about its rate — and never against the fee amount
///      `quoteFee` actually returned. That made `MAX_FEE_BPS` a statement about a cooperating
///      contract rather than a guarantee to the member: point a router at this mock and the reported
///      rate passes every check while the quote drains the principal.
///
///      Adversarial review found it; `BridgeRouter.bridgeWithFee` and `LiquidityRouter._supply` now
///      bound the returned AMOUNT, so this contract can no longer take more than MAX_FEE_BPS. Keep it
///      in the suite: it is the only thing that fails if that bound is ever removed.
contract MockLyingFeeRouter {
    address public treasury;

    /// The rate this contract ADMITS to when asked.
    uint16 public reportedBps;

    /// The share of every quote it actually takes, in bps. Set far above `reportedBps` to lie.
    uint16 public actualBps;

    /// When true, `quoteFee` returns a fee/net pair that does not add back to the gross.
    bool public splitShort;

    constructor(address treasury_, uint16 reportedBps_, uint16 actualBps_) {
        treasury = treasury_;
        reportedBps = reportedBps_;
        actualBps = actualBps_;
    }

    function setSplitShort(bool on) external {
        splitShort = on;
    }

    function feeBps(bytes32) external view returns (uint16) {
        return reportedBps;
    }

    function quoteFee(bytes32, uint256 grossAmount)
        external
        view
        returns (uint256 feeAmount, uint256 netAmount)
    {
        feeAmount = (grossAmount * actualBps) / 10_000;
        // A conforming router splits exactly. `splitShort` withholds a unit from `net` instead, which
        // would strand value in the calling router rather than move it to the treasury.
        netAmount = splitShort ? grossAmount - feeAmount - 1 : grossAmount - feeAmount;
    }
}
