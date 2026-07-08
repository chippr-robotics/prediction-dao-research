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
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'
import { ERC20_ABI, getFactory, getPool, POOL_STATE, poolStateDisplay } from '../lib/pools/poolContracts'
import { phraseToIndices, resolvePool, indicesToPhrase } from '../lib/pools/gateway'
import { deriveNickname } from '../lib/pools/nickname'
import { payoutMatrixHash } from '../lib/pools/payout'
import { recordJoinedPool } from '../lib/lookup/myWagersSources'
import { useGaslessWrite } from '../lib/relay/useGaslessWrite'

/** Fetch a receipt by hash, retrying briefly for relay/RPC lag (self-submit resolves on the first try). */
async function waitReceipt(runner, txHash, tries = 8, delayMs = 1500) {
  if (!txHash) return null
  const receiptReader =
    runner && typeof runner.getTransactionReceipt === 'function'
      ? runner
      : runner?.provider && typeof runner.provider.getTransactionReceipt === 'function'
        ? runner.provider
        : null
  if (!receiptReader) return null
  for (let i = 0; i < tries; i += 1) {
    const r = await receiptReader.getTransactionReceipt(txHash)
    if (r) return r
    await new Promise((res) => setTimeout(res, delayMs))
  }
  return null
}

/** Parse the PoolCreated event from a create receipt into the hook's return shape. */
function parsePoolCreated(receipt, factory, account) {
  const ev = (receipt?.logs || [])
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
  if (ev && account) recordJoinedPool(account, ev.args.pool)
  return {
    poolId: ev ? ev.args.poolId : null,
    pool: ev ? ev.args.pool : null,
    wordIndices,
    phrase: wordIndices ? indicesToPhrase(wordIndices) : null,
    txHash: receipt?.hash ?? null,
  }
}

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
  const { signer, provider, address, account, chainId, sendCalls } = useWeb3()
  const activeAddress = address || account
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const requireContext = useCallback(async () => {
    const runner = signer || provider
    if (!runner) throw new Error('Connect your wallet to use group pools.')
    if (!activeAddress) throw new Error('Connect your wallet to use group pools.')
    const net =
      chainId != null
        ? { chainId }
        : typeof runner.getNetwork === 'function'
          ? await runner.getNetwork()
          : runner.provider && typeof runner.provider.getNetwork === 'function'
            ? await runner.provider.getNetwork()
            : null
    const activeChainId = Number(net?.chainId)
    if (!activeChainId) throw new Error('Could not determine the active network for group pools.')
    return { runner, signer, chainId: activeChainId, account: activeAddress }
  }, [signer, provider, activeAddress, chainId])

  const requireSendCalls = useCallback(() => {
    if (typeof sendCalls !== 'function') {
      throw new Error('This wallet cannot submit pool transactions on the current transaction rail.')
    }
    return sendCalls
  }, [sendCalls])

  // ---- Gasless seams (spec 035/036 Tier 2, factory-forwarder) ----
  // Each pool write routes through the relayer when one is live and transparently self-submits otherwise
  // (never-stranded, FR-014). The `selfSubmit` closure IS the original EOA path; `params` shapes the
  // signed intent. Target resolves to the WagerPoolFactory (the action verifier key); the pool clone
  // rides in params and — for the six actor twins — is the EIP-712 verifyingContract (domain/target
  // split), so only the factory is ever the tx target. Behaviour-neutral on chains the relayer doesn't
  // serve (Mordor's stablecoin lacks EIP-3009 → join self-submits; unset relayer → all self-submit).
  const poolCreateTx = useGaslessWrite('poolCreate', {
    params: (form, ctx) => ({
      token: ctx.params.token,
      buyIn: ctx.params.buyIn,
      maxMembers: ctx.params.maxMembers,
      thresholdBips: ctx.params.thresholdBips,
      acceptDeadline: ctx.params.acceptDeadline,
      resolveDeadline: ctx.params.resolveDeadline,
    }),
    selfSubmit: async (form, ctx) => ctx.factory.createPool(ctx.params).then((tx) => tx.wait()),
  })
  const joinTx = useGaslessWrite('poolJoin', {
    params: (poolAddress) => ({ pool: poolAddress }),
    payment: (poolAddress, summary) => ({ value: summary.buyIn }),
    selfSubmit: async (poolAddress, summary, account) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted join.')
      const token = new ethers.Contract(summary.tokenAddress, ERC20_ABI, s)
      const allowance = await token.allowance(account, poolAddress)
      if (allowance < summary.buyIn) await (await token.approve(poolAddress, summary.buyIn)).wait()
      return (await getPool(poolAddress, s).join()).wait()
    },
  })
  const closeJoiningTx = useGaslessWrite('poolCloseJoining', {
    params: (poolAddress) => ({ pool: poolAddress }),
    selfSubmit: async (poolAddress) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted close.')
      return (await getPool(poolAddress, s).closeJoining()).wait()
    },
  })
  const cancelTx = useGaslessWrite('poolCancel', {
    params: (poolAddress) => ({ pool: poolAddress }),
    selfSubmit: async (poolAddress) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted cancel.')
      return (await getPool(poolAddress, s).cancel()).wait()
    },
  })
  const proposeTx = useGaslessWrite('poolProposeOutcome', {
    params: (poolAddress, entries) => ({ pool: poolAddress, entries, proposalId: payoutMatrixHash(entries) }),
    selfSubmit: async (poolAddress, entries) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted proposal.')
      return (await getPool(poolAddress, s).proposeOutcome(entries)).wait()
    },
  })
  const approveTx = useGaslessWrite('poolApprove', {
    params: (poolAddress, proposalId) => ({ pool: poolAddress, proposalId }),
    selfSubmit: async (poolAddress, proposalId, step) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted approval.')
      step?.('Confirm the approval in your wallet…')
      const tx = await getPool(poolAddress, s).approve()
      step?.('Submitting your approval on-chain…')
      return tx.wait()
    },
  })
  const claimTx = useGaslessWrite('poolClaim', {
    params: (poolAddress, entries, index, recipient) => ({ pool: poolAddress, entries, index, recipient }),
    selfSubmit: async (poolAddress, entries, index, recipient) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted claim.')
      return (await getPool(poolAddress, s).claim(entries, index, recipient)).wait()
    },
  })
  const refundTx = useGaslessWrite('poolRefund', {
    params: (poolAddress) => ({ pool: poolAddress }),
    selfSubmit: async (poolAddress) => {
      const { signer: s } = await requireContext()
      if (!s) throw new Error('No signer available for self-submitted refund.')
      return (await getPool(poolAddress, s).refund()).wait()
    },
  })

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
      const { runner, signer: writeSigner, chainId: activeChainId, account: activeAccount } = await requireContext()
      const factory = getFactory(runner, activeChainId)
      const tokenAddr = form.token || getContractAddressForChain('paymentToken', activeChainId)
      if (!tokenAddr) throw new Error('No buy-in token configured for this network.')
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, runner)
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
      let txHash
      if (writeSigner) {
        // Gasless when a relayer is live (createPoolWithSig, attributed to the signer), else self-submit.
        const result = await poolCreateTx.run(form, { factory, params, account: activeAccount })
        if (result?.error) throw result.error
        txHash = result.txHash
      } else {
        const send = requireSendCalls()
        const factoryAddress = await factory.getAddress()
        const data = factory.interface.encodeFunctionData('createPool', [params])
        const submitted = await send([{ target: factoryAddress, data, value: 0n }])
        txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
        if (!txHash) throw new Error('Pool creation submitted but no transaction hash was returned.')
      }
      // run() surfaces only a txHash; re-read the receipt to recover the pool address + share phrase
      // (the PoolCreated event) uniformly across the relay and self-submit paths. A relayed tx can lag
      // well behind its ACK, so poll generously (~90s) — losing the receipt means losing the pool's
      // address + share phrase + the device-local record, while the escrow has already succeeded.
      const receipt = await waitReceipt(runner, txHash, 45, 2000)
      setStatus('idle')
      const parsed = parsePoolCreated(receipt, factory, activeAccount)
      // Never drop the txHash even if the receipt hasn't landed in time — the UI needs it to show a
      // pending pool the user can recover, not an all-null result that reads as a failure.
      return { ...parsed, txHash: parsed.txHash ?? txHash ?? null }
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireContext, poolCreateTx, requireSendCalls])

  /** Resolve a four-word phrase to a pool summary, or null if it maps to no pool. */
  const resolvePhrase = useCallback(async (phrase, lang = 'en') => {
    setError(null)
    const indices = phraseToIndices(phrase, lang)
    if (!indices) return { notFound: true, reason: 'invalid' }
    const { runner, chainId: activeChainId, account: activeAccount } = await requireContext()
    const factory = getFactory(runner, activeChainId)
    const addr = await resolvePool(factory, indices)
    if (!addr) return { notFound: true, reason: 'unknown' }
    const summary = await summarizePool(getPool(addr, runner), activeAccount)
    return { summary }
  }, [requireContext])

  /** Read a pool summary by address. */
  const getPoolSummary = useCallback(async (address) => {
    const { runner, account: activeAccount } = await requireContext()
    return summarizePool(getPool(address, runner), activeAccount)
  }, [requireContext])

  /**
   * Join a pool. Gasless via EIP-3009 (joinWithAuthorization → the factory forwarder) where the chain's
   * stablecoin supports it AND a relayer is live; otherwise the classic approve-then-join self-submit
   * (also the fallback on Mordor, whose stablecoin lacks EIP-3009). One signature vs two txs when gasless.
   */
  const joinPool = useCallback(async (poolAddress) => {
    setStatus('joining')
    setError(null)
    try {
      const { runner, signer: writeSigner, account: activeAccount } = await requireContext()
      const summary = await summarizePool(getPool(poolAddress, runner), activeAccount)
      let txHash
      if (writeSigner) {
        const result = await joinTx.run(poolAddress, summary, activeAccount)
        if (result?.error) throw result.error
        txHash = result.txHash
      } else {
        const send = requireSendCalls()
        const token = new ethers.Contract(summary.tokenAddress, ERC20_ABI, runner)
        const allowance = await token.allowance(activeAccount, poolAddress)
        const pool = getPool(poolAddress, runner)
        const calls = []
        if (allowance < summary.buyIn) {
          calls.push({
            target: summary.tokenAddress,
            data: token.interface.encodeFunctionData('approve', [poolAddress, summary.buyIn]),
            value: 0n,
          })
        }
        calls.push({ target: poolAddress, data: pool.interface.encodeFunctionData('join', []), value: 0n })
        const submitted = await send(calls)
        txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
        if (!txHash) throw new Error('Join submitted but no transaction hash was returned.')
      }
      // Record the join device-locally so EVERY join path makes the pool findable in My Wagers.
      recordJoinedPool(activeAccount, poolAddress)
      setStatus('idle')
      return { txHash }
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireContext, joinTx, requireSendCalls])

  /**
   * The pool roster: member wallet addresses from `Joined(address)` events, each with a deterministic
   * nickname derived from the public address. Read directly from chain so the roster does NOT depend on
   * the subgraph (the subgraph is for discovery/listing only).
   */
  const getMembers = useCallback(async (poolAddress) => {
    const { runner } = await requireContext()
    const pool = getPool(poolAddress, runner)
    const events = await pool.queryFilter(pool.filters.Joined())
    return events.map((e) => {
      const address = e.args.member
      return { address, nickname: deriveNickname(address, poolAddress) }
    })
  }, [requireContext])

  /** The connected member's deterministic nickname for a pool (derived from their public address). */
  const getMyNickname = useCallback(async (poolAddress) => {
    const { account: activeAccount } = await requireContext()
    return deriveNickname(activeAccount, poolAddress)
  }, [requireContext])

  /**
   * Read the creator's proposed payout matrix straight from the chain. `proposeOutcome` now commits AND
   * EMITS the full `PayoutEntry[]` (event `OutcomeProposed`), so any member can read the split without the
   * creator sharing it off-chain. Returns the CURRENT proposal's rows as `[{ winner, amount: bigint }]`,
   * VERIFIED to hash back to the on-chain proposalId, or null when there is no proposal / the RPC can't
   * serve logs (in which case the off-chain paste in proposalStore stays as the fallback).
   */
  const fetchProposedMatrix = useCallback(async (poolAddress) => {
    try {
      const { runner, chainId: activeChainId } = await requireContext()
      const pool = getPool(poolAddress, runner)
      const onChainId = await pool.currentProposalId()
      const targetId = onChainId && onChainId !== ethers.ZeroHash ? onChainId : null
      // Bound the scan to the factory's deploy block when known (never scan from genesis); a provider that
      // still rejects the range throws below and we return null so the off-chain fallback takes over.
      const fromBlock = getDeploymentBlockForChain('wagerPoolFactory', activeChainId) || 0
      const events = await pool.queryFilter(pool.filters.OutcomeProposed(), fromBlock)
      if (!events.length) return null
      // Prefer the event matching the current on-chain proposalId (the latest one if the creator revised);
      // fall back to the most recent event otherwise (e.g. a resolved pool whose id is no longer exposed).
      const match =
        (targetId && [...events].reverse().find((e) => e.args.proposalId === targetId)) ||
        events[events.length - 1]
      const entries = (match.args.entries || []).map((e) => ({ winner: e.winner, amount: BigInt(e.amount) }))
      if (!entries.length) return null
      // Trust the decoded matrix only if it hashes to the id it claims (guards against a bad decode).
      if (payoutMatrixHash(entries) !== (targetId || match.args.proposalId)) return null
      return entries
    } catch {
      return null
    }
  }, [requireContext])

  /** Creator: close joining early (freezes the denominator). Gasless when a relayer is live. */
  const closeJoining = useCallback(async (poolAddress) => {
    if (signer) {
      const result = await closeJoiningTx.run(poolAddress)
      if (result?.error) throw result.error
      return result.txHash
    }
    const { runner } = await requireContext()
    const send = requireSendCalls()
    const pool = getPool(poolAddress, runner)
    const submitted = await send([{ target: poolAddress, data: pool.interface.encodeFunctionData('closeJoining', []), value: 0n }])
    const txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
    if (!txHash) throw new Error('Close submitted but no transaction hash was returned.')
    return txHash
  }, [signer, closeJoiningTx, requireContext, requireSendCalls])

  /** Anyone: close joining once the accept deadline has passed (permissionless keeper — self-submit). */
  const pokeDeadline = useCallback(async (poolAddress) => {
    const { runner, signer: writeSigner } = await requireContext()
    if (writeSigner) {
      const tx = await getPool(poolAddress, writeSigner).pokeDeadline()
      return (await tx.wait()).hash
    }
    const send = requireSendCalls()
    const pool = getPool(poolAddress, runner)
    const submitted = await send([{ target: poolAddress, data: pool.interface.encodeFunctionData('pokeDeadline', []), value: 0n }])
    const txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
    if (!txHash) throw new Error('Deadline poke submitted but no transaction hash was returned.')
    return txHash
  }, [requireContext, requireSendCalls])

  /** Creator: cancel a pool before it fills (members can then refund). Gasless when a relayer is live. */
  const cancelPool = useCallback(async (poolAddress) => {
    if (signer) {
      const result = await cancelTx.run(poolAddress)
      if (result?.error) throw result.error
      return result.txHash
    }
    const { runner } = await requireContext()
    const send = requireSendCalls()
    const pool = getPool(poolAddress, runner)
    const submitted = await send([{ target: poolAddress, data: pool.interface.encodeFunctionData('cancel', []), value: 0n }])
    const txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
    if (!txHash) throw new Error('Cancellation submitted but no transaction hash was returned.')
    return txHash
  }, [signer, cancelTx, requireContext, requireSendCalls])

  /**
   * Creator: propose (or revise) the payout outcome by committing the FULL payout matrix. The contract
   * validates it on-chain (non-empty, non-zero winners, amounts sum to the exact escrow) and emits it, so
   * every member can read the split from the chain before approving. `entries` is a `{winner, amount}[]`
   * array; the on-chain `proposalId` = keccak256(abi.encode(entries)). Gasless when a relayer is live.
   */
  const proposeOutcome = useCallback(async (poolAddress, entries) => {
    if (signer) {
      const result = await proposeTx.run(poolAddress, entries)
      if (result?.error) throw result.error
      return result.txHash
    }
    const { runner } = await requireContext()
    const send = requireSendCalls()
    const pool = getPool(poolAddress, runner)
    const submitted = await send([
      { target: poolAddress, data: pool.interface.encodeFunctionData('proposeOutcome', [entries]), value: 0n },
    ])
    const txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
    if (!txHash) throw new Error('Proposal submitted but no transaction hash was returned.')
    return txHash
  }, [signer, proposeTx, requireContext, requireSendCalls])

  /**
   * Member: approve the current proposal with your wallet (one approval per member per proposal). Plain
   * transaction — no ZK proof, no WASM. `onProgress(message)` reports the submission phase.
   */
  const vote = useCallback(async (poolAddress, onProgress) => {
    const step = (m) => { try { onProgress?.(m) } catch { /* ignore */ } }
    setStatus('voting')
    setError(null)
    try {
      const { runner, signer: writeSigner } = await requireContext()
      // Pin the CURRENT proposalId the member is approving — approveWithSig binds it so a relayer can
      // never retarget the approval to a matrix the member never saw (anti-rug).
      const pool = getPool(poolAddress, runner)
      const proposalId = await pool.currentProposalId()
      if (!proposalId || proposalId === ethers.ZeroHash) {
        throw new Error('There is no proposed payout to approve yet.')
      }
      let txHash
      if (writeSigner) {
        const result = await approveTx.run(poolAddress, proposalId, step)
        if (result?.error) throw result.error
        txHash = result.txHash
      } else {
        const send = requireSendCalls()
        step('Confirm the approval in your wallet…')
        const submitted = await send([{ target: poolAddress, data: pool.interface.encodeFunctionData('approve', []), value: 0n }])
        txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
        if (!txHash) throw new Error('Approval submitted but no transaction hash was returned.')
      }
      setStatus('idle')
      return txHash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [requireContext, approveTx, requireSendCalls])

  /**
   * Winner: claim a share to `recipient`. `entries` is the payout-matrix preimage (shared by the creator);
   * the connected wallet must equal `entries[index].winner`.
   */
  const claimWinnings = useCallback(async (poolAddress, { entries, index, recipient }) => {
    setStatus('claiming')
    setError(null)
    try {
      // Strongest gasless case: a winner holding zero gas. claimWithSig binds (index, recipient) to the
      // signer, so the relayer can never redirect the payout to itself.
      let txHash
      if (signer) {
        const result = await claimTx.run(poolAddress, entries, index, recipient)
        if (result?.error) throw result.error
        txHash = result.txHash
      } else {
        const { runner } = await requireContext()
        const send = requireSendCalls()
        const pool = getPool(poolAddress, runner)
        const submitted = await send([
          { target: poolAddress, data: pool.interface.encodeFunctionData('claim', [entries, index, recipient]), value: 0n },
        ])
        txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
        if (!txHash) throw new Error('Claim submitted but no transaction hash was returned.')
      }
      setStatus('idle')
      return txHash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [signer, claimTx, requireContext, requireSendCalls])

  /** Member: recover the buy-in after a timeout or cancellation. Gasless (a stranded member has no gas). */
  const refund = useCallback(async (poolAddress) => {
    setStatus('refunding')
    setError(null)
    try {
      let txHash
      if (signer) {
        const result = await refundTx.run(poolAddress)
        if (result?.error) throw result.error
        txHash = result.txHash
      } else {
        const { runner } = await requireContext()
        const send = requireSendCalls()
        const pool = getPool(poolAddress, runner)
        const submitted = await send([{ target: poolAddress, data: pool.interface.encodeFunctionData('refund', []), value: 0n }])
        txHash = submitted?.txHash ?? submitted?.userOpHash ?? submitted?.intentId
        if (!txHash) throw new Error('Refund submitted but no transaction hash was returned.')
      }
      setStatus('idle')
      return txHash
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || String(e))
      throw e
    }
  }, [signer, refundTx, requireContext, requireSendCalls])

  return {
    status,
    error,
    createPool,
    resolvePhrase,
    getPoolSummary,
    joinPool,
    getMembers,
    getMyNickname,
    fetchProposedMatrix,
    closeJoining,
    pokeDeadline,
    cancelPool,
    proposeOutcome,
    vote,
    claimWinnings,
    refund,
  }
}
