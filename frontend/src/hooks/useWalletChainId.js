import { useAccount, useChainId } from 'wagmi'

/**
 * The chain the WALLET is actually on — not the one wagmi's config settled on (issue #1030).
 *
 * `useChainId()` reads `config.state.chainId`, and wagmi only ever writes a CONFIGURED chain
 * there. `createConfig`'s sync subscription is explicit about it:
 *
 *     // If chain is not configured, then don't switch over to it.
 *     if (!isChainConfigured) return
 *
 * (node_modules/wagmi/node_modules/@wagmi/core/dist/esm/createConfig.js). So with the member's
 * wallet on a chain absent from `chains` (src/wagmi.js), `useChainId()` keeps reporting the
 * previous configured chain — measured with the wallet on BNB (0x38), the app displayed
 * "Polygon", raised no warning, and pointed every read at Polygon.
 *
 * The connection's own chainId is not filtered that way: `getConnection()` returns
 * `connections.get(current).chainId`, which the connector's `chainChanged` handler writes
 * verbatim. `useAccount()` is an alias of `useConnection()` in wagmi 3 and tracks the keys you
 * read, so destructuring `chainId` subscribes to it and re-renders on a real chain change.
 *
 * Falls back to the config chain whenever there is no connection (disconnected, or mid-connect
 * before the connector has answered), which is exactly what `useChainId()` returns anyway — so
 * for every configured chain, and for every passkey session (whose connector only ever reports
 * `config.chains[...]` ids), this returns the identical value it always did.
 */
export function useWalletChainId() {
  const configChainId = useChainId()
  const { chainId: connectionChainId } = useAccount()
  return connectionChainId ?? configChainId
}

export default useWalletChainId
