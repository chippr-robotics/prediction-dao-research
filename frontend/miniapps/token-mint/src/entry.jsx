/**
 * Token Mint's mounted component (spec 073 T026).
 *
 * A package's entry default-exports one mountable React component and nothing
 * else — the host imports exactly this module from a verified Blob URL and
 * renders what it returns inside `MiniAppHostProvider`.
 *
 * There is no provider, no router and no wallet plumbing here on purpose: all
 * three are the host's, reached through `useMiniAppHost()` at the point of use.
 * `TokensPanel` is unchanged in role from the host-native tab it replaces, so
 * this file stays a one-line adapter rather than a second place where the
 * feature's structure is described.
 */

import TokensPanel from './TokensPanel'

export default function TokenMintApp() {
  return <TokensPanel />
}
