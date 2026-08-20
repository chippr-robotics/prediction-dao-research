// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Mock Polygon PoS delegation (spec 065 tests only)
 * @notice Stand-ins for the Polygon `StakeManager` and a single `ValidatorShare` on Ethereum L1,
 *         so the DELEGATED half of Earn ▸ Stake can be driven end to end without a fork. NOT for
 *         production (contracts/mocks scope — constitution III).
 *
 * @dev ── THE ONE DETAIL WORTH GETTING RIGHT ────────────────────────────────────────────────────
 *      The member approves POL to the **StakeManager**, not to the ValidatorShare
 *      (`lib/staking/polygonDelegation.js#buildDelegateCalls`), because on the real protocol it is
 *      the StakeManager that pulls the delegator's tokens. So `buyVoucherPOL` here routes the pull
 *      through `MockPolygonStakeManager.delegationDeposit` rather than calling `transferFrom`
 *      itself. A mock that pulled directly would pass while the app approved the wrong spender —
 *      which is exactly the kind of thing an e2e flow exists to catch.
 *
 *      Exchange rate is fixed 1:1 (shares == POL) and rewards do not accrue on their own;
 *      `setRewards` exists so the claim path has something to claim. Nothing here models Polygon's
 *      checkpoint economics — it models who is allowed to move which tokens, and when.
 */
contract MockPolygonStakeManager {
    /// @notice Current checkpoint epoch. Advanced explicitly by a test, never by time.
    uint256 public epoch = 1;

    /// @notice Checkpoints an unbond must wait before it can be claimed.
    uint256 public withdrawalDelay;

    IERC20 public immutable polToken;

    constructor(address polToken_, uint256 withdrawalDelay_) {
        polToken = IERC20(polToken_);
        withdrawalDelay = withdrawalDelay_;
    }

    /// @notice Move the chain past an unbonding period without waiting for one.
    function advanceEpoch(uint256 by) external {
        epoch += by;
    }

    function setWithdrawalDelay(uint256 delay) external {
        withdrawalDelay = delay;
    }

    /// @dev The pull the member's approval actually authorises. Called by a ValidatorShare.
    function delegationDeposit(address delegator, uint256 amount, address validatorShare) external {
        require(polToken.transferFrom(delegator, validatorShare, amount), "POL transfer failed");
    }
}

/// @dev One validator's delegation contract. Shares are 1:1 with POL.
contract MockValidatorShare {
    /// @dev Polygon's own precision constant, returned verbatim so a caller that scales by it
    ///      arrives back at 1:1 rather than at zero.
    uint256 private constant EXCHANGE_RATE_PRECISION = 10 ** 29;

    struct Unbond {
        uint256 shares;
        uint256 withdrawEpoch;
    }

    IERC20 public immutable polToken;
    MockPolygonStakeManager public immutable stakeManager;

    mapping(address => uint256) private _stake;
    mapping(address => uint256) private _rewards;
    mapping(address => uint256) public unbondNonces;
    mapping(address => mapping(uint256 => Unbond)) private _unbonds;

    constructor(address polToken_, address stakeManager_) {
        polToken = IERC20(polToken_);
        stakeManager = MockPolygonStakeManager(stakeManager_);
    }

    /// @notice Test hook: give an account claimable rewards to exercise `withdrawRewardsPOL`.
    function setRewards(address account, uint256 amount) external {
        _rewards[account] = amount;
    }

    function buyVoucherPOL(uint256 amount, uint256) external returns (uint256) {
        // Through the StakeManager — see the contract note. This is what makes the approval
        // target the app chose load-bearing.
        stakeManager.delegationDeposit(msg.sender, amount, address(this));
        _stake[msg.sender] += amount;
        return amount;
    }

    function sellVoucherPOL(uint256 claimAmount, uint256) external {
        require(_stake[msg.sender] >= claimAmount, "not enough stake");
        _stake[msg.sender] -= claimAmount;
        uint256 nonce = ++unbondNonces[msg.sender];
        _unbonds[msg.sender][nonce] = Unbond({shares: claimAmount, withdrawEpoch: stakeManager.epoch()});
    }

    function unstakeClaimTokens_newPOL(uint256 unbondNonce) external {
        Unbond storage unbond = _unbonds[msg.sender][unbondNonce];
        uint256 shares = unbond.shares;
        require(shares > 0, "no such unbond");
        require(
            unbond.withdrawEpoch + stakeManager.withdrawalDelay() <= stakeManager.epoch(),
            "still unbonding"
        );
        unbond.shares = 0;
        require(polToken.transfer(msg.sender, shares), "POL transfer failed");
    }

    function withdrawRewardsPOL() external {
        uint256 amount = _rewards[msg.sender];
        require(amount > 0, "no rewards");
        _rewards[msg.sender] = 0;
        require(polToken.transfer(msg.sender, amount), "POL transfer failed");
    }

    function getTotalStake(address user) external view returns (uint256, uint256) {
        return (_stake[user], EXCHANGE_RATE_PRECISION);
    }

    function getLiquidRewards(address user) external view returns (uint256) {
        return _rewards[user];
    }

    function exchangeRate() external pure returns (uint256) {
        return EXCHANGE_RATE_PRECISION;
    }

    function unbonds_new(address user, uint256 unbondNonce)
        external
        view
        returns (uint256 shares, uint256 withdrawEpoch)
    {
        Unbond storage unbond = _unbonds[user][unbondNonce];
        return (unbond.shares, unbond.withdrawEpoch);
    }
}
