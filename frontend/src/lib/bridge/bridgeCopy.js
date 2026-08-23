/**
 * Member-facing copy for Transfer → Bridge (spec 067, FR-007/FR-011/FR-012/FR-014).
 *
 * Plain language for members with no DeFi background, in the register of
 * `lib/earn/earnCopy.js` and `lib/staking/stakingCopy.js`. Everything the
 * Bridge surface says about cost, timing, risk, and who settles the transfer
 * lives here so the wording stays consistent, reviewable, and testable — the
 * UI never inlines jargon.
 *
 * Two rules this file exists to keep honest:
 *   - FR-014: the third party that actually settles a bridge is NAMED, on the
 *     quote and in the activity record, with the risk that follows from that.
 *   - FR-009: a bridge is never described as finished before the destination
 *     network has delivered. The state copy below has no cheerful synonym for
 *     "probably arrived".
 *
 * State keys are plain strings ('submitted', 'in_flight', …) matching
 * `BRIDGE_STATE` in `data/ledger/sources/bridgeLedgerSource.js` by value, so
 * this module stays dependency-light (config only).
 */
import { NETWORKS, cohortChainIds } from '../../config/networks'
import { isBitcoinNetworkId } from '../../config/bitcoinNetworks'

/** The third party that settles every bridge in v1 (FR-014). */
export const BRIDGE_SETTLEMENT = Object.freeze({
  protocol: 'Across',
  attribution: 'Bridging by Across Protocol',
  url: 'https://across.to',
})

/** InfoTip explainers, one per term the Bridge surface shows. */
export const BRIDGE_TIPS = Object.freeze({
  bridge:
    'Bridging moves an asset you already own from one network to another — the same asset, a different network. Your wallet is the only thing that signs, and FairWins never holds the asset on the way.',
  destinationNetwork:
    'The network your asset arrives on. It has to be a different network from the one you are sending from — moving an asset within one network is an ordinary transfer, not a bridge.',
  sameAsset:
    'A bridge delivers the same asset on the other side, so the destination list only offers that asset on other networks. Similar-looking assets (USDC and USDC.e, for example) are genuinely different assets and are never swapped in as substitutes.',
  amountReceived:
    'What is expected to land on the destination network once every cost below is taken out. This is the amount you receive, not the amount you send.',
  arrival:
    'How long this route usually takes, based on recent transfers. It is an estimate — busy networks can take longer — and nothing is counted as delivered until the destination network confirms it.',
  bridgeFee:
    'The bridge protocol’s own fee. It pays the people who put up the asset on the destination network so your transfer arrives in minutes instead of waiting out the slow route.',
  destinationGas:
    'Every network charges a small amount to record a transaction. This covers the cost of delivering your asset on the destination network so you do not have to pay it there yourself.',
  platformFee:
    'The FairWins platform fee for this transfer. It is taken once from the amount you send, and the rate is always shown here before you confirm — you can never be charged more than the figure you agreed to.',
  totalCost:
    'Everything this transfer costs, added up: the bridge protocol fee, the cost of delivering on the destination network, and the FairWins platform fee where one applies.',
  quoteValidity:
    'Bridge costs move with network conditions, so a quote is only good for a short window. Once it expires, refresh it to get current numbers before you sign — nothing is charged while you wait.',
  networkSwitch:
    'Your wallet has to sign on the network the asset is on today, so it switches over when you confirm and tells you before it does. You never have to change networks yourself to get started.',
  destinationGasWarning:
    'You do not hold any of the destination network’s own coin, which is what pays for transactions there. Your bridged asset still arrives and is safe, but you will need a small amount of that coin before you can move it again.',
  progress:
    'A bridge is two transactions on two networks. It counts as finished only when the destination network has actually delivered — until then it stays in progress, and both transactions are linked here so you can check either one yourself.',
  needsAttention:
    'This transfer has gone past the time this route usually takes. It is not lost: it either still lands, or the bridge returns the asset to the wallet it left from.',
  refund:
    'If a transfer cannot be delivered, the bridge protocol sends the asset back to the same wallet on the network it started from. You keep the asset; the network costs already spent are not returned.',
  nonCustodial:
    'FairWins never takes custody. The asset goes from your wallet to the bridge protocol and on to your address on the other network — if a transfer fails to send, nothing has left your wallet beyond the network cost of trying.',
})

/**
 * Third-party settlement risk disclosure (FR-014) — shown on the quote, before
 * signature. Names the protocol, says plainly what depends on it, and does not
 * promise delivery.
 */
export const BRIDGE_DISCLOSURE = `Transfers between networks are settled by ${BRIDGE_SETTLEMENT.protocol} Protocol, a third-party bridge, from your own wallet — FairWins never holds the asset and cannot move it. Delivery depends on ${BRIDGE_SETTLEMENT.protocol} and on both networks: it usually takes minutes, it is not guaranteed, and if a transfer cannot be delivered ${BRIDGE_SETTLEMENT.protocol} returns the asset to your wallet on the network it started from. Smart contracts carry risk. Where a FairWins platform fee applies it is always shown before you confirm.`

/** The same naming, short enough for the activity record (FR-014). */
export const BRIDGE_ACTIVITY_SETTLEMENT_NOTE = `Settled by ${BRIDGE_SETTLEMENT.protocol} Protocol.`

/**
 * Label + detail per bridge state, for the progress view (FR-009/FR-011).
 * `delivered` is the only wording that claims completion, and the ledger only
 * reaches it on destination-side evidence.
 */
export const BRIDGE_STATE_COPY = Object.freeze({
  submitted: Object.freeze({
    label: 'Sending',
    detail: 'Your wallet has signed and the transfer is waiting to be recorded on the network it is leaving from.',
  }),
  source_confirmed: Object.freeze({
    label: 'Sent',
    detail: 'The network you are sending from has recorded the transfer. It has not arrived yet.',
  }),
  in_flight: Object.freeze({
    label: 'On the way',
    detail: 'The bridge has picked the transfer up and is delivering it to the destination network.',
  }),
  delivered: Object.freeze({
    label: 'Delivered',
    detail: 'The destination network has delivered your asset. The transaction there is linked below.',
  }),
  refunded: Object.freeze({
    label: 'Returned to you',
    detail: 'The transfer could not be delivered, so the bridge sent the asset back to your wallet on the network it started from.',
  }),
  needs_attention: Object.freeze({
    label: 'Taking longer than expected',
    detail: 'This transfer has passed the time this route usually takes and has not arrived yet. It is still live — it can still be delivered or returned to you.',
  }),
  failed: Object.freeze({
    label: 'Did not send',
    detail: 'The transaction on the network you were sending from did not go through, so nothing left your wallet beyond that network’s cost.',
  }),
})

/**
 * Copy for a bridge state, or an honest fallback for a state this build does
 * not know — never an invented reassurance.
 * @param {string} state
 * @returns {{label: string, detail: string}}
 */
export function bridgeStateCopy(state) {
  return (
    BRIDGE_STATE_COPY[state] || {
      label: 'Status unavailable',
      detail: 'We cannot confirm where this transfer is right now. Use the transaction links to check it yourself.',
    }
  )
}

/** What a member can do about a stuck transfer (FR-011 — recourse, not a spinner). */
export const BRIDGE_NEEDS_ATTENTION_RECOURSE = `This transfer is past its expected arrival time. It has not been lost and FairWins does not hold it: open the sending transaction below to confirm it left, and check the ${BRIDGE_SETTLEMENT.protocol} explorer for where it is. Transfers that cannot be delivered are returned automatically to the wallet they came from.`

/**
 * Every network IN THIS BUILD'S COHORT where bridging is configured, mainnets
 * first — mirrors `getStakingNetworks()`. Used by the honest unavailable copy,
 * by `BridgeStatusList`'s read roster, and by tests; empty when nothing is
 * configured, which is itself honest.
 *
 * `cohortChainIds()` and never `listSupportedChainIds()` (issue #1265): this
 * list both names networks to the member and decides which chains are READ for
 * in-flight transfers, and constitution III forbids either crossing the
 * testnet/mainnet boundary. Across ships only on mainnets, so a testnet build
 * gets an empty roster and the "no network is set up for bridging in this build
 * yet" branch below — which is the truth for that build.
 */
export function bridgeNetworks() {
  return cohortChainIds()
    .map((id) => NETWORKS[id])
    .filter((net) => net?.capabilities?.bridge)
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
}

function bridgeNetworkList() {
  const names = bridgeNetworks().map((net) => net.name)
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Honest states the Bridge surface shows instead of a broken or invented one
 * (FR-051/FR-053/FR-054/FR-065/FR-066).
 */
export const BRIDGE_UNAVAILABLE = Object.freeze({
  bitcoin:
    'Bitcoin is not part of bridging. Bitcoin is its own network and is not connected to the networks this feature moves assets between — sending and receiving bitcoin work as they always have.',
  gateway:
    'Bridging is temporarily unavailable: we cannot reach the service that prices transfers, and we will not show you a made-up price. Transfers already on their way are unaffected and keep updating here. Please try again shortly.',
  router:
    'Bridging is temporarily unavailable on this network: the FairWins bridge contract is not reachable right now, so we cannot confirm what a transfer would cost. Nothing has been sent and nothing is at risk.',
  paused:
    'Bridging is paused right now, so no new transfers can be started. Transfers already on their way are not affected and continue to be delivered.',
  routeDisabled:
    'This route is not open at the moment. Choose another destination network, or try again later.',
  quoteStale:
    'This quote has expired because bridge costs have moved on. Refresh it to see current numbers before you confirm — nothing has been charged.',
  noRoute:
    'There is no bridge route for this asset between these two networks. Choosing a different destination network, or a different asset, will usually find one.',
  fees:
    'We cannot read the current platform fee, so this transfer is not being offered rather than quoted at a rate we are unsure of.',
})

/**
 * Honest unavailable-state copy for a network (FR-051/FR-052/FR-006c), or null
 * when bridging is available there.
 *
 * Bitcoin ids are strings and must never reach `getNetwork` (spec 061), so they
 * are answered from the string id alone — Bitcoin is out of scope for bridging
 * (FR-006) and says so rather than going silently missing.
 *
 * @param {number|string} chainId
 * @returns {string|null}
 */
export function bridgeUnavailableCopy(chainId) {
  if (isBitcoinNetworkId(chainId)) return BRIDGE_UNAVAILABLE.bitcoin
  const net = chainId != null ? NETWORKS[chainId] : null
  // Membership of the ROSTER, not the raw capability flag (#1265). The roster is what the
  // Bridge form offers and what `BridgeStatusList` reads, so answering "bridging is
  // available here" (null) about a network outside it would contradict both.
  if (net && bridgeNetworks().some((n) => n.chainId === net.chainId)) return null
  const where = bridgeNetworkList()
  const here = net?.name ? `Bridging is not available on ${net.name}.` : 'Bridging is not available on this network.'
  return where
    ? `${here} It is available on ${where} — pick an asset on one of those networks to bridge.`
    : `${here} No network is set up for bridging in this build yet.`
}

/**
 * FR-065 — the destination list is empty because the member holds this asset on
 * only one network. Says what would change it instead of showing a dead control.
 * @param {string} symbol
 * @returns {string}
 */
export function noBridgeDestinationCopy(symbol) {
  const asset = symbol || 'This asset'
  const where = bridgeNetworkList()
  return where
    ? `${asset} has no other network to bridge to from here. Bridging works between ${where}, so ${asset} needs a route on at least two of them — pick a different asset to see its destinations.`
    : `${asset} has no destination network available, because no network is set up for bridging in this build yet.`
}

/**
 * Short section blurb for a Bridge ENTRY POINT — a tile or a menu row that has to say what the
 * destination does before a member is inside it.
 *
 * It is deliberately NOT rendered at the top of the Bridge tab itself. Inside the tab the quote
 * states the arriving amount and every cost as figures, and a sentence promising that above them
 * is a claim the screen below is already making truthfully.
 */
export const BRIDGE_AREA_DESC = 'Move an asset you already hold to another network.'
