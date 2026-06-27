/**
 * usePools — data hook for ZK-Wager Pools (spec 034). Encapsulates all contract reads/writes so pages
 * stay presentational and testable (the pages mock this hook). Honest state: pool lifecycle is read from
 * chain and surfaced truthfully; addresses come from synced config.
 */
import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddressForChain } from '../config/contracts'
import { ERC20_ABI, getFactory, getPool, POOL_STATE } from '../lib/pools/poolContracts'
import { phraseToIndices, resolvePool } from '../lib/pools/gateway'
import { indicesToPhrase } from '../lib/pools/gateway'
import { createPoolIdentity } from '../lib/pools/identity'

async function summarizePool(poolContract) {
  const [stateNum, buyIn, tokenAddr, memberCount, maxMembers, thresholdBips, joinDeadline] = await Promise.all([
    poolContract.state(),
    poolContract.buyIn(),
    poolContract.token(),
    poolContract.memberCount(),
    poolContract.maxMembers(),
    poolContract.thresholdBips(),
    poolContract.joinDeadline(),
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
  return {
    address: await poolContract.getAddress(),
    state: Number(stateNum),
    stateLabel: POOL_STATE[Number(stateNum)] ?? 'Unknown',
    buyIn,
    buyInFormatted: ethers.formatUnits(buyIn, decimals),
    tokenAddress: tokenAddr,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    memberCount: Number(memberCount),
    maxMembers: Number(maxMembers),
    slotsRemaining: Number(maxMembers) - Number(memberCount),
    thresholdBips: Number(thresholdBips),
    thresholdPct: Number(thresholdBips) / 100,
    joinDeadline: Number(joinDeadline),
  }
}

export function usePools() {
  const { signer } = useWeb3()
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const requireSigner = useCallback(async () => {
    if (!signer) throw new Error('Connect your wallet to use group pools.')
    const net = await signer.provider.getNetwork()
    return { signer, chainId: Number(net.chainId) }
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
    const { signer: s, chainId } = await requireSigner()
    const factory = getFactory(s, chainId)
    const addr = await resolvePool(factory, indices)
    if (!addr) return { notFound: true, reason: 'unknown' }
    const summary = await summarizePool(getPool(addr, s))
    return { summary }
  }, [requireSigner])

  /** Read a pool summary by address. */
  const getPoolSummary = useCallback(async (address) => {
    const { signer: s } = await requireSigner()
    return summarizePool(getPool(address, s))
  }, [requireSigner])

  /** Join a pool: derive identity, approve the buy-in, then join. */
  const joinPool = useCallback(async (poolAddress) => {
    setStatus('joining')
    setError(null)
    try {
      const { signer: s } = await requireSigner()
      const pool = getPool(poolAddress, s)
      const summary = await summarizePool(pool)
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

  return { status, error, createPool, resolvePhrase, getPoolSummary, joinPool }
}
