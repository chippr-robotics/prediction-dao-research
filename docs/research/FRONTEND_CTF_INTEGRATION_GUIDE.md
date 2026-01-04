# Frontend CTF1155 Integration Guide

## Overview

This guide explains how to integrate CTF1155 (Conditional Token Framework) support into the Prediction DAO frontend. The backend ConditionalMarketFactory now exclusively uses CTF1155 for all markets.

## Key Changes from ERC20 to CTF1155

### Before (ERC20 Tokens)
- Each market had separate PASS and FAIL ERC20 tokens
- Users could trade tokens directly
- Simple token balance queries

### After (CTF1155 Tokens)
- All markets use a single CTF1155 contract
- Each market has a unique condition with position IDs
- Users must split collateral into positions before trading
- Positions are ERC1155 tokens

## Required Contract ABIs

Add these ABIs to `frontend/src/abis/`:

1. **CTF1155.js** - The Conditional Token Framework contract
2. **ConditionalMarketFactory.js** - Updated factory with CTF support

Generate these ABIs after compiling contracts:
```bash
cd /home/runner/work/prediction-dao-research/prediction-dao-research
npm run compile
# Export ABIs from artifacts/contracts/
```

## Frontend Components to Update

### 1. MarketCreation Component

**File**: `frontend/src/components/MarketCreation.jsx`

**Changes Needed**:
- Add note that markets now use CTF1155
- Update market creation flow to show CTF token information
- Display condition ID and position IDs after market creation

**Example Addition**:
```jsx
<div className="ctf-info">
  <h3>Market uses Conditional Tokens (CTF1155)</h3>
  <p>This market creates positions using the Gnosis CTF standard for gas-efficient trading.</p>
</div>
```

### 2. MarketTrading Component

**File**: `frontend/src/components/MarketTrading.jsx`

**Major Changes Required**:

#### A. Display CTF Position Information
```jsx
const MarketInfo = ({ market }) => {
  return (
    <div className="market-ctf-info">
      <h3>Market Tokens</h3>
      <div className="token-info">
        <div>CTF Contract: {market.passToken}</div>
        <div>Condition ID: {market.conditionId}</div>
        <div>Pass Position ID: {market.passPositionId}</div>
        <div>Fail Position ID: {market.failPositionId}</div>
      </div>
    </div>
  )
}
```

#### B. Add Position Splitting UI
Users need to split collateral into CTF positions before trading:

```jsx
const PositionSplitter = ({ market }) => {
  const [amount, setAmount] = useState('')
  
  const handleSplit = async () => {
    // 1. Approve collateral to CTF1155
    await collateralToken.approve(ctf1155Address, amount)
    
    // 2. Split position
    await ctf1155.splitPosition(
      market.collateralToken,
      ethers.ZeroHash, // parentCollectionId (0x0 for base positions)
      market.conditionId,
      [1, 2], // partition: [PASS index, FAIL index]
      amount
    )
  }
  
  return (
    <div className="position-splitter">
      <h3>Get Position Tokens</h3>
      <p>Split collateral to receive both PASS and FAIL position tokens</p>
      <input 
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount to split"
      />
      <button onClick={handleSplit}>Split Position</button>
    </div>
  )
}
```

#### C. Display CTF Token Balances
```jsx
const PositionBalances = ({ market, userAddress }) => {
  const [passBalance, setPassBalance] = useState('0')
  const [failBalance, setFailBalance] = useState('0')
  
  useEffect(() => {
    const fetchBalances = async () => {
      // CTF1155 uses ERC1155 balanceOf
      const passBal = await ctf1155.balanceOf(userAddress, market.passPositionId)
      const failBal = await ctf1155.balanceOf(userAddress, market.failPositionId)
      
      setPassBalance(ethers.formatEther(passBal))
      setFailBalance(ethers.formatEther(failBal))
    }
    
    if (userAddress) {
      fetchBalances()
    }
  }, [userAddress, market])
  
  return (
    <div className="position-balances">
      <h3>Your Positions</h3>
      <div>PASS: {passBalance}</div>
      <div>FAIL: {failBalance}</div>
    </div>
  )
}
```

#### D. Position Merging UI
Allow users to merge positions back to collateral:

```jsx
const PositionMerger = ({ market }) => {
  const [amount, setAmount] = useState('')
  
  const handleMerge = async () => {
    // Merge PASS and FAIL positions back to collateral
    await ctf1155.mergePositions(
      market.collateralToken,
      ethers.ZeroHash,
      market.conditionId,
      [1, 2], // same partition used in split
      amount
    )
  }
  
  return (
    <div className="position-merger">
      <h3>Redeem Collateral</h3>
      <p>Merge PASS and FAIL tokens to get collateral back</p>
      <input 
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount to merge"
      />
      <button onClick={handleMerge}>Merge Positions</button>
    </div>
  )
}
```

### 3. MarketList Component

**File**: `frontend/src/components/MarketList.jsx` (or similar)

**Changes Needed**:
- Update market queries to handle CTF fields
- Display CTF badge/indicator
- Show condition status (prepared, resolved)

```jsx
const MarketCard = ({ market }) => {
  return (
    <div className="market-card">
      <div className="market-header">
        <h3>{market.question}</h3>
        <span className="ctf-badge">CTF1155</span>
      </div>
      
      <div className="market-details">
        <div>Status: {market.resolved ? 'Resolved' : 'Active'}</div>
        <div>Condition: {market.conditionId.slice(0, 10)}...</div>
      </div>
    </div>
  )
}
```

### 4. Position Redemption Component

**New Component Needed**: `frontend/src/components/PositionRedemption.jsx`

For resolved markets, users need to redeem winning positions:

```jsx
const PositionRedemption = ({ market }) => {
  const handleRedeem = async () => {
    // Check which outcome won
    const isPassWinner = market.passValue > market.failValue
    const winningIndex = isPassWinner ? 1 : 2
    
    // Redeem winning positions
    await ctf1155.redeemPositions(
      market.collateralToken,
      ethers.ZeroHash,
      market.conditionId,
      [winningIndex]
    )
  }
  
  return (
    <div className="position-redemption">
      <h3>Redeem Winning Positions</h3>
      <p>Market resolved: {market.passValue > market.failValue ? 'PASS Won' : 'FAIL Won'}</p>
      <button onClick={handleRedeem}>Claim Winnings</button>
    </div>
  )
}
```

## Contract Integration Hooks

### useCTF1155 Hook

Create `frontend/src/hooks/useCTF1155.js`:

```javascript
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import CTF1155ABI from '../abis/CTF1155.js'

export const useCTF1155 = (address) => {
  const [contract, setContract] = useState(null)
  
  useEffect(() => {
    const initContract = async () => {
      if (!address) return
      
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const ctf = new ethers.Contract(address, CTF1155ABI, signer)
      
      setContract(ctf)
    }
    
    initContract()
  }, [address])
  
  const splitPosition = async (collateral, conditionId, amount) => {
    if (!contract) throw new Error('Contract not initialized')
    
    const tx = await contract.splitPosition(
      collateral,
      ethers.ZeroHash,
      conditionId,
      [1, 2],
      amount
    )
    
    await tx.wait()
    return tx
  }
  
  const mergePositions = async (collateral, conditionId, amount) => {
    if (!contract) throw new Error('Contract not initialized')
    
    const tx = await contract.mergePositions(
      collateral,
      ethers.ZeroHash,
      conditionId,
      [1, 2],
      amount
    )
    
    await tx.wait()
    return tx
  }
  
  const redeemPositions = async (collateral, conditionId, indexSet) => {
    if (!contract) throw new Error('Contract not initialized')
    
    const tx = await contract.redeemPositions(
      collateral,
      ethers.ZeroHash,
      conditionId,
      [indexSet]
    )
    
    await tx.wait()
    return tx
  }
  
  const getBalance = async (userAddress, positionId) => {
    if (!contract) throw new Error('Contract not initialized')
    return await contract.balanceOf(userAddress, positionId)
  }
  
  return {
    contract,
    splitPosition,
    mergePositions,
    redeemPositions,
    getBalance
  }
}
```

### useMarketFactory Hook

Update `frontend/src/hooks/useMarketFactory.js`:

```javascript
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import MarketFactoryABI from '../abis/ConditionalMarketFactory.js'

export const useMarketFactory = (address) => {
  const [contract, setContract] = useState(null)
  
  useEffect(() => {
    const initContract = async () => {
      if (!address) return
      
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const factory = new ethers.Contract(address, MarketFactoryABI, signer)
      
      setContract(factory)
    }
    
    initContract()
  }, [address])
  
  const getMarket = async (marketId) => {
    if (!contract) throw new Error('Contract not initialized')
    return await contract.getMarket(marketId)
  }
  
  const deployMarket = async (params) => {
    if (!contract) throw new Error('Contract not initialized')
    
    const tx = await contract.deployMarketPair(
      params.proposalId,
      params.collateralToken,
      params.liquidityAmount,
      params.liquidityParameter,
      params.tradingPeriod,
      params.betType
    )
    
    const receipt = await tx.wait()
    
    // Extract MarketCreated and CTFMarketCreated events
    const marketCreatedEvent = receipt.logs.find(log => 
      log.topics[0] === ethers.id("MarketCreated(uint256,uint256,address,address,address,uint256,uint256,uint256,address,uint8)")
    )
    
    const ctfMarketEvent = receipt.logs.find(log =>
      log.topics[0] === ethers.id("CTFMarketCreated(uint256,bytes32,uint256,uint256)")
    )
    
    return {
      tx,
      receipt,
      marketCreatedEvent,
      ctfMarketEvent
    }
  }
  
  return {
    contract,
    getMarket,
    deployMarket
  }
}
```

## Styling Updates

### CTF Badge
Add to `MarketList.css`:

```css
.ctf-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### Position Cards
Add to `MarketTrading.css`:

```css
.position-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  margin: 16px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.position-card h3 {
  font-size: 1.25rem;
  margin-bottom: 16px;
  color: #1f2937;
}

.position-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
}

.position-info-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.position-info-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 4px;
}

.position-info-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  word-break: break-all;
}
```

## Configuration

Add contract addresses to `frontend/src/config/contracts.js`:

```javascript
export const CONTRACTS = {
  CTF1155: {
    address: process.env.VITE_CTF1155_ADDRESS || '0x...',
    abi: CTF1155ABI
  },
  ConditionalMarketFactory: {
    address: process.env.VITE_MARKET_FACTORY_ADDRESS || '0x...',
    abi: MarketFactoryABI
  }
}
```

## Testing Checklist

- [ ] Market creation displays CTF information
- [ ] Users can split collateral into positions
- [ ] Position balances display correctly (ERC1155)
- [ ] Users can merge positions back to collateral
- [ ] Resolved markets show redemption option
- [ ] Users can redeem winning positions
- [ ] CTF badge displays on market cards
- [ ] All CTF-related transactions have proper error handling
- [ ] Loading states during blockchain transactions
- [ ] Event listeners for CTF1155 events

## Migration Notes

### For Existing Markets
- Old ERC20 markets (if any exist) will continue to work
- New markets automatically use CTF1155
- Frontend should handle both gracefully during transition

### User Experience
- Educate users about position splitting/merging
- Provide tooltips explaining CTF concepts
- Show gas estimates for CTF operations
- Display transaction confirmations

## Resources

- [Gnosis CTF Documentation](https://docs.gnosis.io/conditionaltokens/)
- [ERC1155 Standard](https://eips.ethereum.org/EIPS/eip-1155)
- [CTF1155 Contract](../contracts/CTF1155.sol)
- [Updated ConditionalMarketFactory](../contracts/ConditionalMarketFactory.sol)

## Next Steps

1. Generate and add contract ABIs
2. Implement CTF1155 integration hooks
3. Update market creation flow
4. Add position splitting/merging UI
5. Implement position redemption
6. Test on testnet
7. Deploy to production

## Support

For questions or issues with CTF integration, refer to:
- Integration tests: `test/ConditionalMarketFactory.CTF.test.js`
- Contract documentation: `contracts/CTF1155.sol`
- Implementation summary: `CTF_IMPLEMENTATION_SUMMARY.md`
