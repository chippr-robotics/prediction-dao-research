// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./WelfareMetricRegistry.sol";

/**
 * @title WelfareMetricRegistryFuzzTest
 * @notice Fuzz testing for WelfareMetricRegistry invariants
 */
contract WelfareMetricRegistryFuzzTest {
    WelfareMetricRegistry public immutable registry;
    uint256 private previousMetricCount;
    
    constructor() {
        registry = new WelfareMetricRegistry();
        previousMetricCount = 0;
    }
    
    /**
     * @notice Invariant: Metric count should never decrease
     * @dev Tracks metric count between sequential calls to verify monotonic increase
     * Note: This is safe in Medusa's sequential execution model
     */
    function property_metric_count_never_decreases() public returns (bool) {
        uint256 currentCount = registry.metricCount();
        bool result = currentCount >= previousMetricCount;
        previousMetricCount = currentCount;
        return result;
    }
    
    /**
     * @notice Invariant: Individual metric weights should never exceed TOTAL_WEIGHT
     */
    function property_total_weight_bounded() public view returns (bool) {
        uint256 count = registry.metricCount();
        if (count == 0) return true;
        
        // Check that no individual metric weight exceeds TOTAL_WEIGHT
        for (uint256 i = 0; i < count; i++) {
            WelfareMetricRegistry.WelfareMetric memory metric = registry.getMetric(i);
            if (metric.weight > registry.TOTAL_WEIGHT()) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * @notice Test metric weight is always within bounds
     */
    function property_metric_weight_bounded(uint256 weight) public view returns (bool) {
        return weight <= registry.TOTAL_WEIGHT(); // Valid weights are 0-TOTAL_WEIGHT basis points
    }
}
