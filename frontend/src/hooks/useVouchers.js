import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from './useWalletManagement'
import { getContractAddressForChain } from '../config/contracts'
import { MEMBERSHIP_VOUCHER_ABI, MEMBERSHIP_VOUCHER_REDEEM_ABI } from '../abis/MembershipVoucher'
import { ERC20_ABI } from '../abis/ERC20'

/**
 * useVouchers — mint and redeem membership voucher NFTs (spec 026).
 *
 * Two acquisition rails converge on the same soulbound membership: this hook drives the *voucher* rail.
 * - mintVoucher: pay the tier's USDC price (approve if needed) to mint a transferable voucher.
 * - redeemVoucher: burn a voucher you own to mint a soulbound membership to the CONNECTED wallet. Redeeming
 *   from a fresh wallet (one that received the voucher by transfer) decouples it from the buying wallet —
 *   pseudonymity, not cryptographic unlinkability (mints/transfers/burns are public on-chain).
 *
 * Addresses/ABIs come only from synced config (Principle V). When the voucher isn't deployed on the active
 * network, {voucherAvailable} is false and the UI surfaces that honestly rather than implying it works.
 */
export function useVouchers() {
  const { account, signer, chainId } = useWallet()
  const [status, setStatus] = useState('idle') // idle | minting | redeeming | success | error
  const [error, setError] = useState(null)
  const [lastTxHash, setLastTxHash] = useState(null)

  const voucherAddress = getContractAddressForChain('membershipVoucher', chainId)
  const managerAddress = getContractAddressForChain('membershipManager', chainId)
  const paymentTokenAddress = getContractAddressForChain('paymentToken', chainId)
  const voucherAvailable = Boolean(voucherAddress && managerAddress)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setLastTxHash(null)
  }, [])

  /** Mint a voucher for `roleHash` at `tierId` (1=Bronze..4=Platinum). Reads the exact on-chain price so the
   *  approval matches what {mint} pulls (no drift), then approves if needed and mints. */
  const mintVoucher = useCallback(
    async (roleHash, tierId) => {
      if (!signer) throw new Error('Connect a wallet to mint a voucher.')
      if (!voucherAvailable) throw new Error('Membership vouchers are not available on this network yet.')
      setStatus('minting')
      setError(null)
      setLastTxHash(null)
      try {
        const manager = new ethers.Contract(managerAddress, MEMBERSHIP_VOUCHER_REDEEM_ABI, signer)
        const cfg = await manager.getTierConfig(roleHash, tierId)
        if (!cfg.active) throw new Error('That tier is not available for purchase.')
        const priceUnits = cfg.priceUSDC

        // Approve only if the current allowance is insufficient (avoids a needless tx).
        const token = new ethers.Contract(paymentTokenAddress, ERC20_ABI, signer)
        const allowance = await token.allowance(account, voucherAddress)
        if (allowance < priceUnits) {
          const approveTx = await token.approve(voucherAddress, priceUnits)
          await approveTx.wait()
        }
        const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, signer)
        const tx = await voucher.mint(roleHash, tierId)
        setLastTxHash(tx.hash)
        const receipt = await tx.wait()
        // Extract the minted tokenId from the VoucherMinted event.
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
        return { tokenId, txHash: tx.hash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.message || 'Mint failed.')
        throw e
      }
    },
    [signer, account, voucherAvailable, voucherAddress, managerAddress, paymentTokenAddress]
  )

  /** Redeem voucher `tokenId` into a soulbound membership for the connected wallet. `termsHash` may be 0x0. */
  const redeemVoucher = useCallback(
    async (tokenId, termsHash) => {
      if (!signer) throw new Error('Connect a wallet to redeem.')
      if (!voucherAvailable) throw new Error('Membership vouchers are not available on this network yet.')
      setStatus('redeeming')
      setError(null)
      setLastTxHash(null)
      try {
        const manager = new ethers.Contract(managerAddress, MEMBERSHIP_VOUCHER_REDEEM_ABI, signer)
        const tx = await manager.redeemVoucher(tokenId, termsHash || ethers.ZeroHash)
        setLastTxHash(tx.hash)
        await tx.wait()
        setStatus('success')
        return { txHash: tx.hash }
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.message || 'Redemption failed.')
        throw e
      }
    },
    [signer, voucherAvailable, managerAddress]
  )

  /** Read a voucher's snapshot + current owner (used to preview a redemption). Read-only; never reverts the UI. */
  const getVoucher = useCallback(
    async (tokenId) => {
      if (!voucherAvailable || !signer) return null
      try {
        const voucher = new ethers.Contract(voucherAddress, MEMBERSHIP_VOUCHER_ABI, signer)
        const [info, owner] = await Promise.all([voucher.voucherInfo(tokenId), voucher.ownerOf(tokenId)])
        return {
          tokenId: String(tokenId),
          role: info.role,
          tier: Number(info.tier),
          durationDays: Number(info.durationDays),
          owner,
          ownedByMe: account && owner.toLowerCase() === account.toLowerCase(),
        }
      } catch {
        return null // nonexistent / burned token
      }
    },
    [voucherAvailable, signer, voucherAddress, account]
  )

  return {
    status,
    error,
    lastTxHash,
    voucherAvailable,
    voucherAddress,
    mintVoucher,
    redeemVoucher,
    getVoucher,
    reset,
  }
}
