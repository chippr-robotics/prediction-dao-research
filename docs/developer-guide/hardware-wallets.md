# Hardware wallets (Protect ▸ Off chain, spec 085)

Members keep long-term funds on a Ledger or Trezor and see those accounts inside FairWins: add
them through a guided flow, watch their balances, receive to them from every address field, and —
when they choose to act as one — sign with the device itself, confirming every action on its own
screen. It is a **frontend-only** feature: no contracts, no gateway, no subgraph.

The point of a hardware wallet is that its keys never touch a browser. Everything below follows
from taking that seriously.

## Where it lives

| Concern | Module |
|---|---|
| The vendor seam (`connectHardware`, `vendorAvailability`, `detectTransports`) | `frontend/src/lib/hardware/adapters.js` |
| Ledger adapter (WebHID/WebUSB + `@ledgerhq/hw-app-eth`) | `frontend/src/lib/hardware/ledgerAdapter.js` |
| Trezor adapter (`@trezor/connect-web` popup) | `frontend/src/lib/hardware/trezorAdapter.js` |
| Typed failure vocabulary (`HW_ERROR_CODES`, `describeHardwareError`) | `frontend/src/lib/hardware/errors.js` |
| Derivation-path schemes | `frontend/src/lib/hardware/derivations.js` |
| Device-backed ethers signer | `frontend/src/lib/hardware/hardwareSigner.js` |
| Reconnect a saved account (re-derive + match) | `frontend/src/lib/hardware/connectAccount.js` |
| Backup-synced store (public metadata only) | `frontend/src/lib/hardware/hardwareAccountsStore.js` |
| Per-owner CRUD facade (`hardwareWalletVault`) | `frontend/src/lib/hardware/hardwareAccounts.js` |
| React projection of the store | `frontend/src/hooks/useHardwareAccounts.js` |
| Protect surface (accordion + list + add wizard) | `frontend/src/components/custody/{CustodyPanel,HardwareWalletSection,AddHardwareWalletSheet}.jsx` |
| Reconnect-to-act-as dialog | `frontend/src/components/account/HardwareConnectDialog.jsx` |
| Operate-as wiring | `frontend/src/contexts/CustodyContext.jsx` + `frontend/src/hooks/{useActiveAccount,useAccountSwitcher}.js` |
| Audit records (no secrets) | `frontend/src/data/ledger/sources/hardwareWalletSource.js` |
| Backup domain registration | `frontend/src/lib/backup/syncedObjects.js` (`hardwareAccounts`) |

## The adapter seam

**UI code never imports a vendor module.** Everything above `adapters.js` — the add wizard, the
reconnect dialog, the signer — talks to one session interface:

```
connectHardware(vendor) → {
  vendor, getAddress(path, { display }), getAddresses(paths),
  signPersonalMessage(path, bytes), signTypedData(path, payload),
  signTransaction(path, unsignedSerialized, txFields), close()
}
```

Three reasons the seam is absolute:

- **Lazy loading.** Vendor SDKs are heavy and most members never open the flow; they are
  `import()`ed only inside `connectHardware`. A static import from UI code would put them in the
  main bundle.
- **Failure normalization.** Every vendor error is classified into `HW_ERROR_CODES` before it
  leaves the layer (`classifyLedgerError` maps transport names + APDU status words like `0x6511`;
  `classifyTrezorError` maps Connect payloads). The UI renders `describeHardwareError` verbatim
  and never a raw SDK message (FR-012).
- **Testability.** Component tests hand mock adapters through the `deps` props
  (`{ connect, availability, provider }` on the sheet, `{ connectAccount, provider }` on the
  dialog); nothing needs hardware (FR-013).

The two vendors differ underneath and the seam absorbs it: Ledger is local — WebHID (preferred)
or WebUSB, one APDU at a time, and the adapter probes one address at connect time so "locked" /
"wrong app" surface in the step whose UI explains them. Trezor runs vendor code in a trezor.io
popup; `TrezorConnect.init` is once-per-page (memoized, with a retry path after a failed init such
as a blocked popup), `getAddresses` is one popup round-trip for a whole page, and `close()` is a
no-op because the popup lifecycle is per-call. The caller owns the session and must `close()` it
when the flow ends — the sheet's teardown does — so the transport is released for other tabs.

One deliberate privacy choice in the Ledger adapter: `signTransaction` passes `null` resolution,
skipping Ledger's remote clear-signing metadata service. No external call is made from the app;
the device falls back to on-screen review of the raw fields.

## The security model

- **Public metadata only, ever.** A saved account is `{ address, vendor, path, label, addedAt }`
  (FR-005). No key material, no seed, no xpub, no device identifier beyond the vendor name — the
  record is deliberately too little to fingerprint a device. Discovery asks the device for each
  address individually; no xpub leaves it.
- **Every signature is a physical confirmation.** `HardwareSigner` routes `signMessage`,
  `signTypedData`, and `signTransaction` through the device, so each call is a ceremony on the
  device's own screen. Nothing here can sign silently; that is the security property, not a
  limitation.
- **Recover-and-verify before broadcast.** After the device signs a transaction, the signer
  recovers the sender from the serialized signature and compares it to the expected address. A
  vendor-layer mixup (wrong path, wrong account) can never broadcast silently from someone else's
  account — it becomes a stated error instead.
- **Reconnect re-derives and must match.** `connectHardwareAccount` asks the connected device for
  the saved path's address and refuses if it differs from the saved one: a different device (or a
  different passphrase on the same device) yields a different account, and silently acting as the
  wrong one is exactly the failure the check exists to prevent.
- **Removal forgets the reference, not the funds.** The confirm says so (FR-008), and re-adding a
  known address updates its label instead of duplicating (FR-011, case-insensitive throughout).

## Two derivation schemes, both offered

`derivations.js` defines the two Ethereum conventions that cover effectively every Ledger/Trezor
account in the wild:

| Scheme id | Path | Who created accounts there |
|---|---|---|
| `live` | `m/44'/60'/i'/0/0` | Ledger Live (account per hardened index) |
| `bip44` | `m/44'/60'/0'/0/i` | Trezor, MEW, MyCrypto, pre-Live Ledger tooling |

Which one a member's funds sit on depends on which tool originally created the account — so the
picker starts on the vendor's own default (`defaultSchemeFor`) and lets the member switch rather
than guessing. Rows show address + native balance on the connected network (balance reads are
`Promise.allSettled`; an unreadable balance renders "—", never a zero), page in fives, and mark
already-saved addresses.

## Operate-as (the spec-062 recipe)

A saved hardware account is a first-class acting identity, exactly like a recovered legacy
account:

1. `useAccountSwitcher` lists it (`kind: 'hardware'`) alongside personal / vault / legacy.
2. Choosing it opens `HardwareConnectDialog`, which reconnects the device
   (`connectHardwareAccount` — re-derive + match, above) and hands back a `HardwareSigner`.
3. `CustodyContext.operateAsHardware` holds that signer **in memory only** — never persisted,
   never serialized, cleared on any identity change. It holds no key material (the device does),
   but it wraps a live transport session, so it is session-scoped like the legacy signer.
4. `useActiveAccount.submit` signs with it in `hardware` mode, behind the same **chain guard** as
   legacy mode: if the wallet has switched networks since connecting, submit refuses ("switch
   back…") rather than sending on the wrong chain. `canActAsHardware` requires both the live
   session and the matching chain.

After a reload or unplug the in-memory session is gone and the member reconnects — there is
nothing to restore, by design.

## Honest failure vocabulary (FR-012)

Every connect/derive/sign path ends in a stated, human-readable outcome — never a hanging spinner,
never a silent close, never a raw SDK message:

| Code | Rendered sentence (summary) |
|---|---|
| `transport-unsupported` | this browser cannot talk to the device — use Chromium |
| `permission-denied` | the browser prompt was dismissed — choose the device to continue |
| `device-locked` | unlock with your PIN and try again |
| `wrong-app` | open the Ethereum app on the device |
| `user-cancelled` | the request was cancelled on the device |
| `disconnected` | the device was disconnected — reconnect and try again |
| `timeout` | the device did not respond in time |
| `unknown` | something went wrong talking to the device |

`vendorAvailability` applies the same rule before anything connects: a vendor the browser cannot
reach renders **disabled with the reason**, never as a dead control (FR-003).

## The Protect accordion and deep links

Protect's three areas — On chain, Verify, Off chain — are `AccordionSection`s in one exclusive
`AccordionGroup` (the Recovery/Settings pattern), each with a one-line live summary while
collapsed (vault count, last verify outcome, hardware account count). The section ids —
**`custody-onchain` / `custody-verify` / `custody-offchain`** — double as the drawer-search
attention/deep-link ids (`navSearchIndex` entries with `hash: '#custody-<x>'`; `CustodyPanel`'s
`openSection` prop is the hash-driven card the page asks to land open). Renaming a section id
breaks search deep links, so don't.

## Backup semantics

The store rides the spec-032 backup as the `hardwareAccounts` synced object. It is **not
network-scoped** — a hardware EOA address is the same on every EVM chain, so entries are keyed by
lowercased address alone. Restore-merge is `mergeHardwareAccounts`: union by address, and where
both sides know the same address the entry with the newer `addedAt` wins; a vendor/path
disagreement is surfaced as an informational conflict, not an error. There is no key material in
the value — that is why this synced object needs no encryption beyond what the backup itself
provides.

## Audit and notifications

Adding and removing accounts each append one client-ledger record
(`hardware_account_added` / `hardware_account_removed`; `refs` = address + vendor + path only)
with a **stable entryId per (event, chain, address)**, so re-adding is idempotent
(`appendClientRecord` no-ops on an existing id). Both actions also toast. Audit and the
address-book upsert are best-effort: a failure in either must never lose the saved account.

## The DEV-only test seam

In DEV builds, a capture harness or e2e run may plant `window.__fwHardwareTestAdapter__(vendor)`
and `connectHardware` uses it instead of real vendor code. The guard is `import.meta.env.DEV`,
which Vite replaces with a constant — **production bundles contain no test path at all**, because
dead-code elimination removes the branch (constitution III: no mocks in shipped paths). Do not
replace the guard with a runtime flag; the whole point is that the branch does not exist in the
shipped artifact.

## Browser support

| Browser | Ledger | Trezor |
|---|---|---|
| Chromium (Chrome, Edge, Brave, …) | ✅ WebHID (or WebUSB) | ✅ Connect popup |
| Firefox / Safari | ❌ no WebHID/WebUSB — option disabled with the reason | ✅ Connect popup |

Trezor needs only a window (the popup does the device talking on the vendor's side); a blocked
popup surfaces as a stated permission failure and init is retryable.

## Deliberately out of scope

- **Bitcoin/Solana hardware accounts.** Ethereum-family paths only (`coin_type 60'`); spec-061
  Bitcoin keys remain passkey-seed-derived and are a separate system.
- **Silent signing.** There is no path that signs without a device confirmation, and none should
  ever be added.
- **Key export / xpub storage.** Nothing secret exists in the app to export, and discovery is
  per-address precisely so no xpub is ever held.

See `specs/085-hardware-wallet-protect/` for the spec, and
`docs/runbooks/hardware-wallet-staging-validation.md` for the real-device validation checklist.
