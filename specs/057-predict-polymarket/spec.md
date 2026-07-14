# Feature Specification: Predict — Polymarket Prediction-Market Trading

**Feature Branch**: `057-predict-polymarket`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Add a 'Predict' section that lets a member with a
connected wallet browse Polymarket prediction markets and buy or sell outcome
shares, all routed through FairWins' Polymarket **builder code** so FairWins earns a
builder fee on attributed volume — the same 'collect revenue on trades that flow
through us' shape as the Collect/OpenSea feature. The app never custodies funds or
positions; the member's own wallet signs every order; honest fee disclosure before
signing (including that FairWins' builder fee is charged on top of Polymarket's own
taker fee); server-side credentials only; never-stranded fallback to Polymarket
directly. Out of scope: creating/resolving markets, providing liquidity beyond normal
limit orders, any custody, and any FairWins contract changes."

## Clarifications

### Session 2026-07-14

- Q: How should FairWins earn from Predict trades? → A: Via Polymarket's **builder-code
  program** — a `bytes32` builder code attached to every order attributes volume to
  FairWins and lets it charge a builder fee. FairWins also passively earns Polymarket's
  weekly USDC builder-rewards pool on attributed volume even at a zero fee.
- Q: What builder fee should FairWins charge? → A: **50 bps taker / 0 bps maker**
  (0.50% on taker orders, nothing on maker orders). Half of Polymarket's 100 bps taker
  cap; makers are kept whole to match Polymarket's maker-friendly model. The fee is a
  tunable server-side config value, not hardcoded, because Polymarket rate-limits fee
  changes (one change per 7 days, 3-day notice).
- Q: Is the builder fee free to the user like OpenSea's referral reward? → A: **No.**
  Unlike OpenSea's affiliate reward (which comes out of OpenSea's own fee at no user
  cost), Polymarket's builder fee is **additive** — it stacks on top of Polymarket's
  platform taker fee and is a real cost to the taker. Therefore the confirm UI MUST
  disclose the builder fee explicitly and honestly as part of the total cost, never
  hide it or imply it is free.
- Q: Who can use Predict, and how does gating apply? → A: **Any connected wallet** (no
  membership-tier gate on trading), mirroring Collect. Membership-tier gating applies
  only to gasless/sponsored gas for a step, if offered; the user-pays-gas path stays
  open to all.
- Q: Are passkey smart-account members in scope? → A: **Yes**, via contract-based
  (ERC-1271) order signatures over the CLOB order struct, reusing the existing
  `passkeyIntentSigner` seam. Where Polymarket's CLOB cannot validate a given account's
  signature, that action is shown as honestly unavailable per-account (never a dead
  button), not a blanket passkey exclusion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse markets and open a position (Priority: P1)

A member opens the **Predict** section, browses live Polymarket markets (by category,
search, and volume), and picks a market. They choose an outcome (e.g. "Yes"), enter an
amount, and — before approving anything — are shown exactly what they will pay: the
share price, Polymarket's platform taker fee, **FairWins' builder fee (0.50%)**, and the
total cost, each labeled and fetched live. They approve the order with their own wallet
(a gas-free CLOB signature), the order is routed to Polymarket's order book **carrying
FairWins' builder code**, and on fill their outcome shares appear as a position. Funds
and shares are custodied by Polymarket's on-chain protocol, never by FairWins.

**Why this priority**: Opening a position is the core revenue-generating action — it is
the moment the builder code is attached and FairWins earns. It is independently
valuable and testable: a member can find a market and buy shares even before selling or
positions-management exist.

**Independent Test**: Connect a wallet on Polygon, open Predict, search a live market,
choose an outcome, enter an amount, confirm the total cost (platform fee + builder fee)
matches the fee breakdown returned by the market, approve, and verify the position
appears and the submitted order carried the builder code.

**Acceptance Scenarios**:

1. **Given** a member on Polygon opens Predict, **When** the markets load, **Then** they
   can browse and search live Polymarket markets with current prices and volume.
2. **Given** a member selects a market and an outcome and enters an amount, **When** the
   order confirmation is shown, **Then** it displays the price, Polymarket's platform
   taker fee, **FairWins' builder fee**, and the total cost — each labeled with its
   currency (USDC) and fetched live, not hardcoded — before any approval is requested.
3. **Given** the member approves the order in their wallet, **When** the signature
   succeeds, **Then** the order is posted to Polymarket's book carrying FairWins'
   builder code, and on fill the outcome shares show as a position.
4. **Given** the order is a maker (resting limit) order, **When** the confirmation is
   shown, **Then** it correctly reflects **no builder fee and no platform fee** (maker
   = 0), so the member is never shown a fee they will not pay.
5. **Given** the member declines the wallet signature, **When** they cancel out,
   **Then** no order is posted and nothing is charged.

---

### User Story 2 - Close or reduce a position (Priority: P2)

A member viewing an owned Predict position chooses **Sell**, sees the current best bid
and the net proceeds after fees, and closes (or partially closes) the position with a
CLOB order routed through the builder code. Proceeds (USDC) settle to their wallet via
Polymarket's protocol.

**Why this priority**: Selling completes the round trip and is a second builder-code
attribution moment. It depends on the position/read layer but is otherwise independent
of opening.

**Independent Test**: With a wallet holding an outcome position, open it, confirm the
shown net proceeds (best bid − fees) matches the market's fee breakdown, sell, and
verify the position reduces and USDC arrives.

**Acceptance Scenarios**:

1. **Given** a member holds a position with a live best bid, **When** they open it,
   **Then** the best bid, the applicable fees, and the net proceeds are shown honestly
   (or an explicit "no bid / illiquid" state when none exists).
2. **Given** the member chooses Sell and the sell is a taker order, **When** the
   confirmation is shown, **Then** the platform taker fee and FairWins builder fee are
   disclosed before approval and the net proceeds reflect them.
3. **Given** the member approves the sell, **When** it fills, **Then** the position
   reduces by the filled size and USDC proceeds settle to their wallet.
4. **Given** the market price moves between viewing and submitting, **When** the member
   submits a stale price, **Then** the app detects the move and re-confirms rather than
   filling at an outdated expectation (or uses the member's chosen limit price).

---

### User Story 3 - Manage open orders (Priority: P3)

A member can view their open (unfilled) Predict orders and **cancel** any of them.
Cancellation is a free (gas-less) CLOB action. After cancellation the order no longer
rests on the book.

**Why this priority**: A necessary safety valve for resting limit orders from Stories 1
and 2, but not itself a revenue moment; it can ship after buy and sell.

**Independent Test**: Place a resting limit order (Story 1/2), view it in open orders,
cancel it, and verify it is removed with no gas charged.

**Acceptance Scenarios**:

1. **Given** a member has an open order, **When** they open the orders view, **Then** a
   Cancel action is available for it.
2. **Given** the member cancels, **When** they approve the cancellation, **Then** the
   order is removed from the book with no gas charged and no fill occurs.

---

### Builder-fee attribution (cross-cutting behavior, applies to Stories 1–3)

Every order the app posts to Polymarket carries FairWins' `bytes32` builder code so
FairWins earns (a) its configured builder fee on taker volume and (b) a share of
Polymarket's weekly USDC builder-rewards pool on all attributed volume. **Unlike the
Collect feature's OpenSea referral reward, the builder fee is a real, additive cost to
the taker** — it stacks on Polymarket's own platform fee. It is therefore surfaced
honestly as a distinct line in every cost/proceeds breakdown before signing, never
hidden and never described as free. Makers pay no builder fee. The builder code and fee
rates are server-side config; the fee is never larger than Polymarket's caps (100 bps
taker, 50 bps maker).

**Acceptance Scenarios**:

1. **Given** an order is posted through the app, **When** it is submitted to
   Polymarket, **Then** it carries FairWins' builder code in the signed order.
2. **Given** a taker order's cost/proceeds breakdown is shown, **When** the builder fee
   applies, **Then** it appears as its own labeled line and is included in the total the
   member sees before signing (the number shown equals the number they pay/net).
3. **Given** a maker order, **When** the breakdown is shown, **Then** no builder fee is
   charged or displayed.
4. **Given** the builder code is misconfigured or absent server-side, **When** an order
   would be posted, **Then** the app still lets the member trade (never stranded) but
   attributes no fee, rather than blocking trading on a revenue concern.

---

### Edge Cases

- **Unsupported network active (e.g. Ethereum mainnet, Mordor/ETC)**: no Predict
  affordances appear — Polymarket is Polygon-only, so the tab hides entirely off
  Polygon, consistent with Collect hiding on unsupported chains (FR-007 pattern).
- **Passkey smart-account trader**: passkey accounts CAN trade via ERC-1271 order
  signatures. The honest-unavailable disclosure is a per-account fallback ONLY where
  the CLOB cannot validate a specific account's signature, never a dead button.
- **Market data source unavailable / rate-limited**: trade actions degrade gracefully —
  the member is told trading is temporarily unavailable and no partial or ambiguous
  order is created; cached market/position data still displays where possible, labeled
  as such.
- **Killswitch engaged**: order submission is paused with an honest message; the member
  can still reach Polymarket directly to act (never stranded).
- **Fee data cannot be fetched**: the app does NOT let the member sign an order without
  a confirmed fee breakdown — it blocks with an explicit "couldn't confirm fees, try
  again" rather than guessing or showing a hardcoded rate. (Polymarket instructs clients
  to read fees live from the market's fee schedule, not hardcode them.)
- **Builder fee would exceed Polymarket's cap**: the app clamps/validates the configured
  fee to ≤ 100 bps taker and ≤ 50 bps maker at boot and refuses to submit an order
  carrying an out-of-range fee, failing loudly in config rather than silently.
- **USDC allowance not set**: opening a position may require a one-time USDC approval to
  Polymarket's exchange; the app discloses that it is a one-time on-chain approval (with
  gas) and what it authorizes before requesting it.
- **Wallet on a different chain than Polygon**: the app prompts the member to switch to
  Polygon before signing and never signs an order bound to the wrong network.
- **Market resolved / closed**: a resolved or closed market shows as non-tradable with
  an honest state; the app does not present a buy/sell affordance that would fail.
- **Illiquid / no book**: a market or outcome with no book shows "no liquidity" rather
  than a misleading price, and the app does not let the member submit an order that
  cannot reasonably fill without disclosure (limit orders still allowed, clearly resting).

## Requirements *(mandatory)*

### Functional Requirements

**Browse & open position (Story 1)**

- **FR-001**: A member with a connected wallet on Polygon MUST be able to browse and
  search live Polymarket markets (price, outcome, volume, category) within the Predict
  section.
- **FR-002**: A member MUST be able to place a buy order for a chosen market outcome,
  specifying amount and (for limit orders) price and order type.
- **FR-003**: Before requesting any signature, the app MUST show the member the share
  price, Polymarket's platform fee (taker) or its absence (maker), **FairWins' builder
  fee** where it applies, and the total cost — each with its currency (USDC), derived
  from live market/fee data, never hardcoded.
- **FR-004**: The order MUST be authorized by the member's own wallet as a gas-free CLOB
  signature; the app MUST NOT custody funds or positions at any point. Settlement is on
  Polymarket's on-chain protocol.
- **FR-005**: When a one-time on-chain USDC approval is required before trading, the app
  MUST disclose that it costs gas and what it authorizes before requesting it.

**Close / reduce position (Story 2)**

- **FR-006**: A member MUST be able to view their Predict positions (outcome, size,
  current value/best bid) and place a sell order to close or reduce a position.
- **FR-007**: Selling MUST disclose the applicable fees (platform + builder for a taker
  sell) and the net proceeds before approval; the member's own wallet signs.
- **FR-008**: The app MUST detect a material price move (or honor the member's limit
  price) rather than filling a market sell at a stale expectation.

**Manage open orders (Story 3)**

- **FR-009**: A member MUST be able to view their open (unfilled) orders and cancel any
  of them via a gas-free CLOB cancellation.

**Fee & value honesty (all stories)**

- **FR-010**: The app MUST NOT allow a member to sign an order when the required fee
  breakdown cannot be confirmed; it MUST block with an explicit retry instead of
  guessing or using a hardcoded rate.
- **FR-011**: Every displayed monetary value MUST carry its currency (USDC), and the
  total-cost / net-proceeds figure the app shows MUST equal what the member actually
  pays / nets for the same order — including the additive builder fee — with no
  discrepancy the member could be misled by.
- **FR-012**: The app MUST disclose FairWins' builder fee honestly as a distinct,
  labeled line included in the total whenever it applies (taker orders); it MUST NOT
  hide it, bundle it invisibly into price, or describe it as free. Maker orders MUST
  show no builder fee.

**Builder-code attribution (cross-cutting)**

- **FR-013**: The app MUST attach FairWins' `bytes32` builder code to every order it
  posts to Polymarket on a supported network, so attributed volume earns FairWins its
  builder fee and its share of Polymarket's builder-rewards pool.
- **FR-014**: FairWins' builder fee rates MUST be server-side configuration (default
  50 bps taker / 0 bps maker), validated at boot to be within Polymarket's caps (≤ 100
  bps taker, ≤ 50 bps maker); an out-of-range configured fee MUST fail loudly at boot.
- **FR-015**: If the builder code is unconfigured or attribution is unavailable, the app
  MUST still allow the member to trade (never stranded), attributing no fee rather than
  blocking trading on a revenue concern.

**Guardrails & availability (all stories)**

- **FR-016**: Polymarket API credentials (API key + derived L2 HMAC secret/passphrase)
  MUST remain server-side only; no Polymarket credential may reach client devices. Order
  submission and market/fee/position reads MUST flow through the FairWins-operated
  server-side proxy with request quotas and a killswitch.
- **FR-017**: When the killswitch is engaged or Polymarket is unavailable, order
  submission MUST pause with an honest message; the app MUST always leave the member a
  path to act directly on Polymarket (never stranded).
- **FR-018**: On networks where the feature is unsupported (anything other than
  Polygon), no Predict affordances may appear.
- **FR-019**: Passkey smart-account members MUST be able to trade using contract-based
  (ERC-1271) order signatures. Where the CLOB cannot validate a specific account's
  signature, the affected action MUST be shown as unavailable with an honest reason
  (never a dead button) — this fallback applies per-account, not as a blanket passkey
  exclusion.
- **FR-020**: No wager, pool, payment, or transfer flow may depend on this feature; its
  complete absence or outage MUST NOT affect any value-path functionality.
- **FR-021**: The app MUST NOT sign an order bound to a network other than the connected
  wallet's active network; it MUST prompt the member to switch to Polygon first.
- **FR-022**: All new Predict surfaces MUST meet WCAG 2.1 AA (keyboard-operable amount /
  price entry and confirmations, accessible names, sufficient contrast, and clear fee
  disclosure text).
- **FR-023**: Predict MUST be available to any connected wallet with no membership-tier
  gate. If the app offers to sponsor gas for any Predict step (e.g. a one-time USDC
  approval), that sponsorship MUST follow the app's existing membership-tier gating for
  gasless/sponsored transactions; the user-pays-gas path MUST remain open to all.

### Key Entities

- **Market**: a Polymarket prediction market — question, category, resolution date,
  outcomes (e.g. Yes/No) each with a token id, current price, volume, and liquidity
  state. Read-only reference; the app never creates or resolves markets.
- **Order (CLOB order)**: a member's signed intent to buy or sell a quantity of an
  outcome token at a price — side (BUY/SELL), token id, price, size, order type
  (GTC/FOK/…), the member's wallet as signer, and the attached FairWins builder code.
  Holds no funds; settles on Polymarket's protocol when matched.
- **Position**: outcome tokens (ERC-1155 CTF shares) the member holds — market, outcome,
  size, current value/best bid. Custodied by Polymarket's protocol, surfaced read-side.
- **Fee breakdown**: for a given order, Polymarket's platform fee (taker; maker = 0) and
  FairWins' builder fee (taker; maker = 0), each with rate/amount and currency — the
  basis for the total-cost / net-proceeds figure. Platform fee sourced live from the
  market's fee schedule; builder fee computed from server config, never hardcoded in the
  client.
- **Total cost / net proceeds**: the single honest number the member sees before signing
  — cost = price×size + platform fee + builder fee (buy); proceeds = price×size −
  platform fee − builder fee (sell) — in USDC.
- **Builder attribution**: the record that FairWins' builder code is attached to an
  order and the fee it will earn; carries the builder fee (a real user cost) and holds
  no funds. Distinct from Collect's no-cost referral attribution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can go from opening Predict to a submitted order in at most 5
  interactions, and the total-cost (with the builder fee itemized) is shown before
  approval in 100% of buy and taker-sell flows.
- **SC-002**: In 100% of cases, the total-cost / net-proceeds figure the app shows
  equals what the member actually pays / nets for the same order, including the additive
  builder fee (no user-visible discrepancy).
- **SC-003**: In 100% of taker orders, FairWins' builder fee is shown as its own labeled
  line before signing; in 100% of maker orders, no builder fee is charged or shown.
- **SC-004**: Across every entry point, there are 0 dead Predict buttons — on
  unsupported networks, unsupported account types, killswitch, resolved markets, or
  outage, the affordance is either hidden or shown disabled with an honest reason, and a
  path to act on Polymarket directly remains.
- **SC-005**: The feature never custodies a member's funds or positions — 100% of value
  transfer is wallet-to-Polymarket-to-wallet, verifiable by the member's wallet being
  the only signer.
- **SC-006**: No Polymarket credential appears in any client-delivered asset or
  repository file (verifiable by inspection), and a single member cannot exhaust shared
  Polymarket API capacity for others.
- **SC-007**: FairWins' builder code is attached to ≥ 99% of orders submitted through
  the app on Polygon (the remainder being cases where the code was unconfigured and
  trading correctly proceeded unattributed rather than blocking).
- **SC-008**: The app blocks signing in 100% of cases where the fee breakdown could not
  be confirmed, rather than showing a guessed or hardcoded fee.
- **SC-009**: A passkey smart-account member can complete a buy and a sell on Polygon;
  only where the CLOB cannot validate their account's signature do they instead see an
  honest unavailable state — never a failed action.
- **SC-010**: The configured builder fee is within Polymarket's caps in 100% of boots;
  an out-of-range configuration fails startup loudly rather than submitting an invalid
  order.

## Assumptions

- **Mirrors Collect (specs 055 + 056)**: reuses the section/nav pattern, the
  network-capability gating, the server-side marketplace proxy shape (client + routes +
  normalize + a revenue-attribution seam), honest-state and soft-fail conventions, the
  killswitch + per-address/global quotas, and the single `signTypedData` +
  `passkeyIntentSigner` signing seam. Predict is a **new** section, not a modification of
  Collect.
- **Marketplace**: Polymarket is the sole venue, via its CLOB V2 API (`clob.polymarket.com`).
  Orders post to Polymarket's order book; settlement is on Polymarket's shared on-chain
  protocol (`CTFExchangeV2` / CTF ERC-1155 outcome tokens), so the app can censor (refuse
  to submit) but never steal or strand.
- **Network**: **Polygon (chain 137) only** — Polymarket operates exclusively on Polygon.
  Ethereum mainnet and all testnets are unsupported for Predict; the tab hides there.
- **Revenue mechanism**: Polymarket's builder-code program is the source of revenue — a
  `bytes32` builder code (FairWins': `0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3`)
  attached to each order. Two streams: (1) an explicit builder fee (config: 50 bps taker
  / 0 maker) charged additively on the taker, accrued to FairWins' registered wallet; and
  (2) a share of Polymarket's weekly USDC builder-rewards pool on attributed volume,
  earned even at a zero fee. The exact builder-code parameter name on the V2 order struct
  / SDK is confirmed during planning (`builder` bytes32 field on the signed order;
  `builderCode` option on `@polymarket/clob-client-v2`).
- **Fee model (key honesty difference from Collect)**: Polymarket's builder fee is
  **additive** and a real user cost, unlike OpenSea's referral reward which comes out of
  OpenSea's own fee at no user cost. Predict therefore discloses the builder fee as an
  explicit cost line, matching the app's "confirm UI must disclose the fee honestly" rule.
- **Competitive positioning**: Polymarket platform taker fees (curved, peak ~1.8% Crypto
  down to ~0.75% Sports; makers 0) plus a 50 bps builder fee keeps FairWins competitive
  with Kalshi (~up to 1.75%) and other builders (typical 0–1%), while the weekly
  rewards pool provides a second, low-friction revenue stream. See research.md.
- **Signing model**: buys, sells, and cancellations are gas-free CLOB order signatures
  (EIP-712 typed data over Polymarket's V2 order struct, domain "Polymarket CTF
  Exchange" v2, chainId 137); the underlying order protocol is Polymarket's, treated as
  the venue's mechanism rather than a FairWins design choice. A one-time USDC allowance
  to Polymarket's exchange may be an on-chain (gas) approval.
- **Credentials**: L1 (EIP-712 wallet signature) derives L2 API credentials
  (key/secret/passphrase) once; every authenticated request is L2 HMAC-signed. All of
  this lives server-side in the gateway; the client never holds a Polymarket credential.
  The member's own wallet still signs the order struct itself (that signature is what
  authorizes the trade and cannot be server-side).
- **Access & gating**: trading is open to any connected wallet with no membership-tier
  gate, consistent with Collect. Tier gating applies only to gasless/sponsored gas for a
  step if offered; the user-pays-gas path is always available.
- **No custody, additive builder fee only**: the app never holds funds or positions and
  adds no fee beyond the disclosed Polymarket builder fee. Its economic interest is the
  builder fee plus Polymarket's rewards pool.
- **ToS**: participating in Polymarket's builder program and posting to its order book
  are governed by Polymarket's terms; a terms review of the builder configuration
  happens before launch. Geographic/eligibility restrictions Polymarket enforces are
  Polymarket's to enforce; the app does not circumvent them.
- **Out of scope (deliberately excluded)**: creating or resolving markets; market-making
  strategies or liquidity provisioning beyond ordinary limit orders; cross-venue
  aggregation; any FairWins surcharge beyond the disclosed builder fee; any on-chain
  FairWins contract changes; and any custody of funds or positions — this feature is
  frontend + the existing server-side proxy only.
