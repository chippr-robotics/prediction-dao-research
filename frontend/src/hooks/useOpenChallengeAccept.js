import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { WAGER_REGISTRY_ABI } from '../abis/WagerRegistry'
import { getContractAddressForChain, getContractAddress } from '../config/contracts'
import { fetchEncryptedEnvelope, parseEncryptedIpfsReference } from '../utils/ipfsService'
import { deriveFromCode, signOpenAccept } from '../utils/claimCode/deriveFromCode.js'
import { isValidCode } from '../utils/claimCode/wordlist.js'
import { decryptEnvelopeCode, isCodeEnvelope } from '../utils/crypto/envelopeEncryption.js'

const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE'))
const MEMBERSHIP_ABI = ['function hasActiveRole(address user, bytes32 role) view returns (bool)']

/**
 * Take-a-challenge flow for open-challenge wagers (feature 024). The four-word code does triple duty:
 * discover the wager, decrypt its terms, and authorize acceptance (EIP-712 signature from the code key).
 *
 * Returns:
 *   discover(code)  → { wagerId, wager, terms, termsUnavailable, needsMembership }
 *   accept(code, wagerId) → { txHash }
 * plus { busy, error } state. Discovery and the membership check are read-only; only accept signs/sends.
 */
export function useOpenChallengeAccept() {
  const { signer, account, chainId, provider } = useWeb3()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const resolveRegistry = useCallback(() => {
    const addr = chainId != null ? getContractAddressForChain('wagerRegistry', chainId) : getContractAddress('wagerRegistry')
    if (!addr) throw new Error('WagerRegistry is not deployed on this network.')
    return addr
  }, [chainId])

  /**
   * Look up an open challenge by its code, read it, and decrypt its terms. Read-only — no wallet signature.
   * Throws a clear error if the code is malformed or routes to no live challenge (never reveals a wager).
   */
  const discover = useCallback(async (code) => {
    setError(null)
    if (!isValidCode(code)) {
      throw new Error('Enter the four words exactly as they were shared with you.')
    }
    const readProvider = provider || signer?.provider
    if (!readProvider) throw new Error('Connect your wallet to look up a challenge.')

    const registryAddr = resolveRegistry()
    const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, readProvider)
    const { claimAddress, symKey } = deriveFromCode(code)

    const wagerId = await registry.openWagerIdForClaim(claimAddress)
    if (wagerId === 0n) {
      throw new Error('No open challenge matches that code. Check the four words and try again.')
    }

    const wager = await registry.getWager(wagerId)

    // Decrypt the terms (code-keyed envelope on IPFS). A retrieval/tamper failure is surfaced as
    // "terms unavailable" — on-chain accept does not need the plaintext (FR-020).
    let terms = null
    let termsUnavailable = false
    try {
      const { isIpfs, cid } = parseEncryptedIpfsReference(wager.metadataUri)
      if (!isIpfs || !cid) throw new Error('no encrypted reference')
      const envelope = await fetchEncryptedEnvelope(cid)
      if (!isCodeEnvelope(envelope)) throw new Error('not a code-keyed envelope')
      terms = decryptEnvelopeCode(envelope, symKey)
    } catch {
      termsUnavailable = true
    }

    // Membership check for the buy-membership prompt (any active tier may take — no tier floor).
    let needsMembership = false
    try {
      const mAddr = chainId != null ? getContractAddressForChain('membershipManager', chainId) : getContractAddress('membershipManager')
      if (mAddr && account) {
        const mm = new ethers.Contract(mAddr, MEMBERSHIP_ABI, readProvider)
        needsMembership = !(await mm.hasActiveRole(account, WAGER_PARTICIPANT_ROLE))
      }
    } catch {
      needsMembership = false // non-fatal; the contract is the source of truth at accept
    }

    return { wagerId, wager, terms, termsUnavailable, needsMembership }
  }, [provider, signer, account, chainId, resolveRegistry])

  /**
   * Accept the open challenge: sign the code-derived EIP-712 message bound to this taker, then send
   * acceptOpenWager. The signature is only valid for `account`, so an observer cannot reuse it (FR-011).
   */
  const accept = useCallback(async (code, wagerId) => {
    setError(null)
    setBusy(true)
    try {
      if (!signer || !account) throw new Error('Connect your wallet to accept.')
      if (!isValidCode(code)) throw new Error('Enter the four words exactly as they were shared with you.')

      const registryAddr = resolveRegistry()
      const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, signer)
      const net = await signer.provider.getNetwork()

      const signature = await signOpenAccept(code, {
        wagerId,
        taker: account,
        chainId: net.chainId,
        verifyingContract: registryAddr,
      })

      // Pre-flight to surface a clear revert reason before the wallet prompt.
      try {
        await registry.acceptOpenWager.staticCall(wagerId, signature)
      } catch (sim) {
        throw new Error(translateAcceptRevert(sim.reason || sim.shortMessage || sim.message || ''))
      }

      const tx = await registry.acceptOpenWager(wagerId, signature)
      const receipt = await tx.wait()
      if (!receipt || receipt.status === 0) throw new Error('Acceptance reverted on-chain.')
      return { txHash: receipt.hash }
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [signer, account, resolveRegistry])

  return { discover, accept, busy, error }
}

/** Map known contract reverts to friendly messages for the take flow. */
export function translateAcceptRevert(reason) {
  const r = String(reason)
  if (r.includes('NotOpenChallenge')) return 'This challenge is no longer open — someone may have already taken it.'
  if (r.includes('BadClaimSignature')) return 'That code does not authorize this account to accept.'
  if (r.includes('AcceptExpired')) return 'This challenge has expired and can no longer be accepted.'
  if (r.includes('SelfWager')) return 'You cannot accept your own challenge.'
  if (r.includes('ArbitratorCannotTake')) return 'You are the named arbitrator for this challenge and cannot take it.'
  if (r.includes('MembershipDenied')) return 'An active membership is required to take a challenge. Purchase one and try again.'
  if (r.includes('AccountFrozen')) return 'This account is restricted from accepting wagers.'
  return reason || 'Acceptance failed. Please try again.'
}

export default useOpenChallengeAccept
