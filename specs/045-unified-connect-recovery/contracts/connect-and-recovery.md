# Module & UI Contracts: Unified Connect & Account Recovery

**Feature**: 045-unified-connect-recovery | **Date**: 2026-07-10

Interfaces this feature exposes to the rest of the frontend. On-chain
interfaces are pre-existing (Coinbase Smart Wallet `MultiOwnable`) and
unchanged.

## WalletContext (additions/changes)

```js
// NEW — single entry point every connect control uses
openConnectModal(): void
closeConnectModal(): void
isConnectModalOpen: boolean

// CHANGED — no-arg call opens the modal instead of defaulting to injected.
// With a connectorId: serialized; rejects (with visible feedback) while
// another user-initiated attempt is in flight.
connectWallet(connectorId?: string, opts?: { credentialId?: string }): Promise<void>

// CHANGED — passkey route passes the session credential down
sendCalls({ calls }): Promise<result>  // internally: sendPasskeyBatch({ chainId, address, calls, credentialId: session.credentialId })
```

## connectors/passkey.js

```js
// CHANGED behavior:
// - connect({ isReconnecting: true }) restores ONLY transact-complete sessions.
// - connect({ credentialId }) pins sign-in to that credential (in-app picker).
// - sign-in and sign-up both upsert the credential book (rememberCredential merge).
passkeyConnector(deps?)
```

## lib/passkey/credentials.js

```js
// CHANGED — assertion options:
//   pinned: allowCredentials = [pinned id]
//   unpinned + known book: allowCredentials = all known ids (platform chooser last resort)
//   unpinned + empty book: discoverable flow (omit allowCredentials)
// Falsy assertion result throws CeremonyCancelled (never dereferenced).
getAssertion({ challenge, credentialId?, prfSalt?, deps? })

// NEW
upsertCredential(partial, deps?)           // merge by credentialId, never drops publicKey
isTransactComplete(record): boolean
```

## lib/passkey/smartAccount.js

```js
// NEW error type
class CredentialRecordIncomplete extends Error  // plain-language, actionable

// NEW
resolveOwnerIndex({ chainId, address, credential, deps? }): Promise<number>
// match credential pubkey/address to readControllers ownerBytes;
// unreadable controllers -> 0; readable-but-no-match -> throws (never guesses)

// CHANGED — buildAccount validates the credential record, injects a getFn that
// pins allowCredentials to the credential and guards null results, and uses a
// resolved ownerIndex instead of hardcoded 0.
buildAccount({ chainId, credential, ownerIndex?, deps? })
```

## lib/passkey/sendBatch.js

```js
// CHANGED — selection order: deps/session credentialId -> address match (fallback).
// Validates isTransactComplete before any ceremony; resolves ownerIndex.
sendPasskeyBatch({ chainId, address, calls, credentialId?, intent?, deps? })
```

## lib/passkey/explainer.js — NEW

```js
hasSeenExplainer(deps?): boolean
markExplainerSeen(deps?): void   // storage failures swallowed (non-fatal)
```

## Components

```jsx
// NEW — rendered once at provider level; the ONLY connect surface.
// Steps: methods -> (passkey) explainer? -> account picker? -> ceremony
// Ordering: Passkey (Recommended), WalletConnect, Browser Wallet.
<ConnectModal />

// NEW — first-time explainer step (content adapted from PasskeyOnboarding intro)
<PasskeyExplainer onContinue onDismiss />

// NEW — wallet-only recovery; requires connected EOA session.
// verify isOwnerAddress -> createCredential -> addOwnerPublicKey via signer -> receipt -> remember record
<RecoverAccountPanel />

// REUSED — mounted in Account security area for passkey sessions
<ControllersPanel /> + <DeviceLossWarning />
```

## On-chain surfaces used (existing, unchanged)

| Call | Caller | Purpose |
|------|--------|---------|
| `isOwnerAddress(address) → bool` | recovery panel (read) | gate recovery on ownership |
| `addOwnerPublicKey(bytes32 x, bytes32 y)` | EOA owner via ethers signer | recovery: authorize new passkey |
| `addOwnerAddress(address)` / `addOwnerPublicKey` / `removeOwnerAtIndex` | passkey session via `sendCalls` self-call | ControllersPanel link/add/remove (existing encoders) |
| `nextOwnerIndex()` / `ownerAtIndex(i)` | `readControllers` | controller list + ownerIndex resolution |

## Removed surfaces

- `WalletButton` disconnected-state dropdown (replaced by ConnectModal trigger)
- `WalletPage` inline connector list (delegates to ConnectModal)
- Dashboard WelcomeView no-arg `connectWallet()` default-to-injected path
- Orphaned `PasskeySignIn.jsx`, `PasskeyOnboarding.jsx` (superseded; tests updated/removed with them)
