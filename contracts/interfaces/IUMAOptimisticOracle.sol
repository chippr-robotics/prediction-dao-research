// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUMAOptimisticOracle
 * @notice Interface for UMA Optimistic Oracle V3
 * @dev Simplified interface for the key functions needed by our adapter
 */
interface IUMAOptimisticOracle {
    /**
     * @notice Asserts a claim about world state
     * @param claim The claim being asserted (bytes)
     * @param asserter The address making the assertion
     * @param callbackRecipient The contract to call back with result
     * @param sovereignSecurity Optional custom security config
     * @param currency The currency for bonds
     * @param bond The bond amount required
     * @param liveness The challenge period duration
     * @param identifier The price identifier (e.g., ASSERT_TRUTH)
     * @return assertionId The unique identifier for this assertion
     */
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address sovereignSecurity,
        address currency,
        uint256 bond,
        uint64 liveness,
        bytes32 identifier
    ) external returns (bytes32 assertionId);

    /**
     * @notice Dispute an existing assertion
     * @param assertionId The assertion to dispute
     * @param disputer The address disputing
     */
    function disputeAssertion(bytes32 assertionId, address disputer) external;

    /**
     * @notice Settle an assertion after the challenge period
     * @param assertionId The assertion to settle
     */
    function settleAssertion(bytes32 assertionId) external;

    /**
     * @notice Get the result of a settled assertion
     * @param assertionId The assertion to query
     * @return True if the assertion was valid
     */
    function getAssertionResult(bytes32 assertionId) external view returns (bool);

    /**
     * @notice Get assertion details
     * @param assertionId The assertion to query
     * @return The assertion struct data
     */
    function getAssertion(bytes32 assertionId) external view returns (Assertion memory);

    /**
     * @notice Check if an assertion has been settled
     * @param assertionId The assertion to check
     * @return True if settled
     */
    function isAssertionSettled(bytes32 assertionId) external view returns (bool);

    /**
     * @notice Assertion data structure
     */
    struct Assertion {
        bool escalationManagerSettings;
        address asserter;
        uint64 assertionTime;
        bool settled;
        address currency;
        uint64 expirationTime;
        bool settlementResolution;
        bytes32 domainId;
        bytes32 identifier;
        uint256 bond;
        address callbackRecipient;
        address disputer;
    }

    // Events
    event AssertionMade(
        bytes32 indexed assertionId,
        address indexed asserter,
        bytes claim,
        uint64 expirationTime
    );

    event AssertionDisputed(
        bytes32 indexed assertionId,
        address indexed disputer
    );

    event AssertionSettled(
        bytes32 indexed assertionId,
        bool result
    );
}
