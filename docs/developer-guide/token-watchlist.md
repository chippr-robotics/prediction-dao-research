# Token Watchlist ("My Tokens" assets) — Spec 034

The **My Tokens** tab in the Account Center is a per-wallet, network-aware **watchlist** of
token assets. Members add tokens from per-network registries or by custom contract address and
see live balances. It is **frontend-only** — no backend, no smart-contract change.

## What it does

- **My Tokens** (the watchlist) is now the first tab of the Tokens area. The former issuer view
  is relabeled **Issued**; Create/Explorer are unchanged. The token-factory gate applies only to
  Issued/Create/Explorer — the watchlist works on any chain.
- Membership-gated: any **active paid tier** (FR-023). Non-members see an honest gated state.
- Network-scoped: entries carry `chainId`; only the active network's tokens are shown (FR-008).
- Persisted locally and in the **encrypted backup** bundle (Spec 032), so it restores across
  devices with correct network association.

## Per-network catalog sources

Declared in `frontend/src/config/networks.js` as a `tokenList` field; resolved via
`getTokenListSource(chainId)` (env-overridable):

| Chain | Source |
|------|--------|
| Polygon 137 | `https://tokens.uniswap.org` (`VITE_TOKENLIST_URL_POLYGON`) |
| ETC 61 / Mordor 63 | ETCswap `…/ethereum-classic/all.json` (one file, both chains) (`VITE_TOKENLIST_URL_ETC` / `_MORDOR`) |
| Amoy 80002 | **custom-add only** (no maintained upstream list) + a small real-address seed |
| Hardhat 1337 | custom-only (and gated off — no membership manager) |

Lists are fetched only from these **pinned** hosts, strictly sanitized (chainId in the supported
set, valid address, decimals 0–255, field caps, de-dupe — no new dependency), cached 12h in
localStorage, and degrade to last-good cache → seed on failure (FR-016/017).

## Logos & CSP

Registry tokens may show a logo **only** from an allowlisted host
(`raw.githubusercontent.com`, or `ipfs.io` after rewriting Uniswap `ipfs://` URIs);
custom/unknown tokens always render the bundled placeholder (FR-024/025). The allowlist is
enforced in `lib/tokens/tokenLogo.js#resolveLogoSrc`; the nginx CSP (`connect-src` + `img-src`,
kept identical in `nginx.conf` **and** `nginx.conf.template`) is the defense-in-depth layer,
guarded by `src/test/nginxCspImgSrc.test.js` / `nginxCspConnectSrc.test.js`.

## Code map

- `lib/tokens/` — `tokenWatchlistStore.js` (pure CRUD + merge), `tokenList.js`
  (fetch/sanitize/cache), `tokenLogo.js` (logo policy), `resolveCustomToken.js`, `constants.js`
- `hooks/` — `useTokenWatchlist.js` (per-wallet state, active-chain filter), `useTokenRegistry.js`
  (catalog), `useTokenBalances.js` (live `balanceOf`, "—" when unavailable)
- `components/tokens/` — `WatchedTokensPanel.jsx` (gate + list), `AddTokenDialog.jsx`
  (browse/custom), `WatchedTokenRow.jsx`, `TokenLogoPlaceholder.jsx`
- Backup wiring — `lib/backup/syncedObjects.js` (`tokens` domain) + `backupBundle.js`
  (network-tag guard). No `BackupPointerRegistry`/bundle-version change.

## Tests

`src/test/tokenWatchlistStore.test.js`, `tokenList.test.js`, `tokenLogo.test.js`,
`useTokenWatchlist.test.jsx`, `nginxCspImgSrc.test.js`, `backup/watchlistBackup.test.js`, and the
component tests under `src/components/tokens/__tests__/`. See
`specs/034-token-watchlist/quickstart.md` for manual scenarios S1–S6.
