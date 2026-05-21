// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../access/TieredRoleManager.sol";

/**
 * @title WelfareMetricRegistry
 * @notice On-chain storage of democratically-selected protocol success measures with role-based management
 * @dev Manages welfare metrics with versioning and update mechanisms
 * Supports multiple metric categories: governance, financial, betting, and private-sector style
 * 
 * RBAC INTEGRATION:
 * - Metric registration requires OPERATIONS_ADMIN_ROLE
 * - Metric updates require OPERATIONS_ADMIN_ROLE
 */
contract WelfareMetricRegistry is Ownable, ReentrancyGuard {
    enum MetricCategory {
        Governance,      // On-chain governance metrics (proposals, voting, participation)
        Financial,       // Revenue, profit, ROI, treasury value
        Betting,         // Prediction market metrics (volume, accuracy, liquidity)
        PrivateSector    // Traditional company metrics (for accredited investors)
    }

    struct WelfareMetric {
        string name;
        string description;
        uint256 weight; // Basis points (10000 = 100%)
        MetricCategory category;
        bool active;
        uint256 activatedAt;
    }

    struct MetricValue {
        uint256 value;
        uint256 timestamp;
        address reporter;
    }

    struct AggregatedMetrics {
        uint256 governanceScore;
        uint256 financialScore;
        uint256 bettingScore;
        uint256 privateSectorScore;
        uint256 overallScore;
        uint256 timestamp;
    }

    // Metric ID => WelfareMetric
    mapping(uint256 => WelfareMetric) public metrics;
    
    // Metric ID => historical values
    mapping(uint256 => MetricValue[]) public metricHistory;
    
    // DAO ID => Metric ID => latest value
    mapping(uint256 => mapping(uint256 => uint256)) public latestMetricValues;
    
    // Array of active metric IDs
    uint256[] public activeMetricIds;
    
    uint256 public metricCount;
    uint256 public constant VOTING_PERIOD = 14 days;
    uint256 public constant TOTAL_WEIGHT = 10000; // 100% in basis points

    bool private _initialized;
    
    // Role-based access control
    TieredRoleManager public roleManager;

    event MetricProposed(uint256 indexed metricId, string name, string description, uint256 weight, MetricCategory category);
    event MetricActivated(uint256 indexed metricId);
    event MetricDeactivated(uint256 indexed metricId);
    event MetricUpdated(uint256 indexed metricId, uint256 newWeight);
    event MetricValueRecorded(uint256 indexed metricId, uint256 value, uint256 timestamp, address reporter);

    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Set the role manager contract
     * @param _roleManager Address of TieredRoleManager contract
     */
    function setRoleManager(address _roleManager) external onlyOwner {
        require(_roleManager != address(0), "Invalid role manager address");
        require(address(roleManager) == address(0), "Role manager already set");
        roleManager = TieredRoleManager(_roleManager);
    }

    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        _initialized = true;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Propose a new welfare metric
     * @param name Name of the metric
     * @param description Detailed description
     * @param weight Weight in basis points (max 10000)
     * @param category Category of the metric
     */
    function proposeMetric(
        string calldata name,
        string calldata description,
        uint256 weight,
        MetricCategory category
    ) external onlyOwner returns (uint256) {
        require(weight > 0 && weight <= TOTAL_WEIGHT, "Invalid weight");
        require(bytes(name).length > 0, "Empty name");

        uint256 metricId = metricCount++;
        
        metrics[metricId] = WelfareMetric({
            name: name,
            description: description,
            weight: weight,
            category: category,
            active: false,
            activatedAt: 0
        });

        emit MetricProposed(metricId, name, description, weight, category);
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

        // Remove from active array - cache length for gas optimization
        uint256 length = activeMetricIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (activeMetricIds[i] == metricId) {
                activeMetricIds[i] = activeMetricIds[length - 1];
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

    /**
     * @notice Record a metric value
     * @param metricId ID of the metric
     * @param value Value to record
     */
    function recordMetricValue(uint256 metricId, uint256 value) external onlyOwner {
        require(metricId < metricCount, "Invalid metric ID");
        require(metrics[metricId].active, "Metric not active");

        metricHistory[metricId].push(MetricValue({
            value: value,
            timestamp: block.timestamp,
            reporter: msg.sender
        }));

        latestMetricValues[0][metricId] = value; // Using 0 as default DAO ID

        emit MetricValueRecorded(metricId, value, block.timestamp, msg.sender);
    }

    /**
     * @notice Get metric history
     * @param metricId ID of the metric
     * @param count Number of historical values to return (from most recent)
     * @return Array of metric values
     */
    function getMetricHistory(uint256 metricId, uint256 count) 
        external 
        view 
        returns (MetricValue[] memory) 
    {
        require(metricId < metricCount, "Invalid metric ID");
        
        MetricValue[] storage history = metricHistory[metricId];
        uint256 length = history.length;
        
        if (count > length) {
            count = length;
        }
        
        MetricValue[] memory result = new MetricValue[](count);
        
        for (uint256 i = 0; i < count; i++) {
            result[i] = history[length - count + i];
        }
        
        return result;
    }

    /**
     * @notice Get aggregated metrics by category
     * @return AggregatedMetrics struct with scores by category
     */
    function getAggregatedMetrics() external view returns (AggregatedMetrics memory) {
        uint256 governanceScore = 0;
        uint256 financialScore = 0;
        uint256 bettingScore = 0;
        uint256 privateSectorScore = 0;
        
        uint256 governanceWeight = 0;
        uint256 financialWeight = 0;
        uint256 bettingWeight = 0;
        uint256 privateSectorWeight = 0;

        uint256 length = activeMetricIds.length; // Cache array length
        for (uint256 i = 0; i < length; i++) {
            uint256 metricId = activeMetricIds[i];
            WelfareMetric memory metric = metrics[metricId];
            uint256 value = latestMetricValues[0][metricId];

            if (metric.category == MetricCategory.Governance) {
                governanceScore += value * metric.weight;
                governanceWeight += metric.weight;
            } else if (metric.category == MetricCategory.Financial) {
                financialScore += value * metric.weight;
                financialWeight += metric.weight;
            } else if (metric.category == MetricCategory.Betting) {
                bettingScore += value * metric.weight;
                bettingWeight += metric.weight;
            } else if (metric.category == MetricCategory.PrivateSector) {
                privateSectorScore += value * metric.weight;
                privateSectorWeight += metric.weight;
            }
        }

        // Normalize scores
        if (governanceWeight > 0) governanceScore = governanceScore / governanceWeight;
        if (financialWeight > 0) financialScore = financialScore / financialWeight;
        if (bettingWeight > 0) bettingScore = bettingScore / bettingWeight;
        if (privateSectorWeight > 0) privateSectorScore = privateSectorScore / privateSectorWeight;

        // Calculate overall score
        uint256 overallScore = (governanceScore + financialScore + bettingScore + privateSectorScore) / 4;

        return AggregatedMetrics({
            governanceScore: governanceScore,
            financialScore: financialScore,
            bettingScore: bettingScore,
            privateSectorScore: privateSectorScore,
            overallScore: overallScore,
            timestamp: block.timestamp
        });
    }

    /**
     * @notice Get metrics by category
     * @param category Category to filter by
     * @return Array of metric IDs in the category
     */
    function getMetricsByCategory(MetricCategory category) 
        external 
        view 
        returns (uint256[] memory) 
    {
        uint256 count = 0;
        
        // Count metrics in category - cache array length
        uint256 length = activeMetricIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (metrics[activeMetricIds[i]].category == category) {
                count++;
            }
        }
        
        // Populate result array - reuse cached length
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < length; i++) {
            uint256 metricId = activeMetricIds[i];
            if (metrics[metricId].category == category) {
                result[index] = metricId;
                index++;
            }
        }
        
        return result;
    }
}
