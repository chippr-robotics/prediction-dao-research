# Contract: ClearPath UI / State Contract (multi-network + registry-less)

The observable behavior the ClearPath surface must honor across networks. Consumers:
`ClearPathPanel.jsx`, `RegisterExternalDao.jsx`, `ExternalDaoView.jsx`, `ReadRouteToggle.jsx`,
`useClearPath.js`, and the network switcher (`NetworkSettings.jsx`).

## `useClearPath()` hook contract

```text
useClearPath() -> {
  isSupported,        // getNetwork(chainId)?.capabilities?.clearpath === true && !!reader   (NOT registry-gated)
  hasRegistry,        // NEW: isAddress(getContractAddressForChain('externalDAORegistry', chainId))
  registryAddress,    // may be undefined (registry-less network)
  usdcAddress, chainId, account, isConnected, reader, signer,
  readRoute,          // 'public' | 'wallet'
  setReadRoute(v),    // persists device-local; swaps reader (reads only)
  listExternalDAOs(), // merge(registry entries iff hasRegistry, device-local tracked) — network-scoped, deduped
  trackDAO({address, framework, label}),   // registry write iff hasRegistry, else device-local store
  untrackDAO(address),                      // device-local remove (no-op for on-chain registry entries)
  hasSanctionsSource, // isAddress(getContractAddressForChain('sanctionsGuard', chainId))
}
```

### Behavior

1. **Availability** — `isSupported` is true on any `clearpath`-capable network with a live
   reader, **regardless of registry presence**. When false, the panel shows a truthful
   capability-based disabled message (no longer "switch to Mordor").
2. **Listing** — `listExternalDAOs()` returns a single network-scoped list merging on-chain
   registry entries (only if `hasRegistry`) and device-local tracked DAOs, de-duplicated by
   lowercased address. Empty list → truthful empty state (not an error).
3. **Tracking / registering** — on a registry network, `trackDAO` performs the existing
   on-chain register tx (notifications: submitted/confirmed/failed). On a registry-less
   network, it validates + framework-detects client-side, then writes the device-local store
   (immediate, no tx) with an honest "tracked on this device" note. Duplicates → "already
   tracked", no phantom row (FR-017).
4. **Reads** — go through the resolved connector + `daoDataSource` (subgraph-first). `reader`
   honors `readRoute`; writes always via `signer`.

## `ClearPathPanel` contract

- Disabled state keys off `capabilities.clearpath`, naming the active network truthfully.
- DAO rows show `DAO_FRAMEWORK_LABEL[framework]` (OZ / Bravo / Unknown) and a network label.
- Registry-less networks: the "Register" tab is available and writes device-local; copy makes
  clear the list is device-local this cut (no cross-device sync).
- Unknown-framework DAOs render read-only with a deep-link affordance, never a broken action
  button (FR-011).

## `ExternalDaoView` contract

- Resolves the connector via `getConnector(record.framework)` (or `detectFramework` when a
  registry entry's enum is coarse) and reads via `daoDataSource` (subgraph|onchain), rendering
  a **source + status chip** (`subgraph` / `on-chain` / `partial` / `unavailable`) truthfully.
- Actions (vote/queue/execute/propose) are shown only where the connector supports them and
  the DAO's own rules plausibly authorize the wallet; the DAO's revert reason is surfaced via
  `explainTxError` on failure — success is never implied.
- Value-moving action gating: if `hasSanctionsSource`, screen the signer (block sanctioned);
  else proceed under the external DAO's rules with no fabricated "screened" claim (FR-013).

## Network switcher contract (`NetworkSettings` / `getSelectableNetworks`)

- ClearPath-only networks appear in the switcher labeled by what they support (DAO governance),
  not as wager networks. `getSelectableNetworks()` already sorts mainnets-first; the mainnet
  entry surfaces without implying wagers/DEX/passkey are live (those tags read unavailable via
  `getNetworkFeatures`, extended with a `clearpath` tag).

## Notification source contract (`daoSource.js`)

- Enumerates DAOs from **both** the registry (iff deployed) and the device-local tracked list
  for the active chain, reads each via the connector resolver + data-source router, and emits
  the same voting-open / ready-to-queue / ready-to-execute / finalized entries. Honest
  degradation unchanged: a Governor missing an eligibility view yields no fabricated action.

## Accessibility & theming (Constitution V, FR-016/FR-019)

- All new controls (ReadRouteToggle, source/status chips, framework badges, register-on-device
  notice) are theme-aware and keyboard-operable; `clearpath.accessibility.test` is extended to
  cover the multi-network + registry-less states with zero axe violations.

## Acceptance mapping

| UI behavior | Spec |
|-------------|------|
| Tab enabled on any clearpath network; disabled truthfully otherwise | FR-004, US1, SC-001 |
| Register-by-address works registry-less; merged list; deduped; network-scoped | FR-005/006, US2, SC-002/004/005 |
| OZ + Bravo render in one UI; unknown → deep-link | FR-009/010/011, US3, SC-003/006 |
| Subgraph-first with truthful source/status chip | FR-008, SC-011 |
| Public-RPC default + wallet-routing toggle (reads only) | FR-019, SC-011 |
| Signer sanctions-screened where a source exists, else DAO rules | FR-013, SC-007 |
| Honest tx state; no phantom entries | FR-015/017, SC-008 |
