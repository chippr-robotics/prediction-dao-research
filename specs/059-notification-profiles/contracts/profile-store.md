# Contract: notificationProfiles module + delivery gate

**Feature**: 059-notification-profiles
**Module**: `frontend/src/lib/notifications/notificationProfiles.js`
**Consumers**: `ActivityProvider.jsx` (gate), `useNotificationProfiles.js`
(UI binding), profile components, tests.

This is a UI-application internal contract (no external API). Shapes are
defined in [data-model.md](../data-model.md).

## Constants

```js
export const PROFILE_EMOJI_PRESETS  // [{ name: 'Work', emoji: '💪' }, Sleep 😴, Driving 🚗, Downtime 😊, Focus 💡]
export const DEADLINE_REMINDER_TYPES // ['warn-acceptance', 'warn-resolution']
export const MAX_PROFILE_NAME_LENGTH // 32
export const DEFAULT_SCHEDULE       // { enabled: false, start: '09:00', end: '17:00', days: [] }
```

## Store CRUD (all synchronous, never throw)

| Function | Signature | Behavior |
|----------|-----------|----------|
| `getProfiles` | `() => NotificationProfile[]` | Normalized list; `[]` on missing/corrupt storage. |
| `getProfile` | `(id) => NotificationProfile \| null` | |
| `createProfile` | `(input) => NotificationProfile` | `input: { name, emoji?, allowedDomains?, allowActionRequired?, allowDeadlineReminders?, schedule? }`. Trims/validates name (1–32 chars — returns `null` on invalid), fills defaults (exceptions `true`, `allowedDomains: []`, `schedule: null`), generates `id`, persists, notifies listeners. |
| `updateProfile` | `(id, patch) => NotificationProfile \| null` | Shallow-merges validated fields; bumps `updatedAt`; `null` if id unknown or patch invalid. |
| `deleteProfile` | `(id) => void` | Removes profile; prunes an `override` referencing it; notifies. |
| `subscribe` | `(listener) => unsubscribe` | Same semantics as `deliveryPreferences.subscribe`. Fires after any persisted change (CRUD + activation). |

## Activation

| Function | Signature | Behavior |
|----------|-----------|----------|
| `enableProfile` | `(id, { until } = {}) => void` | Sets `override = { kind: 'enabled', profileId: id, until: until ?? null, at: now }` (replaces any prior override — FR-008). No-op for unknown id. |
| `disableActiveProfile` | `(nowMs?) => void` | If a profile is active: scheduled ⇒ `{ kind: 'disabled', … }` suppressing the current window; manual ⇒ clears the override. No-op when nothing active. |
| `getActiveStatus` | `(nowMs?) => ActiveProfileStatus` | Pure lazy evaluation per data-model; prunes expired overrides as a side effect (persist + notify only when something actually changed). |
| `getNextScheduleEnd` | `(profile, nowMs?) => number \| null` | ms timestamp of the profile's current/next window end — feeds the "Until 5:00 PM" manual option and status line; `null` when no enabled schedule. |

## Delivery gate

| Function | Signature | Behavior |
|----------|-----------|----------|
| `resolveEntryDelivery` | `(entry, nowMs?) => 'push' \| 'app' \| 'silent'` | Per data-model §Entry delivery. MUST return exactly `resolveDelivery(entry.domain \|\| 'wagers')` when no profile is active (SC-005). Never throws (corrupt storage ⇒ no active profile). |

### ActivityProvider integration (behavioral contract)

- `poll()` continues to append **all** fresh entries to the feed before any
  delivery decision (FR-009).
- The toastable filter becomes `resolveEntryDelivery(e) !== 'silent'`; the
  pushable filter becomes `resolveEntryDelivery(e) === 'push'`. Toast cap,
  "+N more" overflow, catch-up (first-poll) suppression, and push→app
  degradation via the base layer are unchanged.

## Guarantees

1. **No-profile parity (SC-005)**: with `fairwins_notif_profiles_v1` absent,
   every exported read returns empty/inactive defaults and
   `resolveEntryDelivery ≡ resolveDelivery` — the existing delivery test
   suite passes without behavioral edits.
2. **Never-throw storage**: read/write failures degrade exactly like
   `deliveryPreferences.js` (session-only state, listeners still fire).
3. **Single active profile**: no sequence of calls can yield two active
   profiles (`override` is a single record, wholesale-replaced).
4. **Lazy correctness**: `getActiveStatus`/`resolveEntryDelivery` are correct
   at any call time without any timer having fired (app-closed-at-boundary
   edge case).
5. **Feed integrity**: the module never touches the activity store, unread
   counts, or entry contents.

## Hook contract — `useNotificationProfiles()`

```js
{
  profiles,            // NotificationProfile[]
  activeStatus,        // ActiveProfileStatus (re-evaluated on store change + 30 s tick)
  createProfile, updateProfile, deleteProfile,
  enableProfile,       // (id, { until }) — callers build `until` via getNextScheduleEnd / +1 h
  disableActiveProfile,
}
```

Re-render triggers: store `subscribe` events and a 30-second interval tick
(status display only). Unmount cleans both.
