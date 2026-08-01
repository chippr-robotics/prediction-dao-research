/**
 * Tenant config module tests (spec 072, Foundational T006).
 *
 * The default (fairwins) tenant must reproduce today's product exactly, and
 * unknown tenants must fail loudly — never fall back to another identity.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TENANT_ID,
  getActiveTenant,
  getActiveTenantId,
  isDefaultTenant,
  resolveTenant,
  tenantBrand,
  tenantChainIds,
  tenantThemeClass,
  tenantContractMode,
  isFeatureEnabled,
  knownFeatureIds,
} from '../config/tenant'

describe('tenant config (spec 072)', () => {
  it('defaults to the fairwins tenant when VITE_TENANT_ID is unset', () => {
    expect(DEFAULT_TENANT_ID).toBe('fairwins')
    expect(getActiveTenantId()).toBe('fairwins')
    expect(isDefaultTenant()).toBe(true)
  })

  it('default tenant reproduces the current product identity exactly (US3)', () => {
    const brand = tenantBrand()
    expect(brand.displayName).toBe('FairWins')
    expect(brand.appUrl).toBe('https://fairwins.app')
    expect(brand.htmlTitle).toBe('FairWins - Multi-Chain Financial Platform')
    expect(brand.logo).toBe('/assets/logo_fairwins.svg')
    expect(brand.logoMark).toBe('/assets/fairwins_no-text_logo.svg')
    // Values from frontend/public/manifest.webmanifest
    expect(brand.pwa.name).toBe('🍀FairWins')
    expect(brand.pwa.shortName).toBe('FairWins')
    expect(brand.pwa.themeColor).toBe('#36B37E')
    expect(brand.pwa.backgroundColor).toBe('#0E141B')
  })

  it('default tenant theme tokens match the static theme.css values (US3)', () => {
    const theme = getActiveTenant().brand.theme
    expect(theme.base['--brand-primary']).toBe('#36B37E')
    expect(theme.base['--brand-secondary']).toBe('#4C9AFF')
    expect(theme.light['--primary-button']).toBe('#36B37E')
    expect(theme.light['--primary-button-hover']).toBe('#2F9E6E')
    expect(theme.dark['--primary-button']).toBe('#45C492')
    expect(theme.dark['--primary-button-text']).toBe('#0E141B')
  })

  it('applies the platform-fairwins class for the default tenant', () => {
    expect(tenantThemeClass()).toBe('platform-fairwins')
  })

  it('default tenant fronts the shared estate', () => {
    expect(tenantContractMode()).toBe('shared')
  })

  it('shared-mode tenants have no tenant contract overlay (resolution unchanged)', async () => {
    const { isDedicatedTenant, tenantContractsForChain } = await import('../config/tenant')
    expect(isDedicatedTenant()).toBe(false)
    expect(tenantContractsForChain(137)).toBeUndefined()
    expect(tenantContractsForChain(63)).toBeUndefined()
  })

  it('shared-mode resolution through contracts.js is untouched (US3)', async () => {
    const { getContractAddressForChain } = await import('../config/contracts')
    // Mordor (63) is the test-pinned network with a live wagerRegistry record.
    expect(getContractAddressForChain('wagerRegistry', 63)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    // A chain with no record still reads as not-deployed.
    expect(getContractAddressForChain('wagerRegistry', 999999)).toBeUndefined()
  })

  it('unknown tenant ids fail loudly instead of falling back', () => {
    expect(() => resolveTenant('not-a-tenant')).toThrow(/unknown tenant id "not-a-tenant"/)
  })

  it('feature gating reflects the manifest and only the manifest', () => {
    expect(isFeatureEnabled('wagers')).toBe(true)
    expect(isFeatureEnabled('predict')).toBe(true)
    expect(isFeatureEnabled('definitely-not-a-feature')).toBe(false)
  })

  it('every enabled feature is in the known catalog', () => {
    const catalog = knownFeatureIds()
    for (const feature of getActiveTenant().settings.features) {
      expect(catalog).toContain(feature)
    }
  })

  it('tenant chain lists never cross the cohort boundary', () => {
    const mainnet = tenantChainIds('mainnet')
    const testnet = tenantChainIds('testnet')
    expect(mainnet).toContain(137)
    expect(testnet).toContain(63)
    for (const chainId of mainnet) expect(testnet).not.toContain(chainId)
    expect(() => tenantChainIds('devnet')).toThrow(/unknown cohort/)
  })

  it('manifests are frozen — shipped identity cannot be mutated at runtime', () => {
    const tenant = getActiveTenant()
    expect(Object.isFrozen(tenant)).toBe(true)
    expect(Object.isFrozen(tenant.identity)).toBe(true)
    expect(() => {
      'use strict'
      tenant.identity.displayName = 'Mallory'
    }).toThrow()
  })
})
