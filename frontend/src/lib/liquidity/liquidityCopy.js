/**
 * Member-facing copy for Earn → Supply (spec 067, FR-015/FR-017/FR-018/FR-019,
 * FR-024/FR-025, FR-028/FR-029/FR-030).
 *
 * Plain language for members with no DeFi background, in the register of
 * `lib/earn/earnCopy.js`, `lib/staking/stakingCopy.js`, and
 * `lib/bridge/bridgeCopy.js`. Everything the Supply area says about what a pool
 * is, what it earns, what it risks, and what it costs lives here so the wording
 * stays consistent, reviewable, and testable — the UI never inlines jargon.
 *
 * Four rules this file exists to keep honest:
 *
 *   1. THE FEE IS CHARGED ON CAPITAL ACTUALLY DEPLOYED, NOT ON WHAT WAS OFFERED.
 *      `LiquidityRouter._supply` quotes the fee AFTER the mint, against the
 *      amounts Uniswap actually consumed; everything the pool did not take is
 *      refunded whole, with no fee on it. So the confirm step discloses the
 *      RATE and what it applies to — it never promises a precise fee figure
 *      computed off the amount the member typed, because that figure would be
 *      too high whenever the pool's price ratio takes less than both legs.
 *
 *   2. BRIDGE LIQUIDITY IS FEE-FREE AND HAS NO FEE LINE AT ALL. Across's
 *      `HubPool.addLiquidity` has no recipient parameter, so a fee-taking
 *      wrapper would own the member's position and they could never exit it
 *      (research R3). There is no `liquidity.deposit` charge on that path — and
 *      no fee line reading 0.00 either, which would imply a lever that does not
 *      exist. `liquidityFeeCopy` returns null for bridge pools, always.
 *
 *   3. AVAILABILITY IS ASYMMETRIC AND THE COPY SAYS SO. Trading liquidity
 *      (Uniswap) is on every supported Uniswap network; bridge liquidity is
 *      ETHEREUM ONLY, because Across's HubPool is an L1 contract by design
 *      (research R8). Nothing here may imply both kinds exist everywhere.
 *
 *   4. A RETIRED POOL STAYS VISIBLE AND WITHDRAWABLE (FR-024). The copy for a
 *      closed pool says "no new deposits", never "gone".
 */
import { NETWORKS, listSupportedChainIds } from '../../config/networks'
import { isBitcoinNetworkId } from '../../config/bitcoinNetworks'
import { getContractAddressForChain } from '../../config/contracts'
import { bpsToPercent } from '../fees/feeQuote'

/** The third parties whose pools members supply (FR-017 — the protocol is named). */
export const LIQUIDITY_PROTOCOLS = Object.freeze({
  trading: Object.freeze({
    protocol: 'Uniswap',
    attribution: 'Trading pools by Uniswap',
    url: 'https://app.uniswap.org',
  }),
  bridge: Object.freeze({
    protocol: 'Across',
    attribution: 'Bridge pools by Across Protocol',
    url: 'https://across.to',
  }),
})

/**
 * The two pool kinds, as the app refers to them. Values mirror the data model's
 * `BRIDGE_LP` / `TRADING_LP`; `poolKindOf` also accepts the contract enum
 * (1 = BridgeLp, 2 = TradingLp) so callers never have to translate first.
 */
export const LIQUIDITY_POOL_KIND = Object.freeze({
  BRIDGE_LP: 'bridge_lp',
  TRADING_LP: 'trading_lp',
})

/**
 * Normalize whatever a caller has (string label, contract enum number) to one
 * of the two kinds, or null when it is neither — an unknown kind is never
 * guessed into "trading", because the two carry different disclosures.
 * @param {string|number|null|undefined} kind
 * @returns {'bridge_lp'|'trading_lp'|null}
 */
export function poolKindOf(kind) {
  if (kind === 1) return LIQUIDITY_POOL_KIND.BRIDGE_LP
  if (kind === 2) return LIQUIDITY_POOL_KIND.TRADING_LP
  if (typeof kind !== 'string') return null
  const k = kind.toLowerCase()
  if (k.includes('bridge')) return LIQUIDITY_POOL_KIND.BRIDGE_LP
  if (k.includes('trading')) return LIQUIDITY_POOL_KIND.TRADING_LP
  return null
}

/** Short labels for each kind, for pool cards and filters (FR-015). */
export const LIQUIDITY_KIND_LABEL = Object.freeze({
  [LIQUIDITY_POOL_KIND.BRIDGE_LP]: 'Bridge liquidity',
  [LIQUIDITY_POOL_KIND.TRADING_LP]: 'Trading liquidity',
})

/** One-line description of each kind, for the card and the kind InfoTip. */
export const LIQUIDITY_KIND_DESC = Object.freeze({
  [LIQUIDITY_POOL_KIND.BRIDGE_LP]:
    'You supply one asset to a bridge’s shared pot. The bridge uses it to pay people out instantly on other networks, and pays you a share of what it charges them.',
  [LIQUIDITY_POOL_KIND.TRADING_LP]:
    'You supply two assets as a pair so other people can trade between them. Every trade pays a small fee, and you earn a share of it for as long as your pair is in the pool.',
})

/** InfoTip explainers, one per term the Supply area shows (FR-017). */
export const LIQUIDITY_TIPS = Object.freeze({
  supply:
    'Supplying puts assets you already own into a shared pot that other people use — to trade, or to move money between networks. You earn a share of what they pay to use it, and you can take your assets back out.',
  tradingPool:
    'A trading pool holds two assets so people can swap between them without waiting for someone to take the other side. Traders pay a small fee on every swap, and it is split between everyone who supplied the pool.',
  bridgePool:
    'A bridge pool holds one asset that a bridge lends out to deliver transfers on other networks straight away. The people bridging pay a fee for that speed, and it is shared between everyone who supplied the pool.',
  pair:
    'A trading pool always takes two assets together, because that is what traders swap between. Both live on the same network — a pool never spans two networks.',
  fullRange:
    'Your pair earns fees at every price, so there is nothing to set up and nothing to move later. Some liquidity apps ask you to pick a price band and then chase it when the market leaves it — FairWins does not offer that.',
  feeTier:
    'The fee traders pay on each swap in this pool, set by the pool itself. A busier pool at a lower fee can earn more than a quiet one at a higher fee — the estimated return already accounts for both.',
  estimatedReturn:
    'An estimate of the yearly return at recent activity levels. It comes from how much this pool has been earning lately, not from a promise: it moves with trading volume and can fall to almost nothing in a quiet week.',
  totalSupplied:
    'How much everyone has supplied to this pool in total. A larger, longer-running pool usually means steadier activity and easier withdrawals.',
  positionValue:
    'What your share of the pool is worth right now, at current prices. It is a live estimate that moves with the market — not a balance that sits still.',
  earnings:
    'The fees your share has earned since you supplied. For trading pools these build up alongside your position; for bridge pools they build into the value of what you hold.',
  composition:
    'Which of the two assets your share is made of at the moment. The pool shifts that mix as people trade, so it changes over time even though you did nothing — which is why what you get back can differ from what you put in.',
  impermanentLoss:
    'When the two assets in a pair move apart in price, the pool ends up holding more of the one that fell and less of the one that rose. So what you get back can be worth less than if you had simply held the two assets and done nothing. Trading fees may make up for it, or may not.',
  estimateLabel:
    'Every value here is worked out from current prices and recent activity, so it moves. Nothing on this screen is a guaranteed amount.',
  inventory:
    'A bridge pool is lent out across several networks at any moment, so occasionally not all of it is sitting there to be withdrawn. If that happens you can take out what is available now and come back for the rest.',
  withdrawal:
    'You can ask to withdraw at any time, and withdrawing never carries a FairWins fee. What comes back to you is your share of the pool at that moment — for a pair, both assets in whatever mix the pool holds; for a bridge pool, as much as is available right then, with the rest shortly after.',
  approval:
    'The first time you supply an asset, your wallet asks for two confirmations: one allowing exactly the amount you typed to be taken, and one making the deposit. This is standard and you allow only that amount.',
  platformFee:
    'FairWins charges a small platform fee on assets you supply to a trading pool. It is worked out on what actually goes into the pool, taken once, and the rate is always shown before you confirm. Withdrawing is free, and bridge pools carry no FairWins fee at all.',
  refundedRemainder:
    'A pool takes the two assets in whatever ratio its current price needs, which is rarely exactly what you typed. Whatever it does not take is sent straight back to your wallet in the same transaction — whole, with no fee taken from it.',
  nonCustodial:
    'FairWins never holds pooled assets. Your wallet is the only thing that signs, the position belongs to your address, and you can withdraw without asking anyone.',
  networkSwitch:
    'A pool lives on one network, so your wallet switches to that network when you confirm and tells you before it does. You do not have to change networks yourself to look around.',
  retiredPool:
    'FairWins has closed this pool to new deposits. Anything you already have in it is untouched: it keeps earning, it stays listed here, and you can withdraw it whenever you like.',
})

/**
 * FR-018 — impermanent loss, shown INLINE in the confirm step for trading
 * pools, never tooltip-only. Written for someone who has never supplied
 * liquidity: no "IL", no "divergence", no arithmetic.
 */
export const TRADING_LP_DISCLOSURE =
  'What you get back is a mix of the two assets, and the mix changes with their prices. As people trade, the pool ends up holding more of whichever asset has fallen and less of whichever has risen — so when you withdraw, your share can be worth less than if you had simply held the two assets and done nothing. The trading fees you earn may make up that difference, or may not. This is normal for every trading pool, it is not a fee, and it is not something FairWins can prevent.'

/** The same idea, short enough for a pool card's risk summary (FR-017). */
export const TRADING_LP_RISK_SUMMARY =
  'The mix of the two assets you get back changes with their prices, and can be worth less than simply holding them.'

/**
 * FR-019 — bridge-pool rebalancing and inventory-dependent withdrawal, shown
 * INLINE in the confirm step for bridge pools.
 */
export const BRIDGE_LP_DISCLOSURE = `Your asset is supplied to ${LIQUIDITY_PROTOCOLS.bridge.protocol}, a third-party bridge, and is lent out to deliver other people’s transfers. To do that, ${LIQUIDITY_PROTOCOLS.bridge.protocol} moves the pool’s funds between networks as demand shifts, so at any moment part of the pool is in transit rather than sitting still. That means withdrawal depends on what is available when you ask: usually all of it, but when the pool is heavily lent out you may be able to take only part of it straight away and the rest shortly after. Your share keeps earning until you withdraw it, returns are not guaranteed, and smart contracts carry risk.`

/** The same idea, short enough for a pool card's risk summary (FR-017). */
export const BRIDGE_LP_RISK_SUMMARY = `${LIQUIDITY_PROTOCOLS.bridge.protocol} moves this pool’s funds between networks, so how much you can withdraw at once depends on what is available then.`

/** Risk summary for a pool card, by kind — null for an unrecognized kind. */
export function poolRiskSummary(kind) {
  const k = poolKindOf(kind)
  if (k === LIQUIDITY_POOL_KIND.TRADING_LP) return TRADING_LP_RISK_SUMMARY
  if (k === LIQUIDITY_POOL_KIND.BRIDGE_LP) return BRIDGE_LP_RISK_SUMMARY
  return null
}

/** The inline confirm-step disclosure for a pool, by kind (FR-018/FR-019). */
export function poolDisclosure(kind) {
  const k = poolKindOf(kind)
  if (k === LIQUIDITY_POOL_KIND.TRADING_LP) return TRADING_LP_DISCLOSURE
  if (k === LIQUIDITY_POOL_KIND.BRIDGE_LP) return BRIDGE_LP_DISCLOSURE
  return null
}

/** Section-wide disclosure for the Supply area footer (FR-023 + attribution). */
export const LIQUIDITY_DISCLOSURE = `Pools are run by third-party protocols — ${LIQUIDITY_PROTOCOLS.trading.protocol} for trading pools and ${LIQUIDITY_PROTOCOLS.bridge.protocol} for bridge pools — and you supply them from your own wallet. FairWins never holds pooled assets and cannot withdraw for you. Returns come from other people’s trading and bridging, so they vary and are not guaranteed, and smart contracts carry risk. Withdrawing never carries a FairWins fee.`

/**
 * FR-028/FR-029/FR-030 — the platform-fee disclosure for the confirm step.
 *
 * Returns `null` (⇒ NO fee line at all) when:
 *   - the pool is a bridge pool: that path never routes through the
 *     `LiquidityRouter` and is fee-free by design (research R3); or
 *   - the fee system is not deployed on this network (`available: false`); or
 *   - the live rate is zero — FR-029 requires behavior identical to no fee
 *     configured, which means no line rather than a line reading 0.00%.
 *
 * When it does return copy, that copy states the RATE and what the rate applies
 * to. It deliberately does NOT promise a fee amount computed from the amounts
 * the member typed: the router charges on what the pool actually consumed and
 * refunds the rest whole, so a figure taken off the gross would overstate the
 * charge (`LiquidityRouter._supply`).
 *
 * @param {{ kind?: string|number, bps?: number, available?: boolean }} params
 * @returns {{ rate: string, headline: string, basis: string, remainder: string, withdrawal: string }|null}
 */
export function liquidityFeeCopy({ kind, bps = 0, available = true } = {}) {
  if (poolKindOf(kind) === LIQUIDITY_POOL_KIND.BRIDGE_LP) return null
  if (!available) return null
  const rateBps = Number(bps) || 0
  if (rateBps <= 0) return null
  const rate = bpsToPercent(rateBps)
  return {
    rate,
    headline: `FairWins platform fee: ${rate}`,
    basis: `The ${rate} is charged on what actually goes into the pool. A pool takes the two assets in the ratio its current price needs, which is rarely exactly what you typed, so the fee is worked out after the deposit on the amounts the pool really took — never on the whole amount you offered.`,
    remainder:
      'Whatever the pool does not take is returned to your wallet in the same transaction, whole, with no fee taken from it.',
    withdrawal: 'Withdrawing carries no FairWins fee, so you can always take your assets back out.',
  }
}

/**
 * FR-028 asks for the rate AND the resulting net amount before signature — but
 * the exact fee is not knowable until the mint has happened (see above). The
 * honest form of "the resulting net amount" is therefore a CEILING: the fee on
 * the full amounts entered is the most it can ever be, because the pool can
 * only take less, never more.
 *
 * Callers pass already-formatted amounts (they own token decimals and symbols).
 * Returns null when there is no fee to describe.
 *
 * @param {string} maxFeeLabel e.g. "2.50 USDC + 0.0008 WETH"
 * @param {string} [netLabel] the matching net amounts, if the surface shows them
 * @returns {string|null}
 */
export function feeCeilingCopy(maxFeeLabel, netLabel) {
  if (!maxFeeLabel) return null
  const first = netLabel
    ? `If the pool takes everything you entered, the fee is ${maxFeeLabel} and ${netLabel} goes into the pool.`
    : `If the pool takes everything you entered, the fee is ${maxFeeLabel}.`
  return `${first} That is the most it can be: the pool usually takes less than you offer, the fee is charged only on what it actually takes, and whatever is left comes back to your wallet whole.`
}

/** Why a bridge pool shows no fee line at all — for reviewers and InfoTips. */
export const BRIDGE_LP_FEE_FREE_NOTE = `Supplying a ${LIQUIDITY_PROTOCOLS.bridge.protocol} bridge pool carries no FairWins fee. The deposit goes straight from your wallet to ${LIQUIDITY_PROTOCOLS.bridge.protocol}, so there is nothing for FairWins to take a fee from and nothing standing between you and your position.`

/**
 * Every supported network where TRADING liquidity is actually offered, mainnets
 * first.
 *
 * TWO conditions, both required, and the second is the point: a network needs
 * Uniswap's position manager configured (`capabilities.liquidity`) AND a
 * deployed `LiquidityRouter`, because the supply path runs through the router.
 * Naming a network on the strength of the protocol addresses alone would
 * promise pools on chains where FairWins has shipped nothing — including
 * Ethereum Classic and Mordor, which carry ETCswap position managers for the
 * swap surface and no liquidity deployment at all (research R8).
 *
 * The list therefore grows as deployments land, and an empty list produces
 * honest "not set up in this build yet" copy rather than a false roster.
 */
export function tradingLiquidityNetworks() {
  return listSupportedChainIds()
    .map((id) => NETWORKS[id])
    .filter(
      (net) =>
        net?.capabilities?.liquidity &&
        Boolean(getContractAddressForChain('liquidityRouter', net.chainId)),
    )
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
}

/**
 * Every supported network where BRIDGE liquidity is configured — the networks
 * carrying an Across HubPool. This is Ethereum only, by Across's design
 * (research R8); the list is derived rather than asserted so it stays true if
 * that ever changes.
 */
export function bridgeLiquidityNetworks() {
  return listSupportedChainIds()
    .map((id) => NETWORKS[id])
    .filter((net) => Boolean(net?.bridge?.hubPool))
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
}

function nameList(networks) {
  const names = networks.map((net) => net.name)
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * FR-025 + research R8 — where each KIND of pool is available, stated plainly
 * and asymmetrically. Never implies both kinds exist everywhere.
 * @returns {string}
 */
export function liquidityAvailabilityCopy() {
  const trading = nameList(tradingLiquidityNetworks())
  const bridge = nameList(bridgeLiquidityNetworks())
  const tradingPart = trading
    ? `Trading pools are available on ${trading}.`
    : 'No network is set up for trading pools in this build yet.'
  const bridgePart = bridge
    ? `Bridge pools are available on ${bridge} only — the bridge’s shared pot lives on ${bridge} by design, so it is not offered on the other networks.`
    : 'No network is set up for bridge pools in this build yet.'
  return `${tradingPart} ${bridgePart}`
}

/**
 * Honest unavailable-state copy for a network (FR-025/FR-051), or null when
 * pooling is available there.
 *
 * Bitcoin ids are strings and must never reach a numeric network lookup
 * (spec 061), so they are answered from the string id alone.
 *
 * NOTE FOR CALLERS: this describes ONE network. The Supply area itself is NOT
 * gated on the wallet's active network — pools from every network are listed
 * together and the wallet switches at signing (FR-059/FR-061). Use this where a
 * specific network is genuinely the subject, not as a whole-surface gate.
 *
 * @param {number|string} chainId
 * @returns {string|null}
 */
export function liquidityUnavailableCopy(chainId) {
  if (isBitcoinNetworkId(chainId)) {
    return `Bitcoin is not part of supplying. Bitcoin is its own network and does not run the pools this feature supplies — ${liquidityAvailabilityCopy()}`
  }
  const net = chainId != null ? NETWORKS[chainId] : null
  // Deployment-aware on both sides: trading needs the router shipped there,
  // bridge needs a HubPool. Either one makes the network a place with pools.
  const hasTrading = tradingLiquidityNetworks().some((n) => n.chainId === net?.chainId)
  const hasBridge = Boolean(net?.bridge?.hubPool)
  if (hasTrading || hasBridge) return null
  const here = net?.name
    ? `There are no pools on ${net.name}.`
    : 'There are no pools on this network.'
  return `${here} ${liquidityAvailabilityCopy()} You do not have to switch networks to look — pools from every network are listed here, and your wallet switches over only when you confirm.`
}

/** FR-025 — the curated list is empty everywhere. States it rather than showing a blank area. */
export const NO_POOLS_COPY = `There are no pools to supply right now. ${liquidityAvailabilityCopy()} Nothing is hidden and nothing is pending — when a pool is added it appears here.`

/** FR-024 — a pool closed to new deposits, still listed and still withdrawable. */
export const RETIRED_POOL_COPY =
  'This pool is closed to new deposits. If you already supplied it, nothing has changed: your share stays here, keeps earning, and can be withdrawn at any time.'

/** FR-024 — the underlying protocol cannot be reached right now. */
export const POOL_UNREACHABLE_COPY =
  'We cannot reach this pool’s protocol right now, so the figures below may be out of date and new deposits are not being offered. Your position is unaffected and is still yours to withdraw — try again shortly.'

/** Honest states the Supply area shows instead of a broken or invented one (FR-051/FR-053/FR-054). */
export const LIQUIDITY_UNAVAILABLE = Object.freeze({
  paused:
    'Supplying is paused right now, so no new deposits can be made. Positions already supplied are not affected and can still be withdrawn.',
  router:
    'Supplying is unavailable on this network at the moment: the FairWins liquidity contract is not reachable, so we cannot confirm what a deposit would cost. Nothing has been sent and nothing is at risk.',
  fees: 'We cannot read the current platform fee, so this deposit is not being offered rather than charged at a rate we are unsure of.',
  reads:
    'We cannot read this pool’s current figures, so they are not being shown rather than shown wrong. Withdrawing still works.',
  aboveLimit:
    'This is more than the pool accepts in a single deposit. Supply a smaller amount — you can supply again straight after.',
})

/**
 * FR-065 — a pinned first asset leaves no valid counterpart on its network.
 * Says what would change it instead of showing an empty dropdown.
 * @param {string} symbol
 * @param {string} networkName
 * @returns {string}
 */
export function noPairCounterpartCopy(symbol, networkName) {
  const asset = symbol || 'This asset'
  const where = networkName || 'that network'
  return `A trading pool holds two assets on the same network, so once you pick ${asset} on ${where} the second asset has to be on ${where} too — and you do not hold another one there that ${asset} has a curated pool with. Pick a different first asset, or fund another asset on ${where}.`
}

/** FR-022 — a withdrawal that inventory cannot fill in full right now. */
export function partialWithdrawalCopy(availableLabel) {
  const amount = availableLabel ? `${availableLabel} is` : 'Only part of your share is'
  return `${amount} available to withdraw right now, because the rest of this pool is currently lent out. You can take that amount now and come back for the remainder shortly — it stays yours and keeps earning in the meantime.`
}

/** Short section blurb for the Earn hub's Supply tile, matching STAKING_AREA_DESC. */
export const LIQUIDITY_AREA_DESC =
  'Supply assets to a trading or bridge pool and earn a share of the fees people pay to use it. Withdraw whenever you like — exits are never charged.'
