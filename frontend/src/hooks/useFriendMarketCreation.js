import { useCallback } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddress, getContractAddressForChain } from '../config/contracts'
import { WAGER_REGISTRY_ABI } from '../abis/WagerRegistry'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'
import { ResolutionType, ORACLE_RESOLUTION_TYPES, WAGER_DEFAULTS } from '../constants/wagerDefaults'
import {
  uploadEncryptedEnvelope,
  buildEncryptedIpfsReference
} from '../utils/ipfsService'
import { getFeeOverrides } from '../utils/feeOverrides'
import { getCurrentDocument } from '../utils/legalDocs'

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

export { ResolutionType, ORACLE_RESOLUTION_TYPES }

const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE'))

async function expireStaleWagers(registry, userAddress, onProgress) {
  try {
    const provider = registry.runner?.provider || registry.provider
    // Resolve MembershipManager for the chain this registry/signer is on.
    let membershipManagerAddr
    try {
      const cid = Number((await provider.getNetwork()).chainId)
      membershipManagerAddr = getContractAddressForChain('membershipManager', cid)
    } catch {
      membershipManagerAddr = getContractAddress('membershipManager')
    }
    if (!membershipManagerAddr) return

    const mgr = new ethers.Contract(membershipManagerAddr, MEMBERSHIP_MANAGER_ABI, provider)
    const membership = await mgr.getMembership(userAddress, WAGER_PARTICIPANT_ROLE)
    const tierNum = Number(membership.tier)
    if (tierNum === 0) return

    const cfg = await mgr.getTierConfig(WAGER_PARTICIPANT_ROLE, tierNum)
    const concurrentLimit = Number(cfg.limits.maxConcurrentMarkets)
    const activeCount = Number(membership.activeCount)
    if (concurrentLimit === 0 || activeCount < concurrentLimit) return

    const count = await registry.getUserWagerCount(userAddress)
    if (count === 0n) return

    const wagers = await registry.getUserWagers(userAddress, 0, count)
    const ids = await registry.getUserWagerIds(userAddress, 0, count)
    const now = Math.floor(Date.now() / 1000)
    const expiredIds = []

    for (let i = 0; i < wagers.length; i++) {
      if (Number(wagers[i].status) === 1 && Number(wagers[i].acceptDeadline) < now) {
        expiredIds.push(ids[i])
      }
    }
    if (expiredIds.length === 0) return

    onProgress({ step: 'cleanup', message: `Cleaning up ${expiredIds.length} expired wager(s)...` })
    const tx = await registry.batchExpireOpen(expiredIds)
    await tx.wait()
  } catch (e) {
    console.debug('[expireStaleWagers] cleanup skipped:', e.message)
  }
}

// localStorage helpers — preserved for backward-compat with FriendMarketsModal callers
const PENDING_TX_KEY = 'pendingFriendMarketTx'

const savePendingTransaction = (txData) => {
  try {
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ ...txData, timestamp: Date.now() }))
  } catch { /* localStorage may be unavailable; ignore */ }
}

export const loadPendingTransaction = () => {
  try {
    const stored = localStorage.getItem(PENDING_TX_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    if (Date.now() - data.timestamp > 60 * 60 * 1000) {
      clearPendingTransaction()
      return null
    }
    return data
  } catch { return null }
}

export const clearPendingTransaction = () => {
  try { localStorage.removeItem(PENDING_TX_KEY) } catch { /* ignore */ }
}

/**
 * v2 friend market creation: drives WagerRegistry.createWager.
 *
 * Differences from v1:
 *  - ERC20-only stakes (USDC or WMATIC); native MATIC not supported.
 *  - No proposalId / no ConditionalMarketFactory dependency.
 *  - Resolution types: Either/Creator/Opponent/ThirdParty/Polymarket.
 *  - On-chain only stores a 32-byte metadataHash; the description/envelope
 *    lives off-chain (IPFS or app-local).
 *  - Membership checks are delegated to the contract — if `MembershipDenied`
 *    reverts, the UI surfaces a buy-tier prompt.
 */
export function useFriendMarketCreation({ onMarketCreated } = {}) {
  const { signer } = useWeb3()

  const createFriendMarket = useCallback(async (data, modalSigner) => {
    const activeSigner = modalSigner || signer
    if (!activeSigner) throw new Error('Please connect your wallet to create a wager')

    const onProgress = data.data?.onProgress || (() => {})
    savePendingTransaction({
      step: 'verify',
      data: {
        description: data.data?.description,
        opponent: data.data?.opponent,
        stakeAmount: data.data?.stakeAmount,
        stakeTokenId: data.data?.stakeTokenId,
      },
    })

    try {
      onProgress({ step: 'verify', message: 'Validating wager...' })

      // Resolve contracts for the chain the signer will execute on, so the
      // registry + stake token always match the transaction's network (display
      // ↔ execution parity). Falls back to the build-time chain only if the
      // signer can't report its network.
      let executionChainId
      try {
        executionChainId = Number((await activeSigner.provider.getNetwork()).chainId)
      } catch {
        executionChainId = undefined
      }
      const resolve = (name) =>
        executionChainId != null ? getContractAddressForChain(name, executionChainId) : getContractAddress(name)

      const wagerRegistryAddress = resolve('wagerRegistry')
      if (!wagerRegistryAddress) {
        throw new Error('WagerRegistry not deployed on this network. Run scripts/deploy/deploy.js first.')
      }

      // Resolve stake token. v2 is ERC20-only; default to paymentToken (USDC).
      const requestedToken = data.data?.collateralToken
      const stakeTokenAddress = (requestedToken && requestedToken !== ethers.ZeroAddress)
        ? requestedToken
        : resolve('paymentToken')
      if (!stakeTokenAddress || stakeTokenAddress === ethers.ZeroAddress) {
        throw new Error('A stake token (USDC or WMATIC) is required. Native MATIC is not supported.')
      }

      const userAddress = await activeSigner.getAddress()
      const registry = new ethers.Contract(wagerRegistryAddress, WAGER_REGISTRY_ABI, activeSigner)
      const stakeToken = new ethers.Contract(stakeTokenAddress, ERC20_ABI, activeSigner)
      const tokenDecimals = Number(await stakeToken.decimals())
      const tokenSymbol = await stakeToken.symbol().catch(() => 'tokens')

      // Stakes
      const stakeAmountRaw = data.data.stakeAmount || '10'
      const stakeWei = ethers.parseUnits(String(stakeAmountRaw), tokenDecimals)
      const isOffer = data.marketType === 'offer'
      const oddsMultiplier = parseInt(data.data.oddsMultiplier, 10) || 100
      const offerResolutionType = parseInt(data.data.resolutionType, 10) || ResolutionType.Creator

      let creatorStakeWei = stakeWei
      let opponentStakeWei = stakeWei
      if (isOffer) {
        // Offer: one side puts up the majority (insurer) stake, the other risks
        // the smaller headline stake to win the whole pot. The *settler* carries
        // the majority stake (skin in the game): when the opponent settles
        // ("Them") they're the insurer, otherwise the creator is.
        //   majorityStake = headlineStake * (odds - 100) / 100
        const majorityStakeWei = (stakeWei * BigInt(oddsMultiplier - 100)) / 100n
        if (majorityStakeWei <= 0n) {
          throw new Error(`Offer odds (${oddsMultiplier}%) would result in zero or negative majority stake.`)
        }
        if (offerResolutionType === ResolutionType.Opponent) {
          // "Them" settles → opponent is the insurer (majority); creator risks the headline.
          opponentStakeWei = majorityStakeWei
          creatorStakeWei = stakeWei
        } else {
          // "Me" / "Friend" / "Oracle" → creator is the insurer (majority); opponent risks the headline.
          creatorStakeWei = majorityStakeWei
          opponentStakeWei = stakeWei
        }
      }

      // Balance check
      const balance = await stakeToken.balanceOf(userAddress)
      if (balance < creatorStakeWei) {
        throw new Error(
          `Insufficient ${tokenSymbol} balance. ` +
          `Have ${ethers.formatUnits(balance, tokenDecimals)}, ` +
          `need ${ethers.formatUnits(creatorStakeWei, tokenDecimals)}.`
        )
      }

      // Deadlines
      const tradingPeriodSeconds = parseInt(data.data.tradingPeriodSeconds, 10) || (parseInt(data.data.tradingPeriod, 10) || 7) * 86400
      const raw = data.data.acceptanceDeadline
      let acceptDeadline
      if (typeof raw === 'string' && raw.includes('-')) {
        const parsed = new Date(raw)
        acceptDeadline = isNaN(parsed.getTime())
          ? Math.floor(Date.now() / 1000) + 48 * 3600
          : Math.floor(parsed.getTime() / 1000)
      } else if (typeof raw === 'number' && raw > 1e12) {
        acceptDeadline = Math.floor(raw / 1000)
      } else if (typeof raw === 'number' && raw > 1e9) {
        acceptDeadline = Math.floor(raw)
      } else {
        const hours = parseInt(raw, 10) || 48
        acceptDeadline = Math.floor(Date.now() / 1000) + hours * 3600
      }
      // Timing model: a single user-chosen end time `E` (tradingEnd) drives everything.
      //   - acceptDeadline  = midpoint(now, E)            (set upstream by the form)
      //   - tradingEnd      = E   → resolution opens here
      //   - resolveDeadline = E + 48h → resolution closes; after this stakes are refundable
      // Anchor resolveDeadline to E directly. The previous formula
      // (acceptDeadline + tradingPeriodSeconds + 48h) overshot to ~1.5*E + 48h because
      // acceptDeadline is the midpoint, which broke the resolve-window gate downstream.
      const RESOLUTION_WINDOW = WAGER_DEFAULTS.RESOLUTION_WINDOW_SECONDS || 48 * 3600
      const parsedEnd = data.data.endDateTime ? new Date(data.data.endDateTime) : null
      const tradingEnd = (parsedEnd && !Number.isNaN(parsedEnd.getTime()))
        ? Math.floor(parsedEnd.getTime() / 1000)
        : acceptDeadline + tradingPeriodSeconds // fallback when no explicit end time
      let resolveDeadline = tradingEnd + RESOLUTION_WINDOW

      // Clamp deadlines to the contract's accept/resolve windows so a far-future
      // end (e.g. a Polymarket-linked market whose own end is months out, which
      // bypasses the modal's 21-day bound) can't push past the on-chain caps and
      // revert with BadDeadlines. We keep now < acceptDeadline < resolveDeadline.
      const nowSec = Math.floor(Date.now() / 1000)
      const SAFETY_BUFFER = 5 * 60 // 5 min, to absorb block-time skew
      const maxAccept = nowSec + (WAGER_DEFAULTS.MAX_ACCEPT_WINDOW_SECONDS || 30 * 86400) - SAFETY_BUFFER
      const maxResolve = nowSec + (WAGER_DEFAULTS.MAX_RESOLVE_WINDOW_SECONDS || 180 * 86400) - SAFETY_BUFFER
      if (acceptDeadline > maxAccept) acceptDeadline = maxAccept
      if (resolveDeadline > maxResolve) resolveDeadline = maxResolve
      // Guarantee strict ordering even after clamping.
      if (acceptDeadline <= nowSec) acceptDeadline = nowSec + 60
      if (resolveDeadline <= acceptDeadline) resolveDeadline = acceptDeadline + RESOLUTION_WINDOW

      // Participants
      const opponent = data.data.opponent || data.data.participants?.[0]
      if (!opponent || !ethers.isAddress(opponent)) {
        throw new Error('Valid opponent address required for 1v1 wager')
      }
      if (opponent.toLowerCase() === userAddress.toLowerCase()) {
        throw new Error('Cannot wager against yourself')
      }

      // Resolution
      const resolutionType = parseInt(data.data.resolutionType, 10) || ResolutionType.Creator
      // The form field is `oracleConditionId` (future-proof: same slot serves Polymarket
      // and the upcoming ChainlinkDataFeed / ChainlinkFunctions / UMA adapters). The
      // contract param is still named `polymarketConditionId` for legacy reasons; we
      // rebind here so the contract call is unambiguous.
      // Fall back to the legacy key for any external callers that still set it.
      const oracleConditionId = data.data.oracleConditionId ?? data.data.polymarketConditionId ?? ''
      const polymarketConditionId = oracleConditionId || ethers.ZeroHash
      const creatorIsYes = Boolean(data.data.creatorIsYes ?? true)
      // ThirdParty resolution names a neutral arbitrator (Spec Kit 005); every
      // other resolution type submits the zero address, which is exactly what
      // WagerRegistry requires (a non-zero arbitrator on a non-ThirdParty wager
      // reverts ArbitratorDisallowed; a zero arbitrator on ThirdParty reverts
      // ArbitratorRequired).
      let arbitrator = ethers.ZeroAddress
      if (resolutionType === ResolutionType.ThirdParty) {
        const arb = (data.data.arbitrator || '').trim()
        if (!ethers.isAddress(arb) || arb === ethers.ZeroAddress) {
          throw new Error('ThirdParty resolution requires a valid arbitrator address.')
        }
        arbitrator = arb
      }

      // Defense-in-depth: the modal's validateForm should have caught these
      // mismatches before submit. If something slipped through (e.g. a future
      // caller invokes the hook directly), surface a clear error rather than
      // let the contract revert with a cryptic custom error.
      const oracleResolved = ORACLE_RESOLUTION_TYPES.has(resolutionType)
      if (oracleResolved && polymarketConditionId === ethers.ZeroHash) {
        throw new Error(
          'Oracle-resolved wagers require a conditionId. ' +
          'Pick a Polymarket market (or other oracle condition) before submitting.'
        )
      }
      if (!oracleResolved && polymarketConditionId !== ethers.ZeroHash) {
        throw new Error(
          'A conditionId was supplied for a non-oracle resolution type. ' +
          'Either change the resolution type or clear the conditionId.'
        )
      }

      // Metadata (encrypted envelope → IPFS, or plaintext)
      let metadataReference
      let ipfsCid = null
      if (data.data.isEncrypted && data.data.encryptedMetadata) {
        onProgress({ step: 'upload', message: 'Uploading encrypted metadata to IPFS...' })
        try {
          const uploaded = await uploadEncryptedEnvelope(data.data.encryptedMetadata, {
            marketType: data.marketType || 'oneVsOne',
          })
          ipfsCid = uploaded.cid
          metadataReference = buildEncryptedIpfsReference(ipfsCid)
        } catch (e) {
          throw new Error(`Failed to upload encrypted metadata: ${e.message}`)
        }
      } else {
        metadataReference = data.data.description || 'Friend Wager'
      }
      const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(metadataReference))

      // Approve stake token if needed. We approve the full uint256 max rather
      // than the exact stake so (a) subsequent wagers don't need a fresh
      // approval each time (the exact-stake approval left allowance at 0 after
      // every wager) and (b) a stale read on a load-balanced RPC node can't
      // under-approve. After approving we poll the allowance until the freshly
      // mined approval is actually visible to the RPC — otherwise createWager's
      // gas estimation can land on a node that still sees allowance 0, and the
      // transferFrom reverts ("transfer amount exceeds allowance", surfaced as
      // an opaque "missing revert data" by some wallet RPCs).
      let currentAllowance = await stakeToken.allowance(userAddress, wagerRegistryAddress)
      if (currentAllowance < creatorStakeWei) {
        onProgress({ step: 'approve', message: 'Approving token spend...' })
        const approveTx = await stakeToken.approve(wagerRegistryAddress, ethers.MaxUint256)
        onProgress({ step: 'approve', message: 'Waiting for approval confirmation...', txHash: approveTx.hash })
        await approveTx.wait()

        // Wait until the approval is observable before continuing. Public RPCs
        // are often load-balanced, so the node answering the next read/estimate
        // may briefly lag the node that mined the approval.
        for (let attempt = 0; attempt < 6; attempt++) {
          currentAllowance = await stakeToken.allowance(userAddress, wagerRegistryAddress)
          if (currentAllowance >= creatorStakeWei) break
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
        }
        if (currentAllowance < creatorStakeWei) {
          throw new Error(
            'Your token approval has not been confirmed yet. Please wait a few ' +
            'seconds for it to finalize, then try creating the wager again.'
          )
        }
      }

      // Auto-cleanup expired Open wagers that still count toward the
      // concurrent limit. Without this, acceptDeadline-expired wagers
      // inflate activeCount and block new creation even when the user
      // has fewer truly-active wagers than their tier allows.
      await expireStaleWagers(registry, userAddress, onProgress)

      // Spec 007 (FR-056/FR-058): bind the in-force T&C version hash on-chain when the
      // registry supports it. legalDocs hashes are bare 64-hex → normalize to bytes32.
      // Falls back to plain createWager on older registries lacking the overload.
      const termsHashHex = getCurrentDocument('terms')?.hash
      const termsBytes32 = termsHashHex && /^[0-9a-fA-F]{64}$/.test(termsHashHex) ? '0x' + termsHashHex : null
      const useTerms = Boolean(termsBytes32) && typeof registry.createWagerWithTerms === 'function'
      const createMethod = useTerms ? 'createWagerWithTerms' : 'createWager'
      const createArgs = [
        opponent, arbitrator, stakeTokenAddress,
        creatorStakeWei, opponentStakeWei,
        acceptDeadline, resolveDeadline,
        resolutionType, polymarketConditionId, creatorIsYes,
        metadataHash, metadataReference,
        ...(useTerms ? [termsBytes32] : []),
      ]

      // Simulate to catch reverts pre-wallet-prompt
      try {
        onProgress({ step: 'create', message: 'Validating transaction...' })
        await registry[createMethod].staticCall(...createArgs)
      } catch (simError) {
        const reason = simError.reason || simError.shortMessage || simError.message || ''
        throw new Error(translateRevert(reason))
      }

      onProgress({ step: 'create', message: 'Please confirm in your wallet...' })
      const feeOverrides = await getFeeOverrides(activeSigner.provider)

      // Estimate gas explicitly with a short retry so a transient stale read on
      // a load-balanced RPC doesn't surface a raw "missing revert data" error.
      // The staticCall above already validated the args, so a failure here is
      // almost always RPC lag rather than a genuine revert; fall back to a fixed
      // limit after exhausting retries.
      let gasLimit
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const estimate = await registry[createMethod].estimateGas(...createArgs)
          gasLimit = (estimate * 120n) / 100n // +20% headroom
          break
        } catch {
          if (attempt === 2) {
            gasLimit = 800000n // generous fallback; the staticCall already passed
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
        }
      }

      const tx = await registry[createMethod](
        ...createArgs,
        { ...feeOverrides, gasLimit }
      )
      onProgress({ step: 'create', message: 'Waiting for confirmation...', txHash: tx.hash })
      savePendingTransaction({ step: 'create', txHash: tx.hash, data: data.data })

      const receipt = await tx.wait()
      if (!receipt || receipt.status === 0) {
        clearPendingTransaction()
        throw new Error('Transaction reverted on-chain. The wager was not created.')
      }
      clearPendingTransaction()

      // Parse WagerCreated event
      let wagerId = null
      for (const log of receipt.logs) {
        try {
          const parsed = registry.interface.parseLog(log)
          if (parsed?.name === 'WagerCreated') {
            wagerId = parsed.args.wagerId.toString()
            break
          }
        } catch { /* localStorage may be unavailable; ignore */ }
      }

      onProgress({ step: 'complete', message: 'Wager created!', txHash: receipt.hash })

      const newMarket = {
        id: wagerId || `wager-${Date.now()}`,
        type: data.marketType || 'oneVsOne',
        description: data.data.description || 'Friend Wager',
        isEncrypted: Boolean(data.data.isEncrypted),
        encryptedMetadata: data.data.encryptedMetadata || null,
        ipfsCid,
        metadataReference,
        metadataHash,
        creatorStake: ethers.formatUnits(creatorStakeWei, tokenDecimals),
        opponentStake: ethers.formatUnits(opponentStakeWei, tokenDecimals),
        stakeAmount: stakeAmountRaw,
        stakeTokenAddress,
        stakeTokenSymbol: tokenSymbol,
        oddsMultiplier,
        resolutionType,
        polymarketConditionId,
        creatorIsYes,
        participants: [userAddress, opponent],
        opponent,
        arbitrator,
        creator: userAddress,
        acceptanceDeadline: new Date(acceptDeadline * 1000).toISOString(),
        endDate: new Date(tradingEnd * 1000).toISOString(),
        tradingPeriod: Math.max(1, Math.ceil(tradingPeriodSeconds / 86400)).toString(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        txHash: receipt.hash,
      }

      if (onMarketCreated) onMarketCreated(newMarket)

      return { id: wagerId, txHash: receipt.hash, status: 'pending', ipfsCid, metadataHash }
    } catch (error) {
      console.error('Error creating wager:', error)
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        throw new Error('Transaction was rejected in your wallet.')
      }
      if (error.code === 'INSUFFICIENT_FUNDS') {
        throw new Error('Insufficient funds to cover the stake and gas.')
      }
      throw error
    }
  }, [signer, onMarketCreated])

  return { createFriendMarket, loadPendingTransaction, clearPendingTransaction }
}

export function translateRevert(reason) {
  if (!reason) return 'Unknown contract error.'
  if (reason.includes('insufficient allowance') || reason.includes('exceeds allowance')) {
    return 'Your USDC approval has not been confirmed yet. Wait a few seconds for the approval to finalize, then try creating the wager again.'
  }
  if (reason.includes('insufficient balance') || reason.includes('exceeds balance')) {
    return 'Insufficient token balance to cover your stake.'
  }
  if (reason.includes('MembershipDenied')) return 'Your membership is inactive or you have reached your wager limit. If you have expired wagers, try again — they will be cleaned up automatically. Otherwise, upgrade your tier for higher limits.'
  if (reason.includes('SelfWager')) return 'Cannot wager against yourself.'
  if (reason.includes('NotAllowedToken')) return 'Stake token is not on the allowlist. Use USDC or WMATIC.'
  if (reason.includes('BadDeadlines')) return 'Invalid deadlines. Accept window must be within 30 days; resolve window within 180 days.'
  if (reason.includes('ZeroStake')) return 'Stakes must be greater than zero.'
  if (reason.includes('ConditionAlreadyResolved')) return 'That Polymarket condition is already resolved. Pick an unresolved one.'
  if (reason.includes('PolymarketRequired')) return 'Polymarket resolution requires a non-zero conditionId.'
  if (reason.includes('PolymarketDisallowed')) return 'Polymarket conditionId must be zero unless resolutionType=Polymarket.'
  // Order: the new oracle-extensible reverts must check BEFORE the legacy
  // `AdapterNotSet`, since substring matching would otherwise route
  // `OracleAdapterNotSet` to the legacy "Polymarket adapter" message.
  if (reason.includes('OracleConditionRequired')) return 'Oracle-resolved wagers require a non-zero conditionId.'
  if (reason.includes('OracleAdapterNotSet')) return 'No oracle adapter is configured on-chain for this resolution type.'
  if (reason.includes('UnsupportedOracleResolutionType')) return 'This resolution type is not supported by the registry.'
  if (reason.includes('AdapterNotSet')) return 'Polymarket adapter not configured on-chain.'
  if (reason.includes('ArbitratorRequired')) return 'ThirdParty resolution requires an arbitrator.'
  if (reason.includes('ArbitratorDisallowed')) return 'Only ThirdParty resolution allows an arbitrator.'
  if (reason.includes('ZeroAddress')) return 'Invalid address (zero address not allowed).'
  if (reason.includes('EnforcedPause')) return 'Wager creation is paused. Please try again later.'
  return `Transaction will fail: ${reason}`
}

export default useFriendMarketCreation
