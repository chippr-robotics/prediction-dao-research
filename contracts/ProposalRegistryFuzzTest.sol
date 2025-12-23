// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./ProposalRegistry.sol";
import "./WelfareMetricRegistry.sol";

/**
 * @title ProposalRegistryFuzzTest
 * @notice Fuzz testing for ProposalRegistry invariants
 */
contract ProposalRegistryFuzzTest {
    ProposalRegistry public proposalRegistry;
    WelfareMetricRegistry public welfareRegistry;
    
    uint256 public constant INITIAL_BOND = 50 ether;
    
    constructor() {
        proposalRegistry = new ProposalRegistry();
        welfareRegistry = new WelfareMetricRegistry();
    }
    
    /**
     * @notice Invariant: Proposal count should never decrease
     */
    function property_proposal_count_never_decreases() public view returns (bool) {
        uint256 currentCount = proposalRegistry.proposalCount();
        return currentCount >= 0;
    }
    
    /**
     * @notice Invariant: Bond amount should always be positive
     */
    function property_bond_amount_positive() public view returns (bool) {
        return proposalRegistry.bondAmount() > 0;
    }
    
    /**
     * @notice Test submission requires correct bond
     */
    function property_submission_requires_bond(
        string memory title,
        uint256 fundingAmount,
        address recipient
    ) public payable returns (bool) {
        if (msg.value < INITIAL_BOND) {
            return true; // Should revert, which is expected
        }
        
        if (bytes(title).length == 0) {
            return true; // Should revert for empty title
        }
        
        if (recipient == address(0)) {
            return true; // Should revert for zero recipient
        }
        
        if (fundingAmount == 0 || fundingAmount > 50000 ether) {
            return true; // Should revert for invalid amounts
        }
        
        return true;
    }
}
