/**
 * Curated store artwork map (spec 077, US1) — slug → illustration.
 *
 * The components live in `appArt.jsx` (components-only for react-refresh); this module owns the
 * curation decision. See appArt.jsx's header for why artwork is host-side and decorative.
 */
import { ClearPathArt, GenericAppArt, TokenMintArt } from './appArt'

/**
 * Slug-keyed curated entries. Adding an app's art is a host change reviewed like any other —
 * exactly the property that keeps the catalog's imagery inside the platform's trust story.
 */
const CURATED = {
  'token-mint': TokenMintArt,
  clearpath: ClearPathArt,
}

/**
 * The artwork for one catalog card. Total over every input: an app the host has no curated art
 * for — including one whose name yields no slug at all — gets the generic illustration.
 */
export function artworkFor(slug) {
  // `Object.hasOwn`, not a bare lookup: registry names fold into slugs, and an inherited key
  // (`__proto__`, `toString`) must never leak an Object.prototype member out as "art".
  const Artwork = typeof slug === 'string' && Object.hasOwn(CURATED, slug) ? CURATED[slug] : GenericAppArt
  return { Art: Artwork }
}
