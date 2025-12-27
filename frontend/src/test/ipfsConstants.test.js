import { describe, it, expect } from 'vitest'
import {
  IPFS_GATEWAY,
  IPFS_CONFIG,
  IPFS_CONTENT_TYPES,
  buildIpfsPath,
  getIpfsUrl,
  isValidCid,
} from '../constants/ipfs'

describe('IPFS Constants', () => {
  describe('IPFS_GATEWAY', () => {
    it('has a default value', () => {
      expect(IPFS_GATEWAY).toBeDefined()
      expect(typeof IPFS_GATEWAY).toBe('string')
      expect(IPFS_GATEWAY).toContain('ipfs.fairwins.app')
    })
  })

  describe('IPFS_CONFIG', () => {
    it('has required configuration properties', () => {
      expect(IPFS_CONFIG).toHaveProperty('TIMEOUT')
      expect(IPFS_CONFIG).toHaveProperty('MAX_RETRIES')
      expect(IPFS_CONFIG).toHaveProperty('RETRY_DELAY')
      expect(IPFS_CONFIG).toHaveProperty('CACHE_DURATION')
    })

    it('has reasonable timeout value', () => {
      expect(IPFS_CONFIG.TIMEOUT).toBeGreaterThan(0)
      expect(IPFS_CONFIG.TIMEOUT).toBeLessThanOrEqual(60000)
    })

    it('has reasonable retry configuration', () => {
      expect(IPFS_CONFIG.MAX_RETRIES).toBeGreaterThanOrEqual(1)
      expect(IPFS_CONFIG.RETRY_DELAY).toBeGreaterThan(0)
    })
  })

  describe('IPFS_CONTENT_TYPES', () => {
    it('defines common content types', () => {
      expect(IPFS_CONTENT_TYPES).toHaveProperty('TOKEN_METADATA')
      expect(IPFS_CONTENT_TYPES).toHaveProperty('MARKET_DATA')
      expect(IPFS_CONTENT_TYPES).toHaveProperty('MARKET_METADATA')
      expect(IPFS_CONTENT_TYPES).toHaveProperty('USER_DATA')
    })
  })

  describe('buildIpfsPath', () => {
    describe('tokenMetadata', () => {
      it('builds correct path for token metadata', () => {
        const path = buildIpfsPath.tokenMetadata('0x1234567890123456789012345678901234567890')
        expect(path).toBe('/token/0x1234567890123456789012345678901234567890/metadata.json')
      })
    })

    describe('marketData', () => {
      it('builds correct path for market data', () => {
        const path = buildIpfsPath.marketData('market-123')
        expect(path).toBe('/market/market-123/data.json')
      })
    })

    describe('marketMetadata', () => {
      it('builds correct path for market metadata', () => {
        const path = buildIpfsPath.marketMetadata('market-456')
        expect(path).toBe('/market/market-456/metadata.json')
      })
    })

    describe('fromCid', () => {
      it('builds correct path from CID', () => {
        const path = buildIpfsPath.fromCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
        expect(path).toBe('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      })
    })
  })

  describe('getIpfsUrl', () => {
    it('handles ipfs:// protocol', () => {
      const url = getIpfsUrl('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      expect(url).toContain('ipfs.fairwins.app')
      expect(url).toContain('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
    })

    it('handles paths with /ipfs/ prefix', () => {
      const url = getIpfsUrl('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      expect(url).toContain('ipfs.fairwins.app')
      expect(url).toContain('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
    })

    it('handles regular paths', () => {
      const url = getIpfsUrl('/token/0x1234/metadata.json')
      expect(url).toContain('ipfs.fairwins.app')
      expect(url).toContain('/token/0x1234/metadata.json')
    })

    it('handles CID without prefix', () => {
      const url = getIpfsUrl('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      expect(url).toContain('ipfs.fairwins.app')
      expect(url).toContain('/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
    })
  })

  describe('isValidCid', () => {
    it('validates CIDv0 format', () => {
      const validCidv0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
      expect(isValidCid(validCidv0)).toBe(true)
    })

    it('validates CIDv1 format', () => {
      const validCidv1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      expect(isValidCid(validCidv1)).toBe(true)
    })

    it('rejects invalid CID format', () => {
      expect(isValidCid('invalid-cid')).toBe(false)
      expect(isValidCid('123456')).toBe(false)
      expect(isValidCid('Qm123')).toBe(false) // Too short
    })

    it('rejects null or undefined', () => {
      expect(isValidCid(null)).toBe(false)
      expect(isValidCid(undefined)).toBe(false)
      expect(isValidCid('')).toBe(false)
    })

    it('rejects non-string values', () => {
      expect(isValidCid(123)).toBe(false)
      expect(isValidCid({})).toBe(false)
      expect(isValidCid([])).toBe(false)
    })
  })
})
