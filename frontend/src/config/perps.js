/**
 * Perps (spec 082) — venue registry, availability, and deep links for the Perps view inside Trade.
 *
 * The Perps surface is a market-data view over three external perpetual-futures venues. Two facts
 * shape everything here:
 *
 *   1. Market data is NETWORK-TRANSPARENT (the Earn convention): the view lists every venue at
 *      once with venue/chain badges, regardless of the wallet's active chain. There is therefore
 *      no `PERPS_CHAIN_IDS` capability set on network objects — availability is a property of the
 *      BUILD COHORT + the gateway, not of the active chain.
 *   2. Hyperliquid is a NON-EVM venue (its own L1). It never gets a numeric chain id and must
 *      never reach EVM-only seams (getContractAddressForChain / wagmi / NETWORKS lookups) —
 *      the spec-061 Bitcoin precedent (FR-012). `isEvmPerpVenue` is the boundary guard.
 *
 * Cohort honesty (FR-017): every venue here is a MAINNET venue. On a testnet cohort the view does
 * not fetch or render mainnet pairs as if they were local — `perpsCohortSupported()` gates it and
 * the view discloses mainnet-only availability instead.
 */
import { membershipChainId, MAINNET_CHAIN_ID } from './networks'

/**
 * The venue registry. `chains` are display/badge facts, not resolution targets — nothing in this
 * release resolves a contract address for a venue.
 */
export const PERP_VENUES = {
  gains: {
    id: 'gains',
    label: 'Gains Network',
    shortLabel: 'Gains',
    evm: true,
    chains: [42161, 8453, 137],
    homepage: 'https://gains.trade',
  },
  gmx: {
    id: 'gmx',
    label: 'GMX',
    shortLabel: 'GMX',
    evm: true,
    chains: [42161],
    homepage: 'https://app.gmx.io',
  },
  hyperliquid: {
    id: 'hyperliquid',
    label: 'Hyperliquid',
    shortLabel: 'HL',
    evm: false, // its own L1 — never a numeric chain id (FR-012)
    chains: [],
    homepage: 'https://app.hyperliquid.xyz',
  },
}

export const PERP_VENUE_IDS = Object.keys(PERP_VENUES)

/** Boundary guard: only EVM venues may ever be joined to NETWORKS/chainId seams. */
export function isEvmPerpVenue(venueId) {
  return Boolean(PERP_VENUES[venueId]?.evm)
}

/** The gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function perpsGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Whether this BUILD's cohort may show perps market data at all: the venues are mainnet-only, so
 * a testnet cohort renders an honest mainnet-only notice instead of cross-cohort data (FR-017).
 */
export function perpsCohortSupported() {
  return membershipChainId() === MAINNET_CHAIN_ID
}

/**
 * Whether the Perps view is available: a gateway must be configured AND the cohort must be
 * mainnet. False renders the honest unavailable/testnet notice — never an empty table (FR-013).
 */
export function perpsAvailable() {
  return perpsGatewayUrl() !== '' && perpsCohortSupported()
}

/** Deep link to the Perps view (`?view=` inside the Trade section — the section/view idiom). */
export function perpsPath({ venue } = {}) {
  const params = new URLSearchParams({ tab: 'trade', view: 'perps' })
  if (venue && PERP_VENUES[venue]) params.set('venue', venue)
  return `/wallet?${params.toString()}`
}

/* ------------------------------------------------------------------------------------------- *
 * Position management (spec 083)
 *
 * Everything below turns the read-only view above into a management surface. It adds no contract
 * of our own: both EVM venues assign position ownership from `msg.sender`, so any FairWins
 * contract in the path would OWN the member's position (research D1). Every call is member-direct
 * — FairWins builds calldata and nothing else.
 * ------------------------------------------------------------------------------------------- */

/**
 * The Gains `GNSMultiCollatDiamond` per chain. Call target AND approval target are this one
 * address — the diamond pulls collateral itself, so there is no separate spender.
 *
 * Verified live 2026-08-11: all three answer `getTradingActivated() = ACTIVATED (0)`, with
 * `getMarketOrdersTimeoutBlocks()` = 200 on Arbitrum and 30 on Base and Polygon. That timeout is
 * the age a pending market order must reach before `cancelOrderAfterTimeout` stops reverting
 * `WaitTimeout()` — read it from the chain rather than from this comment, because it is venue
 * configuration and can change.
 */
export const GAINS_DIAMOND_BY_CHAIN = {
  42161: '0xFF162c694eAA571f685030649814282eA457f169',
  8453: '0x6cD5aC19a07518A8092eEFfDA4f1174C72704eeb',
  137: '0x209A9A01980377916851af2cA075C2b170452018',
}

/**
 * GMX v2, Arbitrum only — the protocol is deployed nowhere else this product touches, and a GMX
 * entry for any other chain would be a fabricated address.
 *
 * > **THE APPROVAL TRAP.** Collateral approvals go to `router`, NOT to `exchangeRouter`. The
 * > ExchangeRouter is the CALL target; the Router is what actually pulls tokens
 * > (`Router.pluginTransfer`), so approving the ExchangeRouter yields a `sendTokens` that reverts.
 * > Two different addresses, both named "router" — this is the single easiest mistake to make in
 * > the whole integration.
 *
 * > **DO NOT SOURCE THESE FROM THE `gmx-synthetics` REPO'S `deployments/` DIRECTORY.** It
 * > disagrees with the docs and the SDK about the ExchangeRouter, and a RoleStore freshness check
 * > does NOT discriminate between them: both the docs/SDK router and the repo router currently
 * > hold CONTROLLER + ROUTER_PLUGIN (four historical routers still have code and hold neither).
 * > The addresses here are the docs/SDK ones, pinned deliberately and re-verified on GMX releases
 * > (research D13). Every selector was checked against the deployed bytecode on 2026-08-11.
 */
export const GMX_ADDRESSES_BY_CHAIN = {
  42161: {
    exchangeRouter: '0x7dE39FF2e232A2203196788d37e234cF8F1b83f1',
    router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6', // ← ERC-20 APPROVAL TARGET
    reader: '0xfA26cBb46e2614609406de08CA1Dc7f70a684184',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
    orderVault: '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5', // sendWnt / sendTokens recipient
    eventEmitter: '0xC8ee91A54287DB53897056e12D9819156D3822Fb', // every order event
    referralStorage: '0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d',
  },
}

/** The Gains diamond for a chain, or null where Gains is not deployed. */
export function gainsDiamondFor(chainId) {
  return GAINS_DIAMOND_BY_CHAIN[Number(chainId)] ?? null
}

/** The GMX address set for a chain, or null off Arbitrum. Never synthesise a partial set. */
export function gmxAddressesFor(chainId) {
  return GMX_ADDRESSES_BY_CHAIN[Number(chainId)] ?? null
}

/**
 * Which venues this build can MANAGE positions on for a chain, independent of the feature flag.
 *
 * Hyperliquid is absent by design (FR-021): it stays read-only this release. Its L1 actions sign
 * under a hardcoded `domain.chainId = 1337` that injected wallets reject, so even CLOSING a
 * position needs an agent (session) key — there is no cheap "manage-only HL". Rather than a
 * disabled control, the view states that management happens on the venue and links there.
 */
const PERPS_MANAGE_VENUES_BY_CHAIN = {
  42161: ['gains', 'gmx'],
  8453: ['gains'],
  137: ['gains'],
}

/** The manageable venues on a chain, newest-first is meaningless here — order is stable. */
export function perpsManageVenues(chainId) {
  return PERPS_MANAGE_VENUES_BY_CHAIN[Number(chainId)] ?? []
}

/**
 * Whether a venue's positions can be managed in-app on a chain. This is a CAPABILITY, not
 * permission: it says the calldata path exists, not that the member may use it. The feature flag,
 * the attestation, screening and venue operational state are separate gates — and all of them gate
 * OPENING only. Nothing may stand between a member and closing, reducing or recovering.
 */
export function perpsManageEnabled(venueId, chainId) {
  return perpsManageVenues(chainId).includes(venueId)
}

/**
 * The kill switch for the entire management surface, DEFAULT OFF.
 *
 * It stays off until the terms and risk disclosures name leveraged derivatives / perpetual futures
 * (FR-025 / research D10 — `frontend/src/legal/` contained ZERO occurrences of
 * `leverage|derivativ|perpetual` when this feature was specified; that text has since landed in
 * terms.md §3/§4.3/§4.4/§10 + Schedule A and risk-disclosure.md §6). That is a gate on enablement,
 * not on merging: with the flag off the Perps view is exactly the spec-082 read-only surface, and
 * no management control renders at all — a dead or disabled button would be the dishonest outcome.
 * The remaining prerequisites (a recorded `PERPS_UI_FEE_RECEIVER`, both-sides fee disclosure) are
 * in docs/runbooks/perps-operations.md §5.
 *
 * Read at call time, like `perpsGatewayUrl()`, so a build's value is never frozen into a module
 * constant at import.
 */
export function perpsManageFeatureEnabled() {
  return String(import.meta.env.VITE_PERPS_MANAGE_ENABLED || '').trim().toLowerCase() === 'true'
}

/**
 * FairWins' GMX UI-fee receiver — the ONLY FairWins address that may appear anywhere in venue
 * calldata, and only ever as `CreateOrderParams.addresses.uiFeeReceiver`. It is never
 * `receiver` and never `cancellationReceiver`; those are the member.
 *
 * `null` until the address is set, and null MUST be treated as "no fee" rather than as an error:
 * GMX itself early-returns a zero UI fee when `uiFeeReceiver == address(0)`, so an unset receiver
 * is structurally fee-free and must render no fee line at all (FR-012). The rate is NOT here —
 * it is read from the GMX DataStore, the contract that enforces it (FR-011).
 *
 * Registration is permissionless self-registration via `ExchangeRouter.setUiFeeFactor`, which is
 * `msg.sender`-keyed: whatever address sends that transaction IS the receiver, so this constant
 * must be exactly that address.
 *
 * SET 2026-08-11 to the address that sent `setUiFeeFactor(5e26)` on Arbitrum
 * (tx 0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0). GMX's DataStore answers
 * `uiFeeFactorKey(this address) = 5e26` = 5 bps. Recording it here does NOT start charging anyone:
 * the fee only rides orders this app sends, and the management surface is behind
 * `VITE_PERPS_MANAGE_ENABLED`, which is off. `claimUiFees` is also `msg.sender`-keyed, so this is
 * the only address that can ever claim what accrues — moving accrual to the treasury means a fresh
 * `setUiFeeFactor` FROM the treasury address (docs/runbooks/perps-operations.md).
 */
export const PERPS_UI_FEE_RECEIVER = '0x52502d049571C7893447b86c4d8B38e6184bF6e1'

/** The configured UI-fee receiver, or null. Total: callers branch on null, never on a throw. */
export function perpsUiFeeReceiver() {
  return PERPS_UI_FEE_RECEIVER
}

/**
 * Version of the jurisdiction + leveraged-derivatives risk attestation. Bump it whenever the
 * acknowledged text changes materially: a stored attestation at an older version does not satisfy
 * the current one, so the member is asked again rather than silently credited with agreeing to
 * words they never saw.
 */
export const PERPS_ATTESTATION_VERSION = 1
