# Blockchain Integration Guide

## Overview
The demo mode toggle connects to live blockchain data on Polygon Amoy (the Polymarket testnet) when users switch from Demo Mode to Live Mode.

## Architecture

### Configuration Layer (`config/contracts.js`)
Stores the contract addresses deployed for the active chain. The
`sync:frontend-contracts` script populates this map from
`deployments/<network>-<stage>-deployment.json` after each deploy:

```javascript
export const DEPLOYED_CONTRACTS = {
  friendGroupMarketFactory: '0x...',
  tieredRoleManager: '0x...',
  paymentProcessor: '0x...',
  // ...one entry per deployed contract
}
```

Supports environment variable overrides:
- `VITE_NETWORK_ID` - Network chain ID (default: 80002 for Polygon Amoy)
- `VITE_RPC_URL` - RPC endpoint (default: https://rpc-amoy.polygon.technology)
- `VITE_<CONTRACT>_ADDRESS` - Override an individual contract address

### ABI Layer (`abis/`)
Contains contract ABIs for:
- **FriendGroupMarketFactory** - Friend-market creation and resolution
- **TieredRoleManager** - Tiered membership and access control
- **PaymentProcessor** - Stablecoin-denominated tier purchases

Each ABI includes read functions (view/pure), write functions
(payable/non-payable), and event definitions.

### Blockchain Service (`utils/blockchainService.js`)
Handles all direct contract interactions:

```javascript
// Fetch markets from blockchain
const markets = await fetchMarketsFromBlockchain()

// Fetch proposals
const proposals = await fetchProposalsFromBlockchain()

// Fetch user positions
const positions = await fetchPositionsFromBlockchain(userAddress)
```

**Key Features:**
- Uses ethers.js v6 for contract interactions
- Transforms blockchain data to match frontend format
- Handles BigInt to string conversions
- Converts timestamps to ISO format

### Data Fetcher (`utils/dataFetcher.js`)
Routes between mock and blockchain data:

```javascript
export async function fetchMarkets(demoMode, contracts = null) {
  if (demoMode) {
    return getMockMarkets()
  }

  try {
    return await fetchMarketsFromBlockchain()
  } catch (error) {
    console.error('Failed to fetch from blockchain:', error)
    return getMockMarkets() // Graceful fallback
  }
}
```

## Data Transformation

Blockchain data is transformed to match the frontend schema:

### Market Data
```javascript
// Blockchain format
{
  id: BigInt,
  question: string,
  yesPrice: BigInt (wei),
  endTime: BigInt (unix timestamp),
  status: uint8
}

// Frontend format
{
  id: number,
  proposalTitle: string,
  passTokenPrice: string (ether),
  tradingEndTime: string (ISO),
  status: string ('Active', 'Closed', etc.)
}
```

### Status Mappings
- **Markets**: 0=Active, 1=Closed, 2=Resolved, 3=Cancelled
- **Proposals**: 0=Reviewing, 1=Active, 2=Executed, 3=Cancelled, 4=Forfeited

## Error Handling

All blockchain calls include try-catch blocks with fallback:

```javascript
try {
  return await fetchMarketsFromBlockchain()
} catch (error) {
  console.error('Failed to fetch from blockchain:', error)
  console.warn('Falling back to mock data')
  return getMockMarkets()
}
```

This ensures the application remains functional even if:
- Network is down
- RPC endpoint is unavailable
- Contract calls fail
- User has no internet connection

## Performance Optimization

The `useDataFetcher` hook is memoized to prevent unnecessary re-renders:

```javascript
// Individual functions memoized with useCallback
const getMarkets = useCallback(
  (contracts = null) => fetchMarkets(demoMode, contracts),
  [demoMode]
)

// Returned object memoized with useMemo
return useMemo(
  () => ({ demoMode, getMarkets, ... }),
  [demoMode, getMarkets, ...]
)
```

This ensures components using the hook don't re-render unless `demoMode` actually changes.

## Usage Example

```javascript
import { useDataFetcher } from '../hooks/useDataFetcher'

function MarketList() {
  const { getMarkets, demoMode } = useDataFetcher()
  const [markets, setMarkets] = useState([])

  useEffect(() => {
    async function loadMarkets() {
      const data = await getMarkets()
      setMarkets(data)
    }
    loadMarkets()
  }, [getMarkets])

  return (
    <div>
      {demoMode && <Banner>Using demo data</Banner>}
      {markets.map(market => <MarketCard key={market.id} {...market} />)}
    </div>
  )
}
```

## Testing Live Mode

1. Build the frontend: `npm run build`
2. Start dev server: `npm run dev`
3. Connect a wallet
4. Open User Management modal
5. Go to Profile tab
6. Toggle "Switch to Live Mode"
7. Markets will be fetched from Polygon Amoy

## Troubleshooting

### "Failed to fetch from blockchain" error
- Check RPC endpoint is accessible
- Verify network connection
- Check browser console for detailed error
- Falls back to mock data automatically

### Empty data from blockchain
- Contracts may not have any data yet
- Check contract addresses in `config/contracts.js`
- Verify contracts are deployed on Polygon Amoy

### Slow loading
- Blockchain queries can be slower than mock data
- Multiple contract calls happen in parallel
- Consider adding loading states in UI

## Future Enhancements

1. **Contract Instance Caching** - Reuse contract instances
2. **Query Batching** - Combine multiple calls
3. **Local Caching** - Cache blockchain data temporarily
4. **Websocket Support** - Real-time updates
5. **Multi-network Support** - Support mainnet and other testnets
