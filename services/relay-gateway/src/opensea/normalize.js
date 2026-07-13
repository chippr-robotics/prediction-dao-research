/**
 * OpenSea API v2 -> gateway DTO normalization for the /v1/opensea/* proxy (spec 055).
 *
 * The gateway never passes OpenSea's response shape through to clients: every field the SPA
 * consumes is mapped here (specs/055-collectibles-portfolio/data-model.md), so upstream schema
 * drift breaks THIS module's tests, not the frontend. Prices always travel as
 * {amount, currency} pairs — never a bare number (FR-013).
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
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

/** Composed detail legs -> CollectibleItemDetail (without the envelope timestamps). */
export function normalizeItemDetail({ nftBody, collectionBody, statsBody, offerBody }, chainId) {
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
  }
}
