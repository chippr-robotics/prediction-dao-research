import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './useWalletManagement'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'
import { MEMBERSHIP_VOUCHER_ABI } from '../abis/MembershipVoucher'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'
import { VOUCHER_BATCH_MINTER_ABI } from '../abis/VoucherBatchMinter'
import { ERC20_ABI } from '../abis/ERC20'
import { useGaslessWrite } from '../lib/relay/useGaslessWrite'

/**
 * useVouchers — buy and redeem membership voucher NFTs (spec 026).
 *
 * Two acquisition rails converge on the same soulbound membership: this hook drives the *voucher* rail.
 * - mintVouchers: buy a quantity of vouchers and (optionally) gift them to another address in a single
 *   approval + single transaction via the VoucherBatchMinter helper. Falls back to a direct single self-mint
 *   on the (immutable) voucher when the helper isn't deployed and the order is just one voucher for yourself.
 * - listMyVouchers: enumerate the connected wallet's currently-held vouchers via a bounded on-chain Transfer
 *   scan (the voucher isn't ERC721Enumerable and the subgraph isn't live yet).
 * - redeemVoucher: burn a voucher you own to mint a soulbound membership to the CONNECTED wallet. Redeeming
 *   from a fresh wallet (one that received the voucher by transfer) decouples it from the buying wallet —
 *   pseudonymity, not cryptographic unlinkability (mints/transfers/burns are public on-chain).
 *
 * Addresses/ABIs come only from synced config (Principle V). When the voucher isn't deployed on the active
 * network, {voucherAvailable} is false and the UI surfaces that honestly rather than implying it works.
 */
export function useVouchers() {
  const { account, signer, provider, chainId, sendCalls, loginMethod } = useWallet()
  // Passkey smart-account sessions have no ethers signer (spec 041): their writes go through
  // WalletContext.sendCalls (one sponsored ERC-4337 UserOp, approve+action batched), exactly like
  // the transfer/earn/pool surfaces. Reads use the session read `provider` (a live RPC reader for
  // passkey on supported chains). Classic wallets keep the signer path unchanged.
  const isPasskey = loginMethod === 'passkey'
  const [status, setStatus] = useState('idle') // idle | minting | redeeming | transferring | listing | success | error
  const [error, setError] = useState(null)
  const [lastTxHash, setLastTxHash] = useState(null)

  const voucherAddress = getContractAddressForChain('membershipVoucher', chainId)
  const managerAddress = getContractAddressForChain('membershipManager', chainId)
  const batchMinterAddress = getContractAddressForChain('voucherBatchMinter', chainId)
  const paymentTokenAddress = getContractAddressForChain('paymentToken', chainId)
  const voucherAvailable = Boolean(voucherAddress && managerAddress)
  // Buying >1 or gifting to another address needs the batch helper; a single self-purchase does not.
  const batchMintAvailable = Boolean(voucherAvailable && batchMinterAddress)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setLastTxHash(null)
  }, [])

  // Gasless seam (specs 035 + 036): relay the redeem when a relayer is live, else self-submit the
  // MembershipManager.redeemVoucher call (never-stranded). Signer-attributed (no payment) — the
  // redeemer is the connected wallet, auto-filled by signIntent, so it's omitted from params.
  const voucherTx = useGaslessWrite('redeemVoucher', {
    params: (tokenId, termsHash) => ({ voucherId: tokenId, acceptedTermsHash: termsHash || ethers.ZeroHash }),
    selfSubmit: async (tokenId, termsHash) => {
      const manager = new ethers.Contract(managerAddress, MEMBERSHIP_MANAGER_ABI, signer)
      const tx = await manager.redeemVoucher(tokenId, termsHash || ethers.ZeroHash)
      setLastTxHash(tx.hash)
      return tx.wait()
    },
  })

  /**
   * Buy `quantity` vouchers of `(roleHash, tierId)` and send them to `recipient` (defaults to the buyer).
   * Uses the VoucherBatchMinter (one approval + one tx) for any quantity > 1 or any gift; uses a direct
   * single mint on the voucher when buying exactly one for yourself (works even before the helper deploys).
   */
  const mintVouchers = useCallback(
    async (roleHash, tierId, quantity = 1, recipient = '') => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to buy a voucher.')
      if (!voucherAvailable) throw new Error('Membership vouchers are not available on this network yet.')

      const qty = Math.max(1, Math.floor(Number(quantity) || 1))
      const to = recipient && recipient.trim() ? recipient.trim() : account
      if (!ethers.isAddress(to)) throw new Error('Enter a valid recipient address.')
      const isGift = to.toLowerCase() !== account.toLowerCase()
      const needsHelper = qty > 1 || isGift

      setStatus('minting')
      setError(null)
      setLastTxHash(null)
      try {
        if (isPasskey) {
          // Passkey rail: batch approve (only if the allowance is short) + the mint into ONE
          // sponsored UserOp. Reads over the session read provider; encoding needs no signer.
          if (needsHelper && !batchMintAvailable) {
            throw new Error('Buying multiple vouchers or gifting isn’t available on this network yet.')
          }
          const manager = new ethers.Contract(managerAddress, MEMBERSHIP_MANAGER_ABI, provider)
          const cfg = await manager.getTierConfig(roleHash, tierId)
          if (!cfg.active) throw new Error('That tier is not available for purchase.')
          const price = cfg.priceUSDC
          const spender = needsHelper ? batchMinterAddress : voucherAddress
          const amount = needsHelper ? price * BigInt(qty) : price
          const token = new ethers.Contract(paymentTokenAddress, ERC20_ABI, provider)
          const allowance = await token.allowance(account, spender)
          const calls = []
          if (allowance < amount) {
            calls.push({ target: paymentTokenAddress, data: token.interface.encodeFunctionData('approve', [spender, amount]), value: 0n })
          }
          if (needsHelper) {
            const minter = new ethers.Contract(batchMinterAddress, VOUCHER_BATCH_MINTER_ABI, provider)
            calls.push({ target: batchMinterAddress, data: minter.interface.encodeFunctionData('mintBatch', [roleHash, tierId, qty, to]), value: 0n })
          } else {
            const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, provider)
            calls.push({ target: voucherAddress, data: voucher.interface.encodeFunctionData('mint', [roleHash, tierId]), value: 0n })
          }
          const res = await sendCalls(calls)
          const txHash = res?.txHash ?? res?.userOpHash ?? null
          setLastTxHash(txHash)
          setStatus('success')
          // tokenId isn't parsed from a UserOp receipt; the holdings refresh reads it back on-chain.
          return { count: qty, recipient: to, gift: isGift, tokenId: needsHelper ? undefined : null, txHash }
        }

        const manager = new ethers.Contract(managerAddress, MEMBERSHIP_MANAGER_ABI, signer)
        const cfg = await manager.getTierConfig(roleHash, tierId)
        if (!cfg.active) throw new Error('That tier is not available for purchase.')
        const price = cfg.priceUSDC
        const token = new ethers.Contract(paymentTokenAddress, ERC20_ABI, signer)

        if (needsHelper) {
          if (!batchMintAvailable) {
            throw new Error('Buying multiple vouchers or gifting isn’t available on this network yet.')
          }
          const total = price * BigInt(qty)
          // Approve the batch helper (not the voucher) for the full amount, only if needed.
          const allowance = await token.allowance(account, batchMinterAddress)
          if (allowance < total) {
            const approveTx = await token.approve(batchMinterAddress, total)
            await approveTx.wait()
          }
          const minter = new ethers.Contract(batchMinterAddress, VOUCHER_BATCH_MINTER_ABI, signer)
          const tx = await minter.mintBatch(roleHash, tierId, qty, to)
          setLastTxHash(tx.hash)
          await tx.wait()
          setStatus('success')
          return { count: qty, recipient: to, gift: isGift, txHash: tx.hash }
        }

        // Single voucher for yourself: mint directly on the voucher (approve it for the price).
        const allowance = await token.allowance(account, voucherAddress)
        if (allowance < price) {
          const approveTx = await token.approve(voucherAddress, price)
          await approveTx.wait()
        }
        const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, signer)
        const tx = await voucher.mint(roleHash, tierId)
        setLastTxHash(tx.hash)
        const receipt = await tx.wait()
        let tokenId = null
        for (const log of receipt.logs) {
          try {
            const parsed = voucher.interface.parseLog(log)
            if (parsed && parsed.name === 'VoucherMinted') {
              tokenId = parsed.args.id.toString()
              break
            }
          } catch {
            /* not a voucher log */
          }
        }
        setStatus('success')
        return { count: 1, recipient: account, gift: false, tokenId, txHash: tx.hash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.message || 'Purchase failed.')
        throw e
      }
    },
    [isPasskey, provider, sendCalls, signer, account, voucherAvailable, batchMintAvailable, voucherAddress, managerAddress, batchMinterAddress, paymentTokenAddress]
  )

  /**
   * Transfer a voucher you hold to another address (e.g. a fresh wallet, or the person you're gifting
   * it to). Uses ERC-721 `safeTransferFrom` so the destination is checked for receiver support. The
   * recipient can then redeem it into their own soulbound membership.
   */
  const transferVoucher = useCallback(
    async (tokenId, to) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to transfer a voucher.')
      if (!voucherAvailable) throw new Error('Membership vouchers are not available on this network yet.')
      const dest = (to || '').trim()
      if (!ethers.isAddress(dest)) throw new Error('Enter a valid recipient address.')
      if (account && dest.toLowerCase() === account.toLowerCase()) {
        throw new Error('That voucher is already in this wallet.')
      }
      setStatus('transferring')
      setError(null)
      setLastTxHash(null)
      try {
        // The voucher overloads safeTransferFrom; pick the 3-arg (no data) form explicitly.
        const SIG = 'safeTransferFrom(address,address,uint256)'
        if (isPasskey) {
          const iface = new ethers.Interface(MEMBERSHIP_VOUCHER_ABI)
          const data = iface.encodeFunctionData(SIG, [account, dest, tokenId])
          const res = await sendCalls([{ target: voucherAddress, data, value: 0n }])
          const txHash = res?.txHash ?? res?.userOpHash ?? null
          setLastTxHash(txHash)
          setStatus('success')
          return { tokenId, to: dest, txHash }
        }
        const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, signer)
        const tx = await voucher[SIG](account, dest, tokenId)
        setLastTxHash(tx.hash)
        await tx.wait()
        setStatus('success')
        return { tokenId, to: dest, txHash: tx.hash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.message || 'Transfer failed.')
        throw e
      }
    },
    [isPasskey, sendCalls, signer, account, voucherAvailable, voucherAddress]
  )

  /** Redeem voucher `tokenId` into a soulbound membership for the connected wallet. `termsHash` may be 0x0. */
  const redeemVoucher = useCallback(
    async (tokenId, termsHash) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to redeem.')
      if (!voucherAvailable) throw new Error('Membership vouchers are not available on this network yet.')
      setStatus('redeeming')
      setError(null)
      setLastTxHash(null)
      try {
        if (isPasskey) {
          // Passkey rail: redeemVoucher as one sponsored UserOp (the 035 relay/intent path is
          // signer-only). The redeemer is the smart account — the connected passkey session.
          const iface = new ethers.Interface(MEMBERSHIP_MANAGER_ABI)
          const data = iface.encodeFunctionData('redeemVoucher', [tokenId, termsHash || ethers.ZeroHash])
          const res = await sendCalls([{ target: managerAddress, data, value: 0n }])
          const txHash = res?.txHash ?? res?.userOpHash ?? null
          setLastTxHash(txHash)
          setStatus('success')
          return { txHash }
        }
        const result = await voucherTx.run(tokenId, termsHash)
        if (result?.error) throw result.error
        setLastTxHash(result.txHash || lastTxHash)
        setStatus('success')
        return { txHash: result.txHash || lastTxHash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.message || 'Redemption failed.')
        throw e
      }
    },
    [isPasskey, sendCalls, managerAddress, signer, voucherAvailable, voucherTx, lastTxHash]
  )

  /**
   * List the vouchers currently held by the connected wallet. The voucher isn't ERC721Enumerable, so derive
   * holdings from a bounded Transfer-log scan (incoming to the wallet, from the recorded deploy block), then
   * confirm each is still owned (filters out ones transferred away, burned, or already redeemed) and read its
   * tier/duration. Read-only; never throws into the UI (returns [] on failure).
   */
  const listMyVouchers = useCallback(async () => {
    const reader = provider || signer?.provider
    if (!voucherAvailable || !account || !reader) return []
    setStatus('listing')
    setError(null)
    try {
      const fromBlock = getDeploymentBlockForChain('membershipVoucher', chainId)
      const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, reader)
      const incoming = await voucher.queryFilter(voucher.filters.Transfer(null, account), fromBlock)
      const ids = [...new Set(incoming.map((e) => e.args.tokenId.toString()))]
      const held = []
      for (const id of ids) {
        try {
          const owner = await voucher.ownerOf(id)
          if (owner.toLowerCase() !== account.toLowerCase()) continue
          const info = await voucher.voucherInfo(id)
          held.push({
            tokenId: id,
            tier: Number(info.tier),
            durationDays: Number(info.durationDays),
            role: info.role,
          })
        } catch {
          /* burned / redeemed / nonexistent — not currently held */
        }
      }
      held.sort((a, b) => Number(a.tokenId) - Number(b.tokenId))
      setStatus('idle')
      return held
    } catch (e) {
      setStatus('error')
      setError(e?.shortMessage || e?.message || 'Could not load your vouchers.')
      return []
    }
  }, [voucherAvailable, account, provider, signer, voucherAddress, chainId])

  return {
    status,
    error,
    lastTxHash,
    voucherAvailable,
    batchMintAvailable,
    voucherAddress,
    mintVouchers,
    redeemVoucher,
    transferVoucher,
    listMyVouchers,
    reset,
  }
}
