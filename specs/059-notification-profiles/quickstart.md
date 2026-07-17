# Quickstart: Notification Profiles

**Feature**: 059-notification-profiles

Validation guide for the profile layer on top of the spec-031 notification
stack. Shapes: [data-model.md](./data-model.md) · API:
[contracts/profile-store.md](./contracts/profile-store.md).

## Prerequisites

```bash
cd frontend && npm install   # repo root: npm install if not yet done
```

## Automated validation

```bash
# Full frontend suite (from repo root)
npm run test:frontend

# Feature-focused runs (from frontend/)
npx vitest run src/test/notificationProfiles.test.js       # store, schedule math, overrides, gate
npx vitest run src/test/ActivityProvider.profiles.test.jsx # end-to-end gating in the poll loop
npx vitest run src/test/ProfileWizard.test.jsx             # 4-step creation flow
npx vitest run src/test/NotificationProfilesPanel.test.jsx # list/edit/delete settings surface
npx vitest run src/test/ProfileQuickAccess.test.jsx        # feed-panel quick access

# Regression guarantee (SC-005): pre-existing delivery tests, unmodified behavior
npx vitest run src/test/ActivityProvider.delivery.test.jsx src/test/deliveryPreferences.test.js src/test/NotificationPreferencesPanel.test.jsx
```

Expected: all pass; the three regression files pass **without behavioral
edits**.

## Manual validation

```bash
npm run frontend   # Vite dev server
```

1. **Create (Story 1)** — Wallet → Preferences → Notifications → "New
   profile". Tap the **Sleep** preset (name + 😴 fill in) → Next → allow only
   **Wagers**, leave both exceptions on → Next → enable the schedule, set
   21:00–07:00, select all days → Next → confirmation screen → Done. Profile
   listed with name, emoji, and schedule. Reload — still there.
2. **Silencing (Story 2)** — enable the profile, then trigger fresh activity
   in a blocked domain (e.g. a DAO proposal on a local chain, or temporarily
   drive a source in dev): no toast/push; bell unread count increments; entry
   in feed. A wager update still toasts per its base mode.
3. **Quick access (Story 3)** — open the bell's Activity panel: profile
   section pinned on top shows "Sleep — Off". Expand → "For 1 hour" →
   status shows the off time; second profile enable flips the first off;
   "Turn off" reverts immediately. "View settings" lands on the Preferences
   tab; "New profile" opens the wizard.
4. **Schedule (Story 4)** — set a schedule covering the current time/day,
   reload: profile shows active with "until <end>" without any tap. Turn it
   off mid-window: stays off; change device clock past the next start (or
   wait): reactivates. Overnight window active before 07:00.
5. **Edit/delete (Story 5)** — from settings, rename, change allow-list, add/
   remove schedule — each persists across reload. Delete the active profile:
   status clears, base-layer behavior resumes.
6. **Base parity (FR-011/016)** — in a fresh browser profile (no localStorage
   key): notification behavior identical to production today; the
   Push/In-app/Silent grid and master push toggle work unchanged.
7. **Accessibility (FR-017)** — walk the wizard and quick access with
   keyboard only (Tab/Space/Enter/Escape); verify toggles announce state
   (`role="switch"`/`aria-pressed`), the wizard traps focus like existing
   dialogs, and axe reports no new violations.

## Storage inspection (DevTools)

```js
JSON.parse(localStorage.getItem('fairwins_notif_profiles_v1'))
// { version: 1, profiles: [...], override: {...}|null }
localStorage.removeItem('fairwins_notif_profiles_v1') // reset feature only
```

Corruption drill: `localStorage.setItem('fairwins_notif_profiles_v1', '{bad')`
→ reload → app loads, zero profiles, base behavior intact (FR-015).
