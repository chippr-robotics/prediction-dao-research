import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './useWalletManagement'
import { useActiveAccount } from './useActiveAccount'
import { getNetwork } from '../config/networks'
import { getWrappedNative } from '../config/wrappedNative'
import { WNATIVE_ABI } from '../abis/WNative'
import { makeReadProvider } from '../utils/rpcProvider'
import { useEndpointsRevision } from './useRpcEndpoints'

/**
 * useWrapNative — wrap the connected network's coin into its canonical wrapped form,
 * and unwrap it back.
 *
 * Wrapping is NOT a swap and NOT a bridge: `deposit()` mints exactly what you send and
 * `withdraw(wad)` burns exactly what you ask for, against the network's own WETH9-shaped
 * contract (config/wrappedNative.js). There is no price, no slippage, no counterparty and
 * no quote to expire — so this hook deliberately exposes none of those, and the view must
 * not invent them. The only cost is the network fee.
 *
 * Routing mirrors useTransfer, because "who is acting" is the same question here:
 *
 *   vault    → a threshold-gated proposal (nothing moves until the signers approve)
 *   legacy   → signed by the unlocked recovered key, never the connected wallet
 *   hardware → signed on the device via the deferred ceremony (spec 088), never the connected wallet
 *   passkey  → one smart-account call (sponsored where the chain runs a paymaster)
 *   classic  → a plain transaction, sender pays the network fee
 *
 * Gas honesty: unwrapping costs native coin the member is about to receive, and wrapping
 * costs native coin out of the same balance being wrapped — so `maxWrappable` holds back a
 * reserve rather than offering the whole balance and letting the wallet reject it. The
 * reserve is quoted from the chain's own fee data, not a constant.
 */

export const WRAP_DIRECTION = Object.freeze({ WRAP: 'wrap', UNWRAP: 'unwrap' })

// Honest passkey-UserOp lifecycle states (mirrors LIFECYCLE in lib/passkey/submission.js —
// kept as literals so this hook doesn't pull the relay graph in, same as useTransfer).
const OP_STATE = Object.freeze({ SUBMITTED: 'submitted', INCLUDED: 'included', FAILED: 'failed' })

const WNATIVE_IFACE = new ethers.Interface(WNATIVE_ABI)

// WETH9's deposit/withdraw are small, fixed-shape calls; 100k covers both with room for
// the L2 variants that charge more for the same work. Used only to SIZE the gas reserve
// held back from MAX — never as a gas limit on the transaction itself, which the wallet
// estimates for real.
const WRAP_GAS_LIMIT = 100_000n
// The reserve is doubled against the quoted fee so a MAX wrap survives a fee tick between
// the quote and the signature — the alternative is a transaction that reverts for gas
// after the member has already signed it.
const RESERVE_MULTIPLIER = 2n

export function useWrapNative() {
  const { address, chainId, signer, provider, loginMethod, sendCalls } = useWallet()
  const {
    identity, isVault, isLegacy, isHardware, canActAsVault, canActAsLegacy, canActAsHardware,
    submit: submitAsActive,
  } = useActiveAccount()
  const isPasskey = loginMethod === 'passkey'

  const [status, setStatus] = useState('idle') // idle | signing | submitting | pending | success | error
  const [error, setError] = useState(null)
  const [nativeBalance, setNativeBalance] = useState(null) // bigint | null (null = not read yet)
  const [wrappedBalance, setWrappedBalance] = useState(null)
  const [onChainSymbol, setOnChainSymbol] = useState(null)
  const [gasReserve, setGasReserve] = useState(null)

  const net = getNetwork(chainId)
  const token = useMemo(() => getWrappedNative(chainId), [chainId])
  const endpointRevision = useEndpointsRevision()

  // Same provider choice as useTransfer: a passkey session has no wallet provider to read
  // through, so it goes straight to the chain's configured endpoint (spec 069 resolution).
  const readProvider = useMemo(() => {
    const rpcProvider = net?.rpcUrl ? makeReadProvider(net.rpcUrl, chainId) : null
    return isPasskey ? (rpcProvider || provider) : (provider || rpcProvider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, isPasskey, provider, net?.rpcUrl, endpointRevision])

  // Balances belong to whoever is ACTING — a vault holds its own coin, and so does a
  // recovered legacy or hardware account (spec 088 FR-001). Reading the connected wallet's
  // balance while operating as any of them would offer a MAX the acting account cannot cover.
  const actingAddress =
    (isVault && identity?.vaultAddress) ||
    ((isLegacy || isHardware) && identity?.address) ||
    address || null

  const nativeSymbol = net?.nativeCurrency?.symbol || ''
  const wrappedSymbol = onChainSymbol || token?.symbol || ''
  const decimals = token?.decimals ?? net?.nativeCurrency?.decimals ?? 18

  // Sponsored only where the chain actually runs a FairWins paymaster for passkey UserOps
  // (spec 050). Everything else pays the network fee, and the view must say so.
  const sponsored = isPasskey && Boolean(net?.passkey?.sponsorPaymasterUrl)

  const refresh = useCallback(async () => {
    if (!readProvider || !actingAddress || !token) {
      setNativeBalance(null)
      setWrappedBalance(null)
      return
    }
    try {
      setNativeBalance(await readProvider.getBalance(actingAddress))
    } catch {
      setNativeBalance(null) // unread, NOT zero — the view renders "—" for this
    }
    try {
      const erc20 = new ethers.Contract(token.address, WNATIVE_ABI, readProvider)
      setWrappedBalance(await erc20.balanceOf(actingAddress))
    } catch {
      setWrappedBalance(null)
    }
  }, [readProvider, actingAddress, token])

  useEffect(() => { refresh() }, [refresh])

  // What the wrapper calls itself. The config label is a derivation from the coin's name and
  // can lag a rename (Polygon's contract now answers WPOL while the app's config still says
  // POL), so prefer the contract's own answer where the chain gives one.
  useEffect(() => {
    let cancelled = false
    setOnChainSymbol(null)
    if (!readProvider || !token) return undefined
    const erc20 = new ethers.Contract(token.address, ['function symbol() view returns (string)'], readProvider)
    erc20.symbol()
      .then((s) => { if (!cancelled && typeof s === 'string' && s) setOnChainSymbol(s) })
      .catch(() => { /* label falls back to the derived one — never blocks wrapping */ })
    return () => { cancelled = true }
  }, [readProvider, token])

  // Gas reserve, quoted from the chain rather than assumed. An unreadable fee leaves the
  // reserve null and MAX falls back to a balance-minus-nothing offer only when there is
  // genuinely nothing to reserve against (see maxWrappable).
  useEffect(() => {
    let cancelled = false
    if (!readProvider) { setGasReserve(null); return undefined }
    readProvider.getFeeData()
      .then((fee) => {
        if (cancelled) return
        const price = fee?.maxFeePerGas ?? fee?.gasPrice ?? null
        setGasReserve(price == null ? null : WRAP_GAS_LIMIT * BigInt(price) * RESERVE_MULTIPLIER)
      })
      .catch(() => { if (!cancelled) setGasReserve(null) })
    return () => { cancelled = true }
  }, [readProvider, chainId])

  /**
   * The most that can be wrapped: the balance less a gas reserve, because the fee is paid in
   * the same coin being wrapped. A sponsored passkey op pays no fee, so nothing is held back.
   * Returns null while the balance is unknown — an unread balance is not a zero one.
   */
  const maxWrappable = useMemo(() => {
    if (nativeBalance == null) return null
    if (sponsored) return nativeBalance
    const reserve = gasReserve ?? 0n
    return nativeBalance > reserve ? nativeBalance - reserve : 0n
  }, [nativeBalance, gasReserve, sponsored])

  const reset = useCallback(() => { setStatus('idle'); setError(null) }, [])

  /**
   * Wrap or unwrap `amount` (a human-readable decimal string).
   *
   * @returns {Promise<{ txHash: string|null, proposed?: boolean, safeTxHash?: string,
   *   pending?: boolean, userOpHash?: string|null, sponsored: boolean }>}
   */
  const execute = useCallback(
    async (direction, amount) => {
      if (!token) throw new Error('This network has no wrapped coin configured.')
      if (!signer && !isPasskey && !isVault && !isLegacy && !isHardware) throw new Error('Wallet not connected.')

      let value
      try {
        value = ethers.parseUnits(String(amount), decimals)
      } catch {
        throw new Error('Enter a valid amount.')
      }
      if (value <= 0n) throw new Error('Enter an amount greater than zero.')

      const wrapping = direction === WRAP_DIRECTION.WRAP
      const held = wrapping ? nativeBalance : wrappedBalance
      if (held != null && value > held) {
        throw new Error(`Not enough ${wrapping ? nativeSymbol : wrappedSymbol}.`)
      }

      // One call, two shapes: deposit carries the coin as msg.value, withdraw names the amount.
      const call = wrapping
        ? { to: token.address, value, data: WNATIVE_IFACE.encodeFunctionData('deposit', []) }
        : { to: token.address, value: 0n, data: WNATIVE_IFACE.encodeFunctionData('withdraw', [value]) }

      setError(null)

      try {
        // Vault: a proposal, not a transaction. Nothing moves until the signers approve it.
        if (isVault) {
          if (!canActAsVault) throw new Error("Switch to the vault's network to wrap from it.")
          setStatus('submitting')
          const res = await submitAsActive(call)
          setStatus('success')
          await refresh()
          return { txHash: null, proposed: true, safeTxHash: res.safeTxHash, sponsored: false }
        }

        // Recovered legacy / hardware account: signed by THAT account's signer via the
        // active-account seam (spec 088 FR-002) — the deferred unlock / device ceremony runs
        // on demand. Never falls through to the connected signer below.
        if (isLegacy || isHardware) {
          if (isLegacy && !canActAsLegacy) throw new Error('Unlock the recovered account on its network to wrap from it.')
          if (isHardware && !canActAsHardware) throw new Error('Connect the hardware account on its network to wrap from it.')
          setStatus('submitting')
          const res = await submitAsActive(call)
          setStatus('success')
          await refresh()
          return { txHash: res.txHash ?? null, sponsored: false }
        }

        setStatus('signing')

        if (isPasskey) {
          setStatus('submitting')
          const res = await sendCalls(
            [{ target: call.to, data: call.data, value: call.value }],
            { onState: (s) => { if (s?.state === OP_STATE.SUBMITTED) setStatus('pending') } },
          )
          // Trust what the batch reports, not what the config promised: sendCalls falls back to
          // a self-funded UserOp when sponsorship is unavailable (spec 050).
          const wasSponsored = res?.sponsored === true || (res?.sponsored !== false && sponsored)
          if (res?.state === OP_STATE.FAILED) {
            throw new Error(res.reason || 'The transaction reverted on-chain.')
          }
          if (res?.state && res.state !== OP_STATE.INCLUDED) {
            // Submitted but not included. A userOpHash is NOT a transaction hash and no explorer
            // resolves one, so it is never returned as `txHash` (Constitution III).
            setStatus('pending')
            await refresh()
            return {
              txHash: null,
              pending: true,
              userOpHash: res.userOpHash ?? res.intentId ?? null,
              sponsored: wasSponsored,
            }
          }
          setStatus('success')
          await refresh()
          return { txHash: res?.txHash ?? null, sponsored: wasSponsored }
        }

        // Classic wallet: a plain transaction, confirmed before it is reported as done.
        setStatus('submitting')
        const tx = await signer.sendTransaction({ to: call.to, value: call.value, data: call.data })
        const receipt = await tx.wait()
        setStatus('success')
        await refresh()
        return { txHash: receipt?.hash ?? tx.hash, sponsored: false }
      } catch (err) {
        const message = err?.shortMessage || err?.message || 'The transaction failed.'
        setError(message)
        setStatus('error')
        throw err
      }
    },
    [
      token, signer, isPasskey, isVault, isLegacy, isHardware, canActAsVault, canActAsLegacy,
      canActAsHardware, submitAsActive,
      sendCalls, decimals, nativeBalance, wrappedBalance, nativeSymbol, wrappedSymbol, sponsored, refresh,
    ],
  )

  const wrap = useCallback((amount) => execute(WRAP_DIRECTION.WRAP, amount), [execute])
  const unwrap = useCallback((amount) => execute(WRAP_DIRECTION.UNWRAP, amount), [execute])

  return useMemo(
    () => ({
      token,
      available: Boolean(token),
      networkName: net?.name || '',
      chainId: chainId == null ? null : Number(chainId),
      nativeSymbol,
      wrappedSymbol,
      decimals,
      nativeBalance,
      wrappedBalance,
      maxWrappable,
      gasReserve,
      sponsored,
      isVault,
      status,
      error,
      busy: status === 'signing' || status === 'submitting' || status === 'pending',
      wrap,
      unwrap,
      refresh,
      reset,
    }),
    [
      token, net?.name, chainId, nativeSymbol, wrappedSymbol, decimals, nativeBalance, wrappedBalance,
      maxWrappable, gasReserve, sponsored, isVault, status, error, wrap, unwrap, refresh, reset,
    ],
  )
}

export default useWrapNative
