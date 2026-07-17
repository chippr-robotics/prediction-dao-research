# Tasks: Notification Profiles

**Input**: Design documents from `/specs/059-notification-profiles/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/profile-store.md, quickstart.md

**Tests**: Included — Constitution Principle II (test-first) is non-negotiable; every behavior lands with Vitest coverage in the same phase.

**Organization**: Grouped by user story. All paths are under `frontend/src/` unless noted.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (create), US2 (gating), US3 (quick access), US4 (schedule), US5 (manage)

## Phase 1: Setup

- [x] T001 Verify frontend toolchain and green baseline: run `npm run test:frontend` from repo root; record any pre-existing failures in the PR notes (none expected)

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The profile store module and its exhaustive unit tests — every story consumes it. Schedule evaluation (US4 logic) lives here because the store's activation model is inseparable from it; US4's phase then covers only its UI/status surface.

- [x] T002 Create `lib/notifications/notificationProfiles.js` per contracts/profile-store.md: constants (`PROFILE_EMOJI_PRESETS`, `DEADLINE_REMINDER_TYPES`, `MAX_PROFILE_NAME_LENGTH`, `DEFAULT_SCHEDULE`), never-throw versioned storage (`fairwins_notif_profiles_v1`, normalize-on-read per data-model.md), CRUD (`getProfiles`/`getProfile`/`createProfile`/`updateProfile`/`deleteProfile`), pub/sub `subscribe` — mirror the `deliveryPreferences.js` pattern exactly
- [x] T003 Implement activation + schedule evaluation in `lib/notifications/notificationProfiles.js`: window math ('HH:MM' + days, overnight spans owned by start day), `enableProfile(id, { until })`, `disableActiveProfile()`, `getActiveStatus(nowMs)` (manual > schedule, latest-start wins, lazy pruning of expired/stale overrides, persist+notify only on actual change), `getNextScheduleEnd(profile, nowMs)`
- [x] T004 Implement `resolveEntryDelivery(entry, nowMs)` in `lib/notifications/notificationProfiles.js` per data-model.md §Entry delivery: no-active → base `resolveDelivery`; allowed domain → base; exception match (`allowActionRequired && entry.actionable`, `allowDeadlineReminders && DEADLINE_REMINDER_TYPES.includes(entry.type)`) → base with silent→app upgrade; else `'silent'`
- [x] T005 Write `test/notificationProfiles.test.js` covering: CRUD + validation (name 1–32, unknown domains dropped, defaults), corrupt/foreign storage → empty store, single-active invariant, manual durations (indefinite/1 h/until-end, expiry re-evaluates schedule), disabled-override suppresses only current window, schedule boundaries (before/inside/after, overnight, unselected day, zero-days normalization), gate matrix (all four branches incl. silent→app upgrade for exceptions only) and no-profile parity with `resolveDelivery`
- [x] T006 Create `hooks/useNotificationProfiles.js` per contracts/profile-store.md hook contract: state from store + `subscribe`, `activeStatus` re-evaluated on change and on a 30 s interval, stable action callbacks, cleanup on unmount

**Checkpoint**: `npx vitest run src/test/notificationProfiles.test.js` green; no UI changes yet.

## Phase 3: User Story 1 — Create a notification profile (P1) 🎯 MVP (with US2)

**Goal**: 4-step wizard (name+emoji presets → allowed categories + exceptions → optional schedule → confirmation) reachable from a new profiles panel in Wallet → Preferences.

**Independent test**: Walk the wizard end-to-end; profile appears in the settings list with all chosen attributes and survives reload (quickstart §Manual 1).

- [x] T007 [P] [US1] Create `components/notifications/profiles/emojiPresets.js` re-exporting `PROFILE_EMOJI_PRESETS` (Work 💪, Sleep 😴, Driving 🚗, Downtime 😊, Focus 💡) for UI use
- [x] T008 [P] [US1] Create `components/notifications/profiles/ProfileScheduleFields.jsx` — shared schedule editor: enable `role="switch"`, native `<input type="time">` start/end (defaults 09:00/17:00), S M T W T F S day toggles (`aria-pressed`), blocks enabled-with-zero-days, overnight hint when end ≤ start
- [x] T009 [US1] Create `components/notifications/profiles/ProfileWizard.jsx` + `ProfileWizard.css` — 4 steps with back navigation and state retention: (1) required name (≤32) + optional emoji + preset chips that fill both; (2) category allow-list from `NOTIFICATION_CATEGORIES` + two exception switches defaulting ON, with plain-language total-silence consequence when nothing is allowed; (3) `ProfileScheduleFields` with Skip; (4) confirmation ("Profile created", manual-toggle + schedule hints) → Done calls `createProfile` (schedule step 3 already captured) — dialog semantics, focus trap, Escape closes per existing app dialogs
- [x] T010 [US1] Create `components/account/NotificationProfilesPanel.jsx` + `NotificationProfilesPanel.css` — "Notification profiles" headline section: profile list (emoji, name, status line), "New profile" button opening `ProfileWizard`, empty-state copy; wire into `pages/WalletPage.jsx` Preferences → Notifications group ABOVE the untouched `NotificationPreferencesPanel`
- [x] T011 [P] [US1] Write `test/ProfileWizard.test.jsx` — preset fills name+emoji, empty-name blocked, step state survives back/forward, skip-schedule creates schedule-less profile, zero-days schedule cannot be saved enabled, Done persists exactly the chosen shape (assert via `getProfiles()`)
- [x] T012 [P] [US1] Write `test/NotificationProfilesPanel.test.jsx` (creation slice) — empty state, New-profile opens wizard, created profile listed with name/emoji

**Checkpoint**: Wizard + panel functional and tested; profiles persist. No behavior change to delivery yet.

## Phase 4: User Story 2 — Profile silences non-allowed notifications (P1) 🎯 MVP

**Goal**: Active profile gates toasts/push in the poll loop; feed untouched; base layer bit-identical when no profile active.

**Independent test**: With a profile active allowing only Wagers, fresh entries from allowed/blocked/exception categories toast-or-not per the matrix while all land in the feed (quickstart §Automated).

- [x] T013 [US2] Edit `contexts/ActivityProvider.jsx`: import `resolveEntryDelivery` from `lib/notifications/notificationProfiles`; replace the two `resolveDelivery(e.domain || 'wagers')` call sites (toastable filter line ~111, pushable filter line ~118) with `resolveEntryDelivery(e)`; feed append, toast cap, "+N more", catch-up suppression unchanged; update the routing comment
- [x] T014 [US2] Write `test/ActivityProvider.profiles.test.jsx` — with an enabled profile: blocked-domain entry → no toast/no `showSystemNotification`, still appended + unread; allowed-domain entry → toasts per base mode; actionable entry from blocked domain with exception ON → notifies, OFF → silent; deadline `warn-*` entry likewise; silent-base + exception → in-app toast (upgrade); no-profile run → identical to existing delivery behavior (reuse harness/mocks from `test/ActivityProvider.delivery.test.jsx`)
- [x] T015 [US2] Run regression set unmodified (SC-005): `npx vitest run src/test/ActivityProvider.delivery.test.jsx src/test/deliveryPreferences.test.js src/test/NotificationPreferencesPanel.test.jsx` — must pass with zero behavioral edits to those files

**Checkpoint**: MVP complete — profiles can be created (settings) and actually gate delivery.

## Phase 5: User Story 3 — Manual on/off from quick access (P2)

**Goal**: Signal-style section pinned atop the bell's `ActivityFeed` panel: status, expand for durations, off, View settings, New profile.

**Independent test**: Quickstart §Manual 3 — enable "For 1 hour" shows expiry, enabling B turns A off, off reverts immediately, links land correctly.

- [x] T016 [US3] Create `components/notifications/profiles/ProfileQuickAccess.jsx` + `ProfileQuickAccess.css` — uses `useNotificationProfiles`; collapsed row: emoji, name, status ("Off" / "On until 6:00 PM" / "On" with manual/scheduled wording per FR-014, locale time via `toLocaleTimeString`); expandable (`aria-expanded`) actions: enable indefinitely, "For 1 hour" (`until: now+3600e3`), "Until <end>" only when `getNextScheduleEnd` non-null, "Turn off" when active; footer "New profile" and "View settings" buttons; no-profiles state = just "New profile"
- [x] T017 [US3] Edit `components/notifications/ActivityFeed.jsx` — render `ProfileQuickAccess` between header and filters; wire "View settings" to close the panel and navigate to the Wallet Preferences tab (reuse the page's existing tab-targeting mechanism; add a `?tab=preferences` search-param read in `pages/WalletPage.jsx` only if none exists); "New profile" navigates there and opens the wizard (pass intent via router state consumed by `NotificationProfilesPanel`)
- [x] T018 [P] [US3] Write `test/ProfileQuickAccess.test.jsx` — status rendering for off/manual-until/indefinite/scheduled, duration actions call `enableProfile` with right `until`, single-active flip (enable B → A off), turn-off reverts `getActiveStatus` to null, empty-profile state, keyboard operability (expand/collapse, Escape bubbles to panel close)

**Checkpoint**: Profiles switchable without leaving any page.

## Phase 6: User Story 4 — Scheduled activation (P2)

**Goal**: Surface scheduled state truthfully everywhere (engine shipped in Phase 2); status flips without interaction.

**Independent test**: Quickstart §Manual 4 — schedule covering now → active on reload with "until <end>"; manual off stays off within window; inactive on unselected day.

- [x] T019 [US4] In `components/account/NotificationProfilesPanel.jsx` + `ProfileQuickAccess.jsx`, verify/finish scheduled-status display: "On until <end> · Scheduled", next-activation hint for off scheduled profiles ("Turns on Mon 9:00 PM") via a small helper exported from `lib/notifications/notificationProfiles.js` (`getNextScheduleStart`), 30 s tick already provided by the hook
- [x] T020 [US4] Extend `test/notificationProfiles.test.js` with `getNextScheduleStart` cases (later today, next selected day, overnight) and extend `test/ProfileQuickAccess.test.jsx` with fake-timer flip: schedule boundary crossing updates status text without user interaction

**Checkpoint**: Set-and-forget schedules visibly working.

## Phase 7: User Story 5 — Manage existing profiles (P3)

**Goal**: Edit every attribute; delete (including active); all from the settings panel.

**Independent test**: Quickstart §Manual 5 — each attribute edit persists across reload; deleting the active profile clears status and reverts delivery.

- [x] T021 [US5] Extend `components/account/NotificationProfilesPanel.jsx` with an edit surface (expand-in-place or dialog reusing wizard step components and `ProfileScheduleFields`): rename, emoji change, allow-list + exception toggles, add/edit/remove schedule, per-profile on/off convenience toggle, Delete with confirm — wired to `updateProfile`/`deleteProfile`/`enableProfile`/`disableActiveProfile`
- [x] T022 [US5] Extend `test/NotificationProfilesPanel.test.jsx` — edits persist via `getProfiles()`, deleting active profile clears `getActiveStatus()` and removes row, schedule added via edit activates scheduling (assert `getActiveStatus` with fake time), a11y roles/labels on all new controls

**Checkpoint**: Full lifecycle complete.

## Phase 8: Polish & Cross-Cutting

- [ ] T023 [P] Accessibility pass over all new surfaces (wizard, panel, quick access): keyboard-only walk, focus trap/restore, `role`/`aria-*` audit against existing patterns; fix findings (FR-017, SC-007)
- [ ] T024 [P] Verify styling in light/dark and mobile widths matches existing panel patterns (`NotificationPreferencesPanel.css`, `ActivityFeed.css` conventions); ensure no horizontal overflow in the feed panel with quick access mounted
- [x] T025 Update docs: add profiles section to the notifications developer guide (create `docs/developer-guide/notification-profiles.md` if no existing guide covers spec 031) documenting storage key, gate order, and Signal mapping; cross-link from `specs/059-notification-profiles/`
- [ ] T026 Full-suite gate: `npm run test:frontend` green and `npm run lint` (frontend ESLint) clean; run quickstart.md manual + corruption drill; mark checklists complete

## Dependencies & Execution Order

- **Phase 2 blocks everything** (T002→T003→T004 sequential in one file; T005 after T004; T006 after T003).
- **US1 (Phase 3)** needs only Phase 2. T007/T008 parallel; T009 after both; T010 after T009; T011/T012 parallel after T010.
- **US2 (Phase 4)** needs only Phase 2 — can proceed in parallel with US1 (different files). T013→T014→T015.
- **US3 (Phase 5)** needs Phase 2 + T010 (settings destination for "View settings"). T016→T017; T018 parallel with T017.
- **US4 (Phase 6)** needs US3 surfaces (T016) + Phase 2.
- **US5 (Phase 7)** needs T010.
- **Phase 8** last.

```
Phase 2 ──┬── Phase 3 (US1) ──┬── Phase 5 (US3) ── Phase 6 (US4) ──┐
          └── Phase 4 (US2) ──┤                                    ├── Phase 8
                              └── Phase 7 (US5) ───────────────────┘
```

## Parallel Example

After Phase 2: one track runs T007+T008 → T009 (US1 UI) while another runs T013 (US2 gate) — disjoint files. Test tasks T011/T012/T018 are parallel-safe (separate new files).

## Implementation Strategy

**MVP = Phase 2 + US1 + US2**: create profiles in settings and have them gate delivery. Quick access (US3), schedule surfacing (US4), and editing (US5) layer on incrementally; each checkpoint leaves the app shippable with the base layer untouched.
