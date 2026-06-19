import { describe, it, expect } from 'vitest'
import { extractAddressFromScan } from '../../lib/addressBook/scanAddress'

const ADDR = '0x52908400098527886E0F7030069857D2E4169EE7'

describe('extractAddressFromScan', () => {
  it('returns a raw address as-is', () => {
    expect(extractAddressFromScan(ADDR)).toBe(ADDR)
  })

  it('extracts from an EIP-681 ethereum: URI', () => {
    expect(extractAddressFromScan(`ethereum:${ADDR}@137`)).toBe(ADDR)
  })

  it('extracts from a share URL path or query', () => {
    expect(extractAddressFromScan(`https://fairwins.app/u/${ADDR}`)).toBe(ADDR)
    expect(extractAddressFromScan(`https://fairwins.app/?address=${ADDR}`)).toBe(ADDR)
  })

  it('returns null when no address is present', () => {
    expect(extractAddressFromScan('not an address')).toBeNull()
    expect(extractAddressFromScan('')).toBeNull()
    expect(extractAddressFromScan(null)).toBeNull()
  })

  it('ignores too-short hex strings', () => {
    expect(extractAddressFromScan('0x1234')).toBeNull()
  })
})
