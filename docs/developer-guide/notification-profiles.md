# Notification Profiles (spec 059)

Signal-style interruption modes layered over the spec-031 client-side
notification stack. A profile is a named allow-list over the notification
domains plus two always-break-through exceptions and an optional weekly
schedule; at most one profile is active at a time. While active, only allowed
updates interrupt (toast/OS push) — everything still lands in the durable
activity feed.

## Layering

```
ActivityProvider.poll()  — appends ALL fresh entries to the feed, then per entry:
  resolveEntryDelivery(entry)            lib/notifications/notificationProfiles.js
    ├─ no active profile      → resolveDelivery(domain)     (bit-identical to pre-059)
    ├─ domain allow-listed    → resolveDelivery(domain)
    ├─ exception match        → resolveDelivery(domain), 'silent' upgraded to 'app'
    └─ otherwise              → 'silent' (feed only)
  resolveDelivery(domain)                lib/notifications/deliveryPreferences.js
    the untouched base layer: per-category push/app/silent + master push flag
```

Exception matches: `entry.actionable === true` ("Always allow action-required
items") and `entry.type ∈ DEADLINE_REMINDER_TYPES` (`warn-acceptance`,
`warn-resolution` from `deadlineWarnings.js` — "Always allow deadline
reminders"). Both default ON for new profiles: in a wagering app, missed
approvals and deadlines cost money, so the safety-preserving default wins over
strict Signal symmetry (Signal defaults mentions OFF).

## Storage

`localStorage['fairwins_notif_profiles_v1']` — device-scoped (like
`fairwins_notif_delivery_v1`; a phone's interruption rules are per-device, and
there is no backend to sync through):

```json
{
  "version": 1,
  "profiles": [{
    "id": "p_…", "name": "Sleep", "emoji": "😴",
    "allowedDomains": ["wagers"],
    "allowActionRequired": true, "allowDeadlineReminders": true,
    "schedule": { "enabled": true, "start": "21:00", "end": "07:00", "days": [0,1,2,3,4,5,6] },
    "createdAt": 0, "updatedAt": 0
  }],
  "override": { "kind": "enabled", "profileId": "p_…", "until": null, "at": 0 }
}
```

Reads normalize aggressively (corrupt/foreign data ⇒ empty store, never
throws). Activation is a single `override` record — `enabled` (manual on,
optional `until` expiry) or `disabled` (suppresses one scheduled window) —
replaced wholesale on every enable, which structurally guarantees a single
active profile. `getActiveStatus(nowMs)` evaluates lazily (manual > schedule,
latest window start wins, expired overrides pruned on read), so correctness
never depends on a timer: the state is right on next open even if the app was
closed across a boundary. Schedules are device-local wall time; `end <= start`
spans midnight and the window belongs to its start day.

## Surfaces

- **Settings** — `components/account/NotificationProfilesPanel.jsx`, rendered
  above the base-layer `NotificationPreferencesPanel` in Wallet → Preferences →
  Notifications. Hosts the 4-step `ProfileWizard` (name+emoji presets →
  allow-list+exceptions → schedule → confirmation) and the inline editor.
  Deep links: `/wallet?tab=preferences#notification-profiles` (scroll) and
  `…#notification-profiles-new` (open wizard).
- **Quick access** — `components/notifications/profiles/ProfileQuickAccess.jsx`,
  pinned atop the `ActivityFeed` panel (the chat-list analog of Signal's
  sheet): per-profile On / "For 1 hour" / "Until <schedule end>" / Turn off,
  plus New profile / View settings.
- **React binding** — `hooks/useNotificationProfiles.js`: store subscription +
  a 30 s status tick (display only; the gate never needs it).

## Signal mapping

| Signal | FairWins |
|---|---|
| Allowed people & groups | Allow-list over the six notification domains (`NOTIFICATION_CATEGORIES`) |
| Allow all calls | Always allow action-required items (default ON) |
| Notify for all mentions | Always allow deadline reminders (default ON — money beats symmetry) |
| Chat-list sheet | `ProfileQuickAccess` in the bell's feed panel |
| Cross-device sync | Out of scope (no backend; per-device like delivery prefs) |

## Invariants (tested)

- With no profile active, delivery is byte-identical to the base layer — the
  pre-059 delivery test suite passes unmodified (`ActivityProvider.delivery`,
  `deliveryPreferences`, `NotificationPreferencesPanel`).
- The feed append path is untouched: silenced entries persist and count unread.
- The silent→app upgrade applies to exception matches ONLY; profiles never
  upgrade normal delivery.
- A schedule can never be saved enabled with zero days.

Tests: `src/test/notificationProfiles.test.js`,
`ActivityProvider.profiles.test.jsx`, `ProfileWizard.test.jsx`,
`NotificationProfilesPanel.test.jsx`, `ProfileQuickAccess.test.jsx`.
Spec: `specs/059-notification-profiles/`.
