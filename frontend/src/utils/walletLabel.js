// Resolve a human-friendly, vendor-neutral label for a wagmi connector.
//
// FairWins has no affiliation with any single wallet vendor, so the generic
// injected connector (whatever browser extension the user has installed) is
// labelled "Browser Wallet" rather than assuming MetaMask. A specific vendor
// name is only used when we can positively detect one — either from the
// connector's own name (EIP-6963 discovery surfaces real names) or from the
// injected provider flags on window.ethereum.
export function getWalletLabel(connector) {
  const name = connector?.name?.toLowerCase() || ''
  const type = connector?.type?.toLowerCase() || ''

  // Passkey smart accounts (spec 041) — device biometrics, no vendor involved.
  if (type === 'passkey' || connector?.id === 'fairwinsPasskey') return 'Passkey'
  if (name.includes('walletconnect') || type === 'walletconnect') return 'WalletConnect'
  if (name.includes('coinbase')) return 'Coinbase Wallet'
  if (name.includes('brave')) return 'Brave Wallet'
  if (name.includes('rabby')) return 'Rabby'
  if (name.includes('metamask') || type === 'metamask') return 'MetaMask'

  if (name === 'injected' || type === 'injected') {
    // The catch-all injected connector represents any browser wallet. Try to
    // name the active provider, but fall back to the inclusive default.
    if (typeof window !== 'undefined' && window.ethereum) {
      if (window.ethereum.isMetaMask) return 'MetaMask'
      if (window.ethereum.isCoinbaseWallet) return 'Coinbase Wallet'
      if (window.ethereum.isBraveWallet) return 'Brave Wallet'
      if (window.ethereum.isRabby) return 'Rabby'
    }
    return 'Browser Wallet'
  }

  return connector?.name || 'Browser Wallet'
}

// Pick a vendor-neutral icon for a connector. WalletConnect keeps its link
// glyph; everything else uses a generic wallet glyph so no single vendor is
// visually privileged as the default.
export function getWalletIcon(connector) {
  const label = getWalletLabel(connector)
  if (label === 'Passkey') return '🔒' // device biometric / passkey
  if (label === 'WalletConnect') return '🔗' // 🔗
  return '👛' // 👛
}
