/**
 * Seaport order builder (spec 056) — the invariants that keep the sell flow honest:
 * net = seller-receipt consideration (FR-010), all required fees present, NO FairWins recipient
 * (FR-015), below-floor detection (FR-011).
 */
import { describe, it, expect } from 'vitest'
import { parseUnits } from 'ethers'
import { buildOrder, computeNet, SEAPORT_ORDER_TYPES } from '../../lib/collectibles/seaportOrder'

const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719'
const ROYALTY_RECIPIENT = '0x1111111111111111111111111111111111111111'
const SELLER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const CONTRACT = '0x2953399124F0cBB46d2CbACD8A89cF0599974963'

const feeBreakdown = {
  chainId: 137,
  collectionSlug: 'cool-cats',
  marketplaceFee: { recipient: OPENSEA_FEE_RECIPIENT, basisPoints: 250 },
  creatorRoyalty: { recipient: ROYALTY_RECIPIENT, basisPoints: 500, required: true },
  fees: [
    { recipient: OPENSEA_FEE_RECIPIENT, basisPoints: 250, required: true },
    { recipient: ROYALTY_RECIPIENT, basisPoints: 500, required: true },
  ],
  totalRequiredBasisPoints: 750,
  protocolAddress: '0x0000000000000068F116a894984e2DB1123eB395',
  protocolVersion: '1.6',
  conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
}

const item = { chainId: 137, contract: CONTRACT, identifier: '1234', standard: 'erc721', quantity: 1 }
const price = { amount: '10', currency: 'WETH', decimals: 18, tokenAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', native: false }

describe('computeNet', () => {
  it('subtracts every required fee and reports the seller net (FR-002/FR-010)', () => {
    const r = computeNet(price, feeBreakdown)
    // 10 WETH − 2.5% − 5% = 9.25
    expect(r.net).toBe('9.25')
    expect(r.sellerUnits).toBe(parseUnits('9.25', 18))
    expect(r.feeLines).toEqual([
      { label: 'Marketplace fee', amount: '0.25', currency: 'WETH' },
      { label: 'Creator royalty', amount: '0.5', currency: 'WETH' },
    ])
    expect(r.belowFloor).toBe(false)
  })

  it('flags below-floor when fees would meet or exceed the price (FR-011)', () => {
    const zeroPrice = { ...price, amount: '0' }
    expect(computeNet(zeroPrice, feeBreakdown).belowFloor).toBe(true)
  })
})

describe('buildOrder', () => {
  const order = buildOrder(item, price, feeBreakdown, { offerer: SELLER, counter: 3, salt: '42', now: 1_800_000_000_000 })

  it('produces the Seaport domain + OrderComponents typed data', () => {
    expect(order.domain).toEqual({
      name: 'Seaport',
      version: '1.6',
      chainId: 137,
      verifyingContract: '0x0000000000000068F116a894984e2DB1123eB395',
    })
    expect(order.types).toBe(SEAPORT_ORDER_TYPES)
    expect(order.message.offerer).toBe(SELLER)
    expect(order.message.counter).toBe('3')
    expect(order.message.conduitKey).toBe(feeBreakdown.conduitKey)
  })

  it('offers the NFT and the consideration sums to the full price', () => {
    expect(order.message.offer).toHaveLength(1)
    expect(order.message.offer[0]).toMatchObject({ itemType: 2, token: CONTRACT, identifierOrCriteria: '1234' })
    const total = order.message.consideration.reduce((s, c) => s + BigInt(c.startAmount), 0n)
    expect(total).toBe(parseUnits('10', 18)) // seller receipt + fees == price
  })

  it('the displayed net EQUALS the seller-receipt consideration amount (FR-010)', () => {
    const sellerItem = order.message.consideration[0]
    expect(sellerItem.recipient).toBe(SELLER)
    expect(sellerItem.startAmount).toBe(parseUnits(order.net, 18).toString())
    expect(order.net).toBe('9.25')
  })

  it('includes every required fee recipient in consideration and NO FairWins address (FR-015)', () => {
    const recipients = order.message.consideration.map((c) => c.recipient.toLowerCase())
    expect(recipients).toContain(OPENSEA_FEE_RECIPIENT.toLowerCase())
    expect(recipients).toContain(ROYALTY_RECIPIENT.toLowerCase())
    // Only three consideration items: seller + 2 fees — no extra FairWins fee line.
    expect(order.message.consideration).toHaveLength(3)
  })

  it('uses NATIVE item type + zero token for a native-currency listing', () => {
    const nativeOrder = buildOrder(item, { amount: '1', currency: 'POL', decimals: 18, native: true }, feeBreakdown, {
      offerer: SELLER,
      now: 1_800_000_000_000,
    })
    expect(nativeOrder.message.consideration[0].itemType).toBe(0)
    expect(nativeOrder.message.consideration[0].token).toBe('0x0000000000000000000000000000000000000000')
  })
})
