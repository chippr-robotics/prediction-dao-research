/**
 * Asset Taxonomy Registry (spec 044) — SEC/CFTC-aligned classification of the
 * assets the Portfolio section scans for the connected account.
 *
 * Layered classification, industry-standard for wallet taxonomy filters:
 *   1. `sec-baseline`     — hardcoded baseline derived from the SEC's public
 *                           commodity classifications (major L1/L2 assets);
 *                           applies to native coins and their canonical
 *                           wrapped forms.
 *   2. `curated-registry` — bundled, per-network curated token entries
 *                           (Tokenlists-style data reduced to what the app
 *                           supports), mapped to a category by known issuer
 *                           status / contract behavior.
 *   3. `app-config`       — assets the app already knows from its own config
 *                           and sync artifacts (per-network stablecoin,
 *                           wrapped native, MembershipVoucher credential).
 *
 * Precedence on conflicts: sec-baseline > curated-registry > app-config
 * (FR-006). The registry is pure config — no chain reads — and strictly
 * per-network: entries never leak across chains (FR-007, constitution III).
 *
 * Discovery is registry-driven: the portfolio only scans assets listed here,
 * and the UI discloses that limitation (FR-013). Classifications are
 * informational, not legal or investment advice.
 */
import { NETWORKS } from './networks'
import { getContractAddressForChain } from './contracts'

// The five app-aligned regulatory categories (FR-004) plus the honest
// `unclassified` fallback (FR-012). Order is display order.
export const TAXONOMY_CATEGORIES = [
  {
    id: 'digital-commodities',
    label: 'Digital Commodities',
    order: 1,
    description:
      'Crypto assets intrinsically linked to, and deriving value from, the programmatic ' +
      'operation of an already functional decentralized system and general supply/demand ' +
      'dynamics — not the active managerial efforts of a core team. The SEC categorized ' +
      'major layer-1 and layer-2 assets here (e.g. Bitcoin, Ether, Solana, XRP).',
  },
  {
    id: 'digital-securities',
    label: 'Digital Securities',
    order: 2,
    description:
      'Tokens that represent an on-chain format of traditional financial instruments ' +
      '(equity, debt, or structured investments) or possess the economic characteristics ' +
      'of an investment contract. Fully subject to standard securities registration and ' +
      'compliance obligations.',
  },
  {
    id: 'payment-stablecoins',
    label: 'Payment Stablecoins',
    order: 3,
    description:
      'Stablecoins issued by an approved issuer under the scope of federal banking ' +
      'guidelines (such as the GENIUS Act framework), structurally isolated from being ' +
      'treated as securities when utilized as transactional payment instruments.',
  },
  {
    id: 'digital-tools',
    label: 'Digital Tools',
    order: 4,
    description:
      'Utility tokens that carry no intrinsic economic yield or capital-raising function ' +
      'but perform a distinct, practical function on an application or protocol — identity ' +
      'badges, name-service domains, or network credentials.',
  },
  {
    id: 'digital-collectibles',
    label: 'Digital Collectibles',
    order: 5,
    description:
      'Assets intended for collection, consumer use, or artistic media rights — typically ' +
      'non-fungible tokens representing artwork, music, and in-game items, provided they ' +
      'carry no profit-sharing characteristics.',
  },
  {
    id: 'unclassified',
    label: 'Unclassified',
    order: 6,
    description:
      'Assets the app knows about but cannot map to a regulatory category. Shown here ' +
      'rather than hidden, so the portfolio never silently omits a holding.',
  },
]

// Classification sources, highest precedence first (FR-006).
export const CLASSIFICATION_SOURCES = ['sec-baseline', 'curated-registry', 'app-config']

// Symbol-level baseline derived from the SEC's public commodity
// classifications (major L1/L2 assets named by the SEC: BTC, ETH, SOL, XRP)
// plus the gas assets of the networks this app runs on (MATIC/POL, ETC),
// which sit in the same functional-network bucket. Wrapped forms inherit the
// underlying symbol's classification via `baselineSymbol`.
export const SEC_COMMODITY_BASELINE = ['BTC', 'ETH', 'SOL', 'XRP', 'MATIC', 'POL', 'ETC']

const BASELINE_SET = new Set(SEC_COMMODITY_BASELINE)

// Curated per-network token entries. Canonical, well-known deployments only —
// the same convention as the canonical Uniswap addresses in networks.js.
// `baselineSymbol` marks a token as the wrapped form of an SEC-baseline
// commodity (upgrades its source to sec-baseline).
const CURATED_REGISTRY = {
  137: [
    {
      // Canonical Wrapped Ether on Polygon PoS (Polygon canonical bridge).
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      categoryId: 'digital-commodities',
      baselineSymbol: 'ETH',
    },
    {
      // Canonical Wrapped BTC on Polygon PoS.
      address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      categoryId: 'digital-commodities',
      baselineSymbol: 'BTC',
    },
    {
      // Chainlink token on Polygon PoS — protocol utility (oracle payment),
      // no yield/capital-raising function.
      address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
      symbol: 'LINK',
      name: 'ChainLink Token',
      decimals: 18,
      categoryId: 'digital-tools',
    },
    {
      // Tether USD on Polygon PoS — transactional stablecoin by known issuer.
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      categoryId: 'payment-stablecoins',
    },
  ],
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : address
}

/**
 * The taxonomy category for `categoryId`, falling back to the `unclassified`
 * category (never undefined) so display code can always render a group.
 */
export function getTaxonomyCategory(categoryId) {
  return (
    TAXONOMY_CATEGORIES.find((c) => c.id === categoryId) ||
    TAXONOMY_CATEGORIES.find((c) => c.id === 'unclassified')
  )
}

// Apply the SEC baseline on top of an entry's own classification: a native
// coin or wrapped form whose underlying symbol sits on the baseline is a
// Digital Commodity from the highest-precedence source, whatever the lower
// layers said (FR-006).
function withBaseline(entry) {
  const underlying = (entry.baselineSymbol || entry.symbol || '').toUpperCase()
  if ((entry.kind === 'native' || entry.baselineSymbol) && BASELINE_SET.has(underlying)) {
    return { ...entry, categoryId: 'digital-commodities', source: 'sec-baseline' }
  }
  return entry
}

/**
 * Build the scannable asset registry for one network (FR-005/006/007).
 *
 * Pure function of bundled config — no chain reads, no async. Returns [] for
 * unknown chains, which drives the honest "unavailable on this network" state
 * (FR-014). Every returned entry carries the queried chainId; entries whose
 * address cannot be resolved from config are omitted, never emitted empty.
 */
export function getPortfolioRegistry(chainId) {
  const net = NETWORKS[chainId]
  if (!net) return []

  // Assembled lowest-precedence first; later same-address inserts overwrite.
  const byId = new Map()
  const put = (entry) => {
    if (entry.kind !== 'native' && !entry.address) return
    const id = entry.kind === 'native' ? 'native' : normalizeAddress(entry.address)
    byId.set(id, withBaseline({ ...entry, id, chainId, address: entry.address || null }))
  }

  // --- app-config layer ---------------------------------------------------
  // Native coin. All currently supported natives (MATIC, ETC, ETH) sit on the
  // SEC baseline; withBaseline handles any future non-baseline native by
  // leaving it unclassified rather than guessing (FR-012).
  put({
    kind: 'native',
    symbol: net.nativeCurrency.symbol,
    name: net.nativeCurrency.name,
    decimals: net.nativeCurrency.decimals,
    categoryId: 'unclassified',
    source: 'app-config',
    baselineSymbol: net.nativeCurrency.symbol,
  })

  // Wrapped native — from the network's DEX config, falling back to the
  // synced per-chain deployment record.
  const wnative = net.dex?.wnative || getContractAddressForChain('wmatic', chainId)
  if (wnative) {
    put({
      kind: 'erc20',
      address: wnative,
      symbol: `W${net.nativeCurrency.symbol}`,
      name: `Wrapped ${net.nativeCurrency.name}`,
      decimals: 18,
      categoryId: 'unclassified',
      source: 'app-config',
      baselineSymbol: net.nativeCurrency.symbol,
    })
  }

  // The network's configured stablecoin — known issuer status via app config.
  if (net.stablecoin?.address) {
    put({
      kind: 'erc20',
      address: net.stablecoin.address,
      symbol: net.stablecoin.symbol,
      name: net.stablecoin.name,
      decimals: net.stablecoin.decimals,
      categoryId: 'payment-stablecoins',
      source: 'app-config',
    })
  }

  // MembershipVoucher (ERC-721) — an app-issued network credential, the
  // textbook Digital Tools case. Rendered as an item count (FR-011).
  const voucher = getContractAddressForChain('membershipVoucher', chainId)
  if (voucher) {
    put({
      kind: 'nft',
      address: voucher,
      symbol: 'FWMV',
      name: 'FairWins Membership Voucher',
      decimals: null,
      categoryId: 'digital-tools',
      source: 'app-config',
    })
  }

  // --- curated-registry layer (overwrites app-config on the same address) --
  for (const token of CURATED_REGISTRY[chainId] || []) {
    put({ kind: 'erc20', categoryId: 'unclassified', ...token, source: 'curated-registry' })
  }

  return Array.from(byId.values())
}
