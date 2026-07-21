# Losing Every Passkey Shouldn't Mean Losing the Account

*How FairWins merged wallet connection and account recovery into one surface — and made passkey accounts recoverable without reintroducing a seed phrase*

| | |
|---|---|
| **Series** | Accounts & Keys (part 2) |
| **Part** | 5 of 34 |
| **Audience** | Wallet/UX engineers, account-abstraction developers, product designers |
| **Tags** | `account-recovery`, `passkeys`, `self-custody`, `ux`, `account-abstraction` |
| **Reading time** | ~9 minutes |

## The phone in the river

A member signs up for FairWins with a passkey. No seed phrase, no extension — Face ID creates a P-256 credential, and an ERC-4337 smart account derives from it. It's the onboarding passkeys promised: nothing to write down, nothing to lose.

Then the phone goes in the river. Or the browser profile gets wiped, or the laptop dies. Platform sync (iCloud Keychain, Google Password Manager) catches most of these cases — but not all. A passkey created in an unsynced browser profile is simply gone. With a seed-phrase wallet, the answer was brutal but well understood: type the twelve words back in. Passkeys deliberately removed those twelve words. So what's the recovery story?

At the same time, our pre-consolidation frontend had a quieter problem that made any recovery story moot: *connecting* was already broken in three different ways. Three surfaces offered connection — the header button, the wallet page, and the dashboard welcome screen — each with different options and ordering (one couldn't reach passkey at all), and parallel attempts could race a background session restore into a stuck state. Worse, two shipped defects blocked passkey users outright: on Chrome and Brave, signing back in could leave a session that crashed every transaction with `Cannot read properties of undefined (reading 'id')`, and Brave silently signed users into their *first* passkey no matter which account they picked.

Spec 045 (`specs/045-unified-connect-recovery/`) treats these as one problem: connection, controller management, and recovery are the same lifecycle, and they should live behind one surface. This post walks through how it works — and why the contract layer needed zero changes.

## The account layer already had the answer

FairWins passkey accounts (spec 041) are vendored Coinbase Smart Wallet contracts. Their auth core, `contracts/account/MultiOwnable.sol`, stores owners as raw bytes in ERC-7201 namespaced storage: a 32-byte ABI-encoded Ethereum address *or* a 64-byte P-256 public key. A passkey and a MetaMask address are interchangeable controllers of the same account:

```solidity
/// @notice Adds a new Ethereum-address owner.
function addOwnerAddress(address owner) external virtual onlyOwner {
    _addOwnerAtIndex(abi.encode(owner), _getMultiOwnableStorage().nextOwnerIndex++);
}

/// @notice Adds a new public-key owner.
function addOwnerPublicKey(bytes32 x, bytes32 y) external virtual onlyOwner {
    _addOwnerAtIndex(abi.encode(x, y), _getMultiOwnableStorage().nextOwnerIndex++);
}
```

Every owner is a full 1-of-N peer: any single controller can add or remove the others. Two invariants matter for recovery. First, `removeOwnerAtIndex` reverts with `LastOwner()` when only one owner remains, so an account can never be stranded controllerless. Second, `_checkOwner` accepts any registered owner (or the account itself), so an EOA owner can call `addOwnerPublicKey` with an *ordinary transaction* — no bundler, no UserOp, no relayer.

That's the entire recovery primitive. If a second controller exists when disaster strikes, recovery is one contract call. The 045 plan (`specs/045-unified-connect-recovery/plan.md`) says it plainly: **no contract changes** — the work is making people actually *have* that second controller, and making the client honest enough to use it.

## One connect surface, serialized

The first deliverable is `frontend/src/components/wallet/ConnectModal.jsx`: the single connect surface. Every entry point — header button, wallet page, dashboard welcome — opens the same dialog via `WalletContext.openConnectModal()`; no other component renders connector choices (FR-001). Options are ordered Passkey → WalletConnect → browser extension wallets, with the first two featured — all three fully supported. Availability is probed and shown honestly ("not detected", "not supported") before the user commits, rather than failing on tap (FR-003).

`WalletContext` serializes attempts: at most one connect flow in flight, and a background session restore can never override a user-initiated connection (FR-004). A first-time passkey explainer renders inside the modal exactly once per browser, tracked by a `fairwins.passkey.explainer.v1` localStorage marker — and if storage is blocked, the explainer may repeat but never blocks connecting.

## The two bugs that made passkeys unusable

The unified surface only matters if the passkey path underneath it is sound. Two root-cause fixes shipped with it.

**The incomplete credential record.** The connector's sign-*in* branch never recorded the asserted credential the way sign-*up* did. The local credential book (`fairwins.passkey.credentials.v1`) is what the transaction path feeds into viem's WebAuthn account; an incomplete record meant `buildAccount` dereferenced `undefined` deep inside the signer — the infamous `reading 'id'` crash. The fix is layered: the connector (`frontend/src/connectors/passkey.js`) now remembers and, when possible, repairs the record on every sign-in (FR-005), and `frontend/src/lib/passkey/smartAccount.js` refuses incomplete records *before* any ceremony with a typed `CredentialRecordIncomplete` error that the UI turns into "sign in again with your passkey" (FR-006). Validate at the boundary; never let storage shape leak into a WebAuthn stack trace.

**The unpinned ceremony.** A bare WebAuthn `get()` lets the platform pick any discoverable credential — and Brave/Chromium silently assert the *first* one, locking multi-account users out of everything but account one. `getAssertion` in `frontend/src/lib/passkey/credentials.js` now pins every session-bound ceremony to the session's `credentialId` (FR-008), and when the browser knows several passkeys, the app presents its own account picker before the ceremony rather than trusting the platform chooser (FR-007). A deliberate `discoverable: true` escape hatch still issues a bare request for passkeys the browser has never recorded — the platform's own chooser makes that pick, so the app never guesses.

A subtler third fix follows directly from recovery: once accounts can gain controllers, signatures can no longer assume owner slot zero. `resolveOwnerIndex` reads the on-chain owner list and matches the credential's owner bytes to its real index (FR-009):

```js
export async function resolveOwnerIndex({ chainId, accountAddress, credential, deps = {} }) {
  // ...
  const ownerBytes = publicKeyToOwnerBytes(credential.publicKey).toLowerCase()
  const match = result.controllers.find((c) => c.ownerBytes?.toLowerCase() === ownerBytes)
  if (!match) throw new CredentialNotControllerError()
  return Number(match.index)
}
```

Counterfactual accounts fall back to index 0; a deployed account that no longer lists the credential throws, because signing would be guessing.

## Linking before disaster

Recovery requires a second controller linked *while you still have passkey access*. `frontend/src/components/account/ControllersPanel.jsx` lists every controller from the on-chain owner set (with local-only labels), and supports adding a second passkey, linking an external wallet, and removing controllers — each mutation an owner-authorized self-call through `sendCalls`, one ceremony each.

Two policies gate linking. The UI states explicitly that a linked wallet gains *full control* of the account — 1-of-N means full peer, and pretending otherwise would be dishonest. And every candidate address is sanctions-screened before the on-chain call, fail-closed: flagged *or unscreenable* means refused (FR-011). Accounts with a single controller get a persistent device-loss warning pointing at the fix (FR-013).

## Recovery without FairWins

`frontend/src/components/account/RecoverAccountPanel.jsx` is the wallet-only path (FR-014). The user connects the linked wallet — no passkey anywhere — and walks a guided flow:

1. **Which account?** No reverse owner→accounts index exists on-chain, so the app asks for the account address, hinted by addresses the browser has previously associated with passkeys. (The alternative — an indexer dependency on the recovery path — would violate the point of the exercise.)
2. **Verify ownership.** The panel first checks `getCode` on the target — a counterfactual or wrong-network address used to surface as a cryptic `BAD_DATA` decode error; now it's a plain-language explanation. Then it calls `isOwnerAddress(wallet)` and refuses to continue unless the wallet is a controller.
3. **Create and authorize.** A fresh passkey ceremony on the new device, then one ordinary ethers v6 transaction: `addOwnerPublicKey(x, y)` straight from the EOA signer. Only after the receipt confirms does the app record the credential locally — so the very next passkey sign-in can transact.

Because the account is a standard, publicly documented contract, the same recovery works with generic tools if FairWins the service disappears. The runbook (`docs/runbooks/passkey-account-recovery.md`) shows it with Foundry's `cast`:

```bash
cast call $ACCOUNT "isOwnerAddress(address)(bool)" $WALLET --rpc-url $RPC
cast send $ACCOUNT "addOwnerAddress(address)" $NEW_WALLET --rpc-url $RPC --private-key ...
```

For a pure-CLI recovery the runbook recommends `addOwnerAddress` with a fresh wallet (a P-256 key is awkward to produce outside the app), then linking a new passkey from the app later.

## Design decisions

**No guardians, no social recovery.** Recovery is strictly "any pre-linked controller can act." An account whose only passkey lived on a lost, unsynced device is unrecoverable *by design* — no one, including FairWins, can help. That's a hard trade, made deliberately: guardian schemes reintroduce trusted parties and timelock complexity, and platform passkey sync already covers the common device-loss case. The mitigation is UX pressure to link a second controller early, not a custodial backstop.

**1-of-N, not thresholds.** Every controller is a full peer. Simpler to reason about, and it's what makes wallet-only recovery a single transaction — but it means linking a wallet is a full grant of custody, which the UI must (and does) say out loud. Members who want threshold custody have the separate Safe multisig feature (spec 043); it's explicitly out of scope here.

**Recovery restores control, not secrets.** The owner list gates funds, but encrypted-feature keys derive from a master seed wrapped per-controller (`lib/passkey/prfKeys.js`). A recovered controller that never held the seed can't decrypt old data until keys are re-wrapped from a controller that has it — the runbook calls this out. On-chain, encrypted-backup *pointers* live in `contracts/privacy/BackupPointerRegistry.sol` (spec 002), but that's a separate lifecycle: spec 045 recovery never touches it.

**Frontend-only fix for a frontend-caused outage.** Both shipped defects were client bugs against a correct contract. Fixing them at the storage-record and ceremony-request layers — with typed errors instead of crashes — kept the blast radius in `frontend/src` and let the audited vendored contracts stay untouched.

The result: connection has one front door, every passkey ceremony is pinned to a credential the user actually chose, and losing every passkey is an inconvenience instead of an ending — provided you linked something first. The app's whole job is making sure you did.

## Sources

- `specs/045-unified-connect-recovery/spec.md`, `plan.md` — requirements (FR-001–FR-016) and implementation plan
- `specs/041-passkey-wallet-login/` — the underlying passkey account feature
- `docs/developer-guide/passkey-accounts.md` — contract stack and frontend architecture
- `docs/runbooks/passkey-account-recovery.md` — in-app and generic-tools recovery paths
- `contracts/account/MultiOwnable.sol` — owner list, `addOwnerPublicKey`, `LastOwner()` invariant
- `frontend/src/components/wallet/ConnectModal.jsx`, `frontend/src/connectors/passkey.js` — unified surface and sign-in record repair
- `frontend/src/lib/passkey/credentials.js`, `frontend/src/lib/passkey/smartAccount.js` — ceremony pinning, `resolveOwnerIndex`, credential validation
- `frontend/src/components/account/ControllersPanel.jsx`, `RecoverAccountPanel.jsx` — controller management and wallet-only recovery
- ERC-4337 (Account Abstraction): https://eips.ethereum.org/EIPS/eip-4337
- ERC-7201 (Namespaced Storage Layout): https://eips.ethereum.org/EIPS/eip-7201
- ERC-1271 (Contract Signature Validation): https://eips.ethereum.org/EIPS/eip-1271
- WebAuthn Level 2: https://www.w3.org/TR/webauthn-2/
- Coinbase Smart Wallet: https://github.com/coinbase/smart-wallet
