# Feature Specification: Buy Crypto — Coinbase Onramp from the Wallet Sheet

**Feature Branch**: `060-coinbase-onramp`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Allow members to purchase crypto from Coinbase using
the Coinbase Onramp SDK. Incorporate the purchase flow into the exchange section and
add a buy button to the wallet bottom sheet." Revised in-session: do **not**
incorporate it into the Trade section — the platform is DeFi-first and the fiat
onramp is expected to eventually not be needed. The only entry point is a Buy
button on the wallet bottom sheet.

## Clarifications

### Session 2026-07-18

- Q: The description says "exchange section" — which section is that? → A: The
  section is called **Trade** (the DEX swap surface). There is no "Exchange"
  section.
- Q: Should the purchase flow be incorporated into the Trade section? → A: **No.**
  The platform is DeFi-first; a fiat purchase onramp is a transitional convenience
  that will eventually not be needed. It must NOT be woven into Trade (or any
  other value surface). The single entry point is a **Buy** button on the wallet
  bottom sheet, and the whole feature must be cleanly removable (config-off leaves
  zero residual UI).
- Q: Which surface is "the wallet bottom sheet"? → A: The **account sheet that
  opens when the member taps their avatar (user icon) in the header** — the sheet
  showing their address, USDC balance, active network, membership status, and the
  Account / Membership / Preferences / Disconnect actions. Not the asset detail
  sheet in the portfolio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buy crypto from the wallet bottom sheet (Priority: P1)

A member opens the wallet bottom sheet by tapping their avatar in the header. Next
to their address, balance, and network they see a **Buy** action. Tapping Buy
shows them, before anything else happens, exactly what is about to occur: the
asset (defaulting to USDC, the app's working currency) and the active network, and
the destination — the same wallet address displayed in the sheet — that the
purchased crypto will be delivered to. They continue into a purchase experience
operated entirely by Coinbase, where they pay with their own payment method and
complete any identity checks Coinbase requires. FairWins never touches the
payment, never holds the funds, and never sees payment credentials. When Coinbase
delivers the purchase, the crypto arrives directly in the member's wallet on the
active network and their balance reflects it.

**Why this priority**: This is the entire feature — a single, self-contained way
for a member with an empty or low wallet to fund it without leaving the app flow.
Without it there is nothing to ship.

**Independent Test**: On a supported network, open the wallet bottom sheet from
the avatar, tap Buy, verify the pre-handoff summary shows the correct asset,
network, and destination address, complete (or sandbox-complete) a purchase with
Coinbase, and verify the funds arrive at the member's address with the balance
updating accordingly.

**Acceptance Scenarios**:

1. **Given** a connected member on a supported network taps their avatar, **When**
   the wallet bottom sheet renders, **Then** a Buy action appears alongside the
   sheet's existing content.
2. **Given** the member taps Buy, **When** the purchase flow opens, **Then** the
   network is the member's active network, the asset defaults to USDC, and the
   destination address shown is the same address displayed in the sheet.
3. **Given** the member completes payment with Coinbase, **When** Coinbase
   delivers the purchase on-chain, **Then** the funds arrive at the member's own
   address and their balance reflects the new holding.
4. **Given** the member abandons or cancels the Coinbase flow at any point,
   **When** they return to the app, **Then** their wallet and the app are exactly
   as they left them — nothing pending, nothing charged by FairWins, no error
   debris.
5. **Given** any Buy handoff, **When** the member is shown costs, **Then** all
   fees are Coinbase's own and are presented as such — FairWins adds no fee and
   implies no endorsement of the price.

---

### User Story 2 - Honest availability: the button only appears when it works (Priority: P2)

A member on a network, asset, or region where purchasing is not possible — or when
the purchase service is not configured or is unreachable — simply does not see the
Buy action (or sees it clearly disabled with the reason, where a reason is
knowable). The Buy button is never a dead end.

**Why this priority**: The onramp is a transitional convenience; a broken or
misleading Buy button damages trust on the app's core trust surface (the wallet).
Honest gating is what makes the minimal footprint acceptable.

**Independent Test**: With the purchase service unconfigured, verify no Buy action
renders anywhere. On a testnet or unsupported network, verify no Buy action
renders. On a supported network, verify the Buy action renders and opens a
working flow.

**Acceptance Scenarios**:

1. **Given** the purchase service is not configured or unreachable, **When** the
   wallet bottom sheet opens, **Then** no Buy action is shown — the sheet looks
   exactly as it does today.
2. **Given** the active network is a testnet or a network Coinbase cannot deliver
   to, **When** the wallet bottom sheet opens, **Then** no Buy action is shown
   for that network.
3. **Given** the active network is supported but the default asset is not
   deliverable there, **When** the member taps Buy, **Then** the flow offers only
   assets Coinbase can actually deliver on that network, or declines honestly if
   there are none.
4. **Given** Coinbase declines the member for regional or eligibility reasons,
   **When** that happens inside Coinbase's flow, **Then** the member can return
   to the app cleanly and the app states honestly that purchasing is unavailable
   for them, without FairWins collecting or storing the reason.

---

### User Story 3 - Honest settlement: no fake finality (Priority: P3)

A member who completes a purchase understands that delivery is on Coinbase's
timeline, not instant. The app never shows purchased funds as available before
they actually arrive on-chain; the balance updates when the chain says so.

**Why this priority**: Constitution principle III (honest state). Lower priority
only because the default behavior — showing nothing until the chain balance
changes — already satisfies it; this story guards against adding a misleading
"pending" fiction.

**Independent Test**: Complete a purchase and observe that at no point does the
portfolio show the purchased amount before it is present on-chain; once the
transfer lands, the balance reflects it via the normal portfolio refresh.

**Acceptance Scenarios**:

1. **Given** a completed Coinbase payment that has not yet settled on-chain,
   **When** the member views their portfolio, **Then** the balance shows only
   what is actually on-chain, with no synthetic "pending" holding presented as
   spendable.
2. **Given** the purchase settles on-chain, **When** the portfolio refreshes,
   **Then** the new balance appears through the same truthful path as any other
   inbound transfer.

---

### Edge Cases

- Member is operating as a shared custody vault ("Operate as") rather than their
  personal wallet: the destination shown and used is the acting identity's
  address, so funds land where the member is currently acting — never silently a
  different account.
- The active network changes between opening the sheet and tapping Buy: the
  handoff re-validates against the current network and either matches it or
  declines honestly.
- Coinbase's flow succeeds but on-chain delivery is delayed: the app makes no
  promise about timing and the wallet remains fully usable meanwhile.
- The member's region becomes ineligible mid-flow: Coinbase handles it in its own
  experience; returning to the app leaves no broken state.
- The purchase service is turned off after launch (the expected end state):
  disabling it via configuration removes every trace of the Buy action with no
  dead UI, no errors, and no changes needed to any other feature.
- Coinbase temporarily delists an asset or network between the sheet rendering
  and the member tapping Buy: availability is checked live at handoff time and
  the action declines gracefully rather than opening a flow that cannot complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The wallet bottom sheet (the account sheet opened from the header
  avatar) MUST offer a **Buy** action alongside its existing content when
  purchasing via Coinbase is available on the member's active network.
- **FR-002**: The Buy action MUST be the feature's **only** entry point. It MUST
  NOT be integrated into the Trade section or any other value surface, and no
  navigation section, tab, or home-screen mode may be added for it.
- **FR-003**: Before handing off to Coinbase, the app MUST show the member the
  asset, the network, and the exact destination address (their active acting
  identity's address) the purchase will be delivered to.
- **FR-004**: The purchase itself — payment collection, identity verification,
  compliance, pricing, and delivery — MUST be performed entirely by Coinbase in
  Coinbase's own experience. FairWins MUST NOT custody funds, collect payment
  details, or proxy fiat.
- **FR-005**: Purchased crypto MUST be delivered directly to the member's own
  wallet address on the active network; the asset MUST default to USDC (the
  app's working currency), with only assets Coinbase can deliver on that network
  offered as alternatives.
- **FR-006**: Availability MUST be gated honestly: when the purchase service is
  unconfigured or unreachable, or the active network, asset, or the member's
  context is unsupported, the Buy action MUST NOT render (or, where the reason is
  knowable and useful, may render visibly disabled with that reason). A rendered,
  enabled Buy action MUST always lead to a flow that can genuinely start.
- **FR-007**: The feature MUST be disableable by configuration alone, leaving
  zero residual UI and requiring no changes to any other feature — reflecting its
  status as a transitional convenience on a DeFi-first platform.
- **FR-008**: All fees shown are Coinbase's own; FairWins MUST NOT add a fee in
  this feature's initial version, and the experience MUST NOT present Coinbase's
  pricing as FairWins pricing.
- **FR-009**: The app MUST NOT represent purchased funds as present or spendable
  before they exist on-chain at the member's address; balances update through the
  normal truthful portfolio path.
- **FR-010**: Abandoning or failing the Coinbase flow at any stage MUST leave the
  member's wallet and session unchanged, with no error debris and no partial
  state.
- **FR-011**: Any credentials required to initialize purchase sessions MUST live
  server-side only and never be exposed to the client; the client-visible surface
  contains no secrets.
- **FR-012**: An outage or removal of the purchase service MUST have no effect on
  any wallet, wager, or other money-movement flow — the feature is fully
  decoupled from all value paths.

### Key Entities

- **Purchase handoff**: The moment the app transfers the member to Coinbase —
  carries the asset, network, and destination address; after it, everything is
  Coinbase's.
- **Destination**: The member's active acting identity (personal wallet or
  custody vault) address on the active network; the only place purchased funds
  may go.
- **Availability**: The computed answer to "can this member buy this asset on
  this network right now?" — derived from service configuration, network, and
  asset support; determines whether Buy renders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member starting from the wallet bottom sheet reaches Coinbase's
  purchase experience in 2 or fewer in-app steps (tap Buy → confirm handoff).
- **SC-002**: 100% of purchases deliver to the member's own displayed address —
  zero purchases custodied by, or routed through, FairWins.
- **SC-003**: 100% of rendered, enabled Buy actions open a purchase flow that can
  genuinely start (no dead buttons), across supported and unsupported networks,
  assets, and service states.
- **SC-004**: Turning the feature off via configuration removes all Buy UI with
  zero errors and zero changes to other features' behavior.
- **SC-005**: At no point does a member's displayed balance include purchased
  funds that are not yet on-chain.
- **SC-006**: The Trade section and all other existing sections are byte-for-byte
  unaffected in behavior by this feature's presence, absence, or outage.

## Assumptions

- The onramp provider is Coinbase's hosted purchase experience; members transact
  with Coinbase under Coinbase's terms, KYC, limits, and regional eligibility —
  FairWins performs no compliance function for purchases.
- FairWins earns no revenue from purchases in this version; if a partner-revenue
  program is adopted later, it would be a separate spec with its own honest
  disclosure (mirroring how Predict discloses its builder fee).
- Mainnet networks only; testnets never show the Buy action. Only networks and
  assets Coinbase Onramp can actually deliver to are eligible, resolved
  dynamically rather than hardcoded.
- The wallet bottom sheet is the existing account sheet opened from the header
  avatar (address, balance, network, membership, account actions); no new sheet
  is introduced.
- USDC is the default purchase asset because it is the app's working currency
  (wagers, membership, and pools are USDC-denominated).
- No in-app purchase history ledger in this version — the on-chain inbound
  transfer is the record, surfaced through the existing activity/portfolio
  surfaces.
- The existing pattern for optional external-provider features (server-side
  credentials, client soft-fail, hide-when-unavailable) is reused; an outage
  degrades to "feature absent", never to broken UI.
