# Feature Specification: Transfer — Cross-Chain Bridge & Earn — Supply Liquidity

**Feature Branch**: `067-bridge-pool-liquidity`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Users of the fairwins platform need the ability to 1) bridge assets
between chains 2) earn yield by providing liquidity to bridge and uniswap pools. Use
/speckit-specify to create a spec defining the cross chain bridge section in the 'pay & transfer'
section (renaming the section to 'transfer') and enabling 'bridges' (renamed to 'Pool') as a section
of the 'earn' section. the features should be properly connected to the auxiliary (reporting,
notifications, fee, sanctions, etc) services. All surfaces of the features need to be integrated with
admin control panel screens for effective management, control, and operations of the system. once
completed a feature blog post should be written in the blog section and blog posts should be written
for the engineering and knowledge base."

## User Scenarios & Testing *(mandatory)*

FairWins members hold assets on several networks at once, but today the app can only move value
*within* a network: the **Pay & Transfer** section sends a stablecoin or native token to another
address on the chain you are already on. If a member's USDC is on Polygon and they need it on
Ethereum, they leave FairWins to do it. Separately, the **Earn** section offers Lend, Rewards, and
Stake, while a fourth tile — **Bridges** — has always been a disabled "coming later" placeholder.

This feature closes both gaps with one coherent story about moving and pooling liquidity:

1. **Transfer → Bridge.** The "Pay & Transfer" section is renamed **Transfer** and gains a **Bridge**
   surface. A member picks an asset, a source network, a destination network, and an amount; sees a
   single honest quote (what arrives, what it costs, how long it takes); confirms from their own
   wallet; and then watches the transfer progress truthfully across two chains — source submitted,
   source confirmed, in flight, delivered — never shown as done before the destination chain says so.

2. **Earn → Supply.** The disabled "Bridges" tile becomes a live **Supply** area. A member can supply
   assets to two kinds of liquidity pools and earn a share of the fees they generate: **bridge
   liquidity pools** (the same third-party bridge networks that settle the Transfer → Bridge flow —
   supplying them is what makes fast bridging possible, and suppliers earn a share of the bridge fees)
   and **Uniswap trading pools** (supply a token pair, earn a share of swap fees). Positions,
   earnings, and the real risks — impermanent loss, rebalanced inventory, smart-contract risk — are
   shown in the same plain, non-intimidating language as Lend.

Both surfaces are **non-custodial**: the member's own wallet is the only signer, FairWins never holds
the asset between transactions, and every third-party protocol is named and attributed. Both are
wired into the platform's shared services — the unified activity ledger and reporting, notification
profiles, the platform-fee source of truth, and the sanctions/deny-list guard — and both get operator
control surfaces in the admin control panel so availability, routes, curated pools, addresses, rates,
and emergency stops can be managed without an app redeploy.

**Naming note (resolved):** an earlier draft called the Earn area "Pool". It is named **Supply**
instead. FairWins already has an unrelated **Wager Pools** system (spec 034) — a shared-funds wager
among a group — which owns the `pool` vocabulary in the activity ledger, the notification categories,
and the activity feed, where wager-pool events are already tagged with the literal label "Pool".
"Supply" also matches the verb register of its siblings (Lend, Stake, Supply) and is the verb the
underlying protocols use for the action itself. This feature MUST NOT reuse or overload the wager-pool
vocabulary — see FR-039.

---

### User Story 1 - Bridge an asset to another network from Transfer (Priority: P1)

A member opens **Transfer** (the section formerly labelled "Pay & Transfer") and finds a **Bridge**
tab beside Send and Activity. They choose the asset they want to move, the network it is on now, and
the network they want it on, then enter an amount with a **Max** shortcut bounded by their real
balance. The screen returns a single, plain-language quote: the exact amount that will arrive at the
destination, every cost broken out on its own line (the bridge protocol's fee, the destination-chain
delivery cost, and the FairWins platform fee where one applies), and an honest estimate of how long
it will take. Nothing is hidden inside a rate. The member reviews, confirms in their wallet
(approving the exact amount first where the asset requires it), and lands on a progress view that
tells the truth at each step: submitted on the source chain → confirmed on the source chain → in
flight → **delivered on the destination chain**. Only the last step is presented as done, and the
destination balance is what proves it.

**Why this priority**: Moving assets between chains is the headline capability and the prerequisite
for everything else here. A member who can only bridge — with no pooling at all — already has a
complete, valuable feature that removes the main reason to leave the app.

**Independent Test**: With a connected account holding a supported asset on a supported source
network, open Transfer → Bridge, quote and execute a bridge to a different supported network, and
confirm the destination balance increases and the progress view reaches a delivered state backed by a
destination-chain transaction. Delivers the full cross-chain move.

**Acceptance Scenarios**:

1. **Given** a connected member, **When** they open the section previously labelled "Pay & Transfer",
   **Then** it is labelled **Transfer** everywhere it appears (drawer, mobile icon bar, section
   heading, page title, and any in-app link text), and existing deep links to the section still
   resolve.
2. **Given** a member on the Transfer section, **When** they open the **Bridge** tab, **Then** they
   see an asset selector, a source-network and destination-network selector, and an amount field —
   with only routes that are actually available offered, and unavailable pairs explained rather than
   silently missing.
3. **Given** a member has entered a supported route and an amount within their balance, **When** the
   quote returns, **Then** they see the amount that will arrive, each cost as its own labelled line,
   the total cost, and an estimated arrival time — with each unfamiliar term explained by an info
   bubble.
4. **Given** a member is shown a quote, **When** the quote's validity window elapses before they
   confirm, **Then** the quote is marked stale and must be refreshed before signing — and the member
   can never be charged more than the quote they confirmed.
5. **Given** a member confirms a bridge, **When** the source transaction is mined but the destination
   has not yet delivered, **Then** the transfer is shown as **in flight** with the source transaction
   viewable, and it is NOT counted or displayed as completed anywhere in the app.
6. **Given** a bridge has delivered, **When** the member returns to the Bridge or Activity view,
   **Then** the transfer shows as delivered with both the source and destination transactions
   viewable, and the destination balance reflects the received amount.
7. **Given** a member selects a source or destination network where bridging is unavailable — because
   no route exists, or an operator has paused it — **When** they view the Bridge tab, **Then** the app
   states plainly that the route is unavailable and why, names the routes that do work, and offers no
   dead controls.
8. **Given** a member is on a Bitcoin network (spec 061), **When** they open Transfer, **Then** the
   Bridge tab is absent or honestly explains that Bitcoin bridging is not offered, and Bitcoin
   send/receive is unaffected.

---

### User Story 2 - Supply liquidity to a bridge or Uniswap pool from Earn → Supply (Priority: P1)

A member opens **Earn** and finds that the greyed-out "Bridges" tile is now a live **Supply** area
alongside Lend, Rewards, and Stake. Opening it shows a curated list of pools in the same card layout
as the lending vaults, grouped into two clearly-labelled kinds: **Bridge liquidity** (supply one asset
to a bridge network so other people's transfers can settle instantly; earn a share of the bridge fees)
and **Trading liquidity** (supply a token pair to a Uniswap pool; earn a share of the swap fees). Each
card names the protocol behind it, the network(s) it covers, the estimated return, how much is already
supplied, and — stated up front, not buried — what can go wrong: for trading pools, that the mix of
what you get back changes with the price and can be worth less than simply holding (impermanent loss);
for bridge pools, that your asset can be rebalanced onto a different chain and that withdrawals depend
on available inventory. The member picks a pool, enters an amount, sees the platform fee (if any) as
its own line with the net that will be supplied, confirms in their wallet, and sees the resulting
position with its current value and earnings to date. They can add to or withdraw a position at any
time, and withdrawal is never fee-gated.

**Why this priority**: Supplying liquidity is the second half of the user's request and the revenue-bearing half.
It is independently shippable — the Supply area works whether or not a member ever uses Transfer →
Bridge — and it is what turns the long-dead "Bridges" placeholder into a real feature.

**Independent Test**: With a connected account holding a supported asset, open Earn → Supply, supply to
one bridge pool and one Uniswap pool, and confirm both positions appear with current value and
earnings; then withdraw from each and confirm the assets return to the wallet. Delivers the full
supply-earn-withdraw loop.

**Acceptance Scenarios**:

1. **Given** a connected member, **When** they open Earn, **Then** **Supply** appears as a live,
   selectable area (not a disabled "coming later" tile), and the word "Bridges" no longer labels an
   Earn area.
2. **Given** a member opens Earn → Supply, **When** the list loads, **Then** each pool card shows the
   pool kind (bridge liquidity or trading liquidity), the asset or asset pair, the protocol and
   network, the estimated return, the total already supplied, and the pool-specific risk summary —
   each concept explained by an info bubble.
3. **Given** a member supplies to a Uniswap trading pool, **When** they review before signing,
   **Then** they see the two-asset composition being supplied, the platform fee line and net amounts,
   and an explicit impermanent-loss disclosure that must be visible — not hidden behind a tooltip —
   before the confirm control is usable.
4. **Given** a member supplies to a bridge liquidity pool, **When** they review before signing,
   **Then** they see the single asset and amount, the platform fee line and net amount, and an
   explicit disclosure that the supplied asset may be rebalanced across chains and that withdrawals
   depend on available inventory.
5. **Given** a member holds an open pool position, **When** they open Earn → Supply, **Then** the
   position shows the current value, the earnings accrued so far, and — for trading pools — the
   current asset composition, each labelled as an estimate that moves with the market.
6. **Given** a member withdraws from a pool, **When** they confirm, **Then** the withdrawal executes
   with **no platform fee**, the position updates or closes, and the returned assets appear in the
   member's balance.
7. **Given** a pool's underlying protocol is unreachable or the pool has been retired by an operator,
   **When** the member opens Earn → Supply, **Then** existing positions remain visible and withdrawable
   and the pool is honestly marked as closed to new deposits — never hidden with a member's money
   inside it.
8. **Given** a member is on a network with no curated pools, **When** they open Earn → Supply, **Then**
   the area explains honestly that pooling is not available on this network and names the networks
   where it is.

---

### User Story 3 - Auxiliary service wiring: ledger, reporting, notifications, fees, sanctions (Priority: P2)

Everything a member does in Bridge and Supply behaves like a first-class FairWins activity rather than a
bolt-on. Bridges and pool actions appear in the unified activity ledger and flow into reporting with
correct value, direction, and network attribution — including the awkward cases a cross-chain move
creates, where value leaves one network and arrives on another and must not be double-counted as
income. Members get notifications for the events they actually care about — a bridge delivered, a
bridge stuck or refunded, a pool closed to deposits, a position affected by a protocol event — and can
control the delivery of those notifications per category like every other domain. Platform fees on
both surfaces come from the one platform-fee source of truth, are disclosed before signature, and are
capped by what the member was shown. And both surfaces screen the acting wallet against the
sanctions/deny-list guard before anything is signed, with the same honest refusal used elsewhere.

**Why this priority**: Without this wiring the features are functionally usable but institutionally
broken — untracked activity, silent failures, unmanageable revenue, and a compliance gap. It is P2
only because Stories 1 and 2 must exist for there to be anything to wire.

**Independent Test**: Perform one bridge and one pool supply, then verify (a) both appear in the
activity ledger and in a generated report with correct classification, value, direction, and network;
(b) the corresponding notifications are produced and respect the member's per-category delivery
setting; (c) the fee shown before signing matches what was charged and came from the platform-fee
configuration; (d) a wallet on the deny-list is refused at both surfaces before any signature.

**Acceptance Scenarios**:

1. **Given** a member completes a bridge, **When** they open the activity ledger, **Then** the bridge
   appears as a single logical activity that names both the source and destination network and both
   transactions, and is not double-counted as two separate unrelated movements.
2. **Given** a member completes a pool supply, withdrawal, or earnings claim, **When** they open the
   activity ledger, **Then** each appears with the correct class, direction, value, network, and
   timestamp provenance, distinguishable from wager-pool activity.
3. **Given** a member generates a report covering a period containing bridges and pool activity,
   **When** the report is produced, **Then** those entries are included with their fees attributed,
   and a cross-chain move of a member's own assets is not reported as income or as a disposal beyond
   the fees actually paid.
4. **Given** a bridge is delivered, stuck beyond its expected window, or refunded, **When** the event
   occurs, **Then** the member receives a notification describing exactly what happened and what, if
   anything, they need to do.
5. **Given** a member opens notification settings, **When** they view the categories, **Then**
   cross-chain bridging and liquidity pools appear as their own categories — separate from Wager Pools
   — each with an independently settable delivery mode, and a newly-added category defaults to being
   delivered rather than silently off.
6. **Given** a platform fee is configured for a bridge or pool deposit, **When** the member reaches
   the confirm step, **Then** the fee appears as its own line with its rate and the net amount, and
   the member cannot be charged above the rate they were shown.
7. **Given** the platform-fee configuration reports a zero or unset rate for a service, **When** the
   member reaches the confirm step, **Then** no fee line is shown and the flow behaves exactly as it
   would with no fee configured.
8. **Given** a wallet that fails sanctions/deny-list screening, **When** it attempts to quote or
   submit a bridge, or to supply to a pool, **Then** the action is refused before any signature with
   the platform's standard honest refusal, while viewing and withdrawing existing positions follows
   the platform's established policy for restricted accounts.
9. **Given** an optional supporting service (quoting or relaying) is unavailable, **When** the member
   uses either surface, **Then** the app degrades honestly — either offering a direct self-submitted
   path or stating plainly that the surface is temporarily unavailable — and never strands a member
   mid-flow with funds committed and no route forward.

---

### User Story 4 - Operator control surfaces in the admin control panel (Priority: P2)

An authorized operator opens the admin control panel and finds a **Bridge** view and a **Supply** view
covering every member-facing surface this feature adds. From them they can see live state and change
it without an app redeploy: which routes and networks are enabled, which protocols and contract
addresses the flows use, which pools are curated into the member list, what the platform fee rates are
(read-only here, edited through the platform-fee controls by the fee authorization), what limits apply,
and what has recently happened. They can **pause and resume** bridging per route and supplying per pool
or network in an emergency, with the guarantee that pausing stops new value going in while never
trapping value that is already in — existing bridges continue to settle and existing positions stay
withdrawable. Every control action is recorded in an auditable history showing what changed, from what
to what, by whom, and when. Operators also get the operational visibility the surfaces need: in-flight
bridges, stuck transfers needing attention, per-pool supplied totals, and the health of any supporting
service.

**Why this priority**: The user's requirement is explicit — every surface must be manageable from the
admin control panel. Operationally, a cross-chain surface without a pause switch and route management
is not shippable.

**Independent Test**: As an authorized operator, open the admin control panel, add and remove a
curated pool, change a route's availability, pause and resume a route, and confirm each change takes
effect in the member app without a redeploy and appears in the change history with actor and
timestamp. As an operator without the relevant authorization, confirm the controls are neither visible
nor actionable.

**Acceptance Scenarios**:

1. **Given** an authorized operator, **When** they open the admin control panel, **Then** a **Bridge**
   view and a **Supply** view appear in the navigation, gated by the authorizations that permit their
   use, and are absent for operators holding none of them.
2. **Given** an operator with bridge-configuration authorization, **When** they enable or disable a
   route (asset + source network + destination network), **Then** the member-facing Bridge surface
   reflects the change within one member refresh, offering or honestly withholding that route.
3. **Given** an operator with pool-configuration authorization, **When** they add, edit, or retire a
   curated pool, **Then** the member-facing Supply list reflects the change within one member refresh;
   a retired pool stops accepting new deposits while existing positions remain visible and
   withdrawable.
4. **Given** an operator updates a protocol contract address or endpoint used by either flow, **When**
   they submit, **Then** obviously-invalid input is rejected with a clear reason before it takes
   effect, and the current value is shown beside the new one.
5. **Given** an operator with the emergency authorization, **When** they pause bridging on a route or
   pooling on a pool, **Then** new deposits and new bridges stop immediately, in-flight bridges
   continue to settle, existing positions stay withdrawable, and the member surface shows the honest
   paused state.
6. **Given** any control action is performed, **When** an operator reviews the change history, **Then**
   they see the action, the affected route/pool/network, the before and after values where applicable,
   the acting operator, and the time.
7. **Given** an operator opens the Bridge view, **When** it loads, **Then** they see operational state:
   in-flight bridges, transfers past their expected delivery window needing attention, recent
   completions and refunds, and the health of any supporting service the flow depends on.
8. **Given** an operator opens the Supply view, **When** it loads, **Then** they see per-pool supplied
   totals, position counts, the live platform fee rate for the pool services with its cap, and the
   pools' current enabled/retired state.
9. **Given** an operator without the relevant authorization, **When** they attempt any control action
   by any route, **Then** it is refused and nothing changes.
10. **Given** the platform-fee configuration is undeployed or unreachable, **When** an operator opens
    either view, **Then** the fee sections state that plainly rather than showing an invented rate,
    and the remaining controls stay usable.

---

### User Story 5 - Publish the feature announcement, engineering post, and knowledge-base article (Priority: P3)

Once the capability ships, the three existing FairWins content series each get the piece they are for:
a member-facing **feature announcement** that leads with the benefit and walks through exactly what a
member sees before they sign; an **engineering blog** post explaining how cross-chain movement and
pooled liquidity are actually built and why the honest-state and non-custodial constraints shaped the
design; and a **knowledge-base** article that teaches the underlying concepts — what a bridge is, what
providing liquidity means, what impermanent loss is — to someone with no prior DeFi background.

**Why this priority**: Documentation and announcement follow a shipped feature; they do not gate it.
They are nonetheless an explicit deliverable of this request, and each series has an established
format and index that must be updated.

**Independent Test**: Confirm each of the three series contains a new entry for this feature, in that
series' established directory and file structure, with its index table updated and internal links
resolving.

**Acceptance Scenarios**:

1. **Given** the feature has shipped, **When** the feature-announcement series is reviewed, **Then** it
   contains a new numbered announcement for bridging and pooling, following the series' established
   structure (announcement plus promotion kit), with the series index updated.
2. **Given** the feature has shipped, **When** the engineering series is reviewed, **Then** it contains
   a new numbered post covering the cross-chain and liquidity architecture, following the series'
   established structure, with the series index updated.
3. **Given** the feature has shipped, **When** the knowledge-base series is reviewed, **Then** it
   contains a new numbered article explaining bridging and liquidity provision in plain language for
   a non-technical reader, with the series index updated.
4. **Given** any of the three pieces, **When** it is read, **Then** its description of fees, risks,
   timing, and availability matches what the shipped product actually does — no promised capability
   that does not exist and no omitted cost.

---

### Edge Cases

- **The bridge takes the money and nothing arrives.** The source transaction confirms but the
  destination never delivers within the expected window. The member must see a truthful "still in
  flight, longer than expected" state with the source transaction, be told what recourse exists
  (including the underlying protocol's own refund/claim path), and be notified. The activity is never
  shown as completed and never quietly disappears.
- **The bridge refunds on the source chain.** The destination could not be filled and value is returned
  on the source chain. The member sees a refunded outcome, is notified, and the ledger records the
  round trip with only the fees actually paid as cost — not as a loss of principal.
- **Partial delivery, or a different asset delivered.** The destination receives a different amount or
  a different (e.g. wrapped) representation than quoted. The app shows what actually arrived, not what
  was quoted.
- **The quote moves between display and signature.** Rates, gas, and destination costs change. The
  quote expires; a stale quote must be refreshed, and the confirmed figure is a hard ceiling.
- **The member has no destination-chain gas.** The member arrives with an asset on a chain where they
  cannot pay for anything. The flow must disclose this before signing and, where the route can deliver
  a small amount of the destination network's own token, present that honestly as an option and a cost.
- **The member wants to bridge to a network the app does not support.** Only supported destinations are
  offered; there is no free-text chain entry.
- **Insufficient bridge inventory on the destination.** The route cannot fill the requested size. The
  member is told the currently-fillable size rather than being allowed to submit and get stuck.
- **A route is paused mid-quote.** An operator pauses a route between the quote and the signature. The
  submission is refused with the honest paused reason; no partial state is created.
- **Impermanent loss makes a position worth less than deposited.** A trading position's value drops
  below what was supplied. The position and reporting show the real current value and the real change
  — never the deposited amount presented as if preserved.
- **A pool's underlying protocol is paused, migrated, or exploited.** New deposits stop; existing
  positions stay visible and withdrawal is attempted honestly; the member is notified and told the
  state plainly.
- **A trading position drifts entirely to one asset.** The composition shown must reflect reality, not
  the original balanced framing.
- **Withdrawal cannot be filled in full.** Bridge-pool inventory is committed elsewhere. The member can
  withdraw what is available now and is told plainly that the remainder can be withdrawn later — the
  same pattern the lending vaults already use.
- **The acting wallet is deny-listed between quote and submission.** The submission is refused before
  signature.
- **The platform-fee configuration is unreachable.** No invented rate is shown; the surface either
  falls back to the documented safe default or states that fees cannot be confirmed and does not
  proceed to signature with an unknown cost.
- **The member switches networks mid-flow.** Selections and in-flight state must not leak across the
  testnet/mainnet boundary, and a wallet on the wrong network is prompted or switched explicitly.
- **A member has both wager-pool activity and liquidity-pool activity.** Ledger entries,
  notifications, and reports must remain unambiguously distinguishable.
- **The device is closed mid-bridge.** In-flight bridges must be recoverable and resume their true
  status on the next visit — tracking cannot depend on the tab staying open.
- **An operator retires the last pool on a network.** The Supply area shows the honest empty state, and
  members with positions there can still see and withdraw them.

## Requirements *(mandatory)*

### Functional Requirements

#### Section rename and navigation

- **FR-001**: The "Pay & Transfer" section MUST be renamed **Transfer** in every member-facing surface
  where its name appears — the navigation drawer, the mobile section icon bar, the section heading and
  intro copy, page/document titles, and any in-app text that refers to the section by name.
- **FR-002**: The rename MUST NOT break existing entry points: previously-working links, deep links,
  and saved routes to the section MUST continue to resolve to it, and any stable internal identifier
  the section is addressed by MUST be preserved rather than renamed.
- **FR-003**: The Earn section's disabled **"Bridges"** area MUST be replaced by a live area named
  **Supply**, selectable like Lend, Rewards, and Stake, and the word "Bridges" MUST no longer label an
  Earn area anywhere. The area MUST NOT be named "Pool" — that word belongs to the Wager Pools feature
  (FR-039).
- **FR-004**: The Bridge surface MUST live inside the Transfer section alongside the existing send and
  activity surfaces, be reachable by a direct link, and MUST NOT displace or degrade the existing
  same-chain send flow.

#### Cross-chain bridging (Transfer → Bridge)

- **FR-005**: Members MUST be able to move a supported asset from one supported network to another by
  selecting the asset, the source network, the destination network, and an amount bounded by their
  real balance, with only genuinely available routes offered.
- **FR-006**: Launch coverage MUST be EVM networks only, spanning stablecoins and major native/wrapped
  assets on the supported EVM networks where routes exist; Bitcoin networks MUST be excluded from the
  Bridge surface and their existing send/receive behavior MUST be unaffected.
- **FR-006a**: Bridging MUST be offered on **every supported EVM network where the settlement protocol
  is deployed**, in both directions between each such pair — not a single privileged route. Reaching
  this requires adding **Arbitrum, Base, and Optimism** as supported networks (see FR-006b); together
  with Ethereum and Polygon they give five mainnet endpoints and twenty directed routes per asset.
- **FR-006b**: Adding those three networks MUST make them first-class in the app to the same standard as
  the existing value networks — selectable in the network switcher, included in the portfolio, and
  usable for send/receive — so a member who bridges to a network can then actually use what arrived.
  A network MUST NOT be offered as a bridge destination unless the app can display and spend the asset
  there.
- **FR-006c**: Networks where the settlement protocol is absent (Ethereum Classic, Mordor) MUST be
  excluded from the Bridge surface and MUST say so honestly rather than being silently missing.
- **FR-007**: Before any signature the member MUST see a single quote showing the exact amount expected
  to arrive, every cost as a separately labelled line (bridge protocol fee, destination delivery cost,
  and the FairWins platform fee where one applies), the total cost, and an estimated arrival time.
- **FR-008**: A quote MUST carry a validity window; once elapsed it MUST be marked stale and refreshed
  before signing, and the member MUST NOT be charged more than the quote they confirmed — the
  confirmed figure is a hard ceiling for that transaction.
- **FR-009**: A bridge MUST be tracked and displayed through distinct, truthful states — at minimum
  submitted, source-confirmed, in flight, and delivered — plus the terminal outcomes refunded and
  requires-attention. It MUST NOT be shown or counted as complete until the destination chain has
  delivered.
- **FR-010**: In-flight bridges MUST survive the member closing the app: on return, their true current
  status MUST be recovered and displayed without depending on a session having stayed open.
- **FR-011**: A bridge that exceeds its expected delivery window MUST enter a requires-attention state
  that names what is known, links the source transaction, and states what recourse exists — never a
  silent spinner and never a false completion.
- **FR-012**: Where a member would arrive on a destination network without the means to pay that
  network's transaction costs, the flow MUST disclose this before signature, and where the route can
  deliver destination-network gas, MUST present that option with its cost stated.
- **FR-013**: Bridging MUST be non-custodial: the member's wallet is the only signer, FairWins MUST NOT
  hold the asset between transactions, and a failed submission MUST leave the member in their starting
  state with nothing consumed beyond network costs actually incurred.
- **FR-014**: Every third-party protocol used to settle a bridge MUST be named to the member on the
  quote and in the activity record, with a risk disclosure explaining that settlement depends on that
  third party.

#### Liquidity supply (Earn → Supply)

- **FR-015**: The Supply area MUST present a curated list of pools of two kinds, each clearly labelled:
  **bridge liquidity pools** (single asset supplied to a third-party bridge network) and **trading
  liquidity pools** (an asset pair supplied to Uniswap).
- **FR-016**: Uniswap positions at launch MUST be **full-range** positions only — supply a pair, earn a
  share of the pool's trading fees, with no member-managed price range, no rebalancing prompts, and no
  out-of-range state.
- **FR-016a**: Trading liquidity MUST be offered on **every supported network where Uniswap is
  deployed** — not one privileged network. Enabling it on a network MUST NOT, by itself, switch on
  unrelated in-app capabilities (notably token swapping, which some networks deliberately ship
  without): supplying liquidity and swapping MUST be independently controllable per network.
- **FR-016b**: Protocol contract addresses MUST be resolved per network from that network's own
  authoritative deployment record. The system MUST NOT assume a protocol uses the same address on
  every chain — several do not.
- **FR-017**: Each pool card MUST show the pool kind, the asset or asset pair, the protocol and
  network, the estimated return, the total already supplied, and a pool-kind-specific risk summary,
  with every unfamiliar term explained by an info bubble in the same plain register as the Lend area.
- **FR-018**: Before supplying to a trading pool, the member MUST see an explicit, visible impermanent-
  loss disclosure — stating that the mix of assets returned changes with price and can be worth less
  than simply holding — presented in the confirm step itself rather than only behind a tooltip.
- **FR-019**: Before supplying to a bridge liquidity pool, the member MUST see an explicit, visible
  disclosure that the supplied asset may be rebalanced across chains and that withdrawal depends on
  available inventory.
- **FR-020**: Members MUST be able to view each open position with its current value, earnings accrued
  to date, and — for trading pools — the current asset composition, each labelled as a live estimate
  that moves with the market rather than a guaranteed figure.
- **FR-021**: Members MUST be able to add to and withdraw from a position at any time; **withdrawal
  MUST never be fee-gated** by a FairWins platform fee, so a member can always exit.
- **FR-022**: Where a withdrawal cannot be filled in full from available inventory, the member MUST be
  able to withdraw what is available now and be told plainly that the remainder can be withdrawn
  later.
- **FR-023**: Supplying liquidity MUST be non-custodial: the member's wallet is the only signer and FairWins MUST
  NOT hold pooled assets between transactions.
- **FR-024**: A pool retired by an operator, or whose underlying protocol becomes unavailable, MUST
  stop accepting new deposits while remaining visible and withdrawable for members holding a position
  in it — a pool MUST never be hidden while a member's money is inside it.
- **FR-025**: On a network with no curated pools, the Supply area MUST state that honestly and name the
  networks where pooling is available, with no mock data and no dead controls.

#### Platform fees

- **FR-026**: Platform fees for both surfaces MUST come from the single platform-fee source of truth
  used across FairWins services, modeled as distinct services with their own immutable caps —
  **`bridge.transfer`** (charged on a bridge, value-out) and **`liquidity.deposit`** (charged on a pool
  supply, value-in) — each capped at **250 bps** and each settable to zero.
- **FR-027**: No fee rate for these surfaces may be hardcoded in client or gateway code, and no second
  fee-configuration store may be introduced; supporting services MUST read the rate from the single
  source of truth, with any environment-configured value serving only as a documented fallback.
- **FR-028**: The live rate MUST be disclosed as its own line, with the resulting net amount, before
  any signature, and the quoted rate MUST be passed through as a hard ceiling so a member can never be
  charged above what they were shown.
- **FR-029**: A zero or unset rate MUST produce no fee line and behavior identical to the same flow
  with no fee configured.
- **FR-030**: Fees MUST be charged only on value-in for pools and on the bridge action itself; pool
  withdrawals, pool earnings claims, and bridge refunds MUST never carry a FairWins platform fee.

#### Sanctions and compliance

- **FR-031**: Both surfaces MUST screen the acting wallet against the platform's sanctions/deny-list
  guard before any signature, using the platform's existing honest refusal rather than a bespoke error.
- **FR-032**: Screening MUST occur on the real acting wallet, consistent with how other FairWins value
  surfaces screen, and MUST be enforced at the point of submission — not only at display time — so a
  wallet deny-listed between quote and submission is still refused.
- **FR-033**: A restricted account's ability to view and to exit existing positions MUST follow the
  platform's established policy for restricted accounts rather than being newly invented here.

#### Activity ledger, reporting, and notifications

- **FR-034**: Every member action on both surfaces — bridge submitted, bridge delivered, bridge
  refunded, pool supply, pool withdrawal, pool earnings claim — MUST be recorded in the unified
  activity ledger with its class, status, direction, value, network, timestamp provenance, and data
  provenance.
- **FR-035**: A bridge MUST be represented as a single logical activity that references both the
  source and destination networks and both transactions; the ledger MUST NOT present it as two
  unrelated movements and MUST NOT double-count its value.
- **FR-036**: Reporting MUST include these activities with fees attributed, and MUST NOT treat a
  member moving their own assets between networks as income or as a disposal beyond the fees actually
  paid.
- **FR-037**: Members MUST receive notifications for bridge delivered, bridge refunded, bridge requires
  attention, pool closed to new deposits, and pool position materially affected by a protocol event.
- **FR-038**: Cross-chain bridging and liquidity pools MUST each appear as their own user-controllable
  notification category with an independently settable delivery mode, and a newly-added category MUST
  default to being delivered rather than silently off.
- **FR-039**: The vocabulary these features introduce MUST NOT collide with the existing **Wager
  Pools** feature: the member-facing area name, the activity class, the notification category, and any
  identifier used for liquidity supply MUST all be distinct from those already used for wager pools, so
  a member and an auditor can always tell the two apart. "Pool" remains reserved for wager pools — a
  shared-funds wager among a group.
- **FR-039a**: Where an existing surface already labels wager-pool activity ambiguously as "Pool", that
  label MUST be disambiguated (e.g. to "Wager Pool") so the two features never appear under one word in
  the same list.

#### Operator control surfaces

- **FR-040**: The admin control panel MUST provide a **Bridge** control view and a **Supply** control
  view covering every member-facing surface this feature adds, each gated by the authorizations that
  permit its use and absent for operators holding none of them.
- **FR-041**: Operators MUST be able to enable and disable individual bridge routes (asset + source
  network + destination network) and to curate the pool list (add, edit, retire), with changes taking
  effect in the member app within one member refresh and without an app redeploy.
- **FR-042**: Operators MUST be able to view and update the protocol addresses and endpoints the flows
  depend on, with the current value shown and obviously-invalid input rejected with a clear reason
  before it takes effect.
- **FR-043**: Operators holding the emergency authorization MUST be able to **pause and resume**
  bridging per route and supplying per pool or network. A pause MUST stop new bridges and new deposits
  while allowing in-flight bridges to settle and existing positions to be withdrawn — a pause MUST
  never trap member value.
- **FR-044**: The emergency pause MUST remain exercisable while optional supporting services are
  degraded; it MUST NOT depend on optional infrastructure being healthy.
- **FR-045**: Operators MUST be able to set the operational limits the surfaces enforce — at minimum a
  per-transaction bridge maximum and a per-pool deposit cap where one applies — with member-facing
  flows honouring them and explaining the limit when a member exceeds it.
- **FR-046**: Every control action (enable/disable, add/edit/retire, address change, limit change,
  pause/resume) MUST be recorded in an auditable history capturing the action, the affected
  route/pool/network, the before and after values where applicable, the acting operator, and the time.
- **FR-047**: The Bridge control view MUST surface operational state: in-flight bridges, transfers past
  their expected delivery window needing attention, recent completions and refunds, and the health of
  any supporting service the flow depends on.
- **FR-048**: The Supply control view MUST surface per-pool supplied totals, position counts, current
  enabled/retired state, and the live platform fee rate with its cap — **read-only** for the fee, which
  is edited through the existing platform-fee controls by the fee authorization.
- **FR-049**: Access MUST be least-privilege: route and pool configuration require a bridge/liquidity
  configuration authorization; fee rates are changed only through the existing fee authorization on the
  single platform-fee configuration; pause/resume may additionally be exercised by the emergency
  authorization; an operator with none of these MUST neither see nor be able to perform any control
  action by any route.
- **FR-050**: All control state and history MUST be scoped per network, and the member app MUST NOT mix
  control state across the testnet/mainnet boundary.
- **FR-051**: The member-facing surfaces MUST source their route availability, curated pool list,
  addresses, limits, and fee rates from the managed control surface at runtime, and MUST fall back to
  an honest, safe default — availability withheld rather than invented — when the control surface or
  fee configuration is undeployed or unreachable.
- **FR-052**: Operator-driven availability MUST be presented to members honestly as "as of" its last
  read, reusing the platform's existing honest unavailable-state pattern rather than a bespoke surface.

#### Resilience and honest degradation

- **FR-053**: Any optional supporting service (quoting or relaying) MUST have a degraded path: either a
  direct, member-self-submitted route or a plain statement that the surface is temporarily unavailable.
  A member MUST never be stranded mid-flow with value committed and no way forward.
- **FR-054**: Neither surface may present mock, placeholder, or invented data in a shipped path;
  unavailable information MUST be shown as unavailable.

#### Publication

- **FR-055**: A member-facing feature announcement MUST be added to the feature-announcement series
  following its established structure (announcement plus promotion kit) with the series index updated.
- **FR-056**: An engineering post MUST be added to the engineering series covering the cross-chain and
  liquidity architecture, following its established structure, with the series index updated.
- **FR-057**: A knowledge-base article MUST be added to the knowledge-base series explaining bridging
  and liquidity provision in plain language for a non-technical reader, with the series index updated.
- **FR-058**: All three pieces MUST describe fees, risks, timing, and availability as the shipped
  product actually behaves — no promised capability that does not exist and no omitted cost.

### Key Entities *(include if feature involves data)*

- **Bridge Route**: A supported combination of asset, source network, and destination network, with its
  settling protocol, availability state, operational limits, and expected delivery window. Curated and
  toggled by operators; the member-facing route list is derived from it.
- **Bridge Quote**: A time-bounded offer for a specific route and amount: expected amount delivered,
  itemized costs (protocol fee, destination delivery cost, platform fee), total cost, estimated arrival
  time, and expiry. The confirmed quote's cost is a ceiling on what may be charged.
- **Bridge Transfer**: One member's cross-chain move — route, amount, quoted and actual costs, source
  transaction, destination transaction, current state (submitted, source-confirmed, in flight,
  delivered, refunded, requires attention), and timestamps. Recoverable across sessions; the single
  logical unit the ledger and notifications reference.
- **Liquidity Pool Option**: A curated pool a member may supply to — kind (bridge liquidity or trading
  liquidity), asset or asset pair, protocol, network, estimated return, total supplied, risk summary,
  deposit cap, and enabled/retired state.
- **Liquidity Position**: A member's holding in a pool — the pool, amount(s) supplied, current value,
  earnings accrued, current composition (trading pools), and open/closed state.
- **Fee Service Configuration**: The platform-fee entries governing these surfaces (`bridge.transfer`,
  `liquidity.deposit`), each with a current rate, an immutable cap, and a change history — read from
  the single platform-fee source of truth, never duplicated.
- **Control Configuration**: The operator-managed state backing both surfaces — route availability,
  curated pools, protocol addresses and endpoints, limits, and pause state — scoped per network.
- **Control Audit Record**: One operator action — what changed, before and after, on which
  route/pool/network, by whom, and when.
- **Activity Entry**: The unified-ledger representation of a bridge or pool action, distinct in class
  from wager-pool activity, carrying value, direction, network(s), status, and provenance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member who has never bridged before can move a supported asset from one supported
  network to another — from opening Transfer to confirming in their wallet — in under 2 minutes,
  without leaving the app and without consulting external documentation.
- **SC-002**: 100% of bridge quotes shown before signature itemize every cost the member will bear;
  in no case does the amount actually charged exceed the confirmed quote.
- **SC-003**: A bridge is never displayed or counted as complete before the destination chain has
  delivered — verified across the full state matrix including delayed, refunded, and partially-filled
  outcomes.
- **SC-004**: 100% of in-flight bridges resume their true status after the member closes and reopens
  the app, with no reliance on a session having stayed open.
- **SC-005**: A member who has never provided liquidity can supply to a curated pool in under 2
  minutes and, in usability testing, can correctly state in their own words what impermanent loss means
  for their trading position — at a rate of at least 8 in 10 participants.
- **SC-006**: Supply withdrawal is available and free of platform fees for 100% of open positions,
  including positions in pools that have been retired or whose underlying protocol has become
  unavailable.
- **SC-007**: 100% of member actions on both surfaces appear in the unified activity ledger and in
  generated reports with correct class, value, direction, and network attribution; no cross-chain move
  of a member's own assets is reported as income.
- **SC-008**: Bridging and liquidity pools each appear as an independently controllable notification
  category, and no notification from either feature is attributed to the Wager Pools category.
- **SC-009**: An operator can enable or disable a route, curate a pool, and pause or resume either
  surface with the change visible to members within one refresh and with zero app redeploys — measured
  across every control the views expose.
- **SC-010**: 100% of operator control actions produce an audit record identifying the actor, the
  before and after values, and the time.
- **SC-011**: An operator without the relevant authorization can perform none of the control actions by
  any route, verified for every control the views expose.
- **SC-012**: With every optional supporting service disabled, both member surfaces remain honest —
  either offering a self-submitted path or stating unavailability — and no flow can strand a member
  with value committed and no route forward.
- **SC-013**: A deny-listed wallet is refused at both surfaces before any signature, in 100% of
  attempts, including when the listing occurs between quote and submission.
- **SC-014**: All new member-facing UI meets WCAG 2.1 AA and passes the project's automated
  accessibility checks with no new violations.
- **SC-015**: Every entry point that previously reached "Pay & Transfer" still reaches the renamed
  Transfer section, with zero broken links introduced by the rename.
- **SC-016**: Each of the three content series contains a new, indexed entry for this feature whose
  description of fees, risks, timing, and availability matches the shipped behavior.
- **SC-017**: Bridging is available in both directions between **every** pair of supported networks
  where the settlement protocol is deployed — at launch, five mainnet networks and twenty directed
  routes per supported asset — with zero pairs silently missing.
- **SC-018**: Trading liquidity is offered on every supported network where Uniswap is deployed, and
  enabling it on a network changes no unrelated capability on that network (verified specifically for
  networks that deliberately ship without in-app swapping).
- **SC-019**: Every newly added network is usable end to end — selectable, visible in the portfolio,
  and able to send and receive — so no member can bridge to a network where the asset then becomes
  invisible or unspendable.

## Assumptions

- **Bridge model (decided)**: FairWins routes cross-chain transfers through **established third-party
  bridge protocols** and lets members supply liquidity to **those protocols' pools** from their own
  wallet — the same wrapping pattern Earn → Lend already uses for lending. FairWins ships **no new
  cross-chain custody contracts** and operates no bridge of its own; FairWins revenue on bridging comes
  from a platform-fee service, and pool yield comes from the underlying protocol.
- **Uniswap position model (decided)**: launch supports **curated full-range positions only**.
  Concentrated-liquidity ranges, range presets, rebalancing, and auto-managed LP vaults are explicitly
  out of scope for this feature.
- **Asset and chain coverage (decided)**: launch covers **EVM networks only** — stablecoins plus major
  native/wrapped assets. Bitcoin (spec 061) remains send/receive-only and is out of scope for both
  Bridge and Supply.
- **Network expansion (decided)**: coverage is maximized rather than minimal. **Arbitrum, Base, and
  Optimism are added as supported networks** alongside Ethereum and Polygon, because both underlying
  protocols are deployed on all five and a bridge with one route is not a bridge. This is deliberate
  scope growth beyond the two surfaces: the three new networks become first-class for portfolio,
  send/receive, and network switching (FR-006b). Ethereum Classic and Mordor support neither protocol
  and stay excluded.
- **Earn area name (decided)**: the area is **Supply**, not "Pool". "Pool" stays with the Wager Pools
  feature, where it accurately describes a shared-funds wager among a group.
- The section rename is **label-only**: the section's stable internal identifier and its existing
  routes are preserved so deep links, saved links, and tests keep working — the same approach already
  used elsewhere where a section's display name differs from its identifier.
- Fee rates for both new services **ship at zero** and are raised deliberately by the fee
  authorization, so launch behavior is fee-free and identical to the pre-feature flows until an
  operator acts.
- Supply positions are held by the member's own wallet in the underlying protocol; FairWins reads and
  displays them. Any protocol-issued position token belongs to the member.
- Estimated returns, position values, and earnings are **estimates sourced from the underlying
  protocols** and are refreshed on those protocols' own schedules; they are labelled as estimates and
  never presented as guaranteed.
- Curated pool lists and route availability are **operator-curated rather than exhaustive** — FairWins
  offers a reviewed subset, not every pool or route the underlying protocols support.
- The existing sanctions/deny-list guard, unified activity ledger, notification profile system,
  platform-fee configuration, reporting surface, and admin control panel are all available and are
  **extended** by this feature rather than replaced or duplicated.
- Existing member-facing patterns are reused rather than re-invented: the Lend area's card layout,
  info-bubble register, and risk-disclosure treatment; the platform's honest unavailable-state
  pattern; and the admin panel's role-gated navigation, change-history, and pause conventions.
- Content deliverables are added to the repository's existing documentation series in their
  established directory and file structure; publishing them to a live site is a separate operation
  outside this feature.

## Dependencies

- **Platform fee configuration (spec 060)** — the single source of truth both new fee services are
  registered in and read from.
- **Unified activity ledger (spec 051)** — extended with the new activity classes and sources.
- **Notification profiles and delivery preferences (spec 059)** — extended with the two new
  categories.
- **Sanctions / deny-list guard** — screens both surfaces; already used by the platform's other value
  surfaces.
- **Reporting** — consumes the new ledger entries.
- **Admin control panel and its role-gated navigation** — hosts the two new control views.
- **Earn section (spec 050)** — hosts the Supply area and supplies the card and disclosure patterns to
  match.
- **Transfer section** — hosts the Bridge surface alongside the existing send and activity flows.
- **Wager Pools (spec 034)** — not a functional dependency, but the owner of the existing `pool`
  vocabulary that this feature must not collide with (FR-039).
- **Bitcoin networks (spec 061)** — explicitly excluded; the boundary must be respected so Bitcoin
  network identifiers never reach EVM-only bridge or pool code paths.

## Out of Scope

- FairWins-operated bridge contracts, liquidity pools, relayers, or attestation infrastructure.
- Concentrated-liquidity Uniswap positions, range presets, rebalancing, and auto-managed LP vaults.
- Bitcoin and any other non-EVM network on either surface.
- Cross-chain execution of FairWins' own products (wagers, wager pools, memberships) — this feature
  moves and pools assets, it does not make other products cross-chain.
- Automatic yield optimization, auto-compounding, or migrating members between pools.
- Publishing the content deliverables to a live website.
