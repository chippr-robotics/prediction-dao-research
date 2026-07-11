import { useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './useWalletManagement'
import { useActiveAccount } from './useActiveAccount'
import { useChainTokens } from './useChainTokens'
import { getNetwork } from '../config/networks'
import { makeReadProvider } from '../utils/rpcProvider'
import {
  TRANSFER_ABI,
  signTransferAuthorization,
  getTransferRelayer,
  relayGaslessTransfer,
} from '../lib/transfer/eip3009Transfer'
import { recordTransfer, updateTransfer, TRANSFER_STATUS } from '../lib/transfer/transferStore'
import { appendClientRecord } from '../data/ledger'
import { transferRecordToEntry } from '../data/ledger/sources/transferLedgerSource'

/**
 * Mirror a transfer record (or a status transition) into the append-only
 * client ledger (spec 051 FR-008/FR-010): the initial record keeps its
 * `cl:<id>` identity; each transition appends a superseding record instead
 * of mutating. Deterministic suffixes make re-mirroring a no-op. Best-effort:
 * the ledger must never break a transfer.
 */
function mirrorToLedger(account, record, patch = null, suffix = null) {
  try {
    const entry = transferRecordToEntry({ ...record, ...(patch || {}) }, { account })
    if (!suffix) {
      appendClientRecord(account, entry)
      return
    }
    appendClientRecord(account, {
      ...entry,
      entryId: `${entry.entryId}:${suffix}`,
      recordedAt: Date.now(),
      refs: { ...entry.refs, supersedes: entry.entryId },
    })
  } catch {
    /* capture is best-effort */
  }
}

/**
 * useTransfer — the send engine behind the Pay & Transfer wallet section.
 *
 * Two asset kinds, one honest routing table:
 *
 *   stablecoin, passkey session   → gasless via the smart-account batch (sendCalls → ERC-4337 UserOp/relay)
 *   stablecoin, classic + relayer → gasless via EIP-3009 transferWithAuthorization (token-native)
 *   stablecoin, classic, no relay → self-submit token.transfer (sender pays gas)  [never-stranded fallback]
 *   native, passkey session       → gasless via the smart-account batch
 *   native, classic               → standard network-fee transfer
 *
 * "All stablecoin transfers are gasless" holds wherever the rails exist (a live relayer, or a passkey smart
 * account); where they don't, the transfer still goes through by self-submit rather than being blocked — and
 * the UI says so truthfully via `quoteGasless`.
 */

export const TRANSFER_KIND = Object.freeze({ NATIVE: 'native', STABLE: 'stable' })

const ERC20_IFACE = new ethers.Interface(TRANSFER_ABI)

export function useTransfer() {
  const { address, chainId, signer, provider, loginMethod, sendCalls } = useWallet()
  const { isVault: operatingAsVault, canActAsVault, submit: submitAsActive } = useActiveAccount()
  const tokens = useChainTokens()
  const isPasskey = loginMethod === 'passkey'

  const [status, setStatus] = useState('idle') // idle | signing | submitting | pending | success | error
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [nativeBalance, setNativeBalance] = useState(null)
  const [stableBalance, setStableBalance] = useState(null)

  const stableDomainVersion = getNetwork(chainId)?.stablecoin?.domainVersion ?? null
  const readProvider = useMemo(() => {
    const net = getNetwork(chainId)
    const rpcProvider = net?.rpcUrl ? makeReadProvider(net.rpcUrl, chainId) : null
    return isPasskey ? (rpcProvider || provider) : (provider || rpcProvider)
  }, [chainId, isPasskey, provider])
  // A transfer is gasless when a passkey smart account's UserOp is FairWins-sponsored (spec 050: a
  // sponsor paymaster is configured for this chain), or — for classic wallets — when the token
  // supports EIP-3009 AND a relayer is configured. Without a sponsor paymaster a passkey UserOp
  // self-funds native gas (NOT gasless), so the badge must not claim "sponsored" (honest-state,
  // Constitution III; this is the fix for the previously-unconditional passkey badge).
  const hasRelayer = Boolean(getTransferRelayer())
  const passkeySponsored = isPasskey && Boolean(getNetwork(chainId)?.passkey?.sponsorPaymasterUrl)
  const stableGasless = passkeySponsored || (!isPasskey && stableDomainVersion != null && hasRelayer)

  /** Whether a given kind will be gasless for the current session (drives the UI badge, honestly). */
  const quoteGasless = useCallback(
    (kind) => (kind === TRANSFER_KIND.STABLE ? stableGasless : passkeySponsored),
    [stableGasless, passkeySponsored]
  )

  const meta = useCallback(
    (kind) =>
      kind === TRANSFER_KIND.STABLE
        ? { symbol: tokens.stable, name: tokens.stableName, decimals: tokens.stableDecimals, address: tokens.stableAddress }
        : { symbol: tokens.native, name: tokens.nativeName, decimals: tokens.nativeDecimals, address: null },
    [tokens]
  )

  // Balances for the two supported assets. Reads use the wallet provider when available, but passkey
  // sessions (and provider-less cases) fall back to direct chain RPC reads.
  const refreshBalances = useCallback(async () => {
    if (!readProvider || !address) {
      setNativeBalance(null)
      setStableBalance(null)
      return
    }
    try {
      const nat = await readProvider.getBalance(address)
      setNativeBalance(ethers.formatUnits(nat, tokens.nativeDecimals))
    } catch {
      setNativeBalance(null)
    }
    if (tokens.stableAddress) {
      try {
        const erc20 = new ethers.Contract(tokens.stableAddress, TRANSFER_ABI, readProvider)
        const bal = await erc20.balanceOf(address)
        setStableBalance(ethers.formatUnits(bal, tokens.stableDecimals))
      } catch {
        setStableBalance(null)
      }
    } else {
      setStableBalance(null)
    }
  }, [readProvider, address, tokens.stableAddress, tokens.stableDecimals, tokens.nativeDecimals])

  useEffect(() => {
    refreshBalances()
  }, [refreshBalances])

  const balanceOf = useCallback(
    (kind) => (kind === TRANSFER_KIND.STABLE ? stableBalance : nativeBalance),
    [stableBalance, nativeBalance]
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setLastResult(null)
  }, [])

  /**
   * Send a transfer. `to` must be a resolved 0x address; `amount` is a human-readable decimal string.
   * Returns { txHash?, route } on success and records the attempt to the Activity log with truthful status.
   */
  const send = useCallback(
    async ({ kind, to, amount }) => {
      if (!signer && !isPasskey) throw new Error('Wallet not connected.')
      if (!ethers.isAddress(to)) throw new Error('Enter a valid recipient address.')
      const m = meta(kind)
      let value
      try {
        value = ethers.parseUnits(String(amount), m.decimals)
      } catch {
        throw new Error('Enter a valid amount.')
      }
      if (value <= 0n) throw new Error('Enter an amount greater than zero.')
      if (kind === TRANSFER_KIND.STABLE && !m.address) {
        throw new Error(`No ${m.symbol || 'stablecoin'} is configured on this network.`)
      }

      // Spec 043 (US3, FR-022): when operating as a vault, a transfer becomes a threshold-gated vault
      // proposal instead of an immediate send. It surfaces only in the vault queue (FR-022b) until executed.
      if (operatingAsVault) {
        if (!canActAsVault) throw new Error("Switch to the vault's network to send from it.")
        const payload =
          kind === TRANSFER_KIND.STABLE
            ? { to: m.address, value: 0n, data: ERC20_IFACE.encodeFunctionData('transfer', [to, value]) }
            : { to, value, data: '0x' }
        setError(null)
        setStatus('submitting')
        try {
          const res = await submitAsActive(payload)
          setStatus('success')
          const result = { proposed: true, safeTxHash: res.safeTxHash, route: 'vault', id: null }
          setLastResult(result)
          return result
        } catch (err) {
          const message = err?.shortMessage || err?.message || 'Could not create the vault proposal.'
          setError(message)
          setStatus('error')
          throw err
        }
      }

      const gasless = quoteGasless(kind)
      const entry = recordTransfer(address, {
        chainId,
        kind,
        symbol: m.symbol,
        decimals: m.decimals,
        amount: String(amount),
        from: address,
        to,
        route: gasless ? 'gasless' : kind === TRANSFER_KIND.STABLE ? 'self' : 'direct',
      })
      mirrorToLedger(address, entry)

      setError(null)
      setStatus('signing')
      try {
        let txHash = null
        let route = entry.route

        if (isPasskey) {
          // One ceremony via the smart-account batch. Native = value move; stable = ERC-20 transfer call.
          const calls =
            kind === TRANSFER_KIND.STABLE
              ? [{ target: m.address, data: ERC20_IFACE.encodeFunctionData('transfer', [to, value]), value: 0n }]
              : [{ target: to, data: '0x', value }]
          setStatus('submitting')
          const res = await sendCalls(calls)
          txHash = res?.txHash ?? res?.userOpHash ?? res?.intentId ?? null
          // Honest route: reflect whether the batch was ACTUALLY sponsored. sendCalls falls back to a
          // self-funded UserOp when sponsorship is unavailable (spec 050), so trust its `sponsored`
          // flag rather than assuming gasless.
          route = res?.sponsored === false ? 'self' : res?.sponsored === true || passkeySponsored ? 'gasless' : 'self'
        } else if (kind === TRANSFER_KIND.STABLE && stableDomainVersion != null && hasRelayer) {
          // Classic EOA, gasless: sign an EIP-3009 authorization; a relayer submits + pays gas.
          const auth = await signTransferAuthorization({
            signer,
            token: m.address,
            tokenName: m.name || 'USD Coin',
            tokenVersion: stableDomainVersion,
            chainId,
            to,
            value,
          })
          setStatus('submitting')
          try {
            const relayed = await relayGaslessTransfer(getTransferRelayer(), auth, { token: m.address, chainId })
            txHash = relayed.txHash
            route = 'gasless'
          } catch (relayErr) {
            // Never stranded: fall back to a self-submitted transfer (sender pays gas).
            console.warn('[useTransfer] relayer failed, self-submitting:', relayErr?.message)
            const erc20 = new ethers.Contract(m.address, TRANSFER_ABI, signer)
            const tx = await erc20.transfer(to, value)
            const receipt = await tx.wait()
            txHash = receipt?.hash ?? tx.hash
            route = 'self'
          }
        } else if (kind === TRANSFER_KIND.STABLE) {
          // Classic EOA, no gasless rail on this chain: plain ERC-20 transfer.
          setStatus('submitting')
          const erc20 = new ethers.Contract(m.address, TRANSFER_ABI, signer)
          const tx = await erc20.transfer(to, value)
          const receipt = await tx.wait()
          txHash = receipt?.hash ?? tx.hash
          route = 'self'
        } else {
          // Native, classic EOA: standard network-fee transfer.
          setStatus('submitting')
          const tx = await signer.sendTransaction({ to, value })
          const receipt = await tx.wait()
          txHash = receipt?.hash ?? tx.hash
          route = 'direct'
        }

        updateTransfer(address, entry.id, { status: TRANSFER_STATUS.COMPLETE, txHash, route })
        mirrorToLedger(address, entry, { status: TRANSFER_STATUS.COMPLETE, txHash, route }, 'done')
        setStatus('success')
        const result = { txHash, route, id: entry.id }
        setLastResult(result)
        refreshBalances()
        return result
      } catch (err) {
        const message = err?.shortMessage || err?.message || 'Transfer failed.'
        updateTransfer(address, entry.id, { status: TRANSFER_STATUS.FAILED, error: message })
        mirrorToLedger(address, entry, { status: TRANSFER_STATUS.FAILED, error: message }, 'fail')
        setError(message)
        setStatus('error')
        throw err
      }
    },
    [signer, isPasskey, meta, quoteGasless, address, chainId, sendCalls, stableDomainVersion, hasRelayer, refreshBalances, operatingAsVault, canActAsVault, submitAsActive]
  )

  return useMemo(
    () => ({
      status,
      error,
      lastResult,
      send,
      reset,
      quoteGasless,
      meta,
      balanceOf,
      refreshBalances,
      nativeBalance,
      stableBalance,
      tokens,
      isPasskey,
    }),
    [status, error, lastResult, send, reset, quoteGasless, meta, balanceOf, refreshBalances, nativeBalance, stableBalance, tokens, isPasskey]
  )
}

export default useTransfer
