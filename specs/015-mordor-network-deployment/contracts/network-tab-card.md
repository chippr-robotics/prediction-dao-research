# Contract: Network-Tab Card (`NetworkSettings.jsx`)

The My Account → Network card for each selectable network. Mordor reuses the existing card and adds an operational-docs section.

## Existing (no change)
- Header: network `name`, Testnet/Mainnet badge (`isTestnet`), and a **Switch** button (`wagmi.switchChain({ chainId })`) or **Connected** badge.
- Capability tag strip from `getNetworkFeatures(chainId)` — ✓ available / — unavailable.

## New: per-network documentation section (FR-007)

Rendered when the network exposes the data; for Mordor it MUST show:

| Item | Source | Example (Mordor) |
|------|--------|------------------|
| Network kind | `isTestnet` | "Ethereum Classic test network" |
| Native currency | `nativeCurrency.symbol` / `.name` | ETC (Ethereum Classic) |
| Block explorer | `explorer.baseUrl` (link) | Blockscout |
| Faucet | `resources.faucet` (link) | "Get test ETC" |
| Stablecoin | `stablecoin.name` / `.symbol` | Classic USD (USC) |
| Swap | `resources.dexUrl` (link), shown only when `capabilities.dex` | ETCswap |

## Accessibility / quality requirements (Constitution V)
- All external links use `target="_blank"` + `rel="noopener noreferrer"` and have descriptive accessible names (not "click here").
- Use semantic markup (e.g. a definition list) so the docs are screen-reader navigable; axe/Lighthouse must pass.
- No address/link is hardcoded in the component — all values come from the `networks.js` entry.

## Behavioral guarantees
- Mordor card shows the four core capabilities ✓ and the three oracle capabilities — (and Token Swap ✓/— per `dex`).
- When Mordor is active, the **Connected** badge shows on its card; switching to/from Mordor goes through the wallet confirmation.
