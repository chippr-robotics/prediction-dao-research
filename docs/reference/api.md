# API Reference

API documentation for interacting with Prediction DAO contracts.

## Contract ABIs

Contract ABIs are available in the `artifacts/` directory after compilation.

## ProposalRegistry

### submitProposal

Submit a new proposal to the DAO.

```solidity
function submitProposal(
    string memory title,
    string memory description,
    uint256 fundingAmount,
    address recipient,
    uint256 welfareMetricId
) external payable returns (uint256 proposalId)
```

**Parameters**:
- `title`: Proposal title (max 100 characters)
- `description`: Detailed description
- `fundingAmount`: Amount of ETC requested
- `recipient`: Address to receive funds
- `welfareMetricId`: Which welfare metric to evaluate

**Returns**: `proposalId` - ID of created proposal

**Requires**: `msg.value >= 50 ETC` (bond)

### getProposal

Retrieve proposal details.

```solidity
function getProposal(uint256 proposalId) 
    external 
    view 
    returns (Proposal memory)
```

**Parameters**:
- `proposalId`: ID of proposal

**Returns**: Full proposal struct

## ConditionalMarketFactory

### getMarketPrice

Get current PASS or FAIL token price.

```solidity
function getMarketPrice(uint256 marketId, bool isPass) 
    external 
    view 
    returns (uint256 price)
```

**Parameters**:
- `marketId`: Market identifier
- `isPass`: true for PASS price, false for FAIL

**Returns**: Current price in wei

### calculateCost

Calculate cost to purchase tokens.

```solidity
function calculateCost(
    uint256 marketId,
    uint256 amount,
    bool isPass
) external view returns (uint256 cost)
```

## PrivacyCoordinator

### registerKey

Register public key for encrypted trading.

```solidity
function registerKey(
    uint256 publicKeyX,
    uint256 publicKeyY
) external
```

### submitEncryptedPosition

Submit an encrypted trading position.

```solidity
function submitEncryptedPosition(
    uint256 marketId,
    bytes32 commitment,
    bytes memory zkProof
) external
```

## For Full Reference

See the [Contract Interfaces](contracts.md) page for complete function signatures and events.
