import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock wagmi ENS hooks
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useEnsAddress: vi.fn(() => ({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })),
    useEnsName: vi.fn(() => ({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })),
  }
})

// Mock wagmi/chains
vi.mock('wagmi/chains', () => ({
  mainnet: { id: 1 },
}))

// Mock viem/ens normalize
vi.mock('viem/ens', () => ({
  normalize: vi.fn((name) => name),
}))

import { useEnsAddress, useEnsName } from 'wagmi'
import { normalize } from 'viem/ens'
import {
  useEnsResolution,
  useEnsReverseLookup,
  useAddressInput,
} from '../hooks/useEnsResolution'

const VALID_ADDRESS = '0x1234567890123456789012345678901234567890'
const RESOLVED_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

describe('useEnsResolution hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEnsAddress).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })
    vi.mocked(normalize).mockImplementation((name) => name)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('with direct address input', () => {
    it('should resolve a valid Ethereum address directly', () => {
      const { result } = renderHook(() => useEnsResolution(VALID_ADDRESS))

      expect(result.current.resolvedAddress).toBe(VALID_ADDRESS)
      expect(result.current.isAddress).toBe(true)
      expect(result.current.isEns).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should not trigger ENS resolution for addresses', () => {
      renderHook(() => useEnsResolution(VALID_ADDRESS))

      // useEnsAddress should be called but with name: null
      expect(vi.mocked(useEnsAddress)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: null,
        })
      )
    })
  })

  describe('with ENS name input', () => {
    it('should identify ENS names', () => {
      const { result } = renderHook(() => useEnsResolution('vitalik.eth'))

      expect(result.current.isEns).toBe(true)
      expect(result.current.isAddress).toBe(false)
    })

    it('should return resolved address from ENS', () => {
      vi.mocked(useEnsAddress).mockReturnValue({
        data: RESOLVED_ADDRESS,
        isLoading: false,
        isError: false,
        error: null,
      })

      const { result } = renderHook(() => useEnsResolution('vitalik.eth'))

      expect(result.current.resolvedAddress).toBe(RESOLVED_ADDRESS)
      expect(result.current.error).toBeNull()
    })

    it('should show loading state during ENS resolution', () => {
      vi.mocked(useEnsAddress).mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
      })

      const { result } = renderHook(() => useEnsResolution('vitalik.eth'))

      expect(result.current.isLoading).toBe(true)
      expect(result.current.resolvedAddress).toBeNull()
    })

    it('should return error when ENS resolution fails', () => {
      vi.mocked(useEnsAddress).mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: { message: 'ENS name not found' },
      })

      const { result } = renderHook(() => useEnsResolution('nonexistent.eth'))

      expect(result.current.error).toBe('ENS name not found')
      expect(result.current.resolvedAddress).toBeNull()
    })

    it('should return generic error when ENS resolution fails without message', () => {
      vi.mocked(useEnsAddress).mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: null,
      })

      const { result } = renderHook(() => useEnsResolution('nonexistent.eth'))

      expect(result.current.error).toBe('Could not resolve ENS name')
    })

    it('should handle ENS normalization errors', () => {
      vi.mocked(normalize).mockImplementation(() => {
        throw new Error('Invalid ENS name format')
      })

      // Use a name that passes the isEnsName regex but fails normalization
      const { result } = renderHook(() => useEnsResolution('test-name.eth'))

      expect(result.current.error).toBe('Invalid ENS name format')
      expect(result.current.resolvedAddress).toBeNull()
    })
  })

  describe('with invalid input', () => {
    it('should return error for non-address non-ENS input', () => {
      const { result } = renderHook(() => useEnsResolution('random-text'))

      expect(result.current.error).toBe('Enter a valid Ethereum address or ENS name')
      expect(result.current.resolvedAddress).toBeNull()
    })

    it('should handle empty string input', () => {
      const { result } = renderHook(() => useEnsResolution(''))

      expect(result.current.resolvedAddress).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.isEns).toBe(false)
      expect(result.current.isAddress).toBe(false)
    })

    it('should handle null input', () => {
      const { result } = renderHook(() => useEnsResolution(null))

      expect(result.current.resolvedAddress).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should handle undefined input', () => {
      const { result } = renderHook(() => useEnsResolution(undefined))

      expect(result.current.resolvedAddress).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should trim whitespace from input', () => {
      const { result } = renderHook(() => useEnsResolution(`  ${VALID_ADDRESS}  `))

      expect(result.current.resolvedAddress).toBe(VALID_ADDRESS)
      expect(result.current.originalInput).toBe(VALID_ADDRESS)
    })
  })

  describe('originalInput', () => {
    it('should expose trimmed original input', () => {
      const { result } = renderHook(() => useEnsResolution('vitalik.eth'))
      expect(result.current.originalInput).toBe('vitalik.eth')
    })

    it('should expose empty string for empty input', () => {
      const { result } = renderHook(() => useEnsResolution(''))
      expect(result.current.originalInput).toBe('')
    })
  })
})

describe('useEnsReverseLookup hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEnsName).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })
  })

  it('should return ENS name for a valid address', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: 'vitalik.eth',
      isLoading: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useEnsReverseLookup(VALID_ADDRESS))

    expect(result.current.ensName).toBe('vitalik.eth')
    expect(result.current.hasEnsName).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should return null ensName when no ENS name exists', () => {
    const { result } = renderHook(() => useEnsReverseLookup(VALID_ADDRESS))

    expect(result.current.ensName).toBeNull()
    expect(result.current.hasEnsName).toBe(false)
  })

  it('should show loading state', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useEnsReverseLookup(VALID_ADDRESS))

    expect(result.current.isLoading).toBe(true)
  })

  it('should handle errors', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { message: 'Lookup failed' },
    })

    const { result } = renderHook(() => useEnsReverseLookup(VALID_ADDRESS))

    expect(result.current.error).toBe('Lookup failed')
  })

  it('should return generic error when error has no message', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: null,
    })

    const { result } = renderHook(() => useEnsReverseLookup(VALID_ADDRESS))

    expect(result.current.error).toBe('Could not lookup ENS name')
  })

  it('should not load for invalid addresses', () => {
    const { result } = renderHook(() => useEnsReverseLookup('not-an-address'))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.ensName).toBeNull()
  })
})

describe('useAddressInput hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useEnsAddress).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })
    vi.mocked(useEnsName).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    })
    vi.mocked(normalize).mockImplementation((name) => name)
  })

  it('should handle address input', () => {
    const { result } = renderHook(() => useAddressInput(VALID_ADDRESS))

    expect(result.current.isAddressInput).toBe(true)
    expect(result.current.isEnsInput).toBe(false)
    expect(result.current.resolvedAddress).toBe(VALID_ADDRESS)
    expect(result.current.isValid).toBe(true)
    expect(result.current.isEmpty).toBe(false)
  })

  it('should handle ENS input', () => {
    vi.mocked(useEnsAddress).mockReturnValue({
      data: RESOLVED_ADDRESS,
      isLoading: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAddressInput('vitalik.eth'))

    expect(result.current.isEnsInput).toBe(true)
    expect(result.current.isAddressInput).toBe(false)
    expect(result.current.resolvedAddress).toBe(RESOLVED_ADDRESS)
    expect(result.current.isValid).toBe(true)
  })

  it('should handle empty input', () => {
    const { result } = renderHook(() => useAddressInput(''))

    expect(result.current.isEmpty).toBe(true)
    expect(result.current.isValid).toBe(false)
    expect(result.current.resolvedAddress).toBeNull()
  })

  it('should provide display name from reverse lookup', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: 'user.eth',
      isLoading: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAddressInput(VALID_ADDRESS))

    expect(result.current.displayName).toBe('user.eth')
  })

  it('should show resolution error', () => {
    vi.mocked(useEnsAddress).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: { message: 'Not found' },
    })

    const { result } = renderHook(() => useAddressInput('nonexistent.eth'))

    expect(result.current.resolutionError).toBe('Not found')
    expect(result.current.isValid).toBe(false)
  })

  it('should expose isResolving state', () => {
    vi.mocked(useEnsAddress).mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAddressInput('vitalik.eth'))

    expect(result.current.isResolving).toBe(true)
  })

  it('should format display value for ENS with resolved address', () => {
    vi.mocked(useEnsAddress).mockReturnValue({
      data: RESOLVED_ADDRESS,
      isLoading: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAddressInput('vitalik.eth'))

    // Should contain the ENS name and a shortened address
    expect(result.current.displayValue).toContain('vitalik.eth')
    expect(result.current.displayValue).toContain('0xd8dA')
  })

  it('should format display value for address with ENS name', () => {
    vi.mocked(useEnsName).mockReturnValue({
      data: 'user.eth',
      isLoading: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useAddressInput(VALID_ADDRESS))

    expect(result.current.displayValue).toContain('user.eth')
    expect(result.current.displayValue).toContain('0x1234')
  })
})
