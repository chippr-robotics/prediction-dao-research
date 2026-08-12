/**
 * Perps venue configuration (spec 083, T011).
 *
 * These assertions guard the four facts that are silently catastrophic to get wrong: a mistyped
 * address, GMX appearing on a chain it is not deployed on, a management control offered for
 * Hyperliquid, and the approval target being confused with the call target.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { getAddress } from 'ethers'
import {
  GAINS_DIAMOND_BY_CHAIN,
  GMX_ADDRESSES_BY_CHAIN,
  PERPS_UI_FEE_RECEIVER,
  PERPS_ATTESTATION_VERSION,
  gainsDiamondFor,
  gmxAddressesFor,
  perpsManageEnabled,
  perpsManageVenues,
  perpsManageFeatureEnabled,
  perpsUiFeeReceiver,
} from '../../config/perps'

const GAINS_CHAINS = [42161, 8453, 137]

describe('perps venue addresses', () => {
  it('every configured address is EIP-55 checksummed and 20 bytes', () => {
    const all = [
      ...Object.values(GAINS_DIAMOND_BY_CHAIN),
      ...Object.values(GMX_ADDRESSES_BY_CHAIN).flatMap((set) => Object.values(set)),
    ]
    expect(all.length).toBeGreaterThan(0)
    for (const addr of all) {
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/)
      // getAddress re-derives the checksum: a single flipped case fails here rather than at a
      // wallet prompt with the member's collateral attached.
      expect(getAddress(addr.toLowerCase())).toBe(addr)
    }
  })

  it('pins the verified Gains diamonds on Arbitrum, Base and Polygon', () => {
    expect(gainsDiamondFor(42161)).toBe('0xFF162c694eAA571f685030649814282eA457f169')
    expect(gainsDiamondFor(8453)).toBe('0x6cD5aC19a07518A8092eEFfDA4f1174C72704eeb')
    expect(gainsDiamondFor(137)).toBe('0x209A9A01980377916851af2cA075C2b170452018')
  })

  it('gainsDiamondFor returns null off a supported chain instead of guessing', () => {
    expect(gainsDiamondFor(1)).toBeNull()
    expect(gainsDiamondFor(10)).toBeNull()
    expect(gainsDiamondFor(undefined)).toBeNull()
  })

  it('accepts a chain id as a string (router params arrive as strings)', () => {
    expect(gainsDiamondFor('42161')).toBe(gainsDiamondFor(42161))
    expect(gmxAddressesFor('42161')).toEqual(gmxAddressesFor(42161))
  })
})

describe('GMX is Arbitrum-only', () => {
  it('configures GMX on 42161 and on no other chain', () => {
    expect(Object.keys(GMX_ADDRESSES_BY_CHAIN)).toEqual(['42161'])
    expect(gmxAddressesFor(42161)).not.toBeNull()
    for (const chainId of [1, 8453, 137, 10, 61, 63]) {
      expect(gmxAddressesFor(chainId)).toBeNull()
    }
  })

  it('carries the full address set — a partial set is never synthesised', () => {
    expect(Object.keys(gmxAddressesFor(42161)).sort()).toEqual([
      'dataStore',
      'eventEmitter',
      'exchangeRouter',
      'orderVault',
      'reader',
      'referralStorage',
      'router',
    ])
  })

  it('THE APPROVAL TARGET IS THE ROUTER, NOT THE EXCHANGE ROUTER', () => {
    const gmx = gmxAddressesFor(42161)
    // Collateral is pulled by Router.pluginTransfer. Approving the ExchangeRouter produces a
    // sendTokens that reverts — and these two are one character apart in every code review.
    expect(gmx.router).toBe('0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6')
    expect(gmx.exchangeRouter).toBe('0x7dE39FF2e232A2203196788d37e234cF8F1b83f1')
    expect(gmx.router).not.toBe(gmx.exchangeRouter)
  })

  it('pins the remaining docs/SDK addresses (never the gmx-synthetics deployments dir)', () => {
    const gmx = gmxAddressesFor(42161)
    expect(gmx.reader).toBe('0xfA26cBb46e2614609406de08CA1Dc7f70a684184')
    expect(gmx.dataStore).toBe('0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8')
    expect(gmx.orderVault).toBe('0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5')
    expect(gmx.eventEmitter).toBe('0xC8ee91A54287DB53897056e12D9819156D3822Fb')
    expect(gmx.referralStorage).toBe('0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d')
  })

  it('no venue address collides with another — a copy-paste slip is a wrong contract', () => {
    const all = [...Object.values(GAINS_DIAMOND_BY_CHAIN), ...Object.values(gmxAddressesFor(42161))]
    expect(new Set(all.map((a) => a.toLowerCase())).size).toBe(all.length)
  })
})

describe('management capabilities', () => {
  it('Gains is manageable on all three of its chains', () => {
    for (const chainId of GAINS_CHAINS) {
      expect(perpsManageEnabled('gains', chainId)).toBe(true)
      expect(perpsManageVenues(chainId)).toContain('gains')
    }
  })

  it('GMX is manageable on Arbitrum only', () => {
    expect(perpsManageEnabled('gmx', 42161)).toBe(true)
    expect(perpsManageEnabled('gmx', 8453)).toBe(false)
    expect(perpsManageEnabled('gmx', 137)).toBe(false)
    expect(perpsManageEnabled('gmx', 1)).toBe(false)
  })

  it('HYPERLIQUID MANAGEMENT IS OFF EVERYWHERE (FR-021 — read-only this release)', () => {
    for (const chainId of [...GAINS_CHAINS, 1, 10, undefined, null, 'hyperliquid']) {
      expect(perpsManageEnabled('hyperliquid', chainId)).toBe(false)
    }
    for (const chainId of GAINS_CHAINS) {
      expect(perpsManageVenues(chainId)).not.toContain('hyperliquid')
    }
  })

  it('an unknown venue or chain yields no capability rather than an error', () => {
    expect(perpsManageEnabled('nope', 42161)).toBe(false)
    expect(perpsManageVenues(999)).toEqual([])
    expect(perpsManageVenues(undefined)).toEqual([])
  })
})

describe('the management feature flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('DEFAULTS OFF — unset means no management surface at all (FR-025 gate)', () => {
    vi.stubEnv('VITE_PERPS_MANAGE_ENABLED', '')
    expect(perpsManageFeatureEnabled()).toBe(false)
  })

  it('stays off for anything that is not an explicit "true"', () => {
    for (const value of ['false', '0', '1', 'yes', 'on', 'enabled', ' ']) {
      vi.stubEnv('VITE_PERPS_MANAGE_ENABLED', value)
      expect(perpsManageFeatureEnabled()).toBe(false)
    }
  })

  it('turns on for "true", case- and whitespace-insensitively', () => {
    for (const value of ['true', 'TRUE', ' True ']) {
      vi.stubEnv('VITE_PERPS_MANAGE_ENABLED', value)
      expect(perpsManageFeatureEnabled()).toBe(true)
    }
  })

  it('is independent of capability — a venue stays capable while the surface is off', () => {
    vi.stubEnv('VITE_PERPS_MANAGE_ENABLED', '')
    expect(perpsManageFeatureEnabled()).toBe(false)
    expect(perpsManageEnabled('gains', 42161)).toBe(true)
  })
})

describe('fee receiver and attestation version', () => {
  it('the UI fee receiver is either null (no fee) or a checksummed address — never a raw string', () => {
    // null is a legitimate state and MUST mean "no fee", not an error: GMX early-returns a zero UI
    // fee for address(0), so an unset receiver is structurally fee-free (FR-012).
    if (PERPS_UI_FEE_RECEIVER === null) {
      expect(perpsUiFeeReceiver()).toBeNull()
      return
    }
    // Once set it must be the EXACT address that sent setUiFeeFactor — that call is msg.sender-keyed,
    // so a mismatch would attach a receiver to orders that never accrues, and could never claim.
    expect(getAddress(PERPS_UI_FEE_RECEIVER)).toBe(PERPS_UI_FEE_RECEIVER)
    expect(perpsUiFeeReceiver()).toBe(PERPS_UI_FEE_RECEIVER)
  })

  it('if a receiver is ever set it must be a checksummed address', () => {
    // Guards the eventual edit: an unchecksummed or truncated receiver would be accepted silently
    // by ethers and send the UI fee somewhere unclaimable.
    if (PERPS_UI_FEE_RECEIVER !== null) {
      expect(getAddress(String(PERPS_UI_FEE_RECEIVER).toLowerCase())).toBe(PERPS_UI_FEE_RECEIVER)
    }
  })

  it('exposes a positive integer attestation version', () => {
    expect(Number.isInteger(PERPS_ATTESTATION_VERSION)).toBe(true)
    expect(PERPS_ATTESTATION_VERSION).toBeGreaterThan(0)
  })
})
