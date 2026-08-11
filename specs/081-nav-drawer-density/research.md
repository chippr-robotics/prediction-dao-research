# Phase 0 Research: Nav Drawer Density

Decisions taken before design, with the alternatives that were rejected.

## R1 — Where do accordions live: the drawer or the shared rail?

**Decision**: In `components/ui/PortalNav.jsx`, behind an opt-in `collapsibleGroups` prop.

`PortalNav` is consumed by three surfaces: the nav drawer (`variant="nav"`), the Admin Panel,
and the My Account portal (both `variant="tabs"`). Reimplementing the grouped list inside
`AppNavDrawer` would fork the rail — two implementations of active-marking, the collapsed
gutter, and the initial-letter fallback, which have already drifted once (the `showIcon`
escape hatch exists because of exactly that pressure).

Putting it in `PortalNav` risks the opposite failure: changing the Admin rail by accident. The
prop is therefore **absent by default**, and when absent the component takes the identical
render path it takes today (a `<span class="portal-nav-group-label">` followed by bare items).
A non-regression test asserts the Admin/tabs form still renders no buttons for group labels.

**Rejected**: a separate `CollapsibleNav` component (forks the rail); making collapse
unconditional (silently changes two other surfaces).

## R2 — Collapsed items: hidden with CSS or unmounted?

**Decision**: Unmounted.

`display: none` would keep the buttons out of the visual flow but they remain in the DOM. They
would still be found by `getByRole`, still be reachable by some assistive-technology navigation
modes, and — critically — a collapsed section would still contribute to the tab order in
browsers that disagree about `display:none` inheritance through portals. The section header
claims `aria-expanded="false"`; the honest rendering of that claim is that the items are not
there.

**Consequence**: `screen.queryByRole('button', { name: 'Recovery' })` returns null when TOOLS
is collapsed. Existing drawer tests that assert on TOOLS/APPS items must open those sections
first — a deliberate, visible test update rather than a silent behaviour change.

**Rejected**: `hidden` attribute (same DOM-presence problem for query-based tests, and it
invites CSS overrides); `visibility: hidden` (still occupies layout).

## R3 — Where does section state persist?

**Decision**: `utils/userStorage` global preferences (`fw_global_prefs`), via a new
`lib/nav/navPreferences.js` store shaped like `lib/miniapps/favorites.js`.

The drawer must render its correct shape **on first paint, before any wallet connects** — a
menu that reflows once the wallet resolves is worse than one that never folded. That rules out
wallet-scoped storage. It also rules out adding these keys to `lib/backup/syncedObjects.js`:
the backup blob is account data, and how one device's menu is folded is not account data. This
matches the precedent already set twice — `miniapp_favorites` (spec 073) and `network_endpoints`
(spec 069) are both deliberately device-scoped and deliberately outside the synced blob.

The store copies favorites' shape (lazy snapshot + revision counter + `subscribe`) so the
Preferences panel and the drawer stay in step without a context or prop-drilling. It is the
established idiom in this codebase for exactly this problem.

**Rejected**: React context (a new provider for two booleans); `useUserPreferences` (wallet
scoped); URL state (a fold is not a location).

## R4 — Reconciling "cap the list" with "make it a horizontal row"

The request contains both a capped vertical list with a *View All* link (item 2) and a
horizontal scrollable icon row (item 3) for the same region. They are alternatives, not
additions, and shipping both would put pinned apps in two places.

**Decision**: one mechanism that satisfies both — a **horizontal strip that is also capped**.
The strip removes the vertical growth (item 3's goal, and the stronger fix: it bounds height at
*one row* rather than at *five rows*); the cap plus a `+N` control preserves item 2's promise
that pins beyond the cap are still reachable without leaving the menu.

A horizontal strip alone (relying on horizontal scroll for overflow) was considered and
rejected: horizontally-scrollable content with no visible affordance is routinely missed, and the
count in "Show all 8 (+3)" is also the honest disclosure that something is hidden.

The control sits **below** the row, in the drawer's vertical flow, not as the last item inside the
scroller. Visual validation caught the reason: inside the row it was the first thing pushed out of
view, so the one element whose job is to disclose hidden pins was itself hidden. A sticky variant
was tried and rejected too — it floated over the tiles it was describing.

## R5 — Do Home and Portfolio join the strip?

**Decision**: No. They stay as labelled rows under QUICK ACCESS.

They are destinations the product ships, not shortcuts the member chose, and they are the two
entries a first-time member most needs to read rather than recognise. Only the member-grown,
unbounded set moves to tiles. This also keeps QUICK ACCESS non-empty and meaningful when no
apps are pinned (FR-011 hides the strip entirely in that case).

## R6 — Filter precedence against collapse

**Decision**: filter > active-section force-expand > stored state, and the stored map is never
written by either override.

A filter is a statement about the *result set*. Hiding a match inside a fold would make the
drawer report fewer results than it found. Conversely, clearing the filter must not leave the
member's folds rearranged — so the overrides are computed at render time and never persisted.

## R7 — Compact density floor

**Decision**: 36×36 CSS px minimum interactive target in Compact.

The constitution binds the project to WCAG 2.1 AA, which has no target-size criterion at AA.
WCAG 2.2 AA SC 2.5.8 *Target Size (Minimum)* sets 24×24 CSS px; the widely-cited 44×44 figure
is AAA (2.5.5). 36px sits comfortably above the AA floor while still delivering the density
gain the request asks for (~48px → ~36px rows is a 33% increase in rows per screen, clearing
SC-004's 30%).

**Rejected**: 44px (no density gain left — it is roughly today's row height); 24px (meets the
letter of AA but is an uncomfortable phone target for an operations tool).

## R8 — Screenshot tooling without disturbing the lockfile

**Decision**: drive the pre-installed Chromium with Playwright resolved from a scratch
directory outside the repository (`NODE_PATH`), never from a workspace manifest.

Spec 075 documents that any lockfile re-resolve in this repo can silently drop an optional
platform binary and break every Vite build — including the mini-app release path whose output
bytes are keccak-committed on-chain. A screenshot harness is not worth that exposure. The
environment already ships Chromium at `/opt/pw-browsers`, so the harness needs no browser
download either.

**Rejected**: adding `@playwright/test` as a frontend devDependency; Cypress (its binary
download fails in this environment, and its `cy.screenshot` would need the same server anyway).

## R9 — Should the Apps group survive the accordion?

**Decision**: No. The mini-app catalog entry moves into **Tools**; the Apps group is removed.

Spec 073 (FR-009) collapsed that group to a single entry — the catalog door — because which apps
exist is decided by the on-chain registry rather than by the nav. A group that holds one row and
*cannot ever hold two* was already thin; turning group headings into accordions makes it a heading,
a separator, a chevron and a whole fold in service of one item. Tools is where a catalog of
utilities belongs, beside Protect, Address Book, Recovery and Reporting.

Nothing about the destination changes: the `apps` tab id, `?tab=apps`, and the `/apps/<slug>`
workspace routes are untouched, so every deep link, saved route and notification link keeps
resolving. `groupForTab('apps')` now answers "Tools", which only affects which siblings the mobile
bottom bar shows.

## R10 — What does a pinned tile show?

**Decision**: the app's **curated store artwork** (`artworkFor(slug)`, spec 077), not an initial.

The first draft used the first letter of the app's name, matching `PortalNav`'s icon-less fallback.
In a 54px tile that reads as a lone capital over a coloured square — recognisable only to a member
who already remembers which app starts with a T. The store already solves this: spec 077 curates a
decorative inline-SVG illustration per slug, host-side, and `artworkFor` is total, so an app with no
curated art gets the deliberate generic illustration rather than a broken image or another app's
identity. A shortcut should look like the card it was pinned from.

This adds nothing to the registry record, the manifest schema, or the host object — the constraints
spec 073 and 077 place on app imagery are unchanged. It only requires the favorite's `slug` to ride
along into the nav item, which it already stores.
