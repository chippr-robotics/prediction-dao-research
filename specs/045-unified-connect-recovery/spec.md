# Feature Specification: Unified Connect & Account Recovery

**Feature Branch**: `claude/passkey-login-consolidation-82v7dc` (spec directory `045-unified-connect-recovery`)

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Consolidate all login/connect functionality (browser wallet, WalletConnect, passkey) into a single user surface with no race conditions; feature passkey and WalletConnect over browser web wallets while supporting all three; add a brief first-time passkey explainer; passkey recovery options — link an external wallet as an additional owner/recovery method and recover access without FairWins's help; fix Brave multi-passkey selection always defaulting to the first credential; fix 'Cannot read properties of undefined (reading id)' on passkey-required actions in Chrome and Brave."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passkey actions always work for a signed-in user (Priority: P1)

A user who signed in with their passkey performs an action that requires their
passkey (transfer, membership purchase, wager creation). The action prompts one
passkey ceremony and completes — it never fails with an internal error such as
"Cannot read properties of undefined (reading 'id')". This must hold for every
way a passkey session can begin: signing up fresh, signing back in on the same
browser, signing in after browser data was partially cleared, and resuming a
remembered session.

**Why this priority**: This is a live defect that blocks all passkey users from
transacting on Chrome and Brave. Every other improvement is moot while core
actions crash.

**Independent Test**: Sign in with a passkey (each entry mode), attempt a
transfer; the ceremony is prompted and the action submits, or — when the
credential genuinely cannot be resolved — a plain-language message explains how
to fix it (sign in again with the passkey).

**Acceptance Scenarios**:

1. **Given** a user who signed up with a passkey on this browser, **When** they
   perform a passkey-required action, **Then** the action completes after one
   passkey ceremony.
2. **Given** a user who signed back in (not signed up) with an existing passkey
   on this browser, **When** they perform a passkey-required action, **Then**
   the action completes after one passkey ceremony — the sign-in itself must
   leave the session fully able to transact.
3. **Given** a stored credential record that is incomplete or from an older
   version, **When** the user attempts a passkey-required action, **Then** the
   app either repairs the record via a fresh sign-in ceremony or shows a
   plain-language recovery message — never a raw internal error.
4. **Given** a remembered passkey session restored on page load, **When** the
   user acts, **Then** the same guarantees apply.

---

### User Story 2 - One connect surface everywhere (Priority: P1)

Wherever a visitor can start connecting — the header button, the wallet page,
the dashboard welcome screen, or any future entry point — they get the same
single connect experience: the same options, the same labels, the same
availability information, and the same ordering. Passkey and WalletConnect are
presented as the recommended ways to connect; browser extension wallets remain
fully supported but are listed after them. Two connection attempts can never
race each other or a background session restore into a stuck or inconsistent
state.

**Why this priority**: Today three different surfaces offer connection with
different behavior (one cannot reach passkey at all), which confuses users and
creates race conditions between parallel connect paths.

**Independent Test**: Trigger connection from each entry point and confirm the
identical surface appears; start a connection, cancel it, and start another
without reload; reload mid-session and confirm the restored session and any
manual attempt do not conflict.

**Acceptance Scenarios**:

1. **Given** a disconnected visitor, **When** they press any "Connect" control
   anywhere in the app, **Then** the same connect surface opens with Passkey
   and WalletConnect featured first and browser wallet listed after them.
2. **Given** the connect surface is open, **When** an option is unavailable on
   this device (no browser wallet installed, passkeys unsupported), **Then**
   the option is shown with an honest unavailability state instead of failing
   on tap.
3. **Given** a connection attempt is in flight, **When** the user taps another
   option or the app restores a remembered session in the background, **Then**
   exactly one connection wins, the UI reflects it, and no orphaned prompts or
   stuck "connecting" states remain.
4. **Given** a returning passkey user, **When** the connect surface opens,
   **Then** signing back in with their passkey is a one-tap path.

---

### User Story 3 - Pick the right passkey among several (Priority: P2)

A user whose browser holds multiple FairWins passkeys (several accounts, or a
shared browser profile) chooses which passkey to sign in with, and the app
signs them into exactly the account they picked. On Brave and Chrome the
picker must actually offer the choice — today Brave silently uses the first
passkey regardless of the selection.

**Why this priority**: Users with more than one account are currently locked
out of all but the first account on Brave; this also violates the existing
"the app never guesses" principle from the passkey login feature.

**Independent Test**: Register two passkey accounts in one browser, sign out,
sign in choosing the second; the session address is the second account's.

**Acceptance Scenarios**:

1. **Given** two or more passkeys for this app on the device, **When** the
   user signs in, **Then** they are shown a choice of accounts (distinguishable
   by label/address) and the session matches the one they picked.
2. **Given** the user picks account B, **When** they later perform a
   passkey-required action, **Then** the ceremony uses account B's credential
   — never a different one.
3. **Given** a device whose platform picker cannot be relied on to offer the
   choice, **When** more than one known passkey exists, **Then** the app
   presents its own account choice before the ceremony.

---

### User Story 4 - First-time passkey explainer (Priority: P2)

A visitor connecting with a passkey for the first time on this browser sees a
brief explainer: what a passkey is, that it creates a self-custodial account
secured by their device (Face ID / fingerprint / PIN), that it can sync via
their platform (iCloud/Google), and that they should add a recovery method.
The explainer appears once, can be dismissed, and never blocks returning
users.

**Why this priority**: Passkeys are the recommended path for new users, and
first-time comprehension directly affects adoption and support burden; but it
is additive on top of the P1 flows.

**Independent Test**: On a fresh browser profile, choose Passkey — explainer
appears before the ceremony; complete or dismiss it; choose Passkey again —
it does not reappear.

**Acceptance Scenarios**:

1. **Given** a browser that has never used a FairWins passkey, **When** the
   user selects the passkey option, **Then** a short explainer is shown before
   the passkey ceremony begins.
2. **Given** the explainer was shown once (completed or dismissed), **When**
   the user connects again, **Then** it is not shown again.
3. **Given** the explainer is visible, **When** the user proceeds, **Then**
   the normal passkey flow continues without repeated prompts.

---

### User Story 5 - Link an external wallet as an additional owner (Priority: P2)

A signed-in passkey user links an external wallet (browser extension or
WalletConnect) to their passkey account as an additional owner. From then on,
that wallet is a fully authorized controller of the account and serves as a
recovery method if all passkeys are lost. The user is clearly told what
linking means (the wallet gains full control of the account) and linking is
refused for wallets that fail compliance screening.

**Why this priority**: Recovery depends on having a second controller linked
*before* disaster; the account layer already supports it, so this is primarily
a user-experience commitment.

**Independent Test**: As a passkey user, link an external wallet; the account's
controller list shows both the passkey and the wallet; the warning about
single-controller risk clears.

**Acceptance Scenarios**:

1. **Given** a signed-in passkey user, **When** they link an external wallet
   from their account settings, **Then** the wallet appears as a controller of
   the account after one passkey confirmation.
2. **Given** a wallet that fails compliance screening, **When** the user tries
   to link it, **Then** linking is refused with a clear message and no change
   is made.
3. **Given** a passkey account with only one controller, **When** the user
   views their account, **Then** they are warned about device-loss risk and
   pointed to adding a recovery method (second passkey or external wallet).

---

### User Story 6 - Recover access without FairWins's help (Priority: P3)

A user who previously linked an external wallet loses access to all their
passkeys (new phone, wiped browser). Using only that wallet, they regain full
control of their account: they connect the wallet, open the recovery flow,
create a fresh passkey on their new device, and authorize it as a controller
with the wallet — without any FairWins intervention. Because the account is
standard on-chain infrastructure, the same recovery is possible with generic
blockchain tools even if FairWins the service disappears, and the app
documents how.

**Why this priority**: Completes the self-custody story; depends on Story 5
having linked a wallet, so it is sequenced after it.

**Independent Test**: With a wallet linked as controller, clear all local
passkey data, connect the wallet alone, run recovery to add a new passkey,
then sign in with the new passkey and transact.

**Acceptance Scenarios**:

1. **Given** an account whose controllers include an external wallet, **When**
   the user connects that wallet (no passkey available) and opens recovery,
   **Then** they can create a new passkey and authorize it using only wallet
   signatures, and afterwards can sign in with the new passkey.
2. **Given** a connected wallet that controls a passkey account, **When** the
   user views their wallet session, **Then** the app surfaces that this wallet
   controls a passkey account and offers the recovery/management entry point.
3. **Given** FairWins is unreachable, **When** the user consults the recovery
   documentation, **Then** it describes how to exercise control of the account
   with generic tools (the account is standard, publicly documented on-chain
   infrastructure).

---

### Edge Cases

- Browser data cleared entirely: passkey still exists on the device; signing
  back in must reconstruct everything needed to transact (Story 1, scenario 2).
- Passkey ceremony cancelled mid-connect: surface returns to its idle state;
  a retry works immediately.
- Device does not support passkeys: option shown as unavailable with a short
  explanation; other methods unaffected.
- A wallet and a passkey session both available: exactly one active session at
  a time; switching is explicit, never implicit.
- Background session restore completes *after* the user manually connected
  something else: the manual choice wins; the restore must not overwrite it.
- Removing the last controller of an account is refused (existing on-chain
  invariant); recovery UI must never strand an account with zero controllers.
- Linking a wallet that is already a controller: refused idempotently with a
  clear message.
- Multiple known passkeys where some records are stale (account no longer
  exists on-chain or credential removed from device): picker entries must fail
  gracefully into a plain-language message, with the option to remove the
  stale entry.
- Explainer state cannot be persisted (storage blocked): explainer may show
  again; it must never block connecting.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All connection entry points in the app MUST open one shared
  connect surface with identical options, labels, ordering, and availability
  logic. No entry point may connect via a default that skips user choice.
- **FR-002**: The connect surface MUST present Passkey and WalletConnect as
  featured/recommended options ahead of browser extension wallets, while
  keeping all three fully functional.
- **FR-003**: The connect surface MUST show per-option availability honestly
  (e.g. "not detected" for missing browser wallet, "not supported" for
  passkey-incapable devices) before the user commits to an option.
- **FR-004**: Connection handling MUST serialize concurrent attempts: at most
  one connect flow in flight; a new user-initiated attempt either replaces the
  pending one cleanly or is refused with visible feedback; background session
  restore MUST NOT override a user-initiated connection.
- **FR-005**: Signing in with an existing passkey MUST leave the session fully
  able to transact: whatever record the app keeps about the chosen credential
  MUST be complete after sign-in, for sign-up, sign-in, and restored sessions
  alike.
- **FR-006**: Passkey-required actions MUST validate the resolved credential
  before starting a ceremony; when it is missing or incomplete the user MUST
  get a plain-language message with the recovery step (sign in again), never
  an internal error.
- **FR-007**: When more than one passkey for the app is known on the browser,
  sign-in MUST offer the user an explicit choice of account and MUST use
  exactly the chosen credential for the session and all subsequent ceremonies.
- **FR-008**: All passkey ceremonies tied to an active session MUST be pinned
  to that session's credential so the platform cannot substitute another one.
- **FR-009**: Actions signed by a passkey MUST identify the credential's
  actual controller position on the account rather than assuming the first
  position, so accounts with multiple controllers keep working.
- **FR-010**: A brief passkey explainer MUST be shown the first time the
  passkey option is chosen on a browser, at most once, dismissible, and never
  shown to users who have already used a passkey there.
- **FR-011**: A signed-in passkey user MUST be able to link an external wallet
  (browser extension or WalletConnect) as an additional controller of their
  account, with a clear statement that the wallet gains full control, and with
  compliance screening applied before linking (fail closed).
- **FR-012**: A signed-in passkey user MUST be able to add a second passkey
  and remove controllers, with removal of the last controller refused.
- **FR-013**: Accounts with a single controller MUST be warned about
  device-loss risk with a direct path to add a recovery method.
- **FR-014**: A user connected only with an external wallet that controls a
  passkey account MUST be able to recover access: create a new passkey on the
  current device and authorize it as a controller using only wallet
  signatures, without any FairWins-operated service in the loop.
- **FR-015**: Recovery documentation MUST describe how account control can be
  exercised with generic on-chain tools independent of FairWins.
- **FR-016**: All existing sign-in and connect behavior guarantees from the
  passkey login feature (single ceremony per action, honest lifecycle,
  compliance parity, identity never branching on login method) MUST be
  preserved.

### Key Entities

- **Connect Surface**: the single shared experience for starting a session;
  attributes: available methods, per-method availability, featured ordering,
  in-flight state.
- **Credential Record**: what the app remembers locally about a passkey;
  attributes: credential identity, account address, verification key, label,
  recovery-capability flag. Must be complete for a session to transact.
- **Account Controller**: an authorizer of a passkey account — either a
  passkey or an external wallet address; attributes: kind, position, linked
  wallet/credential. Minimum one per account (on-chain invariant).
- **Recovery Flow**: wallet-only path that adds a new passkey controller to an
  account the wallet already controls.
- **Explainer State**: per-browser marker that the first-time passkey
  explainer has been shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero occurrences of internal errors (such as "reading 'id'") on
  passkey-required actions across sign-up, sign-in, and restored sessions in
  the automated suite and manual verification on Chrome and Brave.
- **SC-002**: A user with two passkey accounts on one browser can sign into
  either account on Brave with 100% selection fidelity (the session always
  matches the picked account).
- **SC-003**: Every connect entry point in the app opens the same surface;
  a UI audit finds no surface-specific divergence in options or ordering.
- **SC-004**: Users can complete connect via passkey (returning user) in one
  tap plus one platform ceremony; via WalletConnect in the standard QR flow.
- **SC-005**: A passkey user can link an external wallet as a controller in
  under a minute with a single passkey confirmation.
- **SC-006**: A user with a linked wallet and no passkeys can regain full
  passkey access using only their wallet, end-to-end, without any
  FairWins-side action; verified by an automated integration test and a
  documented manual runbook.
- **SC-007**: First-time passkey users see the explainer exactly once per
  browser; returning users never see it.

## Assumptions

- The existing passkey account layer (a standard multi-controller smart
  account with a public factory) already supports external wallets as
  controllers and enforces the last-controller invariant on-chain; this
  feature adds no new on-chain custody mechanics.
- "Recovery without FairWins" means: any single controller (including a linked
  external wallet) can exercise full account control directly on-chain; it
  does not mean recovering an account that never linked a second controller.
- Recovery requires the external wallet to have been linked while the user
  still had passkey access (no social/guardian recovery is in scope).
- The wallet-only recovery flow operates on the account contract directly with
  ordinary wallet transactions, so it works without FairWins-run
  infrastructure; the FairWins frontend is one convenient client for it.
- The first-time explainer marker is stored per browser profile; it may reset
  if the user clears site data, which is acceptable.
- Networks in scope are those already enabled for passkey accounts; no new
  network enablement is part of this feature.
- The existing "Safe multisig custody" feature (043) is a separate custody
  primitive and is out of scope here.
- Client-side nicknames/labels for credentials remain local-only, never
  on-chain.
