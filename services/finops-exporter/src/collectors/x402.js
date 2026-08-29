/**
 * x402 agent-payment revenue collector (spec 089, FR-004; spec 096).
 *
 * THE PROBLEM THIS SOLVES, stated by the catalogue entry that blocked x402 from going live: an
 * x402 settlement has to be told apart from every other USDC arrival at the same treasury. The
 * treasury is not x402's alone — the FeeRouter forwards platform fees to it, and (once the Polygon
 * router is repointed) that is the SAME address. A balance delta, or a plain `Transfer` filter on
 * the recipient, would count fee revenue as agent revenue and report a number that is real money
 * attributed to the wrong thing.
 *
 * WHAT DISTINGUISHES ONE. x402 settles with EIP-3009 `transferWithAuthorization` (spec 096 — never
 * `receiveWithAuthorization`, because the treasury is an address that makes no calls and only the
 * `transfer…` variant can be delivered by a third party). USDC emits TWO logs for that call:
 *
 *     Transfer(from = payer, to = X402_PAY_TO, value)
 *     AuthorizationUsed(authorizer = payer, nonce)
 *
 * An ordinary transfer — the FeeRouter forwarding a fee, a manual top-up, an airdrop — emits the
 * first and never the second. So the pair, matched WITHIN ONE TRANSACTION, is the signature: a
 * `Transfer` into the treasury whose transaction also used an authorization is an x402 settlement,
 * and nothing else in this estate produces that shape at this address.
 *
 * WHY NOT FILTER ON THE SUBMITTER. The gateway's engine relayer delivers these, so "transactions
 * from our relayer" looks like an easier filter. It is not a durable one: the relayer id is
 * operational config that can be rotated or shared, `Transfer.from` is the PAYER rather than the
 * submitter, and reading the submitter costs a receipt fetch per candidate. The two-log signature
 * is a property of the payment itself and survives any of that changing.
 *
 * KNOWN LIMIT, WRITTEN DOWN. If a FairWins flow ever settles a `receiveWithAuthorization` whose
 * recipient IS the treasury, it would match this shape and be counted here. Nothing does today —
 * the intent rail's recipients are FairWins contracts, which is what makes `receive…` usable there
 * at all — and this comment is the record to check against if that ever changes.
 */
import { ethers } from 'ethers'
import { read, notConfigured, unreadable } from '../reading.js'
import { finalizedBlock } from '../chain/providers.js'
import { scanLogs } from '../chain/logs.js'

const IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
])

const TRANSFER = IFACE.getEvent('Transfer').topicHash
const AUTHORIZATION_USED = IFACE.getEvent('AuthorizationUsed').topicHash

/** USDC is 6dp on every chain x402 can settle on. Explicit so the scale is auditable. */
const USDC_DECIMALS = 6

function toUsdc(raw) {
  return Number(ethers.formatUnits(raw, USDC_DECIMALS))
}

export function createX402Collector({ config, providers, cursors, log = console.warn }) {
  return async function collectX402(source) {
    const x402 = config.x402 ?? {}
    const payTo = x402.payTo
    const token = x402.paymentToken

    // NOT-CONFIGURED, not zero. An unset treasury means the paid rail is not offered at all, which
    // is a different fact from "offered and nobody paid" — and $0 would quietly close that question.
    if (!payTo) {
      return notConfigured('X402_PAY_TO is unset — the paid rail is not offered, so there is nothing to settle')
    }
    if (!token) {
      return notConfigured(`no EIP-3009 payment token is recorded for chain ${x402.chainId} — x402 cannot settle there`)
    }

    const chainId = x402.chainId ?? source.chains?.[0]
    const provider = providers[chainId]
    if (!provider) return notConfigured(`no provider for chain ${chainId}`)

    const key = `x402:${chainId}:${token}:${payTo}`

    try {
      const to = await finalizedBlock(provider, chainId, config)
      const from = cursors.get(key, Math.max(0, to - config.lookbackBlocks))

      if (to < from) {
        // Head went backwards (a provider swap behind a FallbackProvider, or a deep reorg). Report
        // the running total rather than inventing a window, and do NOT rewind the cursor — the same
        // posture the FeeRouter collector takes, for the same reason.
        return read(toUsdc(cursors.total(key)), 'USDC', { labels: { chain: String(chainId) } })
      }

      // Both topics in ONE scan of the token contract: they must be correlated by transaction, so
      // fetching them separately would mean two ranges that can disagree at the boundary.
      const logs = await scanLogs(
        provider,
        { address: token, topics: [[TRANSFER, AUTHORIZATION_USED]] },
        from,
        to
      )

      // Transactions that used an authorization at all.
      const authorizedTxs = new Set()
      for (const entry of logs) {
        if (entry.topics[0] === AUTHORIZATION_USED) authorizedTxs.add(entry.transactionHash)
      }

      const payToTopic = ethers.zeroPadValue(ethers.getAddress(payTo), 32).toLowerCase()

      let delta = 0n
      for (const entry of logs) {
        if (entry.topics[0] !== TRANSFER) continue
        // topics[2] is the indexed `to`. Compare topic-to-topic so this never depends on how a
        // provider cases or pads the address it echoes back.
        if ((entry.topics[2] ?? '').toLowerCase() !== payToTopic) continue
        if (!authorizedTxs.has(entry.transactionHash)) continue
        delta += IFACE.decodeEventLog('Transfer', entry.data, entry.topics).value
      }

      cursors.accumulate(key, delta)
      cursors.set(key, to + 1)

      return read(toUsdc(cursors.total(key)), 'USDC', { labels: { chain: String(chainId) } })
    } catch (err) {
      // A partial scan understates revenue, and an understated number that looks successful is worse
      // than an honest absence (FR-006). scanLogs throws rather than returning partial results, and
      // this is where that becomes `unreadable` instead of a smaller-but-plausible figure.
      log(`[finops] x402 collector failed for chain ${chainId}: ${err.message}`)
      return unreadable(`x402 settlement scan failed: ${err.message}`)
    }
  }
}
