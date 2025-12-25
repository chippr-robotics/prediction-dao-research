# Contract Interfaces

Complete interface definitions for all contracts.

## FutarchyGovernor

```solidity
interface IFutarchyGovernor {
    function activateProposal(uint256 proposalId) external;
    function finalizeProposal(uint256 proposalId) external;
    function executeProposal(uint256 proposalId) external;
    function pause() external;
    function unpause() external;
    
    event ProposalActivated(uint256 indexed proposalId, uint256 marketId);
    event ProposalFinalized(uint256 indexed proposalId, bool approved);
    event ProposalExecuted(uint256 indexed proposalId);
    event Paused(address account);
    event Unpaused(address account);
}
```

## WelfareMetricRegistry

```solidity
interface IWelfareMetricRegistry {
    function registerMetric(
        string memory name,
        string memory description
    ) external returns (uint256 metricId);
    
    function updateMetricWeight(
        uint256 metricId,
        uint256 weight
    ) external;
    
    function getMetricValue(uint256 metricId) 
        external 
        view 
        returns (uint256);
    
    event MetricRegistered(uint256 indexed metricId, string name);
    event MetricWeightUpdated(uint256 indexed metricId, uint256 weight);
}
```

## ProposalRegistry

```solidity
interface IProposalRegistry {
    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        uint256 fundingAmount;
        address recipient;
        uint256 welfareMetricId;
        uint256 bond;
        ProposalStatus status;
        uint256 submissionTime;
    }
    
    enum ProposalStatus {
        Pending,
        Active,
        Resolving,
        Executed,
        Rejected
    }
    
    function submitProposal(
        string memory title,
        string memory description,
        uint256 fundingAmount,
        address recipient,
        uint256 welfareMetricId
    ) external payable returns (uint256);
    
    function getProposal(uint256 proposalId) 
        external 
        view 
        returns (Proposal memory);
    
    event ProposalSubmitted(
        uint256 indexed proposalId,
        address indexed proposer
    );
}
```

## ConditionalMarketFactory

```solidity
interface IConditionalMarketFactory {
    enum BetType {
        YesNo,
        PassFail,
        AboveBelow,
        HigherLower,
        InOut,
        OverUnder,
        ForAgainst,
        TrueFalse,
        WinLose,
        UpDown
    }
    
    function getOutcomeLabels(BetType betType) 
        external 
        pure 
        returns (string memory positiveOutcome, string memory negativeOutcome);
    
    function deployMarketPair(
        uint256 proposalId,
        address collateralToken,
        uint256 liquidityAmount,
        uint256 liquidityParameter,
        uint256 tradingPeriod,
        BetType betType
    ) external returns (uint256 marketId);
    
    function getMarketPrice(uint256 marketId, bool isPass) 
        external 
        view 
        returns (uint256);
    
    function executeTrade(
        uint256 marketId,
        uint256 amount,
        bool isPass
    ) external payable;
    
    function redeemTokens(uint256 marketId) external;
    
    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed proposalId,
        address indexed collateralToken,
        address passToken,
        address failToken,
        uint256 tradingEndTime,
        uint256 liquidityParameter,
        uint256 createdAt,
        address creator,
        BetType betType
    );
    event TradeExecuted(uint256 indexed marketId, address indexed trader);
    event MarketResolved(uint256 indexed marketId, bool outcome);
}
```

## For More Details

- [API Reference](api.md) - Function descriptions
- [Smart Contracts](../developer-guide/smart-contracts.md) - Implementation details
- [Configuration](configuration.md) - System parameters
