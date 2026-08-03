# Feature Specification: Unified My Account Experience

**Feature Branch**: `claude/unified-assets-my-account-070n9e`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "We have split our users view of their assets across the portfolio and down sheet on the my account page and the my wallet profile dropdown. We need to create a unified experience under the my account view similar to the example provided. The top should be a carousel of the user's accounts which can be navigated through left to right. Each card has its basic information and selecting it makes it the active account in the app. The bottom half should show the activity view, the portfolio, or the activity cards and charts with a bottom nav for each."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and switch accounts from the account cards (Priority: P1)

A member opens My Account and sees, at the top, one card per account they can
act as: their personal wallet, each of their multisig (custody) vaults, and
each recovered legacy account. They swipe (or use arrows) left/right to browse
the cards. Tapping a card makes that account the active account everywhere in
the app — the same effect as picking it from the wallet-button dropdown — and
the card is visibly marked as active. Recovered accounts still require their
unlock step (biometric or passphrase) before they activate.

**Why this priority**: Selecting *which* account you are looking at is the
premise of the whole unified view — every panel below the carousel is scoped
to the selected account. Without this, the rest of the feature has no subject.

**Independent Test**: With a member who has a personal wallet, one vault, and
one recovered account, open My Account: three cards render with correct
labels/tags; tapping the vault card switches the app's acting account (header
dropdown agrees); tapping the recovered card opens the unlock dialog and only
a successful unlock switches.

**Acceptance Scenarios**:

1. **Given** a connected member with a personal wallet, at least one multisig
   vault, and at least one recovered account, **When** they open My Account,
   **Then** the top of the view shows one card per account, each with its
   avatar, label, kind tag (Personal / Multisig / Recovered), and shortened
   address, and the currently active account's card is visibly marked.
2. **Given** the account cards are showing, **When** the member selects a
   different (non-recovered) card, **Then** that account becomes the active
   account app-wide, and the wallet-button dropdown reflects the same
   selection.
3. **Given** the account cards are showing, **When** the member selects a
   recovered account's card, **Then** the unlock dialog opens, and the account
   becomes active only after a successful unlock; cancelling leaves the
   previous selection untouched.
4. **Given** the member switches the acting account from the wallet-button
   dropdown instead, **When** they return to My Account, **Then** the carousel
   shows the same account as active (the two surfaces can never disagree).
5. **Given** a member with only a personal wallet, **When** they open
   My Account, **Then** a single card renders without carousel arrows/dots.

---

### User Story 2 - One place for activity, portfolio, and stats (Priority: P1)

Below the cards, the member switches between three views of the selected
account without leaving My Account: **Activity** (the recent activity feed
plus by-token / by-resolution breakdowns), **Portfolio** (the categorized
holdings view), and **Stats** (the summary tiles and the Net P&L over time
chart). On a phone the switcher is a bottom nav bar; on desktop it is a tab
strip. Each view is directly linkable so the member can bookmark or share a
specific view.

**Why this priority**: This is the unification itself — the same information
existed before but was split across a separate Portfolio tab, the account
dashboard, and sub-sheets. Equal in priority to Story 1: both together are
the requested experience, and each is independently testable.

**Independent Test**: Open My Account: the Activity view shows by default;
switching to Portfolio shows the holdings view; switching to Stats shows tiles
and the P&L chart; each switch updates the URL and a direct visit to that URL
lands on the same view.

**Acceptance Scenarios**:

1. **Given** a connected member on My Account, **When** the view loads,
   **Then** the Activity view (recent activity feed + breakdowns) renders
   below the account cards by default.
2. **Given** the member is on My Account, **When** they pick Portfolio from
   the view switcher, **Then** the portfolio holdings view renders below the
   cards, without navigating away from My Account.
3. **Given** the member is on My Account, **When** they pick Stats, **Then**
   the summary tiles and the Net P&L chart render below the cards.
4. **Given** any of the three views is selected, **When** the member reloads
   or shares the URL, **Then** the same view is shown on load (deep-linkable).
5. **Given** the member is on a phone-sized screen, **When** they look for the
   view switcher, **Then** it is a bottom navigation bar; on a desktop-sized
   screen it is a tab strip (never both at once).

---

### User Story 3 - Every view follows the selected account (Priority: P2)

When the member selects a different account card, the bottom half follows: the
activity feed, breakdowns, portfolio holdings, summary tiles, and P&L chart
all show the *selected* account's data — not the connected wallet's — and
never mix the two.

**Why this priority**: Without it the carousel is cosmetic: the member would
select a vault and still be reading their personal wallet's numbers, which is
exactly the "split view of assets" confusion this feature removes. Depends on
Stories 1 and 2 existing, hence P2.

**Independent Test**: Acting as a vault with a different balance than the
personal wallet, open each of the three views and confirm the figures belong
to the vault (portfolio total, wallet-balance tile, activity entries), then
switch back to personal and confirm they change back.

**Acceptance Scenarios**:

1. **Given** the member has selected a vault card, **When** they view
   Portfolio, **Then** holdings are the vault's (this already works today and
   must keep working).
2. **Given** the member has selected a vault or recovered account, **When**
   they view Stats or Activity, **Then** the tiles, chart, breakdowns, and
   feed reflect that account's wagers, transfers, and balances.
3. **Given** the member switches back to the personal wallet, **When** any
   view is showing, **Then** the data returns to the personal wallet's without
   a stale carry-over from the previously selected account.

---

### User Story 4 - Saved links keep working (Priority: P3)

A member who bookmarked the old standalone Portfolio location, or follows an
old link from anywhere in the product, lands on the unified My Account view
with the Portfolio view selected — never a dead tab or an empty page.

**Why this priority**: Continuity requirement rather than new value; it
protects existing members' habits and existing in-app links.

**Independent Test**: Visit the old Portfolio URL directly and confirm it
lands on My Account with Portfolio selected; confirm the app's own menu
entries for Portfolio point at the new location.

**Acceptance Scenarios**:

1. **Given** a member with the old Portfolio URL bookmarked, **When** they
   visit it, **Then** they land on the unified My Account view with the
   Portfolio view active.
2. **Given** the app's navigation menus, **When** the member uses any
   Portfolio entry, **Then** it opens the unified view's Portfolio view (no
   surface still routes to the old standalone tab).

---

### Edge Cases

- Disconnected visitor: My Account already shows the connect prompt; the
  unified view (cards + views) renders only for connected members.
- A member with only the personal wallet: single card, no arrows/dots, and
  selecting it is a no-op (it is already active).
- Recovered-account unlock cancelled or failed: the previous active account
  stays selected; the card does not show as active.
- Unsupported network for wager data: Activity and Stats views keep the
  existing honest "network not supported" state; Portfolio (which reads all
  supported networks) still renders.
- No activity yet (new member): Activity and Stats views keep the existing
  honest empty state with the create-a-wager call to action.
- The account list changes while the view is open (e.g. a vault reference is
  removed elsewhere): cards re-render from the same source of truth as the
  dropdown; an active account that disappears falls back to personal (existing
  behavior of the switching seam).
- A view link with an unknown view name: falls back to the default view rather
  than an empty panel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: My Account MUST present one card per account the member can act
  as — the personal wallet, every multisig vault, and every recovered legacy
  account — sourced from the same account list as the wallet-button dropdown.
- **FR-002**: Each card MUST show the account's basic information: avatar,
  label, kind (Personal / Multisig / Recovered), and shortened address; vault
  cards MUST also name the network the vault lives on.
- **FR-003**: The cards MUST be browsable left/right (touch swipe on mobile;
  visible previous/next controls on desktop; position indicators when more
  than one card exists).
- **FR-004**: Selecting a card MUST make that account the active (acting)
  account app-wide, using the same switching mechanism as the wallet-button
  dropdown, so the two surfaces always agree; the active account's card MUST
  be visibly marked, including when the switch was made elsewhere.
- **FR-005**: Selecting a recovered account's card MUST require the existing
  unlock step before activation; cancellation or failure MUST leave the
  current selection unchanged.
- **FR-006**: Below the cards, My Account MUST offer exactly three views:
  Activity (recent activity feed + by-token/by-resolution breakdowns),
  Portfolio (the existing categorized holdings view), and Stats (summary tiles
  + Net P&L over time chart).
- **FR-007**: The view switcher MUST render as a bottom navigation bar on
  mobile and a tab strip on desktop, with exactly one of the two visible at
  any width.
- **FR-008**: The selected view MUST be encoded in the URL so each view is
  deep-linkable and browser back/forward work; an unknown view value falls
  back to the default (Activity).
- **FR-009**: All three views MUST show the data of the selected acting
  account (personal, vault, or recovered), and switching accounts MUST NOT
  leave a previous account's balances or figures on screen as if they were
  the new account's.
- **FR-010**: The old standalone Portfolio location MUST redirect to the
  unified view with the Portfolio view selected, and all in-app navigation
  entries for Portfolio MUST point at the new location.
- **FR-011**: Existing honest states MUST be preserved in place: unsupported
  network and no-activity empty states for Activity/Stats, portfolio
  loading/error/disconnected states, and the "data freshness / updated N ago"
  affordance with manual refresh.
- **FR-012**: The wallet utilities (QR, disconnect) that live on My Account
  today MUST remain reachable from the unified view.
- **FR-013**: The unified view MUST meet the same accessibility bar as the
  surfaces it replaces (WCAG 2.1 AA; the card list, switcher, and views are
  keyboard-operable and screen-reader labelled).

### Key Entities

- **Account card**: a member-facing representation of an account the member
  can act as — personal wallet, multisig vault, or recovered legacy account.
  Attributes: address, label, kind, avatar, network (vaults), active flag.
- **Account view**: one of the three lower-half views (Activity, Portfolio,
  Stats); has a stable identifier used in the URL.
- **Active (acting) account**: the app-wide selection of which account the
  member is operating as; single source of truth shared with the wallet-button
  dropdown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member with multiple accounts can switch the active account
  from My Account in at most 2 interactions (tap card; plus unlock for a
  recovered account).
- **SC-002**: A member can reach any of Activity, Portfolio, or Stats from
  My Account in exactly 1 interaction, without leaving the page.
- **SC-003**: After selecting a different account, 100% of the figures shown
  in the three views belong to the selected account (verified per view in
  tests).
- **SC-004**: 100% of old Portfolio links (bookmarks and in-app entries) land
  on the unified view's Portfolio view.
- **SC-005**: The unified view introduces no new accessibility violations
  (axe audit passes, as for the surfaces it replaces).

## Assumptions

- The Activity view is the default lower-half view (mirrors the reference
  design, where recent transactions sit directly under the cards).
- The wallet-button dropdown's account switcher remains in place as a quick
  shortcut; this feature unifies the *viewing* experience without removing
  the dropdown (both drive the same underlying selection).
- Account cards show identity information only (no per-card live balances):
  balances have one home in the lower half (Portfolio / Stats), and putting a
  second, separately-fetched balance on each card would create exactly the
  kind of split/duplicated asset view this feature removes — and would be
  unfetchable honestly for accounts on unreachable networks.
- "Down sheet" surfaces on the current My Account (per-asset detail sheet,
  action sheets) continue to work unchanged inside the Portfolio view.
- The Stats and Activity data for vault/recovered accounts is readable from
  the same sources used for the personal wallet (address-scoped reads); where
  a source is genuinely wallet-bound, the view shows the honest state rather
  than silently substituting connected-wallet data.
- Membership, Preferences, Network, Recovery, and the other My Account
  sections are untouched; this feature reshapes only the Account tab body.
