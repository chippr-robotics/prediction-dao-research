# Protect ▸ Verify — visual review record (actor-critic loop)

Captured by `scripts/ui/capture-verify.mjs` against a stubbed wallet and a stubbed chain (both
loopback; no network is reachable during a run), dev server at 1280×900 and 390×844,
deviceScaleFactor 2, light and dark.

The wallet stub's `personal_sign` is bridged to Node and answered with a **real** ethers signature
over the real message, and the fixtures come from `frontend/src/test/fixtures/signedMessages.js` —
the same module the vitest suites use. Every document in these shots actually verifies; none of
them is posed.

| File (× `{desktop,mobile}` × `{light,dark}`) | State |
|---|---|
| `verify-area-*` | The area itself, both sheets closed — the whole cost of Verify on the Protect page. |
| `verify-sign-ready-*` | Sign sheet with a message entered — signing identity, network, and the scheme note. |
| `verify-sign-signed-*` | Signed: the portable document and its two copy controls. |
| `verify-check-valid-*` | A document pasted into the signature box auto-fills every field; the wallet signature is confirmed. |
| `verify-check-invalid-*` | Definite negative — someone else signed it, and the chain confirms the claimed address holds no contract. |
| `verify-check-unverifiable-*` | The third state: the node is unreachable, so nothing is claimed about the signature. |
| `verify-check-bad-document-*` | An unreadable document: the error replaces the verdict, and Check is disabled while the parse error stands. |

**Not photographed, deliberately:** the withdrawn-signing state (`capability.canSign === false`).
All three of its causes need a session the harness cannot fabricate honestly — Protect itself sits
behind the connect gate, so "no wallet" never reaches the surface, and a vault or a locked
recovered identity needs a real Safe / a real unlocked key. The layout is one notice paragraph plus
the header's "Unavailable" chip; its three sentences are asserted in
`frontend/src/test/verify/VerifySection.test.jsx`.

## Critic findings, each fixed and re-verified by re-capture

**Round 1 — the surface**

1. **The address field wore a different label style from every other field.** `CustodyAddressField`
   brings Protect's `.custody-label` (larger, lighter); beside `.verify-label` in one form that
   reads as a rendering fault rather than a hierarchy. Restyled scoped to `.verify-form` in
   `Verify.css`, so the other Protect surfaces reading `Custody.css` are untouched.
2. **The "read a document" notice sat below the fields it had filled in.** Moved above them — an
   explanation that trails what it explains reads as an afterthought.
3. **`signedAt` was rendered as a raw ISO instant.** Now the member's own locale and time zone;
   an unparseable value is still shown verbatim, because it is what the document says.
4. **The method footnote was a grey tail on the verdict sentence**, which mid-paragraph reads as a
   colour bug. Moved to its own line.

**Round 2 — honesty of the states**

5. **A false claim in the footnote.** "Checked as a wallet signature — no network was needed" was
   also being shown on a negative reached through the no-code path, which *did* reach the chain to
   learn the address holds no contract. The footnote now renders only on a valid verdict.
6. **Addresses were clipped at 390px** in both the notice and the verdict body — and a clipped
   address is a wrong address. `overflow-wrap: anywhere` on both.
7. **Importing a document left both textareas scrolled to the end**, so the member being asked to
   confirm "this is the message you expected" was shown its last line. Scroll reset to the top on
   import.

**Round 3 — the layout itself**

Both forms inline made Protect roughly 3,000 px tall and pushed the vault sections far below the
fold. They moved into the shared `ActionSheet` (bottom sheet on mobile, centred card on desktop),
leaving the area as two entry rows — about 300 px. That change brought its own findings:

8. **The sheet's header scrolled away with the content**, taking the close button with it —
   `.action-sheet` scrolls as a whole. Fixed by pinning the header, opt-in through a new
   `className` prop on the shared sheet, so no other caller is affected.
9. **The verdict landed below the fold.** The member pressed Check and, as far as they could see,
   nothing happened. Both forms now scroll their result into view when it arrives (feature-detected
   — jsdom has no `scrollIntoView`).
10. **Row heading and button said the same words** ("Check a signature" twice, side by side). The
    visible label is now the verb alone; the full phrase stays the accessible name, since a screen
    reader hears the button out of the row's context.
11. **Preamble was crowding the answer out of a scrolling sheet.** The check form's lede is gone
    (the sheet title already says it) and two hints were shortened. The sign form's warning about
    what a signature does and does not prove was kept — it is not preamble.

**Round 4 — controls in dark theme**

12. **The disabled primary still read as pressable.** A 55%-opaque brand fill over a dark surface is
   still a solid green button; "Check signature" looked available with the form half-filled.
   Disabled now drops the fill and keeps only an outline.
13. **`Copy signature only` lost its border in dark theme** — `--border-color` is a near-black
   hairline there, so inside the tinted result block the button read as a caption. Its border now
   mixes toward the text colour and is visible on either ground.

## One harness bug the loop caught, worth recording

The first two rounds filed a screenshot of "Could not be checked" under the name `check-invalid`.
The stub chain answered a batched JSON-RPC request (an array) with a single object, so every read
failed — and because the app degrades honestly, the failure rendered as the *unverifiable* state,
which is a plausible-looking screenshot of the wrong thing. ethers v6 batches on every chain
outside `NO_BATCH_CHAIN_IDS` (61/63), and Polygon is not one of them.

A fixture that is wrong in the same direction as the honest degradation is the easiest kind to
miss: nothing looked broken. It is only visible by checking that each shot shows the state its
name claims.
