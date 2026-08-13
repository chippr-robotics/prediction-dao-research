# Multi-network swaps (the Trade ticket)

The Trade section lists tradeable pairs from **every swap-capable network**, not
just the one the wallet happens to be connected to. This guide covers the seams a
change in this area has to respect.

## The read / write split

| Concern | Scope | Where |
| --- | --- | --- |
| Which pairs exist | every swap-capable network | `frontend/src/lib/uniswap/swapUniverse.js` |
| What a pair pays out (quote) | the **pair's** network, read-only | `DexContext.getBestQuoteOn(chainId, …)` → `lib/uniswap/quote.js` |
| Leg balances | the **pair's** network, read-only | `hooks/useSwapBalances.js` |
| Placing the order (swap) | the **connected** network only | `DexContext.swap(…, { chainId })` |

Listing and pricing pairs across networks is a read, exactly like the
cross-chain portfolio scan (spec 044) and ClearPath's cross-chain DAO reads: each
chain answers over its own provider (`makeReadProvider`), independent of the
wallet's chain. Only the swap itself needs the wallet to be on the pair's network.

## Invariants

1. **A pair lives on ONE network.** Choosing the pay leg pins the network and the
   receive selector only offers legs from that same chain. The rule is not
   re-derived in the panel — it is `samePair` from
   `frontend/src/lib/assets/networkPin.js`, the same predicate the Earn liquidity
   pair selector uses, and the exact inverse of the Bridge's `bridgeDest`.
   **Never apply `bridgeDest` here, and never "fix" a cross-chain pair by
   quoting it anyway** — moving value between networks is the Bridge's job.
2. **A swap never runs on a network the wallet is not on.** The panel discloses
   the pending switch and offers it as the primary action instead of the order
   button; `DexContext.swap` re-checks `opts.chainId` and throws before any
   signature. Both layers matter: the guard is what makes it safe for the UI to
   list off-network pairs at all, since an approval sent against the wrong
   chain's router address is unrecoverable.
3. **Addresses are strictly per-chain.** `getSwapAddresses(chainId)` returns that
   network's own router/quoter/wrapped-native or `null` — never a fallback to
   another network's. Base in particular does **not** share Uniswap's canonical
   addresses. Never reach for `DexContext.addresses` (connected chain) when
   acting on a pair that may be elsewhere.
4. **A chain is listed only when `capabilities.dex` is true** — the policy gate
   (`SWAP_CHAIN_IDS`) **and** real router config. `getSwapChainIds()` in
   `config/networks.js` is the single source of that truth; `isSwapChain()` wraps
   it. Testnet pairs appear only to a member connected to that testnet.
5. **An unread balance is `null`, never `0`.** The ticket renders "…" and disables
   MAX rather than implying the member holds nothing because a read failed. A
   later failed read keeps the last known figure instead of zeroing it.
6. **Balances belong on the pair cards.** Each leg shows its own balance next to
   the amount it applies to, on the pair's network, for the acting account
   (`tradingAddress`, so vault/recovered accounts read correctly).
7. **The ticket does not pick the account.** Which account a member acts as —
   personal wallet, multisig vault, recovered legacy account — is chosen once,
   app-wide, from the wallet menu's acting-account switcher
   (`hooks/useAccountSwitcher.js`), the same control Pay/Transfer and every other
   surface rely on. `TradePanel` only READS that identity (`useActiveAccount`) to
   price, fund, and disclose the order: the multisig-proposal note, the
   recovered-key note, and the session-rail badge. A second, ticket-local picker
   is a switcher that can disagree with the app-wide one — don't reintroduce it.
8. **Venue identity follows the pair, not the wallet.** An ETC pair routes through
   ETCswap and must be labelled as such even while the wallet is on Polygon
   (`getSwapVenue(pairChainId)`); the same applies to the perps-venue gate, the
   passkey/sponsorship disclosure, and the router explorer link.

## Selector search

Both the Universal Asset Selector and the Trade ticket's pair pickers narrow
through `frontend/src/lib/assets/assetSearch.js#matchesAssetQuery`, which matches
**only the fields a member can see**: asset symbol, asset name, network name.
Matching a hidden field (an address, a category id) would make the list narrow
for reasons the member cannot see. Search only narrows what is already
eligible — typing can never surface a leg the pin excluded.

## Files

- `frontend/src/lib/uniswap/swapUniverse.js` — the cross-network pair universe
  (chains, legs, per-chain addresses, venue, default pair, counterpart choice).
- `frontend/src/lib/uniswap/quote.js` — best-route quoting against any chain's
  QuoterV2; one implementation for local and cross-chain quotes.
- `frontend/src/hooks/useSwapBalances.js` — leg balances on the pair's network.
- `frontend/src/components/fairwins/TradeTokenSelect.jsx` — the network-grouped,
  searchable pair-leg picker.
- `frontend/src/components/fairwins/TradePanel.jsx` — the order ticket.
- `frontend/src/contexts/DexContext.jsx` — `getBestQuoteOn` (read, any chain) and
  `swap` (write, connected chain only).
