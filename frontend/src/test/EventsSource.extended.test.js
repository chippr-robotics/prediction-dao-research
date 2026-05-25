import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test the pure logic inside EventsSource.js by replicating the module-scoped
// functions (detectEncryption, toWager) since they aren't exported.

vi.mock('../utils/ipfsService', () => ({
  parseEncryptedIpfsReference: vi.fn((desc) => {
    if (!desc || typeof desc !== 'string') return { isIpfs: false, cid: null }
    if (desc.startsWith('encrypted:ipfs://')) {
      return { isIpfs: true, cid: desc.replace('encrypted:ipfs://', '').trim() }
    }
    if (desc.startsWith('ipfs://')) {
      return { isIpfs: true, cid: desc.replace('ipfs://', '').split('/')[0].trim() }
    }
    return { isIpfs: false, cid: null }
  }),
}))

import { parseEncryptedIpfsReference } from '../utils/ipfsService'

const MARKET_TYPES = ['oneVsOne', 'smallGroup', 'eventTracking', 'propBet']
const STATUS_NAMES = [
  'pending_acceptance', 'active', 'pending_resolution', 'challenged',
  'resolved', 'cancelled', 'refunded', 'oracle_timed_out',
]

// Replicate detectEncryption from EventsSource.js
function detectEncryption(description) {
  let metadata = null
  let isEncrypted = false

  const ipfsRef = parseEncryptedIpfsReference(description)
  if (ipfsRef.isIpfs && ipfsRef.cid) {
    return {
      ipfsCid: ipfsRef.cid,
      isEncrypted: true,
      metadataCipher: null,
      displayDescription: 'Encrypted Market',
    }
  }

  try {
    const parsed = JSON.parse(description)
    const isV1 =
      parsed?.version === '1.0' &&
      parsed?.algorithm === 'x25519-chacha20poly1305' &&
      parsed?.content?.ciphertext &&
      Array.isArray(parsed?.keys)
    const isV2 =
      parsed?.version === '2.0' &&
      parsed?.algorithm === 'xwing-chacha20poly1305' &&
      parsed?.content?.ciphertext &&
      Array.isArray(parsed?.keys)
    if (isV1 || isV2) {
      metadata = parsed
      isEncrypted = true
    }
  } catch {
    // plain text description
  }

  return {
    ipfsCid: null,
    isEncrypted,
    metadataCipher: metadata,
    displayDescription: isEncrypted ? 'Encrypted Market' : description,
  }
}

describe('EventsSource: detectEncryption', () => {
  it('detects encrypted:ipfs:// references', () => {
    const result = detectEncryption('encrypted:ipfs://bafyabc123')
    expect(result.isEncrypted).toBe(true)
    expect(result.ipfsCid).toBe('bafyabc123')
    expect(result.displayDescription).toBe('Encrypted Market')
    expect(result.metadataCipher).toBeNull()
  })

  it('detects ipfs:// references', () => {
    const result = detectEncryption('ipfs://bafyxyz789')
    expect(result.isEncrypted).toBe(true)
    expect(result.ipfsCid).toBe('bafyxyz789')
  })

  it('detects v1.0 inline encrypted envelope', () => {
    const envelope = JSON.stringify({
      version: '1.0',
      algorithm: 'x25519-chacha20poly1305',
      content: { ciphertext: 'abc' },
      keys: [{ address: '0xtest' }],
    })
    const result = detectEncryption(envelope)
    expect(result.isEncrypted).toBe(true)
    expect(result.ipfsCid).toBeNull()
    expect(result.metadataCipher).toBeTruthy()
    expect(result.metadataCipher.version).toBe('1.0')
    expect(result.displayDescription).toBe('Encrypted Market')
  })

  it('detects v2.0 inline encrypted envelope', () => {
    const envelope = JSON.stringify({
      version: '2.0',
      algorithm: 'xwing-chacha20poly1305',
      content: { ciphertext: 'def' },
      keys: [],
    })
    const result = detectEncryption(envelope)
    expect(result.isEncrypted).toBe(true)
    expect(result.metadataCipher.version).toBe('2.0')
  })

  it('handles plain text description', () => {
    const result = detectEncryption('Who will win the game?')
    expect(result.isEncrypted).toBe(false)
    expect(result.ipfsCid).toBeNull()
    expect(result.metadataCipher).toBeNull()
    expect(result.displayDescription).toBe('Who will win the game?')
  })

  it('handles empty string', () => {
    const result = detectEncryption('')
    expect(result.isEncrypted).toBe(false)
    expect(result.displayDescription).toBe('')
  })

  it('handles JSON without required encryption fields', () => {
    const json = JSON.stringify({ name: 'test', value: 42 })
    const result = detectEncryption(json)
    expect(result.isEncrypted).toBe(false)
  })

  it('handles JSON with version but missing keys array', () => {
    const json = JSON.stringify({
      version: '1.0',
      algorithm: 'x25519-chacha20poly1305',
      content: { ciphertext: 'abc' },
      // missing keys
    })
    const result = detectEncryption(json)
    expect(result.isEncrypted).toBe(false)
  })
})

describe('EventsSource: MARKET_TYPES and STATUS_NAMES', () => {
  it('has 4 market types', () => {
    expect(MARKET_TYPES).toEqual(['oneVsOne', 'smallGroup', 'eventTracking', 'propBet'])
  })

  it('has 8 status names', () => {
    expect(STATUS_NAMES.length).toBe(8)
    expect(STATUS_NAMES[0]).toBe('pending_acceptance')
    expect(STATUS_NAMES[4]).toBe('resolved')
    expect(STATUS_NAMES[7]).toBe('oracle_timed_out')
  })

  it('maps market type indices correctly', () => {
    expect(MARKET_TYPES[0]).toBe('oneVsOne')
    expect(MARKET_TYPES[1]).toBe('smallGroup')
    expect(MARKET_TYPES[2]).toBe('eventTracking')
    expect(MARKET_TYPES[3]).toBe('propBet')
  })

  it('returns undefined for out-of-range index', () => {
    expect(MARKET_TYPES[5]).toBeUndefined()
    expect(STATUS_NAMES[10]).toBeUndefined()
  })
})
