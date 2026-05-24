/**
 * Tests for marketHelpers — the shared helper functions for friend-market UIs.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { formatUSD, getMarketDescription, getMarketUrl } from '../components/fairwins/marketHelpers'

describe('formatUSD', () => {
  it('formats stablecoin (USDC) amounts as USD', () => {
    expect(formatUSD('100', 'USDC')).toBe('$100.00')
    expect(formatUSD('0.50', 'USDC')).toBe('$0.50')
  })

  it('formats USDT as USD', () => {
    expect(formatUSD('25', 'USDT')).toBe('$25.00')
  })

  it('formats DAI as USD', () => {
    expect(formatUSD('999.99', 'DAI')).toBe('$999.99')
  })

  it('shows $0.00 for zero stablecoin', () => {
    expect(formatUSD('0', 'USDC')).toBe('$0.00')
    expect(formatUSD(0, 'USDC')).toBe('$0.00')
  })

  it('shows < $0.01 for very small stablecoin amounts', () => {
    expect(formatUSD('0.001', 'USDC')).toBe('< $0.01')
    expect(formatUSD('0.009', 'USDC')).toBe('< $0.01')
  })

  it('formats non-stablecoin as amount + symbol', () => {
    expect(formatUSD('10', 'MATIC')).toBe('10 MATIC')
    expect(formatUSD('5.5', 'ETH')).toBe('5.5 ETH')
  })

  it('uses "tokens" when no symbol provided', () => {
    expect(formatUSD('10')).toBe('10 tokens')
    expect(formatUSD('10', null)).toBe('10 tokens')
    expect(formatUSD('10', '')).toBe('10 tokens')
  })

  it('handles NaN amounts as 0', () => {
    expect(formatUSD('not-a-number', 'USDC')).toBe('$0.00')
    expect(formatUSD(null, 'MATIC')).toBe('0 MATIC')
  })
})

describe('getMarketDescription', () => {
  it('returns metadata name when available and viewable', () => {
    const market = {
      metadata: { name: 'My Test Market' },
      canView: true,
    }
    expect(getMarketDescription(market)).toBe('My Test Market')
  })

  it('uses metadata.description as fallback', () => {
    const market = {
      metadata: { description: 'A description' },
    }
    expect(getMarketDescription(market)).toBe('A description')
  })

  it('uses metadata.question as fallback', () => {
    const market = {
      metadata: { question: 'Will it rain?' },
    }
    expect(getMarketDescription(market)).toBe('Will it rain?')
  })

  it('skips private/encrypted metadata titles', () => {
    const privateMarket = {
      metadata: { name: 'Private Market' },
      description: 'Real description',
    }
    expect(getMarketDescription(privateMarket)).toBe('Real description')

    const encryptedMarket = {
      metadata: { name: 'Encrypted Wager' },
      description: 'actual desc',
    }
    expect(getMarketDescription(encryptedMarket)).toBe('actual desc')
  })

  it('skips metadata when canView is false', () => {
    const market = {
      metadata: { name: 'Secret Market' },
      canView: false,
      description: 'visible desc',
    }
    expect(getMarketDescription(market)).toBe('visible desc')
  })

  it('uses market.description as fallback', () => {
    const market = { description: 'Simple desc' }
    expect(getMarketDescription(market)).toBe('Simple desc')
  })

  it('skips encrypted/private descriptions', () => {
    expect(getMarketDescription({ description: 'Encrypted Market' })).toContain('Private Bet')
    expect(getMarketDescription({ description: 'Private Wager' })).toContain('Private Bet')
  })

  it('shows Private Bet with stake info when no description', () => {
    const market = { stakeAmount: '100', stakeTokenSymbol: 'USDC' }
    expect(getMarketDescription(market)).toBe('Private Bet - 100 USDC')
  })

  it('shows Private Bet without stake when no amount', () => {
    const market = {}
    expect(getMarketDescription(market)).toBe('Private Bet')
  })

  it('uses MATIC as default token symbol for stake', () => {
    const market = { stakeAmount: '50' }
    expect(getMarketDescription(market)).toBe('Private Bet - 50 MATIC')
  })
})

describe('getMarketUrl', () => {
  beforeEach(() => {
    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://fairwins.app' },
      writable: true,
    })
  })

  it('generates preview URL when no market id', () => {
    expect(getMarketUrl(null)).toBe('https://fairwins.app/friend-market/preview')
    expect(getMarketUrl({})).toBe('https://fairwins.app/friend-market/preview')
  })

  it('generates acceptance URL with market details', () => {
    const market = {
      id: '42',
      creator: '0xcreator',
      stakeAmount: '100',
      stakeTokenSymbol: 'USDC',
      acceptanceDeadline: new Date('2026-06-01').getTime(),
    }
    const url = getMarketUrl(market)
    expect(url).toContain('marketId=42')
    expect(url).toContain('creator=0xcreator')
    expect(url).toContain('stake=100')
    expect(url).toContain('token=USDC')
    expect(url).toContain('deadline=')
  })

  it('uses fallbackCreator when market.creator is missing', () => {
    const market = { id: '1', stakeAmount: '10' }
    const url = getMarketUrl(market, '0xfallback')
    expect(url).toContain('creator=0xfallback')
  })

  it('uses default values for missing fields', () => {
    const market = { id: '1' }
    const url = getMarketUrl(market)
    expect(url).toContain('stake=0')
    expect(url).toContain('token=MATIC')
  })

  it('includes ipfsCid when present', () => {
    const market = {
      id: '1',
      ipfsCid: 'bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze',
    }
    const url = getMarketUrl(market)
    expect(url).toContain('cid=bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
  })

  it('handles missing acceptanceDeadline', () => {
    const market = { id: '1' }
    const url = getMarketUrl(market)
    expect(url).toContain('deadline=')
  })
})
