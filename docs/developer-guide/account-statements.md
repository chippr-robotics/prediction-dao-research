# Account statements (issue #1026)

The **statement** is the PDF a member downloads from **My Account → Reporting**.
It is a banking-style record of a period's on-chain activity: a branded
masthead, the period's figures as tiles, two charts, movement by asset and by
activity type, a transaction register carrying complete transaction hashes,
failed operations kept visibly apart, and the disclosures.

It renders from the same `ActivityReport` the CSV export uses (spec 016, spec
051), so the two can never disagree. Nothing here reads the chain.

```
ActivityReport ──► buildStatementModel ──► renderStatement ──► Blob (application/pdf)
  (reportBuilder)      statement/model.js     statement/statementPdf.js
```

| File | Responsibility |
|------|----------------|
| `statement/theme.js` | Derives the palette from tenant brand tokens; **pure** |
| `statement/brand.js` | The only module that reads the tenant manifest |
| `statement/reportTypes.js` | Statement types (scopes) and section toggles |
| `statement/model.js` | Report → figures, series, rows, and disclosure counts |
| `statement/charts.js` | Vector charts drawn with jsPDF primitives |
| `statement/layout.js` | Masthead, headers, footers, tiles, notes, page breaks |
| `statement/statementPdf.js` | The document: sections, tables, entry point |
| `pdfReport.js` | App seam — resolves the tenant, delegates to the renderer |

## Branding a statement

A tenant brands the statement by editing `tenants/<id>/manifest.json`. Nothing
else. `brand.theme.base` supplies four tokens:

| Token | Used for |
|---|---|
| `--brand-primary` | Masthead band, section rules, accents, emphasis tile |
| `--semantic-win` | Money **in** — figures, bars, table columns |
| `--semantic-loss` | Money **out** |
| `--semantic-warning` | Attention notes and flagged cells |

Everything else is **derived**, and the derivation is the point. A tenant picks
a brand colour, not a background colour, so:

- the masthead band is darkened until its ink clears **7:1**, whatever hue it
  started as — a pale-yellow brand gets a dark olive band, not unreadable text;
- chart marks are stepped until they clear the **3:1** non-text floor on paper,
  because a mark nobody can see against white is decoration, not data.

`src/test/reports/statementTheme.test.js` asserts those floors for brands nobody
has designed against (pale yellow, near-white, mid grey, deep navy). That is the
guarantee a visual review cannot give you.

Money in / money out stay green/warm across every tenant: they are a **status**
reading, not a brand statement, and the same colour has to mean the same thing
on every statement the platform produces.

## Statement types and sections

A **type** narrows which activity classes are reported, so it changes the
totals. A **section** chooses how much of the same report is printed, so it
never changes a figure. Both are disclosed on the document:

- a scoped statement leads with **"This is a partial statement"** on page one,
  naming the scope and the number of entries excluded by it;
- a statement generated with sections switched off names them in the closing
  notes, and says the figures are unchanged.

Presets live in `reportTypes.js`: `full`, `wagers`, `earnings`, `transfers`,
`custom`. `classes: null` means *every* class — deliberately not a list, so a
class added by a future spec lands in the account statement automatically
instead of the default quietly becoming incomplete the day it ships.

## The rules this document is built on

These are the ones that have already gone wrong here. Changing any of them
changes what the statement claims.

1. **A scoped statement re-derives every total.** `buildStatementModel` runs
   `computeTotals` over the entries in scope; it never relabels the account-wide
   figure under a narrower heading.
2. **An out-of-scope figure is "Not covered", never `$0.00`.** A wagering
   statement does not know whether the member bridged, so it may not report that
   they did not.
3. **Bridged value is not "any neutral value".** A bridge between the member's
   own networks and a staking unstake request are both neither-in-nor-out, and
   they get separate columns. `computeTotals`' `overall.movedUsd` conflates them;
   the model re-derives the split from the entries.
4. **A fee nobody reported is `unknown`, never a dash.** A dash reads as zero.
5. **Every ASCII sign is deliberate.** jsPDF's standard fonts are WinAnsi. A
   typographic minus (U+2212) or an arrow does not fail — it renders as a
   *different character*, silently turning a negative figure into nonsense.
   `layout.js#sanitize` catches them, and every table cell passes through it.
   Never bypass `statementTable`.
6. **Both halves of the flow chart share one unit scale.** Each half is rounded
   up to a whole number of steps and the plot height is split in that ratio, so
   a bar cannot draw through the axis.
7. **A qualification sits above the figures it qualifies.** Testnet, scope and
   unreadable-category warnings are printed under the masthead — not in the
   closing notes, which a member reconciling the tiles never reaches.
8. **Pending is not settled.** It is counted and disclosed as pending; no caption
   calls the whole set settled.
9. **A class that could not be fully read is marked `(partial)` wherever it
   appears.** A page-one banner alone let a reader reconcile an incomplete row
   with no signal that it was incomplete.
10. **An unvalued entry reads "unvalued", never `$0.00` or a dash.** Same rule as
    the fee cell: "could not be valued" is a different claim from "there was
    none", and both `$0.00` and a dash assert the second one.
11. **Gas spent on a reverted transaction is counted and disclosed.**
    `computeTotals` skips failed entries wholesale, so their gas never reaches
    `overall.feesNative` — but a revert still burns gas, and that is real money
    out of the member's wallet. The model adds it back and the tile says so.

## The Reporting page

`TaxReportsPanel` is a statement **centre**, not a form: one primary action, the
statement you just made, and the ones you made before. Every choice lives in
`reporting/StatementSheet` — a bottom sheet that opens with a complete account
statement for the current month already selected, so the common case is open →
Generate → done.

The split between what is shown and what is folded away is not cosmetic:

- **Statement type is never hidden.** It narrows which activity is reported, so
  it changes the totals, and the sheet states the scope of the selected type and
  warns before generating when it narrows the statement.
- **Sections are folded behind a disclosure.** They change what is printed,
  never a figure.

`reporting/reportingIcons.js` is the one place that decides which glyph stands
for which type, section, class and period, resolved against the shared
`NavIcon` set. An icon is never the only label — every one is rendered beside
its text.

Three things that broke here and are worth not repeating:

1. **A sheet must import the `.asset-sheet-*` shell itself.** That CSS lives in
   `AssetDetailSheet.css` and is imported by that component alone; relying on
   another surface having mounted first left the sheet unstyled and unpositioned
   on a page that renders nothing else.
2. **Only use tokens that exist.** `--bg-tertiary` is not defined in
   `theme.css`, so every use fell back to a hardcoded light grey and rendered
   light-on-light in dark mode. Resting surfaces are a tint of `--text-primary`,
   which adapts to whichever theme is active.
3. **Brand tokens, not `--color-primary`.** The old page rendered its only
   button in the generic indigo on the one page that produces a *branded
   document*.

## Previewing a design change

The statement's layout cannot be asserted in a unit test. Render it and look:

```bash
node frontend/scripts/preview-statement.mjs /tmp/statements
python3 frontend/scripts/rasterize-preview.py /tmp/statements   # → PNGs
```

Nine scenarios, including the ones that break documents: a scoped statement, a
full year (monthly buckets), unreadable categories, an empty period, a testnet,
and a **second tenant brand** — which is how you check that a change did not
quietly hardcode the default palette. The fixture is deliberately awkward: an
entry with no date, an entry with no USD basis, an unreported platform fee, a
cross-chain bridge and a failed operation.

The preview loads the real renderer through Vite's SSR pipeline so
`virtual:tenant` resolves; it is not a reimplementation.

For the **page** rather than the document:

```bash
node frontend/scripts/shoot-reporting.mjs /tmp/shots
```

It starts the app's own dev server, mounts the real panel with fixture data
through the `hookOptions` seam the panel already exposes for tests, and drives
the pre-installed Chromium over CDP — no Playwright, because an incremental
`npm install` in this workspace risks the optional platform binaries
(`scripts/deps/reinstall.sh`). Nine states × two viewports, including dark mode,
the empty period and a failed generation.

It also **measures**: every run reports console errors, uncaught exceptions, and
any element extending past its container. A clipped control is invisible in a
screenshot you skim and obvious in a measurement — that check is what caught the
action button being cut in half by the panel's `overflow: clip`.

## Tests

| File | Covers |
|---|---|
| `statementTheme.test.js` | Contrast floors hold for adversarial brands |
| `statementModel.test.js` | Scope re-derivation, neutral/bridge split, disclosure counts |
| `statementPdf.test.js` | Renders every degenerate shape; file names never collide |
| `StatementSheet.test.jsx` | Smart defaults, scope warnings, period validation, modal behaviour |
| `TaxReportsPanel.test.jsx` | Generate → download → result card in one pass |
| `reportsAccessibility.test.jsx` | axe over the panel and the custom picker |
