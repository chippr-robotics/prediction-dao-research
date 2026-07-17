# Data Model: Notification Profiles

**Feature**: 059-notification-profiles | **Date**: 2026-07-17

All data is device-scoped, stored under one new localStorage key:

```
Key:   fairwins_notif_profiles_v1
Value: ProfilesStore (plain JSON)
```

## ProfilesStore

| Field      | Type                   | Rules |
|------------|------------------------|-------|
| `version`  | `1`                    | Bump on breaking shape change. Unknown/absent version or non-object payload ⇒ treat as empty store (never crash). |
| `profiles` | `NotificationProfile[]`| Order = creation order (render order). May be empty. |
| `override` | `ActivationOverride \| null` | At most one; pruned lazily when expired/stale. |

Normalization on every read (mirrors `getNotificationPrefs()`): coerce bad
fields to defaults, drop profiles without a valid `id`/`name`, drop `override`
referencing a missing profile.

## NotificationProfile

| Field                    | Type              | Rules |
|--------------------------|-------------------|-------|
| `id`                     | `string`          | Required, unique, opaque (`p_<timestamp>_<rand>`). Identity — names may duplicate. |
| `name`                   | `string`          | Required, 1–32 chars after trim. |
| `emoji`                  | `string \| null`  | Optional single emoji; `null` ⇒ neutral default icon. |
| `allowedDomains`         | `string[]`        | Subset of the six known domains (`wagers`, `pools`, `membership`, `dao`, `token`, `custody`); unknown entries dropped on read. Empty = full DND (valid). |
| `allowActionRequired`    | `boolean`         | Default `true`. Exception: entries with `actionable === true` break through. |
| `allowDeadlineReminders` | `boolean`         | Default `true`. Exception: entries with `type ∈ DEADLINE_REMINDER_TYPES` break through. |
| `schedule`               | `ProfileSchedule \| null` | `null` ⇒ manual-only profile. |
| `createdAt` / `updatedAt`| `number` (ms)     | Bookkeeping only. |

`DEADLINE_REMINDER_TYPES = ['warn-acceptance', 'warn-resolution']`
(the types emitted by `data/notifications/deadlineWarnings.js`), exported as a
constant so gate + tests share one source of truth.

## ProfileSchedule

| Field     | Type       | Rules |
|-----------|------------|-------|
| `enabled` | `boolean`  | Cannot be saved `true` with `days` empty (UI blocks; store normalizes to `enabled: false`). |
| `start`   | `'HH:MM'`  | 24-h device-local wall time. Default `'09:00'`. |
| `end`     | `'HH:MM'`  | Default `'17:00'`. `end <= start` ⇒ window crosses midnight into the next day. |
| `days`    | `number[]` | 0 = Sunday … 6 = Saturday; the day a window **starts**. Default `[]`. |

**Window semantics**: for each selected day `d`, the window is
`[d start, d start + duration)` where `duration = end - start` (mod 24 h,
overnight when `end <= start`). A Mon 21:00–07:00 schedule covers Tue 00:00–07:00
only via Monday's selection.

## ActivationOverride

Discriminated union on `kind`:

| Variant | Fields | Meaning |
|---------|--------|---------|
| `enabled`  | `profileId: string`, `until: number \| null` (ms), `at: number` | Manual on. `until = null` ⇒ indefinite (until turned off / another profile enabled). `until` set from "For 1 hour" (`now + 3600e3`) or "Until <schedule end>" (next end boundary). Expired (`until <= now`) ⇒ pruned on read, schedule evaluation resumes. |
| `disabled` | `profileId: string`, `at: number` | Manual off during that profile's scheduled window. Suppresses only that window; pruned once the window containing `at` ends (profile reactivates at next scheduled start). If the profile wasn't in a window (indefinite-enable turned off), pruned immediately — recorded uniformly for simplicity. |

Invariant: enabling any profile **replaces** the override wholesale ⇒ at most
one profile can ever be active (FR-008).

## Derived (never stored)

### ActiveProfileStatus — `getActiveStatus(nowMs)`

```
{ profile: NotificationProfile | null,
  source: 'manual' | 'schedule' | null,
  until: number | null }   // ms when it will turn off, if known
```

Evaluation order:
1. `override.kind === 'enabled'` and (`until` null or `> now`) ⇒ that profile,
   `source: 'manual'`, `until` = override.until ?? (profile's current window
   end if inside one, else null).
2. Else, among profiles with `schedule.enabled` whose window contains `now`
   (excluding one suppressed by a live `disabled` override), the one with the
   most recent window start ⇒ `source: 'schedule'`, `until` = window end.
3. Else `{ profile: null, source: null, until: null }`.

### Entry delivery — `resolveEntryDelivery(entry, nowMs?)`

```
'push' | 'app' | 'silent'
```

1. No active profile ⇒ `resolveDelivery(entry.domain || 'wagers')` (today's
   behavior, bit-identical).
2. Active + domain ∈ `allowedDomains` ⇒ `resolveDelivery(domain)`.
3. Active + exception match (`allowActionRequired && entry.actionable`, or
   `allowDeadlineReminders && DEADLINE_REMINDER_TYPES.includes(entry.type)`)
   ⇒ `resolveDelivery(domain)`, upgraded `'silent'` → `'app'` (FR-010
   carve-out; exception matches only).
4. Otherwise ⇒ `'silent'` (feed-only).

## Relationships

```
ProfilesStore 1 ── * NotificationProfile 1 ── 0..1 ProfileSchedule
       │ 0..1
       └── ActivationOverride ── references ── NotificationProfile.id
ActiveProfileStatus  = f(ProfilesStore, now)          [derived]
resolveEntryDelivery = f(ActiveProfileStatus, entry,
                         deliveryPreferences base layer)  [derived]
```

Base-layer stores (`fairwins_notif_delivery_v1`, activity store) are
**unchanged** — profiles reference domains by the same keys but own no copy of
mode data.

## State transitions

```
(no override, outside windows)  ──schedule start──▶  active (schedule)
active (schedule)  ──schedule end──▶  inactive
active (schedule)  ──user turns off──▶  override {disabled} → inactive until window ends
inactive           ──user enables (∞ | 1h | until-end)──▶  override {enabled} → active (manual)
active (manual)    ──until expires──▶  override pruned → re-evaluate schedules
active (any)       ──user enables other profile──▶  override {enabled, other} (old one off)
active (any)       ──profile deleted──▶  override pruned → inactive
```
