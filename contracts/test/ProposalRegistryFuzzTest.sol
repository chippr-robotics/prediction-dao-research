// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../core/ProposalRegistry.sol";
import "../core/WelfareMetricRegistry.sol";

/**
 * @title ProposalRegistryFuzzTest
 * @notice Fuzz testing for ProposalRegistry invariants
 */
contract ProposalRegistryFuzzTest {
    ProposalRegistry public immutable proposalRegistry;
    WelfareMetricRegistry public immutable welfareRegistry;
    
    uint256 private previousProposalCount;
    
    constructor() {
        proposalRegistry = new ProposalRegistry();
        welfareRegistry = new WelfareMetricRegistry();
        previousProposalCount = 0;
    }
    
    /**
     * @notice Invariant: Proposal count should never decrease
     * @dev Tracks proposal count between sequential calls to verify monotonic increase
     * Note: This is safe in Medusa's sequential execution model
     */
    function property_proposal_count_never_decreases() public returns (bool) {
        uint256 currentCount = proposalRegistry.proposalCount();
        bool result = currentCount >= previousProposalCount;
        previousProposalCount = currentCount;
        return result;
    }
    
    /**
     * @notice Invariant: Bond amount should always be positive
     */
    function property_bond_amount_positive() public view returns (bool) {
        return proposalRegistry.bondAmount() > 0;
    }
    
    /**
     * @notice Validates parameter constraints for proposal submission
     * @dev This checks if parameters meet the contract requirements without calling the contract
     * @return true if parameters are valid, false otherwise
     */
    function property_submission_parameters_valid(
        string memory title,
        uint256 fundingAmount,
        address recipient
    ) public view returns (bool) {
        // Check title is not empty
        if (bytes(title).length == 0) {
            return false;
        }
        
        // Check recipient is not zero address
        if (recipient == address(0)) {
            return false;
        }
        
        // Check funding amount is within valid range
        uint256 maxAmount = proposalRegistry.MAX_PROPOSAL_AMOUNT();
        if (fundingAmount == 0 || fundingAmount > maxAmount) {
            return false;
        }
        
        return true;
    }
}
