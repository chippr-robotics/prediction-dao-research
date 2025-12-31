# ERC1155 CFT and EIP-712 Signature Integration Guide

## Overview

This document describes the ERC1155 Conditional Token Framework (CTF) and EIP-712 signature integration in the Prediction DAO platform. The system enables:

1. **Gas-efficient conditional tokens** using the ERC1155 multi-token standard
2. **Meta-transactions** via EIP-712 typed data signing for all participant actions
3. **Intent-based trading** where participants sign intents off-chain that can be executed on-chain by relayers

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DAO/Futuarchy Layer                           │
├────────────────────────┬────────────────────────┬───────────────────────┤
│    FutarchyGovernor    │   TraditionalGovernor  │   ProposalRegistry    │
└───────────┬────────────┴───────────┬────────────┴───────────────────────┘
            │                        │
            ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         EIP-712 Intent Layer                             │
├────────────────────────┬─────────────────────────────────────────────────┤
│ GovernanceIntentHandler │         PredictionMarketExchange               │
│ (Split/Merge/Redeem)   │         (Order Matching)                        │
└───────────┬────────────┴───────────┬─────────────────────────────────────┘
            │                        │
            ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         CTF1155 (ERC1155)                                │
│   • Conditional token minting/burning                                    │
│   • Position splitting and merging                                       │
│   • Outcome resolution and redemption                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

## Contracts

### CTF1155 (ERC1155 Conditional Tokens)

The core token contract implementing Gnosis CTF standard with ERC1155:

```solidity
// Prepare a condition for binary outcomes
bytes32 conditionId = ctf1155.prepareCondition(oracle, questionId, 2);

// Split collateral into position tokens
uint256[] memory partition = new uint256[](2);
partition[0] = 1; // PASS outcome
partition[1] = 2; // FAIL outcome
ctf1155.splitPosition(collateralToken, bytes32(0), conditionId, partition, amount);

// Merge position tokens back to collateral
ctf1155.mergePositions(collateralToken, bytes32(0), conditionId, partition, amount);

// Redeem winning positions after resolution
ctf1155.redeemPositions(collateralToken, bytes32(0), conditionId, indexSets);
```

**Key Features:**
- Binary and multi-outcome conditions support
- Combinatorial outcomes (A AND B, A OR B)
- Position ID calculation: `keccak256(collateralToken, collectionId)`
- Collection ID calculation: `keccak256(parentCollectionId, conditionId, indexSet)`

### GovernanceIntentHandler (EIP-712)

Handles EIP-712 signed intents for governance operations:

```solidity
// Intent types
struct SplitIntent {
    address participant;  // Signer
    uint256 marketId;     // Target market
    uint256 amount;       // Collateral amount
    uint256 nonce;        // Replay protection
    uint256 deadline;     // Expiration
}

struct MergeIntent {
    address participant;
    uint256 marketId;
    uint256 amount;
    uint256 nonce;
    uint256 deadline;
}

struct RedeemIntent {
    address participant;
    uint256 marketId;
    uint256[] indexSets;  // Positions to redeem
    uint256 nonce;
    uint256 deadline;
}

struct TradeIntent {
    address participant;
    uint256 marketId;
    bool buyPass;         // Position type
    uint256 amount;       // Amount to trade
    bool isBuy;           // Buy or sell
    uint256 minAmountOut; // Slippage protection
    uint256 nonce;
    uint256 deadline;
}
```

### PredictionMarketExchange (Order Book)

EIP-712 signed order book for trading CTF1155 positions:

```solidity
struct Order {
    address maker;
    address makerAsset;
    address takerAsset;
    uint256 makerAmount;
    uint256 takerAmount;
    uint256 nonce;
    uint256 expiration;
    bytes32 salt;
    bool isMakerERC1155;
    bool isTakerERC1155;
    uint256 makerTokenId;
    uint256 takerTokenId;
}
```

## EIP-712 Signature Flow

### 1. Intent Creation (Off-chain)

```javascript
// Define EIP-712 domain
const domain = {
    name: "GovernanceIntentHandler",
    version: "1",
    chainId: 1337,
    verifyingContract: intentHandlerAddress
};

// Define intent
const intent = {
    participant: participantAddress,
    marketId: 0,
    amount: ethers.parseEther("100"),
    nonce: 1,
    deadline: Math.floor(Date.now() / 1000) + 3600
};

// Sign intent
const signature = await signer.signTypedData(domain, types, intent);
```

### 2. Intent Submission (On-chain)

```solidity
// Anyone can submit the signed intent
intentHandler.executeSplitIntent(intent, signature);
```

### 3. Signature Verification

```solidity
function _validateSplitIntent(
    SplitIntent calldata intent,
    bytes calldata signature
) internal view {
    // Check deadline
    if (block.timestamp > intent.deadline) revert ExpiredIntent();
    
    // Check nonce
    if (usedNonces[intent.participant][intent.nonce]) revert NonceAlreadyUsed();
    
    // Verify signature
    bytes32 structHash = _hashSplitIntentStruct(intent);
    bytes32 hash = _hashTypedDataV4(structHash);
    address signer = hash.recover(signature);
    
    if (signer != intent.participant) revert InvalidSignature();
}
```

## Security Features

### Replay Protection

Each intent includes a unique nonce that is marked as used after execution:

```solidity
mapping(address => mapping(uint256 => bool)) public usedNonces;

// Mark nonce as used
usedNonces[intent.participant][intent.nonce] = true;
```

Participants can also proactively invalidate nonces:

```solidity
// Invalidate single nonce
intentHandler.invalidateNonce(nonce);

// Batch invalidate
intentHandler.batchInvalidateNonces([1, 2, 3, 4, 5]);
```

### Deadline Expiration

All intents must include a deadline timestamp:

```solidity
require(block.timestamp <= intent.deadline, "Expired");
```

### Signature Domain Binding

Signatures are bound to the specific contract and chain:

```solidity
constructor() EIP712("GovernanceIntentHandler", "1") {
    // Domain separator includes:
    // - Name: "GovernanceIntentHandler"
    // - Version: "1"
    // - Chain ID: Network chain ID
    // - Verifying Contract: This contract's address
}
```

## Integration Examples

### Frontend Integration

```typescript
import { ethers } from 'ethers';

// Create intent
const splitIntent = {
    participant: signer.address,
    marketId: 0,
    amount: ethers.parseEther("100"),
    nonce: Date.now(), // Using timestamp as nonce
    deadline: Math.floor(Date.now() / 1000) + 3600
};

// Define types for EIP-712
const types = {
    SplitIntent: [
        { name: "participant", type: "address" },
        { name: "marketId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
    ]
};

// Sign
const signature = await signer._signTypedData(domain, types, splitIntent);

// Submit (can be done by any relayer)
const tx = await intentHandler.executeSplitIntent(splitIntent, signature);
await tx.wait();
```

### Relayer Integration

```typescript
// Relayers can batch process intents
const intents = [intent1, intent2, intent3];
const signatures = [sig1, sig2, sig3];

// Batch execute
const tx = await intentHandler.batchExecuteTradeIntents(intents, signatures);
```

## Gas Costs

| Operation | Gas Cost |
|-----------|----------|
| Split Intent | ~265,000 |
| Merge Intent | ~180,000 |
| Redeem Intent | ~150,000 |
| Trade Intent | ~200,000 |
| Order Fill | ~180,000 |

## Migration Guide

### From ERC20 to ERC1155 CTF

1. **Deploy CTF1155 Contract**
   ```solidity
   CTF1155 ctf = new CTF1155();
   ```

2. **Configure Market Factory**
   ```solidity
   marketFactory.setCTF1155(address(ctf));
   ```

3. **Create Markets with CTF**
   Markets are now automatically created with CTF1155 positions.

4. **Update Frontend**
   - Use ERC1155 APIs for position queries
   - Update approval calls to `setApprovalForAll`

### Adding EIP-712 Intents

1. **Deploy Intent Handler**
   ```solidity
   GovernanceIntentHandler handler = new GovernanceIntentHandler(
       address(marketFactory),
       address(ctf1155)
   );
   ```

2. **Configure Approvals**
   Users approve the intent handler once:
   ```solidity
   collateralToken.approve(address(handler), type(uint256).max);
   ctf1155.setApprovalForAll(address(handler), true);
   ```

3. **Sign and Submit Intents**
   See Frontend Integration examples above.

## Testing

Run the test suite:

```bash
# Unit tests
npx hardhat test test/CTF1155.test.js
npx hardhat test test/GovernanceIntentHandler.test.js
npx hardhat test test/PredictionMarketExchange.test.js

# Integration tests
npx hardhat test test/ConditionalMarketFactory.CTF.test.js
```

## Security Considerations

1. **Signature Malleability**: Use ECDSA.recover from OpenZeppelin which handles signature malleability
2. **Replay Attacks**: Nonce-based protection prevents same intent from being executed twice
3. **Front-running**: Deadline and minAmountOut protect against front-running
4. **Reentrancy**: All external functions use ReentrancyGuard
5. **Access Control**: Owner-only admin functions for configuration

## Appendix: Type Hashes

```solidity
bytes32 public constant TRADE_INTENT_TYPEHASH = keccak256(
    "TradeIntent(address participant,uint256 marketId,bool buyPass,uint256 amount,bool isBuy,uint256 minAmountOut,uint256 nonce,uint256 deadline)"
);

bytes32 public constant SPLIT_INTENT_TYPEHASH = keccak256(
    "SplitIntent(address participant,uint256 marketId,uint256 amount,uint256 nonce,uint256 deadline)"
);

bytes32 public constant MERGE_INTENT_TYPEHASH = keccak256(
    "MergeIntent(address participant,uint256 marketId,uint256 amount,uint256 nonce,uint256 deadline)"
);

bytes32 public constant REDEEM_INTENT_TYPEHASH = keccak256(
    "RedeemIntent(address participant,uint256 marketId,uint256[] indexSets,uint256 nonce,uint256 deadline)"
);
```
