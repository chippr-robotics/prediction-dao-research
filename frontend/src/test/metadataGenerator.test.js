/**
 * @fileoverview Tests for metadata generation utilities
 */

import { describe, it, expect } from 'vitest'
import {
  generateMarketMetadata,
  generateTokenMetadata,
  generateProposalMetadata,
  generateDAOMetadata,
  validateMetadata,
  convertMockMarketToMetadata
} from '../utils/metadataGenerator'

describe('generateMarketMetadata', () => {
  it('should generate basic market metadata', () => {
    const metadata = generateMarketMetadata({
      marketId: 123,
      name: 'Bitcoin reaches $100K',
      description: 'Will Bitcoin reach $100,000 in 2025?',
      category: 'crypto',
      onChainData: {
        status: 'Active'
      }
    })

    expect(metadata.name).toBe('Bitcoin reaches $100K')
    expect(metadata.description).toBe('Will Bitcoin reach $100,000 in 2025?')
    expect(metadata.external_url).toBe('https://fairwins.app/market/123')
    expect(metadata.attributes).toBeInstanceOf(Array)
    expect(metadata.attributes).toContainEqual({
      trait_type: 'Category',
      value: 'crypto'
    })
    expect(metadata.properties.market_id).toBe(123)
  })

  it('should include resolution criteria in description', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test Market',
      description: 'Base description',
      category: 'test',
      resolutionCriteria: 'Market resolves when price hits $100K',
      onChainData: {}
    })

    expect(metadata.description).toContain('Base description')
    expect(metadata.description).toContain('**Resolution Criteria:**')
    expect(metadata.description).toContain('Market resolves when price hits $100K')
  })

  it('should add numeric attributes from on-chain data', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      onChainData: {
        totalLiquidity: '125000',
        passTokenPrice: '0.59',
        failTokenPrice: '0.41'
      }
    })

    expect(metadata.attributes).toContainEqual({
      trait_type: 'Total Liquidity',
      value: 125000,
      display_type: 'number'
    })
    expect(metadata.attributes).toContainEqual({
      trait_type: 'Pass Token Price',
      value: 0.59,
      display_type: 'number',
      max_value: 1.0
    })
  })

  it('should handle trading end time as date attribute', () => {
    const endTime = '2025-07-19T00:00:00Z'
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      onChainData: {
        tradingEndTime: endTime
      }
    })

    const dateAttr = metadata.attributes.find(a => a.trait_type === 'Trading End Time')
    expect(dateAttr).toBeDefined()
    expect(dateAttr.display_type).toBe('date')
    expect(dateAttr.value).toBe(Math.floor(new Date(endTime).getTime() / 1000))
  })

  it('should include optional properties', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      subcategory: 'price',
      backgroundColor: 'FF6B35',
      passToken: '0xabc',
      failToken: '0xdef',
      creator: '0x123',
      correlationGroupId: 'btc-2025',
      tags: ['bitcoin', 'price'],
      oracleSources: ['Chainlink', 'CoinGecko'],
      onChainData: {}
    })

    expect(metadata.background_color).toBe('FF6B35')
    expect(metadata.properties.pass_token).toBe('0xabc')
    expect(metadata.properties.fail_token).toBe('0xdef')
    expect(metadata.properties.creator).toBe('0x123')
    expect(metadata.properties.correlation_group_id).toBe('btc-2025')
    expect(metadata.properties.tags).toEqual(['bitcoin', 'price'])
    expect(metadata.properties.oracle_sources).toEqual(['Chainlink', 'CoinGecko'])
  })

  it('should strip # from background color', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      backgroundColor: '#FF6B35',
      onChainData: {}
    })

    expect(metadata.background_color).toBe('FF6B35')
  })
})

describe('generateTokenMetadata', () => {
  it('should generate basic token metadata', () => {
    const metadata = generateTokenMetadata({
      name: 'FairWins Governance',
      symbol: 'FWIN',
      description: 'Governance token for FairWins DAO',
      tokenAddress: '0xtoken123'
    })

    expect(metadata.name).toBe('FairWins Governance')
    expect(metadata.symbol).toBe('FWIN')
    expect(metadata.description).toBe('Governance token for FairWins DAO')
    expect(metadata.properties.token_address).toBe('0xtoken123')
    expect(metadata.properties.decimals).toBe(18)
  })

  it('should include tokenomics in attributes and properties', () => {
    const metadata = generateTokenMetadata({
      name: 'Test Token',
      symbol: 'TEST',
      description: 'Test',
      tokenAddress: '0xtest',
      tokenomics: {
        totalSupply: 100000000,
        maxSupply: 100000000,
        distribution: {
          community: 40,
          team: 20
        }
      }
    })

    expect(metadata.properties.tokenomics).toBeDefined()
    expect(metadata.properties.tokenomics.totalSupply).toBe(100000000)
    expect(metadata.attributes).toContainEqual({
      trait_type: 'Total Supply',
      value: 100000000,
      display_type: 'number'
    })
  })

  it('should include utility and links', () => {
    const metadata = generateTokenMetadata({
      name: 'Test',
      symbol: 'TEST',
      description: 'Test',
      tokenAddress: '0xtest',
      utility: ['Governance', 'Staking'],
      links: {
        website: 'https://example.com',
        twitter: 'https://twitter.com/example'
      }
    })

    expect(metadata.properties.utility).toEqual(['Governance', 'Staking'])
    expect(metadata.properties.links.website).toBe('https://example.com')
    expect(metadata.external_url).toBe('https://example.com')
  })
})

describe('generateProposalMetadata', () => {
  it('should generate basic proposal metadata', () => {
    const metadata = generateProposalMetadata({
      proposalId: 1,
      title: 'Security Audit',
      description: 'Fund security audit',
      fundingAmount: 40000
    })

    expect(metadata.name).toBe('Security Audit')
    expect(metadata.description).toBe('Fund security audit')
    expect(metadata.properties.proposal_id).toBe(1)
    expect(metadata.attributes).toContainEqual({
      trait_type: 'Funding Amount',
      value: 40000,
      display_type: 'number'
    })
  })

  it('should include milestones, documents, and team', () => {
    const metadata = generateProposalMetadata({
      proposalId: 1,
      title: 'Test',
      description: 'Test',
      fundingAmount: 1000,
      milestones: [
        { description: 'Phase 1', percentage: 5000 }
      ],
      documents: [
        { name: 'Proposal PDF', url: 'ipfs://QmXXX' }
      ],
      team: [
        { name: 'Alice', role: 'Lead' }
      ]
    })

    expect(metadata.properties.milestones).toHaveLength(1)
    expect(metadata.properties.documents).toHaveLength(1)
    expect(metadata.properties.team).toHaveLength(1)
  })
})

describe('generateDAOMetadata', () => {
  it('should generate basic DAO metadata', () => {
    const metadata = generateDAOMetadata({
      name: 'ETC Treasury DAO',
      description: 'Main governance DAO',
      daoAddress: '0xdao123',
      governanceType: 'futarchy'
    })

    expect(metadata.name).toBe('ETC Treasury DAO')
    expect(metadata.description).toBe('Main governance DAO')
    expect(metadata.properties.dao_address).toBe('0xdao123')
    expect(metadata.attributes).toContainEqual({
      trait_type: 'Governance Type',
      value: 'Futarchy'
    })
  })

  it('should include contracts, governance, and welfare metrics', () => {
    const metadata = generateDAOMetadata({
      name: 'Test DAO',
      description: 'Test',
      daoAddress: '0xdao',
      contracts: {
        governor: '0xgov',
        treasury: '0xtreasury'
      },
      governance: {
        type: 'futarchy',
        quorum: 40
      },
      welfareMetrics: [
        { id: 0, name: 'Treasury Value', weight: 5000 }
      ]
    })

    expect(metadata.properties.contracts.governor).toBe('0xgov')
    expect(metadata.properties.governance.quorum).toBe(40)
    expect(metadata.properties.welfare_metrics).toHaveLength(1)
  })

  it('should capitalize governance type', () => {
    const metadata1 = generateDAOMetadata({
      name: 'Test',
      description: 'Test',
      daoAddress: '0x',
      governanceType: 'futarchy'
    })

    const metadata2 = generateDAOMetadata({
      name: 'Test',
      description: 'Test',
      daoAddress: '0x',
      governanceType: 'traditional'
    })

    const attr1 = metadata1.attributes.find(a => a.trait_type === 'Governance Type')
    const attr2 = metadata2.attributes.find(a => a.trait_type === 'Governance Type')

    expect(attr1.value).toBe('Futarchy')
    expect(attr2.value).toBe('Traditional')
  })
})

describe('validateMetadata', () => {
  it('should validate correct metadata', () => {
    const metadata = {
      name: 'Test',
      description: 'Test description',
      image: 'ipfs://QmXXX',
      attributes: [
        { trait_type: 'Category', value: 'test' }
      ]
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect missing required fields', () => {
    const metadata = {
      name: 'Test'
      // Has name, but missing: description, image, attributes
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: description')
    expect(result.errors).toContain('Missing required field: image')
    expect(result.errors).toContain('Missing or invalid required field: attributes')
  })

  it('should validate background color format', () => {
    const metadata = {
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmXXX',
      attributes: [],
      background_color: 'invalid'
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Invalid background_color format (should be 6-character hex without #)')
  })

  it('should validate URL formats', () => {
    const metadata = {
      name: 'Test',
      description: 'Test',
      image: 'not-a-url',
      attributes: [],
      external_url: 'also-not-a-url'
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Invalid URL format'))).toBe(true)
  })

  it('should accept IPFS URLs', () => {
    const metadata = {
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmXXX',
      attributes: []
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(true)
  })

  it('should accept valid hex colors', () => {
    const metadata = {
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmXXX',
      attributes: [],
      background_color: 'FF6B35'
    }

    const result = validateMetadata(metadata)
    expect(result.valid).toBe(true)
  })
})

describe('convertMockMarketToMetadata', () => {
  it('should convert mock market data to metadata format', () => {
    const mockMarket = {
      id: 11,
      proposalTitle: 'Bitcoin reaches $100K in 2025',
      description: 'Will Bitcoin reach $100,000 USD in 2025?',
      category: 'crypto',
      subcategory: 'price',
      passTokenPrice: '0.59',
      failTokenPrice: '0.41',
      totalLiquidity: '245600',
      tradingEndTime: '2025-07-19T00:00:00Z',
      status: 'Active',
      correlationGroupId: 'btc-2025-milestones'
    }

    const metadata = convertMockMarketToMetadata(mockMarket)

    expect(metadata.name).toBe('Bitcoin reaches $100K in 2025')
    expect(metadata.description).toBe('Will Bitcoin reach $100,000 USD in 2025?')
    expect(metadata.properties.market_id).toBe(11)
    expect(metadata.properties.correlation_group_id).toBe('btc-2025-milestones')
    expect(metadata.properties.tags).toContain('crypto')
    expect(metadata.properties.tags).toContain('price')
    
    // Check on-chain data attributes
    const statusAttr = metadata.attributes.find(a => a.trait_type === 'Status')
    expect(statusAttr.value).toBe('Active')
    
    const liquidityAttr = metadata.attributes.find(a => a.trait_type === 'Total Liquidity')
    expect(liquidityAttr.value).toBe(245600)
  })

  it('should handle missing optional fields', () => {
    const mockMarket = {
      id: 1,
      proposalTitle: 'Test Market',
      description: 'Test',
      category: 'test',
      status: 'Active'
    }

    const metadata = convertMockMarketToMetadata(mockMarket)

    expect(metadata.name).toBe('Test Market')
    expect(metadata.properties.tags).toEqual(['test'])
  })
})
