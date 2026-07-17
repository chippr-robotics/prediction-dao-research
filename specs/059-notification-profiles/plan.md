# Implementation Plan: Notification Profiles

**Branch**: `claude/notification-profiles-migration-h59dr6` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/059-notification-profiles/spec.md`

## Summary

Adopt Signal's notification-profiles pattern on top of the existing spec-031
client-side notification stack. A new device-scoped store
(`lib/notifications/notificationProfiles.js`, same localStorage + pub/sub
pattern as `deliveryPreferences.js`) holds named profiles (name, emoji,
category allow-list, action-required/deadline exceptions, optional weekly
schedule) plus a single activation record (manual on/off overrides layered
over schedule evaluation, at most one active profile). The
`ActivityProvider.poll()` delivery gate swaps its per-domain
`resolveDelivery(domain)` calls for a per-entry `resolveEntryDelivery(entry)`
that first consults the active profile (allow-list + exceptions) and then
falls through to the untouched base-layer preferences. UI: a 4-step creation
wizard + profile list/editor in the Wallet → Preferences Notifications group,
and a quick-access section at the top of the `ActivityFeed` panel (the app's
analog of Signal's chat-list sheet) for manual on/off with durations. No
contracts, no backend, no schema changes to the activity store.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 (JSX), Node 20 toolchain

**Primary Dependencies**: React + Vite; existing notification stack: `lib/notifications/deliveryPreferences.js`, `lib/notifications/pushDelivery.js`, `contexts/ActivityProvider.jsx`, `data/notifications/*` (spec 031). No new packages.

**Storage**: `localStorage`, device-scoped, new key `fairwins_notif_profiles_v1` (same never-throws pattern as `fairwins_notif_delivery_v1`). Activity feed storage untouched.

**Testing**: Vitest (`npm run test:frontend`), jsdom + Testing Library, fake timers for schedule/duration tests (existing pattern in `ActivityProvider.delivery.test.jsx`)

**Target Platform**: Browser/PWA (desktop + mobile web)

**Project Type**: Web frontend only — `frontend/` workspace; zero contract/subgraph/services changes

**Performance Goals**: Gate adds O(1) work per fresh entry per poll cycle; schedule evaluation is pure arithmetic on a ≤ handful of profiles; no extra timers beyond one lightweight interval for UI status refresh

**Constraints**: Behavior with zero profiles must be bit-identical to today (SC-005); nothing ever dropped from the durable feed (Constitution III); WCAG 2.1 AA for all new surfaces; storage corruption degrades to defaults

**Scale/Scope**: ~1 new lib module, 1 new hook, ~4 new components + CSS, 3 edited files (`ActivityProvider.jsx`, `ActivityFeed.jsx`, `WalletPage.jsx`), ~5 new test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Security-first contracts | No `contracts/` changes; feature is entirely client-side UI/preferences. Slither/Medusa/security review not applicable. | PASS (N/A) |
| II. Test-first, comprehensive coverage | Vitest unit tests for the profile store (schedule math, overrides, gate) and component tests for wizard/panel/quick-access; `ActivityProvider` delivery tests extended for profile gating; existing delivery suite must keep passing unmodified in behavior (SC-005). | PASS |
| III. Honest state, no mocks in shipped paths | Profiles only gate *interruptions* (toast/push); every entry still lands in the durable feed with real unread state. No fabricated data; active-state UI shows computed truth ("On until 6:00 PM"). No catch-up toasts invented for silenced periods (catch-up polls stay feed-only, as today). | PASS |
| IV. Fail loudly in CI | No CI changes; new tests run in the existing `test:frontend` gate. | PASS |
| V. Accessible, consistent frontend | Wizard/panel/quick-access follow existing panel patterns (`role="switch"`, `radiogroup`, labelled controls, focus management like `ActivityFeed`); FR-017 requires keyboard + SR operability; axe/Lighthouse CI unchanged. | PASS |
| Simplicity (workflow §4) | One new store module mirroring an existing pattern; no context provider added (module pub/sub + hook, like `useNotificationPreferences`); no new deps. | PASS |

**Post-design re-check (after Phase 1)**: PASS — design introduces no backend,
no new technology, no contract surface; storage versioned (`version: 1`) with
corrupt-data fallback; base layer untouched.

## Project Structure

### Documentation (this feature)

```text
specs/059-notification-profiles/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── profile-store.md # Module API + delivery-gate contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/notifications/
│   ├── deliveryPreferences.js        # UNCHANGED base layer
│   ├── pushDelivery.js               # UNCHANGED
│   └── notificationProfiles.js      # NEW — profile store, schedule eval,
│                                     #        activation record, resolveEntryDelivery()
├── hooks/
│   ├── useNotificationPreferences.js # UNCHANGED
│   └── useNotificationProfiles.js    # NEW — React binding + status tick
├── contexts/
│   └── ActivityProvider.jsx          # EDIT — gate via resolveEntryDelivery(entry)
├── components/
│   ├── notifications/
│   │   ├── ActivityFeed.jsx          # EDIT — mount ProfileQuickAccess at top
│   │   └── profiles/
│   │       ├── ProfileQuickAccess.jsx    # NEW — Signal-style sheet section
│   │       ├── ProfileQuickAccess.css
│   │       ├── ProfileWizard.jsx         # NEW — 4-step creation flow
│   │       ├── ProfileWizard.css
│   │       ├── ProfileScheduleFields.jsx # NEW — shared schedule editor (wizard + edit)
│   │       └── emojiPresets.js           # NEW — Work/Sleep/Driving/Downtime/Focus
│   └── account/
│       ├── NotificationPreferencesPanel.jsx  # UNCHANGED (base layer)
│       ├── NotificationProfilesPanel.jsx     # NEW — list/edit/delete + wizard entry
│       └── NotificationProfilesPanel.css
├── pages/
│   └── WalletPage.jsx                # EDIT — render NotificationProfilesPanel
└── test/
    ├── notificationProfiles.test.js          # NEW — store/schedule/override/gate
    ├── ActivityProvider.profiles.test.jsx    # NEW — end-to-end gating
    ├── NotificationProfilesPanel.test.jsx    # NEW
    ├── ProfileWizard.test.jsx                # NEW
    ├── ProfileQuickAccess.test.jsx           # NEW
    └── ActivityProvider.delivery.test.jsx    # UNCHANGED — must keep passing (SC-005)
```

**Structure Decision**: Frontend-only change inside the existing `frontend/src`
layout. New profile UI lives beside the notification components it extends
(`components/notifications/profiles/`), the settings panel beside the existing
preferences panel (`components/account/`), and all logic in one new lib module
mirroring `deliveryPreferences.js` so the two device-scoped stores stay
side-by-side and independently versioned.

## Key Design Decisions

1. **Gate composition, not replacement.** `resolveEntryDelivery(entry)` is the
   single new decision point: `(no active profile) → resolveDelivery(domain)`
   unchanged; `(active, domain allowed) → resolveDelivery(domain)`;
   `(active, exception match) → resolveDelivery(domain)` upgraded from
   `silent` to `app` (FR-010 carve-out, exception matches only);
   `(active, otherwise) → 'silent'`. `ActivityProvider.poll()` swaps its two
   `resolveDelivery(e.domain)` call sites for `resolveEntryDelivery(e)` —
   the only provider change.
2. **Exception matching.** Action-required ⇔ `entry.actionable === true`
   (already stamped by every source). Deadline reminders ⇔ `entry.type ∈
   {'warn-acceptance', 'warn-resolution'}` (the deadlineWarnings.js types),
   exported as a shared constant from `notificationProfiles.js`.
3. **Activation model (Signal semantics).** Stored `override` record:
   `{ kind: 'enabled', profileId, until: ms|null }` (manual on; `until` from
   "For 1 hour" / "Until <schedule end>") or `{ kind: 'disabled', profileId,
   at: ms }` (manual off inside that profile's schedule window — suppresses it
   until the window ends) or `null` (pure schedule evaluation).
   `getActiveProfile(nowMs)` evaluates lazily at every call — correctness never
   depends on a timer firing; expired overrides are pruned on read.
   Overlapping schedules: latest start wins; enabling any profile clears the
   prior override (at most one active).
4. **Schedule math in device-local time.** Times stored as `'HH:MM'` strings +
   `days: [0..6]` (Sunday-first, matching the S M T W T F S row). End ≤ start
   spans midnight: the window belongs to its *start* day (a Mon 21:00–07:00
   schedule is active Tue 06:00 only if Monday is selected — Signal behavior).
5. **UI status refresh.** `useNotificationProfiles` subscribes to the store and
   re-evaluates on a 30 s interval so "On until 6:00 PM" flips without
   interaction; the delivery gate itself never relies on that tick.
6. **Settings placement.** `NotificationProfilesPanel` renders *above* the
   untouched `NotificationPreferencesPanel` in WalletPage's Preferences →
   Notifications group: profiles are the headline; the base grid remains as
   "How each category is delivered". Wizard opens in-panel (no new route);
   quick-access "View settings" deep-links to the Preferences tab.
7. **No migration needed.** New storage key, absent by default ⇒ FR-016
   (existing users unchanged) is satisfied structurally; corrupt/foreign data
   degrades to `{ profiles: [], override: null }`.

## Complexity Tracking

No constitution violations — table intentionally empty.
