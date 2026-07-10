# Feature Specification: Mask Sensitive Values

**Feature Branch**: `claude/mask-sensitive-values-e6o6a6`

**Created**: 2026-07-10

**Status**: Draft (revised 2026-07-10 — tilt-to-hide mechanism)

**Input**: User description: "Provide an instant visual toggle to hide account balances and portfolio totals in public spaces." Revised: "The app should have a **tilt-to-hide** option — on a mobile device balances show while the user is viewing it, and hide automatically when they lay it flat so someone else can look at something. This is a configuration in Preferences, toggleable app-wide, and replaces the header button toggle. Tilt-to-hide is enabled by default."

## Overview

Members open FairWins in places where other people can see their screen — a
coffee shop, a shared desk, a train, or when handing their phone to a friend to
look at a wager. In those moments the exact dollar figures on screen (wallet
balances, the portfolio total, category subtotals, per-asset USD values, stake
amounts, activity-history amounts, pending payouts) are private information the
member may not want a bystander to read.

This feature protects those figures with **tilt-to-hide**: on a mobile device,
sensitive monetary values are shown while the member holds the phone at a normal
viewing tilt, and are automatically masked the moment the device is laid flat —
the natural gesture for setting a phone on a table or turning it toward someone
else to show them something. Lifting the phone back to a viewing angle reveals
the values again. Masking replaces the digits with a neutral placeholder (e.g.
`••••`) and never changes the underlying balances, holdings, or on-chain state —
it is purely a display-level mask over values that are already the member's own.

Tilt-to-hide is a single **app-wide setting in Preferences**, enabled by default,
that governs this behavior across every screen. It replaces the earlier idea of a
manual header toggle: privacy is now automatic and gesture-driven rather than a
button the member must remember to press. Because it depends on the device's
orientation sensor, tilt-to-hide is a mobile capability; on desktop and other
devices without usable motion sensing, values are simply shown.

## Clarifications

### Session 2026-07-10

- Q: What should the privacy preference be keyed to (per-device vs per-account)? → A: Per connected account — each wallet address remembers its own state on the local device; before any account is connected the default applies.
- Q: Where should the privacy control live? → A: **Superseded by the tilt-to-hide revision below.** Originally a persistent header control; the header toggle is now replaced by an automatic tilt-to-hide behavior configured in Preferences.
- Q: Which monetary figures should be masked? → A: All on-screen monetary figures — including activity/transaction-history amounts and pending payout/winnings amounts, not just balances, totals, subtotals, per-asset values, and stakes.

### Session 2026-07-10 — tilt-to-hide revision

- Q: What is the primary privacy mechanism? → A: **Tilt-to-hide** — masking is driven automatically by device orientation (mask when laid flat, reveal when tilted to a viewing angle), replacing the manual header toggle.
- Q: How is it configured? → A: A single app-wide on/off setting in Preferences, **enabled by default**.
- Q: What happens on devices without a usable orientation sensor (desktop, sensor-less, or motion permission denied/unavailable)? → A: Tilt-to-hide is **mobile-only**; on those devices values are simply shown (no masking and no manual fallback control).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Balances hide when I lay my phone flat (Priority: P1)

A member is using FairWins on their phone and wants to show the person next to
them a wager or a chart. They lay the phone flat on the table (or tilt it toward
the other person). As the phone reaches a flat orientation, every balance,
portfolio total, subtotal, per-asset value, stake, history amount, and pending
payout on screen is automatically replaced with a masked placeholder — the other
person never sees the figures. When the member picks the phone back up to a
normal viewing angle, the real values reappear. The member did not press
anything; the privacy happened by itself.

**Why this priority**: This is the feature. Automatic, gesture-driven hiding is
the entire value proposition — a member gets privacy in the exact moment they
share their screen without having to remember a control.

**Independent Test**: On a mobile device with tilt-to-hide enabled, open any
screen showing monetary values, lay the device flat and verify all such values
mask within a moment and no real digits remain; lift it back to a viewing angle
and verify the exact values return.

**Acceptance Scenarios**:

1. **Given** a member viewing the portfolio on a mobile device with tilt-to-hide
   enabled and values visible, **When** they lay the device flat (screen roughly
   horizontal), **Then** the portfolio total, every subtotal, and every per-asset
   value are masked and no real monetary digits remain visible.
2. **Given** the device is flat and values are masked, **When** the member lifts
   it back to a normal viewing tilt, **Then** all masked values return to their
   exact real figures.
3. **Given** the member moves the device between flat and viewing angles around
   the threshold, **When** the orientation hovers near the boundary, **Then** the
   masked/revealed state does not rapidly flicker (a stability margin is applied).
4. **Given** the device is laid flat, **When** the member navigates to another
   screen or new values load while it is still flat, **Then** those values render
   masked without ever flashing real digits.

---

### User Story 2 - Turn tilt-to-hide on or off in Preferences (Priority: P2)

A member wants control over whether tilt-to-hide is active. In **Preferences**,
they find a single app-wide toggle for tilt-to-hide, which is **on by default**.
Turning it off stops the automatic masking everywhere in the app; turning it back
on restores it. The choice is remembered across sessions so the app behaves
consistently every time they open it.

**Why this priority**: The default-on behavior delivers privacy immediately, but
members must be able to disable a behavior that affects how their whole app
reads. This makes the feature controllable and trustworthy; it builds on P1.

**Independent Test**: Open Preferences, confirm the tilt-to-hide setting is on by
default, toggle it off and verify laying the device flat no longer masks values;
toggle it on, reload the app, and verify the setting and behavior persist.

**Acceptance Scenarios**:

1. **Given** a member who has never changed the setting, **When** they open
   Preferences, **Then** the tilt-to-hide setting is shown as enabled.
2. **Given** tilt-to-hide is enabled, **When** the member turns it off in
   Preferences, **Then** laying the device flat no longer masks any values app-wide.
3. **Given** the member changed the setting, **When** they close and reopen the
   app, **Then** the setting retains the value they chose and the app behaves
   accordingly from the first render.
4. **Given** tilt-to-hide is enabled, **When** the setting is active, **Then** it
   governs masking on every screen (app-wide), not just the screen where it was
   configured.

---

### User Story 3 - Understand why values are hidden and where the feature applies (Priority: P3)

A member wants to understand what tilt-to-hide does and not be confused when
figures disappear. The Preferences setting is clearly labeled and explains the
behavior. On a device that cannot support tilt-to-hide (no usable orientation
sensor or motion access unavailable), the app communicates that the feature
requires a mobile device with motion sensing rather than silently doing nothing.

**Why this priority**: This is a clarity/trust refinement. The feature works
without it, so it ships last, but it prevents confusion ("why are my balances
blank?") and sets correct expectations on unsupported devices.

**Independent Test**: Read the Preferences setting label/description and confirm
it explains tilt-to-hide; open the app on a device without motion sensing and
confirm the setting communicates that the feature can't take effect there.

**Acceptance Scenarios**:

1. **Given** the Preferences setting, **When** a member reads it, **Then** its
   label and description make clear that balances hide when the phone is laid flat
   and show when held at a viewing angle.
2. **Given** a device without a usable orientation sensor or motion access, **When**
   the member views the tilt-to-hide setting, **Then** the app indicates the
   feature requires a mobile device with motion sensing and that values are shown
   normally in the meantime.

---

### Edge Cases

- **Flicker at the threshold**: small movements near the flat/viewing boundary
  (a hand tremor, a bump, walking) must not cause the mask to rapidly toggle; a
  stability margin (hysteresis) and/or brief settling delay is applied so the
  state changes only on a deliberate reorientation.
- **Face-down / non-viewing orientations**: any orientation that is not a normal
  viewing tilt (including screen face-down) is treated as "hidden," so the member
  cannot accidentally leave values revealed in a non-viewing position; returning
  to a viewing tilt reveals them.
- **Landscape and portrait**: a viewing tilt is recognized in both portrait and
  landscape holds; rotating the screen orientation alone (while still held at a
  viewing angle) does not mask values.
- **Motion permission denied or unavailable**: if the device/browser cannot
  provide orientation data or the member declines motion access, tilt-to-hide
  cannot operate; values are shown normally and the Preferences setting reflects
  that it can't take effect (mobile-only, per clarification).
- **Desktop / sensor-less devices**: values are shown normally; there is no
  masking and no manual fallback control.
- **App launch or foregrounding while flat**: if the app is opened or brought to
  the foreground while the device is already flat (and tilt-to-hide is enabled),
  sensitive values render masked from the first frame — no flash of real digits.
- **A value that is legitimately zero or unavailable**: masking must not turn a
  masked figure into a misleading `$0.00`; on reveal, the honest state (real
  amount, or "price unavailable") is restored exactly as before.
- **Non-monetary numbers**: participant counts, timers, dates, and identifiers
  are NOT masked, so the app stays legible while the device is flat.
- **Copy / accessibility exposure**: while masked, a sensitive value must not be
  readable through selecting/copying the text or through the screen-reader
  accessible name — the mask applies to the exposed content, not just the glyphs.
- **Screenshots and screen-share while flat**: a screenshot or shared screen
  captured while the device is flat shows the placeholders.
- **Switching accounts**: the tilt-to-hide preference is keyed to the connected
  account; switching accounts applies that account's own setting (default enabled
  if never changed).
- **Reduced-motion / accessibility settings**: the feature must respect platform
  motion-access constraints and degrade to "values shown" rather than error when
  motion data is unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a mobile device with tilt-to-hide enabled, the system MUST
  automatically mask all sensitive monetary values when the device is laid flat
  (screen at a non-viewing, roughly horizontal orientation) and automatically
  reveal them when the device is returned to a normal viewing tilt — with no
  manual action required.
- **FR-002**: The system MUST expose tilt-to-hide as a single app-wide on/off
  setting in Preferences, and this setting MUST govern masking behavior across
  every screen of the app. This setting replaces any manual header/navigation
  privacy toggle (no separate header control is provided).
- **FR-003**: Tilt-to-hide MUST be enabled by default for any account that has
  not changed the setting.
- **FR-004**: When masking is active, the system MUST mask every on-screen
  monetary figure — wallet/account balances, the portfolio total, category
  subtotals, per-asset amounts and USD values, wager stake amounts,
  activity/transaction-history amounts, and pending payout/winnings amounts — and
  MUST NOT mask non-sensitive numbers such as participant counts, timers, dates,
  or identifiers.
- **FR-005**: The system MUST distinguish a "viewing" orientation from a "flat"
  (hidden) orientation and MUST apply a stability margin (hysteresis and/or a
  brief settling delay) so that small movements near the threshold do not cause
  the masked/revealed state to flicker.
- **FR-006**: The masked state MUST apply globally: while the device is flat,
  every sensitive value on the current and any subsequently visited screen is
  masked, including values that load or update asynchronously while flat.
- **FR-007**: When the device is (or becomes) flat, sensitive values MUST render
  masked with no visible flash of real values — including on app launch or
  foregrounding while the device is already flat.
- **FR-008**: Tilt-to-hide is a mobile capability. On devices without a usable
  orientation sensor, or where motion access is unavailable or declined, the
  system MUST show values normally (no masking) and MUST NOT block app use; the
  Preferences setting MUST communicate that the feature cannot take effect there.
- **FR-009**: Where the platform requires explicit permission to read device
  motion/orientation, the system MUST request it appropriately; if permission is
  declined, the system MUST behave as in FR-008 (values shown) without error.
- **FR-010**: The system MUST persist the tilt-to-hide on/off setting keyed to
  the connected account so it is retained across app reloads and new sessions on
  the same device, and switching accounts applies that account's own setting.
- **FR-011**: Masking MUST NOT alter, recompute, or lose the underlying values;
  revealing MUST reproduce the identical figures (including honest "unavailable" /
  non-zero states) that would have been shown without the feature.
- **FR-012**: The masked placeholder MUST NOT encode the magnitude or digit count
  of the hidden value (a large balance and a small balance mask to
  indistinguishable placeholders).
- **FR-013**: Masking MUST prevent the sensitive value from being exposed through
  text selection/copy and through the accessibility (screen-reader) accessible
  name while the value is masked.
- **FR-014**: Applying or removing the mask MUST preserve layout stability — no
  reflow, jump, or overlap that degrades usability — and MUST keep all other app
  functionality available while masked.
- **FR-015**: The Preferences setting MUST clearly describe the behavior (values
  hide when the phone is laid flat, show when held at a viewing angle) so members
  understand why values appear or disappear.
- **FR-016**: The tilt-to-hide preference MUST be treated as a local, per-account
  presentation setting stored on the device and MUST NOT depend on network/on-chain
  state or leak across the testnet/mainnet network boundary in a way that changes
  displayed balances.

### Key Entities *(include if feature involves data)*

- **Tilt-to-Hide Preference**: A single app-wide on/off presentation setting,
  stored locally on the device and keyed to the connected account, defaulting to
  **enabled**. It governs whether device orientation drives masking; it holds no
  financial data.
- **Viewing State**: The derived, moment-to-moment state (viewing vs flat/hidden)
  computed from device orientation with a stability margin. It determines whether
  sensitive values are currently masked; it is not persisted.
- **Sensitive Value Field**: Any on-screen monetary figure subject to masking —
  balances, portfolio total, subtotals, per-asset values, stake amounts,
  activity/transaction-history amounts, and pending payout/winnings amounts.
  Non-monetary figures (counts, timers, dates, identifiers) are explicitly excluded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a supported mobile device with tilt-to-hide enabled, laying the
  device flat masks 100% of on-screen sensitive monetary fields within one second,
  with 0 real sensitive digits remaining visible (including in newly loaded
  content and copied text).
- **SC-002**: Lifting the device back to a viewing tilt restores the exact real
  figures within one second, and the masked↔revealed cycle reproduces the same
  displayed figures 100% of the time (no value altered, rounded differently, or
  lost).
- **SC-003**: Across repeated deliberate reorientations, the state changes only on
  intended flat/viewing transitions — no observable flicker occurs from incidental
  movement near the threshold in usability testing.
- **SC-004**: When the app is opened or foregrounded while the device is already
  flat, sensitive values render masked on 100% of launches with no observable flash
  of real values.
- **SC-005**: New mobile members receive tilt-to-hide protection with no setup —
  because it is enabled by default, values hide when the device is laid flat on the
  member's first session without any configuration.
- **SC-006**: On desktop or devices without usable motion sensing, the app remains
  fully usable, values are shown normally, and the Preferences setting clearly
  communicates that the feature is mobile-only.
- **SC-007**: In usability testing, at least 90% of members correctly understand
  from the Preferences description that balances hide when the phone is laid flat.

## Assumptions

- The scope is the FairWins frontend/web experience; masking is a client-side
  presentation concern and does not require any smart-contract or subgraph change.
- Tilt-to-hide relies on the mobile device's orientation/motion sensing. "Flat"
  means the screen is held roughly horizontal (a non-viewing angle); "viewing"
  means it is tilted up toward the member. Exact threshold angles and the size of
  the stability margin are implementation-tunable within the behavior described.
- "Sensitive values" are all on-screen monetary figures (balances, totals,
  subtotals, per-asset values, stake amounts, activity/transaction-history amounts,
  pending payout/winnings amounts). Identifiers, counts, dates, and timers are out
  of scope for masking unless later specified.
- The tilt-to-hide setting is stored locally on the device and keyed to the
  connected account; syncing the preference across a member's devices is out of
  scope for v1.
- Tilt-to-hide is enabled by default; members can disable it in Preferences.
- On devices without usable motion sensing (desktop, sensor-less, or motion access
  declined/unavailable) there is no masking and no manual fallback control; values
  are shown normally.
- Masking protects against casual over-the-shoulder / shared-screen viewing; it is
  not a defense against a determined attacker with developer tools or full device
  access, and this is acceptable for the feature's intent.
- The feature affects only display; underlying values, calculations, and on-chain
  state are unchanged, satisfying the project's "honest state" principle.
- Some mobile platforms require an explicit, user-granted permission to read
  device motion/orientation; obtaining and handling that permission is in scope,
  and a decline degrades gracefully to "values shown."
