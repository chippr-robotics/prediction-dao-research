/**
 * Token logo policy (Spec 034, FR-024/FR-025).
 *
 * The ONLY way a registry logo reaches an <img>. Returns an https URL only when:
 *   - the token is registry-sourced (custom/unknown tokens NEVER get a remote
 *     logo — they render the bundled placeholder), AND
 *   - its logoURI resolves to an allowlisted trusted host.
 * Uniswap `ipfs://<cid>` logos are rewritten to the already-allowlisted
 * https://ipfs.io gateway. Anything else returns null → caller renders the
 * neutral placeholder. This is the application-level guard; the nginx CSP
 * img-src directive is the browser-level defense-in-depth.
 */

import { TRUSTED_LOGO_HOSTS } from './constants'

/**
 * @param {{ source?: string, logoURI?: string }} token
 * @returns {string|null} a trusted https URL, or null to use the placeholder
 */
export function resolveLogoSrc(token) {
  if (!token || token.source === 'custom') return null
  let uri = token.logoURI
  if (typeof uri !== 'string' || uri.trim() === '') return null

  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length).replace(/^ipfs\//, '')
    if (!cid) return null
    uri = `https://ipfs.io/ipfs/${cid}`
  }

  try {
    const u = new URL(uri)
    if (u.protocol !== 'https:') return null
    if (!TRUSTED_LOGO_HOSTS.includes(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}
