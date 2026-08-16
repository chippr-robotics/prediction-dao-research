# Feature Specification: Chippr Brand Alignment for FairWins Styling Defaults

**Feature Branch**: `claude/fairwins-chippr-branding-doqie6`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Align the FairWins app's app-wide styling defaults with the Chippr Robotics Brand Guidelines v1.0: adopt the Chippr core color palette (Chippr Teal #2E7D8C, Gunmetal #1C333B, Cloud #F4F6F7, Teal 700 #1F5966, Teal 300 #6FAEBB, Teal 100 #D9E9EC, Steel #5E6B70, Amber #F2A33C as a signal-only color), the 60/30/10 usage ratio, the measured WCAG contrast pairings, and the brand typography system (Space Grotesk display, Inter text/UI, JetBrains Mono code) with the documented web hierarchy. The retired legacy green #2FA043 and the current FairWins green/blue defaults (#36B37E, #4C9AFF, #7BDCB5) must be replaced. The FairWins logo and brandmark (clover + check) stay independent of the Chippr robot brandmark and are NOT changed. Validate the result visually using the actor-critic screenshot methodology in both light and dark themes at mobile and desktop viewports."

## Context

Chippr Robotics published Brand Guidelines v1.0 (August 2026) establishing a master brand
identity and an **endorsement** brand architecture: products carry their own marks and
personalities, and the Chippr master brand endorses them ("A Chippr Robotics product")
without merging into product lockups.

FairWins is named in that document as the app-platform product brand. Its **mark** — the
clover + check — is defined as FairWins' own territory and is explicitly *not* to be paired
or composited with the Chippr robot brandmark. What the guidelines *do* govern across the
estate is the **color system, typography, and container language**.

Today the FairWins app ships a green/blue palette (`#36B37E` Winning Green, `#4C9AFF` Odds
Blue, `#7BDCB5` Momentum Mint) and no brand typeface — it renders in whatever `system-ui`
resolves to. Neither is consistent with the published guidelines. The green in particular
is a near neighbour of the **retired** legacy Chippr green, which the guidelines withdraw
from the estate.

This feature re-points FairWins' visual defaults onto the Chippr system while leaving the
FairWins mark untouched.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A member sees one coherent brand (Priority: P1)

A member opens the FairWins app. Every surface they touch — home, wallet, transfers,
wagers, settings, admin — reads in the Chippr color system: predominantly light Cloud/white
surfaces, teal for interactive and brand emphasis, Gunmetal for text and dark sections. No
screen still shows the retired green or the old odds blue. The FairWins clover mark still
appears exactly as before.

**Why this priority**: This is the feature. A palette change that lands on the token layer
but leaves most screens on hardcoded legacy colors is worse than not shipping — it produces
a half-rebranded app where teal and green sit side by side.

**Independent Test**: Navigate every top-level nav destination in both themes and confirm no
legacy brand hue appears and the FairWins mark is unchanged.

**Acceptance Scenarios**:

1. **Given** the app in light theme, **When** a member visits any top-level surface, **Then** interactive
   and brand-emphasis elements render in the Chippr teal family and no element renders in
   `#36B37E`, `#4C9AFF`, `#7BDCB5`, or `#2FA043`.
2. **Given** the app in dark theme, **When** a member visits the same surfaces, **Then** the same holds
   and every text/background pairing remains legible.
3. **Given** any surface showing the FairWins logo or brandmark, **When** it renders, **Then** the artwork
   is byte-identical to before this change.
4. **Given** a surface that previously used the accent green for a *success* meaning (a won wager, a
   confirmed transaction), **When** it renders, **Then** success is still visually distinguishable from
   ordinary brand emphasis — a member can tell "this succeeded" from "this is a button".

---

### User Story 2 — Type reads as Chippr (Priority: P1)

Headings render in the brand display face, body copy and interface text in the brand text
face, and addresses, hashes, and code in the brand mono face — at the sizes, weights, and
line-heights the guidelines specify.

**Why this priority**: The guidelines treat typography as half the identity. Palette alone
on system fonts still reads as a generic app.

**Independent Test**: Load any page and confirm the three font families are actually applied
and applied to the right roles.

**Acceptance Scenarios**:

1. **Given** any page, **When** a heading renders, **Then** it uses the display face at the guideline
   size/weight for its level.
2. **Given** any page, **When** body or control text renders, **Then** it uses the text face.
3. **Given** a surface showing an address, hash, or transaction id, **When** it renders, **Then** it uses
   the mono face.
4. **Given** the brand fonts fail to load (offline, blocked, or slow network), **When** a page renders,
   **Then** text is still fully legible in a fallback face and layout does not break.

---

### User Story 3 — Signal colors stay honest (Priority: P1)

Amber is used only where the guidelines permit it: alerts, live states, and at most one
call-to-action per view. It never fills a large area. Destructive and error states stay
unmistakably distinct from warnings and from brand emphasis.

**Why this priority**: This app moves money. A member misreading a destructive confirmation
as an ordinary action, or a degraded-data banner as normal content, is a financial harm —
not a cosmetic one. Constitution principle III (honest state) reaches the color layer.

**Independent Test**: Enumerate every warning, error, degraded, and destructive surface and
confirm each is distinguishable from the others and from brand emphasis.

**Acceptance Scenarios**:

1. **Given** a degraded-data or stale-data banner, **When** it renders, **Then** it is visually marked as a
   warning and is not mistakable for ordinary content.
2. **Given** a destructive confirmation, **When** it renders, **Then** its confirm control is distinguishable
   from a non-destructive primary control at a glance.
3. **Given** any single view, **When** it renders, **Then** amber does not fill a large surface area.

---

### User Story 4 — Accessibility does not regress (Priority: P1)

Every text/background pairing the app ships meets WCAG 2.1 AA, in both themes.

**Why this priority**: Constitution principle V requires WCAG 2.1 AA and CI enforces it. The
guidelines' own contrast table flags Chippr Teal on white as AA **only at 18px+ or bold
14px+** — so a naive swap of the old green for teal in small text would ship a violation.

**Independent Test**: Automated contrast audit over the shipped token pairings plus the
existing accessibility CI job.

**Acceptance Scenarios**:

1. **Given** the shipped light theme, **When** contrast is measured for every foreground/background
   token pairing in use, **Then** each meets at least AA for its text size.
2. **Given** the shipped dark theme, **When** the same measurement runs, **Then** the same holds.
3. **Given** small or non-bold text, **When** it renders in the brand teal, **Then** it uses the darker teal
   that clears AA at body sizes rather than the mid teal that does not.

---

### User Story 5 — White-label tenants still work (Priority: P2)

The default FairWins tenant reproduces the newly branded product exactly. A non-default
tenant that overrides theme tokens still gets its own colors, and a tenant that overrides
nothing inherits the Chippr-aligned defaults.

**Why this priority**: The tenant system already exists and its default tenant is defined as
reproducing the current product exactly. Re-pointing the palette without updating that
definition would break that guarantee.

**Independent Test**: Build the default tenant and one overriding tenant; confirm each
renders its own palette.

**Acceptance Scenarios**:

1. **Given** the default tenant, **When** the app renders, **Then** its palette matches the Chippr-aligned
   defaults.
2. **Given** a tenant whose manifest overrides brand tokens, **When** the app renders, **Then** its overrides
   win over the Chippr defaults.

---

### User Story 6 — Off-screen brand surfaces follow (Priority: P3)

Brand color also reaches surfaces that are not the live DOM: the installed-app theme color,
generated statement documents, and generated QR artwork.

**Why this priority**: Lower reach, but leaving them behind produces a visibly two-branded
experience the first time a member installs the app or downloads a statement.

**Independent Test**: Install the app and generate a statement; confirm both carry the new
palette.

**Acceptance Scenarios**:

1. **Given** the app installed to a home screen, **When** the OS renders its chrome, **Then** the theme color
   is the Chippr-aligned brand color.
2. **Given** a generated statement document, **When** it renders, **Then** its accents use the Chippr palette.

---

### Edge Cases

- **Brand fonts unavailable.** Fonts must degrade to a defined fallback stack without layout shift
  large enough to break a surface. Text must never become invisible while fonts load.
- **A tenant overrides only some tokens.** Unoverridden tokens fall through to the Chippr defaults;
  the tenant must not end up with a mixture that fails contrast. Per-tenant contrast is the
  tenant's responsibility, but the *default* path must be safe.
- **Success and brand emphasis collapse into one color.** Because the outgoing brand primary was a
  green that also carried "win/success" meaning, moving brand to teal must not silently leave
  success reading as brand. These two meanings must stay separable.
- **Amber overload.** The palette's only warm color is a signal color. Surfaces that currently use
  the old warning orange for non-signal decoration must not simply become amber-flooded.
- **Charts and data series.** Categorical series must remain distinguishable from one another within
  a monochromatic teal-dominant palette, including for members with color vision deficiency.
- **Dark theme teal.** The guidelines' contrast table is measured on white/Cloud. Dark-theme
  pairings are not covered by it and must be verified independently, not assumed.
- **Mini-app packages.** Packages are built and pinned separately from the host; a host palette
  change does not retroactively restyle an already-published package.

## Requirements *(mandatory)*

### Functional Requirements

**Palette**

- **FR-001**: The product's default color tokens MUST be defined from the Chippr core palette:
  Chippr Teal `#2E7D8C`, Gunmetal `#1C333B`, Cloud `#F4F6F7`, Teal 700 `#1F5966`, Teal 300 `#6FAEBB`,
  Teal 100 `#D9E9EC`, Steel `#5E6B70`, Amber `#F2A33C`.
- **FR-002**: The retired legacy green `#2FA043` MUST NOT appear anywhere in shipped product styling.
- **FR-003**: The outgoing FairWins defaults `#36B37E`, `#4C9AFF`, `#7BDCB5`, and their hover/dark
  variants MUST NOT appear as literal values in shipped product styling.
- **FR-004**: Color MUST be consumed from named tokens rather than restated as literal values in
  individual surfaces, so that the palette is changeable from one place. Literal brand-color values
  in shipped styling MUST be eliminated, not merely supplemented by tokens.
- **FR-005**: The system MUST provide an automated check that fails when a retired or legacy brand
  color literal reappears in shipped styling.
- **FR-006**: Surface weighting MUST follow the guidelines' 60/30/10 intent: light Cloud/white
  surfaces dominate, the teal family carries interactive and brand emphasis, and Gunmetal anchors
  text and dark sections.
- **FR-007**: Amber MUST be reserved for alerts, live states, and at most one call-to-action per
  view. It MUST NOT fill large areas and MUST NOT be applied to the FairWins mark.

**Semantic and status color**

- **FR-008**: Success, warning, error/destructive, and informational states MUST each remain
  visually distinguishable from one another and from ordinary brand emphasis, in both themes.
- **FR-009**: Status meaning MUST NOT be carried by color alone where it changes what a member
  would do — an accompanying label, icon, or text cue is required.

**Typography**

- **FR-010**: Headings MUST render in the brand display face (Space Grotesk); body, interface, and
  control text in the brand text face (Inter); code, addresses, hashes, and identifiers in the brand
  mono face (JetBrains Mono).
- **FR-011**: The web type hierarchy MUST follow the guidelines: H1 display bold 48/56 with -1%
  tracking, H2 display bold 36/44, H3 display medium 28/36, H4 text semibold 22/30, body text
  regular 16/26, small 14/22, caption 13/18 in Steel, code 14/22. Scale is a 1.25 major third from a
  16px base, expressed in relative units with unitless line-heights.
- **FR-012**: Type sizes MUST be exposed as named tokens so a surface asks for a role, not a number.
- **FR-013**: If a brand font fails to load, text MUST remain legible in a defined fallback stack and
  MUST NOT be rendered invisible during loading.
- **FR-014**: Font delivery MUST NOT require relaxing the application's existing content security
  policy beyond origins it already permits.

**Container language**

- **FR-015**: Card, button, and container corner radii MUST follow the guidelines' rounded-rectangle
  motif rather than the current ad-hoc values.

**Accessibility**

- **FR-016**: Every foreground/background token pairing shipped in the default theme MUST meet WCAG
  2.1 AA for the text size it is used at, in both light and dark themes.
- **FR-017**: Mid-teal MUST NOT be used for small body text on light surfaces; the darker teal MUST
  be used where the guidelines' measured table requires it.
- **FR-018**: An automated check MUST verify the shipped token pairings against their required
  contrast ratios and fail when a pairing regresses.

**Brand separation**

- **FR-019**: The FairWins logo and brandmark artwork MUST NOT be modified by this feature.
- **FR-020**: The Chippr robot brandmark MUST NOT be introduced into any FairWins product lockup.

**Reach**

- **FR-021**: The default tenant's declared theme MUST match the Chippr-aligned defaults, and tenant
  overrides MUST continue to take precedence over them.
- **FR-022**: Installed-app metadata color, generated statement document styling, and generated QR
  artwork defaults MUST use the Chippr palette.

**Validation**

- **FR-023**: The result MUST be validated with real screenshots of the running application in both
  themes at mobile and desktop viewports, critiqued against a written checklist, with defects fixed
  and re-captured until clean.

### Key Entities

- **Color token**: A named role (surface, text, border, brand emphasis, interactive, status) bound to
  one palette value per theme. The only place a color value is stated.
- **Type token**: A named role (H1–H4, body, small, caption, code) bound to a family, size, weight,
  line-height, and tracking.
- **Tenant theme declaration**: A tenant's optional overrides of the token set; absent overrides fall
  through to the defaults.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero occurrences of the retired legacy green or the outgoing FairWins brand hues remain
  as literal values in shipped product styling — verified by an automated scan that runs in CI.
- **SC-002**: 100% of shipped default-theme foreground/background token pairings meet WCAG 2.1 AA at
  the sizes they are used, in both light and dark themes — verified by an automated audit.
- **SC-003**: Every top-level member-facing surface renders in the Chippr palette and the brand
  typefaces in both themes at both mobile and desktop viewports — verified by captured screenshots
  reviewed against a written checklist with zero unresolved defects.
- **SC-004**: The FairWins logo and brandmark files are unchanged — verified by an empty diff on those
  assets.
- **SC-005**: The existing frontend test suite and accessibility audits pass with no new failures.
- **SC-006**: A future palette change requires editing only the token definitions and the tenant
  manifest — demonstrated by the absence of brand-color literals outside those files.

## Assumptions

- **Status colors are additive to the guidelines, not overridden by them.** The Chippr palette defines
  no success or error color; it defines Amber as the sole signal color. A financial application
  cannot express win/loss, confirmed/failed, and safe/destructive with one signal hue. This feature
  therefore keeps a distinct success and a distinct danger color, tuned to harmonize with the Chippr
  palette and to clear AA, and treats Amber as the warning/live signal the guidelines describe.
  Recorded as an intentional extension, not a deviation.
- **Chart series colors are derived, not dictated.** The guidelines do not specify a categorical data
  palette. Series colors will be derived from the teal family plus Amber and Steel, ordered so that
  adjacent series stay distinguishable including under color vision deficiency.
- **The FairWins mark's gradient is out of scope.** The guidelines describe the clover's lime→seafoam→teal
  gradient as FairWins' own territory. The mark is not changed, and UI color is not matched to the
  lime end of that gradient.
- **Brand fonts are delivered from the font origins the application's content security policy already
  permits.** No new external origin is introduced.
- **Mini-app packages already published on-chain are out of scope.** They are immutable at their pinned
  content ids; restyling them is a separate release of those packages.
- **Marketing sites, documentation sites, and email templates are out of scope.** This feature covers
  the application.
- **"Shipped product styling" excludes test fixtures, archived code, and expected-value assertions in
  tests**, which may legitimately reference old values while describing history.

## Out of Scope

- Redrawing, recoloring, or replacing the FairWins logo or brandmark.
- Introducing the Chippr robot brandmark or a co-branded lockup into the app.
- Restyling already-published mini-app packages.
- Marketing site, docs site, and email template branding.
- Copy, voice, and tone changes.
- Any change to contracts, gateway services, or infrastructure.
