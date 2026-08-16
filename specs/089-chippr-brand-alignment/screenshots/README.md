# Actor-critic screen validation — Chippr brand alignment (spec 089)

**FR-023 / SC-003.** Real screenshots of the running app, critiqued against a written checklist,
fixed, and re-captured until a full round produced no findings.

- **Actor**: `scripts/ui/capture-brand.mjs`
- **Matrix**: 14 surfaces × {desktop 1280×900, mobile 390×844} × {light, dark} = **56 shots per round**
- **Rounds**: 4. Round 4 produced no findings.

Run it with:

```bash
npm run dev --workspace frontend -- --port 5199 --strictPort &
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-brand.mjs
```

## Why this harness walks the nav

The other `capture-*.mjs` harnesses photograph one surface in many states. A palette and type
change is the opposite shape — shallow per surface, but able to go wrong on any of them, and most
likely to go wrong on the one nobody thought to check. So this one walks the navigation instead of
drilling into a feature.

A swatch page would not have substituted. Rendering the tokens on a grid photographs the tokens,
which `tokenContrast.test.js` already checks by arithmetic and more reliably than a picture can.
Three of the four findings below were only visible on real surfaces, and two of them were invisible
to the audits by construction.

## Surfaces

| Surface | Why it is in the matrix |
|---|---|
| `landing` | First Chippr-palette surface anyone sees; carries the dark hero header override |
| `home` | Headings, the amount keypad, the primary CTA |
| `portfolio` | Balance rows, mono face on amounts and addresses |
| `transfer` | Form controls, inputs, the address field in mono |
| `earn` | Card grid and link colour |
| `trade` | Swap controls and the token picker |
| `protect` | Accordion sections — the surface whose buttons vanished into their own card in spec 085 |
| `recovery` | Status chips and destructive affordances |
| `account` | The spec-086 glass account cards and their tint palette on the new neutrals |
| `reporting` | Statement header and its primary control |
| `apps` | Mini-app catalog, including its degraded state |
| `nav-drawer` | Every section heading and row against the new surfaces |
| `settings` | Dense preference cards with Teal 100 icon tiles |
| `network` | Status chips, endpoint rows, links |

## Rounds

### Round 1 — 2 findings

**F1 · Dark warning chips failed AA on raised panels.**
`--warning-bg` was `rgba(242, 163, 60, 0.16)`. An alpha tint's contrast is a function of whatever
sits behind it, so the chip measured **5.89:1** over the page background — which is what the audit
modelled and passed — and **4.10:1** over `--bg-tertiary`, which is where Recovery actually renders
it. The audit was not wrong about its own question; it was asking a question with one background
when the answer had four.

*Fix*: all four status surfaces (`--success-bg` / `--warning-bg` / `--danger-bg` / `--info-bg`)
became **opaque**, so their contrast no longer depends on placement. `tokenContrast.test.js` gained
a test asserting they are opaque, which is a stronger invariant than enumerating surfaces.

**F2 · Green survived the palette sweep on the Network panel.**
The MAINNET chip and the capability chips rendered bright Tailwind green beside the teal. Root
cause was not a missed literal — it was `var(--color-success, #15803d)`, a reference to a token
**that was never defined**, so the fallback was the live value. Auditing the whole tree found
**177 such references across 90 names**, `--color-primary` alone used **109 times**, falling back
to assorted greens, violets and greys.

This defeated every existing guard by construction: the codemod removes literals, but here the
literal *was* the value; the legacy-colour scanner only knows the retired brand hues; and the
contrast audit reads tokens, and these were not tokens.

*Fixes*:
- Defined the shadow vocabulary in `theme.css` as a compatibility alias block, repointing all 177
  references at the palette at once.
- Added **`noUndefinedTokens.test.js`**, which fails on the 178th.
- Generalised the codemod's dead-fallback dropper: once a token is defined, any colour literal in
  its `var()` fallback is unreachable, so removing it cannot change a pixel — and leaving it is how
  off-palette colour hides.
- Added the status `rgba()` triples to the codemod's mapping table; **38 bright green tint
  surfaces** were invisible to a hex scan and survived round 1. A tint is as much a brand colour as
  a fill.
- MAINNET is a *classification*, not a status, so it took the brand tint rather than green. Testnet
  keeps amber, which genuinely is a signal.

### Round 2 — 1 finding

**F3 · "＋ New statement" rendered its label outside its own pill.**

Pre-existing, and confirmed as such: the rule is on `main` and neither `Reporting.css` nor
`TaxReportsPanel.jsx` was touched by this change. `index.css` resets padding on
`button:has(> svg:only-child)` so fixed-size icon buttons do not collapse — but `:only-child`
counts **element** children only, so `<button><svg/>Label</button>` matches too. The comment above
the rule claimed it left text buttons alone; the selector could not.

### Round 3 — 1 finding (a regression from the round-2 fix)

**F4 · Six icon-only controls collapsed to empty squares.**

The round-2 fix lowered the rule's specificity with `:where()`. That let component classes win —
which fixed the statement button and reintroduced the exact bug the rule existed to prevent, on the
bell, the keypad keys, the scan buttons, the infotip and the drawer toggle. Caught on
`landing-mobile-light`.

*Fix*: measured the real scope across ten routes instead of guessing — **exactly one** icon+text
button exists app-wide, against six icon-only classes that set their own padding. So the strong
rule was restored and the single site fixed in the **markup**, by wrapping its label in a `<span>`
so the svg stops being an only child and the selector means what it says. Verified in both
directions: the statement button has its padding back, and the drawer toggle still renders its
18px icon inside a 32px control.

### Round 4 — clean

No findings. The 56 shots in this directory are from this round.

## States deliberately not photographed

Honesty about coverage, per the actor-critic checklist:

- **Portfolio's populated token list.** The rows render as skeleton loaders. The list needs a price
  feed and an indexer, and the harness aborts every non-loopback request on purpose — a shot that
  quietly depended on the internet would be worse than this one. The stub was extended to answer
  ERC-20 `balanceOf`/`decimals`/`symbol` so the reads it *can* satisfy are real, and the
  data-dense-row coverage this shot was meant to give is carried by Network, Earn, Settings and
  Recovery instead.
- **Apps shows its degraded state**, not a catalog: the mini-app registry is a real contract the
  stub does not implement. That is left in deliberately — it is a good photograph of an honest
  failure (FR-008/FR-009), and it says what is wrong rather than showing an empty catalog.
- **Connected-wallet-only flows behind a signature** (creating a vault, generating a statement).
  Reaching them needs a real signing session; the shots stop at the surfaces that lead into them.

## What the loop was worth

The contrast audit checks arithmetic and cannot see placement; the literal scanner checks text and
cannot see an undefined token; neither can see a control whose label falls outside it. Every
finding here came from looking at the rendered pixels, and two of them (F2, F3) were latent bugs
that predate this change.
