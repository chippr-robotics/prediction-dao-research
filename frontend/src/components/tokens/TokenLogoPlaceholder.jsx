/**
 * Neutral, bundled token logo placeholder (Spec 034, FR-024/FR-025).
 *
 * Rendered for custom/unknown tokens and as the fallback when a registry logo is
 * missing, untrusted, or fails to load. It is an inline SVG — NEVER a remote
 * image — so it carries no CSP/privacy footprint. Shows up to two initials of
 * the token symbol over a neutral disc.
 */
export default function TokenLogoPlaceholder({ symbol = '', size = 28 }) {
  const initials = String(symbol).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'
  return (
    <svg
      className="tm-logo tm-logo-placeholder"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="14" cy="14" r="14" fill="var(--tm-border, #d0d0d0)" />
      <text
        x="14"
        y="14"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="11"
        fontFamily="var(--tm-sans, system-ui, sans-serif)"
        fill="var(--tm-text-2, #444)"
      >
        {initials}
      </text>
    </svg>
  )
}
