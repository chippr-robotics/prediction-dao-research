/**
 * usePools — data hook for Wager Pools (spec 034, address-based — Semaphore removed). Encapsulates all
 * contract reads/writes so pages stay presentational and testable (the pages mock this hook). Membership,
 * voting, and claims are by PUBLIC WALLET ADDRESS: the roster comes from `Joined(address)` events, a
 * member's nickname is derived deterministically from their address, and the winner's address is the
 * "claim code". Timing mirrors WagerRegistry — two absolute deadlines, `acceptDeadline`/`resolveDeadline`.
 *
 * Relayer path (spec 035/036): every write below is a plain self-submitted EOA transaction today. The
 * contracts additionally expose EIP-712 `…WithSig` twins (approveWithSig/claimWithSig/…) and an EIP-3009
 * gasless join, so this layer can later route submissions through a relayer without changing the pages —
 * the action set here maps 1:1 to those twins.
 */
import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddressForChain } from '../config/contracts'
import { ERC20_ABI, getFactory, getPool, POOL_STATE, poolStateDisplay } from '../lib/pools/poolContracts'
import { phraseToIndices, resolvePool, indicesToPhrase } from '../lib/pools/gateway'
import { deriveNickname } from '../lib/pools/nickname'
import { recordJoinedPool } from '../lib/lookup/myWagersSources'

function requiredApprovals(frozenDenominator, thresholdBips) {
  if (frozenDenominator <= 0) return 0
  return Math.max(1, Math.ceil((frozenDenominator * thresholdBips) / 10000))
}

async function summarizePool(poolContract, account) {
  const [
    stateNum, buyIn, tokenAddr, memberCount, maxMembers, thresholdBips,
    acceptDeadline, creator, frozenDenominator, closedAt, resolveDeadline, currentProposalId,
  ] = await Promise.all([
    poolContract.state(),
    poolContract.buyIn(),
    poolContract.token(),
    poolContract.memberCount(),
    poolContract.maxMembers(),
    poolContract.thresholdBips(),
    poolContract.acceptDeadline(),
    poolContract.creator(),
    poolContract.frozenDenominator(),
    poolContract.closedAt(),
    poolContract.resolveDeadline(),
    poolContract.currentProposalId(),
  ])
  const runner = poolContract.runner
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, runner)
  let decimals = 6
  let symbol = 'USDC'
  try {
    decimals = Number(await token.decimals())
    symbol = await token.symbol()
  } catch {
    /* fall back to USDC defaults */
  }

  const state = Number(stateNum)
  const denom = Number(frozenDenominator)
  const bips = Number(thresholdBips)
  const now = Math.floor(Date.now() / 1000)
  // Resolution is valid until the ABSOLUTE resolve deadline (no drift — matches WagerRegistry).
  const windowEnd = Number(resolveDeadline)
  const hasProposal = currentProposalId && currentProposalId !== ethers.ZeroHash

  let hasJoined = false
  let alreadyRefunded = false
  let approvalCount = 0
  let alreadyApproved = false
  if (account) {
    hasJoined = await poolContract.hasJoined(account)
    alreadyRefunded = await poolContract.refunded(account)
    if (hasProposal) alreadyApproved = await poolContract.approvedBy(currentProposalId, account)
  }
  if (hasProposal) approvalCount = Number(await poolContract.proposalApprovals(currentProposalId))

  const withinResolutionWindow = state === 1 && now < windowEnd
  const refundEligible =
    (state === 3 || (state === 1 && now >= windowEnd)) && hasJoined && !alreadyRefunded

  return {
    address: await poolContract.getAddress(),
    state,
    stateLabel: POOL_STATE[state] ?? 'Unknown',
    stateDisplay: poolStateDisplay(state),
    buyIn,
    buyInFormatted: ethers.formatUnits(buyIn, decimals),
    tokenAddress: tokenAddr,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    memberCount: Number(memberCount),
    maxMembers: Number(maxMembers),
    slotsRemaining: Number(maxMembers) - Number(memberCount),
    thresholdBips: bips,
    thresholdPct: bips / 100,
    acceptDeadline: Number(acceptDeadline),
    resolveDeadline: Number(resolveDeadline),
    closedAt: Number(closedAt),
    creator,
    isCreator: account ? creator.toLowerCase() === account.toLowerCase() : false,
    hasJoined,
    alreadyApproved,
    frozenDenominator: denom,
    currentProposalId: hasProposal ? currentProposalId : null,
    approvalCount,
    requiredApprovals: requiredApprovals(denom, bips),
    withinResolutionWindow,
    refundEligible,
  }
}

export function usePools() {
  const { signer } = useWeb3()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const requireSigner = useCallback(async () => {
    if (!signer) throw new Error('Connect your wallet to use group pools.')
    const net = await signer.provider.getNetwork()
    const account = await signer.getAddress()
    return { signer, chainId: Number(net.chainId), account }
  }, [signer])

  /**
   * Create a pool. `form`: { buyIn, maxMembers, thresholdPct, token?, acceptDeadline, resolveDeadline,
   * joinDays?, resolutionDays? }. The create UI passes exact instants from the shared DeadlineTimeline —
   * `acceptDeadline` and `resolveDeadline` (unix seconds), identical to the 1v1/open-challenge flow; the
   * older day-count fields remain as a fallback.
   */
  const createPool = useCallback(async (form) => {
    setStatus('creating')
    setError(null)
    try {
      const { signer: s, chainId, account } = await requireSigner()
      const factory = getFactory(s, chainId)
      const tokenAddr = form.token || getContractAddressForChain('paymentToken', chainId)
      if (!tokenAddr) throw new Error('No buy-in token configured for this network.')
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, s)
      let decimals = 6
      try {
        decimals = Number(await token.decimals())
      } catch {
        /* default USDC */
      }
      const now = Math.floor(Date.now() / 1000)
      const acceptDeadline =
        form.acceptDeadline != null ? Number(form.acceptDeadline) : now + Number(form.joinDays) * 86400
      const resolveDeadline =
        form.resolveDeadline != null
          ? Number(form.resolveDeadline)
          : acceptDeadline + Number(form.resolutionDays) * 86400
      const params = {
        token: tokenAddr,
        buyIn: ethers.parseUnits(String(form.buyIn), decimals),
        maxMembers: Number(form.maxMembers),
        thresholdBips: Math.round(Number(form.thresholdPct) * 100),
        acceptDeadline,
        resolveDeadline,
      }
      const tx = await factory.createPool(params)
      const receipt = await tx.wait()
      const ev = receipt.logs
        .map((l) => {
          try {
            return factory.interface.parseLog(l)
          } catch {
            return null
          }
        })
        .find((e) => e && e.name === 'PoolCreated')
      const wordIndices = ev ? ev.args.wordIndices.map((x) => Number(x)) : null
      // Record the pool device-locally so My Wagers can always list it, even when the subgraph for this
      // chain is lagging or absent (tester feedback: pools must be easy to locate again).
      if (ev) recordJoinedPool(account, ev.args.pool)
      setStatus('idle')
      return {
        poolId: ev ? ev.args.poolId : null,
        pool: ev ? ev.args.pool : null,
        wordIndices,
        phrase: wordIndices ? indicesToPhrase(wordIndices) : null,
        txHash: receipt.hash,
      }
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /** Resolve a four-word phrase to a pool summary, or null if it maps to no pool. */
  const resolvePhrase = useCallback(async (phrase, lang = 'en') => {
    setError(null)
    const indices = phraseToIndices(phrase, lang)
    if (!indices) return { notFound: true, reason: 'invalid' }
    const { signer: s, chainId, account } = await requireSigner()
    const factory = getFactory(s, chainId)
    const addr = await resolvePool(factory, indices)
    if (!addr) return { notFound: true, reason: 'unknown' }
    const summary = await summarizePool(getPool(addr, s), account)
    return { summary }
  }, [requireSigner])

  /** Read a pool summary by address. */
  const getPoolSummary = useCallback(async (address) => {
    const { signer: s, account } = await requireSigner()
    return summarizePool(getPool(address, s), account)
  }, [requireSigner])

  /** Join a pool: approve the buy-in, then join with your wallet (no identity/proof). */
  const joinPool = useCallback(async (poolAddress) => {
    setStatus('joining')
    setError(null)
    try {
      const { signer: s, account } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const summary = await summarizePool(pool, account)
      const token = new ethers.Contract(summary.tokenAddress, ERC20_ABI, s)
      const allowance = await token.allowance(account, poolAddress)
      if (allowance < summary.buyIn) {
        const approveTx = await token.approve(poolAddress, summary.buyIn)
        await approveTx.wait()
      }
      const tx = await pool.join()
      const receipt = await tx.wait()
      // Record the join device-locally so EVERY join path makes the pool findable in My Wagers.
      recordJoinedPool(account, poolAddress)
      setStatus('idle')
      return { txHash: receipt.hash }
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /**
   * The pool roster: member wallet addresses from `Joined(address)` events, each with a deterministic
   * nickname derived from the public address. Read directly from chain so the roster does NOT depend on
   * the subgraph (the subgraph is for discovery/listing only).
   */
  const getMembers = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const pool = getPool(poolAddress, s)
    const events = await pool.queryFilter(pool.filters.Joined())
    return events.map((e) => {
      const address = e.args.member
      return { address, nickname: deriveNickname(address, poolAddress) }
    })
  }, [requireSigner])

  /** The connected member's deterministic nickname for a pool (derived from their public address). */
  const getMyNickname = useCallback(async (poolAddress) => {
    const { account } = await requireSigner()
    return deriveNickname(account, poolAddress)
  }, [requireSigner])

  /** Creator: close joining early (freezes the denominator). */
  const closeJoining = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).closeJoining()
    return (await tx.wait()).hash
  }, [requireSigner])

  /** Anyone: close joining once the accept deadline has passed. */
  const pokeDeadline = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).pokeDeadline()
    return (await tx.wait()).hash
  }, [requireSigner])

  /** Creator: cancel a pool before it fills (members can then refund). */
  const cancelPool = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).cancel()
    return (await tx.wait()).hash
  }, [requireSigner])

  /**
   * Creator: propose (or revise) the payout outcome by committing the FULL payout matrix. The contract
   * validates it on-chain (non-empty, non-zero winners, amounts sum to the exact escrow) and emits it, so
   * every member can read the split from the chain before approving. `entries` is a `{winner, amount}[]`
   * array; the on-chain `proposalId` = keccak256(abi.encode(entries)).
   */
  const proposeOutcome = useCallback(async (poolAddress, entries) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).proposeOutcome(entries)
    return (await tx.wait()).hash
  }, [requireSigner])

  /**
   * Member: approve the current proposal with your wallet (one approval per member per proposal). Plain
   * transaction — no ZK proof, no WASM. `onProgress(message)` reports the submission phase.
   */
  const vote = useCallback(async (poolAddress, onProgress) => {
    const step = (m) => { try { onProgress?.(m) } catch { /* ignore */ } }
    setStatus('voting')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const proposalId = await pool.currentProposalId()
      if (!proposalId || proposalId === ethers.ZeroHash) {
        throw new Error('There is no proposed payout to approve yet.')
      }
      step('Confirm the approval in your wallet…')
      const tx = await pool.approve()
      step('Submitting your approval on-chain…')
      const hash = (await tx.wait()).hash
      setStatus('idle')
      return hash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /**
   * Winner: claim a share to `recipient`. `entries` is the payout-matrix preimage (shared by the creator);
   * the connected wallet must equal `entries[index].winner`.
   */
  const claimWinnings = useCallback(async (poolAddress, { entries, index, recipient }) => {
    setStatus('claiming')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const tx = await pool.claim(entries, index, recipient)
      const hash = (await tx.wait()).hash
      setStatus('idle')
      return hash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /** Member: recover the buy-in after a timeout or cancellation. */
  const refund = useCallback(async (poolAddress) => {
    setStatus('refunding')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const tx = await getPool(poolAddress, s).refund()
      const hash = (await tx.wait()).hash
      setStatus('idle')
      return hash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  return {
    status,
    error,
    createPool,
    resolvePhrase,
    getPoolSummary,
    joinPool,
    getMembers,
    getMyNickname,
    closeJoining,
    pokeDeadline,
    cancelPool,
    proposeOutcome,
    vote,
    claimWinnings,
    refund,
  }
}
