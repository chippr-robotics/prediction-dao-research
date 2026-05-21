// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUMAOptimisticOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockUMAOptimisticOracle
 * @notice Mock implementation of UMA Optimistic Oracle V3 for testing
 */
contract MockUMAOptimisticOracle is IUMAOptimisticOracle {
    using SafeERC20 for IERC20;

    // Assertion storage
    mapping(bytes32 => Assertion) public assertions;
    mapping(bytes32 => bool) public assertionResults;
    mapping(bytes32 => bytes) public assertionClaims;

    uint256 private assertionCounter;

    // ========== Core Functions ==========

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address /* sovereignSecurity */,
        address currency,
        uint256 bond,
        uint64 liveness,
        bytes32 identifier
    ) external override returns (bytes32 assertionId) {
        // Transfer bond from sender
        IERC20(currency).safeTransferFrom(msg.sender, address(this), bond);

        assertionCounter++;
        assertionId = keccak256(abi.encodePacked(assertionCounter, claim, block.timestamp));

        assertions[assertionId] = Assertion({
            escalationManagerSettings: false,
            asserter: asserter,
            assertionTime: uint64(block.timestamp),
            settled: false,
            currency: currency,
            expirationTime: uint64(block.timestamp + liveness),
            settlementResolution: false,
            domainId: bytes32(0),
            identifier: identifier,
            bond: bond,
            callbackRecipient: callbackRecipient,
            disputer: address(0)
        });

        assertionClaims[assertionId] = claim;

        emit AssertionMade(assertionId, asserter, claim, uint64(block.timestamp + liveness));

        return assertionId;
    }

    function disputeAssertion(bytes32 assertionId, address disputer) external override {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");
        require(assertion.disputer == address(0), "Already disputed");

        // Transfer bond from disputer
        IERC20(assertion.currency).safeTransferFrom(msg.sender, address(this), assertion.bond);

        assertion.disputer = disputer;

        // Notify callback recipient
        if (assertion.callbackRecipient != address(0)) {
            try IUMACallbackRecipient(assertion.callbackRecipient).assertionDisputedCallback(assertionId) {} catch {}
        }

        emit AssertionDisputed(assertionId, disputer);
    }

    function settleAssertion(bytes32 assertionId) external override {
        Assertion storage assertion = assertions[assertionId];
        require(!assertion.settled, "Already settled");
        require(
            assertion.disputer != address(0) || block.timestamp >= assertion.expirationTime,
            "Not ready to settle"
        );

        assertion.settled = true;

        // If no dispute, assertion is valid
        if (assertion.disputer == address(0)) {
            assertion.settlementResolution = true;
            assertionResults[assertionId] = true;

            // Return bond to asserter
            IERC20(assertion.currency).safeTransfer(assertion.asserter, assertion.bond);
        }
        // If disputed, use mock result (default to true for testing)
        else {
            assertion.settlementResolution = assertionResults[assertionId];

            // In real UMA, DVM would determine winner
            // For testing, we use pre-set result
            if (assertionResults[assertionId]) {
                // Asserter wins, gets both bonds
                IERC20(assertion.currency).safeTransfer(assertion.asserter, assertion.bond * 2);
            } else {
                // Disputer wins, gets both bonds
                IERC20(assertion.currency).safeTransfer(assertion.disputer, assertion.bond * 2);
            }
        }

        // Notify callback recipient
        if (assertion.callbackRecipient != address(0)) {
            try IUMACallbackRecipient(assertion.callbackRecipient).assertionResolvedCallback(
                assertionId,
                assertion.settlementResolution
            ) {} catch {}
        }

        emit AssertionSettled(assertionId, assertion.settlementResolution);
    }

    function getAssertionResult(bytes32 assertionId) external view override returns (bool) {
        return assertions[assertionId].settlementResolution;
    }

    function getAssertion(bytes32 assertionId) external view override returns (Assertion memory) {
        return assertions[assertionId];
    }

    function isAssertionSettled(bytes32 assertionId) external view override returns (bool) {
        return assertions[assertionId].settled;
    }

    // ========== Test Helpers ==========

    /**
     * @notice Set the result for a disputed assertion (simulates DVM)
     */
    function setDisputeResult(bytes32 assertionId, bool result) external {
        assertionResults[assertionId] = result;
    }

    /**
     * @notice Fast-forward an assertion to be settleable (for testing)
     */
    function setAssertionExpired(bytes32 assertionId) external {
        assertions[assertionId].expirationTime = uint64(block.timestamp - 1);
    }

    /**
     * @notice Get assertion claim text
     */
    function getAssertionClaim(bytes32 assertionId) external view returns (bytes memory) {
        return assertionClaims[assertionId];
    }
}

/**
 * @notice Interface for UMA callback recipients
 */
interface IUMACallbackRecipient {
    function assertionDisputedCallback(bytes32 assertionId) external;
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;
}
