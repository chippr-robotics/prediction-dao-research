/**
 * useOpponentName (spec 040, US1 / FR-001..002) — resolve a counterparty address to the friendliest
 * available display name, in priority order:
 *
 *   1. Address book — the member's own nickname for the address (authoritative).
 *   2. Wager tag — the counterparty's registered `%tag`, if any (spec 054).
 *   3. ENS — the reverse-resolved mainnet name, if any.
 *   4. Generated — a deterministic two-word name derived from the address.
 *
 * The generated fallback is always available synchronously, so a card never shows a spinner or a raw
 * address while ENS resolves. Read-only; no wallet signature.
 *
 * It reads the wallet context OPTIONALLY (via useContext, not the throwing useWallet) and loads the
 * address book through the pure store — so this display helper works even in lightweight renders that
 * have no WalletProvider (e.g. a single card in a test), degrading gracefully to ENS + generated.
 */
import { useContext, useMemo } from 'react'
import { WalletContext } from '../contexts/WalletContext.js'
import { useEnsReverseLookup } from './useEnsResolution'
import { useWagerTag } from './useWagerTag'
import { formatTag } from '../lib/tags/normalizeTag'
import { loadAddressBook, findByAddress as findByAddressPure } from '../lib/addressBook/addressBookStore'
import { deriveAddressName } from '../lib/naming/addressName'
import { isValidEthereumAddress } from '../utils/validation'

/**
 * @param {string} address the counterparty address to resolve
 * @param {{ chainId?: number }} [opts]
 * @returns {{ displayName: string, source: 'addressBook'|'wagerTag'|'ens'|'generated', address: string, verified: boolean, isLoading: boolean }}
 */
export function useOpponentName(address, { chainId: chainIdArg } = {}) {
  const wallet = useContext(WalletContext)
  const walletAddress = wallet?.address || wallet?.account
  const chainId = chainIdArg ?? wallet?.chainId
  const isAddress = isValidEthereumAddress(address)
  const { tag, verified, isLoading: tagLoading } = useWagerTag(isAddress ? address : undefined)
  const { ensName, isLoading } = useEnsReverseLookup(isAddress ? address : undefined)

  return useMemo(() => {
    if (!isAddress) {
      return { displayName: address || '—', source: 'generated', address: address || '', verified: false, isLoading: false }
    }

    // 1) Address book nickname wins. findByAddress → { contact, savedAddress } | undefined.
    let bookName
    if (walletAddress) {
      try {
        const entry = findByAddressPure(loadAddressBook(walletAddress), address, chainId)
        bookName = entry?.contact?.nickname
      } catch {
        // No/unreadable book — fall through to tag / ENS / generated.
      }
    }
    if (bookName) {
      return { displayName: bookName, source: 'addressBook', address, verified: false, isLoading: false }
    }

    // 2) Wager tag (spec 054), rendered `%tag`. Soft-fails to the rest of the chain.
    if (tag) {
      return { displayName: formatTag(tag), source: 'wagerTag', address, verified, isLoading: false }
    }

    // 3) ENS reverse record.
    if (ensName) {
      return { displayName: ensName, source: 'ens', address, verified: false, isLoading: false }
    }

    // 4) Deterministic generated name (always available).
    return { displayName: deriveAddressName(address).label, source: 'generated', address, verified: false, isLoading: isLoading || tagLoading }
  }, [isAddress, address, chainId, walletAddress, tag, verified, tagLoading, ensName, isLoading])
}

export default useOpponentName
