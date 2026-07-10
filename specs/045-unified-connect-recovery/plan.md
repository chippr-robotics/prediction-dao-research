# Implementation Plan: Unified Connect & Account Recovery

**Branch**: `claude/passkey-login-consolidation-82v7dc` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/045-unified-connect-recovery/spec.md`

## Summary

Consolidate the three divergent connect surfaces (header `WalletButton` dropdown,
`WalletPage` connect section, Dashboard `WelcomeView`) into one shared
`ConnectModal` owned by `WalletContext`, ordered Passkey → WalletConnect →
Browser Wallet, with serialized connection attempts. Fix the two shipped passkey
defects at their roots: (a) the connector's sign-in branch never records the
asserted credential, so the transaction path (`sendBatch` → `buildAccount` →
viem WebAuthn account) dereferences an incomplete credential and throws
"reading 'id'"; (b) the unpinned assertion omits `allowCredentials`, letting
Brave auto-assert the first discoverable credential — add an in-app account
picker over the local credential book and pin every ceremony to the session's
`credentialId`. Add a first-time passkey explainer, mount the (currently
orphaned) `ControllersPanel` for linking an external wallet as an additional
owner, and add a wallet-only recovery flow that calls the smart account's
`addOwnerPublicKey` directly from the connected EOA owner (plus an independent
recovery runbook). **No contract changes** — the vendored Coinbase Smart Wallet
`MultiOwnable` already provides EOA owners, `isOwnerAddress`, and the
last-owner invariant.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19, Node 20

**Primary Dependencies**: wagmi ^3.6 (connectors: injected, walletConnect,
custom `fairwinsPasskey`), viem ^2.53 (`viem/account-abstraction`
`toWebAuthnAccount` / `toCoinbaseSmartAccount`), ethers v6 (existing signer
path for EOA writes), existing `frontend/src/lib/passkey/*` modules

**Storage**: localStorage — `fairwins.passkey.credentials.v1` (credential
book), `fairwins.passkey.session.v1` (session), `fairwins.passkey.wrappedSeeds.v1`
(PRF-wrapped seeds), new `fairwins.passkey.explainer.v1` (first-time explainer
marker). On-chain: `MultiOwnable` owner slots on the user's smart account.

**Testing**: Vitest (`npm run test:frontend`), jsdom, existing test doubles for
WebAuthn (`deps.createFn`/`deps.getFn` injection in lib/passkey)

**Target Platform**: Web (mobile-first), Chrome/Brave/Safari; passkey accounts
enabled on Polygon 137 / Amoy 80002 (per spec 041 FR-022)

**Project Type**: Web frontend (React + Vite) — `frontend/` only, plus docs

**Performance Goals**: Connect surface interactive < 100ms after tap; no added
network reads on the connect path except existing availability probes;
`readControllers` lookups only on demand (recovery / controllers panel / owner
index resolution at send time)

**Constraints**: One passkey ceremony per user action (041 FR-008 preserved);
never-stranded rule — every flow keeps working without FairWins-run relayer
infrastructure; identity/authorization never branches on login method;
compliance screening fail-closed before linking controllers

**Scale/Scope**: ~6 new/changed components, ~5 lib modules touched, 1 new doc,
no contract or subgraph changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-first contracts | PASS (n/a + reasoned) | No `contracts/` changes. The recovery flow exercises existing audited `MultiOwnable` surfaces (`addOwnerPublicKey`, `isOwnerAddress`) from an EOA owner — an access path the contract already authorizes (`_checkOwner`). Fund-custody reasoning: linking a wallet grants full 1-of-N control; the UI must state this explicitly (FR-011) and sanctions-screen fail-closed before linking (existing `screenController`). |
| II. Test-first | PASS | Every bug fix lands with a Vitest reproduction (incomplete credential record, unpinned assertion, ownerIndex mismatch, connect races); new components get unit tests mirroring existing patterns (`WalletContext.passkey.test.jsx`, `ControllersPanel.test.jsx`). |
| III. Honest state | PASS | Availability badges reflect real detection; recovery flow verifies `isOwnerAddress` on-chain before offering to add a passkey; no fake finality (reuse `trackToInclusion` / receipt waits). |
| IV. Fail loudly in CI | PASS | No CI changes; new tests run in the existing frontend job. |
| V. Accessible, consistent frontend | PASS | ConnectModal is a dialog with focus trap/ARIA roles matching existing modals; no hardcoded addresses — all contract access via `getContractAddressForChain` and the generated sync artifacts (smart-account ABI already lives in `lib/passkey/smartAccount.js` as spec-041 vendored ABI). |

**Post-design re-check (Phase 1 complete)**: PASS — no new violations; no new
core technology introduced; smallest-change rule respected (reuse of orphaned
spec-041 components instead of new parallel implementations).

## Project Structure

### Documentation (this feature)

```text
specs/045-unified-connect-recovery/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (module/UI contracts)
│   └── connect-and-recovery.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/wallet/
│   ├── ConnectModal.jsx            # NEW — single connect surface (methods, availability, explainer, passkey account picker)
│   ├── PasskeyExplainer.jsx        # NEW — first-time explainer step (rendered inside ConnectModal)
│   ├── WalletButton.jsx            # CHANGED — dropdown replaced by ConnectModal trigger; keeps connected-state menu
│   └── DeviceLossWarning.jsx       # REUSED — mounted with ControllersPanel
├── components/account/
│   ├── ControllersPanel.jsx        # REUSED/CHANGED — mounted in Account page; minor deps wiring
│   └── RecoverAccountPanel.jsx     # NEW — wallet-only recovery (verify isOwnerAddress → create passkey → addOwnerPublicKey via signer)
├── contexts/WalletContext.jsx      # CHANGED — connect serialization, openConnectModal(), sendCalls passes session credential
├── connectors/passkey.js           # CHANGED — sign-in remembers/repairs credential record, account-picker support, validated reconnect
├── lib/passkey/
│   ├── credentials.js              # CHANGED — allowCredentials from credential book, null-assertion guard, record merge/validation helpers
│   ├── smartAccount.js             # CHANGED — credential validation + friendly typed error, getFn null guard, resolveOwnerIndex()
│   ├── sendBatch.js                # CHANGED — select credential by session credentialId first, validate, ownerIndex resolution
│   └── explainer.js                # NEW — fairwins.passkey.explainer.v1 marker helpers
├── pages/WalletPage.jsx            # CHANGED — connect section delegates to ConnectModal
├── components/Dashboard.jsx        # CHANGED — WelcomeView connect buttons open ConnectModal (no more no-arg injected default)
└── utils/walletLabel.js            # REUSED

docs/runbooks/
└── passkey-account-recovery.md     # NEW — recovery without FairWins (app flow + generic-tools path)
```

**Structure Decision**: Single web-frontend project; all work in `frontend/src`
plus one runbook. Contracts, subgraph, services untouched.

## Complexity Tracking

No constitution violations to justify. Notable simplicity choices:

- Reuse orphaned spec-041 components (`ControllersPanel`, `DeviceLossWarning`,
  explainer content adapted from `PasskeyOnboarding` intro) instead of new
  parallel implementations; `PasskeySignIn`/`PasskeyOnboarding` shells are
  superseded by ConnectModal and removed rather than left dead.
- Recovery uses direct EOA → `addOwnerPublicKey` contract calls through the
  existing ethers signer path — no bundler, relayer, or new dependency.
- No reverse owner→accounts index exists on-chain; the recovery flow asks the
  user for their account address (with local hints from the credential book)
  and verifies `isOwnerAddress` before proceeding, rather than inventing an
  indexer dependency.
