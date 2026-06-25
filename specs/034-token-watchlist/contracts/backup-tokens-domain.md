# Contract: `tokens` Backup Domain & Membership Gate

**Type**: Integration contracts with two existing platform systems (spec 032 backup, spec 027
membership). Neither system changes — this feature is a consumer.

---

## A. Synced-object registration (spec 032 backup)

Append to the `syncedObjects` array in `frontend/src/lib/backup/syncedObjects.js`:

```text
{
  key: 'tokens',
  label: 'Token watchlist',
  networkScoped: true,
  load:  (account)              => loadWatchlist(account),
  apply: (account, value, mode) => {
           if (mode === 'replace') { saveWatchlist(account, value); return { conflicts: [] } }
           const { value: merged } = mergeWatchlists(loadWatchlist(account), value)
           saveWatchlist(account, merged)
           return { conflicts: [] }
         },
  merge: (current, incoming)    => mergeWatchlists(current, incoming),
}
```

And extend `assertNetworkTagged` in `frontend/src/lib/backup/backupBundle.js`:

```text
if (key === 'tokens') {
  for (const e of value?.entries ?? []) {
    if (typeof e?.chainId !== 'number') throw new Error('tokens entry missing chainId')
  }
}
```

**Contract guarantees** (must hold for the bundle round-trip to stay valid):
- `load` returns a `Watchlist` (`{schemaVersion, entries, updatedAt}`) for any account,
  including an empty one when nothing is stored.
- `apply(..., 'merge')` is additive and idempotent; `apply(..., 'replace')` overwrites.
- `merge` returns `{ value, conflicts: [] }` (watchlist never raises user-facing conflicts).
- Every persisted entry carries a numeric `chainId` (else `parseBundle` throws — fail loud).
- **No** `BUNDLE_VERSION` bump, **no** `BackupPointerRegistry` change.

---

## B. Membership gate (spec 027 `MembershipManager`)

The watched-tokens panel gates on the existing role hook — **no new auth surface**.

```text
const { getRoleDetails } = useRoleDetails()
const m = getRoleDetails('WAGER_PARTICIPANT')
const allowed = !!m && m.isActive && m.tier > 0      // "any paid tier" (FR-023)
```

- Tiers: `NONE=0, BRONZE=1, SILVER=2, GOLD=3, PLATINUM=4`. Gate = `tier > 0`.
- Membership is read on-chain via the `MembershipManager` UUPS proxy
  (`getContractAddressForChain('membershipManager', chainId)`) and is **chain-scoped**;
  `useRoleDetails` re-fetches on account/chain change, so the gate re-evaluates on network
  switch automatically (FR-008, FR-023).

**Gated-state UI contract** (when `!allowed`): render an honest notice
(`role="status"`, `.tm-notice` styling) — "An active membership is required to view and manage
your token watchlist. Any tier works." — with a CTA opening `PremiumPurchaseModal`
(mirrors `OpenChallengeModal` TakerPanel, `OpenChallengeModal.jsx:455-465`). The watchlist UI
(add/search/remove) MUST NOT render and MUST NOT be reachable in this state (FR-023).

**Loading**: while `useRoleDetails` resolves, show a neutral loading state — never flash the
watchlist or the gate.
