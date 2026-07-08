import { useCallback, useState } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { WAGER_REGISTRY_ABI } from '../abis/WagerRegistry'
import { getContractAddressForChain, getContractAddress } from '../config/contracts'
import { uploadEncryptedEnvelope, buildEncryptedIpfsReference } from '../utils/ipfsService'
import { generateCode, normalizeCode } from '../utils/claimCode/wordlist.js'
import { deriveFromCode } from '../utils/claimCode/deriveFromCode.js'
import { encryptEnvelopeCode } from '../utils/crypto/envelopeEncryption.js'
import { getCurrentDocument } from '../utils/legalDocs'

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

// Resolution types permitted for an open challenge (FR-016a): NOT Creator(1)/Opponent(2).
export const OPEN_RESOLUTION_TYPES = { Either: 0, ThirdParty: 3, Polymarket: 4, ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7 }

/**
 * Create-an-open-challenge flow (feature 024). Generates a four-word claim code, derives the on-chain
 * commitment (claimAuthority) and the symmetric terms key, seals the terms under a code-keyed envelope to
 * IPFS, and calls createOpenWager. Silver+ membership is enforced on-chain (surfaced as a friendly revert).
 *
 * Returns { code, wagerId, txHash } — the code is shown ONCE for the creator to save/share out-of-band; it
 * is never sent anywhere.
 */
export function useOpenChallengeCreate() {
  const { signer, provider, chainId, address, account, sendCalls } = useWeb3()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const createOpenChallenge = useCallback(async (form, onProgress = () => {}) => {
    setError(null)
    setBusy(true)
    try {
      const actor = address || account
      const readProvider = provider || signer?.provider
      if (!actor || !readProvider) throw new Error('Connect your wallet to create an open challenge.')

      const net = chainId != null ? { chainId } : await readProvider.getNetwork()
      const execChainId = Number(net.chainId)
      const resolve = (n) => getContractAddressForChain(n, execChainId) || getContractAddress(n)

      const registryAddr = resolve('wagerRegistry')
      if (!registryAddr) throw new Error('WagerRegistry is not deployed on this network.')
      const tokenAddr = (form.token && form.token !== ethers.ZeroAddress) ? form.token : resolve('paymentToken')
      if (!tokenAddr) throw new Error('A stake token (USDC) is required.')

      const registry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, readProvider)
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, readProvider)
      const decimals = Number(await token.decimals())
      const stakeWei = ethers.parseUnits(String(form.stake || '10'), decimals)

      const balance = await token.balanceOf(actor)
      if (balance < stakeWei) throw new Error('Insufficient token balance for this stake.')

      // 1. Generate the claim code + derive the on-chain commitment and the terms key.
      onProgress({ step: 'code', message: 'Generating your claim code…' })
      const code = generateCode()
      const { claimAddress, symKey } = deriveFromCode(code)

      // 2. Seal the private terms under the code-derived key and pin to IPFS.
      onProgress({ step: 'upload', message: 'Encrypting and uploading terms…' })
      const termsDoc = getCurrentDocument('terms')
      const termsVersion = termsDoc ? { id: termsDoc.id, hash: termsDoc.hash } : null
      // Oracle-settled challenges (spec 041) seal the market metadata alongside the
      // description so a code-holder can read the bet (question, outcome labels, side)
      // even when live market data is unreachable. The on-chain fields
      // (resolutionType / polymarketConditionId / creatorIsYes) stay authoritative —
      // the claimant view cross-checks this block against them. Never on-chain plaintext:
      // a public market reference would break code-gated indistinguishability (spec 024).
      const envelope = encryptEnvelopeCode(
        {
          description: form.description || 'Open challenge',
          createdAt: new Date().toISOString(),
          ...(form.oracleMeta ? { oracle: form.oracleMeta } : {}),
        },
        symKey,
        termsVersion
      )
      const { cid } = await uploadEncryptedEnvelope(envelope, { marketType: 'openChallenge' })
      const metadataReference = buildEncryptedIpfsReference(cid)
      const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(metadataReference))

      // 3. Approve the stake token (max) if needed.
      const allowance = await token.allowance(actor, registryAddr)

      // 4. Deadlines.
      const now = Math.floor(Date.now() / 1000)
      const acceptDeadline = form.acceptDeadline || (now + 48 * 3600)
      const resolveDeadline = form.resolveDeadline || (acceptDeadline + 7 * 86400)

      const resolutionType = Number(form.resolutionType ?? OPEN_RESOLUTION_TYPES.Either)
      const arbitrator = resolutionType === OPEN_RESOLUTION_TYPES.ThirdParty
        ? form.arbitrator
        : ethers.ZeroAddress
      const oracleConditionId = form.oracleConditionId || ethers.ZeroHash
      const creatorIsYes = Boolean(form.creatorIsYes)

      const args = [
        claimAddress, arbitrator, tokenAddr, stakeWei,
        acceptDeadline, resolveDeadline, resolutionType,
        oracleConditionId, creatorIsYes, metadataHash, metadataReference,
      ]

      // Pre-flight to surface a clear revert (e.g. Silver-tier gate) before the wallet prompt.
      onProgress({ step: 'create', message: 'Validating…' })
      try {
        await registry.createOpenWager.staticCall(...args, { from: actor })
      } catch (sim) {
        throw new Error(translateOpenCreateRevert(sim.reason || sim.shortMessage || sim.message || ''))
      }

      let receipt
      if (signer) {
        const writeRegistry = new ethers.Contract(registryAddr, WAGER_REGISTRY_ABI, signer)
        const writeToken = new ethers.Contract(tokenAddr, ERC20_ABI, signer)
        if (allowance < stakeWei) {
          onProgress({ step: 'approve', message: 'Approving token spend…' })
          await (await writeToken.approve(registryAddr, ethers.MaxUint256)).wait()
        }
        onProgress({ step: 'create', message: 'Confirm in your wallet…' })
        const tx = await writeRegistry.createOpenWager(...args)
        receipt = await tx.wait()
      } else {
        if (typeof sendCalls !== 'function') {
          throw new Error('This wallet cannot submit open challenges on the current transaction rail.')
        }
        const calls = []
        if (allowance < stakeWei) {
          onProgress({ step: 'approve', message: 'Approving token spend…' })
          calls.push({
            target: tokenAddr,
            data: token.interface.encodeFunctionData('approve', [registryAddr, ethers.MaxUint256]),
            value: 0n,
          })
        }
        onProgress({ step: 'create', message: 'Confirm in your wallet…' })
        calls.push({
          target: registryAddr,
          data: registry.interface.encodeFunctionData('createOpenWager', args),
          value: 0n,
        })
        const sent = await sendCalls(calls)
        const txHash = sent?.txHash ?? sent?.userOpHash ?? sent?.intentId
        if (!txHash) throw new Error('Creation submitted but no transaction hash was returned.')
        for (let i = 0; i < 20; i += 1) {
          receipt = await readProvider.getTransactionReceipt(txHash)
          if (receipt) break
          await new Promise((res) => setTimeout(res, 1500))
        }
        if (!receipt) return { code: normalizeCode(code), wagerId: null, txHash }
      }
      if (!receipt || receipt.status === 0) throw new Error('Creation reverted on-chain.')

      const ev = receipt.logs
        .map((l) => { try { return registry.interface.parseLog(l) } catch { return null } })
        .find((p) => p && p.name === 'OpenWagerCreated')
      const wagerId = ev ? ev.args.wagerId : null

      return { code: normalizeCode(code), wagerId, txHash: receipt.hash }
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [signer, provider, chainId, address, account, sendCalls])

  return { createOpenChallenge, busy, error }
}

/** Map known createOpenWager reverts to friendly messages. */
export function translateOpenCreateRevert(reason) {
  const r = String(reason)
  if (r.includes('InsufficientMembershipTier')) return 'Creating an open challenge requires a Silver membership or above. Upgrade your tier to post one.'
  if (r.includes('MembershipDenied')) return 'An active membership is required to create a challenge.'
  if (r.includes('OpenResolutionTypeNotAllowed')) return 'Open challenges can use Either-side, third-party arbitrator, or an oracle — not single-party self-resolution.'
  if (r.includes('ClaimAuthorityInUse')) return 'That claim code is already in use by a live challenge. Generating a new one…'
  if (r.includes('ZeroClaimAuthority')) return 'Internal error: the claim code did not derive an authority. Please retry.'
  if (r.includes('ArbitratorRequired')) return 'A third-party challenge needs a named arbitrator address.'
  if (r.includes('ArbitratorDisallowed')) return 'This resolution type does not take an arbitrator.'
  if (r.includes('BadDeadlines')) return 'The accept/resolve deadlines are outside the allowed window.'
  if (r.includes('NotAllowedToken')) return 'That stake token is not allowed.'
  if (r.includes('ZeroStake')) return 'Enter a stake greater than zero.'
  // Oracle-linked open challenges (spec 041).
  if (r.includes('ConditionAlreadyResolved')) return 'That market has already resolved — pick a market that is still live.'
  if (r.includes('PolymarketRequired')) return 'Pick a Polymarket market to link this challenge to.'
  if (r.includes('PolymarketDisallowed')) return 'A market can only be linked when the challenge is oracle-settled.'
  if (r.includes('AdapterNotSet') || r.includes('OracleAdapterNotSet')) return 'Polymarket settlement isn’t available on this network yet.'
  if (r.includes('OracleConditionRequired')) return 'Pick an oracle condition to link this challenge to.'
  return reason || 'Could not create the open challenge. Please try again.'
}

export default useOpenChallengeCreate
