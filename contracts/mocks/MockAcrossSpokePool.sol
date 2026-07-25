// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAcrossSpokePool} from "../interfaces/external/IAcrossSpokePool.sol";

/**
 * @title Mock Across SpokePool (spec 067 tests only)
 * @notice Minimal stand-in for Across Protocol V3's SpokePool so `BridgeRouter`'s
 *         fee-and-forward path can be unit-tested without a fork. NOT for production
 *         (contracts/mocks scope — constitution III).
 * @dev    It records every `depositV3` argument, and **`depositor` above all**: Across refunds an
 *         unfilled deposit to `depositor` on the ORIGIN chain, so a router that named itself there
 *         would strand every member's refund (research R2). The unit suite asserts
 *         `lastDepositor() == member`; the merge-blocking fork test T038 proves the same property
 *         against the real protocol.
 *
 *         It also PULLS `inputAmount` from the caller, exactly as the real SpokePool does. That is
 *         what makes the router's residual-balance and zeroed-allowance assertions meaningful: a mock
 *         that pulled nothing would leave the router holding the net and mask the invariant.
 */
contract MockAcrossSpokePool is IAcrossSpokePool {
    address public lastDepositor;
    address public lastRecipient;
    address public lastInputToken;
    address public lastOutputToken;
    uint256 public lastInputAmount;
    uint256 public lastOutputAmount;
    uint256 public lastDestinationChainId;
    address public lastExclusiveRelayer;
    uint32 public lastQuoteTimestamp;
    uint32 public lastFillDeadline;
    uint32 public lastExclusivityDeadline;
    uint256 public lastValue;
    bytes public lastMessage;
    uint256 public depositCount;

    /// @inheritdoc IAcrossSpokePool
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable {
        lastDepositor = depositor;
        lastRecipient = recipient;
        lastInputToken = inputToken;
        lastOutputToken = outputToken;
        lastInputAmount = inputAmount;
        lastOutputAmount = outputAmount;
        lastDestinationChainId = destinationChainId;
        lastExclusiveRelayer = exclusiveRelayer;
        lastQuoteTimestamp = quoteTimestamp;
        lastFillDeadline = fillDeadline;
        lastExclusivityDeadline = exclusivityDeadline;
        lastValue = msg.value;
        lastMessage = message;
        depositCount += 1;

        if (msg.value == 0) {
            // ERC-20 route: consume exactly the approval the router granted.
            IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount);
        } else {
            // Native route: Across wraps the value itself, so the amounts must agree.
            require(msg.value == inputAmount, "value != inputAmount");
        }
    }
}

/// @dev A SpokePool that pulls 1 wei LESS than the router approved — leaves the net's remainder in
///      the router, exercising the `ResidualFunds` invariant (FR-013).
contract MockLeakySpokePool is IAcrossSpokePool {
    function depositV3(
        address,
        address,
        address inputToken,
        address,
        uint256 inputAmount,
        uint256,
        uint256,
        address,
        uint32,
        uint32,
        uint32,
        bytes calldata
    ) external payable {
        IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount - 1);
    }
}

/// @dev A hostile SpokePool that calls back into the router mid-deposit — exercises `nonReentrant`.
///      The inner revert is bubbled verbatim so the test sees the guard's own custom error rather
///      than a generic wrapper failure.
contract MockReentrantSpokePool is IAcrossSpokePool {
    address public router;
    bytes public reentrantCalldata;

    /// @notice Arm the callback. `data` is the encoded router call to attempt re-entrantly.
    function arm(address router_, bytes calldata data) external {
        router = router_;
        reentrantCalldata = data;
    }

    function depositV3(
        address,
        address,
        address inputToken,
        address,
        uint256 inputAmount,
        uint256,
        uint256,
        address,
        uint32,
        uint32,
        uint32,
        bytes calldata
    ) external payable {
        bytes memory data = reentrantCalldata;
        if (data.length != 0) {
            (bool ok, bytes memory ret) = router.call(data);
            if (!ok) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        if (msg.value == 0) {
            IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount);
        }
    }
}
