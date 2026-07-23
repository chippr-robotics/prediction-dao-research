/**
 * useStakingActions (spec 065, US1 stake + extended in US2) — build and submit
 * staking transactions through the spec-041 unified send rail (useEarnSend), so
 * both passkey (one ceremony for the whole batch) and classic wallets work, and
 * any network switch is handled as part of submitting.
 *
 * US1 exposes `stake`. US2 adds unstake / withdraw / claim. Each resolves with
 * { txHash, txUrl } or throws a member-facing error.
 */
import { useCallback } from 'react'
import { useWallet } from './useWalletManagement'
import { useEarnSend } from './useEarnSend'
import { getBlockscoutUrl } from '../config/blockExplorer'
import { NETWORKS } from '../config/networks'
import { POL_TOKEN_L1 } from '../config/staking'
import { makeReadProvider } from '../utils/rpcProvider'
import { buildStakeForOption } from '../lib/staking/stakingActions'

async function submitBatch({ sendOnChain, chainId, calls }) {
  const sent = await sendOnChain(chainId, calls)
  if (sent?.state === 'failed') throw new Error(sent.reason || 'transaction failed')
  const txHash = sent?.txHash ?? sent?.userOpHash ?? null
  if (!txHash) throw new Error('Submitted, but no transaction reference was returned.')
  const txUrl = sent?.txHash ? getBlockscoutUrl(chainId, sent.txHash, 'tx') : null
  return { txHash, txUrl }
}

export function useStakingActions() {
  const { address } = useWallet() || {}
  const send = useEarnSend()

  const stake = useCallback(
    async (option, amount, { onState } = {}) => {
      if (!address) throw new Error('This session cannot send transactions right now — please reconnect.')
      const provider = makeReadProvider(NETWORKS[option.chainId].rpcUrl, option.chainId)
      const { calls } = await buildStakeForOption(option, {
        account: address,
        amount,
        provider,
        polToken: POL_TOKEN_L1,
      })
      return submitBatch({
        sendOnChain: (chainId, c) => send.sendOnChain(chainId, c, { onState }),
        chainId: option.chainId,
        calls,
      })
    },
    [address, send],
  )

  return { stake, address, ...send }
}

export default useStakingActions
