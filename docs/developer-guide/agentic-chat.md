# Agentic Assistant — opt-in, default off (spec 095)

An in-app assistant that helps a paid member find their way around FairWins and understand what a
surface is about to do. It is **off until the member turns it on**, its memory never leaves the
device, and it **never signs or submits anything**.

When it is off, no component mounts, no preference is read on the network, and nothing is sent
anywhere. That is not a configuration state — it is the default.

## Architecture

```
  frontend/src/components/assistant/
    AssistantLauncher   mounted in App.jsx AppLayout, after <AppNavDrawer />
      renders NOTHING unless   tenant feature 'assistant'  AND  wallet connected
                               AND  membership active-paid (READ)  AND  pref enabled
      tethered by useBottomNavOffset() — ResizeObserver over .section-icon-nav
      z-index 1300   (bottom nav 1200 < launcher < drawer backdrop 1400)
        │ open
        ▼
    AssistantPanel      bottom sheet (ActionSheet idiom), role="dialog"
      thread + input · replies in a POLITE live region · per-reply footer disclosure
        │
        ▼
  frontend/src/lib/assistant/
    assistantPrefs.js     assistant_prefs, wallet-scoped  NOT in syncedObjects
    memoryStore.js        assistant_memory_v1, bounded  NOT in syncedObjects, NOT backed up
    useBottomNavOffset.js ResizeObserver tether for the launcher
    replyLinks.js         renders suggested deep links as in-app links
    assistantClient.js    POST {relayerBaseUrl()}/v1/member/assistant/chat
                          bearer = a 24 h session grant held in MODULE MEMORY ONLY
        │
        ▼
  gateway  src/memberApi/  scope assistant:chat
        │  system prompt (server-side) · ≤20 messages · ≤4000 chars each · tighter quota
        ▼
  Anthropic Messages API      ANTHROPIC_API_KEY (secret) · ASSISTANT_MODEL · ASSISTANT_MAX_TOKENS
```

## Why it is shaped this way

**Opt-in, and the default is the honest one.** A member who never opens Settings has an app that
sends nothing to a model provider. Shipping this on-by-default would have quietly changed what
leaves every member's device, and would have made the privacy-policy amendment a description of
something they had already been doing. The preference toggle's summary line states the actual
state — "Off — nothing is sent" — rather than a label.

**Memory is local, bounded, and never backed up.** Conversation memory lives in wallet-scoped
`userStorage` under `assistant_memory_v1`, capped at the last 50 messages / 64 KB, with `clear()`
and `count()` behind a member-facing button that shows the entry count before it wipes. It is
**deliberately absent from `lib/backup/syncedObjects.js`** — the same decision the spec-069 RPC
credentials and the spec-081 nav preferences took, and for the same reason: a device-local
convenience that would become a durable, restorable record of what a member asked if it rode the
encrypted backup. A test asserts the absence.

**The session token is held in memory and nowhere else.** The assistant needs a bearer token, so
on first open after opt-in the panel asks the member to authorise a session: a short-lived
`ApiKeyGrant` (24 h, `assistant:chat` plus the read scopes) signed in their wallet. It is kept in a
module-scoped variable, cleared on disconnect and on account change, and **never persisted**. A
persisted assistant token would be a long-lived credential sitting in storage that the member never
sees again after granting it.

**The assistant is a guide, not an actor.** The server-side system prompt states the rules the
model must follow: never claim to have performed an action, never ask for a key or a seed phrase,
suggest in-app deep links rather than describing steps it cannot take, and state fees and risks
honestly. Every reply carries the footer *"AI-generated — verify before acting. The assistant never
signs or submits."* The disclosure is per reply, not per session, because a member scrolling back
through a thread reads a single message, not a banner they saw once.

**An unreachable service says so.** Gateway unset or unreachable renders "The assistant service is
not reachable" with a retry; `503 assistant_unconfigured` renders its own honest copy. **There is
no fallback reply.** An invented answer from a chat surface is worse than no answer, because the
member cannot tell which one they got.

**Nothing about a message is logged.** The audit event for a chat turn carries counts only —
message count and token usage. `audit/log.js` maintains `FORBIDDEN_KEYS` for precisely this class
of mistake; message content, and anything derived from it, never enters a log line, an audit field,
a URL, or an error message.

## The launcher

The floating button is `position: fixed` at z-index **1300**, between the bottom nav (1200) and the
drawer backdrop (1400), anchored right so the desktop 64 px `--app-nav-gutter-width` gutter does not
affect it.

Its `bottom` offset is safe-area **plus the measured height of `.section-icon-nav` + 8px when that
nav is present**, or 16px when it is not. The nav is not always mounted and carries no height token,
so the offset is measured with a `ResizeObserver` (`useBottomNavOffset`) and re-tethers when the nav
appears or disappears. A hardcoded offset would float the button over the nav on some routes and
leave it stranded in space on others.

Content-aware behaviour, all transitions ≤ 250 ms ease:

- slides down / fades on scroll-down; reappears on scroll-up or when scrolling stops;
- hides while the nav drawer is open, and while its own panel is open;
- `@media (prefers-reduced-motion: reduce)` disables motion entirely — opacity only.

**Gating is three-state, and two of the three states render nothing.** Membership `pending` renders
nothing (it is not yet known), and membership `unreadable` renders nothing — **never a denial
toast**. An RPC failure is not evidence that a member lacks a tier, and telling them they do not
qualify because a read failed is a fabricated fact.

## Panel and accessibility

- `role="dialog"`, labelled, backdrop at z-index 1500; on mobile it rises from the bottom with
  `padding-bottom` clearing the safe area, on desktop it is a centred card.
- Replies land in a **polite** live region. Never assertive: `assertive` is reserved for errors
  (`NotificationSystem.jsx`), and an assistant that interrupts a screen-reader user mid-sentence on
  every reply is hostile.
- Deep-link suggestions render as in-app links (`/wallet?tab=…`), never as raw URLs or instructions
  to "navigate to".
- v1 is request/response — nothing streams.
- All styling uses theme tokens; no colour is stated outside `theme.css` and no component restates
  a `font-family`.

## Preferences (Settings ▸ Assistant)

`AssistantPreferencesPanel`, accordion card id `assistant-prefs`:

- master enable toggle (**default off**);
- memory retention toggle;
- **Clear conversation memory**, showing the entry count;
- a plain-language disclosure of what leaves the device while it is enabled — messages go to the
  FairWins gateway and its model provider; memory stays on the device; nothing is sent while it is
  disabled — linking to `/privacy`.

Enabling and disabling the assistant are captured to the client activity ledger as durable events
under the **`access`** notification domain (`DOMAIN_META` + `NOTIFICATION_CATEGORIES`, "Programmatic
access"), alongside API keys created and revoked. Metadata only — never message content. A toast is
not a record: `showNotification` is single-slot and lossy, and a change to what leaves a member's
device is exactly the kind of thing they may need to look up later.

## Gateway endpoint

`POST /v1/member/assistant/chat`, scope `assistant:chat`.

| Variable | Default | Notes |
|---|---|---|
| `ASSISTANT_ENABLED` | `false` | Off ⇒ `503 assistant_unconfigured`. |
| `ANTHROPIC_API_KEY` | — | **Secret.** Missing ⇒ `503 assistant_unconfigured`. |
| `ASSISTANT_MODEL` | `claude-sonnet-5` | Model id. |
| `ASSISTANT_MAX_TOKENS` | `1024` | Output ceiling per turn. **Hard-capped at 4096 in code**; boot fails above it. |
| `ASSISTANT_QUOTA_PER_ACCOUNT` / `_GLOBAL` | `20` / `60` | Model **calls** per window — a tighter class than the module's reads. |
| `ASSISTANT_TOKEN_BUDGET_PER_ACCOUNT` / `_GLOBAL` / `_WINDOW_MS` | `200000` / `2000000` / `3600000` | Model **tokens** per window. The ceiling on money. |

Request `{ messages: [{ role: 'user' | 'assistant', content }], surface? }` — at most 20 messages,
each at most 4000 characters, else `400 bad_request`. Response
`{ reply, model, usage: { inputTokens, outputTokens } }`. Upstream failure ⇒ `503
assistant_unavailable`. The proxy uses `fetch` with an `AbortController` timeout.

**Three ceilings sit in front of the provider, and only one of them is about money.** The module's
general quota and the assistant's own tighter request class both count REQUESTS; the token budget
counts TOKENS, which is what is actually billed — two turns inside one window can differ by orders
of magnitude in cost, so a request count was never a spend ceiling. A turn RESERVES its worst case
(estimated input + `ASSISTANT_MAX_TOKENS`) before the call and SETTLES down to the measured usage
afterwards, so turns already in flight cannot overshoot between them. An exhausted budget answers
**`429 assistant_budget_exhausted`** with `Retry-After` — a distinct code from `quota_exceeded`, and
**never** a shortened reply: trimming `max_tokens` to whatever headroom remained would deliver a
truncated answer that reads as the assistant's own judgement about how much to say.

`ASSISTANT_ENABLED` is a **sub-config of the Member API module** — the assistant cannot be reached
while `MEMBER_API_ENABLED` is false, and the Member API killswitch takes the assistant with it.

## Invariants

- **Default off.** No preference, no mount, no request. The absence of a stored preference means
  disabled, not "unset — ask the server".
- **Nothing is sent while disabled.** There is no telemetry, no warm-up call, no prefetch.
- **Memory never leaves the device** and is never in `syncedObjects` (asserted by test).
- **The session token is memory-only**, scoped to the account, cleared on disconnect/account change.
- **The assistant never signs and never submits.** No signing code path exists in
  `lib/assistant/`; the disclosure on every reply is the member-facing statement of that fact.
- **Unreachable is never answered.** No fabricated reply, ever.
- **An exhausted budget is refused, never truncated.** And an unknown cost is never a zero cost: a
  turn the provider reported no counts for keeps its full reservation.
- **Message content is never logged, stored server-side, or placed in an audit field or URL.**
- **Membership `unreadable` renders nothing**, never a denial.
- **Replies are polite, never assertive.**

## Tests

- `frontend/src/test/assistant/` — prefs default-off, memory bounds and clear, syncedObjects
  absence, launcher gating matrix (including unreadable ⇒ nothing), offset tethering, panel honest
  states, reduced-motion, axe light + dark.
- Gateway: `services/relay-gateway/test/memberApi.test.js` — assistant config gate, body limits,
  upstream failure mapping, and that no handler writes message content to a log.
- E2E: `frontend/cypress/e2e/fast/` — opt-in, honest-unreachable, memory clear.

## Related

- [Member API](member-api.md) — the token and the endpoint.
- [Member API Operations](../runbooks/member-api-operations.md) — credential handling and rotation.
- [Assistant & API access](../user-guide/assistant-and-api.md) — the member-facing how-to.
- Privacy Policy §2 and §5 (in-app, `/privacy`) — the processing category and the model provider
  as a processor.
- Spec: `specs/095-member-api-agentic-access/`.
