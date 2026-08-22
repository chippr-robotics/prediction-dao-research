/**
 * Member API capability tokens (spec 095) — the grant, the wire codec, and the metadata store.
 *
 * The two facts worth pinning here are the ones that fail silently in production:
 *   · the typed data this tree signs must be the typed data the gateway verifies, so the tests sign
 *     with a real key and verify with `ethers.verifyTypedData` against the same tables the gateway
 *     imports from `@fairwins/intent-types`;
 *   · the token must never reach storage. That is asserted against the RAW localStorage string, not
 *     against the reader — a reader that hides a field still leaves it on disk.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ethers } from 'ethers'
import {
  MEMBER_API_DOMAIN,
  MEMBER_API_GRANT_TYPES,
  MEMBER_API_REVOCATION_TYPES,
  canonicalScopeString,
} from '@fairwins/intent-types'
import {
  API_KEYS_STORAGE_KEY,
  API_SCOPES,
  EXPIRY_CHOICES_DAYS,
  MAX_TTL_DAYS,
  buildGrant,
  buildRevocation,
  forgetApiKey,
  grantTypedData,
  keyState,
  listApiKeys,
  markApiKeyRevoked,
  recordApiKey,
  revocationRequestBody,
  revocationTypedData,
  shortKeyId,
} from '../lib/apiAccess/apiKeys'
import { TOKEN_PREFIX, decodeToken, encodeToken } from '../lib/apiAccess/tokenCodec'

const ACCOUNT = ethers.getAddress('0x' + '11'.repeat(20))
const STORAGE_KEY = `fw_user_${ACCOUNT.toLowerCase()}_${API_KEYS_STORAGE_KEY}`

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('buildGrant', () => {
  it('produces a v1 grant with sorted scopes and the requested window', () => {
    const grant = buildGrant({
      account: ACCOUNT,
      scopes: ['read:wagers', 'read:profile'],
      ttlDays: 30,
      label: 'my agent',
      nowSeconds: 1_750_000_000,
    })
    expect(grant.v).toBe(1)
    expect(grant.account).toBe(ACCOUNT)
    expect(grant.keyId).toMatch(/^0x[0-9a-f]{64}$/i)
    expect(grant.scopes).toEqual(['read:profile', 'read:wagers'])
    expect(grant.issuedAt).toBe(1_750_000_000)
    expect(grant.expiresAt).toBe(1_750_000_000 + 30 * 86400)
    expect(grant.label).toBe('my agent')
  })

  it('refuses an unknown scope rather than dropping it', () => {
    // Silently dropping would mint a token narrower than the member was shown.
    expect(() => buildGrant({ account: ACCOUNT, scopes: ['write:everything'], ttlDays: 7 })).toThrow(/unknown scope/i)
  })

  it('refuses a lifetime past the gateway maximum', () => {
    expect(() => buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: MAX_TTL_DAYS + 1 })).toThrow(/maximum/i)
  })

  it('only offers expiries the gateway will accept', () => {
    for (const days of EXPIRY_CHOICES_DAYS) expect(days).toBeLessThanOrEqual(MAX_TTL_DAYS)
  })

  it('declares no write-shaped scope — the API can never act as the member', () => {
    for (const scope of API_SCOPES) expect(scope.id.startsWith('write:')).toBe(false)
  })
})

describe('grant typed data', () => {
  it('signs and verifies against the same tables the gateway uses', async () => {
    const wallet = ethers.Wallet.createRandom()
    const grant = buildGrant({
      account: wallet.address,
      scopes: ['assistant:chat', 'read:profile'],
      ttlDays: 7,
      nowSeconds: 1_750_000_000,
    })
    const { domain, types, message } = grantTypedData(grant)

    expect(domain).toEqual({ ...MEMBER_API_DOMAIN })
    expect(types).toBe(MEMBER_API_GRANT_TYPES)
    // The scopes field is ONE canonical line, not an array — a wallet renders an array
    // unpredictably, so a member could approve something they were never shown.
    expect(message.scopes).toBe(canonicalScopeString(grant.scopes))
    expect(message.scopes).toBe('assistant:chat read:profile')

    const signature = await wallet.signTypedData(domain, types, message)
    expect(ethers.verifyTypedData(domain, types, message, signature)).toBe(wallet.address)
  })

  it('builds a revocation the same account can sign', async () => {
    const wallet = ethers.Wallet.createRandom()
    const revocation = buildRevocation({ account: wallet.address, keyId: '0x' + 'ab'.repeat(32), nowSeconds: 1_750_000_100 })
    const { domain, types, message } = revocationTypedData(revocation)
    expect(types).toBe(MEMBER_API_REVOCATION_TYPES)

    const signature = await wallet.signTypedData(domain, types, message)
    expect(ethers.verifyTypedData(domain, types, message, signature)).toBe(wallet.address)

    // The gateway reads `{ revocation, signature }`.
    expect(revocationRequestBody(revocation, signature)).toEqual({ revocation, signature })
  })
})

describe('token codec', () => {
  it('round-trips a grant and signature through the fw1 wire format', async () => {
    const wallet = ethers.Wallet.createRandom()
    const grant = buildGrant({ account: wallet.address, scopes: ['read:profile'], ttlDays: 7, label: 'round trip' })
    const { domain, types, message } = grantTypedData(grant)
    const signature = await wallet.signTypedData(domain, types, message)

    const token = encodeToken(grant, signature)
    expect(token.startsWith(`${TOKEN_PREFIX}.`)).toBe(true)
    expect(token.split('.')).toHaveLength(3)
    // Unpadded base64url: no '=', '+' or '/' anywhere in an Authorization header value.
    expect(token).not.toMatch(/[+/=]/)

    const decoded = decodeToken(token)
    expect(decoded.grant.account).toBe(grant.account)
    expect(decoded.grant.keyId).toBe(grant.keyId)
    expect(decoded.grant.scopes).toEqual(grant.scopes)
    expect(decoded.grant.expiresAt).toBe(grant.expiresAt)
    expect(decoded.grant.label).toBe('round trip')
    expect(decoded.signature.toLowerCase()).toBe(signature.toLowerCase())
  })

  it('rejects anything that is not an fw1 token', () => {
    expect(() => decodeToken('')).toThrow()
    expect(() => decodeToken('Bearer nope')).toThrow(/fw1/)
    expect(() => decodeToken('fw2.a.b')).toThrow(/fw1/)
    expect(() => decodeToken('fw1.###.###')).toThrow()
  })
})

describe('metadata store', () => {
  it('stores metadata only — the token is never written to storage', async () => {
    const wallet = ethers.Wallet.createRandom()
    const grant = buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 7, label: 'agent' })
    const { domain, types, message } = grantTypedData(grant)
    const signature = await wallet.signTypedData(domain, types, message)
    const token = encodeToken(grant, signature)

    recordApiKey(ACCOUNT, grant)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    // The RAW string, not the reader: a reader that omits a field still leaves it on disk.
    expect(raw).not.toContain(token)
    expect(raw).not.toContain(signature)
    expect(raw).not.toContain(TOKEN_PREFIX + '.')
    expect(raw).toContain(grant.keyId)
  })

  it('lists keys newest first and reports each key’s state', () => {
    recordApiKey(ACCOUNT, buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 7, label: 'older', nowSeconds: 1000 }))
    recordApiKey(ACCOUNT, buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 7, label: 'newer', nowSeconds: 2000 }))
    const keys = listApiKeys(ACCOUNT)
    expect(keys.map((k) => k.label)).toEqual(['newer', 'older'])
    // Both were issued in 1970 by the injected clock, so both have expired by now.
    expect(keyState(keys[0])).toBe('expired')
  })

  it('marks a key revoked without losing it, and can forget it entirely', () => {
    const grant = buildGrant({ account: ACCOUNT, scopes: ['read:profile'], ttlDays: 30 })
    recordApiKey(ACCOUNT, grant)

    markApiKeyRevoked(ACCOUNT, grant.keyId, 1_750_000_500)
    expect(keyState(listApiKeys(ACCOUNT)[0])).toBe('revoked')

    forgetApiKey(ACCOUNT, grant.keyId)
    expect(listApiKeys(ACCOUNT)).toHaveLength(0)
  })

  it('drops a foreign or malformed stored entry rather than trusting it', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { keyId: 'not-a-key-id', scopes: ['read:profile'], issuedAt: 1, expiresAt: 2 },
        { keyId: '0x' + 'cd'.repeat(32), scopes: ['made:up'], issuedAt: 1, expiresAt: 2 },
        'a string',
        { keyId: '0x' + 'ef'.repeat(32), scopes: ['read:profile'], issuedAt: 1, expiresAt: 2 },
      ])
    )
    const keys = listApiKeys(ACCOUNT)
    expect(keys).toHaveLength(1)
    expect(keys[0].keyId).toBe('0x' + 'ef'.repeat(32))
  })

  it('returns an empty list without a wallet instead of throwing', () => {
    expect(listApiKeys(null)).toEqual([])
  })

  it('shortens a key id for display without pretending it is a secret', () => {
    expect(shortKeyId('0x' + 'ab'.repeat(32))).toContain('…')
  })

  it('is absent from the spec-032 synced object registry', () => {
    // A key is a credential bound to one gateway's live revocation set, and its metadata names
    // credentials that may be live on other devices. Exporting that list into the encrypted backup
    // would carry it to every device a member restores onto — the same call as `network_endpoints`.
    const registry = readFileSync(resolve(process.cwd(), 'src/lib/backup/syncedObjects.js'), 'utf-8')
    expect(registry).not.toContain(API_KEYS_STORAGE_KEY)
    expect(registry).not.toContain('apiKeys')
  })
})
