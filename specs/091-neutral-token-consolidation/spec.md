# Feature Specification: Neutral and status token consolidation

**Feature Branch**: `claude/fairwins-neutral-tokens-doqie6`

**Created**: 2026-08-16

**Status**: Draft

**Input**: Follow-up to spec 090, recorded there as research R8 and in the PR as deferred debt.

## Context

Spec 090 moved the FairWins app onto the Chippr palette and proved the token layer could govern
it — 1,621 literals tokenised, three guards holding. It deliberately stopped at the brand hues.

The remainder was ~500 assorted Tailwind/Chakra neutrals and status shades. Those were left out
because 090's matching rule could not reach them: it replaced a literal that **exactly equalled a
token's current value**, which is unambiguous. None of these equal a token, so including them would
have meant mixing a judgement-based refactor into a brand change and tripling a diff that already
touched 227 files.

They are not harmless. Every one is a colour that does not track the palette, that usually has no
dark-theme variant, and that makes "changeable from one place" true only of the parts already
swept. And no guard could ban them while they were still there, so the property 090 established was
protected only against the specific hues it knew about.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The palette is genuinely changeable from one place (Priority: P1)

A designer changes a token in `theme.css`. Every surface follows. Nothing is left behind on a
hardcoded grey, red or green that used to look close enough.

**Why this priority**: This is the whole feature. Spec 090 made the claim; this makes it true and
enforceable.

**Independent Test**: Change a neutral token, rebuild, confirm every surface moves.

**Acceptance Scenarios**:

1. **Given** shipped styling, **When** it is scanned for colour literals, **Then** the only file
   containing one is the token layer, plus a small allowlist of third-party identity colours each
   carrying a stated reason.
2. **Given** a developer adds a new hardcoded colour, **When** CI runs, **Then** it fails and names
   the file, the line and the token to use instead.

---

### User Story 2 — Dark mode stops being partial (Priority: P1)

Surfaces that were frozen on a light-theme grey follow the theme.

**Why this priority**: Most of these literals had no dark variant, so they rendered a light-theme
colour on a dark surface. Tokenising them fixes a real defect, not just an inconsistency.

**Acceptance Scenarios**:

1. **Given** a surface that previously stated a light grey, **When** the dark theme is active,
   **Then** it renders the dark-theme value of the token it now references.

---

### User Story 3 — Colour that belongs to someone else stays theirs (Priority: P1)

A chain badge still shows Polygon purple and Bitcoin orange.

**Why this priority**: This is the failure mode of an over-eager sweep. A network pill rendered in
teal is not on-brand, it is **wrong** — it tells the member something untrue about which chain they
are on. The same holds for token logos and vendor marks.

**Acceptance Scenarios**:

1. **Given** the network pills, **When** they render, **Then** each chain keeps its own identity colour.
2. **Given** the Bitcoin badge, **When** it renders, **Then** it keeps Bitcoin's orange.

---

### Edge Cases

- **A colour that reads as two roles.** The outgoing green appeared both as brand emphasis and as
  success. Mapped wrongly, a primary button becomes a "success" button. Resolved by reading each
  site, not by the hue.
- **Prose that looks like a colour.** `#938` in a comment is an issue reference. Comments are not
  scanned or rewritten.
- **White and black.** Not palette colours: `#fff` on a brand fill is not a surface token, and
  `#000` at 6% alpha is a shadow. Forcing them through tokens would make the code less honest.
- **Surfaces that are dark in both themes** (the landing hero, the component gallery). A theme token
  would turn them light; they take palette values directly.

## Requirements *(mandatory)*

- **FR-001**: Neutral, status, and decorative colour literals in shipped styling MUST be replaced by
  the token for the role they serve.
- **FR-002**: Mapping MUST be by role, decided per literal, and recorded. No pattern matching, no
  nearest-colour function.
- **FR-003**: Third-party identity colours (chains, vendors, token logos) MUST be preserved, and
  each exemption MUST carry a stated reason.
- **FR-004**: White and black MUST be left as literals, and the rule MUST be stated where the
  exemption lives.
- **FR-005**: Comments MUST NOT be scanned or rewritten.
- **FR-006**: An automated check MUST fail when a colour literal appears in shipped styling outside
  the token layer and the allowlist.
- **FR-007**: Tier metals and decorative gradients MUST become tokens rather than being either
  hardcoded or forced onto an existing semantic token.
- **FR-008**: Every existing spec-090 guarantee MUST continue to hold — no legacy brand hue, no
  undefined token, WCAG 2.1 AA on every declared pairing in both themes.
- **FR-009**: The result MUST be validated with real screenshots in both themes at both viewports.

## Success Criteria *(mandatory)*

- **SC-001**: Colour literals in shipped styling outside the token layer: **zero**, excluding the
  documented allowlist — verified in CI.
- **SC-002**: The spec-090 guards continue to pass unchanged.
- **SC-003**: No new test failures; build and lint unchanged.
- **SC-004**: Every top-level surface renders correctly in both themes at both viewports — verified
  by a screenshot round with zero unresolved findings.

## Assumptions

- **Role mapping is a judgement, and judgements can be wrong.** Two were, and the screenshot round
  caught both. That is why FR-009 exists rather than trusting the table.
- **The membership tier metals are a second documented exception**, on the same footing as status
  colour: the palette has no vocabulary for rank, and bronze/silver/gold is a convention members
  read without a legend. Gold resolves to Amber rather than a literal gold, keeping the estate to
  one yellow.
- **Demo and gallery routes** (`/ui-components`, `/state-demo`) are treated as shipped styling. They
  are real routes, and they are the widest single view of the component set.

## Out of Scope

- Any change to the palette itself. This moves call sites onto existing tokens.
- `#fff` / `#000` (see Edge Cases).
- Third-party identity colour.
- Typography, spacing, and layout.
