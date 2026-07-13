/**
 * useOpponentName (spec 040, US1 / FR-001..002) — resolve a counterparty address to the friendliest
 * available display name, in priority order:
 *
 *   1. Address book — the member's own nickname for the address (authoritative).
 *   2. Callsign — the counterparty's registered `%callsign`, if any (spec 054).
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
import { useCallsign } from './useCallsign'
import { formatCallsign } from '../lib/callsigns/normalizeCallsign'
import { loadAddressBook, findByAddress as findByAddressPure } from '../lib/addressBook/addressBookStore'
import { deriveAddressName } from '../lib/naming/addressName'
import { isValidEthereumAddress } from '../utils/validation'

/**
 * @param {string} address the counterparty address to resolve
 * @param {{ chainId?: number }} [opts]
 * @returns {{ displayName: string, source: 'addressBook'|'callsign'|'ens'|'generated', address: string, verified: boolean, isLoading: boolean }}
 */
export function useOpponentName(address, { chainId: chainIdArg } = {}) {
  const wallet = useContext(WalletContext)
  const walletAddress = wallet?.address || wallet?.account
  const chainId = chainIdArg ?? wallet?.chainId
  const isAddress = isValidEthereumAddress(address)
  const { callsign, verified, isLoading: callsignLoading } = useCallsign(isAddress ? address : undefined)
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
        // No/unreadable book — fall through to callsign / ENS / generated.
      }
    }
    if (bookName) {
      return { displayName: bookName, source: 'addressBook', address, verified: false, isLoading: false }
    }

    // 2) Callsign (spec 054), rendered `%callsign`. Soft-fails to the rest of the chain.
    if (callsign) {
      return { displayName: formatCallsign(callsign), source: 'callsign', address, verified, isLoading: false }
    }

    // 3) ENS reverse record.
    if (ensName) {
      return { displayName: ensName, source: 'ens', address, verified: false, isLoading: false }
    }

    // 4) Deterministic generated name (always available).
    return { displayName: deriveAddressName(address).label, source: 'generated', address, verified: false, isLoading: isLoading || callsignLoading }
  }, [isAddress, address, chainId, walletAddress, callsign, verified, callsignLoading, ensName, isLoading])
}

export default useOpponentName
