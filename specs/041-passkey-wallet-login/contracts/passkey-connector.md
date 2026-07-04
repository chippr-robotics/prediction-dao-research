# Interface Contract: Passkey Connector & WalletContext Surface

Consumers: `WalletContext.jsx`, `WalletButton.jsx`, account-management UI.
Provider: `frontend/src/connectors/passkey.js` + `frontend/src/lib/passkey/*`.

## wagmi connector (`passkeyConnector(config)`)

Registered in `frontend/src/wagmi.js` beside `injected` and `walletConnect`.
Standard wagmi connector shape; passkey-specific behavior:

| Member | Contract |
|---|---|
| `id` / `name` | `"fairwinsPasskey"` / `"Passkey"` — used by `getWalletLabel` (vendor-neutral labeling preserved) |
| `setup()` | capability detection (FR-004): resolves `{available, prfLikely}`; connector hidden/disabled with reason when unavailable |
| `connect({chainId, isReconnecting})` | reconnect: silent restore from persisted credentialId + address (no ceremony — FR-003). fresh: `signUp()` or `signIn()` flow below |
| `disconnect()` | clears LoginSession rows for this connector (data-model) — full FR-003 sign-out semantics |
| `getAccounts()` | `[accountAddress]` — the smart-account address, never a signer EOA |
| `switchChain({chainId})` | allowed only to networks where the account stack is deployed (`accountFactory` present in synced config); otherwise throws `ChainNotSupportedError` with honest message (FR-022) |
| `getProvider()` | EIP-1193 facade: `eth_accounts`, `eth_chainId`, `eth_sendTransaction` (routed per submission contract), `personal_sign`/`eth_signTypedData_v4` (ERC-1271 envelope over WebAuthn assertion) |

## Ceremony functions (`lib/passkey/credentials.js`)

| Function | Contract |
|---|---|
| `createCredential({label})` | WebAuthn `create()` with platform authenticator required, PRF extension requested, rpId = site origin. Returns `{credentialId, publicKey, prfCapable}`. User cancel ⇒ typed `CeremonyCancelled` (clean abort, edge case "prompt declined") |
| `getAssertion({challenge, credentialId?})` | WebAuthn `get()`; when multiple site credentials exist and none pinned, lets the platform picker choose (edge case "multiple accounts") |
| `detectDuplicate()` | before sign-up: if site credentials exist, steer into sign-in (edge case "duplicate sign-up"); explicit "create another account" remains available |

## Account functions (`lib/passkey/smartAccount.js`)

| Function | Contract |
|---|---|
| `deriveAddress(initialOwners, nonce)` | pure; MUST equal factory `getAddress` on-chain; asserted identical across configured networks (FR-023) |
| `buildAction(calls[])` | composes `executeBatch` so approve+act = one ceremony (FR-016); returns fee quote for disclosure (FR-008/FR-014) |
| `ownerAdd/ownerRemove/walletLink` | controller mutations; `walletLink` runs screening first (refuse on flagged — FR-019); `ownerRemove` refuses last owner (FR-020) |

## WalletContext additions (consumed by all features)

- `loginMethod: 'passkey' | 'injected' | 'walletconnect'` — informational
  only; **no feature may branch on it for identity/gating** (FR-002).
- Signing abstraction: `signer` remains for EOA connectors (ethers);
  smart-account writes go through a `sendCalls(calls[])` context method that
  the connector fulfills. Existing `sendTransaction`/`signMessage` keep
  working for both (passkey path implements them via the provider facade).
- `accountCapabilities: {encryption: 'available'|'unavailable', reason}` —
  drives FR-012 degradation UI.
- Everything else (`address`, balances, roles, network helpers) unchanged —
  SC-004 regression gate.

## Error taxonomy (typed, user-visible mapping)

`CeremonyCancelled`, `AuthenticatorUnavailable`, `ChainNotSupportedError`,
`SubmissionUnavailable(route, retryAfter?)` (FR-017), `InsufficientFeeBalance
(shortfall, denomination)` (edge case "insufficient balance"),
`ControllerScreeningRefused(address)`. Each maps to a specific honest UI
state; none may surface as a generic opaque failure.
