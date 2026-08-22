/**
 * API Access's mounted component (spec 095).
 *
 * A package's entry default-exports one mountable React component and nothing else — the host
 * imports exactly this module from a verified Blob URL and renders what it returns inside
 * `MiniAppHostProvider`. No provider, no router and no wallet plumbing here: all three are the
 * host's, reached through `useMiniAppHost()` at the point of use.
 */

import ApiAccessConsole from './ApiAccessConsole'

export default function ApiAccessApp() {
  return <ApiAccessConsole />
}
