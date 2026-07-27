# Contract: Estate read helper and chain read result

**Modules**: `frontend/src/lib/chains/estate.js`, `frontend/src/lib/chains/chainReadResult.js`
**Consumers**: every operator view; `contexts/RoleContext.jsx` role sync.
**Replaces**: the network/provider helpers currently in
`frontend/src/components/admin/liquidityAdminCommon.js`, which re-exports from here so the Bridge
and Supply tabs and their 55 tests continue to work unchanged.

## Surface

```js
// chainReadResult.js
export function readOk(chainId, value, unit = null): ChainReadResult
export function notDeployed(chainId): ChainReadResult
export function unreadable(chainId, reason): ChainReadResult

/** Per-unit subtotals. NEVER a single cross-unit total. */
export function aggregate(results: ChainReadResult[]): {
  subtotals: Record<string, bigint>,
  partial: boolean,
  missing: Array<{ chainId: number, reason: string }>,
}

// estate.js
/** Cohort chains carrying `capability`, mainnets first. */
export function estateNetworks(capability?: string): Network[]

/** A read connection for `chainId`, or null when none can be built. */
export function readProviderFor(chainId, walletChainId, walletProvider): Provider | null

/** Read one contract across the cohort, concurrently; never rejects. */
export function readAcrossEstate({
  chainIds, addressFor, read, walletChainId, walletProvider,
}): Promise<ChainReadResult[]>

/** Does `account` hold `roles` on `contract` on `chainId`? */
export function readAuthority({ provider, address, account, roles }): Promise<PerChainAuthority>
```

## Rules

1. **Providers come from `getReadProvider(chainId)`** — never hand-built from
   `NETWORKS[chainId].rpcUrl`.

   This fixes a live spec-069 violation being carried by the current helper (research R2). The
   existing code bypasses `resolveRpcEndpoints`, so a member's configured endpoint override and its
   failover are ignored for every read the Bridge and Supply tabs make. Generalizing the helper
   without fixing it would spread that bug to all fifteen views.

   The one permitted shortcut is reusing the wallet's own provider when the scoped chain *is* the
   connected chain — cheaper, and already the member's chosen transport.

2. **Every read returns one of three states.** `read`, `not-deployed`, `unreadable` (FR-014). There
   is no fourth state and no value on the latter two — the shape gives a default nowhere to live.

3. **A rejected read becomes `unreadable`, never a throw and never a zero.** `readAcrossEstate`
   never rejects; one dead endpoint does not fail the batch.

4. **Chains resolve independently** (FR-015). Consumers receive results as they arrive; no view
   blocks on the slowest endpoint.

5. **`aggregate` refuses cross-unit sums** (FR-022). Values whose `unit.symbol` differs land in
   different subtotals. There is no API that returns one number across units, so no caller can ask
   for one.

6. **`aggregate` marks partial totals** (FR-023). Any `unreadable` contributor sets `partial` and
   is named in `missing`. `not-deployed` contributes nothing and does **not** set `partial` —
   nothing is missing; there is nothing there.

7. **The roster is cohort-bounded.** `estateNetworks` filters through `cohortChainIds()`. It lists
   chains that *could* carry the capability even where FairWins has not deployed — hiding those
   would hide the ones an operator most needs to see. Whether a contract exists there is the
   per-chain read's answer, not the roster's.

8. **`readAuthority` treats unreadable as unknown, not denied** (research R4). `readable: false`
   leaves controls offered with authority unconfirmed; `deployed: false` is a definite denial.

## Test obligations

- Each of the three states is produced and is distinguishable by a consumer.
- `aggregate` over mixed units yields separate subtotals and never one figure.
- `aggregate` including an `unreadable` sets `partial` and names the chain.
- `aggregate` including a `not-deployed` does **not** set `partial`.
- A rejected read yields `unreadable` with a reason, and siblings still resolve.
- `readProviderFor` obtains its provider via `getReadProvider` — asserted at source level, so the
  spec-069 bypass cannot return.
- The existing `AdminBridgeTab` and `AdminSupplyTab` suites pass unchanged through the re-export.
