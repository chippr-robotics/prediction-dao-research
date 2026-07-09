import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { useGaslessWrite } from '../lib/relay/useGaslessWrite'
import { WAGER_REGISTRY_ABI } from '../abis/WagerRegistry'
import { getContractAddressForChain, getContractAddress } from '../config/contracts'
import { fetchEncryptedEnvelope, parseEncryptedIpfsReference } from '../utils/ipfsService'
import { deriveFromCode, signOpenAccept } from '../utils/claimCode/deriveFromCode.js'
import { isValidCode } from '../utils/claimCode/wordlist.js'
import { decryptEnvelopeCode, isCodeEnvelope } from '../utils/crypto/envelopeEncryption.js'

const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE'))
const MEMBERSHIP_ABI = ['function hasActiveRole(address user, bytes32 role) view returns (bool)']
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

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
  const { signer, address, account, chainId, provider, sendCalls, loginMethod } = useWeb3()
  const actor = address || account
  const isPasskey = loginMethod === 'passkey'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Gasless acceptOpenWager (spec 035/036): relayed where the relayer serves the chain and the stake
  // token supports EIP-3009 (Polygon USDC); transparent self-submit otherwise (Mordor USC → auto
  // self-submit). This is AcceptWagerIntent PLUS the separate claim-code proof (signOpenAccept): the
  // relay path carries the proof in params (the contract twin rebinds it to taker=signer, keeping the
  // front-running defense under a relayer, FR-011); the self-submit path passes it straight to
  // acceptOpenWager. The payment leg authorizes the taker's stake via EIP-3009, so the gasless path
  // skips the approve the self-submit closure performs.
  const acceptOpenWagerTx = useGaslessWrite('acceptOpenWager', {
    params: (wagerId, claimCodeSig) => ({ wagerId, claimCodeSig }),
    payment: (wagerId, claimCodeSig, stake) => ({ value: stake }),
    selfSubmit: async (wagerId, claimCodeSig, stake, tokenAddr, registryAddr, symbol, onProgress = () => {}) => {
      const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, signer)
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer)

      // Approve the registry to escrow the stake (skip if already approved). Kept in the self-submit
      // closure because the gasless path never approves — EIP-3009 pulls the stake instead.
      const allowance = await token.allowance(actor, registryAddr)
      if (allowance < stake) {
        onProgress({ step: 'approve', message: `Approve ${symbol} spending in your wallet…` })
        const approveTx = await token.approve(registryAddr, ethers.MaxUint256)
        await approveTx.wait()
      }

      // Pre-flight to surface a clear revert reason before the final wallet prompt.
      try {
        await registry.acceptOpenWager.staticCall(wagerId, claimCodeSig)
      } catch (sim) {
        throw new Error(translateAcceptRevert(sim.reason || sim.shortMessage || sim.message || ''))
      }

      onProgress({ step: 'accept', message: 'Confirm acceptance in your wallet…' })
      const tx = await registry.acceptOpenWager(wagerId, claimCodeSig)
      const receipt = await tx.wait()
      if (!receipt || receipt.status === 0) throw new Error('Acceptance reverted on-chain.')
      return receipt
    },
  })

  const resolveRegistry = useCallback(() => {
    const addr = chainId != null ? getContractAddressForChain('wagerRegistry', chainId) : getContractAddress('wagerRegistry')
    if (!addr) throw new Error('WagerRegistry is not deployed on this network.')
    return addr
  }, [chainId])

  /**
   * Structured, non-throwing lookup used by the unified phrase lookup (spec 037, FR-003/025).
   * Returns exactly one of:
   *   { status: 'matched',   payload: { wagerId, wager, terms, termsUnavailable, needsMembership } }
   *   { status: 'not-found', reason: 'invalid-code' | 'no-match' }
   *   { status: 'errored',   error }
   * Read-only — no wallet signature. Distinguishing 'not-found' from 'errored' lets the unified
   * resolver show "couldn't check right now" instead of a false "no match" (spec 037, FR-025).
   */
  const lookup = useCallback(async (code) => {
    // A non-English or non-four-word phrase is not a challenge code (challenges are English-only).
    if (!isValidCode(code)) return { status: 'not-found', reason: 'invalid-code' }
    const readProvider = provider || signer?.provider
    if (!readProvider) {
      return { status: 'errored', error: new Error('Connect your wallet to look up a challenge.') }
    }
    try {
      const registryAddr = resolveRegistry()
      const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, readProvider)
      const { claimAddress, symKey } = deriveFromCode(code)

      const wagerId = await registry.openWagerIdForClaim(claimAddress)
      if (wagerId === 0n) return { status: 'not-found', reason: 'no-match' }

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
        if (mAddr && actor) {
          const mm = new ethers.Contract(mAddr, MEMBERSHIP_ABI, readProvider)
          needsMembership = !(await mm.hasActiveRole(actor, WAGER_PARTICIPANT_ROLE))
        }
      } catch {
        needsMembership = false // non-fatal; the contract is the source of truth at accept
      }

      return { status: 'matched', payload: { wagerId, wager, terms, termsUnavailable, needsMembership } }
    } catch (error) {
      // Provider/RPC/contract failure — the caller MUST treat this as "couldn't check", not "no match".
      return { status: 'errored', error }
    }
  }, [provider, signer, actor, chainId, resolveRegistry])

  /**
   * Look up an open challenge by its code, read it, and decrypt its terms. Read-only — no wallet signature.
   * Throws a clear error if the code is malformed or routes to no live challenge (never reveals a wager).
   * Thin wrapper over lookup() that preserves the original throwing contract for existing callers.
   */
  const discover = useCallback(async (code) => {
    setError(null)
    const res = await lookup(code)
    if (res.status === 'matched') return res.payload
    if (res.status === 'not-found') {
      throw new Error(res.reason === 'invalid-code'
        ? 'Enter the four words exactly as they were shared with you.'
        : 'No open challenge matches that code. Check the four words and try again.')
    }
    throw res.error
  }, [lookup])

  /**
   * Accept the open challenge. Taking the other side escrows your matching stake, so this runs the full
   * funding flow and reports each step via onProgress({ step, message }):
   *   1. check    — read the wager's token + stake and confirm your balance covers it
   *   2. approve  — approve the registry to pull your stake (only when the current allowance is short)
   *   3. sign     — sign the code-derived EIP-712 message bound to this taker (FR-011: not reusable)
   *   4. accept   — send acceptOpenWager (a pre-flight staticCall surfaces a clear revert first)
   * The skipped "ERC20: transfer amount exceeds allowance" failure came from sending step 4 without step 2.
   */
  const accept = useCallback(async (code, wagerId, onProgress = () => {}) => {
    setError(null)
    setBusy(true)
    try {
      const readProvider = provider || signer?.provider
      if (!actor || !readProvider) throw new Error('Connect your wallet to accept.')
      if (!isValidCode(code)) throw new Error('Enter the four words exactly as they were shared with you.')

      const registryAddr = resolveRegistry()
      const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, readProvider)
      const net = chainId != null ? { chainId: BigInt(chainId) } : await readProvider.getNetwork()

      // 1. Read the authoritative stake the contract will pull (opponentStake == creatorStake for open
      //    challenges) and make sure the taker can cover it before any wallet prompt.
      onProgress({ step: 'check', message: 'Checking your balance and approval…' })
      const w = await registry.getWager(wagerId)
      const tokenAddr = w.token
      const stake = w.opponentStake
      if (!tokenAddr || tokenAddr === ethers.ZeroAddress) {
        throw new Error('This challenge has no stake token configured.')
      }
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, readProvider)
      let decimals = 18
      let symbol = 'tokens'
      try { decimals = Number(await token.decimals()) } catch { /* default 18 */ }
      try { symbol = await token.symbol() } catch { /* default tokens */ }

      const balance = await token.balanceOf(actor)
      if (balance < stake) {
        throw new Error(
          `Insufficient ${symbol} balance to take this challenge. ` +
          `You have ${ethers.formatUnits(balance, decimals)} but need ${ethers.formatUnits(stake, decimals)}.`
        )
      }

      // 2. Sign the code-derived acceptance (bound to this taker, single-use). Produced here — not
      //    inside the send — because the relay path carries it through as an intent param (rebound to
      //    taker=signer on-chain, FR-011), while self-submit passes it straight to acceptOpenWager.
      onProgress({ step: 'sign', message: 'Sign to authorize acceptance…' })
      const signature = await signOpenAccept(code, {
        wagerId,
        taker: actor,
        chainId: net.chainId,
        verifyingContract: registryAddr,
      })

      // 3. Take it: relayed where the relayer serves the chain (gasless, skips the approve — EIP-3009
      //    pulls the stake), transparent self-submit otherwise (approve → pre-flight → send). The
      //    approval, whose absence caused the allowance revert, stays inside the self-submit closure
      //    where a self-submitted accept still needs it.
      if (signer && !isPasskey) {
        const result = await acceptOpenWagerTx.run(wagerId, signature, stake, tokenAddr, registryAddr, symbol, onProgress)
        if (result?.error) throw result.error
        return { txHash: result?.txHash }
      }
      if (typeof sendCalls !== 'function') {
        throw new Error('This wallet cannot accept challenges on the current transaction rail.')
      }
      const calls = []
      const allowance = await token.allowance(actor, registryAddr)
      if (allowance < stake) {
        onProgress({ step: 'approve', message: `Approve ${symbol} spending in your wallet…` })
        calls.push({
          target: tokenAddr,
          data: token.interface.encodeFunctionData('approve', [registryAddr, ethers.MaxUint256]),
          value: 0n,
        })
      }
      try {
        await registry.acceptOpenWager.staticCall(wagerId, signature, { from: actor })
      } catch (sim) {
        throw new Error(translateAcceptRevert(sim.reason || sim.shortMessage || sim.message || ''))
      }
      onProgress({ step: 'accept', message: 'Confirm acceptance in your wallet…' })
      calls.push({
        target: registryAddr,
        data: registry.interface.encodeFunctionData('acceptOpenWager', [wagerId, signature]),
        value: 0n,
      })
      const sent = await sendCalls(calls)
      const txHash = sent?.txHash ?? sent?.userOpHash ?? sent?.intentId
      if (!txHash) throw new Error('Acceptance submitted but no transaction hash was returned.')
      return { txHash }
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [provider, signer, actor, chainId, resolveRegistry, acceptOpenWagerTx, sendCalls, isPasskey])

  return { lookup, discover, accept, busy, error }
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
  if (r.includes('exceeds allowance')) return 'The stake approval did not go through. Approve the token and try again.'
  if (r.includes('exceeds balance')) return 'Your token balance is too low to cover the stake.'
  return reason || 'Acceptance failed. Please try again.'
}

export default useOpenChallengeAccept
