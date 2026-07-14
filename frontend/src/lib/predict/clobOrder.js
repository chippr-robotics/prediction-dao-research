/**
 * Polymarket CLOB order builder (spec 057) — hand-built EIP-712 typed data for a buy/sell order,
 * signed through the repo's single `signer.signTypedData(domain, types, message)` seam (EOA or the
 * passkey `passkeyIntentSigner` adapter). See specs/057-predict-polymarket/contracts/clob-order-signing.md.
 *
 * Types live ONLY here (mirrors lib/relay/intentTypes.js and seaportOrder.js). The `builder` field
 * carries FairWins' code, and the total-cost / net-proceeds figure is computed as the SAME number the
 * confirm UI shows — including the ADDITIVE builder fee — so what the member sees equals what they pay
 * (FR-011/FR-012). Makers carry no platform fee and no builder fee.
 *
 * NOTE (open dependency, tracked in checklists/requirements.md): the exact V2 typehash — field set and
 * the `builder` field placement — must be confirmed against the live "Polymarket CTF Exchange" v2
 * contract before mainnet signing. The shape here follows research D6.
 */
import { parseUnits, formatUnits } from 'ethers'
import { USDC_DECIMALS, feeUnits, feeLine } from './builderFee'

const ZERO_BYTES32 = '0x' + '0'.repeat(64)

// CLOB order EIP-712 types. `builder` (bytes32) carries the attribution code (research D6).
export const CLOB_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
    { name: 'builder', type: 'bytes32' },
  ],
}

const SIDE = { BUY: 0, SELL: 1 }
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// "Polymarket CTF Exchange" verifying contracts on Polygon (standard vs. negative-risk book). The
// order's verifyingContract must match the book the token trades on — resolved from the market's
// negRisk flag. Kept here as the single source (open dependency: confirm against live V2 before mainnet).
export const POLYMARKET_EXCHANGE = {
  standard: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  negRisk: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
}

/** Verifying-contract address for the book a token trades on. */
export function polymarketExchange(negRisk = false) {
  return negRisk ? POLYMARKET_EXCHANGE.negRisk : POLYMARKET_EXCHANGE.standard
}

/**
 * Notional (USDC base units) for a price∈[0,1] and a share size, plus the FairWins builder fee — the
 * one fee we control and can state exactly. Floor division in bigint — no float drift.
 *
 * Polymarket's OWN taker fee is charged by their engine at execution (a curve over price/size); we
 * carry its rate on the signed order (`feeRateBps`) for validity but do NOT fabricate a dollar estimate
 * for it here — it is disclosed honestly as a separate note in the confirm UI. Makers pay no builder fee.
 *
 * @returns {{ notionalUnits: bigint, builderFeeUnits: bigint, platformFeeRateBps: number,
 *   totalCostUnits: bigint, netProceedsUnits: bigint, feeLines: Array, currency: 'USDC' }}
 */
export function computeCost({ price, size, side, isMaker = false }, feeBreakdown) {
  const priceUnits = parseUnits(String(price), USDC_DECIMALS)
  const sizeUnits = parseUnits(String(size), USDC_DECIMALS)
  // notional = price × size, both 6-dec → divide out one scale factor.
  const notionalUnits = (priceUnits * sizeUnits) / 10n ** BigInt(USDC_DECIMALS)

  // Makers pay no builder fee (Polymarket keeps makers whole).
  const builderBps = isMaker ? Number(feeBreakdown?.builderMakerFeeBps ?? 0) : Number(feeBreakdown?.builderTakerFeeBps ?? 0)
  const builderFeeUnits = feeUnits(notionalUnits, builderBps)

  // Our guaranteed side of the math: notional ± our builder fee. Polymarket's fee is additional and
  // charged at execution (disclosed, not fabricated).
  const totalCostUnits = notionalUnits + builderFeeUnits
  const netProceedsUnits = notionalUnits - builderFeeUnits

  const feeLines = [
    // FairWins' builder fee — always its own honest line when it applies (never hidden, FR-012).
    feeLine('FairWins builder fee', builderFeeUnits),
  ].filter(Boolean)

  return {
    notionalUnits,
    builderFeeUnits,
    platformFeeRateBps: isMaker ? 0 : Number(feeBreakdown?.feeRateBps ?? 0),
    totalCostUnits,
    netProceedsUnits: netProceedsUnits < 0n ? 0n : netProceedsUnits,
    feeLines,
    currency: 'USDC',
    side,
  }
}

/**
 * Build a CLOB order as EIP-712 typed data + the honest cost breakdown.
 *
 * @param {object} params  { tokenId, side: 'BUY'|'SELL', price, size, isMaker }
 * @param {object} feeBreakdown  gateway fee-rate response { feeRateBps, builderTakerFeeBps, builderMakerFeeBps }
 * @param {string} builder  FairWins bytes32 builder code (or zero bytes32 when unattributed)
 * @param {object} opts  { maker, signer, exchangeAddress, chainId, expirationSec, salt, nonce, signatureType, now }
 * @returns {{ domain, types, message, totalCost, netProceeds, feeLines, currency, notional }}
 */
export function buildOrder(params, feeBreakdown, builder, opts) {
  const {
    maker,
    signer = maker,
    negRisk = false,
    exchangeAddress = polymarketExchange(negRisk),
    chainId = 137,
    expirationSec = 0,
    salt = '0',
    nonce = 0,
    signatureType = 0,
    now,
  } = opts
  const isBuy = params.side === 'BUY'
  const cost = computeCost(params, feeBreakdown)
  const sizeUnits = parseUnits(String(params.size), USDC_DECIMALS)

  // BUY: maker gives USDC (notional), takes shares. SELL: maker gives shares, takes USDC.
  const makerAmount = isBuy ? cost.notionalUnits : sizeUnits
  const takerAmount = isBuy ? sizeUnits : cost.notionalUnits
  const nowSec = Math.floor((now ?? Date.now()) / 1000)

  const message = {
    salt: String(salt),
    maker,
    signer,
    taker: ZERO_ADDRESS,
    tokenId: String(params.tokenId),
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    expiration: String(expirationSec ? nowSec + expirationSec : 0),
    nonce: String(nonce),
    // The platform fee rate on the order (maker → 0); the builder fee is attributed via `builder`.
    feeRateBps: String(params.isMaker ? 0 : Number(feeBreakdown?.feeRateBps ?? 0)),
    side: SIDE[params.side] ?? SIDE.BUY,
    signatureType,
    builder: builder || ZERO_BYTES32,
  }

  const domain = {
    name: 'Polymarket CTF Exchange',
    version: '2',
    chainId: Number(chainId),
    verifyingContract: exchangeAddress,
  }

  return {
    domain,
    types: CLOB_ORDER_TYPES,
    message,
    totalCost: formatUnits(cost.totalCostUnits, USDC_DECIMALS),
    netProceeds: formatUnits(cost.netProceedsUnits, USDC_DECIMALS),
    notional: formatUnits(cost.notionalUnits, USDC_DECIMALS),
    feeLines: cost.feeLines,
    currency: 'USDC',
  }
}

export { ZERO_BYTES32 }
