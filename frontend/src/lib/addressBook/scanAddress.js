import { parseBip21, classifyAddress } from '../bitcoin/addresses'

/**
 * Extract an EVM address from scanned QR content (Spec 021 iteration 2).
 *
 * Handles raw addresses, EIP-681 `ethereum:0x…` URIs, and URLs that carry the
 * address in their path or query (e.g. a FairWins share link). Returns a 0x
 * address string, or null when none is present.
 */
export function extractAddressFromScan(decodedText) {
  if (typeof decodedText !== 'string') return null
  const match = decodedText.match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
}

/**
 * Extract a Bitcoin destination from scanned QR content (spec 061, FR-016).
 *
 * Handles BIP-21 `bitcoin:` URIs (address + optional amount) and bare
 * addresses of any standard type, validated for `networkId` via
 * classifyAddress — a testnet address never resolves on mainnet or vice
 * versa. Returns { address, type, amountSats? } or null.
 */
export function extractBitcoinFromScan(decodedText, networkId) {
  if (typeof decodedText !== 'string') return null
  const text = decodedText.trim()
  if (/^bitcoin:/i.test(text)) {
    const parsed = parseBip21(text, networkId)
    return parsed?.error ? null : parsed
  }
  const classified = classifyAddress(text, networkId)
  return classified.valid ? { address: text, type: classified.type } : null
}

export default extractAddressFromScan
