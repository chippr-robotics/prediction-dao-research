/**
 * OpenSea API v2 -> gateway DTO normalization for the /v1/opensea/* proxy (specs 055 read + 056 sell).
 *
 * The gateway never passes OpenSea's response shape through to clients: every field the SPA
 * consumes is mapped here, so upstream schema drift breaks THIS module's tests, not the frontend.
 * Prices always travel as {amount, currency} pairs — never a bare number (FR-013).
 */

import { seaportProtocol, OPENSEA_FEE_RECIPIENT } from './seaport.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]*$/
const IDENTIFIER_RE = /^\d{1,128}$/
const SLUG_RE = /^[a-z0-9-]{1,128}$/
const CURSOR_MAX = 512

/** chainId -> OpenSea chain slug. Ethereum + Polygon only (FR-001/FR-007); Mordor/ETC are
 * NOT OpenSea chains — anything else soft-fails as unsupported_chain. */
const CHAIN_SLUGS = { 1: 'ethereum', 137: 'matic' }

export function chainSlug(chainId) {
  return CHAIN_SLUGS[Number(chainId)] ?? null
}

export const isAddress = (v) => typeof v === 'string' && ADDRESS_RE.test(v)
export const isIdentifier = (v) => typeof v === 'string' && IDENTIFIER_RE.test(v)
export const isSlug = (v) => typeof v === 'string' && SLUG_RE.test(v)
export const isCursor = (v) => v == null || (typeof v === 'string' && v.length > 0 && v.length <= CURSOR_MAX)
export const isHex = (v) => typeof v === 'string' && HEX_RE.test(v)
export const isOrderHash = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)

/** Deep link to the exact item on the marketplace (FR-004). */
export function openseaAssetUrl(chainId, contract, identifier) {
  return `https://opensea.io/assets/${chainSlug(chainId)}/${contract.toLowerCase()}/${identifier}`
}

export function openseaCollectionUrl(slug) {
  return `https://opensea.io/collection/${slug}`
}

/** {amount, currency} or null — callers render explicit "none yet" states for null (FR-003). */
export function priceQuote(amount, currency) {
  if (amount == null || currency == null || currency === '') return null
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return null
  return { amount: String(amount), currency: String(currency) }
}

/** OpenSea offer price object ({value, decimals, currency}) -> PriceQuote. */
export function priceQuoteFromUnits(price) {
  if (!price || price.value == null || !Number.isInteger(price.decimals)) return null
  let units
  try {
    units = BigInt(price.value)
  } catch {
    return null
  }
  if (units < 0n) return null
  const base = 10n ** BigInt(price.decimals)
  const whole = units / base
  const frac = (units % base).toString().padStart(price.decimals, '0').replace(/0+$/, '')
  return priceQuote(frac ? `${whole}.${frac}` : whole.toString(), price.currency)
}

/**
 * One owned NFT -> CollectibleItem, or null when the record is unusable (dropped upstream of
 * the client so a single malformed item never breaks the grid).
 */
export function normalizeItem(nft, chainId) {
  if (!nft || !isAddress(nft.contract) || !isIdentifier(String(nft.identifier ?? ''))) return null
  const identifier = String(nft.identifier)
  const quantity = Number.parseInt(nft.quantity ?? 1, 10)
  return {
    chainId: Number(chainId),
    contract: nft.contract,
    identifier,
    // Missing metadata renders as "#<id>" rather than crashing or hiding the item (edge case).
    name: typeof nft.name === 'string' && nft.name.trim() !== '' ? nft.name : `#${identifier}`,
    collectionSlug: typeof nft.collection === 'string' ? nft.collection : null,
    imageUrl: nft.display_image_url || nft.image_url || null,
    standard: nft.token_standard ?? null,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    isFlagged: Boolean(nft.is_disabled) || Boolean(nft.is_nsfw),
    openseaUrl: typeof nft.opensea_url === 'string' ? nft.opensea_url : openseaAssetUrl(chainId, nft.contract, identifier),
  }
}

/** Account-NFTs upstream body -> AccountCollectiblesPage (without the envelope timestamps). */
export function normalizeAccountPage(body, chainId) {
  const items = (Array.isArray(body?.nfts) ? body.nfts : [])
    .map((nft) => normalizeItem(nft, chainId))
    .filter(Boolean)
  return { items, next: typeof body?.next === 'string' && body.next !== '' ? body.next : null }
}

/** Collection metadata + stats -> Collection DTO. Either source may be null (degraded legs). */
export function normalizeCollection(slug, collectionBody, statsBody) {
  const stats = statsBody?.total
  return {
    slug,
    name: collectionBody?.name ?? slug,
    imageUrl: collectionBody?.image_url ?? null,
    openseaUrl: collectionBody?.opensea_url ?? openseaCollectionUrl(slug),
    floorPrice: priceQuote(stats?.floor_price, stats?.floor_price_symbol),
  }
}

/** Best listing for an item -> {orderHash, maker, price} or null (spec 056: drives Cancel state). */
export function normalizeListing(listingBody) {
  const order = listingBody?.orders?.[0] ?? listingBody
  const orderHash = order?.order_hash
  if (!isOrderHash(orderHash)) return null
  const maker = order?.maker?.address ?? order?.protocol_data?.parameters?.offerer ?? null
  return {
    orderHash,
    maker: isAddress(maker) ? maker : null,
    price: priceQuoteFromUnits(order?.current_price ? { value: order.current_price, decimals: 18, currency: 'ETH' } : order?.price?.current) ?? null,
  }
}

/** Composed detail legs -> CollectibleItemDetail (without the envelope timestamps). */
export function normalizeItemDetail({ nftBody, collectionBody, statsBody, offerBody, listingBody }, chainId) {
  const nft = nftBody?.nft
  const item = normalizeItem(nft, chainId)
  if (!item) return null
  const slug = item.collectionSlug
  return {
    ...item,
    description: typeof nft.description === 'string' && nft.description !== '' ? nft.description : null,
    traits: (Array.isArray(nft.traits) ? nft.traits : [])
      .filter((t) => t && t.trait_type != null && t.value != null)
      .map((t) => ({ traitType: String(t.trait_type), value: String(t.value) })),
    owner: isAddress(nft.owners?.[0]?.address) ? nft.owners[0].address : null,
    collection: slug ? normalizeCollection(slug, collectionBody, statsBody) : null,
    bestOffer: priceQuoteFromUnits(offerBody?.price) ?? null,
    bestOfferHash: isOrderHash(offerBody?.order_hash) ? offerBody.order_hash : null,
    listing: normalizeListing(listingBody),
  }
}

// ===== sell-side (spec 056) =====================================================================

/** One OpenSea collection fee entry -> {recipient, basisPoints, required}. `fee` is a percent
 * number (e.g. 2.5 => 250 bps). Returns null for a malformed entry. */
function normalizeFeeItem(entry) {
  if (!entry || !isAddress(entry.recipient)) return null
  const pct = Number(entry.fee ?? entry.basis_points_fee ?? NaN)
  if (!Number.isFinite(pct) || pct < 0) return null
  const basisPoints = Math.round(pct * 100)
  return { recipient: entry.recipient, basisPoints, required: Boolean(entry.required) }
}

/**
 * Collection body -> FeeBreakdown (spec 056 data-model). Classifies the OpenSea-recipient fee as the
 * marketplace fee and the rest as creator royalties, exposes the full list + total REQUIRED bps (the
 * net-proceeds basis), and echoes the Seaport protocol/conduit so the client never hardcodes them.
 * Returns null when the collection has no usable fee data (client then blocks signing — FR-009).
 */
export function normalizeFeeBreakdown(collectionBody, chainId, slug) {
  const proto = seaportProtocol(chainId)
  if (!proto) return null
  const raw = Array.isArray(collectionBody?.fees) ? collectionBody.fees : []
  const fees = raw.map(normalizeFeeItem).filter(Boolean)
  if (fees.length === 0) return null
  const isOpenSea = (r) => r.toLowerCase() === OPENSEA_FEE_RECIPIENT.toLowerCase()
  const marketplace = fees.find((f) => isOpenSea(f.recipient)) || null
  const royalties = fees.filter((f) => !isOpenSea(f.recipient))
  const totalRequiredBasisPoints = fees.filter((f) => f.required).reduce((s, f) => s + f.basisPoints, 0)
  return {
    chainId: Number(chainId),
    collectionSlug: slug,
    marketplaceFee: marketplace ? { recipient: marketplace.recipient, basisPoints: marketplace.basisPoints } : null,
    creatorRoyalty: royalties[0]
      ? { recipient: royalties[0].recipient, basisPoints: royalties[0].basisPoints, required: royalties[0].required }
      : null,
    fees,
    totalRequiredBasisPoints,
    protocolAddress: proto.protocolAddress,
    protocolVersion: proto.protocolVersion,
    conduitKey: proto.conduitKey,
    conduitAddress: proto.conduitAddress,
  }
}

/** OpenSea fulfillment-data response -> {to, data, value, orderHash} the wallet submits (FR-006).
 * Returns null when the response lacks a usable transaction (client shows the degraded state). */
export function normalizeFulfillment(body, orderHash) {
  const tx = body?.fulfillment_data?.transaction
  const data = typeof tx?.data === 'string' && isHex(tx.data) ? tx.data : null
  if (!tx || !isAddress(tx.to) || !data) return null
  return {
    to: tx.to,
    data,
    value: String(tx.value ?? '0'),
    orderHash: isOrderHash(orderHash) ? orderHash : null,
  }
}

/** Validate a client-submitted Seaport order body (shape only — the signature is proven on-chain by
 * OpenSea; we just refuse obviously malformed input before spending the write quota / upstream call). */
export function validateListingBody(body) {
  const order = body?.order
  if (!order || !isAddress(order.offerer)) return 'invalid_order'
  if (!Array.isArray(order.offer) || order.offer.length === 0) return 'invalid_order'
  if (!Array.isArray(order.consideration) || order.consideration.length === 0) return 'invalid_order'
  if (!isHex(body?.signature) || body.signature.length < 4) return 'invalid_order'
  if (body?.protocolAddress != null && !isAddress(body.protocolAddress)) return 'invalid_order'
  return null
}

