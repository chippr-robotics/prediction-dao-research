# Migration Guide: Mock Data to IPFS Metadata

## Overview

This guide provides step-by-step instructions for migrating from the current mock data system (`frontend/src/mock-data.json`) to production-ready IPFS metadata storage following OpenSea standards.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Setup](#phase-1-setup)
3. [Phase 2: Metadata Generation](#phase-2-metadata-generation)
4. [Phase 3: IPFS Upload](#phase-3-ipfs-upload)
5. [Phase 4: Contract Integration](#phase-4-contract-integration)
6. [Phase 5: Frontend Migration](#phase-5-frontend-migration)
7. [Phase 6: Testing & Validation](#phase-6-testing--validation)
8. [Phase 7: Production Deployment](#phase-7-production-deployment)
9. [Rollback Plan](#rollback-plan)

---

## Prerequisites

Before starting the migration:

- ✅ Master Data Plan reviewed (`MASTER_DATA_PLAN.md`)
- ✅ MetadataRegistry contract deployed to testnet
- ✅ IPFS node access (public gateway or dedicated node)
- ✅ Metadata schemas defined (`frontend/src/schemas/`)
- ✅ Metadata generation utilities ready (`frontend/src/utils/metadataGenerator.js`)

---

## Phase 1: Setup

### 1.1 Deploy MetadataRegistry Contract

```bash
# Deploy to Mordor testnet
npx hardhat run scripts/deploy-metadata-registry.js --network mordor

# Verify contract on block explorer
npx hardhat verify --network mordor <CONTRACT_ADDRESS>
```

### 1.2 Configure IPFS Access

Update `.env`:
```env
# IPFS Configuration
VITE_IPFS_GATEWAY=https://ipfs.fairwins.app
VITE_IPFS_API_ENDPOINT=https://api.ipfs.fairwins.app
VITE_METADATA_REGISTRY_ADDRESS=0x... # From deployment

# Feature Flags
VITE_USE_IPFS_METADATA=false  # Start disabled
VITE_IPFS_FALLBACK_TO_MOCK=true  # Fallback enabled
```

### 1.3 Install Dependencies

```bash
# Install IPFS client library (if using node upload)
npm install ipfs-http-client

# Or use pinning service client
npm install @pinata/sdk
```

---

## Phase 2: Metadata Generation

### 2.1 Create Migration Script

Create `scripts/migrate-mock-to-ipfs.js`:

```javascript
const fs = require('fs')
const path = require('path')
const mockData = require('../frontend/src/mock-data.json')
const { convertMockMarketToMetadata } = require('../frontend/src/utils/metadataGenerator')

// Output directory for generated metadata
const OUTPUT_DIR = './metadata-output'

async function generateAllMetadata() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Generate market metadata
  const marketsDir = path.join(OUTPUT_DIR, 'markets')
  fs.mkdirSync(marketsDir, { recursive: true })

  for (const market of mockData.markets) {
    const metadata = convertMockMarketToMetadata(market)
    const marketDir = path.join(marketsDir, market.id.toString())
    fs.mkdirSync(marketDir, { recursive: true })
    
    fs.writeFileSync(
      path.join(marketDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )
    
    console.log(`Generated metadata for market ${market.id}`)
  }

  // Generate token metadata
  const tokensDir = path.join(OUTPUT_DIR, 'tokens')
  fs.mkdirSync(tokensDir, { recursive: true })

  for (const token of mockData.tokens) {
    // Convert mock token to metadata format
    const metadata = {
      name: token.name,
      symbol: token.symbol,
      description: `Token created on FairWins platform`,
      image: `ipfs://QmDefaultTokenLogo`,
      attributes: [
        { trait_type: 'Token Type', value: token.tokenType },
        { trait_type: 'Total Supply', value: parseInt(token.totalSupply), display_type: 'number' }
      ],
      properties: {
        token_address: token.tokenAddress,
        created_at: token.createdAt
      }
    }
    
    const tokenDir = path.join(tokensDir, token.tokenAddress)
    fs.mkdirSync(tokenDir, { recursive: true })
    
    fs.writeFileSync(
      path.join(tokenDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )
    
    console.log(`Generated metadata for token ${token.tokenAddress}`)
  }

  console.log('Metadata generation complete!')
}

generateAllMetadata().catch(console.error)
```

### 2.2 Run Generation

```bash
node scripts/migrate-mock-to-ipfs.js
```

This creates a `metadata-output/` directory with all generated metadata files.

### 2.3 Validate Generated Metadata

```bash
# Run validation script
node scripts/validate-metadata.js

# Should output:
# ✓ All market metadata valid
# ✓ All token metadata valid
# ✓ Schemas validated successfully
```

---

## Phase 3: IPFS Upload

### 3.1 Upload to IPFS

Choose one of the following methods:

#### Option A: Using Pinata (Recommended for Production)

```javascript
// scripts/upload-to-pinata.js
const pinataSDK = require('@pinata/sdk')
const fs = require('fs')
const path = require('path')

const pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY)

async function uploadDirectory(dirPath, resourceType) {
  const files = fs.readdirSync(dirPath)
  const cidMapping = {}

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    if (fs.statSync(filePath).isDirectory()) {
      const metadataPath = path.join(filePath, 'metadata.json')
      const resourceId = path.basename(file)
      
      const result = await pinata.pinFromFS(metadataPath, {
        pinataMetadata: {
          name: `${resourceType}-${resourceId}-metadata`,
          keyvalues: {
            type: resourceType,
            id: resourceId
          }
        }
      })
      
      cidMapping[resourceId] = result.IpfsHash
      console.log(`Uploaded ${resourceType} ${resourceId}: ${result.IpfsHash}`)
    }
  }

  return cidMapping
}

async function main() {
  const marketCids = await uploadDirectory('./metadata-output/markets', 'market')
  const tokenCids = await uploadDirectory('./metadata-output/tokens', 'token')
  
  // Save CID mapping for next phase
  fs.writeFileSync(
    './metadata-output/cid-mapping.json',
    JSON.stringify({ markets: marketCids, tokens: tokenCids }, null, 2)
  )
  
  console.log('Upload complete! CID mapping saved.')
}

main().catch(console.error)
```

#### Option B: Using IPFS Node

```javascript
// scripts/upload-to-ipfs.js
const { create } = require('ipfs-http-client')
const fs = require('fs')
const path = require('path')

const ipfs = create({ url: process.env.IPFS_API_ENDPOINT })

async function uploadFile(filePath) {
  const content = fs.readFileSync(filePath)
  const result = await ipfs.add(content)
  return result.cid.toString()
}

async function main() {
  // Similar logic to Pinata option
}

main().catch(console.error)
```

### 3.2 Run Upload

```bash
# Set API credentials
export PINATA_API_KEY="your_api_key"
export PINATA_SECRET_KEY="your_secret_key"

# Run upload
node scripts/upload-to-pinata.js

# Output will be saved to metadata-output/cid-mapping.json
```

---

## Phase 4: Contract Integration

### 4.1 Register CIDs in MetadataRegistry

```javascript
// scripts/register-cids.js
const hre = require("hardhat")
const fs = require('fs')

async function main() {
  const cidMapping = JSON.parse(
    fs.readFileSync('./metadata-output/cid-mapping.json', 'utf8')
  )
  
  const MetadataRegistry = await hre.ethers.getContractFactory("MetadataRegistry")
  const registry = MetadataRegistry.attach(process.env.METADATA_REGISTRY_ADDRESS)
  
  // Register market CIDs
  console.log('Registering market metadata...')
  for (const [marketId, cid] of Object.entries(cidMapping.markets)) {
    const tx = await registry.setMetadataById("market", marketId, cid)
    await tx.wait()
    console.log(`Registered market ${marketId}: ${cid}`)
  }
  
  // Register token CIDs
  console.log('Registering token metadata...')
  for (const [tokenAddress, cid] of Object.entries(cidMapping.tokens)) {
    const tx = await registry.setMetadata("token", tokenAddress, cid)
    await tx.wait()
    console.log(`Registered token ${tokenAddress}: ${cid}`)
  }
  
  console.log('All CIDs registered successfully!')
}

main().catch(console.error)
```

### 4.2 Run Registration

```bash
npx hardhat run scripts/register-cids.js --network mordor
```

### 4.3 Verify Registration

```javascript
// scripts/verify-registration.js
const hre = require("hardhat")

async function main() {
  const registry = await hre.ethers.getContractAt(
    "MetadataRegistry",
    process.env.METADATA_REGISTRY_ADDRESS
  )
  
  // Check a few markets
  const market1 = await registry.getMetadataById("market", 0)
  console.log("Market 0 CID:", market1)
  
  const market2 = await registry.getMetadataById("market", 11)
  console.log("Market 11 CID:", market2)
  
  // Verify IPFS accessibility
  const response = await fetch(`https://ipfs.fairwins.app/ipfs/${market1}`)
  const metadata = await response.json()
  console.log("Market 0 metadata:", metadata.name)
}

main().catch(console.error)
```

---

## Phase 5: Frontend Migration

### 5.1 Create Metadata Service

```javascript
// frontend/src/services/metadataService.js
import { fetchFromIpfs } from '../utils/ipfsService'
import { ethers } from 'ethers'
import MetadataRegistryABI from '../abis/MetadataRegistry.json'

const REGISTRY_ADDRESS = import.meta.env.VITE_METADATA_REGISTRY_ADDRESS
const USE_IPFS = import.meta.env.VITE_USE_IPFS_METADATA === 'true'
const FALLBACK_TO_MOCK = import.meta.env.VITE_IPFS_FALLBACK_TO_MOCK === 'true'

// Fallback to mock data
import { getMockMarkets, getMockMarketById } from '../utils/mockDataLoader'

export async function getMarketMetadata(marketId) {
  if (!USE_IPFS && FALLBACK_TO_MOCK) {
    return getMockMarketById(marketId)
  }
  
  try {
    // Get CID from registry
    const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL)
    const registry = new ethers.Contract(REGISTRY_ADDRESS, MetadataRegistryABI, provider)
    const cid = await registry.getMetadataById("market", marketId)
    
    // Fetch from IPFS
    const metadata = await fetchFromIpfs(cid)
    
    return metadata
  } catch (error) {
    console.error('Error fetching market metadata from IPFS:', error)
    
    if (FALLBACK_TO_MOCK) {
      console.log('Falling back to mock data')
      return getMockMarketById(marketId)
    }
    
    throw error
  }
}

export async function getAllMarkets() {
  if (!USE_IPFS && FALLBACK_TO_MOCK) {
    return getMockMarkets()
  }
  
  // Implementation for fetching all markets from IPFS
  // This would typically involve querying an indexer or subgraph
  // that tracks all market IDs
}
```

### 5.2 Update Components Gradually

Start with a single component:

```javascript
// Before (MarketTile.jsx)
import { getMockMarketById } from '../utils/mockDataLoader'

function MarketTile({ marketId }) {
  const [market, setMarket] = useState(null)
  
  useEffect(() => {
    const data = getMockMarketById(marketId)
    setMarket(data)
  }, [marketId])
  
  // ... render
}

// After
import { getMarketMetadata } from '../services/metadataService'

function MarketTile({ marketId }) {
  const [market, setMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    async function fetchMetadata() {
      try {
        setLoading(true)
        const data = await getMarketMetadata(marketId)
        setMarket(data)
      } catch (err) {
        setError(err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchMetadata()
  }, [marketId])
  
  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  
  // ... render
}
```

### 5.3 Enable IPFS Gradually

```env
# Start with feature flag disabled
VITE_USE_IPFS_METADATA=false
VITE_IPFS_FALLBACK_TO_MOCK=true

# Enable for testing
VITE_USE_IPFS_METADATA=true
VITE_IPFS_FALLBACK_TO_MOCK=true

# Full IPFS mode (no fallback)
VITE_USE_IPFS_METADATA=true
VITE_IPFS_FALLBACK_TO_MOCK=false
```

---

## Phase 6: Testing & Validation

### 6.1 Component Testing

```javascript
// Test with both data sources
describe('MarketTile', () => {
  it('should render with mock data', async () => {
    // Test with VITE_USE_IPFS_METADATA=false
  })
  
  it('should render with IPFS data', async () => {
    // Test with VITE_USE_IPFS_METADATA=true
  })
  
  it('should fallback to mock on IPFS error', async () => {
    // Test fallback behavior
  })
})
```

### 6.2 Integration Testing

```bash
# Run full test suite with IPFS enabled
VITE_USE_IPFS_METADATA=true npm run test

# Run E2E tests
npm run test:e2e
```

### 6.3 Performance Testing

Monitor:
- IPFS fetch times
- Cache hit rates
- Error rates
- Fallback frequency

```javascript
// Add performance monitoring
const startTime = performance.now()
const metadata = await getMarketMetadata(marketId)
const endTime = performance.now()

console.log(`IPFS fetch took ${endTime - startTime}ms`)
```

---

## Phase 7: Production Deployment

### 7.1 Deploy to Mainnet

```bash
# Deploy MetadataRegistry to mainnet
npx hardhat run scripts/deploy-metadata-registry.js --network mainnet

# Verify contract
npx hardhat verify --network mainnet <CONTRACT_ADDRESS>
```

### 7.2 Upload Production Metadata

```bash
# Upload to production IPFS
node scripts/upload-to-pinata.js --production

# Register in mainnet contract
npx hardhat run scripts/register-cids.js --network mainnet
```

### 7.3 Update Production Environment

```env
# Production .env
VITE_IPFS_GATEWAY=https://ipfs.fairwins.app
VITE_METADATA_REGISTRY_ADDRESS=0x... # Mainnet address
VITE_USE_IPFS_METADATA=true
VITE_IPFS_FALLBACK_TO_MOCK=true  # Keep enabled initially

# RPC endpoint
VITE_RPC_URL=https://etc.etccooperative.org
```

### 7.4 Gradual Rollout

1. **Week 1**: Deploy with fallback enabled, monitor errors
2. **Week 2**: Fix any issues, optimize performance
3. **Week 3**: Disable fallback for 50% of users (A/B test)
4. **Week 4**: Disable fallback for all users if stable

### 7.5 Monitoring Setup

```javascript
// Add error tracking
import * as Sentry from '@sentry/react'

try {
  const metadata = await getMarketMetadata(marketId)
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'metadata-service',
      marketId: marketId
    }
  })
}
```

---

## Rollback Plan

If issues arise, rollback steps:

### Emergency Rollback (Immediate)

```env
# Disable IPFS, return to mock data
VITE_USE_IPFS_METADATA=false
VITE_IPFS_FALLBACK_TO_MOCK=true

# Redeploy frontend
npm run build
# Deploy to hosting
```

### Partial Rollback

```env
# Keep IPFS but enable fallback
VITE_USE_IPFS_METADATA=true
VITE_IPFS_FALLBACK_TO_MOCK=true
```

### Contract Rollback

If MetadataRegistry has issues:

1. Deploy fixed version
2. Copy data from old contract to new contract
3. Update frontend to use new contract address

---

## Post-Migration Tasks

### Remove Mock Data (Final Step)

Only after IPFS is stable for 2+ weeks:

```bash
# Remove mock data file
rm frontend/src/mock-data.json

# Remove mock data loader
rm frontend/src/utils/mockDataLoader.js

# Remove related tests
rm frontend/src/test/mockDataLoader.test.js

# Update imports across codebase
# Remove all references to mock data
```

### Update Documentation

- Update README with IPFS usage
- Document metadata update procedures
- Create runbook for operators

---

## Troubleshooting

### Issue: IPFS Gateway Timeout

**Solution**: 
- Increase timeout in ipfsService.js
- Use multiple gateway fallbacks
- Pin frequently accessed content

### Issue: Invalid Metadata

**Solution**:
- Validate before upload using schemas
- Run validation script regularly
- Fix and re-upload to IPFS
- Update CID in MetadataRegistry

### Issue: High IPFS Costs

**Solution**:
- Optimize caching strategy
- Use CDN in front of IPFS gateway
- Batch fetch related metadata
- Implement local storage cache

---

## Success Metrics

Track these metrics throughout migration:

- ✅ IPFS fetch success rate > 99%
- ✅ Average fetch time < 500ms
- ✅ Cache hit rate > 80%
- ✅ Zero data loss
- ✅ Zero downtime
- ✅ User experience maintained or improved

---

## Support & Resources

- **Documentation**: `/MASTER_DATA_PLAN.md`
- **IPFS Integration**: `/IPFS_IMPLEMENTATION_SUMMARY.md`
- **Contract Tests**: `/test/MetadataRegistry.test.js`
- **Schemas**: `/frontend/src/schemas/`
- **Migration Scripts**: `/scripts/migrate-*.js`

---

*Last Updated: 2024-12-28*  
*Version: 1.0*
