/**
 * Resolution-path icons (spec 052 feedback) — small, stroke-based SVGs that sit
 * beside each "how is it resolved?" option so the choice reads at a glance. They
 * use currentColor and inherit sizing from the PillSelect option, and are marked
 * aria-hidden (the option label carries the accessible name).
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

/** Either side submits — two people facing each other (both parties settle). */
export function EitherSideIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M3.5 19v-1a4 4 0 0 1 4-4h1" />
      <circle cx="16" cy="8" r="2.4" />
      <path d="M20.5 19v-1a4 4 0 0 0-4-4h-1" />
    </svg>
  )
}

/** Named third-party arbitrator — a balance scale (a neutral decides). */
export function ThirdPartyIcon() {
  return (
    <svg {...base}>
      <path d="M12 4v16" />
      <path d="M6 20h12" />
      <path d="M4 7h16" />
      <path d="M4 7l-2.2 4.5a2.6 2.6 0 0 0 4.4 0L4 7z" />
      <path d="M20 7l-2.2 4.5a2.6 2.6 0 0 0 4.4 0L20 7z" />
    </svg>
  )
}

/** Oracle-settled — a globe (public market resolution decides). */
export function OracleIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.3-3.5-8.5S9.7 5.8 12 3.5z" />
    </svg>
  )
}
