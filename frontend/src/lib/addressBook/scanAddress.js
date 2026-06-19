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

export default extractAddressFromScan
