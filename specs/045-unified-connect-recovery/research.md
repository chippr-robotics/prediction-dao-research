# Research: Unified Connect & Account Recovery

**Feature**: 045-unified-connect-recovery | **Date**: 2026-07-10

All unknowns from Technical Context resolved below. Root-cause analysis was
performed against the shipped spec-041 code.

## R1. Root cause — "Cannot read properties of undefined (reading 'id')"

**Finding**: The wagmi connector's sign-in branch (`connectors/passkey.js:78-91`)
performs the assertion and resolves the address but **never calls
`rememberCredential`** — only the sign-up branch does. The transaction path
(`lib/passkey/sendBatch.js:45-50`) resolves the signing credential purely from
the local book: `knownCredentials().find(c => c.address === address)`. Three
failure shapes follow:

1. Book entry missing → caught today with a friendly error (works).
2. Book entry **incomplete** (has `address`, missing `credentialId` and/or
   `publicKey` — older shape or partial write) → passes the `find`, reaches
   `buildAccount` (`smartAccount.js:108-139`), where
   `toWebAuthnAccount({ credential: { id: credential.credentialId … } })`
   hands viem an undefined id and viem's WebAuthn account dereferences `.id`
   → the reported crash.
3. Assertion result `null`/`undefined` returned by the browser (Brave
   returns null in some cancel paths instead of rejecting) → viem's default
   `getFn` result is dereferenced (`raw.id`) → same crash class.

**Decision**: Fix all three shapes:
- Sign-in (and sign-up) upsert a complete record: merge by `credentialId`,
  refresh `address`/`updatedAt`, preserve `publicKey`/`prfCapable`.
- `sendBatch`/`buildAccount` validate the resolved record
  (`credentialId` + `publicKey.x/y` present) and throw a typed
  `CredentialRecordIncomplete` error with plain-language recovery text.
- Provide an explicit `getFn` to `toWebAuthnAccount` that pins
  `allowCredentials` to the session credential and throws `CeremonyCancelled`
  on a falsy result instead of letting viem dereference it.
- Connector `isReconnecting` restore validates the record for
  `session.credentialId`; an unusable session is not restored (honest
  sign-out) instead of crashing on first action.

**Alternatives considered**: Only hardening `sendBatch` (rejected — leaves
sign-in sessions unable to transact, the primary user journey); wiping the
credential book on schema change (rejected — destroys recovery hints and
labels needlessly).

## R2. Root cause — Brave always uses the first of multiple passkeys

**Finding**: The unpinned assertion (`lib/passkey/credentials.js:162-173`)
omits `allowCredentials` entirely so "the platform picker chooses". Chromium
and Brave, given a bare `navigator.credentials.get` with discoverable
credentials, may silently assert the most-recently-created/first credential
without showing an account chooser. Spec 041 US3 AS-3 ("they can pick which
account to use") is violated. Compounding: post-login, ceremonies re-resolve
the credential by **address match** (first hit) and sign with hardcoded
`ownerIndex: 0` (`smartAccount.js` `toCoinbaseSmartAccount({ ownerIndex: deps.ownerIndex ?? 0 })`),
so multi-owner accounts produce invalid signatures.

**Decision**:
- **In-app account picker**: when the local credential book holds ≥ 2 records,
  ConnectModal's passkey path shows the accounts (label + short address) and
  pins the assertion to the chosen `credentialId` via `allowCredentials`.
  One known record → pin it. Zero (fresh browser) → discoverable flow
  unchanged (platform handles it; nothing to pick locally).
- **Pin every session ceremony**: `sendCalls` passes the session's
  `credentialId` down; `sendBatch` selects the book record by `credentialId`
  first (address match only as fallback), and the assertion's
  `allowCredentials` carries exactly that credential.
- **Resolve `ownerIndex`**: at send time, match the credential's public key
  (and for wallet owners, the address encoding) against `readControllers`
  owner bytes; pass the real index to `toCoinbaseSmartAccount`. Fallback 0
  only when controllers cannot be read (pre-deploy counterfactual account).

**Alternatives considered**: Passing *all* known credential ids in
`allowCredentials` to force the platform chooser (kept as the mechanism the
picker uses per-choice, but an in-app picker is still required — the platform
chooser's behavior is exactly what's broken on Brave and cannot be relied on);
WebAuthn conditional UI / `mediation: 'conditional'` (rejected — inconsistent
support, larger change, doesn't fix pinning for transactions).

## R3. Connect-surface consolidation & race conditions

**Finding**: Three divergent surfaces exist —
`WalletPage.jsx:266-316` (no availability gating, context `connectWallet`),
`WalletButton.jsx:266-320` (availability gating + badges, raw wagmi
`connect`, 500ms pendingConnector workaround), Dashboard WelcomeView
(`Dashboard.jsx:317-341,449-456,630` — no-arg `connectWallet()` that
hard-defaults to injected → WalletConnect and can never reach passkey).
`connectWallet` with no id silently picks injected (`WalletContext.jsx:433-434`).
Wagmi eager reconnect (default `reconnectOnMount: true`) races manual
connects; a mount-time cleanup deletes `wc@2:*` relay keys while a WC
reconnect may be in flight (`WalletContext.jsx:226-248`). Spec-041's
purpose-built `PasskeySignIn`/`PasskeyOnboarding`/`PasskeyConfirm`/
`DeviceLossWarning`/`ControllersPanel` components are **all orphaned** (only
imported by their tests).

**Decision**:
- One `ConnectModal` rendered once at the provider level, opened via
  `openConnectModal()` from `WalletContext`; WalletButton (disconnected
  state), WalletPage connect section, and Dashboard WelcomeView all trigger
  it. Ordering: Passkey (Recommended) → WalletConnect → Browser Wallet, with
  the availability probe logic extracted from WalletButton into a
  `useConnectorAvailability` hook.
- `connectWallet` serialization: a single in-flight guard (ref) — a second
  attempt while one is pending is refused with visible feedback unless it is
  a cancel-and-retry; `connectWallet()` with no connectorId no longer
  auto-picks injected — it opens the modal.
- Eager-reconnect race: manual connects mark a "user-initiated" flag; the
  passkey connector's silent restore only applies when no manual connect has
  begun; the mount-time `wc@2:*` cleanup is deferred until wagmi reconnect
  settles (`isReconnecting === false`) so relay state for an in-flight WC
  restore is never deleted.
- Orphaned components: fold explainer content into `PasskeyExplainer`
  (adapted from `PasskeyOnboarding` intro copy), mount `ControllersPanel` +
  `DeviceLossWarning` in the Account security area, delete the superseded
  `PasskeySignIn`/`PasskeyOnboarding` shells (PasskeyConfirm stays for
  per-action confirmation if referenced; otherwise removed with its test).

**Alternatives considered**: Keeping per-surface pickers with shared styling
(rejected — divergence is the bug); a new routing-level auth guard (rejected —
out of scope, YAGNI).

## R4. Recovery without FairWins — mechanism

**Finding**: The account layer is the vendored Coinbase Smart Wallet.
`MultiOwnable._checkOwner` (`contracts/account/MultiOwnable.sol:275-281`)
authorizes `msg.sender` when it is a registered owner; `addOwnerPublicKey` /
`addOwnerAddress` / `removeOwnerAtIndex` are `onlyOwner`; `isOwnerAddress`
is a public view; `removeOwnerAtIndex` reverts `LastOwner()` at one owner.
Therefore **a linked EOA can manage owners with ordinary transactions — no
bundler, paymaster, or FairWins service involved**. An account that linked a
wallet is necessarily deployed (linking was an on-chain call), so recovery
never hits the counterfactual-deploy case.

**Decision**: `RecoverAccountPanel`, reachable when connected with an EOA
(injected/WalletConnect): user supplies the smart-account address (with
hints from local credential-book records matching any address); app verifies
`isOwnerAddress(connectedWallet)` on-chain; user creates a fresh passkey
(`createCredential`); app sends `addOwnerPublicKey(x, y)` from the EOA via
the existing ethers signer path and waits for the receipt; on success it
`rememberCredential({...credential, address})` so passkey sign-in works
immediately. Runbook `docs/runbooks/passkey-account-recovery.md` documents
the app flow **and** the generic path (call `addOwnerPublicKey` from any
wallet UI/cast against the public ABI) for FairWins-independence (FR-015).

**Alternatives considered**: `executeBatch` wrapper call (works, but the
direct `addOwnerPublicKey` call is simpler and equally authorized); building
an owner→accounts reverse index via the subgraph (rejected for this feature —
new indexing surface; manual address entry with local hints satisfies the
spec, revisit if support data shows users lose their address).

## R5. First-time explainer persistence

**Decision**: New localStorage key `fairwins.passkey.explainer.v1` storing
`{ seenAt }`, written when the explainer is completed or dismissed; checked
before starting the passkey path in ConnectModal. Storage failures degrade to
showing the explainer again (never blocks connecting). Kept separate from
`fairwins.passkey.profile.v1` (warning moments) to avoid coupling to
account-scoped state — the explainer is browser-scoped, pre-account.

## R6. Testing approach

**Decision**: Vitest with injected WebAuthn fakes (existing `deps.createFn` /
`deps.getFn` seams). New/updated suites:
- `credentials` — allowCredentials pinning from book, null-assertion guard,
  record upsert/merge, validation helper.
- `connectors/passkey` — sign-in remembers record; reconnect refuses
  incomplete session; picker-pinned sign-in.
- `sendBatch`/`smartAccount` — credential validation errors, ownerIndex
  resolution against mocked `readControllers`, pinned getFn.
- `WalletContext` — connect serialization, no-arg connect opens modal,
  restore-vs-manual precedence, deferred WC cleanup.
- `ConnectModal`/`PasskeyExplainer` — ordering, availability badges,
  explainer-once, account picker rendering.
- `RecoverAccountPanel` — isOwnerAddress gate, happy path, non-owner
  refusal, receipt handling.
