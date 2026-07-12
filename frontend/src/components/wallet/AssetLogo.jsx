import './AssetLogo.css'

/**
 * AssetLogo (spec 044 v1.2, FR-026) — a primary asset logo with an optional
 * network sub-badge. All artwork is bundled inline SVG (no external image
 * CDNs). A native coin on its home mainnet renders the logo alone; wrapped,
 * bridged, and testnet instances carry the hosting network's badge so it is
 * always clear what an asset is and where it lives.
 *
 * Decorative: the surrounding row/sheet supplies the accessible text, so the
 * whole element is aria-hidden.
 */

// Simple, recognizable glyphs per underlying symbol. Fallback: a neutral
// disc with the symbol's first letters.
const ASSET_GLYPHS = {
  ETH: { bg: '#627EEA', glyph: 'diamond', fg: '#ffffff' },
  BTC: { bg: '#F7931A', glyph: 'B', fg: '#ffffff' },
  MATIC: { bg: '#8247E5', glyph: 'poly', fg: '#ffffff' },
  POL: { bg: '#8247E5', glyph: 'poly', fg: '#ffffff' },
  ETC: { bg: '#3AB83A', glyph: 'diamond', fg: '#ffffff' },
  SOL: { bg: '#1B1F2A', glyph: 'S', fg: '#14F195' },
  XRP: { bg: '#23292F', glyph: 'X', fg: '#ffffff' },
  LINK: { bg: '#2A5ADA', glyph: 'hex', fg: '#ffffff' },
  USDC: { bg: '#2775CA', glyph: '$', fg: '#ffffff' },
  USDT: { bg: '#26A17B', glyph: 'T', fg: '#ffffff' },
  USC: { bg: '#0F8A5F', glyph: '$', fg: '#ffffff' },
  FWMV: { bg: '#36B37E', glyph: 'clover', fg: '#ffffff' },
}

// Per-network badge colors (chainId → fill). Testnets get a dashed ring so
// they read as non-production at a glance.
const NETWORK_BADGES = {
  1: { bg: '#627EEA', label: 'E' },
  61: { bg: '#3AB83A', label: 'C' },
  137: { bg: '#8247E5', label: 'P' },
  11155111: { bg: '#9AA6B2', label: 'S', testnet: true },
  80002: { bg: '#B39DED', label: 'A', testnet: true },
  63: { bg: '#7FBF8E', label: 'M', testnet: true },
}

function Glyph({ spec }) {
  switch (spec.glyph) {
    case 'diamond':
      return (
        <g fill={spec.fg}>
          <path d="M16 5 L23.5 16.2 L16 20.6 L8.5 16.2 Z" opacity="0.9" />
          <path d="M16 22.6 L23.2 18.2 L16 27 L8.8 18.2 Z" opacity="0.75" />
        </g>
      )
    case 'poly':
      return (
        <g fill="none" stroke={spec.fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12 L9 20 M16 12 L16 20 M23 12 L23 20" />
          <path d="M9 12 L13 9 L16 12 L19 9 L23 12" />
          <path d="M9 20 L13 23 L16 20 L19 23 L23 20" />
          <g fill={spec.fg} stroke="none">
            <circle cx="9" cy="12" r="1.3" />
            <circle cx="23" cy="12" r="1.3" />
            <circle cx="9" cy="20" r="1.3" />
            <circle cx="23" cy="20" r="1.3" />
          </g>
        </g>
      )
    case 'hex':
      return (
        <path
          d="M16 6l8.5 5v10L16 26l-8.5-5V11z"
          fill="none"
          stroke={spec.fg}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      )
    case 'clover':
      return (
        <g fill={spec.fg}>
          <circle cx="12.6" cy="12.6" r="4" />
          <circle cx="19.4" cy="12.6" r="4" />
          <circle cx="12.6" cy="19.4" r="4" />
          <circle cx="19.4" cy="19.4" r="4" />
        </g>
      )
    default:
      return (
        <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="700" fill={spec.fg}>
          {spec.glyph}
        </text>
      )
  }
}

export default function AssetLogo({ symbol, chainId = null, showBadge = false, size = 32 }) {
  const key = (symbol || '').toUpperCase()
  const spec = ASSET_GLYPHS[key] || { bg: '#5A6772', glyph: key.slice(0, 2) || '?', fg: '#ffffff' }
  const badge = showBadge && chainId != null ? NETWORK_BADGES[chainId] : null

  return (
    <span className="asset-logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <circle cx="16" cy="16" r="16" fill={spec.bg} />
        <Glyph spec={spec} />
      </svg>
      {badge && (
        <span className={`asset-logo-badge ${badge.testnet ? 'asset-logo-badge-testnet' : ''}`}>
          <svg viewBox="0 0 16 16" width="100%" height="100%">
            <circle cx="8" cy="8" r="7" fill={badge.bg} />
            <text x="8" y="11" textAnchor="middle" fontSize="8" fontWeight="700" fill="#ffffff">
              {badge.label}
            </text>
          </svg>
        </span>
      )}
    </span>
  )
}
