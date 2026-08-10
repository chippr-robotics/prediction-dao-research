# Feature Specification: Bitcoin Transactions

**Feature Branch**: `061-bitcoin-transactions`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Enable native Bitcoin (BTC) transactions on the FairWins platform, surfaced where BTC is functionally useful: the portfolio (show native BTC holdings alongside existing assets, priced in USD) and the send/receive flows (send BTC to any valid Bitcoin address; receive BTC via displayed addresses/QR). The implementation must support: (1) address rotation — fresh receive addresses per request so members don't reuse addresses, with all past addresses still monitored for balance; (2) Bitcoin Stamps — recognize Stamps assets held in the member's UTXOs, display them in the portfolio/collectibles surface, and protect stamps-bearing UTXOs from being accidentally spent as fees/inputs in ordinary sends; (3) multiple address/transaction types, including taproot (P2TR, bech32m bc1p) as well as native segwit (P2WPKH, bech32 bc1q), for both receiving and sending (recognize and pay to legacy P2PKH, P2SH, bech32, and bech32m destinations). Bitcoin is a non-EVM chain: the feature must fit FairWins' existing account model (passkey-first) and its honest-disclosure UX rules. This is the first non-EVM network in the product."

## Overview

FairWins members hold and move value today only on EVM networks. Bitcoin is the
largest crypto asset by market value and the one members most often hold
elsewhere; today the portfolio can only show it as wrapped BTC (an ERC-20 proxy).
This feature gives every member a real Bitcoin wallet inside their existing
FairWins account — no new seed phrase, no separate app — surfaced exactly where
Bitcoin is functionally useful:

- **Portfolio**: native BTC balance appears alongside existing assets, priced in
  USD, aggregated with wrapped BTC under the single "Bitcoin" asset.
- **Receive**: fresh, never-reused Bitcoin addresses on demand (address
  rotation), shown as text + QR, with all previously issued addresses still
  watched and counted toward the balance.
- **Send**: pay any valid Bitcoin address (legacy, script-hash, native segwit,
  taproot) with the network fee honestly disclosed and confirmed before signing.
- **Stamps**: Bitcoin Stamps assets held by the member are recognized, shown in
  the collectibles surface, and structurally protected from being accidentally
  destroyed by an ordinary send.

Bitcoin is the platform's first non-EVM network. It supports **only** portfolio,
send, and receive — no wagers, no pools, no gasless sponsorship, no membership
actions — and the product must say so plainly wherever a member could otherwise
expect those features.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive Bitcoin with rotating addresses (Priority: P1)

A member wants to move BTC into FairWins. From the receive surface they pick
Bitcoin, and the app shows a fresh Bitcoin address (text + QR + share). The next
time they ask to receive, they get a *new* address — addresses are never handed
out twice — yet funds sent to any previously issued address still arrive and
count toward their balance. The member can choose the address format (modern
default, taproot optional) if they care, and ignore the choice if they don't.

**Why this priority**: Receiving is the on-ramp; nothing else in this feature is
useful until a member can get BTC into their wallet. Address rotation is the
privacy property the feature is named for, and it must exist from the first
address issued (rotation cannot be retrofitted onto a reused-address history).

**Independent Test**: With a funded external Bitcoin wallet, request a receive
address in FairWins, send a small amount to it, confirm the balance appears;
request a second address, confirm it differs from the first; send to the first
(older) address again and confirm the balance still updates.

**Acceptance Scenarios**:

1. **Given** a signed-in member on the receive surface, **When** they select
   Bitcoin, **Then** they see a valid Bitcoin address as copyable text, a
   scannable QR code, and a share action, clearly labeled as a Bitcoin address.
2. **Given** a member who has been shown a receive address, **When** they
   request a new receive address (or complete a receive and return), **Then**
   the address shown is one never previously displayed for this account.
3. **Given** a member with several previously issued addresses, **When** BTC is
   sent to any of them (including the oldest), **Then** the member's portfolio
   balance reflects the deposit.
4. **Given** the receive surface, **When** the member opens the address-type
   option, **Then** they can choose between the modern default format and
   taproot, the choice persists for future receives, and each format produces a
   valid address of that type.
5. **Given** a receive QR code, **When** it is scanned by a common external
   Bitcoin wallet, **Then** the wallet recognizes the address (and amount, when
   the member specified one) without manual correction.

---

### User Story 2 - See Bitcoin in the portfolio (Priority: P1)

A member who holds BTC (received via Story 1) opens their portfolio and sees a
"Bitcoin" row: total BTC across all their issued addresses, its USD value, and
— if they also hold wrapped BTC on an EVM chain — one aggregated Bitcoin
position with the native and wrapped instances visible in the detail view, just
like ETH/WETH today.

**Why this priority**: The portfolio is where members verify a receive worked
and see what they own; without it Story 1 is unverifiable inside the product.

**Independent Test**: Fund a member's Bitcoin addresses (multiple addresses,
plus WBTC on an EVM chain), open the portfolio, and verify one Bitcoin
aggregate row whose BTC quantity is the sum across addresses and whose USD
value matches quantity × current BTC/USD price.

**Acceptance Scenarios**:

1. **Given** a member with BTC spread across three issued addresses, **When**
   they open the portfolio, **Then** the Bitcoin position shows the summed
   balance and its USD value.
2. **Given** a member holding both native BTC and wrapped BTC, **When** they
   view the portfolio, **Then** a single aggregated Bitcoin row appears, and its
   detail view distinguishes the native Bitcoin holding from the wrapped
   instance(s) by network.
3. **Given** a member with zero BTC, **When** they view the portfolio, **Then**
   no misleading Bitcoin balance appears (the row is absent or explicitly
   zero, consistent with how other zero assets are treated).
4. **Given** the Bitcoin balance source is temporarily unreachable, **When** the
   portfolio loads, **Then** the Bitcoin position is marked as unavailable/stale
   rather than silently shown as zero.
5. **Given** a deposit that is broadcast but not yet confirmed, **When** the
   member views their balance, **Then** pending value is distinguished from
   confirmed value (no false finality).

---

### User Story 3 - Send Bitcoin to any valid address (Priority: P2)

A member wants to pay someone in BTC. From the send surface they select
Bitcoin, paste or scan the destination (any standard format — legacy `1…`,
script-hash `3…`, native segwit `bc1q…`, taproot `bc1p…`), enter an amount (or
MAX), review a confirmation that shows the amount, the destination, and the
estimated network fee as its own line, then approve. The app reports the
transaction as pending until the Bitcoin network confirms it.

**Why this priority**: Sending completes the money loop but is only useful once
receiving and balances (Stories 1–2) work; it also carries the most risk, so it
builds on a proven foundation.

**Independent Test**: With a funded FairWins Bitcoin wallet, send BTC to one
external address of each supported format; verify each transaction confirms on
the Bitcoin network, the fee shown at confirm time was honest (within the
disclosed estimate), and the portfolio balance decreases by amount + fee.

**Acceptance Scenarios**:

1. **Given** a funded member on the send surface, **When** they enter a valid
   destination of each standard type (legacy, script-hash, native segwit,
   taproot), **Then** the address is accepted and its type is recognized.
2. **Given** an invalid or wrong-network destination (typo, checksum failure,
   testnet address on mainnet, EVM `0x…` address), **When** entered, **Then**
   the send is blocked before confirmation with a clear reason.
3. **Given** a valid destination and amount, **When** the member reaches the
   confirmation step, **Then** the estimated network fee is displayed as its own
   line (in BTC and USD) before any signing occurs, and the total debit
   (amount + fee) is explicit.
4. **Given** a confirmed send, **When** the member views activity/balance,
   **Then** the transaction is shown as pending until network confirmation and
   the spendable balance reflects the outgoing amount immediately.
5. **Given** an amount that exceeds spendable balance once fees are included,
   **When** the member tries to proceed, **Then** the app explains the shortfall
   instead of failing later; **and** MAX computes the largest sendable amount
   net of the estimated fee.
6. **Given** fee conditions on the Bitcoin network change between quote and
   confirm, **When** the member approves, **Then** the fee actually paid never
   exceeds the disclosed estimate without a fresh confirmation.

---

### User Story 4 - Bitcoin Stamps recognized and protected (Priority: P3)

A member who holds Bitcoin Stamps (collectible assets embedded in Bitcoin
transactions) sees them in the FairWins collectibles surface alongside their
other collectibles. When they send ordinary BTC, the app never selects a
stamps-bearing coin as spending input — so a member cannot accidentally destroy
or give away a Stamp by paying for coffee. The BTC value locked alongside
Stamps is shown as part of their holdings but excluded from "spendable"
balance.

**Why this priority**: Stamps protection is a safety property for a subset of
members, valuable but dependent on send (Story 3) existing; recognition/display
is additive to the portfolio (Story 2).

**Independent Test**: Fund a member address that holds a known Stamp; verify
the Stamp appears in collectibles; attempt sends up to MAX and verify the
stamps-bearing coin is never consumed and spendable balance excludes it.

**Acceptance Scenarios**:

1. **Given** a member whose addresses hold one or more Bitcoin Stamps, **When**
   they open the collectibles surface, **Then** each Stamp is listed with its
   image/identifier, labeled as a Bitcoin Stamp.
2. **Given** a member with Stamps, **When** they send ordinary BTC (any amount
   up to MAX), **Then** the transaction never spends a stamps-bearing coin.
3. **Given** a member whose only funds are locked alongside Stamps, **When**
   they attempt a send, **Then** the app explains that this value is protected
   and not spendable through the ordinary send flow.
4. **Given** the Stamps recognition source is unavailable, **When** the member
   sends BTC, **Then** the app fails safe: coins that cannot be confirmed
   stamp-free are treated as protected (no accidental spend), and the member is
   told recognition is temporarily degraded.

---

### User Story 5 - Honest capability disclosure for Bitcoin (Priority: P3)

A member exploring networks sees Bitcoin listed with an accurate capability
statement: portfolio, send, and receive are supported; wagers, pools,
memberships, gasless sponsorship, and all contract-based features are not.
Nothing in the product implies a member can wager in BTC or that BTC sends can
be fee-sponsored.

**Why this priority**: Trust surface. Cheap to build, but it prevents the
worst outcome — a member misled about what Bitcoin can do on the platform.

**Independent Test**: Review every surface where networks/features are listed
or selected; verify Bitcoin appears only where supported, is absent (or
explicitly marked unsupported) everywhere else, and its network page states its
capabilities truthfully.

**Acceptance Scenarios**:

1. **Given** the network information surface, **When** a member views Bitcoin,
   **Then** supported capabilities (portfolio, send, receive) and unsupported
   ones (wagers, pools, membership, gasless) are each explicitly stated.
2. **Given** wager/pool/membership creation flows, **When** a member selects
   assets or networks, **Then** Bitcoin is not offered.
3. **Given** the send confirmation for Bitcoin, **When** displayed, **Then** it
   never describes the transaction as gasless or fee-sponsored; the member
   always pays the Bitcoin network fee and is told so.

---

### Edge Cases

- Member restores their account (passkey recovery / new device): all previously
  issued addresses and their funds MUST be recoverable deterministically from
  the account itself — losing a device must not lose Bitcoin or break rotation
  continuity.
- A sender pays the same issued address twice, or pays an address far ahead of
  the rotation sequence: funds are still detected and counted.
- Deposit detected while the member is watching the receive screen: surface it
  (at least on refresh) rather than requiring a portfolio visit.
- Unconfirmed inbound funds: not spendable until confirmed; shown as pending.
- Dust-level deposits and dust change: the send flow avoids creating
  uneconomical outputs and never strands value silently.
- Bitcoin network fee spikes: quotes refresh; a stale quote is never silently
  honored (Story 3, scenario 6).
- Member pastes a BIP-21 style `bitcoin:` payment link instead of a bare
  address: destination and amount populate correctly.
- Testnet/mainnet separation: Bitcoin testnet activity is never mixed with
  mainnet balances, mirroring the platform's existing testnet/mainnet pairing
  rules.
- Stamps false positives/negatives: recognition prefers false positives
  (over-protection) to false negatives (accidental destruction).
- The member's balance spans many addresses: sends may combine coins from
  multiple issued addresses in one transaction; this is expected and must not
  confuse the activity view.
- Concurrent sends: a second send started before the first confirms must not
  double-spend the same coins.

## Requirements *(mandatory)*

### Functional Requirements

**Wallet & account model**

- **FR-001**: Each member account MUST have exactly one Bitcoin wallet, derived
  deterministically from the member's existing FairWins account credentials —
  no new seed phrase, password, or backup artifact is introduced for v1.
- **FR-002**: Bitcoin private keys MUST exist only on the member's device;
  FairWins services MUST never receive, store, or be able to reconstruct them
  (non-custodial, matching the platform's existing account model).
- **FR-003**: After account recovery on a new device, the member's Bitcoin
  wallet — all issued addresses, balances, and rotation position — MUST be
  restored without any Bitcoin-specific backup step.

**Receiving & address rotation**

- **FR-004**: The receive surface MUST offer Bitcoin and display, for each
  request, a fresh address never previously shown for that account, as
  copyable text, QR code, and shareable payment link (with optional amount).
- **FR-005**: All previously issued addresses MUST remain monitored
  indefinitely; funds arriving at any of them MUST appear in the member's
  balance and activity.
- **FR-006**: Members MUST be able to choose the receive address type between
  native segwit (default) and taproot; the choice persists per account and
  each type yields standard-compliant addresses external wallets accept.
- **FR-007**: Receive addresses MUST be clearly labeled as Bitcoin (mainnet vs
  testnet where applicable) and MUST be visually/textually distinct from the
  member's EVM address so the two cannot be confused.

**Portfolio**

- **FR-008**: The portfolio MUST show the member's total confirmed BTC across
  all issued addresses, with USD value from the platform's existing Bitcoin
  price source, aggregated with wrapped BTC under the single Bitcoin asset
  (native + wrapped roll-up, consistent with existing native/wrapped behavior).
- **FR-009**: Pending (unconfirmed) inbound and outbound value MUST be
  distinguished from confirmed balance; the portfolio MUST never present
  unconfirmed value as final.
- **FR-010**: When Bitcoin balance data cannot be fetched, the portfolio MUST
  mark the position stale/unavailable rather than showing zero or cached data
  as current.

**Sending**

- **FR-011**: Members MUST be able to send BTC to any syntactically valid
  mainnet destination of the standard types: legacy (P2PKH), script-hash
  (P2SH), native segwit v0 (bech32), and taproot/segwit v1 (bech32m).
  Invalid, checksum-failing, wrong-network, or non-Bitcoin destinations MUST be
  rejected before confirmation with a specific reason.
- **FR-012**: The send confirmation MUST disclose, before any signing: amount,
  destination (with recognized type), estimated network fee as its own line in
  BTC and USD, and total debit. The fee actually committed MUST NOT exceed the
  disclosed estimate without re-confirmation.
- **FR-013**: The send flow MUST support MAX (largest spendable amount net of
  fees), MUST block sends that cannot cover amount + fee with a clear
  shortfall explanation, and MUST avoid creating uneconomical (dust) change.
- **FR-014**: Sends MUST be signed on the member's device and broadcast to the
  Bitcoin network; the app MUST show the transaction as pending until
  confirmed and MUST prevent the same coins from being committed to two
  concurrent sends.
- **FR-015**: Bitcoin sends are never gasless or fee-sponsored in v1; every
  fee-related surface MUST state that the member pays the Bitcoin network fee.
- **FR-016**: The app MUST accept `bitcoin:` payment links (scan or paste) and
  populate destination and amount from them.

**Bitcoin Stamps**

- **FR-017**: The platform MUST recognize Bitcoin Stamps held in the member's
  wallet and display them in the collectibles surface, labeled as Bitcoin
  Stamps, with available imagery/identifiers.
- **FR-018**: Ordinary sends MUST never select stamps-bearing coins as inputs.
  Value locked alongside Stamps MUST be excluded from spendable balance and
  MUST be visibly accounted for (the member can see why total ≠ spendable).
- **FR-019**: When Stamps recognition is unavailable or uncertain, coin
  selection MUST fail safe: any coin not positively known stamp-free is
  treated as protected, and the member is informed recognition is degraded.

**Capability honesty & scope**

- **FR-020**: Bitcoin MUST self-disclose its capabilities wherever networks are
  described: portfolio, send, receive supported; wagers, pools, membership,
  gasless, and all contract-based features unsupported. Bitcoin MUST NOT be
  offered in any flow it does not support.
- **FR-021**: Bitcoin testnet and mainnet MUST be strictly separated, following
  the platform's existing testnet/mainnet pairing rules; testnet balances and
  addresses never appear in mainnet contexts or vice versa.
- **FR-022**: Existing EVM functionality MUST be unaffected: a member who never
  touches Bitcoin sees no behavioral change beyond the new network appearing
  in supported surfaces.

### Key Entities

- **Bitcoin Wallet**: The per-member Bitcoin key context, derived from the
  member's existing account; owns the rotation state and all issued addresses.
- **Issued Address**: A receive address handed to the member at a point in
  time; attributes: type (native segwit / taproot), derivation position,
  network (mainnet/testnet), first-shown timestamp; permanently monitored.
- **Coin (UTXO)**: A discrete piece of spendable Bitcoin value held at an
  issued address; attributes: amount, confirmation status, protected flag
  (stamps-bearing or unverified).
- **Bitcoin Transaction**: An inbound or outbound transfer; attributes:
  direction, amount, fee (outbound), destination/source, confirmation state;
  appears in the activity surface.
- **Stamp**: A Bitcoin Stamps collectible bound to a specific coin; attributes:
  identifier, image/preview, the coin it travels with; displayed in
  collectibles, protected in coin selection.
- **Fee Quote**: A point-in-time estimate of the network fee for a proposed
  send; attributes: rate basis, estimated total, freshness; what the member
  confirms against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can go from opening the receive surface to holding a
  scannable Bitcoin address in under 15 seconds, and 100% of consecutive
  receive requests produce distinct addresses.
- **SC-002**: Deposits to any previously issued address (tested across at least
  10 rotated addresses per account) appear in the member's balance with zero
  missed deposits.
- **SC-003**: 100% of test sends to each of the four standard destination
  types confirm on the Bitcoin network, and in every case the fee paid is ≤
  the estimate the member confirmed.
- **SC-004**: Zero stamps-bearing coins are spent by ordinary sends across the
  full send test matrix (including MAX sends and degraded-recognition mode).
- **SC-005**: Portfolio BTC balances match an independent Bitcoin block
  explorer for the same addresses in 100% of checks, with pending vs confirmed
  value correctly distinguished.
- **SC-006**: After account recovery on a fresh device, 100% of previously
  issued addresses and funds are restored with no Bitcoin-specific user action.
- **SC-007**: Every surface listing Bitcoin capabilities passes an honesty
  review: no surface offers or implies wagers, pools, membership, or gasless
  on Bitcoin.
- **SC-008**: Members not using Bitcoin experience no regression: existing
  portfolio/send/receive test suites pass unchanged.

## Assumptions

- **Custody model**: v1 follows the platform's non-custodial, passkey-first
  account model; the Bitcoin wallet is derived deterministically from existing
  account credentials rather than a new seed phrase. Members who want
  self-managed external keys continue to use external wallets.
- **Default address type**: native segwit (bech32) is the default receive type
  for broadest external-wallet compatibility; taproot (bech32m) is the opt-in
  alternative. Both are fully supported for sending.
- **Stamps scope**: v1 recognizes, displays, and protects Stamps. Transferring
  a Stamp to another address, and creating/minting Stamps, are out of scope.
- **Fees**: no FairWins platform fee on Bitcoin sends in v1 — members pay only
  the Bitcoin network fee (consistent with EVM native-asset sends). If a
  platform fee is added later it goes through the platform's single
  fee-configuration source of truth.
- **Wagering scope**: BTC is not a wager/pool/membership asset. No smart
  contracts exist on Bitcoin and none of the platform's contract features
  extend to it in v1.
- **Balance data**: balance/coin/Stamps data comes from public Bitcoin network
  data sources proxied through platform infrastructure with quotas and honest
  degradation, consistent with how other external data (e.g. prediction
  markets, collectibles) is proxied today.
- **Price data**: BTC/USD pricing reuses the platform's existing Bitcoin price
  feeds (already configured for wrapped BTC).
- **Networks**: Bitcoin mainnet plus one Bitcoin test network (for the
  platform's existing testnet workflow); no other Bitcoin-family chains
  (Litecoin, forks) are in scope.
- **Lightning**: out of scope for v1; on-chain transactions only.
- **Address monitoring cardinality**: rotation is bounded in practice by use;
  monitoring follows standard discovery conventions (a bounded look-ahead
  window of unused addresses) so restored wallets find all funds.
