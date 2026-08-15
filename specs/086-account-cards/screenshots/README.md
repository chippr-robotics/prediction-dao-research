# Account cards — screenshot record (spec 086)

Captured by `scripts/ui/capture-account-cards.mjs`: the real My Account surface with legacy +
hardware + vault accounts seeded through the app's own device stores, loopback-isolated.
3 scenarios × {desktop 1280×900, mobile 390×844} × {light, dark} = 12 shots.

| shot | what it shows |
|---|---|
| `cards-default` | The carousel with no cosmetics: glass chrome, kind tags, defaults everywhere (FR-010) |
| `cards-customized` | Full page: member picture on the personal card AND the header avatar; tints + patterns on the other kinds |
| `customize-sheet` | The one Customize surface: live preview, picture controls, shade + pattern swatches, reset |

## Actor-critic findings (what the loop changed)

**Round 1 → fix.** The posed profile picture (pale silhouette on a soft gradient) washed out at
24px in the light header — a working feature photographed as an EMPTY avatar button. The fix was
to the harness fixture, not the app (the image pipeline was fine), but the lesson is the critic
checklist's rule 2 verbatim: a shot must show the surface *working*, and a fixture that is wrong
in the same direction as a plausible bug is worse than no shot.

**Round 2.** Clean in both themes and both viewports: the custom picture reads unmistakably in
the header button and on the card (the identity cue that replaces the removed operating-as
banner), tints render as soft glass washes with legible text, patterns stay subtle at card scale,
and the sheet's swatches show their real shades/drawings with a clear selected state.

**Not photographed, deliberately:** acting as a recovered/hardware account with the banner absent
— reaching those identities honestly needs a real unlock/device ceremony. The banner's removal is
code-level (the component no longer exists) and covered by the updated test suite.
