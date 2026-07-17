import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { buildPaymentRequestUri, parsePaymentRequest, NOTE_MAX_LENGTH } from '../paymentRequest'

const TO = '0x1111111111111111111111111111111111111111'
const TO_CHECKSUM = ethers.getAddress(TO)
const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Polygon native USDC

describe('buildPaymentRequestUri (spec 058 contract)', () => {
  it('builds the ERC-20 /transfer form with base units and chain id', () => {
    const uri = buildPaymentRequestUri({
      chainId: 137, to: TO_CHECKSUM, kind: 'stable', tokenAddress: USDC, decimals: 6, amount: '12.5',
    })
    expect(uri).toBe(`ethereum:${USDC}@137/transfer?address=${TO_CHECKSUM}&uint256=12500000`)
  })

  it('builds the native form with value in base units', () => {
    const uri = buildPaymentRequestUri({
      chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '0.25',
    })
    expect(uri).toBe(`ethereum:${TO_CHECKSUM}@137?value=250000000000000000`)
  })

  it('URL-encodes the note as a message param', () => {
    const uri = buildPaymentRequestUri({
      chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '1', note: 'lunch & drinks 50/50',
    })
    expect(uri).toContain(`&message=${encodeURIComponent('lunch & drinks 50/50')}`)
  })

  it('drops an empty/whitespace note entirely (no dangling param)', () => {
    const uri = buildPaymentRequestUri({
      chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '1', note: '   ',
    })
    expect(uri).not.toContain('message=')
  })

  it('caps the note at NOTE_MAX_LENGTH characters pre-encoding', () => {
    const uri = buildPaymentRequestUri({
      chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '1', note: 'x'.repeat(NOTE_MAX_LENGTH + 40),
    })
    const parsed = parsePaymentRequest(uri)
    expect(parsed.note).toHaveLength(NOTE_MAX_LENGTH)
  })

  it('never emits scientific notation for large amounts', () => {
    const uri = buildPaymentRequestUri({
      chainId: 1, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '1000000',
    })
    expect(uri).toContain('value=1000000000000000000000000')
    expect(uri).not.toMatch(/e\+/i)
  })

  it('throws on an invalid recipient, non-positive amount, or missing token for stable', () => {
    expect(() => buildPaymentRequestUri({ chainId: 137, to: '0x123', kind: 'native', decimals: 18, amount: '1' })).toThrow()
    expect(() => buildPaymentRequestUri({ chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '0' })).toThrow()
    expect(() => buildPaymentRequestUri({ chainId: 137, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: 'abc' })).toThrow()
    expect(() => buildPaymentRequestUri({ chainId: 137, to: TO_CHECKSUM, kind: 'stable', decimals: 6, amount: '1' })).toThrow()
    expect(() => buildPaymentRequestUri({ chainId: 0, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '1' })).toThrow()
  })
})

describe('parsePaymentRequest (spec 058 contract)', () => {
  it('parses the full ERC-20 /transfer form', () => {
    const parsed = parsePaymentRequest(`ethereum:${USDC}@137/transfer?address=${TO}&uint256=12500000&message=thanks`)
    expect(parsed).toEqual({
      to: TO_CHECKSUM,
      chainId: 137,
      tokenAddress: ethers.getAddress(USDC),
      amountUnits: 12500000n,
      note: 'thanks',
    })
  })

  it('parses the full native form', () => {
    const parsed = parsePaymentRequest(`ethereum:${TO}@137?value=250000000000000000`)
    expect(parsed).toEqual({
      to: TO_CHECKSUM, chainId: 137, tokenAddress: null, amountUnits: 250000000000000000n, note: null,
    })
  })

  it('parses a hex chain id and the EIP-681 pay- prefix', () => {
    expect(parsePaymentRequest(`ethereum:${TO}@0x89?value=1`).chainId).toBe(137)
    expect(parsePaymentRequest(`ethereum:pay-${TO}@137?value=1`).to).toBe(TO_CHECKSUM)
  })

  it('parses a bare ethereum:<address> URI as address-only', () => {
    expect(parsePaymentRequest(`ethereum:${TO}`)).toEqual({
      to: TO_CHECKSUM, chainId: null, tokenAddress: null, amountUnits: null, note: null,
    })
  })

  it('parses a raw 0x address as address-only (FR-009)', () => {
    expect(parsePaymentRequest(`  ${TO}  `)).toEqual({
      to: TO_CHECKSUM, chainId: null, tokenAddress: null, amountUnits: null, note: null,
    })
  })

  it('degrades malformed numeric params to address-only — never a wrong amount', () => {
    expect(parsePaymentRequest(`ethereum:${TO}@137?value=1.5`).amountUnits).toBeNull()
    expect(parsePaymentRequest(`ethereum:${TO}@137?value=2e18`).amountUnits).toBeNull()
    const token = parsePaymentRequest(`ethereum:${USDC}@137/transfer?address=${TO}&uint256=abc`)
    expect(token.to).toBe(TO_CHECKSUM)
    expect(token.amountUnits).toBeNull()
  })

  it('treats a malformed chain id as absent but keeps the address', () => {
    const parsed = parsePaymentRequest(`ethereum:${TO}@banana?value=5`)
    expect(parsed.to).toBe(TO_CHECKSUM)
    expect(parsed.chainId).toBeNull()
  })

  it('ignores unknown query params', () => {
    const parsed = parsePaymentRequest(`ethereum:${TO}@137?value=5&gas=21000&custom=x`)
    expect(parsed.amountUnits).toBe(5n)
  })

  it('returns null for unrecognizable input', () => {
    expect(parsePaymentRequest('')).toBeNull()
    expect(parsePaymentRequest('hello world')).toBeNull()
    expect(parsePaymentRequest('https://example.com/not-a-payment')).toBeNull()
    expect(parsePaymentRequest('ethereum:0x123')).toBeNull()
    expect(parsePaymentRequest(`ethereum:${USDC}@137/approve?address=${TO}&uint256=1`)).toBeNull()
    expect(parsePaymentRequest(`ethereum:${USDC}@137/transfer?uint256=1`)).toBeNull()
    expect(parsePaymentRequest(null)).toBeNull()
    expect(parsePaymentRequest(undefined)).toBeNull()
  })

  it('round-trips every buildPaymentRequestUri output (contract guarantee)', () => {
    const cases = [
      { chainId: 137, to: TO_CHECKSUM, kind: 'stable', tokenAddress: USDC, decimals: 6, amount: '12.5', note: 'split the bill' },
      { chainId: 137, to: TO_CHECKSUM, kind: 'stable', tokenAddress: USDC, decimals: 6, amount: '0.01' },
      { chainId: 61, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '3', note: 'ünïcode ✓ & sons' },
      { chainId: 1, to: TO_CHECKSUM, kind: 'native', decimals: 18, amount: '0.000001' },
    ]
    for (const input of cases) {
      const parsed = parsePaymentRequest(buildPaymentRequestUri(input))
      expect(parsed.to).toBe(TO_CHECKSUM)
      expect(parsed.chainId).toBe(input.chainId)
      expect(parsed.tokenAddress).toBe(input.kind === 'stable' ? ethers.getAddress(input.tokenAddress) : null)
      expect(parsed.amountUnits).toBe(ethers.parseUnits(input.amount, input.decimals))
      expect(parsed.note).toBe(input.note ? input.note : null)
    }
  })
})
