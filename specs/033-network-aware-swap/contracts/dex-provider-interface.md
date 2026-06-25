# Interface Contract: DEX Provider Resolution (frontend)

This is a **frontend application contract** — the public config/context surface other modules and
tests rely on. No HTTP/RPC API and no smart-contract ABI is introduced (the swap reuses the existing
Uniswap-V3-compatible `SwapRouter02` / `QuoterV2` ABIs unchanged).

---

## C1. `dexProvider` descriptor (shape)

```ts
// Conceptual shape (the codebase is JS; this documents the contract)
type DexProvider = {
  name: string   // "ETCswap" | "Uniswap"  — user-facing, matches the active network
  url: string    // absolute https:// URL to the provider web-app
}
```

**Invariants**
- Present on every supported network that can ever offer swaps; `null`/absent only for non-swap
  chains (Hardhat `1337`).
- `name` MUST match FR-001: ETC-family (`61`,`63`) → `"ETCswap"`; others (`137`,`80002`) → `"Uniswap"`.
- Independent of `dex` availability (exists even when `dex === null`).

---

## C2. `getDexProvider(chainId)` — `frontend/src/config/networks.js`

```ts
function getDexProvider(chainId: number): DexProvider | null
```

| Input `chainId` | Output |
|-----------------|--------|
| `61` | `{ name: "ETCswap", url: "https://v3.etcswap.org" }` |
| `63` | `{ name: "ETCswap", url: "https://etcswap.org" }` (or `v3.` per config) |
| `137` | `{ name: "Uniswap", url: "https://app.uniswap.org/swap?chain=polygon" }` |
| `80002` | `{ name: "Uniswap", url: "https://app.uniswap.org/swap" }` |
| `1337` | `null` |
| unknown | resolves via `getNetwork` fallback (same as existing helpers); `null` if no provider |

**Contract guarantees**
- Pure, synchronous, no side effects, no network I/O.
- Never returns a provider whose `name` mismatches the requested chain (FR-002, FR-009).

---

## C3. `DexContext` value — added key

The context returned by `useDex()` gains:

```ts
dexProvider: DexProvider | null   // = getNetwork(activeChainId)?.dexProvider ?? null
```

Existing keys (`isDexAvailable`, `chainId`, `network`, `addresses`, `tokens`, `getQuote`, `swap`,
`wrapNative`, `unwrapNative`, `slippage`, `setSlippage`, `balances`, …) are unchanged.

**Re-targeting guarantee (FR-005)**: when `useChainId()` changes, `network` and therefore
`dexProvider` recompute, so all consumers re-render with the new provider and no stale values.

---

## C4. UI consumption contract (`SwapPanel`, `NetworkSettings`)

`SwapPanel` MUST:
- Use `dexProvider.name` in: panel subtitle, the disabled-state (`!isDexAvailable`) message, and the
  router link label (`{name} Router ↗`).
- Render a provider-app link `Open {dexProvider.name} ↗` → `dexProvider.url`
  (`target="_blank" rel="noopener noreferrer"`), shown when `dexProvider` is present.
- In the disabled-state, name the provider applicable to the **current** network and the current
  `network.name`; MUST NOT reference a different network's provider (no hardcoded "Uniswap on Polygon").
- Contain **zero** hardcoded "Uniswap"/"ETCswap" string literals in user-facing copy — all provider
  text derives from `dexProvider`.

`NetworkSettings` MUST:
- Render the provider link from `dexProvider` (`href={dexProvider.url}`, label includes
  `dexProvider.name`), gated on `capabilities.dex`, replacing the prior `resources.dexUrl` usage.

**Accessibility**: links keep discernible text (the `↗` is decorative within the labeled link);
external links retain `rel="noopener noreferrer"`. No new axe/Lighthouse violations.

---

## C5. Acceptance mapping

| Spec requirement | Contract element |
|------------------|------------------|
| FR-001 mapping | C2 table |
| FR-002 correct name everywhere | C4 (zero hardcoded literals) |
| FR-003 provider link | C4 provider-app link → `dexProvider.url` |
| FR-004 explorer/contract links | unchanged `getExplorerUrl(chainId, …)` (per-chain explorer) |
| FR-005 re-target on switch | C3 re-targeting guarantee |
| FR-006 honest disabled-state | C1 (independent of `dex`), C4 disabled-state rule |
| FR-007 data-driven | C1 per-network declaration + C2 helper |
| FR-008 mechanics unchanged | C3 (swap fns unchanged) |
| FR-009 network-scoped | C2/C3 pure per-chain resolution |
| FR-010 gated, no mock | `isDexAvailable = Boolean(dex)` unchanged; verified addresses only |
| FR-011 ETC mainnet reachable | `networks[61]` entry (data-model) + C2 row `61` |
