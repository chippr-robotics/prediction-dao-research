/**
 * useEarnRewards (spec 050, US2) — the member's Merkl reward balances on the
 * active network plus the claim action.
 *
 * Honest-state: a failed fetch is an explicit 'unavailable' status (never a
 * fabricated zero); reward figures update on Merkl's ~8-hour cadence, so the
 * view carries `fetchedAt` freshness rather than implying real-time accrual.
 * Claim success is reported from the tx receipt, not from the API (which may
 * lag the chain); after a claim we re-fetch and the queued activity entry
 * carries the explorer link (FR-010).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Interface, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import { isEarnAvailable, getEarnConfig } from '../config/networks'
import { getBlockscoutUrl } from '../config/blockExplorer'
import { fetchRewards, buildClaimArgs } from '../lib/earn/merkl'
import { MERKL_DISTRIBUTOR_ABI } from '../abis/MerklDistributor'
import { queueEarnAction } from '../lib/earn/earnActivityBuffer'
import { captureEarnAction } from '../data/ledger'
import { useActivityOptional } from './useActivity'

const DISTRIBUTOR_IFACE = new Interface(MERKL_DISTRIBUTOR_ABI)

export function useEarnRewards() {
  // Writes go through sendCalls (spec 041's unified rail) so passkey sessions
  // — which have no ethers signer — can claim too.
  const { address, isConnected, chainId, sendCalls } = useWallet() || {}
  const activity = useActivityOptional()
  const supported = isEarnAvailable(chainId)
  const earnConfig = getEarnConfig(chainId)

  const [rewards, setRewards] = useState([])
  const [status, setStatus] = useState('loading')
  const [fetchedAt, setFetchedAt] = useState(null)
  const [claimState, setClaimState] = useState({ status: 'idle', txUrl: null, error: null })
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!supported || !isConnected || !address) return
    const reqId = ++reqIdRef.current
    setStatus('loading')
    try {
      const list = await fetchRewards(address, chainId)
      if (reqId !== reqIdRef.current) return
      setRewards(list)
      setFetchedAt(Date.now())
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setRewards([])
      setStatus('unavailable')
    }
  }, [supported, isConnected, address, chainId])

  useEffect(() => {
    reqIdRef.current++
    setRewards([])
    setFetchedAt(null)
    setClaimState({ status: 'idle', txUrl: null, error: null })
    setStatus(supported && isConnected ? 'loading' : 'idle')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId])

  const totalClaimable = useMemo(
    () => rewards.reduce((n, r) => n + (r.claimable > 0n ? 1 : 0), 0),
    [rewards],
  )

  /** Claim every claimable reward in one distributor transaction. */
  const claim = useCallback(async () => {
    if (!address || !earnConfig?.merklDistributor) return
    const args = buildClaimArgs(address, rewards)
    if (!args) return // nothing claimable — never prompt the wallet for a no-op
    if (typeof sendCalls !== 'function') {
      // Never a silent no-op (constitution III).
      setClaimState({
        status: 'error',
        txUrl: null,
        error: 'This session cannot send transactions right now — please reconnect and try again.',
      })
      return
    }
    setClaimState({ status: 'pending', txUrl: null, error: null })
    try {
      const sent = await sendCalls([
        {
          target: earnConfig.merklDistributor,
          data: DISTRIBUTOR_IFACE.encodeFunctionData('claim', [
            args.users,
            args.tokens,
            args.amounts,
            args.proofs,
          ]),
          value: 0n,
        },
      ])
      if (sent?.state === 'failed') throw new Error(sent.reason || 'claim failed')
      const txHash = sent?.txHash ?? sent?.userOpHash ?? null
      if (!txHash) throw new Error('Submitted, but no transaction reference was returned.')
      // Explorer links only for real tx hashes (a UserOp hash has no page).
      const txUrl = sent?.txHash ? getBlockscoutUrl(chainId, sent.txHash, 'tx') : null
      const summary = args.rewards
        .map((r) => `${formatUnits(r.claimable, r.token.decimals)} ${r.token.symbol}`.trim())
        .join(', ')
      queueEarnAction(address, chainId, {
        type: 'earn-rewards-claimed',
        refId: args.tokens[0],
        message: `Claimed earn rewards: ${summary}`,
        txHash,
        txUrl,
        at: Date.now(),
      })
      // Durable audit entry in the unified activity ledger (spec 051).
      captureEarnAction(address, chainId, {
        type: 'earn-rewards-claimed',
        txHash: receipt.hash,
        at: Date.now(),
        tokenAddress: args.tokens[0] ?? null,
        description: `Claimed earn rewards: ${summary}`,
      })
      activity?.refresh?.()
      setClaimState({ status: 'confirmed', txUrl, error: null })
      load()
    } catch (err) {
      const rejected = /rejected|denied|cancelled|not allowed|abort/i.test(err?.message || '')
      setClaimState({
        status: 'error',
        txUrl: null,
        error: rejected ? 'The confirmation was cancelled.' : 'Claim failed. Please try again.',
      })
    }
  }, [sendCalls, address, chainId, rewards, earnConfig, activity, load])

  return useMemo(
    () => ({
      rewards,
      status,
      fetchedAt,
      totalClaimable,
      claim,
      claimState,
      legacyRewardsUrl: earnConfig?.legacyRewardsUrl || null,
      refresh: load,
    }),
    [rewards, status, fetchedAt, totalClaimable, claim, claimState, earnConfig, load],
  )
}

export default useEarnRewards
