# Perps position management — visual review record (actor-critic loop)

Captured by `scripts/ui/capture-perps.mjs` (group `manage`) against a stubbed gateway AND a stubbed
JSON-RPC chain — no live venue, no network. Desktop 1280×900, mobile 390×844, deviceScaleFactor 2.

The dev server must carry the feature flag for this group, and the script refuses to shoot without
it (a management screenshot filed as the read-only surface is a claim that is not true):

```
VITE_RELAYER_URL=http://127.0.0.1:9797 VITE_PERPS_MANAGE_ENABLED=true \
  npm run dev --workspace frontend -- --port 5199
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-perps.mjs http://127.0.0.1:5199 manage
```

The fixture is one member: a 0.37 ETH long at 12.4× on Gains (Arbitrum), a BTC short on Gains
(Polygon), a read-only Hyperliquid short, a $3,284.51 GMX short read from GMX's own Reader, and two
orders the venue is still holding — one past its timeout, one inside the window. Every field comes
from the current producer shape in `services/relay-gateway/src/perps/normalize.js`; a field the
producer does not emit (a Gains P&L, a liquidation price) renders "—", and that dash is part of
what is under review.

| File | State |
|---|---|
| `perps-manage-positions-{desktop,mobile}-{light,dark}.png` | The whole view with management available: pair rows carry `Open` where this build can build an order, positions carry `Close or protect`, Hyperliquid is link-out only with the per-venue sentence. Full page. |
| `perps-position-sheet-close-{desktop,mobile}-{light,dark}.png` | PositionSheet on the GMX position, close view: "All of it" pre-selected, the FairWins fee on the position's SIZE, and GMX's keeper fee as its own line in ETH with the refund explained. Entry, leverage and P&L carry the `calculated` tag — GMX reports none of them, and the paragraph beneath says so and says what a calculated P&L leaves out. Liquidation price stays "—" with the reason and a pointer to GMX's own app. |
| `perps-position-sheet-reduce-desktop-{light,dark}.png` | Same sheet on the Gains long at 25%: the button renames itself and Gains' "we lower the size, your collateral stays in" note appears. |
| `perps-position-sheet-protect-desktop-{light,dark}.png` | The protect view: stop-loss / take-profit pre-filled from `suggestProtection` (the venue holds no levels for this trade), each with its estimated impact, plus the honest note that the liquidation bound could not be confirmed. |
| `perps-open-sheet-{desktop,mobile}-{light,dark}.png` | OpenPositionSheet as it arrives: venue, direction, collateral and leverage already chosen, each with the reason beside it. The amount is the one field a member fills. |
| `perps-open-sheet-preview-desktop-{light,dark}.png` | The same sheet at "What you would be holding" — every figure labelled estimated. |
| `perps-attestation-desktop-{light,dark}.png` | PerpsAttestation un-acknowledged, inside the open sheet: four discrete statements, none pre-ticked, confirm disabled, and the line stating it is not needed to close or recover. |
| `perps-pending-orders-stuck-{desktop,mobile}-{light,dark}.png` | The stuck-order surface, framed on its own: the timed-out order stated as OUR observation (the venue emitted nothing — a timeout is derived from block height, so it carries no "Gains said:" attribution and no verbatim/monospace treatment), "Needs your attention", `Recover your collateral`, and beneath it the calm order still inside its window with its block countdown. A venue-stated reason — a decoded Gains `CancelReason`, GMX's own error name — is the case that keeps the attributed, quoted treatment; the two must not look alike. |

One thing is hidden for the shots and nothing else is: the spec-031 activity poller reads FairWins'
own contracts on every cohort chain, which this harness does not stand up, so it raises a
"Couldn't refresh some activity" toast over the top-right corner. It is an artifact of the fixture,
not of the surface. Every perps refusal renders inline, so no perps state can be suppressed by it.

## Critic findings

Four defects the screenshots caught that 898 passing tests did not. The first two were material
enough to be worth the whole exercise; all four are fixed, and these shots are the re-capture.

1. **A GMX position showed six dashes** — entry, leverage, liquidation, P&L, estimated proceeds and
   GMX's own fees were all "—", so a member closing a leveraged position decided with almost
   nothing. Not a fixture artifact: `usePerpsPositions#toGmxPosition` hardcoded four fields to
   `null` while preserving the raw `Position.Props` that contains what three of them need. Now
   derived at the composition point (`lib/perps/gmxDerived.js`), each tagged `calculated`, refusing
   rather than guessing when a scale is unknown. Liquidation price is still `null` — it needs
   GMX's minimum-collateral rule and accrued borrowing/funding — but now says so.
2. **A timeout was attributed to the venue.** The surface read `Gains said: Gains did not execute
   this order within its timeout window.` The venue said nothing at all: a timeout is our inference
   from block height. The reason was manufactured by us but tagged with the venue as its source, so
   the component faithfully rendered it as a quotation — on the one surface a member reads when
   their collateral is stuck. Fixed at the source, with `isVenueStatedReason` keeping the quoted
   treatment for text a venue actually produced.
3. **Float noise in an input.** The suggested stop-loss pre-filled `4011.69153226` while the helper
   line beneath it said "At 4,011.7" — the same number, twice, disagreeing. Precision now scales
   with magnitude, and a rounded suggestion is re-validated so tidying can never hand a member a
   pre-fill the sheet then refuses.
4. **Self-contradicting copy.** "These are suggestions worked out from this position's own
   liquidation price" sat directly above "The liquidation price for this position could not be
   read." `suggestProtection` falls back to leverage when the venue reports no liquidation price,
   so the sentence now names the basis actually used.

Findings 3 and 4 were mutation-tested: reverting each fix fails the test written for it.
