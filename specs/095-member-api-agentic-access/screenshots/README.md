# Spec 095 — actor-critic screenshot validation

Real screenshots of the four spec-095 member surfaces, captured with
`scripts/ui/capture-agentic-access.mjs` and critiqued against the
`actor-critic-screens` checklist (Legible / Functional / Honest / Composed / Complete).

**14 scenarios × {1280×900 desktop, 390×844 mobile} × {light, dark} = 56 PNGs.**

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-agentic-access.mjs
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-agentic-access.mjs --serve  # hold the harness up to measure something
```

## What is real in these shots, and what is posed

Real, because it is what is under review: the four components
(`ApiAccessPanel`, `AssistantPreferencesPanel`, `AssistantLauncher`, `AssistantPanel`),
their CSS, the `AccordionSection` / `ActionSheet` shells they sit in, the theme tokens, the
real `SectionIconNav` the launcher **measures** itself against, and the real
`apiKeys` / `tokenCodec` / `assistantClient` / `memoryStore` libraries.

Posed, at the app's own seams, via throwaway vite aliases written on start and deleted in a
`finally`:

| Seam | Why |
|---|---|
| `hooks/useWalletManagement` | a fixed account, and a signer whose `signTypedData` is bridged to Node and answered with a **real** ethers EIP-712 signature — the `fw1.…` token in `api-reveal` is one the gateway would actually accept |
| `hooks/useRoleDetails` | the only way to pose the three membership states the card is built around: pending (`null`), unreadable (`readable: false`), active |
| the gateway | a loopback HTTP server reached through the real `VITE_RELAYER_URL`, so `assistantClient` runs unmodified and its states come from real responses (200 reply / destroyed socket / 503 `assistant_unconfigured`) |

Storage is seeded through the keys the app actually reads (`fw_user_<addr>_assistant_prefs`,
`…_assistant_memory_v1`, `…_api_access_keys`), in `addInitScript` before the app boots. Every
non-loopback request is aborted, so no shot can quietly depend on the internet.

Two things in the frames are harness scaffolding and are labelled as such on screen: the
`/home` route's three "Scaffolding row" cards (a screen that HAS a bottom nav, so the launcher
can be photographed tethered to a real one), and the `FAIRWINS_API_URL: "http://127.0.0.1:9799"`
inside the MCP snippet — that is the stub gateway this build was pointed at, not a shipped default.

## Shot list

| Scenario | Shows |
|---|---|
| `api-checking` | membership read in flight — the third state, never rendered as a denial |
| `api-upgrade` | not a member: what keys are for, and the route to membership |
| `api-unreadable` | the reference chain would not answer — stated as a network problem, with a live retry |
| `api-console` | the working console: create form, and three keys (active / expired / revoked) |
| `api-reveal` | the one-time reveal of a real signed `fw1` token, shown once and never stored |
| `api-snippet` | the MCP setup snippet expanded — the wide code block scrolls inside its own container |
| `prefs-off` | default OFF: both switches, the disclosure, "Nothing stored on this device" |
| `prefs-on` | on, with a live memory count beside Clear |
| `launcher-with-nav` | tethered 8px above the real `SectionIconNav` (mobile) |
| `launcher-no-nav` | Settings has no bottom nav — base offset plus the safe-area inset |
| `panel-authorize` | what the signature is for, stated before it is asked for |
| `panel-thread` | a live reply from the gateway: link chips and the per-reply disclaimer |
| `panel-unreachable` | transport failure named as unreachable, with a retry — never an invented answer |
| `panel-unconfigured` | 503 `assistant_unconfigured`: off on this gateway, so no retry is offered |

## Round 1 — 7 app findings, 1 harness finding

**F1 · the short key id read as a disabled text input.**
`.api-access__key-id` declared `display: inline-block`, but it is a flex item of a column-flex
parent whose default `align-items: stretch` made a 16-character id span the whole card. The
declaration was asking for something the layout never granted.
→ `frontend/src/components/account/ApiAccessPanel.css:146` (`align-self: flex-start` + `max-width`).

**F2 · the scope checkboxes were the browser's blue.**
The one colour on this card that no token chose, off-palette in both themes. Every other
checkbox-bearing settings panel (Home, Navigation, Notification profiles) already sets the fix.
→ `frontend/src/components/account/ApiAccessPanel.css:81` (`accent-color: var(--brand-primary)`).

**F3 · two button widths in one card.**
`Try again`, `Go to Membership`, `Create key`, `Show setup snippet` and `Copy snippet` stretched
edge to edge (direct children of a column-flex block) while `Revoke`, `Remove from list` and
`Copy key` hugged their labels (inside the `.api-access__actions` row) — with no rule a reader
could state. Every button now hugs; the row opts back out.
→ `frontend/src/components/account/ApiAccessPanel.css:271` and `:287`.

**F4 · the composer was the only control not set in the brand face.**
`index.css` gives `button` `font-family: inherit` but not `textarea`, so the chat composer fell
back to the UA's monospace default. Inheriting is what makes the brand sans apply — this is not a
restated face.
→ `frontend/src/components/assistant/AssistantPanel.css:163`.

**F5 · the thread's right-alignment had no visible effect.**
`.assistant-panel__message--user { align-items: flex-end }` did nothing for any message longer
than a few words, because the bubble was free to fill the row — so the two speakers were told
apart by colour alone. Capping the bubble is what makes the alignment mean something.
→ `frontend/src/components/assistant/AssistantPanel.css:71` (`max-width: 88%`).

**F6 · the terminal error box sat bottom-heavy.**
`unset` / `unconfigured` render no retry button, so the last paragraph's bottom margin had nothing
under it.
→ `frontend/src/components/assistant/AssistantPanel.css:139` (`p:last-child` reset).

**F7 · the terminal states stated a fact and offered no next step.**
"The assistant is not enabled on this gateway." over a still-live composer reads as "try again
anyway". The panel now says what the situation is — nothing on the member's side is wrong, and
sending again will get the same answer — matching the `quota` hint idiom already there.
→ `frontend/src/components/assistant/AssistantPanel.jsx:259`.

**H1 (harness) · the scenarios were not isolated from each other.**
One browser context per (theme, viewport) was reused for all 14 shots, so the retained
conversation — which is `localStorage`, and is the whole point of the memory preference — leaked
forward: `panel-unreachable` photographed the previous scenario's thread and `panel-unconfigured`
asked its question twice. A scenario that inherits the last one's storage is not the scenario it
is named after.
→ fresh context per shot, `scripts/ui/capture-agentic-access.mjs`.

## Round 2 — 1 harness finding, no new app findings

All seven app fixes held in all four cells. One new finding, and it was the harness lying about
the app:

**H2 (harness) · a capture artifact that looked exactly like a layout bug.**
`prefs-off-mobile-*` came back with its last line ("Read the Privacy Policy") sliced in half and a
band of page background beneath it. Probing the live DOM (`--serve`, added for this) showed the
link sitting **32px clear** of the card's own bottom edge, the card's `scrollHeight` equal to its
`clientHeight`, and no clipping ancestor: an element that overhangs the fold by a few dozen pixels
comes back with those pixels painted as background. The harness now scrolls the target fully into
the viewport before an element screenshot, so a reviewer never has to recognise the artifact.
→ `scripts/ui/capture-agentic-access.mjs`, plus a `SIGTERM` handler on `--serve` (an uncaught
signal skipped the `finally` and left the throwaway files and an orphaned vite behind).

## Round 3 — clean

Full 56-shot re-capture. No findings. Scoped suites green afterwards
(`ApiAccessPanel`, `AssistantPreferencesPanel`, `AssistantLauncher`, and all four
`src/test/brand/` guards — 95 tests).

## Deliberately not photographed

* **The passkey signing path** for a grant (`resolveGrantSigner` kind `passkey`). It runs a
  WebAuthn ceremony against a real authenticator and an on-chain account deployment; a posed
  version would photograph a ceremony that cannot occur. The classic path shown here renders the
  same panel — only the wallet prompt differs, and that prompt is not ours.
* **"This build has no FairWins API gateway configured"** inside the console
  (`VITE_RELAYER_URL` unset). One `api-access__notice--info` paragraph in the same tone as the
  notices already photographed; posing it means a second dev server for one paragraph.
* **The quota state** (HTTP 429 with `Retry-After`). Its layout is the error box already
  photographed in `panel-unreachable` plus one hint line, which `panel-unconfigured` also shows.
* **A revocation round trip.** The signature and the local note are photographable, but the
  honest part of that surface is the *sentence the gateway's answer produces* — and the three
  variants (durable, in-process only, not registered) differ in text alone, inside the
  `api-access__notice` box `panel-unreachable` and `api-console` already show in both themes.

## Known and accepted

* **The composer stays enabled in `panel-unconfigured`.** The hint added in F7 says plainly that
  sending again will get the same answer; disabling the field would be a behaviour change beyond
  what these shots justify, and would hide the member's own draft.
* **Links are colour-only** (`index.css` sets `a { text-decoration: inherit }` app-wide). Visible
  in `prefs-off` / `prefs-on` on "Read the Privacy Policy" — an app-wide decision, not a spec-095
  regression, and outside these files.
* **On desktop there is no bottom nav to tether to**, so `launcher-with-nav-desktop-*` and
  `launcher-no-nav-desktop-*` show the same 16px anchoring. That is the correct behaviour, not a
  duplicate shot: `useBottomNavOffset` reports `navPresent: false` because `SectionIconNav` is
  mobile-only.
