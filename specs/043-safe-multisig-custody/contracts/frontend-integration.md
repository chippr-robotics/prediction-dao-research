# Contract: Frontend Integration Seams

Exact seams this feature plugs into, with the interface each new module must satisfy. These mirror existing,
documented patterns so no engine edits are needed.

## 1. WalletPage — Custody tab (Finance group)

`frontend/src/pages/WalletPage.jsx`: add `{ id: 'custody', label: 'Custody' }` to the **Finance** group's
`items` in `WALLET_TAB_GROUPS` (after `paytransfer`), and a render branch:
```jsx
{activeTab === 'custody' && (
  <div className="custody-section" role="tabpanel"><CustodyPanel /></div>
)}
```
`CustodyPanel` renders two sub-sections: **On chain** (multisig UI) and **Off chain** (rendered disabled with
"coming later" copy). Deep-link `?tab=custody` and notification `link.state = { tab: 'custody' }` resolve via
existing `WALLET_TABS` logic.

## 2. Notification activity source (spec 031)

`frontend/src/data/notifications/sources/custodySource.js` implements the source contract:
```js
export const custodySource = {
  key: 'custody',
  label: 'Custody',
  async detect({ account, chainId, nowMs, prior }) {
    // read the member's vaults (from vaultReferences) on chainId; for each, diff:
    //   Safe.nonce(), approvedHashes, ApproveHash/ExecutionSuccess/ExecutionFailure logs,
    //   SafeProposalHub.Proposed logs, incoming/outgoing transfers
    // → { entries, nextSnapshots, currentIds, actionNeededById, ok, partial }
    // entries: { id, domain:'custody', refId, type, message, severity, actionable,
    //            link:{ to:'/wallet', state:{ tab:'custody', vault } }, createdAt, read }
  },
}
```
Register in `frontend/src/data/notifications/sources/index.js`:
`export const activitySources = [wagerSource, daoSource, tokenSource, membershipSource, poolsSource, custodySource]`.
Add `custody` to `DOMAIN_META` (`frontend/src/data/notifications/domains.js`) and to `NOTIFICATION_CATEGORIES`
(`frontend/src/lib/notifications/deliveryPreferences.js`) as `{ domain:'custody', label:'Custody', description }`
so per-source on/off (`push`/`app`/`silent`) works (FR-027, FR-028).

## 3. Encrypted backup synced object (spec 032)

`frontend/src/lib/backup/syncedObjects.js`: append
```js
{
  key: 'vaultReferences',
  label: 'Vault References',
  networkScoped: true,
  load(account) { /* read {chainId,address,label,addedAt,role}[] from local store */ },
  apply(account, value, mode) { /* merge|replace into local store */ },
  merge(current, incoming) { /* union by (chainId,address); newest label wins */ },
}
```
Extend `assertNetworkTagged` in `frontend/src/lib/backup/backupBundle.js` to validate the `chainId` tag on
`vaultReferences`. No changes to `useDataBackup`, `BackupPanel`, backup crypto, or the pointer registry
(FR-025, FR-026). Labels are client-side only, never on-chain.

## 4. Active identity context + indicator

`frontend/src/contexts/CustodyContext.jsx` provides `{ activeIdentity, setActiveIdentity, submit }` where
`activeIdentity = { mode:'personal'|'vault', vaultAddress?, chainId }`. `OperateAsIndicator.jsx` renders a
persistent, WCAG-AA banner/switcher visible app-wide showing the active identity (FR-020) with a "switch back"
control (FR-023). `useActiveAccount()` exposes `submit(tx)` → `submitAsActiveAccount(tx, ctx)`.

## 5. Chokepoint rerouting (staged)

Each fund-moving chokepoint routes its final `{to, value, data}` through `useActiveAccount().submit(...)` when
`mode === 'vault'`, otherwise keeps today's path.

| Priority | Chokepoint | File |
|----------|-----------|------|
| **P1** | Pay & Transfer send | `frontend/src/hooks/useTransfer.js` (`send`) |
| **P1** | Wager create (+ accept) | `frontend/src/hooks/useFriendMarketCreation.js`, `useOpenChallengeAccept.js` |
| **P2** | Membership purchase | `frontend/src/hooks/usePurchaseFlow.js` |
| **P2** | Token Mint | `frontend/src/components/tokens/useTokenFactory.js` |
| **P2** | ClearPath governance | `frontend/src/components/clearpath/connectors/{ozGovernor,governorBravo}.js` |
| **P2** | Trade / Swap | `frontend/src/contexts/DexContext.jsx` (`swap`) |

In vault mode these calls return a **pending proposal** (not an executed tx); the UI directs the member to the
Custody queue for co-owner approval. Not-yet-approved actions appear **only** in the vault queue (FR-022b).

## 6. Config

`frontend/src/config/safeContracts.js` (NEW): `{ [chainId]: { safe, safeL2, proxyFactory, fallbackHandler,
multiSendCallOnly } }` for 63 and 137 (and 61 when added), plus `getSafeContracts(chainId)` returning
`undefined` on unsupported chains → Custody shows "unavailable on this network" (FR-030). `safeProposalHub`
address is added to the `MORDOR_CONTRACTS` / `POLYGON_CONTRACTS` blocks in `contracts.js` (synced).
