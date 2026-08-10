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
import { prepareLegacyBitcoinSend, sendLegacyBitcoin } from '../lib/bitcoin/legacyBitcoin'

export function useCrossChainDiscovery({ deps = {} } = {}) {
  const [status, setStatus] = useState('idle') // idle | scanning | done | error
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const derivedRef = useRef(null) // memory-only derived accounts (incl. seed + solana keys)
  const rpcRef = useRef(null)
  const btcRef = useRef({ gateway: null, store: null, network: 'bitcoin' })

  // Drop all key material from memory when the consumer unmounts (FR-018).
  useEffect(() => () => { derivedRef.current = null; rpcRef.current = null; btcRef.current = { gateway: null, store: null, network: 'bitcoin' } }, [])

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
      const bitcoinStore = deps.bitcoinStore || ledgerStore()
      btcRef.current = { gateway, store: bitcoinStore, network: derived.bitcoin?.network || 'bitcoin' }
      const res = await (deps.discoverCrossChain || discoverCrossChain)({
        derived, solanaRpc: rpc, bitcoinGateway: gateway, bitcoinStore,
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

  /** Send BTC from the recovered Bitcoin account. `amountSats` is an integer or 'max'. */
  const sendBitcoin = useCallback(async ({ to, amountSats, feeTier = 'normal' }) => {
    const derived = derivedRef.current
    if (!derived?.seed) throw new Error('Unlock the recovered account again to send from it.')
    const { gateway, store, network } = btcRef.current
    if (!gateway) throw new Error('Bitcoin gateway is not configured.')
    const prep = await (deps.prepareLegacyBitcoinSend || prepareLegacyBitcoinSend)({ seed: derived.seed, network, gateway, store })
    if (!prep.quote) throw new Error(prep.stale ? 'Bitcoin network is unreachable — try again.' : 'No spendable Bitcoin to send.')
    const feeRate = prep.quote.rates?.[feeTier] ?? prep.quote.rates?.normal
    const res = await (deps.sendLegacyBitcoin || sendLegacyBitcoin)({
      seed: derived.seed, network, coins: prep.coins, destination: to, amountSats,
      feeRate, quote: prep.quote, changeAddress: prep.changeAddress, gateway, store,
    })
    if (!res.ok) throw new Error(res.message || res.error || 'Bitcoin send failed')
    return res
  }, [deps])

  const reset = useCallback(() => {
    derivedRef.current = null
    rpcRef.current = null
    btcRef.current = { gateway: null, store: null, network: 'bitcoin' }
    setResults(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { status, results, error, runDiscovery, sendSol, sendBitcoin, reset }
}

export default useCrossChainDiscovery
