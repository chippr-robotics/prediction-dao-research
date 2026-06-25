# Quickstart & Validation: Network-Aware Swap Provider

A runnable guide to prove the feature works end-to-end. Implementation details live in
[data-model.md](./data-model.md) and [contracts/](./contracts/dex-provider-interface.md); ordered
work lives in `tasks.md` (after `/speckit-tasks`).

## Prerequisites

```bash
cd frontend
npm install            # if not already
```

Reference values (from [research.md](./research.md)) for ETC mainnet (chainId 61):

| Item | Value |
|------|-------|
| ETCswap Factory | `0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC` |
| ETCswap SwapRouter02 | `0xEd88EDD995b00956097bF90d39C9341BBde324d1` |
| ETCswap QuoterV2 | `0x4d8c163400CB87Cbe1bae76dBf36A09FED85d39B` |
| ETCswap PositionManager | `0x3CEDe6562D6626A04d7502CC35720901999AB699` |
| WETC | `0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a` (18) |
| USC (Classic USD) | `0xDE093684c796204224BC081f937aa059D903c52a` (6) |
| ETCswap app | `https://v3.etcswap.org` |

## 1. Automated tests (primary gate)

```bash
cd frontend
npm run test -- networks SwapPanel DexContext NetworkSettings   # focused
# or the whole suite:
npm run test:frontend     # from repo root
```

**Expected**: new/updated specs pass —
- `networks.test.js`: `NETWORKS[61]` exists & `selectable`; `getDexProvider(61|63)→ETCswap`,
  `getDexProvider(137|80002)→Uniswap`, `getDexProvider(1337)→null`; `getSelectableNetworks()`
  includes `61`; `isDexAvailable(61)===true`.
- `DexContext.test.jsx`: context `dexProvider.name` is `ETCswap` on `61`/`63`, `Uniswap` on `137`.
- `SwapPanel.test.jsx`: on `61`/`137` the labels/provider link name the correct provider; on a chain
  with no `dex`, the disabled message names that chain's provider (never the wrong one); switching the
  mocked chain updates the provider with no stale text.
- `NetworkSettings.test.jsx`: the provider link uses `dexProvider.url`/`name`.

## 2. Lint & build

```bash
cd frontend
npm run lint
npm run build     # NOTE: may require VITE_PINATA_JWT locally (see memory: local-verification-gotchas)
```

**Expected**: ESLint clean; no new warnings.

## 3. Manual smoke (dev server)

```bash
npm run frontend          # from repo root
```

Then in the browser (My Account → **Swap** tab) and (My Account → **Network** tab):

| Scenario | Steps | Expected (FR) |
|----------|-------|---------------|
| ETC mainnet shows ETCswap | Select **Ethereum Classic** in the Network tab → open Swap | Panel says **ETCswap**; "Open ETCswap ↗" → `v3.etcswap.org`; contract links use `etc.blockscout.com` (FR-001/002/003/004) |
| Polygon shows Uniswap | Switch to **Polygon (Mainnet)** → open Swap | Panel says **Uniswap**; provider link → `app.uniswap.org`; explorer links → `polygonscan.com` (FR-001/002/003) |
| Re-target on switch | Toggle between ETC and Polygon | Provider name + all links update with **no** leftover references (FR-005) |
| Honest disabled-state | Select **Mordor** without ETCswap env addresses | Panel disabled; message names **ETCswap** + Mordor (not "Uniswap on Polygon"); no mock (FR-006/010) |
| Network tab provider link | Network tab, ETC vs Polygon rows | Each shows its provider link from `dexProvider` when `capabilities.dex` (FR-003) |
| Selectable network | Network tab list | **Ethereum Classic (61)** appears as selectable (FR-011) |

## 4. Optional: exercise a real ETC-mainnet quote

With a wallet on Ethereum Classic mainnet holding a little WETC/USC, open Swap → Swap Tokens, enter an
amount, and confirm a non-empty quote appears (proves routing through the configured ETCswap QuoterV2).
Do **not** broadcast unless intentionally trading real funds.

## Done When

- [ ] `npm run test:frontend` passes including the new provider specs.
- [ ] `npm run lint` clean.
- [ ] Manual smoke: ETC→ETCswap, Polygon→Uniswap, switch re-targets, disabled-state names the right
      provider, ETC mainnet is selectable.
- [ ] No user-facing "Uniswap" text on any ETC-family swap surface; no "ETCswap" on non-ETC (SC-003).
