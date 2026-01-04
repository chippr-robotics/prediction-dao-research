# IPFS Integration Documentation

This document explains how to use the IPFS integration for retrieving token and market data from the permanent IPFS gateway at `ipfs.fairwins.app`.

## Overview

The IPFS integration provides a complete solution for accessing data stored on IPFS, including:

- **Configuration**: Constants and settings for IPFS gateway access
- **Service Layer**: Low-level functions for fetching and caching IPFS data
- **React Hooks**: High-level hooks for easy component integration

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# IPFS Gateway URL
VITE_IPFS_GATEWAY=https://ipfs.fairwins.app
```

### Default Configuration

The following defaults are used if not specified in environment variables:

- **Gateway**: `https://ipfs.fairwins.app`
- **Timeout**: 30 seconds
- **Max Retries**: 3 attempts
- **Retry Delay**: 1 second (with exponential backoff)
- **Cache Duration**: 5 minutes

## Usage

### Using React Hooks (Recommended)

React hooks provide the easiest way to integrate IPFS data into your components.

#### Fetching Token Metadata

```javascript
import { useTokenMetadata } from '../hooks/useIpfs'

function TokenDisplay({ tokenAddress }) {
  const { metadata, loading, error, refetch } = useTokenMetadata(tokenAddress)

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <h3>{metadata.name} ({metadata.symbol})</h3>
      <p>Decimals: {metadata.decimals}</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

#### Fetching Market Data

```javascript
import { useMarketData } from '../hooks/useIpfs'

function MarketDisplay({ marketId }) {
  const { marketData, loading, error } = useMarketData(marketId)

  if (loading) return <div>Loading market data...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <p>Volume: {marketData.volume}</p>
      <p>Status: {marketData.status}</p>
    </div>
  )
}
```

#### Fetching by IPFS CID

```javascript
import { useIpfsByCid } from '../hooks/useIpfs'

function IpfsContent({ cid }) {
  const { data, loading, error } = useIpfsByCid(cid)

  if (loading) return <div>Loading from IPFS...</div>
  if (error) return <div>Error: {error}</div>

  return <pre>{JSON.stringify(data, null, 2)}</pre>
}
```

#### Batch Fetching

```javascript
import { useBatchIpfs } from '../hooks/useIpfs'

function BatchDataDisplay() {
  const paths = ['/market/1/data.json', '/market/2/data.json', '/market/3/data.json']
  const { data, loading, error } = useBatchIpfs(paths)

  if (loading) return <div>Loading multiple items...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <ul>
      {data.map((item, index) => (
        <li key={index}>{item ? item.name : 'Failed to load'}</li>
      ))}
    </ul>
  )
}
```

#### Cache Management

```javascript
import { useIpfsCache } from '../hooks/useIpfs'

function CacheControls() {
  const { clearAll, clearEntry } = useIpfsCache()

  return (
    <div>
      <button onClick={clearAll}>Clear All Cache</button>
      <button onClick={() => clearEntry('/market/123/data.json')}>
        Clear Specific Entry
      </button>
    </div>
  )
}
```

### Using Service Functions Directly

For more control or use outside of React components:

```javascript
import {
  fetchTokenMetadata,
  fetchMarketData,
  fetchByCid,
  batchFetch,
} from '../utils/ipfsService'

// Fetch token metadata
const tokenMetadata = await fetchTokenMetadata('0x1234...')

// Fetch market data
const marketData = await fetchMarketData('market-123')

// Fetch by CID
const data = await fetchByCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')

// Batch fetch
const results = await batchFetch(['/path1', '/path2', '/path3'])

// Skip cache
const freshData = await fetchTokenMetadata('0x1234...', { skipCache: true })
```

## API Reference

### React Hooks

#### `useIpfs(path, options)`

Generic hook for fetching IPFS data.

**Parameters:**
- `path` (string): IPFS path or CID
- `options.enabled` (boolean): Whether to auto-fetch (default: true)
- `options.skipCache` (boolean): Skip cache on fetch (default: false)

**Returns:**
- `data`: Fetched data
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch
- `clearCached()`: Function to clear cached entry

#### `useTokenMetadata(tokenAddress, options)`

Hook for fetching token metadata.

**Parameters:**
- `tokenAddress` (string): Token contract address
- `options`: Same as `useIpfs`

**Returns:**
- `metadata`: Token metadata object
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch

#### `useMarketData(marketId, options)`

Hook for fetching market data.

**Parameters:**
- `marketId` (string): Market identifier
- `options`: Same as `useIpfs`

**Returns:**
- `marketData`: Market data object
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch

#### `useMarketMetadata(marketId, options)`

Hook for fetching market metadata.

**Parameters:**
- `marketId` (string): Market identifier
- `options`: Same as `useIpfs`

**Returns:**
- `metadata`: Market metadata object
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch

#### `useIpfsByCid(cid, options)`

Hook for fetching data by CID.

**Parameters:**
- `cid` (string): IPFS content identifier
- `options`: Same as `useIpfs`

**Returns:**
- `data`: Fetched data
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch

#### `useBatchIpfs(paths, options)`

Hook for batch fetching multiple items.

**Parameters:**
- `paths` (Array<string>): Array of IPFS paths or CIDs
- `options`: Same as `useIpfs`

**Returns:**
- `data`: Array of results (null for failed fetches)
- `loading`: Loading state
- `error`: Error message if any
- `refetch()`: Function to manually refetch

#### `useIpfsCache()`

Hook for cache management.

**Returns:**
- `clearAll()`: Clear all cached data
- `clearEntry(path)`: Clear specific cache entry

### Service Functions

#### `fetchFromIpfs(path, options)`

Low-level function to fetch data from IPFS.

#### `fetchTokenMetadata(tokenAddress, options)`

Fetch token metadata by address.

#### `fetchMarketData(marketId, options)`

Fetch market data by ID.

#### `fetchMarketMetadata(marketId, options)`

Fetch market metadata by ID.

#### `fetchByCid(cid, options)`

Fetch data by IPFS CID.

#### `batchFetch(paths, options)`

Fetch multiple items in parallel.

#### `clearCache()`

Clear all cached data.

#### `clearCacheEntry(key)`

Clear specific cache entry.

#### `checkGatewayHealth()`

Check if IPFS gateway is accessible.

## Path Conventions

The integration expects the following path structure on IPFS:

- **Token Metadata**: `/token/{tokenAddress}/metadata.json`
- **Market Data**: `/market/{marketId}/data.json`
- **Market Metadata**: `/market/{marketId}/metadata.json`

## Error Handling

All hooks and service functions handle errors gracefully:

- Network errors trigger retries (up to 3 attempts)
- Timeouts are handled automatically (30 second default)
- Failed batch fetches return `null` for failed items
- Error messages are provided through the `error` field in hooks

## Caching

The integration includes automatic caching with the following behavior:

- Cache duration: 5 minutes by default
- Cached data is stored in memory
- Cache can be bypassed using `skipCache` option
- Cache can be manually cleared using cache management functions

## Testing

Comprehensive test coverage is included:

- `src/test/ipfsConstants.test.js`: Configuration tests
- `src/test/ipfsService.test.js`: Service layer tests
- `src/test/useIpfs.test.js`: React hooks tests

Run tests:
```bash
npm test src/test/ipfs*.test.js
```

## Example: Complete Component

```javascript
import React, { useState } from 'react'
import { useTokenMetadata, useIpfsCache } from '../hooks/useIpfs'

function TokenManager({ tokenAddress }) {
  const [showDetails, setShowDetails] = useState(false)
  const { metadata, loading, error, refetch } = useTokenMetadata(tokenAddress)
  const { clearEntry } = useIpfsCache()

  const handleRefresh = () => {
    clearEntry(`/token/${tokenAddress}/metadata.json`)
    refetch()
  }

  if (loading) {
    return <div className="loading">Loading token metadata...</div>
  }

  if (error) {
    return (
      <div className="error">
        <p>Failed to load token: {error}</p>
        <button onClick={refetch}>Retry</button>
      </div>
    )
  }

  return (
    <div className="token-card">
      <h3>{metadata.name}</h3>
      <p className="symbol">{metadata.symbol}</p>
      <button onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? 'Hide' : 'Show'} Details
      </button>
      <button onClick={handleRefresh}>Refresh</button>
      
      {showDetails && (
        <div className="details">
          <p>Decimals: {metadata.decimals}</p>
          <pre>{JSON.stringify(metadata, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export default TokenManager
```

## Troubleshooting

### Gateway not accessible

Check gateway health:
```javascript
import { checkGatewayHealth } from '../utils/ipfsService'

const isHealthy = await checkGatewayHealth()
if (!isHealthy) {
  console.error('IPFS gateway is not accessible')
}
```

### Cache issues

Clear cache if data seems stale:
```javascript
import { clearCache } from '../utils/ipfsService'

clearCache() // Clear all cached data
```

### Timeout errors

Increase timeout in configuration if needed (requires code modification in `ipfsService.js`).

## Future Enhancements

Potential improvements for future versions:

- Configurable timeout and retry settings via environment variables
- Persistent cache using localStorage or IndexedDB
- Support for multiple IPFS gateways with fallback
- Progress indicators for large file downloads
- Support for IPFS pinning
- Integration with IPFS pubsub for real-time updates
