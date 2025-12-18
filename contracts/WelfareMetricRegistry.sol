// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WelfareMetricRegistry
 * @notice On-chain storage of democratically-selected protocol success measures
 * @dev Manages welfare metrics with versioning and update mechanisms
 */
contract WelfareMetricRegistry is Ownable, ReentrancyGuard {
    struct WelfareMetric {
        string name;
        string description;
        uint256 weight; // Basis points (10000 = 100%)
        bool active;
        uint256 activatedAt;
    }

    // Metric ID => WelfareMetric
    mapping(uint256 => WelfareMetric) public metrics;
    
    // Array of active metric IDs
    uint256[] public activeMetricIds;
    
    uint256 public metricCount;
    uint256 public constant VOTING_PERIOD = 14 days;
    uint256 public constant TOTAL_WEIGHT = 10000; // 100% in basis points

    event MetricProposed(uint256 indexed metricId, string name, string description, uint256 weight);
    event MetricActivated(uint256 indexed metricId);
    event MetricDeactivated(uint256 indexed metricId);
    event MetricUpdated(uint256 indexed metricId, uint256 newWeight);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Propose a new welfare metric
     * @param name Name of the metric
     * @param description Detailed description
     * @param weight Weight in basis points (max 10000)
     */
    function proposeMetric(
        string calldata name,
        string calldata description,
        uint256 weight
    ) external onlyOwner returns (uint256) {
        require(weight > 0 && weight <= TOTAL_WEIGHT, "Invalid weight");
        require(bytes(name).length > 0, "Empty name");

        uint256 metricId = metricCount++;
        
        metrics[metricId] = WelfareMetric({
            name: name,
            description: description,
            weight: weight,
            active: false,
            activatedAt: 0
        });

        emit MetricProposed(metricId, name, description, weight);
        return metricId;
    }

    /**
     * @notice Activate a proposed metric
     * @param metricId ID of the metric to activate
     */
    function activateMetric(uint256 metricId) external onlyOwner {
        require(metricId < metricCount, "Invalid metric ID");
        require(!metrics[metricId].active, "Already active");

        metrics[metricId].active = true;
        metrics[metricId].activatedAt = block.timestamp;
        activeMetricIds.push(metricId);

        emit MetricActivated(metricId);
    }

    /**
     * @notice Deactivate an active metric
     * @param metricId ID of the metric to deactivate
     */
    function deactivateMetric(uint256 metricId) external onlyOwner {
        require(metrics[metricId].active, "Not active");

        metrics[metricId].active = false;

        // Remove from active array
        for (uint256 i = 0; i < activeMetricIds.length; i++) {
            if (activeMetricIds[i] == metricId) {
                activeMetricIds[i] = activeMetricIds[activeMetricIds.length - 1];
                activeMetricIds.pop();
                break;
            }
        }

        emit MetricDeactivated(metricId);
    }

    /**
     * @notice Update metric weight
     * @param metricId ID of the metric
     * @param newWeight New weight in basis points
     */
    function updateMetricWeight(uint256 metricId, uint256 newWeight) external onlyOwner {
        require(metricId < metricCount, "Invalid metric ID");
        require(newWeight > 0 && newWeight <= TOTAL_WEIGHT, "Invalid weight");

        metrics[metricId].weight = newWeight;
        emit MetricUpdated(metricId, newWeight);
    }

    /**
     * @notice Get all active metrics
     * @return Array of active metric IDs
     */
    function getActiveMetrics() external view returns (uint256[] memory) {
        return activeMetricIds;
    }

    /**
     * @notice Get metric details
     * @param metricId ID of the metric
     * @return Metric details
     */
    function getMetric(uint256 metricId) external view returns (WelfareMetric memory) {
        require(metricId < metricCount, "Invalid metric ID");
        return metrics[metricId];
    }
}
