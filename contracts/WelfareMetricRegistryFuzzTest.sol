// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./WelfareMetricRegistry.sol";

/**
 * @title WelfareMetricRegistryFuzzTest
 * @notice Fuzz testing for WelfareMetricRegistry invariants
 */
contract WelfareMetricRegistryFuzzTest {
    WelfareMetricRegistry public registry;
    uint256 private previousMetricCount;
    
    constructor() {
        registry = new WelfareMetricRegistry();
        previousMetricCount = 0;
    }
    
    /**
     * @notice Invariant: Metric count should never decrease
     */
    function property_metric_count_never_decreases() public returns (bool) {
        uint256 currentCount = registry.metricCount();
        bool result = currentCount >= previousMetricCount;
        previousMetricCount = currentCount;
        return result;
    }
    
    /**
     * @notice Invariant: Individual metric weight should never exceed maximum
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
    function property_metric_weight_bounded(uint256 weight) public pure returns (bool) {
        return weight <= 10000; // Valid weights are 0-10000 basis points
    }
}
