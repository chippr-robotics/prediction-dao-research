/**
 * usePools — data hook for ZK-Wager Pools (spec 034). Encapsulates all contract reads/writes so pages
 * stay presentational and testable (the pages mock this hook). Honest state: pool lifecycle is read from
 * chain and surfaced truthfully; addresses come from synced config.
 */
import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddressForChain } from '../config/contracts'
import { ERC20_ABI, getFactory, getPool, POOL_STATE, poolClaimScope } from '../lib/pools/poolContracts'
import { phraseToIndices, resolvePool, indicesToPhrase } from '../lib/pools/gateway'
import { createPoolIdentity } from '../lib/pools/identity'
import { deriveNickname } from '../lib/pools/nickname'
import { generatePoolProof } from '../lib/pools/semaphoreProof'

function requiredApprovals(frozenDenominator, thresholdBips) {
  if (frozenDenominator <= 0) return 0
  return Math.max(1, Math.ceil((frozenDenominator * thresholdBips) / 10000))
}

async function summarizePool(poolContract, account) {
  const [
    stateNum, buyIn, tokenAddr, memberCount, maxMembers, thresholdBips,
    joinDeadline, creator, frozenDenominator, closedAt, resolutionWindow, currentProposalId,
  ] = await Promise.all([
    poolContract.state(),
    poolContract.buyIn(),
    poolContract.token(),
    poolContract.memberCount(),
    poolContract.maxMembers(),
    poolContract.thresholdBips(),
    poolContract.joinDeadline(),
    poolContract.creator(),
    poolContract.frozenDenominator(),
    poolContract.closedAt(),
    poolContract.resolutionWindow(),
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
  const windowEnd = Number(closedAt) + Number(resolutionWindow)
  const hasProposal = currentProposalId && currentProposalId !== ethers.ZeroHash

  let hasJoined = false
  let alreadyRefunded = false
  let approvalCount = 0
  if (account) {
    hasJoined = await poolContract.hasJoined(account)
    alreadyRefunded = await poolContract.refunded(account)
  }
  if (hasProposal) approvalCount = Number(await poolContract.proposalApprovals(currentProposalId))

  const withinResolutionWindow = state === 1 && now < windowEnd
  const refundEligible =
    (state === 3 || (state === 1 && now >= windowEnd)) && hasJoined && !alreadyRefunded

  return {
    address: await poolContract.getAddress(),
    state,
    stateLabel: POOL_STATE[state] ?? 'Unknown',
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
    joinDeadline: Number(joinDeadline),
    creator,
    isCreator: account ? creator.toLowerCase() === account.toLowerCase() : false,
    hasJoined,
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

  /** Create a pool. `form`: { buyIn, maxMembers, thresholdPct, joinDays, resolutionDays, token? } */
  const createPool = useCallback(async (form) => {
    setStatus('creating')
    setError(null)
    try {
      const { signer: s, chainId } = await requireSigner()
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
      const params = {
        token: tokenAddr,
        buyIn: ethers.parseUnits(String(form.buyIn), decimals),
        maxMembers: Number(form.maxMembers),
        thresholdBips: Math.round(Number(form.thresholdPct) * 100),
        joinDeadline: now + Number(form.joinDays) * 86400,
        resolutionWindow: Number(form.resolutionDays) * 86400,
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

  /** Join a pool: derive identity, approve the buy-in, then join. */
  const joinPool = useCallback(async (poolAddress) => {
    setStatus('joining')
    setError(null)
    try {
      const { signer: s, account } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const summary = await summarizePool(pool, account)
      const token = new ethers.Contract(summary.tokenAddress, ERC20_ABI, s)
      const owner = await s.getAddress()
      const allowance = await token.allowance(owner, poolAddress)
      if (allowance < summary.buyIn) {
        const approveTx = await token.approve(poolAddress, summary.buyIn)
        await approveTx.wait()
      }
      const { commitment } = await createPoolIdentity(s, poolAddress)
      const tx = await pool.join(commitment)
      const receipt = await tx.wait()
      setStatus('idle')
      return { txHash: receipt.hash }
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /** Derive the connected member's anonymous nickname for a pool (signs to seed the local identity). */
  const getMyNickname = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const { commitment } = await createPoolIdentity(s, poolAddress)
    return deriveNickname(commitment, poolAddress)
  }, [requireSigner])

  /** Creator: close joining early (freezes the denominator). */
  const closeJoining = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).closeJoining()
    return (await tx.wait()).hash
  }, [requireSigner])

  /** Creator: cancel a pool before it fills (members can then refund). */
  const cancelPool = useCallback(async (poolAddress) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).cancel()
    return (await tx.wait()).hash
  }, [requireSigner])

  /** Creator: propose (or revise) the payout outcome. `proposalId` = keccak of the payout matrix. */
  const proposeOutcome = useCallback(async (poolAddress, proposalId) => {
    const { signer: s } = await requireSigner()
    const tx = await getPool(poolAddress, s).proposeOutcome(proposalId)
    return (await tx.wait()).hash
  }, [requireSigner])

  /**
   * Member: anonymously approve the current proposal. Needs the full member-commitment set to build the
   * prover's group (read from the subgraph once available).
   */
  const vote = useCallback(async (poolAddress, { memberCommitments }) => {
    setStatus('voting')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const proposalId = await pool.currentProposalId()
      const { identity } = await createPoolIdentity(s, poolAddress)
      const proof = await generatePoolProof({
        identity,
        memberCommitments,
        message: 1n, // approve
        scope: BigInt(proposalId),
      })
      const tx = await pool.approve(proof)
      const hash = (await tx.wait()).hash
      setStatus('idle')
      return hash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireSigner])

  /** Winner: claim a share to `recipient`. `entries` is the payout matrix preimage. */
  const claimWinnings = useCallback(async (poolAddress, { entries, index, recipient, memberCommitments }) => {
    setStatus('claiming')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const { identity } = await createPoolIdentity(s, poolAddress)
      const proof = await generatePoolProof({
        identity,
        memberCommitments,
        message: BigInt(recipient),
        scope: poolClaimScope(poolAddress),
      })
      const tx = await pool.claim(entries, index, proof, recipient)
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
    getMyNickname,
    closeJoining,
    cancelPool,
    proposeOutcome,
    vote,
    claimWinnings,
    refund,
  }
}
