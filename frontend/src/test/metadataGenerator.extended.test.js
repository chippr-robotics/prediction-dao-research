/**
 * Extended tests for metadataGenerator — targeting 95% coverage.
 * Covers edge cases: missing optional fields, bet type, createdAt,
 * proposalId, collateralToken, tokenomics without totalSupply, bannerUrl,
 * and validateMetadata edge cases.
 */
import { describe, it, expect } from 'vitest'
import {
  generateMarketMetadata,
  generateTokenMetadata,
  generateProposalMetadata,
  generateDAOMetadata,
  validateMetadata,
} from '../utils/metadataGenerator'

describe('generateMarketMetadata: additional coverage', () => {
  it('includes betType attribute when present', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      onChainData: { betType: 'binary' },
    })
    const betTypeAttr = metadata.attributes.find(a => a.trait_type === 'Bet Type')
    expect(betTypeAttr).toBeDefined()
    expect(betTypeAttr.value).toBe('binary')
  })

  it('includes createdAt in properties when present', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      onChainData: { createdAt: '2026-01-01T00:00:00Z' },
    })
    expect(metadata.properties.created_at).toBe('2026-01-01T00:00:00Z')
  })

  it('includes proposalId in properties', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      proposalId: 42,
      onChainData: {},
    })
    expect(metadata.properties.proposal_id).toBe(42)
  })

  it('includes collateralToken in properties', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      collateralToken: '0xcoll',
      onChainData: {},
    })
    expect(metadata.properties.collateral_token).toBe('0xcoll')
  })

  it('does not include empty tags array', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      tags: [],
      onChainData: {},
    })
    expect(metadata.properties.tags).toBeUndefined()
  })

  it('does not include empty oracleSources array', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      oracleSources: [],
      onChainData: {},
    })
    expect(metadata.properties.oracle_sources).toBeUndefined()
  })

  it('uses default image when not provided', () => {
    const metadata = generateMarketMetadata({
      marketId: 1,
      name: 'Test',
      description: 'Test',
      category: 'test',
      onChainData: {},
    })
    expect(metadata.image).toBe('ipfs://QmDefaultMarketImage')
  })
})

describe('generateTokenMetadata: additional coverage', () => {
  it('uses default image when not provided', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Token desc',
      tokenAddress: '0xtoken',
    })
    expect(metadata.image).toBe('ipfs://QmDefaultTokenLogo')
  })

  it('does not include utility when empty', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      utility: [],
    })
    expect(metadata.properties.utility).toBeUndefined()
  })

  it('does not include links when empty', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      links: {},
    })
    expect(metadata.properties.links).toBeUndefined()
  })

  it('handles tokenomics without totalSupply', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      tokenomics: { maxSupply: 1000 },
    })
    expect(metadata.properties.tokenomics).toBeDefined()
    // Should not add Total Supply attribute since it's missing
    const supplyAttr = metadata.attributes.find(a => a.trait_type === 'Total Supply')
    expect(supplyAttr).toBeUndefined()
  })

  it('includes creator when provided', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      creator: '0xcreator',
    })
    expect(metadata.properties.creator).toBe('0xcreator')
  })

  it('includes backgroundColor', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      backgroundColor: '#AABBCC',
    })
    expect(metadata.background_color).toBe('AABBCC')
  })

  it('uses website as external_url when available', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      links: { website: 'https://mytoken.io' },
    })
    expect(metadata.external_url).toBe('https://mytoken.io')
  })

  it('uses tokenAddress-based URL when no website', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0xabc123',
    })
    expect(metadata.external_url).toBe('https://fairwins.app/token/0xabc123')
  })

  it('includes listedOnDex property', () => {
    const metadata = generateTokenMetadata({
      name: 'Token',
      symbol: 'TKN',
      description: 'Desc',
      tokenAddress: '0x',
      listedOnDex: true,
    })
    expect(metadata.properties.listed_on_dex).toBe(true)
  })
})

describe('generateProposalMetadata: additional coverage', () => {
  it('includes proposer and recipient', () => {
    const metadata = generateProposalMetadata({
      proposalId: 1,
      title: 'Test',
      description: 'Desc',
      fundingAmount: 1000,
      proposer: '0xproposer',
      recipient: '0xrecipient',
    })
    expect(metadata.properties.proposer).toBe('0xproposer')
    expect(metadata.properties.recipient).toBe('0xrecipient')
  })

  it('uses custom fundingToken', () => {
    const metadata = generateProposalMetadata({
      proposalId: 1,
      title: 'Test',
      description: 'Desc',
      fundingAmount: 500,
      fundingToken: 'USDC',
    })
    const tokenAttr = metadata.attributes.find(a => a.trait_type === 'Funding Token')
    expect(tokenAttr.value).toBe('USDC')
  })

  it('does not include empty milestones/documents/team', () => {
    const metadata = generateProposalMetadata({
      proposalId: 1,
      title: 'Test',
      description: 'Desc',
      fundingAmount: 100,
    })
    expect(metadata.properties.milestones).toBeUndefined()
    expect(metadata.properties.documents).toBeUndefined()
    expect(metadata.properties.team).toBeUndefined()
  })
})

describe('generateDAOMetadata: additional coverage', () => {
  it('includes bannerUrl', () => {
    const metadata = generateDAOMetadata({
      name: 'DAO',
      description: 'Desc',
      daoAddress: '0x',
      bannerUrl: 'ipfs://QmBanner',
    })
    expect(metadata.banner_image).toBe('ipfs://QmBanner')
  })

  it('does not include empty contracts/governance/welfareMetrics/links', () => {
    const metadata = generateDAOMetadata({
      name: 'DAO',
      description: 'Desc',
      daoAddress: '0x',
    })
    expect(metadata.properties.contracts).toBeUndefined()
    expect(metadata.properties.governance).toBeUndefined()
    expect(metadata.properties.welfare_metrics).toBeUndefined()
    expect(metadata.properties.links).toBeUndefined()
  })

  it('uses website as external_url when provided in links', () => {
    const metadata = generateDAOMetadata({
      name: 'DAO',
      description: 'Desc',
      daoAddress: '0x',
      links: { website: 'https://dao.io' },
    })
    expect(metadata.external_url).toBe('https://dao.io')
  })
})

describe('validateMetadata: additional edge cases', () => {
  it('accepts valid animation_url', () => {
    const result = validateMetadata({
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmTest',
      attributes: [],
      animation_url: 'https://example.com/video.mp4',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects invalid animation_url', () => {
    const result = validateMetadata({
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmTest',
      attributes: [],
      animation_url: 'not-a-url',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('animation_url'))).toBe(true)
  })

  it('accepts attributes as array (even empty)', () => {
    const result = validateMetadata({
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmTest',
      attributes: [],
    })
    expect(result.valid).toBe(true)
  })

  it('rejects attributes that is not an array', () => {
    const result = validateMetadata({
      name: 'Test',
      description: 'Test',
      image: 'ipfs://QmTest',
      attributes: 'not-array',
    })
    expect(result.valid).toBe(false)
  })

  it('validates all missing fields at once', () => {
    const result = validateMetadata({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})
