# Feature Specification: Notification Profiles

**Feature Branch**: `claude/notification-profiles-migration-h59dr6`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Replace the current per-category notification delivery settings (the 'Notifications' panel in Wallet → Preferences with a master Mobile push toggle and per-category Push/In-app/Silent segmented controls) with Signal-style Notification Profiles. Following Signal's pattern (Signal Desktop 7.76 / Android): a user can create multiple named notification profiles, each with a name and emoji (with quick-pick presets like Work, Sleep, Driving, Downtime, Focus), an allow-list of notification categories the profile lets through, exceptions that always break through, and an optional schedule (start time, end time, days of week) that turns the profile on automatically. Profiles can also be toggled manually from a quick-access surface: enable indefinitely, 'for 1 hour', or 'until <next schedule boundary>', and turned off. When a profile is active, only allowed notifications notify; everything else is silenced (still recorded in the activity feed). When no profile is active, existing per-category delivery preferences continue to apply. Creation flow mirrors Signal's 4 steps. All storage stays client-side/device-scoped."

## Overview

FairWins currently offers one flat notification setting: a master push toggle plus a
per-category choice of Push / In-app / Silent. That answers "how does each kind of
update reach me?" but not "when do I want to be interrupted at all?". A member who
wants quiet evenings but must never miss a wager deadline has no way to express
that today.

Notification Profiles adopt the pattern Signal introduced on Android and Desktop
7.76: named, reusable "interruption modes" (Sleep, Work, Focus…) that a member
turns on manually or on a weekly schedule. While a profile is on, only the
notification categories that profile allows may interrupt the member; everything
else lands silently in the activity feed. Deadline-critical and action-required
updates can be marked as exceptions that always break through, because in a
wagering app a missed acceptance or claim deadline costs real money.

Signal's allow-list is people and groups; FairWins has no per-contact
notifications, so the allow-list is adapted to FairWins' notification categories
(Wagers, Wager Pools, Membership, Governance, Token, Custody), and Signal's
"allow all calls / all mentions" exceptions are adapted to FairWins'
money-safety equivalents ("always allow action-required items" and "always allow
deadline reminders").

The existing per-category Push / In-app / Silent selector remains the base
layer: it still decides *how* an allowed notification is delivered. Profiles add
a layer above it that decides *whether* a notification may interrupt at all.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a notification profile (Priority: P1)

A member opens their notification settings, starts "New profile", and walks a
four-step flow mirrored on Signal's: (1) name the profile and pick an emoji, with
one-tap presets (Work 💪, Sleep 😴, Driving 🚗, Downtime 😊, Focus 💡); (2) choose
which notification categories are allowed to notify while the profile is on, and
set the exceptions ("Always allow action-required items" — on by default — and
"Always allow deadline reminders"); (3) optionally add a weekly schedule (start
time, end time, days of week) that turns the profile on automatically, or skip;
(4) see a confirmation that the profile was created, with hints on how to turn it
on manually and where to edit the schedule.

**Why this priority**: Nothing else in the feature is usable until a profile can
be created. Creating a profile with a category allow-list and exceptions is the
minimum viable slice: even without schedules or a quick-access surface, a member
can create and enable a profile from settings and get the core value (selective
quiet).

**Independent Test**: Can be fully tested by walking the creation flow end to
end and confirming the profile appears in the settings list with the chosen
name, emoji, allowed categories, exceptions, and (if set) schedule — all
surviving a page reload.

**Acceptance Scenarios**:

1. **Given** a member with no profiles, **When** they start "New profile" and tap
   the "Sleep" preset, **Then** the name field is filled with "Sleep" and the 😴
   emoji is selected, and they can continue.
2. **Given** the name step, **When** the member tries to continue with an empty
   name, **Then** the flow blocks continuation and indicates a name is required.
3. **Given** the allowed-notifications step, **When** the member allows only
   "Wagers" and leaves "Always allow action-required items" on, **Then** the
   created profile records exactly that allow-list and exception.
4. **Given** the schedule step, **When** the member skips it, **Then** the profile
   is created with no schedule and can only be turned on manually.
5. **Given** the schedule step, **When** the member enables the schedule, sets
   9:00 PM – 7:00 AM on all seven days, and continues, **Then** the confirmation
   step appears and the created profile stores that schedule.
6. **Given** the confirmation step, **When** the member finishes, **Then** they
   return to the notification settings where the new profile is listed.

---

### User Story 2 - Profile silences non-allowed notifications (Priority: P1)

While a profile is on, a notification from a category the profile does not allow
is recorded in the activity feed but produces no toast and no device push. A
notification from an allowed category is delivered exactly as the existing
per-category Push / In-app / Silent preference dictates. Notifications matching
an enabled exception (action-required items, deadline reminders) break through
even if their category is not allowed.

**Why this priority**: This is the behavioral heart of the feature — a profile
that doesn't actually gate interruptions is just a saved form. Ships together
with Story 1 as the MVP.

**Independent Test**: With a profile active that allows only "Wagers", simulate
fresh activity in an allowed category, a blocked category, and a blocked
category with an action-required item; verify toast/push behavior for each and
that all three appear in the activity feed.

**Acceptance Scenarios**:

1. **Given** an active profile allowing only Wagers, **When** a new Governance
   update arrives, **Then** no toast or device push is shown and the update
   appears in the activity feed as unread.
2. **Given** an active profile allowing only Wagers, **When** a new Wagers update
   arrives and the Wagers base preference is "Push", **Then** the member gets the
   toast and the device push as today.
3. **Given** an active profile allowing only Wagers with "Always allow
   action-required items" on, **When** a Custody approval request (action
   required) arrives, **Then** it notifies despite Custody not being allowed.
4. **Given** an active profile with "Always allow deadline reminders" on,
   **When** a wager deadline warning arrives, **Then** it notifies even if Wagers
   is not in the allow-list.
5. **Given** no active profile, **When** any update arrives, **Then** delivery is
   identical to today's behavior (per-category Push / In-app / Silent).

---

### User Story 3 - Manual on/off from a quick-access surface (Priority: P2)

From the notification bell's feed panel (the app's equivalent of Signal's chat
list), the member can see their profiles and the active one at a glance, and
toggle a profile with duration choices: on indefinitely, on "For 1 hour", or —
when the profile has a schedule — on "Until <next schedule end>". They can turn
the active profile off at any time, and reach profile settings ("View settings")
and profile creation ("New profile") from the same surface.

**Why this priority**: Manual control from settings alone (Story 1) is workable;
the quick-access surface is what makes profiles habitual. It builds directly on
Stories 1–2.

**Independent Test**: With two profiles saved, open the quick-access surface,
enable one "For 1 hour", verify it reports active with an expiry, verify the
other cannot be simultaneously active, turn it off, and verify normal delivery
resumes.

**Acceptance Scenarios**:

1. **Given** a saved profile that is off, **When** the member enables it "For 1
   hour", **Then** it becomes active, displays that it is on with the time it
   turns off, and deactivates itself after one hour.
2. **Given** a profile with a schedule ending at 5:00 PM today, **When** the
   member enables it manually at 2:00 PM choosing "Until 5:00 PM", **Then** it
   deactivates at 5:00 PM.
3. **Given** profile A is active, **When** the member enables profile B, **Then**
   profile A turns off — at most one profile is active at a time.
4. **Given** an active profile, **When** the member turns it off, **Then**
   delivery immediately reverts to the base per-category preferences.
5. **Given** the quick-access surface, **When** the member has no profiles,
   **Then** it offers "New profile" and leads into the creation flow.

---

### User Story 4 - Scheduled activation (Priority: P2)

A profile with a schedule turns itself on at the scheduled start time on the
selected days and off at the end time, with no member action. Overnight ranges
(e.g. 9:00 PM – 7:00 AM) span midnight correctly. A member can manually override
a scheduled activation — turning the profile off before the end time keeps it
off until the next scheduled start; turning a profile on outside its schedule
works like any manual enable.

**Why this priority**: Schedules are what make "Sleep" set-and-forget, but the
feature is fully usable manually without them.

**Independent Test**: Create a profile scheduled for the current time window and
day, reload the app, and verify it reports active without interaction; verify a
manual off keeps it off within the same window; verify it does not activate on
an unselected day.

**Acceptance Scenarios**:

1. **Given** a profile scheduled 9:00 AM – 5:00 PM on Monday–Friday, **When** the
   member uses the app at 10:00 AM on a Tuesday, **Then** the profile is active.
2. **Given** the same profile, **When** the member uses the app at 10:00 AM on a
   Saturday, **Then** the profile is not active.
3. **Given** a profile scheduled 9:00 PM – 7:00 AM daily, **When** the member uses
   the app at 6:00 AM, **Then** the profile is active (overnight span).
4. **Given** a scheduled profile currently active, **When** the member turns it
   off at 3:00 PM (before its 5:00 PM end), **Then** it stays off for the rest of
   that window and reactivates at the next scheduled start.
5. **Given** a schedule with no days selected, **When** the member tries to save
   the schedule as enabled, **Then** saving is blocked until at least one day is
   chosen.

---

### User Story 5 - Manage existing profiles (Priority: P3)

From notification settings, the member can open any saved profile to rename it,
change its emoji, edit its allowed categories and exceptions, add/edit/remove
its schedule, or delete the profile. The settings surface also presents the
existing base-layer controls (master push toggle and per-category
Push / In-app / Silent) so the whole notification experience is managed in one
place.

**Why this priority**: Editing rounds out the lifecycle; until it ships, a member
can delete and recreate a profile as a workaround.

**Independent Test**: Edit each attribute of a saved profile and verify
persistence across reload; delete a profile and verify it disappears and, if it
was active, that delivery reverts to base behavior.

**Acceptance Scenarios**:

1. **Given** a saved profile, **When** the member renames it and changes its
   allowed categories, **Then** the changes persist across a reload.
2. **Given** an active profile, **When** the member deletes it, **Then** it is
   removed, no profile is active, and delivery reverts to base preferences.
3. **Given** a profile without a schedule, **When** the member adds one from the
   edit surface, **Then** scheduled activation starts working for it.

---

### Edge Cases

- Two profiles have overlapping schedules: the profile whose scheduled start is
  most recent wins; enabling one profile always deactivates any other.
- A manual "For 1 hour" enable on a profile whose schedule would start within
  that hour: the manual duration wins; when it expires, the schedule is
  re-evaluated (so the profile may remain on because its schedule window is now
  open).
- The member's device clock/timezone changes (travel): schedules are evaluated
  in the device's current local time.
- The app is closed at a schedule boundary: on next open, the correct
  active/inactive state is computed from the schedule and any manual override —
  no "catch-up" toasts for updates that were silenced while a profile was on.
- Deleting the active profile, or the active profile's manual duration expiring
  while the settings surface is open: the UI reflects the change without a
  reload.
- All categories un-ticked in the allow-list: allowed — the profile silences
  everything except enabled exceptions (a true Do-Not-Disturb).
- Both exceptions disabled and no categories allowed: allowed, with the
  consequence stated plainly in the flow (total silence; feed still records
  everything).
- Emoji is skipped: the profile falls back to a neutral default icon; emoji is
  optional, name is required.
- Duplicate profile names: allowed (profiles are identified internally, not by
  name), matching Signal's behavior.
- Profile storage is corrupted or from a newer version: settings load with an
  empty/default profile list rather than crashing; base preferences still apply.
- Browser/device push permission revoked while a profile is on: allowed
  notifications degrade from push to in-app exactly as today's base layer does.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Members MUST be able to create multiple named notification
  profiles, each with a required name (up to 32 characters) and an optional
  emoji, including one-tap presets: Work 💪, Sleep 😴, Driving 🚗, Downtime 😊,
  Focus 💡.
- **FR-002**: Each profile MUST hold an allow-list over the notification
  categories already exposed in notification settings (Wagers, Wager Pools,
  Membership, Governance, Token, Custody); categories not on the allow-list are
  silenced while the profile is active. An empty allow-list is valid.
- **FR-003**: Each profile MUST hold two exception switches — "Always allow
  action-required items" (default on for new profiles) and "Always allow
  deadline reminders" (default on for new profiles) — which let matching
  updates notify even when their category is not allowed.
- **FR-004**: Profile creation MUST follow a four-step guided flow: name & emoji
  → allowed notifications & exceptions → optional schedule (skippable) →
  confirmation, with back navigation between steps and no data lost while
  moving between steps.
- **FR-005**: Each profile MAY have one weekly schedule consisting of an on/off
  switch, a start time, an end time, and a set of days of week (default
  9:00 AM – 5:00 PM with no days preselected). A schedule cannot be saved as
  enabled with zero days selected. End-before-start ranges are treated as
  spanning midnight into the next day.
- **FR-006**: A profile with an enabled schedule MUST activate automatically at
  its start time on selected days and deactivate at its end time, evaluated in
  the device's local time, including while the app was closed (correct state on
  next open).
- **FR-007**: Members MUST be able to manually turn any profile on
  (indefinitely, "For 1 hour", or — when the profile has an enabled schedule —
  "Until <next schedule end>") and manually turn the active profile off.
  Manual actions override the schedule until the next schedule boundary.
- **FR-008**: At most one profile can be active at any moment; activating a
  profile deactivates any other.
- **FR-009**: While a profile is active, updates from non-allowed categories
  that match no enabled exception MUST produce no toast and no device push, but
  MUST still be recorded in the activity feed (including unread state) exactly
  as today.
- **FR-010**: While a profile is active, updates from allowed categories (or
  matching an enabled exception) MUST be delivered according to the existing
  base per-category Push / In-app / Silent preference — profiles never upgrade
  delivery (an exception breaking through a "Silent" base category is delivered
  at least in-app so it is actually noticeable; this is the single deliberate
  carve-out and MUST be limited to exception matches).
- **FR-011**: When no profile is active, notification behavior MUST be
  byte-for-byte today's behavior: master push toggle plus per-category
  Push / In-app / Silent.
- **FR-012**: A quick-access surface reachable from the notification bell's
  feed panel MUST show the profiles, indicate the active one and when it turns
  off (e.g. "Off", "On until 6:00 PM"), offer the manual on/off choices of
  FR-007, and link to "View settings" and "New profile".
- **FR-013**: The notification settings area MUST list all profiles with their
  active state, allow editing every profile attribute (name, emoji, allow-list,
  exceptions, schedule) and deleting profiles, and continue to expose the
  base-layer master push toggle and per-category mode controls.
- **FR-014**: While a profile is active, the settings and quick-access surfaces
  MUST make the state visible (profile name/emoji and how it was activated —
  manual or scheduled — and when it will turn off, if known).
- **FR-015**: All profile data and active-state MUST be stored client-side on
  the device, alongside (and with the same durability/versioning approach as)
  the existing delivery preferences; no backend or on-chain storage. Corrupt or
  unrecognized stored data MUST degrade to defaults without crashing.
- **FR-016**: Existing members' current settings MUST carry forward unchanged:
  on first load after the update, no profile exists, nothing is active, and the
  base preferences keep working with no member action required.
- **FR-017**: All new surfaces MUST be operable by keyboard and screen reader
  (labelled controls, announced state changes) consistent with the app's
  accessibility standard.

### Key Entities

- **Notification Profile**: A named interruption mode. Attributes: identifier,
  name, optional emoji, allow-list of notification categories, exception
  switches (action-required, deadline reminders), optional weekly schedule,
  created/updated timestamps.
- **Profile Schedule**: Part of a profile: enabled flag, start time, end time,
  set of days of week. Interpreted in device-local time; end ≤ start means the
  window crosses midnight.
- **Active Profile State**: Device-wide record of which profile (if any) is
  currently active and why: manual-indefinite, manual-until-<time>, or
  scheduled; plus any manual override suppressing a schedule window. Drives the
  notification gate and the status shown in the UI.
- **Notification Category**: The existing per-domain grouping of updates
  (Wagers, Wager Pools, Membership, Governance, Token, Custody) that profiles
  allow-list over and base preferences assign modes to.
- **Exception Match**: An update flagged as action-required, or a deadline
  reminder, which enabled exceptions let through regardless of category
  allow-listing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create a "Sleep" profile from presets — including a
  nightly schedule — in under 60 seconds and fewer than 12 taps/clicks.
- **SC-002**: With a profile active that allows one category, 100% of simulated
  updates from other categories produce zero toasts and zero device pushes
  while 100% still appear in the activity feed.
- **SC-003**: With "Always allow action-required items" on, 100% of simulated
  action-required updates notify regardless of the profile's allow-list.
- **SC-004**: A scheduled profile reports the correct active/inactive state on
  app open in 100% of tested boundary cases (before start, inside window,
  after end, overnight span, unselected day, manual override).
- **SC-005**: Members with no profiles see zero change in notification
  behavior after the update (verified by the existing delivery test suite
  passing unmodified in behavior).
- **SC-006**: Turning a profile on or off from the quick-access surface takes
  effect on the very next detected update (no reload, no delay beyond the
  existing polling cadence).
- **SC-007**: All new settings and quick-access surfaces pass the project's
  automated accessibility checks with zero new violations.

## Assumptions

- FairWins has no per-contact or per-group notification source, so Signal's
  "add people or groups" allow-list maps to FairWins' six notification
  categories; Signal's "Allow all calls" / "Notify for all mentions" exceptions
  map to "Always allow action-required items" / "Always allow deadline
  reminders" — the money-critical equivalents in a wagering app.
- Profiles gate *interruptions* only (toasts and device push). The durable
  activity feed and its unread counts are intentionally unaffected, matching
  the product's "honest state" principle — nothing is ever dropped.
- "Replace the current notification setting" means the settings surface is
  rebuilt around profiles as the headline concept; the per-category
  Push / In-app / Silent grid and master push toggle are retained beneath as
  the base delivery layer (per the feature description), not removed.
- Storage remains per-device (like today's delivery preferences), not synced
  per-account; Signal's cross-device profile sync is out of scope because
  FairWins has no notification backend to sync through.
- Scheduling precision follows the app's existing detection cadence (~30 s
  polling while the tab is visible); a schedule boundary takes effect on the
  next evaluation tick, which is within the product's tolerance.
- The quick-access surface lives in the notification bell's feed panel — the
  closest FairWins analog to Signal's chat-list sheet — rather than a new
  global UI region.
- The `intents` and `earn` activity domains are not exposed in today's
  preferences panel and stay out of the profile allow-list for parity; adding
  them later is a follow-up.
- Localized 12/24-hour time display follows the device locale, as elsewhere in
  the app.
