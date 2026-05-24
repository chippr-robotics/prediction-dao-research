/**
 * Extended tests for ipfsService — targeting 85% coverage.
 * Covers resolveUri, uploadMarketMetadata, uploadAndRegister,
 * uploadJson error paths, and encrypted envelope validations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the IPFS constants module
vi.mock('../constants/ipfs', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    PINATA_CONFIG: {
      ...original.PINATA_CONFIG,
      JWT: 'test-jwt-token',
      USE_PROXY: false,
      API_URL: 'https://api.pinata.cloud',
    },
  }
})

import {
  clearCache,
  resolveUri,
  uploadJson,
  uploadMarketMetadata,
  uploadAndRegister,
  uploadEncryptedEnvelope,
  fetchEncryptedEnvelope,
} from '../utils/ipfsService'

global.fetch = vi.fn()

describe('ipfsService extended', () => {
  beforeEach(() => {
    clearCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('resolveUri', () => {
    it('throws for empty URI', async () => {
      await expect(resolveUri('')).rejects.toThrow('URI is required')
      await expect(resolveUri(null)).rejects.toThrow('URI is required')
    })

    it('resolves ipfs:// URIs', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: 'data' }),
      })

      const result = await resolveUri('ipfs://bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
      expect(result).toEqual({ test: 'data' })
    })

    it('resolves ipfs:// URIs with subpath', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nested: 'data' }),
      })

      const result = await resolveUri('ipfs://bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze/metadata.json')
      expect(result).toEqual({ nested: 'data' })
    })

    it('resolves raw CID URIs', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cid: 'data' }),
      })

      const result = await resolveUri('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      expect(result).toEqual({ cid: 'data' })
    })

    it('resolves https:// URIs', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ https: 'data' }),
      })

      const result = await resolveUri('https://example.com/api/data')
      expect(result).toEqual({ https: 'data' })
    })

    it('resolves https:// URIs with caller signal', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ signal: 'data' }),
      })

      const controller = new AbortController()
      const result = await resolveUri('https://example.com/api/data', { signal: controller.signal })
      expect(result).toEqual({ signal: 'data' })
    })

    it('throws for non-ok https response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(resolveUri('https://example.com/missing')).rejects.toThrow('Failed to fetch')
    })

    it('throws for unsupported URI format', async () => {
      await expect(resolveUri('ftp://something')).rejects.toThrow('Unsupported URI format')
    })
  })

  describe('uploadJson', () => {
    it('throws for non-object data', async () => {
      await expect(uploadJson('string')).rejects.toThrow('Data must be a valid object')
      await expect(uploadJson(null)).rejects.toThrow('Data must be a valid object')
    })

    it('uploads JSON data successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze',
          PinSize: 100,
          Timestamp: '2026-01-01',
        }),
      })

      const result = await uploadJson({ test: 'data' })
      expect(result.cid).toBe('bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
      expect(result.uri).toBe('ipfs://bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
    })

    it('uses custom name when provided', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          PinSize: 50,
        }),
      })

      const result = await uploadJson({ data: 1 }, { name: 'custom-name.json' })
      expect(result.cid).toBeDefined()
    })

    it('throws when Pinata returns non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Unauthorized' } }),
      })

      await expect(uploadJson({ data: 1 })).rejects.toThrow('Unauthorized')
    })

    it('handles non-JSON error response from Pinata', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      await expect(uploadJson({ data: 1 })).rejects.toThrow('status 500')
    })

    it('throws when IpfsHash is missing from response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await expect(uploadJson({ data: 1 })).rejects.toThrow('missing IpfsHash')
    })

    it('handles upload timeout (AbortError)', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      global.fetch.mockRejectedValueOnce(abortError)

      await expect(uploadJson({ data: 1 })).rejects.toThrow('Pinata upload timeout')
    })
  })

  describe('uploadMarketMetadata', () => {
    it('throws when name is missing', async () => {
      await expect(uploadMarketMetadata({ description: 'test' })).rejects.toThrow('requires a name')
    })

    it('throws when description is missing', async () => {
      await expect(uploadMarketMetadata({ name: 'test' })).rejects.toThrow('requires a description')
    })

    it('uploads formatted market metadata', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          PinSize: 200,
        }),
      })

      const result = await uploadMarketMetadata({
        name: 'Test Market',
        description: 'A test market',
        attributes: [{ trait_type: 'Cat', value: 'test' }],
      })

      expect(result.cid).toBeDefined()
    })
  })

  describe('uploadAndRegister', () => {
    it('uploads and returns registered=false when no callback', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          PinSize: 50,
        }),
      })

      const result = await uploadAndRegister({ test: 1 })
      expect(result.registered).toBe(false)
    })

    it('calls registerCallback and returns registered=true on success', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          PinSize: 50,
        }),
      })

      const registerCallback = vi.fn().mockResolvedValue(undefined)

      const result = await uploadAndRegister({ test: 1 }, {
        registerCallback,
        resourceType: 'market',
        resourceId: '123',
      })

      expect(result.registered).toBe(true)
      expect(registerCallback).toHaveBeenCalledWith('market', '123', expect.any(String))
    })

    it('handles registerCallback failure gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          IpfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          PinSize: 50,
        }),
      })

      const registerCallback = vi.fn().mockRejectedValue(new Error('Reg failed'))

      const result = await uploadAndRegister({ test: 1 }, {
        registerCallback,
        resourceType: 'market',
        resourceId: '123',
      })

      expect(result.registered).toBe(false)
      expect(result.registrationError).toBe('Reg failed')
    })
  })

  describe('uploadEncryptedEnvelope: additional validations', () => {
    const validEnvelope = {
      version: '2.0',
      algorithm: 'xwing-chacha20poly1305',
      content: { nonce: 'abc', ciphertext: 'def' },
      keys: [{ address: '0x1' }],
    }

    it('throws when keys is not an array', async () => {
      await expect(uploadEncryptedEnvelope({
        ...validEnvelope,
        keys: 'not-array',
      })).rejects.toThrow('keys must be an array')
    })

    it('throws when content.nonce is not a string', async () => {
      await expect(uploadEncryptedEnvelope({
        ...validEnvelope,
        content: { nonce: 123, ciphertext: 'def' },
      })).rejects.toThrow('content must have nonce and ciphertext strings')
    })

    it('throws when content.ciphertext is not a string', async () => {
      await expect(uploadEncryptedEnvelope({
        ...validEnvelope,
        content: { nonce: 'abc', ciphertext: 456 },
      })).rejects.toThrow('content must have nonce and ciphertext strings')
    })
  })

  describe('fetchEncryptedEnvelope: additional validations', () => {
    it('throws when fetched data has invalid content structure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '1.0',
          algorithm: 'x25519-chacha20poly1305',
          content: { nonce: 123, ciphertext: 'abc' }, // nonce should be string
          keys: [],
        }),
      })

      await expect(
        fetchEncryptedEnvelope('bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
      ).rejects.toThrow('invalid content structure')
    })

    it('throws when fetched envelope has non-array keys', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '1.0',
          algorithm: 'x25519-chacha20poly1305',
          content: { nonce: 'abc', ciphertext: 'def' },
          keys: 'not-array',
        }),
      })

      await expect(
        fetchEncryptedEnvelope('bafybeic5dplry3twzpb3l5byo5tqyj7vfk3vxl7skrn6kzqd7p6ey3mmze')
      ).rejects.toThrow('must be an array')
    })
  })
})
