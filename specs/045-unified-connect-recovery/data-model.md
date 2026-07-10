# Data Model: Unified Connect & Account Recovery

**Feature**: 045-unified-connect-recovery | **Date**: 2026-07-10

No new on-chain state. All entities are frontend-local (localStorage/React
state) or existing contract state read via the vendored smart-account ABI.

## CredentialRecord (localStorage `fairwins.passkey.credentials.v1`)

Existing entity, hardened. One entry per passkey known to this browser.

| Field | Type | Rules |
|-------|------|-------|
| `credentialId` | string (base64url) | REQUIRED. Primary key for upsert/merge. |
| `publicKey` | `{ x: hex, y: hex }` | REQUIRED for a record to be *transact-complete*. Immutable once set. |
| `address` | 0x-address | Smart-account address. Set at sign-up, refreshed at sign-in and after recovery. |
| `prfCapable` | boolean | From creation/assertion PRF result. |
| `label` | string | Client-side only, never on-chain. |
| `updatedAt` | number (epoch ms) | Refreshed on every upsert (`Date.now()`). |

**Validation**: `isTransactComplete(record)` ⇔ `credentialId` && `publicKey.x`
&& `publicKey.y`. `sendBatch`/`buildAccount` reject records failing this with
`CredentialRecordIncomplete` (plain-language message, recovery step).

**State transitions**:
- sign-up → full record written (`rememberCredential`).
- sign-in → upsert by `credentialId`: refresh `address`, `updatedAt`,
  `prfCapable`; never drops `publicKey`.
- recovery success → full record written for the new credential with the
  recovered account `address`.
- forget/stale-cleanup → record removed (`forgetCredential`).

## PasskeySession (localStorage `fairwins.passkey.session.v1`)

Existing entity. `{ address, chainId, credentialId, loginMethod: 'passkey' }`.

**New invariant**: a session is only restored (connector `isReconnecting`)
when a transact-complete CredentialRecord exists for `session.credentialId`;
otherwise the session is discarded (honest sign-out).

**New usage**: `credentialId` is the pinning key for every ceremony in the
session (sign-in choice → session → sendBatch → `allowCredentials`).

## ExplainerState (localStorage `fairwins.passkey.explainer.v1`) — NEW

`{ seenAt: ISO string }`. Written when the first-time explainer is completed
or dismissed. Absence ⇒ show explainer before the first passkey ceremony on
this browser. Storage write failure is non-fatal (explainer may reshow).

## ConnectSurface (React state in WalletContext) — NEW

| Field | Type | Rules |
|-------|------|-------|
| `isConnectModalOpen` | boolean | Opened by `openConnectModal()`; single instance at provider level. |
| `inFlight` | `null \| { connectorId, startedAt, userInitiated }` | At most one. New user attempt while pending → refused with feedback (or replaces after explicit cancel). Background restore never overrides `userInitiated`. |
| `methods` | ordered list | `passkey` (featured), `walletConnect` (featured), `injected`. Availability per `useConnectorAvailability`: `available \| unavailable(reason) \| checking`. |

## AccountController (on-chain, read-only projection)

Existing entity from `readControllers` (spec 041): `{ index, kind:
'passkey'|'wallet', ownerBytes, publicKey?|address? }`.

**New usage**: `resolveOwnerIndex(credential, controllers)` — match the
credential's public key bytes (or wallet address encoding) to `ownerBytes`;
result feeds `toCoinbaseSmartAccount({ ownerIndex })`. No match + readable
controllers ⇒ credential no longer controls the account ⇒ typed error, not a
guessed index. Controllers unreadable (undeployed account) ⇒ fallback index 0.

## RecoveryRequest (transient React state) — NEW

| Field | Type | Rules |
|-------|------|-------|
| `accountAddress` | 0x-address | User-entered; hinted from CredentialRecords. |
| `ownershipVerified` | boolean | `isOwnerAddress(connectedWallet)` on-chain must be true before the create step is enabled. |
| `newCredential` | CredentialRecord draft | From `createCredential`; committed to the book only after the add-owner receipt succeeds. |
| `txState` | `idle → verifying → ready → creating → submitting → confirmed \| failed` | Receipt-gated; no fake finality. |

**Compliance**: connected wallet is screened (existing `screenController`,
fail-closed) before `addOwnerAddress`-style linking in ControllersPanel;
recovery adds a *passkey* owner signed by an already-linked wallet, and the
wallet itself was screened at link time.
