/**
 * Tests for blockExplorer configuration — targeting 90% coverage.
 * Tests URL builders for different networks and link types.
 */
import { describe, it, expect } from 'vitest'
import {
  BLOCKSCOUT_URLS,
  getBlockscoutBaseUrl,
  getBlockscoutUrl,
  getAddressUrl,
  getTransactionUrl,
  getBlockUrl,
  getTokenUrl,
} from '../config/blockExplorer'

describe('BLOCKSCOUT_URLS', () => {
  it('contains all supported chain IDs', () => {
    expect(BLOCKSCOUT_URLS[61]).toBe('https://etc.blockscout.com')
    expect(BLOCKSCOUT_URLS[63]).toBe('https://etc-mordor.blockscout.com')
    expect(BLOCKSCOUT_URLS[137]).toBe('https://polygonscan.com')
    expect(BLOCKSCOUT_URLS[80002]).toBe('https://amoy.polygonscan.com')
  })
})

describe('getBlockscoutBaseUrl', () => {
  it('returns correct URL for ETC Mainnet', () => {
    expect(getBlockscoutBaseUrl(61)).toBe('https://etc.blockscout.com')
  })

  it('returns correct URL for Mordor Testnet', () => {
    expect(getBlockscoutBaseUrl(63)).toBe('https://etc-mordor.blockscout.com')
  })

  it('returns correct URL for Polygon Mainnet', () => {
    expect(getBlockscoutBaseUrl(137)).toBe('https://polygonscan.com')
  })

  it('returns correct URL for Polygon Amoy', () => {
    expect(getBlockscoutBaseUrl(80002)).toBe('https://amoy.polygonscan.com')
  })

  it('defaults to Amoy for unknown chain IDs', () => {
    expect(getBlockscoutBaseUrl(999)).toBe('https://amoy.polygonscan.com')
    expect(getBlockscoutBaseUrl(0)).toBe('https://amoy.polygonscan.com')
    expect(getBlockscoutBaseUrl(undefined)).toBe('https://amoy.polygonscan.com')
  })
})

describe('getBlockscoutUrl', () => {
  const hash = '0x1234567890abcdef'

  it('builds address URL by default', () => {
    expect(getBlockscoutUrl(61, hash)).toBe(`https://etc.blockscout.com/address/${hash}`)
  })

  it('builds tx URL', () => {
    expect(getBlockscoutUrl(63, hash, 'tx')).toBe(`https://etc-mordor.blockscout.com/tx/${hash}`)
  })

  it('builds block URL', () => {
    expect(getBlockscoutUrl(137, '12345', 'block')).toBe('https://polygonscan.com/block/12345')
  })

  it('builds token URL', () => {
    expect(getBlockscoutUrl(80002, hash, 'token')).toBe(`https://amoy.polygonscan.com/token/${hash}`)
  })

  it('defaults unknown chain to Amoy', () => {
    expect(getBlockscoutUrl(999, hash, 'tx')).toBe(`https://amoy.polygonscan.com/tx/${hash}`)
  })
})

describe('getAddressUrl', () => {
  const addr = '0xABCDEF1234567890'

  it('builds basic address URL without tab', () => {
    expect(getAddressUrl(61, addr)).toBe(`https://etc.blockscout.com/address/${addr}`)
  })

  it('builds address URL with tab=contract', () => {
    expect(getAddressUrl(61, addr, 'contract')).toBe(`https://etc.blockscout.com/address/${addr}?tab=contract`)
  })

  it('builds address URL with tab=transactions', () => {
    expect(getAddressUrl(137, addr, 'transactions')).toBe(`https://polygonscan.com/address/${addr}?tab=transactions`)
  })

  it('builds address URL with tab=token_transfers', () => {
    expect(getAddressUrl(80002, addr, 'token_transfers')).toBe(`https://amoy.polygonscan.com/address/${addr}?tab=token_transfers`)
  })

  it('builds address URL with tab=internal_txns', () => {
    expect(getAddressUrl(63, addr, 'internal_txns')).toBe(`https://etc-mordor.blockscout.com/address/${addr}?tab=internal_txns`)
  })

  it('handles null tab same as no tab', () => {
    expect(getAddressUrl(61, addr, null)).toBe(`https://etc.blockscout.com/address/${addr}`)
  })
})

describe('getTransactionUrl', () => {
  const txHash = '0xtxhash123'

  it('builds tx URL for each chain', () => {
    expect(getTransactionUrl(61, txHash)).toBe(`https://etc.blockscout.com/tx/${txHash}`)
    expect(getTransactionUrl(63, txHash)).toBe(`https://etc-mordor.blockscout.com/tx/${txHash}`)
    expect(getTransactionUrl(137, txHash)).toBe(`https://polygonscan.com/tx/${txHash}`)
    expect(getTransactionUrl(80002, txHash)).toBe(`https://amoy.polygonscan.com/tx/${txHash}`)
  })
})

describe('getBlockUrl', () => {
  it('builds block URL with number', () => {
    expect(getBlockUrl(61, 12345)).toBe('https://etc.blockscout.com/block/12345')
  })

  it('builds block URL with string', () => {
    expect(getBlockUrl(137, '67890')).toBe('https://polygonscan.com/block/67890')
  })
})

describe('getTokenUrl', () => {
  const tokenAddr = '0xtoken123'

  it('builds token URL for each chain', () => {
    expect(getTokenUrl(61, tokenAddr)).toBe(`https://etc.blockscout.com/token/${tokenAddr}`)
    expect(getTokenUrl(63, tokenAddr)).toBe(`https://etc-mordor.blockscout.com/token/${tokenAddr}`)
    expect(getTokenUrl(137, tokenAddr)).toBe(`https://polygonscan.com/token/${tokenAddr}`)
    expect(getTokenUrl(80002, tokenAddr)).toBe(`https://amoy.polygonscan.com/token/${tokenAddr}`)
  })
})
