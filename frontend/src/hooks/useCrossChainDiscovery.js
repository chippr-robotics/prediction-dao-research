// Spec 063 (US2/US3, T009 UI) — run cross-chain discovery for a recovered secret and hold the derived
// accounts (memory-only) so their funds can be viewed and sent. Wires the Solana RPC (gateway-or-public)
// and the optional Bitcoin gateway to the pure discover logic, and exposes a Solana send.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSolanaRpc, LAMPORTS_PER_SOL } from '../lib/solana/rpc'
import { solanaRpcEndpoint } from '../config/solanaNetworks'
import { createBitcoinGatewayClient, bitcoinGatewayUrl } from '../lib/bitcoin/gatewayClient'
import { ledgerStore } from '../lib/bitcoin/wallet'
import { deriveCrossChainAccounts } from '../lib/recovery/crossChainDerive'
import { discoverCrossChain } from '../lib/recovery/crossChainDiscovery'
import { sendSol as sendSolLib } from '../lib/solana/send'

export function useCrossChainDiscovery({ deps = {} } = {}) {
  const [status, setStatus] = useState('idle') // idle | scanning | done | error
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const derivedRef = useRef(null) // memory-only derived accounts (incl. seed + solana keys)
  const rpcRef = useRef(null)

  // Drop all key material from memory when the consumer unmounts (FR-018).
  useEffect(() => () => { derivedRef.current = null; rpcRef.current = null }, [])

  const runDiscovery = useCallback(async (recovered, { solanaNetwork = 'solana' } = {}) => {
    setStatus('scanning')
    setError(null)
    try {
      const derived = (deps.deriveCrossChainAccounts || deriveCrossChainAccounts)(recovered)
      derivedRef.current = derived
      const rpc = (deps.createSolanaRpc || createSolanaRpc)(
        deps.solanaEndpoint || solanaRpcEndpoint(solanaNetwork, import.meta.env?.VITE_RELAYER_URL),
      )
      rpcRef.current = rpc
      const gwUrl = deps.bitcoinGatewayUrl?.() ?? bitcoinGatewayUrl()
      const gateway = deps.bitcoinGateway || (gwUrl ? createBitcoinGatewayClient({ baseUrl: gwUrl }) : null)
      const res = await (deps.discoverCrossChain || discoverCrossChain)({
        derived, solanaRpc: rpc, bitcoinGateway: gateway, bitcoinStore: deps.bitcoinStore || ledgerStore(),
      })
      setResults(res)
      setStatus('done')
      return res
    } catch (err) {
      setError(err?.message || 'Could not scan for funds')
      setStatus('error')
      throw err
    }
  }, [deps])

  /** Send SOL from a discovered Solana account. `amountSol` is a decimal string/number. */
  const sendSol = useCallback(async ({ address, to, amountSol }) => {
    const candidate = derivedRef.current?.solana?.find((c) => c.address === address)
    if (!candidate) throw new Error('Unlock the recovered account again to send from it.')
    const lamports = BigInt(Math.round(Number(amountSol) * Number(LAMPORTS_PER_SOL)))
    if (lamports <= 0n) throw new Error('Enter an amount greater than zero.')
    return (deps.sendSol || sendSolLib)({ rpc: rpcRef.current, keypair: candidate, to, lamports })
  }, [deps])

  const reset = useCallback(() => {
    derivedRef.current = null
    rpcRef.current = null
    setResults(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { status, results, error, runDiscovery, sendSol, reset }
}

export default useCrossChainDiscovery
