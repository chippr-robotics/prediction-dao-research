import { describe, it, expect } from 'vitest'
import { resolveLogoSrc } from '../lib/tokens/tokenLogo'

// Spec 034 FR-024/FR-025 — registry logos only, from an allowlisted host; custom/unknown
// tokens never get a remote logo; ipfs:// is rewritten to the allowlisted ipfs.io gateway.

describe('resolveLogoSrc', () => {
  it('returns null for custom tokens (always placeholder)', () => {
    expect(
      resolveLogoSrc({ source: 'custom', logoURI: 'https://raw.githubusercontent.com/x.png' }),
    ).toBeNull()
  })

  it('rewrites ipfs:// to the ipfs.io gateway for registry tokens', () => {
    expect(resolveLogoSrc({ source: 'registry', logoURI: 'ipfs://QmABC/logo.png' })).toBe(
      'https://ipfs.io/ipfs/QmABC/logo.png',
    )
  })

  it('allows trusted https hosts', () => {
    const u = 'https://raw.githubusercontent.com/etcswap/tokens/main/x/logo.png'
    expect(resolveLogoSrc({ source: 'registry', logoURI: u })).toBe(u)
  })

  it('rejects untrusted hosts', () => {
    expect(resolveLogoSrc({ source: 'registry', logoURI: 'https://evil.example.com/x.png' })).toBeNull()
  })

  it('rejects non-https and missing logoURI', () => {
    expect(resolveLogoSrc({ source: 'registry', logoURI: 'http://raw.githubusercontent.com/x.png' })).toBeNull()
    expect(resolveLogoSrc({ source: 'registry' })).toBeNull()
  })
})
