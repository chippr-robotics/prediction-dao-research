# Research: Notification Profiles

**Feature**: 059-notification-profiles | **Date**: 2026-07-17

No NEEDS CLARIFICATION markers remained in the Technical Context; research
consolidated the Signal reference behavior and the existing codebase seams.

## R1. Signal's notification-profiles pattern (reference behavior)

- **Decision**: Mirror Signal Android / Desktop 7.76 semantics: multiple named
  profiles (name + emoji, presets Work 💪 / Sleep 😴 / Driving 🚗 / Downtime 😊 /
  Focus 💡), an allow-list, always-break-through exceptions, optional weekly
  schedule (start, end, days), manual enable with durations (indefinite /
  "For 1 hour" / "Until <schedule end>"), single active profile, quick-access
  sheet on the main list surface, 4-step creation flow ending in a
  confirmation screen with "turn on manually" and "add a schedule" hints.
- **Rationale**: Confirmed against the provided flow screenshots (chat-list
  sheet, "Name your profile", "Allowed notifications" with Allow-all-calls ON /
  Notify-for-all-mentions OFF defaults, "Add a schedule" with 9:00 AM–5:00 PM
  defaults and no-days-preselected, "Profile created") and the linked article
  (aboutsignal.com, Signal Desktop 7.76 beta): profiles control "how, when,
  and from whom", schedules support weekday/weekend/time-block automation,
  manual + scheduled activation, active profile surfaced atop the chat list.
- **Alternatives considered**: iOS Focus-mode style system integration —
  rejected: web app has no OS focus APIs; Signal's in-app model matches our
  in-app delivery pipeline.

## R2. Mapping Signal's people/groups allow-list to FairWins

- **Decision**: Allow-list over the six existing notification categories
  (`wagers`, `pools`, `membership`, `dao`, `token`, `custody`) from
  `NOTIFICATION_CATEGORIES` in `deliveryPreferences.js`.
- **Rationale**: FairWins notifications are derived per-domain by
  ActivitySources (spec 031); there is no per-contact notification source, so
  categories are the only meaningful allow-list axis. Reusing
  `NOTIFICATION_CATEGORIES` keeps the wizard and the base-layer grid showing
  the identical category set (labels + descriptions).
- **Alternatives considered**: Per-wager/per-pool allow-listing — rejected as
  speculative scope (no user ask, no precedent in the feed model); can layer
  later without storage breakage (versioned store).

## R3. Mapping Signal's exceptions ("Allow all calls", "Notify for all mentions")

- **Decision**: Two exception switches: **Always allow action-required items**
  (matches `entry.actionable === true`) and **Always allow deadline
  reminders** (matches `entry.type ∈ {'warn-acceptance','warn-resolution'}`).
  Both default ON for new profiles.
- **Rationale**: In a wagering app the money-critical interrupts are "you must
  act" (custody approvals, votes, claims — sources already stamp
  `actionable: true`) and "a deadline is about to pass"
  (`deadlineWarnings.js` emits exactly the two `warn-*` types, at most one per
  wager/window/day). Signal defaults calls ON — the analogous
  safety-preserving default is both ON. Signal defaults mentions OFF, but
  defaulting deadline reminders OFF would let a "Sleep" profile eat a
  He-must-claim-by-8AM warning — money beats symmetry; the switch remains for
  users who want total silence.
- **Alternatives considered**: severity-based exception (`severity ===
  'warning'`) — rejected: severity is presentation, `actionable`/`warn-*` are
  semantic; a single combined "critical only" switch — rejected: loses
  Signal's two-switch mental model and the ability to silence deadlines but
  keep approvals.

## R4. Storage pattern

- **Decision**: New module `lib/notifications/notificationProfiles.js`, key
  `fairwins_notif_profiles_v1`, device-scoped, `{ version: 1, profiles: [],
  override: null }`, plain-JSON localStorage, never-throws read/write,
  module-level listener set with `subscribe()` — the exact
  `deliveryPreferences.js` pattern.
- **Rationale**: Spec mandates client-side/device-scoped parity with delivery
  preferences; the pattern is proven (private-browsing fallback, cross-
  component sync); a separate key keeps the two stores independently
  versioned and makes FR-016 (no migration) automatic.
- **Alternatives considered**: extending `fairwins_notif_delivery_v1` —
  rejected: entangles versioning and risks corrupting the existing store on
  rollback; per-account `userStorage` scoping — rejected: interruption
  preferences are a device concern (mirrors existing decision for delivery
  prefs, and Signal profiles are per-device unless synced — sync is out of
  scope with no backend).

## R5. Activation/override semantics

- **Decision**: Lazy evaluation `getActiveProfile(nowMs)` over
  `{ profiles, override }`: manual-enabled (with optional `until`) beats
  schedules; manual-disabled suppresses one profile until its current window
  ends; otherwise the scheduled profile whose start is most recent wins;
  expired overrides are pruned on read. No background timer required for
  correctness.
- **Rationale**: The app has no persistent background process (PWA, tab may be
  closed at boundaries — spec edge case). Lazy evaluation guarantees the
  correct state on next open and on every poll cycle; a UI-only 30 s tick
  refreshes displayed status. Matches Signal's observed behavior (manual off
  during a scheduled window stays off until next window).
- **Alternatives considered**: storing a boolean `active` flag flipped by
  timers — rejected: wrong after sleep/close (dishonest state, Constitution
  III); scheduling via service worker alarms — rejected: no reliable
  cross-browser API, unnecessary.

## R6. Gate integration point

- **Decision**: Single choke point in `ActivityProvider.poll()`: replace the
  two `resolveDelivery(e.domain || 'wagers')` call sites (toastable filter,
  pushable filter) with `resolveEntryDelivery(entry)` exported from
  `notificationProfiles.js`, which internally calls the untouched
  `resolveDelivery(domain)` for the base layer.
- **Rationale**: Keeps `deliveryPreferences.js` byte-identical (SC-005), keeps
  the feed append path untouched (FR-009 — silenced entries still persist +
  count unread), and preserves the existing toast cap, catch-up suppression,
  and push degradation for free since they sit around the same filter.
- **Alternatives considered**: gating inside `showSystemNotification` —
  rejected: wouldn't stop toasts; a React context for profiles — rejected:
  the poll callback is easier and less invasive with a plain module import
  (same as `resolveDelivery` today).

## R7. Quick-access surface

- **Decision**: A `ProfileQuickAccess` section pinned at the top of the
  existing `ActivityFeed` panel (opened from the `NotificationBell`),
  showing the active/first profile with expand-to-reveal duration actions
  ("For 1 hour", "Until <end>", off), plus "View settings" and "New profile".
- **Rationale**: The bell's feed panel is FairWins' chat-list analog — the one
  always-reachable notification surface on every page; Signal pins its sheet
  to the chat list the same way. Reuses the panel's focus/Escape handling
  (a11y) and avoids a new global UI region.
- **Alternatives considered**: header-level standalone menu — rejected
  (crowds the header, duplicates bell affordance); floating action on Home —
  rejected (Home is already dense; profiles are notification-scoped).

## R8. Time/schedule representation

- **Decision**: `'HH:MM'` 24-h strings + `days: number[]` (0 = Sunday);
  native `<input type="time">` + seven day-toggle buttons
  (`aria-pressed`), rendered S M T W T F S; display via
  `toLocaleTimeString` for 12/24-h locale correctness. End ≤ start spans
  midnight and belongs to the start day.
- **Rationale**: Native time inputs are accessible, mobile-friendly, and
  locale-aware for free; string storage avoids timezone bugs (evaluated
  against device-local time per spec edge case); Signal's picker defaults
  (9:00 AM – 5:00 PM, no days preselected) are kept.
- **Alternatives considered**: minutes-since-midnight integers — equivalent
  but less debuggable in storage; a custom picker component — rejected
  (YAGNI, a11y cost).
