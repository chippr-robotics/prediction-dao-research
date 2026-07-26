/**
 * Shared helpers behind the two spec-067 operator control surfaces — the Bridge tab and the
 * Supply tab (US4, FR-040…FR-052). The cards they render live in `liquidityAdminCards.jsx`.
 *
 * The two tabs drive two different routers, but several things about them are identical, and
 * each is an HONESTY rule rather than a convenience. They live here so the two tabs cannot
 * drift apart on any of them:
 *
 *   1. **Scope is a NETWORK, not the wallet's network.** Control state is per-network (FR-050)
 *      and there are five of them. Gating an admin surface on the connected chain hides four
 *      fifths of the control state from an operator who is simply connected somewhere else. So
 *      reads span every capable network via that network's own RPC (`readProviderFor`), and
 *      only WRITES require the wallet to be there — the same split ClearPath already uses.
 *
 *   2. **A number is shown in units we can prove.** `tokenMeta` resolves a symbol and decimals
 *      only for tokens this build actually configures; everything else renders in RAW UNITS and
 *      says so. A mis-scaled limit is a silent, member-facing failure (a cap of 1 wei refuses
 *      every transfer), so `parseLimit` refuses rather than guessing a scale.
 *
 *   3. **`0` is not one thing.** A LIMIT of 0 is "uncapped"; an AMOUNT of 0 is zero. They get
 *      separate formatters precisely so a column of member transfer sizes can never print
 *      "uncapped".
 *
 *   4. **An unreadable read is never a zero.** `loadRouterHistory` distinguishes "no events" from
 *      "this RPC would not answer", because those are different statements to an operator
 *      auditing a control surface (FR-046).
 *
 *   5. **Authority is read from the router in scope, never inferred.** `readRouterAuthority` asks
 *      the specific router on the specific network whether THIS account holds the role — see its
 *      own doc-comment for why the app-wide role flags cannot answer that question.
 */
import { ethers } from 'ethers'
import { NETWORKS, listSupportedChainIds } from '../../config/networks'
import { makeReadProvider } from '../../utils/rpcProvider'

/** How far back the history/ops event scans look. Bounded — public RPCs refuse open ranges. */
export const HISTORY_LOOKBACK_BLOCKS = 200_000
/** Most rows either table renders. The explorer link carries the rest. */
export const HISTORY_LIMIT = 25

export function shortAddr(a) {
  return a && a !== ethers.ZeroAddress ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : ''
}

/** A settable address must be a real, non-zero address — the routers reject `ZeroAddress`. */
export const isValidAddr = (a) => ethers.isAddress(a) && a !== ethers.ZeroAddress

/** Display name for a chain, or an honest placeholder — never a guessed one. */
export function networkName(chainId) {
  return NETWORKS[chainId]?.name || `Chain ${chainId}`
}

/**
 * Every supported network carrying the capability a tab controls, mainnets first.
 *
 * Derived from config, not asserted, so the roster stays true as deployments land: a network
 * appears here because it has the PROTOCOL (an Across SpokePool / a Uniswap position manager),
 * and whether FairWins has deployed a router there is a separate question the tab answers
 * per-network. Listing only deployed networks would hide the ones an operator most needs to
 * see — the ones still waiting for a deployment.
 *
 * @param {'bridge'|'liquidity'} capability
 */
export function adminNetworks(capability) {
  return listSupportedChainIds()
    .map((id) => NETWORKS[id])
    .filter((net) => net?.capabilities?.[capability])
    .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
}

/**
 * A read connection for `chainId`.
 *
 * Reuses the wallet's own provider when the scope happens to be the connected chain (cheaper,
 * and it is already authenticated to whatever RPC the member configured), and otherwise builds
 * a read-only provider from that network's configured RPC. Returns null for a network with no
 * RPC, which the caller reports as unreadable rather than as empty.
 */
export function readProviderFor(chainId, walletChainId, walletProvider) {
  if (walletProvider && Number(chainId) === Number(walletChainId)) return walletProvider
  const rpcUrl = NETWORKS[chainId]?.rpcUrl
  return rpcUrl ? makeReadProvider(rpcUrl, chainId) : null
}

/** Minimal AccessControl surface — every spec-067 router exposes it via UUPSManaged. */
const ACCESS_CONTROL_ABI = ['function hasRole(bytes32 role, address account) view returns (bool)']

/** The three roles that gate a control on these two tabs, by their on-chain hashes. */
export const ROUTER_ROLE_HASHES = {
  // DEFAULT_ADMIN_ROLE is bytes32(0), not a keccak of a name.
  admin: ethers.ZeroHash,
  guardian: ethers.id('GUARDIAN_ROLE'),
  liquidityAdmin: ethers.id('LIQUIDITY_ADMIN_ROLE'),
}

/**
 * Does `account` hold admin / guardian / liquidity-admin on THIS router, on THIS network?
 *
 * ── WHY THE APP-WIDE ROLE FLAGS CANNOT ANSWER THIS ──────────────────────────────────────────────
 * `useRoles()`'s `isAdmin` / `isGuardian` / `isLiquidityAdmin` are a single boolean each, resolved
 * against a candidate list on the WALLET's connected chain. Three separate things break here:
 *
 *   • `isGuardian` means "holds GUARDIAN_ROLE on the WagerRegistry" — a different contract. The
 *     routers check GUARDIAN_ROLE on their own AccessControl instance, and the two sets are
 *     unrelated. An operator with the wager guardianship would be shown an enabled killswitch that
 *     reverts, which is precisely the belief FR-043/FR-044 exist to prevent.
 *   • `isLiquidityAdmin` is an OR across the BridgeRouter and the LiquidityRouter, while the role is
 *     granted per router on purpose (the Roles tab offers them as two separate targets). The OR
 *     showed an operator holding it on one router every write control on the other.
 *   • all of them read the wallet's chain, while these tabs scope to a NETWORK the operator picks.
 *     A Polygon guardian whose wallet sits on Ethereum lost the Polygon controls.
 *
 * So authority is asked of the contract that will enforce it. The role flags remain what they are
 * good for — deciding whether the tab appears at all.
 *
 * ── AND WHY AN UNREADABLE ANSWER IS NOT A DENIAL ────────────────────────────────────────────────
 * `readable: false` means the question could not be put, not that the answer was no. Callers must
 * keep offering the controls in that state and say the authority is unconfirmed: the contract is the
 * real gate and will refuse anything the operator does not hold, whereas withdrawing the killswitch
 * because an RPC timed out is the FR-044 failure — an operator who does hold it concludes there
 * isn't one. `deployed: false` IS a definite answer: there is no router here to hold a role on.
 *
 * @returns {Promise<{readable: boolean, deployed: boolean, admin: boolean, guardian: boolean,
 *                    liquidityAdmin: boolean, reason: string|null}>}
 */
export async function readRouterAuthority({ provider, routerAddress, account }) {
  const none = { admin: false, guardian: false, liquidityAdmin: false, reason: null }
  if (!routerAddress) return { ...none, readable: true, deployed: false }
  if (!provider || !account) {
    return {
      ...none,
      readable: false,
      deployed: true,
      reason: !account ? 'no account connected' : 'no read connection to this network',
    }
  }
  try {
    const c = new ethers.Contract(routerAddress, ACCESS_CONTROL_ABI, provider)
    const [admin, guardian, liquidityAdmin] = await Promise.all([
      c.hasRole(ROUTER_ROLE_HASHES.admin, account),
      c.hasRole(ROUTER_ROLE_HASHES.guardian, account),
      c.hasRole(ROUTER_ROLE_HASHES.liquidityAdmin, account),
    ])
    return {
      readable: true,
      deployed: true,
      admin: Boolean(admin),
      guardian: Boolean(guardian),
      liquidityAdmin: Boolean(liquidityAdmin),
      reason: null,
    }
  } catch (e) {
    return { ...none, readable: false, deployed: true, reason: e?.message || String(e) }
  }
}

/**
 * Turn an authority read into the two gates a tab needs, honestly.
 *
 * `pause` and `config` are permissive while authority is UNCONFIRMED (see `readRouterAuthority`) and
 * restrictive only on a definite "no". `unconfirmed` lets the caller say so once, in words, instead
 * of implying a verdict it does not have.
 */
export function authorityGates(authority) {
  if (!authority) return { pause: false, config: false, unconfirmed: false, pending: true }
  const unconfirmed = authority.deployed && !authority.readable
  return {
    pause: Boolean(authority.admin || authority.guardian || unconfirmed),
    config: Boolean(authority.admin || authority.liquidityAdmin || unconfirmed),
    unconfirmed,
    pending: false,
  }
}

/**
 * Symbol + decimals for a token this build actually knows on this network, or null.
 *
 * Deliberately config-only (the network's stablecoin and its wrapped native) rather than an
 * on-chain `symbol()`/`decimals()` read: an admin table that has to make two RPC calls per
 * token before it can render a limit is a table that shows nothing when one RPC is slow. An
 * unknown token is not a failure — it renders in RAW UNITS and SAYS it is raw units, which is
 * the honest reading of a number whose scale we cannot confirm.
 */
export function tokenMeta(chainId, address) {
  const net = NETWORKS[chainId]
  if (!net || !address) return null
  const a = String(address).toLowerCase()
  const stable = net.stablecoin
  if (stable?.address && String(stable.address).toLowerCase() === a) {
    return { symbol: stable.symbol, decimals: Number(stable.decimals) }
  }
  const wnative = net.dex?.wnative
  if (wnative && String(wnative).toLowerCase() === a) {
    return { symbol: `W${net.nativeCurrency?.symbol || ''}`, decimals: 18 }
  }
  return null
}

/** `"USDC"` for a token this build knows, else its short address — never a made-up ticker. */
export function tokenLabel(chainId, address) {
  if (!address || address === ethers.ZeroAddress) return '—'
  return tokenMeta(chainId, address)?.symbol || shortAddr(address)
}

/**
 * A limit rendered for operators. `0` is UNCAPPED on both routers, and saying so in words
 * matters more here than anywhere else: "0" in a max-amount column reads as "nothing may pass".
 */
export function formatLimit(chainId, address, raw) {
  const value = BigInt(raw ?? 0n)
  if (value === 0n) return 'uncapped'
  const meta = tokenMeta(chainId, address)
  if (!meta) return `${value} (raw units)`
  return `${ethers.formatUnits(value, meta.decimals)} ${meta.symbol}`
}

/**
 * An AMOUNT rendered for operators — deliberately separate from `formatLimit`, because `0`
 * means opposite things in the two places. A limit of 0 is "uncapped"; an amount of 0 is zero.
 * Reusing one formatter for both would print "uncapped" in a column of member transfer sizes.
 */
export function formatAmount(chainId, address, raw) {
  const value = BigInt(raw ?? 0n)
  const meta = tokenMeta(chainId, address)
  if (!meta) return `${value} (raw units)`
  return `${ethers.formatUnits(value, meta.decimals)} ${meta.symbol}`
}

/** The unit an operator is typing a limit in, so the input can label itself honestly. */
export function limitUnitLabel(chainId, address) {
  return tokenMeta(chainId, address)?.symbol || 'raw units'
}

/**
 * Parse an operator-typed limit into the integer the contract takes.
 *
 * Throws with a readable reason rather than returning a wrong number: a mis-scaled limit is a
 * silent, member-facing failure (a cap of 1 wei refuses every transfer), so it is rejected
 * BEFORE the wallet prompt. `0` is accepted and means uncapped, matching the contract.
 */
export function parseLimit(chainId, address, text) {
  const raw = String(text ?? '').trim()
  if (raw === '') throw new Error('Enter a limit — 0 means uncapped.')
  const meta = tokenMeta(chainId, address)
  if (!meta) {
    if (!/^\d+$/.test(raw)) {
      throw new Error('This token’s decimals are unknown here, so the limit must be typed in whole raw units (digits only).')
    }
    return BigInt(raw)
  }
  try {
    return ethers.parseUnits(raw, meta.decimals)
  } catch {
    throw new Error(`Enter an amount in ${meta.symbol} (up to ${meta.decimals} decimal places).`)
  }
}

/** `1h 30m` / `45s` — the expected-fill window, in the units an operator thinks in. */
export function formatDuration(seconds) {
  const s = Number(seconds || 0)
  if (!Number.isFinite(s) || s <= 0) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

const safe = (p) => p.then((v) => v).catch(() => undefined)

/**
 * Read a router's decoded change history: what changed, on what, before → after, by whom, when.
 *
 * Never throws. A bounded RPC that refuses the range yields `{ entries: [], error }` and the
 * card says "this RPC bounds event lookups" instead of "no changes" — those are very different
 * statements to an operator auditing a control surface (FR-046).
 *
 * @param {{contract: object, provider: object, eventNames: string[], describe: Function}} args
 * @returns {Promise<{entries: Array|null, error: string|null}>}
 */
export async function loadRouterHistory({ contract, provider, eventNames, describe }) {
  if (!contract || !provider) return { entries: [], error: 'no read connection' }
  try {
    const latest = await provider.getBlockNumber()
    const fromBlock = Math.max(0, Number(latest) - HISTORY_LOOKBACK_BLOCKS)
    const all = []
    for (const name of eventNames) {
      const evs = await safe(contract.queryFilter(contract.filters[name](), fromBlock, 'latest'))
      for (const ev of evs || []) all.push({ name, ev })
    }
    all.sort((a, b) => b.ev.blockNumber - a.ev.blockNumber || b.ev.index - a.ev.index)
    const entries = await Promise.all(
      all.slice(0, HISTORY_LIMIT).map(async ({ name, ev }) => {
        const block = await safe(provider.getBlock(ev.blockNumber))
        const described = describe(name, ev.args || {}) || {}
        return {
          key: `${ev.transactionHash}-${ev.index}`,
          name,
          action: described.action || name,
          target: described.target || '—',
          before: described.before ?? '—',
          after: described.after ?? '—',
          // `actor` on every config event; OZ's Paused/Unpaused name it `account`.
          actor: ev.args?.actor || ev.args?.account || null,
          at: block ? new Date(Number(block.timestamp) * 1000) : null,
          txHash: ev.transactionHash,
        }
      }),
    )
    return { entries, error: null }
  } catch (e) {
    return { entries: [], error: e?.message || String(e) }
  }
}
