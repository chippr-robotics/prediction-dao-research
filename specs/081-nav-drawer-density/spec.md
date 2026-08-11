# Feature Specification: Nav Drawer Density — Collapsible Sections, Capped Quick Access, Search & Compact Mode

**Feature Branch**: `081-nav-drawer-density`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "'quick access' is currently where the apps 'pinned to my apps' are landing and this could lead to a cluttered intimidating sidebar. 1) Implement collapsible sections (accordions) with default states and chevrons. 2) Cap the Quick Access list with a View All link. 3) Transition to a horizontal favorites row of app icons at the top of the panel. 4) Offer a Compact density toggle in settings. 5) Add a sticky search/filter bar at the top of the side panel."

## Context

The global navigation drawer (`AppNavDrawer`, opened by the clover logo on mobile and
permanently docked as an icon gutter on desktop) renders a flat, always-expanded list:

```
QUICK ACCESS   Home · Portfolio · <every mini-app the member pinned>
FINANCE        Earn · Trade · Collect · Predict · Transfer
TOOLS          Protect · Address Book · Recovery · Reporting
APPS           Apps
```

Note the last group: since spec 073 collapsed it to the single mini-app catalog entry, APPS is a
heading, a rule and (once sections fold) a whole accordion in service of exactly one row — and it
can never gain a second, because which apps exist is decided by the registry, not the nav.

Pinning a mini-app from the catalog ("Add to My Apps") appends a full-height labelled row
to QUICK ACCESS. Pins are unbounded, so on a phone the section that is supposed to be the
member's shortcut strip is the section that pushes FINANCE and TOOLS below the fold.
Eleven items already fill the visible drawer on a 6" screen before a single pin exists.

This feature reshapes the drawer so that its height is bounded by design rather than by
how restrained the member has been with pinning, and gives high-volume operators a way to
see more of it at once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Collapse the sections I am not using (Priority: P1)

A member opens the menu and sees section headers they can fold away. FINANCE — the section
holding the money surfaces — is open. TOOLS starts folded, so the whole menu fits on one screen. Tapping a header toggles it; a chevron on the header shows which way it will go.
The choice sticks on this device, so the member shapes the menu once and it stays shaped.

**Why this priority**: It is the single change that most reduces the drawer's default height,
and it needs no new storage concept beyond a per-device preference. Everything else in this
spec is an improvement on top of a menu that already fits.

**Independent Test**: Open the drawer with no stored preferences; assert TOOLS items are not
rendered while FINANCE items are; click the TOOLS header and assert its items appear; reload and
assert TOOLS is still open.

**Acceptance Scenarios**:

1. **Given** a member with no saved section state, **When** they open the drawer, **Then**
   QUICK ACCESS and FINANCE are expanded and TOOLS is collapsed.
2. **Given** a collapsed TOOLS section, **When** the member activates the TOOLS header,
   **Then** its items become visible and the header's chevron flips to the expanded state.
3. **Given** the member has expanded TOOLS, **When** they close and re-open the drawer, or
   reload the app, **Then** TOOLS is still expanded.
4. **Given** the member is currently on a surface inside TOOLS (e.g. Recovery), **When** they
   open the drawer, **Then** TOOLS is expanded regardless of the saved state, so the item
   marked as the current page is never hidden inside a folded section.
5. **Given** a screen reader user, **When** they reach a section header, **Then** it is
   announced as a button whose expanded/collapsed state is exposed, and it names the region
   it controls.

---

### User Story 2 - Pinned apps stop crowding out the menu (Priority: P1)

The member has pinned six mini-apps. Instead of six full-width labelled rows, the pinned apps
render as one horizontal, scrollable strip of icon tiles at the top of the drawer. The strip
occupies the height of a single row no matter how many apps are pinned. Home and Portfolio
keep their labelled rows underneath — they are destinations, not shortcuts. If more apps are
pinned than fit the strip's visible cap, a trailing control reveals the rest as a wrapped
grid without leaving the menu.

**Why this priority**: This is the reported problem. Unbounded pins are the only part of the
drawer whose height the member can grow without limit, and the fix must remove the growth,
not merely slow it.

**Independent Test**: Pin eight apps, render the drawer, and assert the drawer's pinned region
renders at most the visible cap of tiles plus one overflow control; activate the control and
assert all eight are reachable; assert each tile still navigates to its app.

**Acceptance Scenarios**:

1. **Given** three pinned apps, **When** the drawer opens, **Then** they render as three icon
   tiles in a single horizontal strip, each carrying the app's curated store illustration, a
   visible short label, and its full name as its accessible name.
2. **Given** eight pinned apps and a visible cap of five, **When** the drawer opens, **Then**
   five tiles and one "show all" control are rendered, and the control states how many more
   there are.
3. **Given** the overflow control has been activated, **When** the member looks at the strip,
   **Then** all eight pinned apps are visible and a "show fewer" control returns to the capped
   view.
4. **Given** a pinned app tile, **When** the member activates it, **Then** the app opens at its
   route and the drawer closes, exactly as the labelled row did before.
5. **Given** no pinned apps, **When** the drawer opens, **Then** no strip and no overflow
   control render at all — an empty shortcuts region is not shown.
6. **Given** the member is inside a pinned app, **When** the drawer opens, **Then** that app's
   tile is marked as the current page.

---

### User Story 3 - Find a destination by typing (Priority: P2)

A member who knows what they want types it. A search field sits at the top of the drawer and
stays put while the list scrolls. As they type, the menu narrows to matching entries across
every section — including collapsed ones and pinned apps — with sections that have no matches
dropping out entirely. Clearing the field restores the menu exactly as it was.

**Why this priority**: It bypasses the hierarchy entirely, which is what makes a growing menu
survivable, but it is only reachable once the member has opened the drawer — so it improves a
menu that stories 1 and 2 have already made navigable.

**Independent Test**: Render the drawer, type "rec" into the search field, and assert only
Recovery (and any other match) is rendered and that no section header without a match is
rendered; clear the field and assert the default section states return.

**Acceptance Scenarios**:

1. **Given** an open drawer, **When** the member types text matching a nav item's label,
   **Then** only matching items render, under the headers of the sections that own them.
2. **Given** a filter is active, **When** a matching item sits in a section the member had
   collapsed, **Then** it is shown anyway — a filter overrides collapse for as long as it is
   active, and collapse states are restored untouched when the filter is cleared.
3. **Given** a filter matching nothing, **When** the member looks at the drawer, **Then** an
   explicit "no matches" message is shown rather than an empty panel.
4. **Given** a filter is active, **When** the member activates a result, **Then** it navigates
   and the drawer closes, and the filter is cleared for the next open.
5. **Given** the member scrolls a long filtered list, **When** they look at the top of the
   drawer, **Then** the search field is still visible.
6. **Given** matching is performed, **Then** it is case-insensitive and ignores leading and
   trailing whitespace.

---

### User Story 4 - Fit more on screen (Priority: P3)

An operator working through high volumes prefers density to whitespace. A Compact setting in
Preferences tightens the drawer's row height and label size so noticeably more of the menu is
visible at once, without any control becoming too small to hit reliably.

**Why this priority**: It is a preference, not a fix — the menu is already usable without it.
It also carries the highest risk of the four (touch-target regressions), so it goes last.

**Independent Test**: Render the preferences panel, switch density to Compact, and assert the
drawer carries the compact modifier; assert the computed row height in compact stays at or
above the minimum target size.

**Acceptance Scenarios**:

1. **Given** a member on the default density, **When** they select Compact in Preferences,
   **Then** the drawer's rows tighten immediately without a reload.
2. **Given** Compact is selected, **When** the member returns on the same device, **Then**
   Compact is still in effect.
3. **Given** Compact is in effect, **When** any drawer row, pinned tile, section header, or
   overflow control is measured, **Then** its interactive target is at least 36×36 CSS pixels.
4. **Given** either density, **When** the drawer is rendered, **Then** every label remains
   legible at the member's browser font size and nothing is clipped.

---

### Edge Cases

- **Every section collapsed.** Allowed. The headers remain, so the menu is always recoverable,
  and the section owning the current page still force-expands.
- **A section disappears for this network or tenant.** Chain-aware and tenant-aware hiding
  already removes empty groups; a stored expanded/collapsed state for a section that no longer
  renders is inert and must not error or resurrect the section.
- **Stored preference is corrupt or from an older shape.** Unreadable stored state falls back
  to the defaults rather than throwing; unknown section keys are ignored.
- **Pinned app with a very long name.** The tile label truncates visually; the full name stays
  in the accessible name and the tooltip.
- **Pin count changes while the drawer is open.** The strip re-renders from the live favorites
  list; the overflow control's count updates with it, and an "expanded" strip stays expanded.
- **Desktop icon gutter (collapsed rail).** The gutter shows glyphs only and has no room for
  headers, search, or a horizontal strip. In that state the drawer keeps rendering the flat
  icon rail it renders today — accordions, search, and the strip apply to the expanded panel.
- **Reduced motion.** Expand/collapse must not animate for members who ask for reduced motion.
- **Filter active when the drawer is closed.** The filter does not persist; the next open
  starts empty.

## Requirements *(mandatory)*

### Functional Requirements

**Collapsible sections**

- **FR-001**: The expanded nav drawer MUST render each section header as a control that
  expands and collapses that section's items, exposing its expanded state to assistive
  technology and naming the group of items it controls.
- **FR-002**: Each section header MUST carry a visible chevron indicating the direction the
  toggle will move it.
- **FR-003**: With no stored state, QUICK ACCESS and FINANCE MUST default to expanded and all
  other sections MUST default to collapsed.
- **FR-003a**: The mini-app catalog entry MUST live inside TOOLS rather than owning a group of its
  own. Its tab id (`apps`) and its `/apps/<slug>` routes MUST be unchanged, so every existing deep
  link keeps resolving.
- **FR-004**: The section containing the item marked as the current page MUST render expanded
  regardless of stored state, and MUST NOT overwrite the member's stored choice for that
  section.
- **FR-005**: Expanded/collapsed state MUST persist per device and survive reload, stored
  alongside the app's other device-scoped display preferences and readable with no wallet
  connected.
- **FR-006**: Collapsing a section MUST remove its items from the accessibility tree and from
  the tab order, not merely hide them visually.

**Quick Access / pinned apps**

- **FR-007**: Pinned mini-apps MUST render as a horizontal, horizontally-scrollable strip of
  icon tiles at the top of the expanded drawer, rather than as full-width labelled rows.
- **FR-008**: The strip MUST show at most a fixed visible cap of tiles (5) by default; when
  more apps are pinned it MUST render an overflow control stating how many are hidden, which
  reveals the remainder in place and can be collapsed again.
- **FR-009**: Each tile MUST carry the pinned app's full name as its accessible name and MUST
  navigate to the same route the labelled row did.
- **FR-009a**: Each tile MUST show the same curated store artwork the catalog card shows for that
  app, resolved by the same slug, and MUST fall back to the generic illustration for an app the
  host has no art for — never a broken image and never another app's identity.
- **FR-010**: The tile for the app the member is currently inside MUST be marked as the
  current page.
- **FR-011**: When no apps are pinned, neither the strip nor the overflow control MUST render.
- **FR-012**: Home and Portfolio MUST remain labelled rows under the QUICK ACCESS header and
  MUST NOT move into the pinned strip.

**Search / filter**

- **FR-013**: The expanded drawer MUST carry a text filter field pinned to the top of the
  drawer's scrolling region so it stays visible while the list scrolls.
- **FR-014**: While the filter is non-empty, the drawer MUST render only items whose label
  matches, case-insensitively and ignoring surrounding whitespace, and MUST omit section
  headers that have no matching items.
- **FR-015**: The filter MUST search pinned apps as well as section items.
- **FR-016**: While a filter is active, matches inside collapsed sections MUST be shown, and
  clearing the filter MUST restore the previous expanded/collapsed states unchanged.
- **FR-017**: A filter with no matches MUST render an explicit no-results message.
- **FR-018**: The filter MUST reset to empty each time the drawer is opened.
- **FR-019**: The field MUST be labelled for assistive technology and MUST offer a clear
  control when non-empty.

**Density**

- **FR-020**: The app MUST offer a navigation density preference with values Comfortable
  (default) and Compact, settable from the Settings surface.
- **FR-021**: Selecting a density MUST take effect immediately, without a reload, and MUST
  persist per device.
- **FR-022**: In Compact density, every interactive element in the drawer — item rows, section
  headers, pinned tiles, overflow and clear controls — MUST retain an interactive target of at
  least 36×36 CSS pixels.
- **FR-023**: Density MUST affect the nav drawer only; it MUST NOT change the Admin Panel or
  My Account portal rails that share the same underlying rail component.

**Non-regression**

- **FR-024**: The desktop icon gutter (collapsed rail) MUST continue to render every section's
  glyph with its accessible name, unaffected by section collapse state, search, or density.
- **FR-025**: Existing routing, active-item highlighting, tenant feature gating, and
  chain-aware item hiding MUST be unchanged by this feature.
- **FR-026**: Expand/collapse MUST NOT animate when the member has requested reduced motion.

### Key Entities

- **Nav section state**: a device-scoped map of section key → expanded boolean. Absent keys
  take the default for that section. Unknown keys are ignored.
- **Nav density**: a device-scoped single value, `comfortable` or `compact`.
- **Pinned app (existing)**: registry id, slug, and name captured at pin time; unchanged by
  this feature — only its presentation in the drawer changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With default preferences and ten pinned apps, the entire menu — every section
  header and every expanded item — fits within a 640 CSS-pixel-tall viewport without
  scrolling, compared with the current unbounded list.
- **SC-002**: Adding pinned apps beyond the visible cap does not increase the drawer's rendered
  height at all: the height with 5 pins and with 50 pins is identical.
- **SC-003**: Any destination in the menu is reachable in at most two interactions from an open
  drawer (type a filter, activate a result), regardless of how many sections are collapsed.
- **SC-004**: Compact density fits at least 30% more nav rows in the same vertical space as
  Comfortable, with no interactive target below 36×36 CSS pixels.
- **SC-005**: Automated accessibility checks on the drawer report no violations in either
  density, with sections expanded and collapsed, and with a filter active.

## Assumptions

- Tile artwork reuses spec 077's `artworkFor(slug)` — the same host-curated, decorative,
  inline-SVG illustrations the catalog cards use. Nothing new is added to the registry record, the
  manifest schema, or the host object.
- The visible pin cap is **5**. It is a constant, not a member-facing setting — the overflow
  control already gives access to the rest, and a second knob would not earn its place.
- Default-open sections are QUICK ACCESS and FINANCE. QUICK ACCESS is the member's own
  shortcuts and is now height-bounded; FINANCE holds the money surfaces.
- The user's items 2 and 3 describe the same region two ways (a capped vertical list vs. a
  horizontal icon row). They are satisfied by one mechanism: a horizontal strip that is also
  capped, with the "show all" affordance item 2 asks for.
- Density and section state are device-scoped preferences, stored with the app's other global
  (non-wallet) preferences and deliberately kept out of the synced backup blob — they are
  per-device display choices, matching the existing treatment of pinned apps and RPC endpoints.
- Minimum interactive target of 36×36 CSS pixels exceeds WCAG 2.2 AA Target Size (Minimum)
  (24×24) and is the floor Compact must respect.
- Desktop's always-visible icon gutter is out of scope for the new chrome; it has no room for
  headers, a search field, or a horizontal strip, and already solves density by showing glyphs
  only.
- No contract, subgraph, gateway, or network change is involved. This is frontend-only.
