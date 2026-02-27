import { useCallback } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { getContractAddress } from '../config/contracts'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../abis/FriendGroupMarketFactory'
import { ERC20_ABI } from '../abis/ConditionalMarketFactory'
import { ETCSWAP_ADDRESSES, TOKENS } from '../constants/etcswap'
import {
  getUserTierOnChain,
  hasRoleOnChain,
  checkRoleSyncNeeded
} from '../utils/blockchainService'
import {
  uploadEncryptedEnvelope,
  buildEncryptedIpfsReference
} from '../utils/ipfsService'

// Helper to track pending transactions for resume capability
const PENDING_TX_KEY = 'pendingFriendMarketTx'

const savePendingTransaction = (txData) => {
  try {
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify({
      ...txData,
      timestamp: Date.now()
    }))
  } catch (e) {
    console.warn('Failed to save pending transaction:', e)
  }
}

export const loadPendingTransaction = () => {
  try {
    const stored = localStorage.getItem(PENDING_TX_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    // Expire pending transactions after 1 hour
    if (Date.now() - data.timestamp > 60 * 60 * 1000) {
      clearPendingTransaction()
      return null
    }
    return data
  } catch (e) {
    console.warn('Failed to load pending transaction:', e)
    return null
  }
}

export const clearPendingTransaction = () => {
  try {
    localStorage.removeItem(PENDING_TX_KEY)
  } catch (e) {
    console.warn('Failed to clear pending transaction:', e)
  }
}

/**
 * Hook that encapsulates the friend market creation logic.
 * Returns a handler function that can be used as the `onCreate` prop
 * for FriendMarketsModal.
 *
 * @param {Object} options
 * @param {Function} options.onMarketCreated - callback after successful creation (receives newMarket)
 * @returns {{ createFriendMarket: Function, loadPendingTransaction: Function, clearPendingTransaction: Function }}
 */
export function useFriendMarketCreation({ onMarketCreated } = {}) {
  const { signer } = useWeb3()

  const createFriendMarket = useCallback(async (data, modalSigner) => {
    const activeSigner = modalSigner || signer

    if (!activeSigner) {
      console.error('No signer available for friend market creation')
      throw new Error('Please connect your wallet to create a market')
    }

    console.log('Friend market creation data:', data)

    // Progress callback for UI updates
    const onProgress = data.data?.onProgress || (() => {})

    // Save initial pending state for recovery
    savePendingTransaction({
      step: 'verify',
      data: {
        description: data.data?.description,
        opponent: data.data?.opponent,
        stakeAmount: data.data?.stakeAmount,
        stakeTokenId: data.data?.stakeTokenId,
        tradingPeriod: data.data?.tradingPeriod,
        acceptanceDeadline: data.data?.acceptanceDeadline
      }
    })

    try {
      onProgress({ step: 'verify', message: 'Checking membership status...' })

      // Use FriendGroupMarketFactory for friend markets
      const friendFactoryAddress = getContractAddress('friendGroupMarketFactory')
      if (!friendFactoryAddress) {
        throw new Error('FriendGroupMarketFactory not deployed on this network')
      }

      // Get stake token address
      const rawCollateralToken = data.data?.collateralToken
      const isNativeETC = rawCollateralToken === null || rawCollateralToken === undefined
      const stakeTokenAddress = isNativeETC ? ethers.ZeroAddress : (rawCollateralToken || ETCSWAP_ADDRESSES.USC_STABLECOIN)

      // Determine token decimals based on token address
      let tokenDecimals = 18
      if (!isNativeETC && stakeTokenAddress.toLowerCase() === ETCSWAP_ADDRESSES.USC_STABLECOIN.toLowerCase()) {
        tokenDecimals = TOKENS.USC.decimals
      }

      console.log('Stake token config:', {
        rawCollateralToken,
        isNativeETC,
        stakeTokenAddress,
        tokenDecimals
      })

      const friendFactory = new ethers.Contract(friendFactoryAddress, FRIEND_GROUP_MARKET_FACTORY_ABI, activeSigner)
      const stakeToken = isNativeETC ? null : new ethers.Contract(stakeTokenAddress, ERC20_ABI, activeSigner)
      const userAddress = await activeSigner.getAddress()

      // Check if user has FRIEND_MARKET role (checks both TierRegistry AND RoleManager)
      let hasFriendMarketRole = false
      try {
        const friendMarketTier = await getUserTierOnChain(userAddress, 'FRIEND_MARKET')
        console.log('TierRegistry FRIEND_MARKET tier:', friendMarketTier)
        if (friendMarketTier.tier > 0) {
          hasFriendMarketRole = true
          console.log('User has FRIEND_MARKET role via TierRegistry (tier', friendMarketTier.tierName + ')')
        }
      } catch (tierError) {
        console.debug('TierRegistry check failed:', tierError.message)
      }

      if (!hasFriendMarketRole) {
        try {
          const hasRoleInManager = await hasRoleOnChain(userAddress, 'FRIEND_MARKET')
          if (hasRoleInManager) {
            hasFriendMarketRole = true
            console.log('User has FRIEND_MARKET role via RoleManager (legacy)')
          }
        } catch (roleError) {
          console.debug('RoleManager check failed:', roleError.message)
        }
      }

      if (!hasFriendMarketRole) {
        throw new Error('You do not have the Friend Market role. Please purchase Friend Markets access to create markets.')
      }

      // Check if role needs to be synced to TieredRoleManager
      try {
        const syncStatus = await checkRoleSyncNeeded(userAddress, 'FRIEND_MARKET')
        console.log('Role sync status:', syncStatus)

        if (syncStatus.needsSync) {
          throw new Error(
            `Your Friend Market role (${syncStatus.tierName}) needs to be activated in the system. ` +
            `Please contact support or wait for the role to be synced. ` +
            `Your purchase was successful but the role needs admin activation for friend market creation.`
          )
        }
      } catch (syncError) {
        if (syncError.message.includes('needs to be activated')) {
          throw syncError
        }
        console.debug('Role sync check failed (non-critical):', syncError.message)
      }

      console.log('Friend Market role check passed')

      // Check membership active and market creation limit on TieredRoleManager
      try {
        const factoryTRMAddress = await friendFactory.tieredRoleManager()
        console.log('FriendGroupMarketFactory tieredRoleManager address:', factoryTRMAddress)

        if (!factoryTRMAddress || factoryTRMAddress === ethers.ZeroAddress) {
          console.warn('FriendGroupMarketFactory has no TieredRoleManager configured')
        } else {
          const tieredRoleManagerABI = [
            'function FRIEND_MARKET_ROLE() view returns (bytes32)',
            'function isMembershipActive(address user, bytes32 role) view returns (bool)',
            'function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)',
            'function hasRole(bytes32 role, address account) view returns (bool)'
          ]
          const tieredRoleManager = new ethers.Contract(factoryTRMAddress, tieredRoleManagerABI, activeSigner)

          const friendMarketRole = await tieredRoleManager.FRIEND_MARKET_ROLE()
          console.log('FRIEND_MARKET_ROLE:', friendMarketRole)

          const hasRole = await tieredRoleManager.hasRole(friendMarketRole, userAddress)
          console.log('hasRole check:', hasRole)
          if (!hasRole) {
            throw new Error('You do not have the Friend Market role in TieredRoleManager. Role may need to be synced.')
          }

          const isActive = await tieredRoleManager.isMembershipActive(userAddress, friendMarketRole)
          console.log('isMembershipActive check:', isActive)
          if (!isActive) {
            throw new Error('Your Friend Market membership has expired. Please renew your membership to create markets.')
          }

          const canCreateMarket = await tieredRoleManager.checkMarketCreationLimitFor.staticCall(userAddress, friendMarketRole)
          console.log('checkMarketCreationLimitFor check:', canCreateMarket)
          if (!canCreateMarket) {
            throw new Error('You have reached your market creation limit for this period. Please wait or upgrade your tier for higher limits.')
          }

          console.log('All TieredRoleManager checks passed')
        }
      } catch (membershipError) {
        if (membershipError.message.includes('expired') ||
            membershipError.message.includes('limit') ||
            membershipError.message.includes('do not have')) {
          throw membershipError
        }
        console.warn('Membership check failed (will try transaction anyway):', membershipError.message)
      }

      // Calculate trading period in seconds
      const tradingPeriodDays = parseInt(data.data.tradingPeriod) || 7
      const tradingPeriodSeconds = tradingPeriodDays * 24 * 60 * 60

      // Check if this is a bookmaker market
      const isBookmaker = data.marketType === 'bookmaker'

      // Parse stake amount using correct decimals for token
      const stakeAmountRaw = data.data.stakeAmount || '10'
      const stakeWei = ethers.parseUnits(stakeAmountRaw, tokenDecimals)

      // Get odds multiplier (only used for bookmaker markets)
      const oddsMultiplier = parseInt(data.data.oddsMultiplier) || 200

      // Get resolution type
      const resolutionType = parseInt(data.data.resolutionType) || 0

      // Calculate stakes based on market type
      let opponentStakeWei
      let creatorStakeWei

      if (isBookmaker) {
        opponentStakeWei = stakeWei
        creatorStakeWei = (opponentStakeWei * BigInt(oddsMultiplier - 100)) / 100n
      } else {
        opponentStakeWei = stakeWei
        creatorStakeWei = stakeWei
      }

      console.log('Stake amount validation:', {
        marketType: data.marketType,
        isBookmaker,
        stakeAmountRaw,
        opponentStakeWei: opponentStakeWei.toString(),
        oddsMultiplier: isBookmaker ? oddsMultiplier : 'N/A (equal stakes)',
        resolutionType,
        creatorStakeWei: creatorStakeWei.toString(),
        creatorStakeFormatted: ethers.formatUnits(creatorStakeWei, tokenDecimals),
        tokenDecimals,
        isNativeETC
      })

      // Check user balance
      if (!isNativeETC && stakeToken) {
        const balance = await stakeToken.balanceOf(userAddress)
        const tokenSymbol = TOKENS.USC?.symbol || 'tokens'
        const requiredAmount = ethers.formatUnits(creatorStakeWei, tokenDecimals)
        console.log('Token balance check:', {
          balance: balance.toString(),
          balanceFormatted: ethers.formatUnits(balance, tokenDecimals),
          required: creatorStakeWei.toString(),
          requiredFormatted: requiredAmount
        })
        if (balance < creatorStakeWei) {
          throw new Error(
            `Insufficient ${tokenSymbol} balance. You have ${ethers.formatUnits(balance, tokenDecimals)} but need ${requiredAmount} ${tokenSymbol}.`
          )
        }
      } else if (isNativeETC) {
        const balance = await activeSigner.provider.getBalance(userAddress)
        const requiredAmount = ethers.formatEther(creatorStakeWei)
        console.log('Native ETC balance check:', {
          balance: balance.toString(),
          balanceFormatted: ethers.formatEther(balance),
          required: creatorStakeWei.toString(),
          requiredFormatted: requiredAmount
        })
        if (balance < creatorStakeWei) {
          throw new Error(
            `Insufficient ETC balance. You have ${ethers.formatEther(balance)} but need ${requiredAmount} ETC.`
          )
        }
      }

      // Calculate acceptance deadline
      let acceptanceDeadline
      const rawDeadline = data.data.acceptanceDeadline

      if (typeof rawDeadline === 'string' && rawDeadline.includes('-')) {
        const parsedDate = new Date(rawDeadline)
        if (!isNaN(parsedDate.getTime())) {
          acceptanceDeadline = Math.floor(parsedDate.getTime() / 1000)
        } else {
          acceptanceDeadline = Math.floor(Date.now() / 1000) + (48 * 60 * 60)
        }
      } else if (typeof rawDeadline === 'number' && rawDeadline > 1000000000000) {
        acceptanceDeadline = Math.floor(rawDeadline / 1000)
      } else if (typeof rawDeadline === 'number' && rawDeadline > 1000000000) {
        acceptanceDeadline = Math.floor(rawDeadline)
      } else {
        const hours = parseInt(rawDeadline) || 48
        acceptanceDeadline = Math.floor(Date.now() / 1000) + (hours * 60 * 60)
      }

      console.log('Acceptance deadline calculation:', {
        rawDeadline,
        rawDeadlineType: typeof rawDeadline,
        acceptanceDeadlineSeconds: acceptanceDeadline,
        acceptanceDeadlineDate: new Date(acceptanceDeadline * 1000).toISOString()
      })

      // Get opponent address for 1v1 markets
      const opponent = data.data.opponent || data.data.participants?.[0]
      if (!opponent || opponent === userAddress) {
        throw new Error('Valid opponent address required for 1v1 market')
      }

      // Get arbitrator (optional)
      const arbitrator = data.data.arbitrator || ethers.ZeroAddress

      // Approve stake token if needed
      if (!isNativeETC && stakeToken) {
        const currentAllowance = await stakeToken.allowance(userAddress, friendFactoryAddress)
        if (currentAllowance < creatorStakeWei) {
          onProgress({ step: 'approve', message: 'Approving token spend...' })
          console.log('Approving stake token for FriendGroupMarketFactory...', {
            creatorStakeWei: creatorStakeWei.toString()
          })
          const approveTx = await stakeToken.approve(friendFactoryAddress, creatorStakeWei)
          onProgress({ step: 'approve', message: 'Waiting for approval confirmation...', txHash: approveTx.hash })
          savePendingTransaction({
            step: 'approve',
            approveTxHash: approveTx.hash,
            data: {
              description: data.data?.description,
              opponent: data.data?.opponent,
              stakeAmount: data.data?.stakeAmount,
              oddsMultiplier: oddsMultiplier
            }
          })
          await approveTx.wait()
          console.log('Stake token approved')
          savePendingTransaction({
            step: 'approved',
            approvalComplete: true,
            data: {
              description: data.data?.description,
              opponent: data.data?.opponent,
              stakeAmount: data.data?.stakeAmount,
              oddsMultiplier: oddsMultiplier
            }
          })
        }
      }

      // Determine description: use encrypted envelope or plaintext
      let marketDescription
      let ipfsCid = null

      if (data.data.isEncrypted && data.data.encryptedMetadata) {
        onProgress({ step: 'upload', message: 'Uploading encrypted metadata to IPFS...' })
        try {
          const uploadResult = await uploadEncryptedEnvelope(data.data.encryptedMetadata, {
            marketType: data.marketType || 'oneVsOne'
          })
          ipfsCid = uploadResult.cid
          marketDescription = buildEncryptedIpfsReference(ipfsCid)
          console.log('Encrypted metadata uploaded to IPFS:', {
            cid: ipfsCid,
            onChainRef: marketDescription,
            originalSize: JSON.stringify(data.data.encryptedMetadata).length,
            onChainSize: marketDescription.length,
            savings: `${Math.round((1 - marketDescription.length / JSON.stringify(data.data.encryptedMetadata).length) * 100)}% smaller`
          })
        } catch (uploadError) {
          console.error('Failed to upload encrypted metadata to IPFS:', uploadError)
          throw new Error(`Failed to upload encrypted metadata: ${uploadError.message}. Please check your Pinata configuration.`)
        }
      } else {
        marketDescription = data.data.description || 'Friend Market'
        console.log('Using plaintext description, length:', marketDescription.length, 'chars')
      }

      // Create the 1v1 pending market
      onProgress({ step: 'create', message: 'Creating market on blockchain...' })
      console.log('Creating 1v1 pending market...', {
        opponent,
        description: marketDescription.substring(0, 100) + (marketDescription.length > 100 ? '...' : ''),
        descriptionLength: marketDescription.length,
        isEncrypted: data.data.isEncrypted,
        ipfsCid: ipfsCid || 'N/A (plaintext)',
        tradingPeriodSeconds,
        arbitrator,
        acceptanceDeadline,
        opponentStakeWei: opponentStakeWei.toString(),
        oddsMultiplier,
        creatorStakeWei: creatorStakeWei.toString(),
        stakeToken: stakeTokenAddress,
        isNativeETC
      })

      const gasLimit = 1000000n
      let tx

      if (isBookmaker) {
        if (isNativeETC) {
          tx = await friendFactory.createBookmakerMarket(
            opponent, marketDescription, tradingPeriodSeconds, acceptanceDeadline,
            opponentStakeWei, oddsMultiplier, stakeTokenAddress, resolutionType, arbitrator,
            { value: creatorStakeWei, gasLimit }
          )
        } else {
          tx = await friendFactory.createBookmakerMarket(
            opponent, marketDescription, tradingPeriodSeconds, acceptanceDeadline,
            opponentStakeWei, oddsMultiplier, stakeTokenAddress, resolutionType, arbitrator,
            { gasLimit }
          )
        }
      } else {
        if (isNativeETC) {
          tx = await friendFactory.createOneVsOneMarketPending(
            opponent, marketDescription, tradingPeriodSeconds, arbitrator,
            acceptanceDeadline, opponentStakeWei, stakeTokenAddress, resolutionType,
            { value: creatorStakeWei, gasLimit }
          )
        } else {
          tx = await friendFactory.createOneVsOneMarketPending(
            opponent, marketDescription, tradingPeriodSeconds, arbitrator,
            acceptanceDeadline, opponentStakeWei, stakeTokenAddress, resolutionType,
            { gasLimit }
          )
        }
      }

      console.log('Friend market transaction sent:', tx.hash)
      onProgress({ step: 'create', message: 'Waiting for confirmation...', txHash: tx.hash })
      savePendingTransaction({
        step: 'create',
        txHash: tx.hash,
        data: {
          description: data.data?.description,
          opponent: data.data?.opponent,
          stakeAmount: data.data?.stakeAmount,
          marketType: data.marketType,
          oddsMultiplier: isBookmaker ? oddsMultiplier : 200,
          resolutionType: resolutionType
        }
      })
      const receipt = await tx.wait()
      console.log('Friend market created:', receipt)
      onProgress({ step: 'complete', message: 'Market created successfully!', txHash: receipt.hash })
      clearPendingTransaction()

      // Extract friendMarketId from event logs
      let friendMarketId = null
      const marketCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = friendFactory.interface.parseLog(log)
          return parsed?.name === 'MarketCreatedPending'
        } catch {
          return false
        }
      })

      if (marketCreatedEvent) {
        const parsed = friendFactory.interface.parseLog(marketCreatedEvent)
        friendMarketId = parsed?.args?.friendMarketId?.toString()
      }

      // Build the new market object
      const endDate = new Date(Date.now() + tradingPeriodDays * 24 * 60 * 60 * 1000)

      const newMarket = {
        id: friendMarketId || `friend-${Date.now()}`,
        type: data.marketType || 'oneVsOne',
        description: data.data.description || 'Friend Market',
        isEncrypted: data.data.isEncrypted || false,
        encryptedMetadata: data.data.encryptedMetadata || null,
        ipfsCid: ipfsCid || null,
        stakeAmount: stakeAmountRaw,
        opponentStake: ethers.formatUnits(opponentStakeWei, tokenDecimals),
        creatorStake: ethers.formatUnits(creatorStakeWei, tokenDecimals),
        oddsMultiplier: isBookmaker ? oddsMultiplier : 200,
        resolutionType: resolutionType,
        tradingPeriod: tradingPeriodDays.toString(),
        participants: [userAddress, opponent],
        opponent: opponent,
        arbitrator: arbitrator,
        creator: userAddress,
        createdAt: new Date().toISOString(),
        acceptanceDeadline: new Date(acceptanceDeadline * 1000).toISOString(),
        endDate: endDate.toISOString(),
        status: 'pending',
        txHash: receipt.hash
      }

      // Notify the caller
      if (onMarketCreated) {
        onMarketCreated(newMarket)
      }

      console.log('Friend market stored:', newMarket)

      return {
        id: friendMarketId || `friend-${Date.now()}`,
        txHash: receipt.hash,
        status: 'pending'
      }
    } catch (error) {
      console.error('Error creating friend market:', error)
      throw error
    }
  }, [signer, onMarketCreated])

  return {
    createFriendMarket,
    loadPendingTransaction,
    clearPendingTransaction
  }
}
