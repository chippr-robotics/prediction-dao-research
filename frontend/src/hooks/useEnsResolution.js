import { useEnsAddress, useEnsName } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { normalize } from 'viem/ens'
import { isEnsName, isValidEthereumAddress } from '../utils/validation'

/**
 * Hook to resolve ENS names to Ethereum addresses
 *
 * Uses Ethereum mainnet for ENS resolution, regardless of the current chain.
 * This allows apps on other chains (like Ethereum Classic) to still use ENS.
 *
 * @param {string} nameOrAddress - ENS name or Ethereum address
 * @returns {Object} Resolution result with address, loading state, and error
 *
 * @example
 * const { resolvedAddress, isLoading, error, isEns } = useEnsResolution('vitalik.eth')
 * // resolvedAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
 */
export function useEnsResolution(nameOrAddress) {
  const trimmedInput = nameOrAddress?.trim() || ''
  const isEns = isEnsName(trimmedInput)
  const isAddress = isValidEthereumAddress(trimmedInput)

  // Normalize ENS name for resolution
  let normalizedName = null
  let normalizeError = null

  if (isEns) {
    try {
      normalizedName = normalize(trimmedInput.toLowerCase())
    } catch (err) {
      normalizeError = err.message || 'Invalid ENS name format'
    }
  }

  // Use wagmi's useEnsAddress hook for resolution
  // Always use mainnet for ENS resolution
  const {
    data: ensAddress,
    isLoading: isEnsLoading,
    isError: isEnsError,
    error: ensError
  } = useEnsAddress({
    name: normalizedName,
    chainId: mainnet.id,
    query: {
      enabled: isEns && !normalizeError && !!normalizedName,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    }
  })

  // Determine the final resolved address
  let resolvedAddress = null
  let error = null
  let isLoading = false

  if (isAddress) {
    // Direct address input - no resolution needed
    resolvedAddress = trimmedInput
  } else if (isEns) {
    if (normalizeError) {
      error = normalizeError
    } else if (isEnsLoading) {
      isLoading = true
    } else if (isEnsError || !ensAddress) {
      error = ensError?.message || 'Could not resolve ENS name'
    } else {
      resolvedAddress = ensAddress
    }
  } else if (trimmedInput && trimmedInput.length > 0) {
    // Not empty, not an address, not an ENS name
    error = 'Enter a valid Ethereum address or ENS name'
  }

  return {
    resolvedAddress,
    isLoading,
    error,
    isEns,
    isAddress,
    originalInput: trimmedInput
  }
}

/**
 * Hook to get the ENS name for an Ethereum address (reverse lookup)
 *
 * @param {string} address - Ethereum address
 * @returns {Object} Lookup result with ENS name, loading state, and error
 *
 * @example
 * const { ensName, isLoading, error } = useEnsReverseLookup('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
 * // ensName: 'vitalik.eth'
 */
export function useEnsReverseLookup(address) {
  const isAddress = isValidEthereumAddress(address)

  const {
    data: ensName,
    isLoading,
    isError,
    error: ensError
  } = useEnsName({
    address: isAddress ? address : undefined,
    chainId: mainnet.id,
    query: {
      enabled: isAddress,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }
  })

  return {
    ensName: ensName || null,
    isLoading: isAddress && isLoading,
    error: isError ? (ensError?.message || 'Could not lookup ENS name') : null,
    hasEnsName: !!ensName
  }
}

/**
 * Combined hook for address input fields that supports both:
 * - ENS name resolution (name -> address)
 * - Display of ENS names for known addresses (address -> name)
 *
 * @param {string} input - User input (address or ENS name)
 * @returns {Object} Complete resolution state
 */
export function useAddressInput(input) {
  const resolution = useEnsResolution(input)
  const reverseLookup = useEnsReverseLookup(resolution.resolvedAddress)

  return {
    // Input state
    input: resolution.originalInput,
    isEnsInput: resolution.isEns,
    isAddressInput: resolution.isAddress,

    // Resolution state
    resolvedAddress: resolution.resolvedAddress,
    isResolving: resolution.isLoading,
    resolutionError: resolution.error,

    // Reverse lookup state (for displaying ENS name when address is entered)
    displayName: reverseLookup.ensName,
    isLookingUp: reverseLookup.isLoading,

    // Validation helpers
    isValid: !!resolution.resolvedAddress && !resolution.error,
    isEmpty: !resolution.originalInput,

    // For display purposes
    displayValue: resolution.isEns
      ? (resolution.resolvedAddress
          ? `${resolution.originalInput} (${formatAddress(resolution.resolvedAddress)})`
          : resolution.originalInput)
      : (reverseLookup.ensName
          ? `${formatAddress(resolution.originalInput)} (${reverseLookup.ensName})`
          : resolution.originalInput)
  }
}

/**
 * Format an Ethereum address for display (shortened)
 * @param {string} address - Full Ethereum address
 * @returns {string} Shortened address like 0x1234...5678
 */
function formatAddress(address) {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default useEnsResolution
