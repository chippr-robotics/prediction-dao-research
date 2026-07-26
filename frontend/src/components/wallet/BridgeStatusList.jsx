/**
 * BridgeStatusList (spec 067, US1 — T081) — the member's cross-network transfers,
 * live ones first, each with BOTH transactions linked.
 *
 * This is the surface FR-009/FR-010/FR-011 are actually judged on, so three rules
 * shape every branch below:
 *
 *   1. Nothing is shown as complete before the DESTINATION network delivered.
 *      `bridgeLedgerSource` already refuses to persist `delivered` without a
 *      destination transaction hash and `deriveBridgeState` refuses to name it;
 *      `displayState()` applies the same test a third time at render, because a
 *      false "Delivered" is the worst thing this list can say. Same rule for
 *      `refunded`, which is equally a claim about money.
 *
 *   2. Nothing here holds the state. Entries are read back from the persisted
 *      client ledger and reconciled against evidence on mount, so a transfer
 *      started in another session shows its true current state (FR-010).
 *
 *   3. What is unknown says it is unknown. Each row carries an "as of" line
 *      naming where its status came from — the bridge service, the networks
 *      themselves, or neither — so a degraded read is visible rather than
 *      dressed up as progress (FR-052/FR-053/FR-054).
 *
 * Entries live on their ORIGIN chain (one per bridge, FR-035), so the list reads
 * every bridge-capable network rather than the wallet's active one: a member never
 * has to switch networks to see a transfer they started somewhere else (FR-059).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { NETWORKS } from '../../config/networks'
import { getTransactionUrl } from '../../config/blockExplorer'
import InfoTip from '../ui/InfoTip'
import AssetLogo from './AssetLogo'
import { BRIDGE_STATE, listBridgeEntries } from '../../data/ledger/sources/bridgeLedgerSource'
import {
  BRIDGE_POLL_INTERVAL_MS,
  BRIDGE_STATUS_SOURCE,
  isTerminalBridgeState,
  reconcileBridges,
} from '../../lib/bridge/bridgeStatus'
import {
  BRIDGE_ACTIVITY_SETTLEMENT_NOTE,
  BRIDGE_NEEDS_ATTENTION_RECOURSE,
  BRIDGE_TIPS,
  bridgeNetworks,
  bridgeStateCopy,
} from '../../lib/bridge/bridgeCopy'
import './BridgeStatus.css'

/** CSS status-dot class per displayed state — live states share the in-progress dot. */
const STATE_CLASS = Object.freeze({
  [BRIDGE_STATE.SUBMITTED]: 'moving',
  [BRIDGE_STATE.SOURCE_CONFIRMED]: 'moving',
  [BRIDGE_STATE.IN_FLIGHT]: 'moving',
  [BRIDGE_STATE.NEEDS_ATTENTION]: 'attention',
  [BRIDGE_STATE.DELIVERED]: 'delivered',
  [BRIDGE_STATE.REFUNDED]: 'returned',
  [BRIDGE_STATE.FAILED]: 'failed',
})

/** Where a row's status came from, said plainly (FR-052). */
const SOURCE_LABEL = Object.freeze({
  [BRIDGE_STATUS_SOURCE.GATEWAY]: 'from the bridge service',
  [BRIDGE_STATUS_SOURCE.CHAIN]: 'read from the networks',
  [BRIDGE_STATUS_SOURCE.NONE]: 'not confirmed — neither the bridge service nor the networks could be read',
})

/**
 * The state to RENDER, which is never ahead of the evidence on the entry.
 *
 * The ledger applies this rule at write time; repeating it here means a record
 * restored from a backup written by some other build, or hand-edited in storage,
 * still cannot make this list claim a delivery that has no destination
 * transaction behind it (FR-009).
 */
function displayState(entry) {
  if (entry?.state === BRIDGE_STATE.DELIVERED && !entry.dstTxHash) return BRIDGE_STATE.IN_FLIGHT
  if (entry?.state === BRIDGE_STATE.REFUNDED && !entry.refundTxHash) return BRIDGE_STATE.NEEDS_ATTENTION
  return entry?.state || BRIDGE_STATE.SUBMITTED
}

/** Live transfers first, then settled ones; newest first inside each group. */
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const liveA = isTerminalBridgeState(displayState(a)) ? 1 : 0
    const liveB = isTerminalBridgeState(displayState(b)) ? 1 : 0
    if (liveA !== liveB) return liveA - liveB
    return (b.timestamp ?? 0) - (a.timestamp ?? 0)
  })
}

/** Token amount, or an honest dash when the record does not carry its decimals. */
function fmtAmount(raw, decimals, symbol) {
  if (raw == null || decimals == null) return '—'
  try {
    const value = Number(formatUnits(BigInt(raw), decimals))
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}${symbol ? ` ${symbol}` : ''}`
  } catch {
    return '—'
  }
}

function networkName(chainId) {
  return NETWORKS[chainId]?.name || 'unknown network'
}

function fmtTime(ts) {
  if (!(Number(ts) > 0)) return null
  try {
    return new Date(Number(ts)).toLocaleString()
  } catch {
    return null
  }
}

/** A transaction link, or null — a hash we cannot point at is not linked (FR-054). */
function TxLink({ chainId, txHash, label }) {
  const url = txHash ? getTransactionUrl(chainId, txHash) : ''
  if (!url) return null
  return (
    <a className="bridge-tx-link" href={url} target="_blank" rel="noopener noreferrer">
      {label} ↗
    </a>
  )
}

/**
 * @param {object} props
 * @param {boolean} [props.autoRefresh] poll live transfers while mounted (default true)
 * @param {number} [props.refreshKey] bump to force an immediate reload — the Bridge tab raises it
 *   the moment a transfer is recorded, so a bridge the member just made is never invisible on the
 *   screen that reported it (FR-009/FR-010).
 */
export default function BridgeStatusList({ autoRefresh = true, refreshKey = 0 }) {
  const { address } = useWallet() || {}
  const chainIds = useMemo(() => bridgeNetworks().map((net) => net.chainId), [])

  const [entries, setEntries] = useState([])
  const [reads, setReads] = useState(() => new Map())
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!address || chainIds.length === 0) {
      setEntries([])
      setStatus('ready')
      return
    }
    const reqId = ++reqIdRef.current
    // `reconcileBridges` never throws and never blocks: a gateway that is off or a
    // network that cannot be read simply lowers what we can claim (FR-053).
    const nextReads = new Map()
    for (const chainId of chainIds) {
      const results = await reconcileBridges(address, chainId)
      for (const result of results) {
        if (!result?.depositId) continue
        nextReads.set(`${chainId}:${result.depositId}`, {
          source: result.source || BRIDGE_STATUS_SOURCE.NONE,
          at: Date.now(),
        })
      }
    }
    if (reqId !== reqIdRef.current) return
    setReads(nextReads)
    setEntries(sortEntries(chainIds.flatMap((chainId) => listBridgeEntries(address, chainId))))
    setStatus('ready')
  }, [address, chainIds])

  // Account change: hard reset so another account's transfers never render.
  useEffect(() => {
    reqIdRef.current += 1
    setEntries([])
    setReads(new Map())
    setStatus('loading')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainIds])

  // A bridge was just recorded by the form above — reload WITHOUT clearing, so the new transfer
  // appears immediately rather than only on the next poll or the next visit.
  useEffect(() => {
    if (!refreshKey) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const hasLive = entries.some((e) => !isTerminalBridgeState(displayState(e)))

  useEffect(() => {
    if (!autoRefresh || !hasLive) return undefined
    const id = setInterval(load, BRIDGE_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [autoRefresh, hasLive, load])

  if (status === 'loading') return <p className="bridge-status-state">Loading your transfers…</p>

  if (entries.length === 0) {
    return (
      <p className="bridge-status-state">
        No cross-network transfers yet. Transfers you send between networks appear here, with both
        transactions linked, until the destination network has delivered them.
      </p>
    )
  }

  return (
    <div className="bridge-status">
      <div className="bridge-status-header">
        <h3>
          Cross-network transfers
          <InfoTip label="About transfer progress">{BRIDGE_TIPS.progress}</InfoTip>
        </h3>
        <button type="button" className="bridge-refresh" onClick={load}>
          Refresh
        </button>
      </div>

      <ul className="bridge-status-list" aria-label="Cross-network transfers">
        {entries.map((entry) => {
          const state = displayState(entry)
          const copy = bridgeStateCopy(state)
          const read = reads.get(`${entry.originChainId}:${entry.depositId}`) || null
          const readAt = fmtTime(read?.at)
          const sent = fmtTime(entry.timestamp)
          return (
            <li key={entry.entryId} className="bridge-status-item">
              <span className={`bridge-dot ${STATE_CLASS[state] || 'moving'}`} aria-hidden="true" />
              <div className="bridge-status-body">
                <div className="bridge-status-head">
                  <span className="bridge-status-label">{copy.label}</span>
                  <span className="bridge-status-amount">
                    {fmtAmount(entry.amountRaw, entry.tokenDecimals, entry.tokenSymbol)}
                  </span>
                </div>

                <div className="bridge-status-route">
                  <AssetLogo
                    symbol={entry.tokenSymbol}
                    chainId={entry.originChainId}
                    showBadge
                    size={20}
                  />
                  <span>{networkName(entry.originChainId)}</span>
                  <span className="bridge-status-arrow" aria-hidden="true">
                    →
                  </span>
                  <AssetLogo
                    symbol={entry.tokenSymbol}
                    chainId={entry.destinationChainId}
                    showBadge
                    size={20}
                  />
                  <span>{networkName(entry.destinationChainId)}</span>
                </div>

                <p className="bridge-status-detail">{copy.detail}</p>

                {state === BRIDGE_STATE.DELIVERED && entry.outputAmountRaw != null && (
                  <p className="bridge-status-detail">
                    Delivered{' '}
                    {fmtAmount(entry.outputAmountRaw, entry.tokenDecimals, entry.tokenSymbol)} on{' '}
                    {networkName(entry.destinationChainId)}.
                  </p>
                )}

                {state === BRIDGE_STATE.NEEDS_ATTENTION && (
                  <p className="bridge-status-recourse" role="note">
                    {BRIDGE_NEEDS_ATTENTION_RECOURSE}
                  </p>
                )}

                <div className="bridge-status-links">
                  <TxLink
                    chainId={entry.originChainId}
                    txHash={entry.srcTxHash}
                    label={`Sending transaction on ${networkName(entry.originChainId)}`}
                  />
                  {entry.dstTxHash ? (
                    <TxLink
                      chainId={entry.destinationChainId}
                      txHash={entry.dstTxHash}
                      label={`Delivery transaction on ${networkName(entry.destinationChainId)}`}
                    />
                  ) : (
                    // No destination transaction means nothing has been delivered. Saying
                    // so is the point (FR-009) — an absent link would read as an omission.
                    <span className="bridge-status-nolink">
                      No delivery transaction yet on {networkName(entry.destinationChainId)}
                    </span>
                  )}
                  <TxLink
                    chainId={entry.originChainId}
                    txHash={entry.refundTxHash}
                    label={`Return transaction on ${networkName(entry.originChainId)}`}
                  />
                </div>

                <p className="bridge-status-meta">
                  {sent ? `Sent ${sent}` : 'Sent at an unrecorded time'} ·{' '}
                  {entry.settlementProtocol
                    ? `Settled by ${entry.settlementProtocol} Protocol.`
                    : BRIDGE_ACTIVITY_SETTLEMENT_NOTE}
                  {!isTerminalBridgeState(state) && (
                    <>
                      {' '}
                      · Status as of {readAt || 'this session'}
                      {read ? ` (${SOURCE_LABEL[read.source] || SOURCE_LABEL[BRIDGE_STATUS_SOURCE.NONE]})` : ''}
                    </>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
