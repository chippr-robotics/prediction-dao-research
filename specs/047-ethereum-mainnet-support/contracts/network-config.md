# Contract: Network Configuration & Selection

The "interfaces" for this frontend feature are the config accessors and the wagmi chain
registry that the UI consumes. This contract fixes their observable behavior after the
change so tests can assert against it. All are pure/config functions in
`frontend/src/config/*` and `frontend/src/wagmi.js`.

## C1 — `getSelectableNetworks()` (config/networks.js)

**Given** the post-change `NETWORKS` map
**Then** the returned list:
- includes networks with chainId `1` (Ethereum), `11155111` (Sepolia), `560048` (Hoodi);
- still includes all previously selectable networks (`137, 80002, 61, 63`);
- is ordered mainnets-before-testnets (`isTestnet` ascending);
- contains no network with `selectable !== true`.

## C2 — `getNetwork(chainId)` for the Ethereum family

| chainId | name | isTestnet | selectable | native symbol | explorer.baseUrl contains |
|---------|------|-----------|------------|---------------|---------------------------|
| 1 | `Ethereum` | false | true | `ETH` | `etherscan.io` |
| 11155111 | `Sepolia` | true | true | `ETH` | `sepolia.etherscan.io` |
| 560048 | `Hoodi` | true | true | `ETH` | `hoodi.etherscan.io` |

- `isSupportedChainId(560048) === true`.
- `getNetwork(560048).rpcUrl` matches `^https?://`.
- Capability flags for all three: `dex`, `passkeyAccounts`, `polymarketSidebets`,
  `friendMarkets` are `false` (mainnet additionally keeps `clearpath: true`; testnets `clearpath: false`).

## C3 — Wagmi switchability (wagmi.js)

**Given** `config.chains`
**Then** it contains chain objects with ids `1`, `11155111`, `560048` (in addition to the
existing `137, 80002, 61, 63, 1337`), each with a defined `transports[id]`.
**And** `config.chains[0].id === 137` (polygon remains the wagmi default — FR-015).
**And** `getExpectedChain()` returns a defined chain for `VITE_NETWORK_ID` ∈ {1, 11155111, 560048}.

> Behavioral consequence (covered in quickstart, not a unit assertion): the Network tab's
> `switchChain({ chainId })` resolves for the Ethereum family instead of throwing
> "chain not configured".

## C4 — Capability disclosure (config/networkCapabilities.js, unchanged logic)

**Given** `getNetworkFeatures(1 | 11155111 | 560048)`
**Then** `wagers`, `swap`, `membership`, oracle features report `deployed: false`
(honest "not deployed" tags), because no contracts and no `dex`/capability are configured.
`clearpath` reports `true` for mainnet (existing) and `false` for the testnets.

## C5 — Explorer link scoping (config/blockExplorer.js)

| call | result contains | must NOT contain |
|------|-----------------|------------------|
| `getBlockscoutUrl(1, addr, 'address')` | `etherscan.io/address/` | `polygonscan` |
| `getBlockscoutUrl(11155111, tx, 'tx')` | `sepolia.etherscan.io/tx/` | `polygonscan` |
| `getBlockscoutUrl(560048, addr)` | `hoodi.etherscan.io/` | `polygonscan` |
| `getBlockscoutUrl(63, addr)` | `etc-mordor.blockscout.com` | (unchanged) |
| `getBlockscoutUrl(137, addr)` | `polygonscan.com` | (unchanged) |

An unknown/unconfigured chainId MUST NOT fall back to the Amoy PolygonScan URL.

## Non-goals (explicitly NOT part of this contract)

- No wager/DEX/passkey/oracle contract addresses on the Ethereum family.
- No change to `PRIMARY_CHAIN_ID`, `MAINNET_CHAIN_ID`, `TESTNET_CHAIN_ID`, or the
  Testnet/Mainnet toggle pair.
- No change to existing networks' behavior or capability tags.
