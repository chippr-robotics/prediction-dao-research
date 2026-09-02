/**
 * useFundingPools — data hook for funding pools (spec 102). Encapsulates every contract read/write so
 * pages stay presentational and testable (the pages mock this hook). Same shape and rails as
 * `usePools` (spec 034): a plain self-submitted EOA transaction when a signer exists, the passkey
 * account's `sendCalls` rail otherwise. The contracts carry `…WithSig` / EIP-3009 twins for a relayer;
 * that rail is a follow-up (research R8), so nothing here signs an intent.
 *
 * Honest state (Principle III): every number the page shows comes from `getSummary` (state reads) or
 * `getActivity` (the clone's own event log, bounded at its creation block). A failed read throws — it
 * never resolves to zeros.
 */
import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddressForChain } from '../config/contracts'
import {
  ERC20_ABI,
  getFundingFactory,
  getFundingPool,
  isFundingAvailable,
  fundingStateDisplay,
  REFUND_REASON,
} from '../lib/funding/fundingContracts'
import { phraseToIndices, indicesToPhrase, resolvePool } from '../lib/pools/gateway'
import { SUPPORTED_BIP39_LANGS, isLangAvailable } from '../lib/pools/bip39Lists'
import { getWordListLang } from '../utils/wordListLanguage'
import { deriveNickname } from '../lib/pools/nickname'
import { recordFundingPool } from '../lib/funding/myFundingPools'
import { progressPct, refundVotesNeeded, formatAmount, deadlinesFor } from '../lib/funding/progress'

const MAX_FEED = 200

/** Fetch a receipt by hash, retrying briefly for RPC lag. */
async function waitReceipt(runner, txHash, tries = 8, delayMs = 1500) {
  if (!txHash) return null
  const reader =
    runner && typeof runner.getTransactionReceipt === 'function'
      ? runner
      : runner?.provider && typeof runner.provider.getTransactionReceipt === 'function'
        ? runner.provider
        : null
  if (!reader) return null
  for (let i = 0; i < tries; i += 1) {
    const r = await reader.getTransactionReceipt(txHash)
    if (r) return r
    await new Promise((res) => setTimeout(res, delayMs))
  }
  return null
}

function parsePoolCreated(receipt, factory) {
  const ev = (receipt?.logs || [])
    .map((l) => {
      try {
        return factory.interface.parseLog(l)
      } catch {
        return null
      }
    })
    .find((e) => e && e.name === 'PoolCreated')
  if (!ev) return { pool: null, poolId: null, wordIndices: null, phrase: null }
  const wordIndices = [...ev.args.wordIndices].map((x) => Number(x))
  return {
    pool: ev.args.pool,
    poolId: ev.args.poolId,
    wordIndices,
    phrase: safePhrase(wordIndices),
  }
}

function safePhrase(wordIndices, lang = getWordListLang()) {
  try {
    return indicesToPhrase(wordIndices, isLangAvailable(lang) ? lang : 'en')
  } catch {
    return null
  }
}

async function readToken(tokenAddr, runner) {
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, runner)
  let decimals = 6
  let symbol = 'USDC'
  try {
    decimals = Number(await token.decimals())
    symbol = await token.symbol()
  } catch {
    /* USDC defaults */
  }
  return { token, decimals, symbol }
}

/** Assemble the PoolSummary (data-model.md) from state reads. Throws if the pool cannot be read. */
export async function summarizeFundingPool(pool, factory, account, chainId, now = Math.floor(Date.now() / 1000)) {
  const [
    stateNum, organizer, goal, purpose, tokenAddr, contributeDeadline, settleDeadline, createdBlock,
    totalRaised, contributorCount, refundVotes, refundedCount, refundReasonNum, closedAt,
  ] = await Promise.all([
    pool.state(), pool.organizer(), pool.goal(), pool.purpose(), pool.token(), pool.contributeDeadline(),
    pool.settleDeadline(), pool.createdBlock(), pool.totalRaised(), pool.contributorCount(),
    pool.refundVotes(), pool.refundedCount(), pool.refundReason(), pool.closedAt(),
  ])
  const address = await pool.getAddress()
  const { decimals, symbol } = await readToken(tokenAddr, pool.runner)
  const state = Number(stateNum)
  const raised = BigInt(totalRaised)
  const goalBn = BigInt(goal)
  const me = { contributed: 0n, contributedFormatted: '0', hasContributed: false, voted: false, refunded: false, canVote: false, canClaimRefund: false }
  if (account) {
    const [contributed, voted, refunded] = await Promise.all([
      pool.contributed(account), pool.votedRefund(account), pool.refunded(account),
    ])
    me.contributed = BigInt(contributed)
    me.contributedFormatted = formatAmount(me.contributed, decimals)
    me.hasContributed = me.contributed > 0n
    me.voted = Boolean(voted)
    me.refunded = Boolean(refunded)
    me.canVote = state === 0 && me.hasContributed && !me.voted
    me.canClaimRefund = state === 2 && me.hasContributed && !me.refunded
  }
  let wordIndices = null
  let phrase = null
  if (factory) {
    try {
      wordIndices = [...(await factory.phraseOfPool(address))].map((x) => Number(x))
      phrase = safePhrase(wordIndices)
    } catch {
      /* phrase is display-only */
    }
  }
  const isOrganizer = Boolean(account) && String(organizer).toLowerCase() === String(account).toLowerCase()
  const cd = Number(contributeDeadline)
  const sd = Number(settleDeadline)
  const contributionOpen = state === 0 && now < cd
  return {
    address,
    chainId,
    organizer,
    organizerAlias: deriveNickname(organizer, address).label,
    isOrganizer,
    purpose,
    goal: goalBn,
    goalFormatted: formatAmount(goalBn, decimals),
    totalRaised: raised,
    raisedFormatted: formatAmount(raised, decimals),
    progressPct: progressPct(raised, goalBn),
    goalMet: goalBn > 0n && raised >= goalBn,
    tokenAddress: tokenAddr,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    contributorCount: Number(contributorCount),
    refundVotes: Number(refundVotes),
    refundVotesNeeded: refundVotesNeeded(Number(contributorCount)),
    refundedCount: Number(refundedCount),
    refundReason: REFUND_REASON[Number(refundReasonNum)] ?? null,
    state,
    stateLabel: fundingStateDisplay(state),
    contributeDeadline: cd,
    settleDeadline: sd,
    createdBlock: Number(createdBlock),
    closedAt: Number(closedAt),
    contributionOpen,
    canClose: isOrganizer && state === 0,
    canCancel: isOrganizer && state === 0,
    canPokeDeadline: state === 0 && now >= sd,
    me,
    wordIndices,
    phrase,
  }
}

/** Decode the clone's event log into feed entries (data-model.md ActivityEntry), newest first. */
export function decodeActivity(events, poolAddress) {
  const entries = []
  for (const e of events) {
    if (!e || !e.fragment || !e.args) continue
    const base = { blockNumber: e.blockNumber, logIndex: e.index ?? e.logIndex ?? 0, txHash: e.transactionHash }
    switch (e.fragment.name) {
      case 'Contributed':
        entries.push({ ...base, kind: 'contribute', actor: e.args.contributor, amount: BigInt(e.args.amount) })
        break
      case 'PoolClosed':
        entries.push({ ...base, kind: 'close', actor: e.args.organizer, amount: BigInt(e.args.amount) })
        break
      case 'RefundVoted':
        entries.push({ ...base, kind: 'vote', actor: e.args.contributor, votes: Number(e.args.votes), needed: Number(e.args.needed) })
        break
      case 'RefundingStarted':
        entries.push({ ...base, kind: 'refunding', actor: null, reason: REFUND_REASON[Number(e.args.reason)] ?? null })
        break
      case 'RefundClaimed':
        entries.push({ ...base, kind: 'refund', actor: e.args.contributor, amount: BigInt(e.args.amount) })
        break
      default:
        break
    }
  }
  entries.sort((a, b) => (b.blockNumber - a.blockNumber) || (b.logIndex - a.logIndex))
  return entries.slice(0, MAX_FEED).map((en) => ({
    ...en,
    alias: en.actor ? deriveNickname(en.actor, poolAddress).label : null,
  }))
}

export function useFundingPools() {
  const { signer, provider, address, account, chainId, sendCalls } = useWeb3()
  const activeAddress = address || account
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const requireContext = useCallback(async ({ needAccount = true } = {}) => {
    const runner = signer || provider
    if (!runner) throw new Error('Connect your wallet to use pools.')
    if (needAccount && !activeAddress) throw new Error('Connect your wallet to use pools.')
    const net =
      chainId != null
        ? { chainId }
        : typeof runner.getNetwork === 'function'
          ? await runner.getNetwork()
          : runner.provider && typeof runner.provider.getNetwork === 'function'
            ? await runner.provider.getNetwork()
            : null
    const activeChainId = Number(net?.chainId)
    if (!activeChainId) throw new Error('Could not determine the active network.')
    return { runner, signer, chainId: activeChainId, account: activeAddress }
  }, [signer, provider, activeAddress, chainId])

  const requireSendCalls = useCallback(() => {
    if (typeof sendCalls !== 'function') {
      throw new Error('This wallet cannot submit pool transactions on the current transaction rail.')
    }
    return sendCalls
  }, [sendCalls])

  /** Submit one or more contract calls on whichever rail the wallet has. Returns a txHash-ish id. */
  const submit = useCallback(async (calls) => {
    const { signer: s } = await requireContext()
    if (s) {
      let last = null
      for (const c of calls) {
        const tx = await s.sendTransaction({ to: c.target, data: c.data, value: c.value ?? 0n })
        last = await tx.wait()
      }
      return last?.hash ?? null
    }
    const send = requireSendCalls()
    const submitted = await send(calls.map((c) => ({ target: c.target, data: c.data, value: c.value ?? 0n })))
    const id = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
    if (!id) throw new Error('Submitted, but no transaction reference was returned.')
    return id
  }, [requireContext, requireSendCalls])

  const wrap = useCallback(async (label, fn) => {
    setStatus(label)
    setError(null)
    try {
      const out = await fn()
      setStatus('idle')
      return out
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [])

  /** Is the factory deployed on the active chain? (Read-only, never throws.) */
  const available = useCallback(() => isFundingAvailable(chainId), [chainId])

  /**
   * Create a pool. `form`: { purpose, goal (decimal string), windowId, token? }.
   * Returns { pool, poolId, wordIndices, phrase, txHash }.
   */
  const createPool = useCallback(async (form) => wrap('creating', async () => {
    const { runner, chainId: activeChainId, account: activeAccount } = await requireContext()
    const factory = getFundingFactory(runner, activeChainId)
    const tokenAddr = form.token || getContractAddressForChain('paymentToken', activeChainId)
    if (!tokenAddr) throw new Error('No escrow token configured for this network.')
    const { decimals } = await readToken(tokenAddr, runner)
    const { contributeDeadline, settleDeadline } = deadlinesFor(form.windowId)
    const params = {
      token: tokenAddr,
      goal: ethers.parseUnits(String(form.goal), decimals),
      purpose: String(form.purpose).trim(),
      contributeDeadline,
      settleDeadline,
    }
    const factoryAddress = await factory.getAddress()
    const data = factory.interface.encodeFunctionData('createPool', [params])
    const txHash = await submit([{ target: factoryAddress, data }])
    const receipt = await waitReceipt(runner, txHash, 45, 2000)
    const parsed = parsePoolCreated(receipt, factory)
    if (parsed.pool && activeAccount) recordFundingPool(activeAccount, parsed.pool, 'organizer')
    return { ...parsed, txHash }
  }), [requireContext, submit, wrap])

  /** Resolve a route ref ({ address } | { words }) to a pool address, or null. Tries every language. */
  const resolveRef = useCallback(async (ref) => {
    if (!ref) return null
    if (ref.address) return ref.address
    const { runner, chainId: activeChainId } = await requireContext({ needAccount: false })
    const factory = getFundingFactory(runner, activeChainId)
    const preferred = getWordListLang()
    const langs = [preferred, ...SUPPORTED_BIP39_LANGS.filter((l) => l !== preferred)].filter(isLangAvailable)
    const phrase = ref.words.join(' ')
    for (const lang of langs) {
      const indices = phraseToIndices(phrase, lang)
      if (!indices) continue
      const addr = await resolvePool(factory, indices)
      if (addr) return addr
    }
    return null
  }, [requireContext])

  /** Resolve four words to a pool summary for the unified lookup: { summary } | { notFound, reason }. */
  const resolvePhrase = useCallback(async (phrase, lang = getWordListLang()) => {
    const { runner, chainId: activeChainId, account: activeAccount } = await requireContext({ needAccount: false })
    if (!isFundingAvailable(activeChainId)) return { notFound: true, reason: 'unavailable' }
    const indices = phraseToIndices(phrase, lang)
    if (!indices) return { notFound: true, reason: 'invalid' }
    const factory = getFundingFactory(runner, activeChainId)
    const addr = await resolvePool(factory, indices)
    if (!addr) return { notFound: true, reason: 'unknown' }
    const summary = await summarizeFundingPool(getFundingPool(addr, runner), factory, activeAccount, activeChainId)
    return { summary }
  }, [requireContext])

  const getSummary = useCallback(async (poolAddress) => {
    const { runner, chainId: activeChainId, account: activeAccount } = await requireContext({ needAccount: false })
    let factory
    try {
      factory = getFundingFactory(runner, activeChainId)
    } catch {
      factory = null // not deployed here — the summary still reads; only the phrase is unavailable
    }
    return summarizeFundingPool(getFundingPool(poolAddress, runner), factory, activeAccount, activeChainId)
  }, [requireContext])

  /** The pool's activity feed from its own event log (research R7). Throws if logs cannot be read. */
  const getActivity = useCallback(async (poolAddress, createdBlock) => {
    const { runner } = await requireContext({ needAccount: false })
    const pool = getFundingPool(poolAddress, runner)
    const fromBlock = Number(createdBlock) > 0 ? Number(createdBlock) : 0
    const events = await pool.queryFilter('*', fromBlock)
    const entries = decodeActivity(events, poolAddress)
    // Timestamps: one getBlock per distinct block, bounded by the feed cap.
    const readerP = runner?.provider ?? runner
    const blocks = [...new Set(entries.map((e) => e.blockNumber))]
    const stamps = new Map()
    await Promise.all(blocks.map(async (bn) => {
      try {
        const b = await readerP.getBlock(bn)
        if (b) stamps.set(bn, Number(b.timestamp))
      } catch {
        /* leave undefined */
      }
    }))
    return entries.map((e) => ({ ...e, timestamp: stamps.get(e.blockNumber) ?? null }))
  }, [requireContext])

  /** Contribute `amountText` (decimal string) to a pool: approve if needed, then contribute. */
  const contribute = useCallback(async (poolAddress, amountText, summary) => wrap('contributing', async () => {
    const { runner, account: activeAccount } = await requireContext()
    const amount = ethers.parseUnits(String(amountText), summary.tokenDecimals)
    if (amount <= 0n) throw new Error('Enter an amount above zero.')
    const token = new ethers.Contract(summary.tokenAddress, ERC20_ABI, runner)
    const calls = []
    const allowance = await token.allowance(activeAccount, poolAddress)
    if (allowance < amount) {
      calls.push({ target: summary.tokenAddress, data: token.interface.encodeFunctionData('approve', [poolAddress, amount]) })
    }
    const pool = getFundingPool(poolAddress, runner)
    calls.push({ target: poolAddress, data: pool.interface.encodeFunctionData('contribute', [amount]) })
    const txHash = await submit(calls)
    recordFundingPool(activeAccount, poolAddress, 'contributor')
    return { txHash, amount }
  }), [requireContext, submit, wrap])

  const runSimple = useCallback(async (label, fn, poolAddress) => wrap(label, async () => {
    const { runner } = await requireContext()
    const pool = getFundingPool(poolAddress, runner)
    const txHash = await submit([{ target: poolAddress, data: pool.interface.encodeFunctionData(fn, []) }])
    return { txHash }
  }), [wrap, requireContext, submit])

  const closePool = useCallback((poolAddress) => runSimple('closing', 'close', poolAddress), [runSimple])
  const cancelPool = useCallback((poolAddress) => runSimple('cancelling', 'cancel', poolAddress), [runSimple])
  const voteRefund = useCallback((poolAddress) => runSimple('voting', 'voteRefund', poolAddress), [runSimple])
  const claimRefund = useCallback((poolAddress) => runSimple('refunding', 'claimRefund', poolAddress), [runSimple])
  const pokeDeadline = useCallback((poolAddress) => runSimple('poking', 'pokeDeadline', poolAddress), [runSimple])

  return {
    status,
    error,
    available,
    createPool,
    resolveRef,
    resolvePhrase,
    getSummary,
    getActivity,
    contribute,
    closePool,
    cancelPool,
    voteRefund,
    claimRefund,
    pokeDeadline,
  }
}

export default useFundingPools
