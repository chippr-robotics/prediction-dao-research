/**
 * Curated store artwork (spec 077, US1) — the illustrations on the catalog's app cards.
 *
 * This map is HOST-side on purpose. Nothing in the registry record, the manifest schema, or the
 * host object carries an icon, and none of them may grow one for this: an on-chain icon field
 * would widen the trust surface, and artwork inside a package would move keccak-committed bytes
 * and hand every vendor a self-served image channel into the catalog. Art here is a pure
 * presentation concern, curated with the host, keyed by the same slug the launch route uses.
 *
 * Rules (contracts/store-ui.md §3):
 *   - `artworkFor(slug)` is TOTAL: any input — unknown slug, null, garbage — returns renderable
 *     art. Unknown apps get the deliberate generic illustration, never a broken image and never a
 *     borrowed identity.
 *   - Every illustration is decorative (`aria-hidden`): the card's text carries the app's name,
 *     so the art must never be the only carrier of meaning (WCAG 1.1.1 the honest way round).
 *   - Inline SVG only, colored through the app's theme variables with literal fallbacks — the same
 *     convention miniapps.css uses — so light/dark and tenant themes restyle the art with no
 *     second asset set and no external fetches (no new CSP surface).
 */

/** Shared wrapper: fixed viewBox, decorative, themed by the surrounding card. */
function Art({ children }) {
  return (
    <svg
      className="miniapp-art"
      viewBox="0 0 64 64"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Token Mint — a coin press stamping out tokens. */
function TokenMintArt() {
  return (
    <Art>
      <g fill="none" stroke="var(--text-primary, #2f3b45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* press body */}
        <rect x="18" y="26" width="28" height="18" rx="3" fill="var(--surface-color, #f4f7f6)" />
        <path d="M24 44v6h16v-6" />
        <rect x="14" y="50" width="36" height="6" rx="2" fill="var(--surface-color, #f4f7f6)" />
        {/* hopper */}
        <path d="M26 26v-5h12v5" />
        {/* minted coins */}
        <circle cx="20" cy="14" r="7" fill="var(--brand-primary, #10b981)" fillOpacity="0.18" />
        <circle cx="20" cy="14" r="7" />
        <path d="M17.5 14h5M20 11.5v5" />
        <circle cx="38" cy="10" r="6" fill="var(--brand-primary, #10b981)" fillOpacity="0.18" />
        <circle cx="38" cy="10" r="6" />
        <circle cx="50" cy="18" r="5" fill="var(--brand-primary, #10b981)" fillOpacity="0.18" />
        <circle cx="50" cy="18" r="5" />
        {/* stamped token emerging */}
        <circle cx="32" cy="35" r="5" stroke="var(--brand-primary, #10b981)" />
        <path d="M30 35h4" stroke="var(--brand-primary, #10b981)" />
      </g>
    </Art>
  )
}

/** ClearPath — a compass over a governance path: propose → vote → execute. */
function ClearPathArt() {
  return (
    <Art>
      <g fill="none" stroke="var(--text-primary, #2f3b45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* compass */}
        <circle cx="22" cy="22" r="13" fill="var(--surface-color, #f4f7f6)" />
        <path d="M22 11v3M22 30v3M11 22h3M30 22h3" />
        <path d="M27 17l-3.4 6.6L17 27l3.4-6.6L27 17Z" fill="var(--brand-primary, #10b981)" fillOpacity="0.25" />
        {/* path with checkpoints */}
        <path d="M14 50c10 4 18-8 28-4 6 2.4 10-2 12-6" strokeDasharray="4 4" stroke="var(--text-secondary, #5a6772)" />
        <circle cx="44" cy="44" r="5" fill="var(--brand-primary, #10b981)" fillOpacity="0.18" />
        <circle cx="44" cy="44" r="5" />
        <path d="M42 44l1.6 1.6L47 42.6" stroke="var(--brand-primary, #10b981)" />
        <circle cx="55" cy="34" r="4" />
        <circle cx="26" cy="52" r="4" />
      </g>
    </Art>
  )
}

/** The deliberate generic: an app tile taking shape. Identity-free by design. */
function GenericAppArt() {
  return (
    <Art>
      <g fill="none" stroke="var(--text-secondary, #5a6772)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="12" y="12" width="18" height="18" rx="5" fill="var(--surface-color, #f4f7f6)" />
        <rect x="34" y="12" width="18" height="18" rx="5" fill="var(--surface-color, #f4f7f6)" />
        <rect x="12" y="34" width="18" height="18" rx="5" fill="var(--surface-color, #f4f7f6)" />
        <rect x="34" y="34" width="18" height="18" rx="9" stroke="var(--brand-primary, #10b981)" strokeDasharray="4 3" />
        <path d="M43 39v8M39 43h8" stroke="var(--brand-primary, #10b981)" />
      </g>
    </Art>
  )
}

/* ---- Chrome glyphs (spec 077) ------------------------------------------------------------- */
/*
 * Decorative glyphs for the store chrome. All `aria-hidden`: each sits beside (or inside a
 * control that carries) text or an aria-label saying the same thing, so the art adds flavour,
 * never meaning. They live here rather than in CatalogPanel so components-only files stay
 * components-only (react-refresh) and the sheet can share them.
 */

export function RocketGlyph() {
  return (
    <svg className="miniapp-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13.5c-1.8-.6-3-1.8-3.5-3.5C7.6 5.6 10.4 3.2 15 3c-.2 4.6-2.6 7.4-7 8.5Z" />
        <circle cx="11.6" cy="6.4" r="1.2" />
        <path d="M6.5 10 4 11.5 6 12M10 13.5 8.5 16l-.5-2M5.5 14.5 4 16" />
      </g>
    </svg>
  )
}

export function RefreshGlyph() {
  return (
    <svg className="miniapp-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
        <path d="M16.5 2.8v3.4h-3.4" />
      </g>
    </svg>
  )
}

export function VerifiedBadgeGlyph() {
  return (
    <svg className="miniapp-glyph miniapp-glyph-badge" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {/* rosette: scalloped seal with a check — the concept art's rainbow badge, themed */}
      <path
        d="M10 1.6l1.9 1.2 2.2-.3 1 2 2 1-.3 2.2L18 10l-1.2 1.9.3 2.2-2 1-1 2-2.2-.3L10 18.4l-1.9-1.2-2.2.3-1-2-2-1 .3-2.2L2 10l1.2-1.9-.3-2.2 2-1 1-2 2.2.3L10 1.6Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M10 1.6l1.9 1.2 2.2-.3 1 2 2 1-.3 2.2L18 10l-1.2 1.9.3 2.2-2 1-1 2-2.2-.3L10 18.4l-1.9-1.2-2.2.3-1-2-2-1 .3-2.2L2 10l1.2-1.9-.3-2.2 2-1 1-2 2.2.3L10 1.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.8 10.2l2.1 2.1 4.3-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export { TokenMintArt, ClearPathArt, GenericAppArt }
