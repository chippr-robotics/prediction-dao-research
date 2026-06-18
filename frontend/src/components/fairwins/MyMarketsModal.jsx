import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from '../../hooks'
import { useLazyMarketDecryption } from '../../hooks/useEncryption'
import { useLazyIpfsEnvelope } from '../../hooks/useIpfs'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import { WagerStatus as MarketStatus, DisputeStatus, WAGER_DEFAULTS, MyWagersDensity, MyWagersView } from '../../constants/wagerDefaults'
import { getContractAddressForChain } from '../../config/contracts'
import { getNetwork } from '../../config/networks'
import { WAGER_REGISTRY_ABI } from '../../abis/WagerRegistry'
import { getFeeOverrides } from '../../utils/feeOverrides'
import { getTransactionUrl } from '../../config/blockExplorer'
import MarketAcceptanceModal from './MarketAcceptanceModal'
import WagerList from './WagerList'
import ResolveButtonWithCountdown from './ResolveButtonWithCountdown'
import { getMarketDisplayTitle, isWinnerUnpaid } from './wagerCardHelpers'
import './MyMarketsModal.css'
import './WagerCard.css'

/**
 * MyMarketsModal Component
 *
 * A comprehensive modal for users to manage their wagers:
 * - Participating: View active wagers where user has positions
 * - Created: Manage wagers the user created (resolve, view disputes)
 * - History: View past/resolved wagers and outcomes
 *
 * Features:
 * - Wager resolution flow
 * - Dispute management for both participants and creators
 * - Status tracking and filtering
 */
function MyMarketsModal({
  isOpen,
  onClose,
  friendMarkets = [],
  initialSelectedMarketId = null
}) {
  const { isConnected, account, chainId } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Wager activity watcher (spec 012). Optional: the modal must keep working
  // when rendered outside WagerActivityProvider (legacy trees, tests).
  const activity = useWagerActivityOptional()
  const markWagerRead = activity?.markWagerRead

  // Active network metadata, used to scope/label the wagers shown so it's
  // clear they belong to the selected network (testnet vs mainnet).
  const activeNetwork = useMemo(() => (chainId ? getNetwork(chainId) : null), [chainId])
  const { dismissedIds, dismissMarket, dismissMarkets, refresh: refreshFriendMarkets } = useFriendMarkets()

  const { markets: marketsWithEnvelopes, fetchEnvelope } = useLazyIpfsEnvelope(friendMarkets)
  const { markets: decryptableMarkets, decryptMarket, isMarketDecrypting } = useLazyMarketDecryption(marketsWithEnvelopes)

  // Tab state
  const [activeTab, setActiveTab] = useState('participating')

  // Markets data state
  const [markets, setMarkets] = useState([])
  const [userPositions, setUserPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Selected market for detail view. Stored as an ID (not the object) so the
  // detail view always renders against the latest market data — important
  // because decryptableMarkets updates the underlying object with
  // decryptedMetadata after the user clicks "Decrypt Wager Details", and a
  // snapshot would freeze the pre-decryption state.
  const [selectedMarketId, setSelectedMarketId] = useState(null)

  // Resolution modal state
  const [showResolutionModal, setShowResolutionModal] = useState(false)
  const [resolutionMarket, setResolutionMarket] = useState(null)

  // Disputes are intentionally not surfaced as an interactive flow.
  // WagerRegistry.declareWinner() resolves a wager finally on-chain with no
  // challenge/dispute function, so there is no contract call to back a dispute
  // UI. Any active dispute carried in market data is shown read-only below;
  // re-introduce an interactive flow here only once an on-chain dispute
  // mechanism exists.

  // Acceptance modal state (for friend markets)
  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false)
  const [acceptanceMarket, setAcceptanceMarket] = useState(null)

  // Sort + filter state. The old "Type" filter was dropped: every wager in this
  // view is a friend wager, so it only ever had one meaningful option. Its slot
  // is reused for a Sort control over fields we already hold (recency, end time,
  // stake size).
  const [sortKey, setSortKey] = useState('newest') // 'newest' | 'endingSoon' | 'stakeHighToLow'
  const [statusFilter, setStatusFilter] = useState('all')

  // Automatic view selection (spec 019): wide displays get the table, narrow
  // displays get the compact card grid. No manual view/density toggle.
  const isWideViewport = useMediaQuery('(min-width: 768px)')
  const viewMode = isWideViewport ? MyWagersView.TABLE : MyWagersView.GRID
  const density = MyWagersDensity.COMPACT

  // Transient confirmation toast (spec 017 FR-015) shown after a successful
  // on-chain action (claim/refund). Auto-dismisses.
  const [toast, setToast] = useState(null)
  const fireToast = useCallback((message) => {
    setToast(message)
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // Auto-refresh (spec 019 FR-003/004): keep the list current while the modal is
  // open so users don't need a manual refresh button. Pulls fresh on-chain data
  // via the FriendMarkets context every 30s; stops on close/unmount.
  useEffect(() => {
    if (!isOpen || !account || typeof refreshFriendMarkets !== 'function') return
    const id = setInterval(() => { refreshFriendMarkets() }, 30000)
    return () => clearInterval(id)
  }, [isOpen, account, refreshFriendMarkets])

  const handleDecryptMarket = useCallback(async (marketId) => {
    try {
      // Pass the just-fetched envelope straight into decryptMarket. The merged
      // copy on the markets prop only lands on the next render, so handing the
      // envelope over directly lets a single click run fetch → decrypt in one
      // pass instead of the old fetch-then-(re-click)-to-decrypt flow.
      const envelope = await fetchEnvelope(marketId)
      await decryptMarket(marketId, envelope)
    } catch (err) {
      console.error('[MyMarketsModal] Decryption failed:', err)
    }
  }, [fetchEnvelope, decryptMarket])

  // Fetch markets data (friend markets are passed via props)
  const fetchMarketsData = useCallback(async () => {
    if (!account) return

    setLoading(true)
    setError(null)

    try {
      setMarkets([])
      setUserPositions([])
    } catch (err) {
      console.error('Error fetching markets data:', err)
      setError('Failed to load wagers. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [account])

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && account) {
      fetchMarketsData()
    }
  }, [isOpen, account, fetchMarketsData])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('participating')
      setSelectedMarketId(null)
      setShowResolutionModal(false)
      setSortKey('newest')
      setStatusFilter('all')
    }
  }, [isOpen])

  // Feed navigation (spec 012 T019): when the caller passes a wager id, open
  // directly at that wager's detail view. Runs only on open / id change —
  // after this it never fights the user's own navigation. Viewing a wager
  // marks its activity entries read (FR-004); declared after the open-reset
  // effect so it wins the same-commit ordering.
  useEffect(() => {
    if (!isOpen || initialSelectedMarketId == null) return
    setSelectedMarketId(initialSelectedMarketId)
    markWagerRead?.(String(initialSelectedMarketId))
  }, [isOpen, initialSelectedMarketId, markWagerRead])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showResolutionModal) {
          setShowResolutionModal(false)
        } else if (selectedMarketId) {
          setSelectedMarketId(null)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, selectedMarketId, showResolutionModal])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !showResolutionModal) {
      onClose()
    }
  }

  // Combine and categorize markets
  const categorizedMarkets = useMemo(() => {
    const userAddr = account?.toLowerCase()
    if (!userAddr) return { participating: [], created: [], arbitrating: [], history: [] }

    // Combine fetched and friend markets
    const allMarkets = [
      ...markets.map(m => ({ ...m, marketType: 'friend' })),
      ...decryptableMarkets.map(m => ({ ...m, marketType: 'friend' }))
    ]

    // Only show wagers that belong to the active network. Wagers are tagged
    // with the chainId they were read from (see FriendMarketsContext); after a
    // testnet ↔ mainnet switch this drops wagers that only exist on the other
    // network instead of displaying them as if they were available here.
    // Legacy/untagged wagers (no chainId) fall through so we never hide data
    // written before this tagging existed.
    const onActiveChain = allMarkets.filter(
      m => m.chainId == null || !chainId || m.chainId === chainId
    )

    // Remove duplicates by id
    const uniqueMarkets = onActiveChain.reduce((acc, market) => {
      const key = `${market.marketType}-${market.id}`
      if (!acc[key]) acc[key] = market
      return acc
    }, {})

    const marketsList = Object.values(uniqueMarkets)

    // Determine market status helper
    const getMarketStatus = (market) => {
      const now = Date.now()
      const endTime = market.tradingEndTime
        ? (typeof market.tradingEndTime === 'bigint'
          ? Number(market.tradingEndTime) * 1000
          : new Date(market.tradingEndTime).getTime())
        : (market.endDate ? new Date(market.endDate).getTime() : 0)
      const acceptanceDeadlineMs = market.acceptanceDeadline
        ? (typeof market.acceptanceDeadline === 'bigint'
          ? Number(market.acceptanceDeadline) * 1000
          : Number(market.acceptanceDeadline))
        : 0

      // Check for terminal statuses first
      const statusLower = market.status?.toLowerCase()
      if (statusLower === 'cancelled' || statusLower === 'canceled') {
        return MarketStatus.CANCELLED
      }
      if (statusLower === 'declined') return MarketStatus.DECLINED
      if (statusLower === 'resolved') return MarketStatus.RESOLVED
      if (statusLower === 'refunded') return MarketStatus.REFUNDED
      if (statusLower === 'draw') return MarketStatus.DRAW
      if (statusLower === 'oracle_timed_out') return MarketStatus.ORACLE_TIMED_OUT
      if (statusLower === 'challenged') return MarketStatus.CHALLENGED

      // Pending acceptance: surface as EXPIRED once the accept window has
      // closed without acceptance, so the row shows the right time-left and
      // can be cleared by the user. The on-chain status is still Open until
      // someone calls claimRefund/cancelOpen.
      if (statusLower === 'pending_acceptance' || statusLower === 'pending') {
        if (acceptanceDeadlineMs > 0 && now > acceptanceDeadlineMs) {
          return MarketStatus.EXPIRED
        }
        return MarketStatus.PENDING_ACCEPTANCE
      }
      if (statusLower === 'disputed' || market.disputeStatus === DisputeStatus.OPENED) {
        return MarketStatus.DISPUTED
      }
      if (endTime && now > endTime) return MarketStatus.PENDING_RESOLUTION
      return MarketStatus.ACTIVE
    }

    // Check if user has position in market
    const hasPosition = (marketId) => {
      return userPositions.some(p => String(p.marketId) === String(marketId))
    }

    // Check if user is creator
    const isCreator = (market) => {
      return market.creator?.toLowerCase() === userAddr
    }

    // Check if user is participant
    const isParticipant = (market) => {
      return market.participants?.some(p => p.toLowerCase() === userAddr) ||
        hasPosition(market.id)
    }

    // Check if the connected wallet is the (neutral) arbitrator for the wager.
    const isArbitrator = (market) => {
      const arb = market.arbitrator?.toLowerCase()
      return !!arb && arb !== '0x0000000000000000000000000000000000000000' && arb === userAddr
    }

    // Categorize markets
    const participating = []
    const created = []
    const arbitrating = []
    const history = []

    marketsList.forEach(market => {
      // Always drop dismissed wagers from view (per-account localStorage)
      if (dismissedIds?.has(String(market.id))) return

      const status = getMarketStatus(market)
      const marketWithStatus = { ...market, computedStatus: status }

      // Apply status filter. The default ("all") view also hides expired
      // offers so they don't clutter the list — pick "Expired" explicitly
      // to see them.
      if (statusFilter === 'all') {
        if (status === MarketStatus.EXPIRED) return
      } else if (status !== statusFilter) {
        return
      }

      // Terminal markets go to history
      if (
        status === MarketStatus.RESOLVED ||
        status === MarketStatus.CANCELLED ||
        status === MarketStatus.DECLINED ||
        status === MarketStatus.REFUNDED ||
        status === MarketStatus.DRAW ||
        status === MarketStatus.ORACLE_TIMED_OUT
      ) {
        if (isCreator(market) || isParticipant(market) || isArbitrator(market)) {
          history.push(marketWithStatus)
        }
      } else {
        if (isCreator(market)) {
          created.push(marketWithStatus)
        }
        if (isParticipant(market) && !isCreator(market)) {
          participating.push(marketWithStatus)
        }
        // The neutral arbitrator (not a participant) sees the wagers they oversee
        // under "Arbitrating" so they can resolve them.
        if (isArbitrator(market) && !isCreator(market) && !isParticipant(market)) {
          arbitrating.push(marketWithStatus)
        }
      }
    })

    // Sort each list by the user-selected key. Wager `id` is sequential on-chain
    // (higher = newer) and always present, so it is the stable tiebreaker for
    // every comparator.
    const endMs = (m) => {
      if (m.tradingEndTime != null) {
        return typeof m.tradingEndTime === 'bigint'
          ? Number(m.tradingEndTime) * 1000
          : Number(m.tradingEndTime)
      }
      return m.endDate ? new Date(m.endDate).getTime() : 0
    }
    const stakeOf = (m) => parseFloat(m.stakeAmount) || 0
    const byNewest = (a, b) =>
      (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0) ||
      (Number(b.id) || 0) - (Number(a.id) || 0)
    // Soonest-ending first; wagers with no end time sort to the bottom.
    const byEndingSoon = (a, b) => {
      const ae = endMs(a)
      const be = endMs(b)
      if (!ae && !be) return byNewest(a, b)
      if (!ae) return 1
      if (!be) return -1
      return ae - be || byNewest(a, b)
    }
    const byStake = (a, b) => stakeOf(b) - stakeOf(a) || byNewest(a, b)
    const comparator =
      sortKey === 'endingSoon' ? byEndingSoon
        : sortKey === 'stakeHighToLow' ? byStake
          : byNewest

    participating.sort(comparator)
    created.sort(comparator)
    arbitrating.sort(comparator)
    history.sort(comparator)

    return { participating, created, arbitrating, history }
  }, [markets, decryptableMarkets, userPositions, account, sortKey, statusFilter, dismissedIds, chainId])

  // Derive the selected market from the live categorized lists so the detail
  // view reflects fresh data (e.g., decryptedMetadata) after decryption
  // completes. categorizedMarkets is preferred over decryptableMarkets because
  // it carries the computedStatus field the detail view depends on.
  const selectedMarket = useMemo(() => {
    if (!selectedMarketId) return null
    const all = [
      ...categorizedMarkets.participating,
      ...categorizedMarkets.created,
      ...categorizedMarkets.arbitrating,
      ...categorizedMarkets.history,
    ]
    return all.find(m => String(m.id) === String(selectedMarketId)) || null
  }, [selectedMarketId, categorizedMarkets])

  // Format helpers
  const formatDate = (dateValue) => {
    if (!dateValue) return 'N/A'
    let date
    if (typeof dateValue === 'bigint') {
      date = new Date(Number(dateValue) * 1000)
    } else if (typeof dateValue === 'number') {
      date = dateValue > 1e12 ? new Date(dateValue) : new Date(dateValue * 1000)
    } else {
      date = new Date(dateValue)
    }
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatAddress = (address) => {
    if (!address) return 'N/A'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getStatusClass = (status) => {
    switch (status) {
      case MarketStatus.PENDING_ACCEPTANCE: return 'status-pending-acceptance'
      case MarketStatus.ACTIVE: return 'status-active'
      case MarketStatus.PENDING_RESOLUTION: return 'status-pending'
      case MarketStatus.CHALLENGED: return 'status-disputed'
      case MarketStatus.DISPUTED: return 'status-disputed'
      case MarketStatus.RESOLVED: return 'status-resolved'
      case MarketStatus.CANCELLED: return 'status-cancelled'
      case MarketStatus.DECLINED: return 'status-cancelled'
      case MarketStatus.EXPIRED: return 'status-expired'
      case MarketStatus.REFUNDED: return 'status-cancelled'
      case MarketStatus.DRAW: return 'status-draw'
      case MarketStatus.ORACLE_TIMED_OUT: return 'status-cancelled'
      default: return 'status-default'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case MarketStatus.PENDING_ACCEPTANCE: return 'Pending Acceptance'
      case MarketStatus.ACTIVE: return 'Active'
      case MarketStatus.PENDING_RESOLUTION: return 'Pending Resolution'
      case MarketStatus.CHALLENGED: return 'Challenged'
      case MarketStatus.DISPUTED: return 'Disputed'
      case MarketStatus.RESOLVED: return 'Resolved'
      case MarketStatus.CANCELLED: return 'Cancelled'
      case MarketStatus.DECLINED: return 'Declined'
      case MarketStatus.EXPIRED: return 'Expired'
      case MarketStatus.REFUNDED: return 'Refunded'
      case MarketStatus.DRAW: return 'Draw'
      case MarketStatus.ORACLE_TIMED_OUT: return 'Timed Out'
      default: return status
    }
  }

  const getTimeRemaining = (endTime) => {
    if (!endTime) return null
    const now = Date.now()
    let end
    if (typeof endTime === 'bigint') {
      end = Number(endTime) * 1000
    } else if (typeof endTime === 'number') {
      end = endTime > 1e12 ? endTime : endTime * 1000
    } else {
      end = new Date(endTime).getTime()
    }

    const diff = end - now
    if (diff <= 0) return 'Ended'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) return `${days}d ${hours}h`
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Action handlers
  const handleOpenResolution = (market) => {
    setResolutionMarket(market)
    setShowResolutionModal(true)
  }

  const handleMarketSelect = (market) => {
    setSelectedMarketId(market.id)
    // FR-004: viewing a wager's details clears its unread activity entries.
    markWagerRead?.(String(market.id))
  }

  // FR-004 carried to the card grid: expanding a card to preview a wager also
  // counts as viewing it, so clear its unread activity without opening detail.
  const handleMarketView = (market) => {
    markWagerRead?.(String(market.id))
  }

  const handleBackToList = () => {
    setSelectedMarketId(null)
  }

  // Check if market can be resolved (contract requires market.active == true, i.e. ACTIVE status)
  const canResolve = (market) => {
    if (!account) return false
    const status = market.computedStatus || MarketStatus.ACTIVE
    if (status !== MarketStatus.ACTIVE) return false

    const userAddr = account.toLowerCase()
    const isCreator = market.creator?.toLowerCase() === userAddr
    const isOpponent = market.participants?.length > 1 &&
      market.participants[1]?.toLowerCase() === userAddr
    const isArbitrator = market.arbitrator &&
      market.arbitrator !== ethers.ZeroAddress &&
      market.arbitrator.toLowerCase() === userAddr

    // Resolution authority depends on resolutionType
    const resType = market.resolutionType ?? 0
    if (resType === 0) return isCreator || isOpponent || isArbitrator // Either
    if (resType === 1) return isCreator // Initiator
    if (resType === 2) return isOpponent // Receiver
    if (resType === 3) return isArbitrator // ThirdParty
    return false
  }

  // Check if user can accept a pending friend market (is invited participant, not creator)
  const canAcceptMarket = useCallback((market) => {
    if (!account || market.marketType !== 'friend') return false
    const status = market.computedStatus || market.status
    if (status !== MarketStatus.PENDING_ACCEPTANCE) return false

    // User must be in participants list
    const isInvited = market.participants?.some(
      p => p.toLowerCase() === account.toLowerCase()
    )
    // User must NOT be the creator (creator has already accepted by creating)
    const isCreator = market.creator?.toLowerCase() === account.toLowerCase()
    // User must not have already accepted
    const hasAccepted = market.acceptances?.[account.toLowerCase()]?.hasAccepted

    return isInvited && !isCreator && !hasAccepted
  }, [account])

  // Check if user is creator of a pending market (shows "Under Consideration" status)
  const isCreatorOfPendingMarket = useCallback((market) => {
    if (!account || market.marketType !== 'friend') return false
    const status = market.computedStatus || market.status
    if (status !== MarketStatus.PENDING_ACCEPTANCE) return false

    return market.creator?.toLowerCase() === account.toLowerCase()
  }, [account])

  // Handle opening acceptance modal
  const handleOpenAcceptance = (market) => {
    // The wager's plaintext title once decryption (lazy hook) has run. We pass
    // this through so the acceptance modal can show what the wager is actually
    // about instead of the "Encrypted Wager" placeholder — the user already
    // decrypted it here in My Wagers, so re-prompting for a signature on the
    // acceptance screen would be redundant.
    const decryptedDescription =
      market.decryptedMetadata?.description ||
      market.decryptedMetadata?.name ||
      market.decryptedMetadata?.question ||
      null

    // The on-chain encrypted envelope, as a JSON string the modal can parse if
    // it still needs to decrypt itself (metadataCipher is the parsed object).
    const rawDescription = typeof market.metadataCipher === 'string'
      ? market.metadataCipher
      : market.metadataCipher
        ? JSON.stringify(market.metadataCipher)
        : undefined

    // Transform market data to match what MarketAcceptanceModal expects
    const marketData = {
      id: market.id,
      description: market.description || market.proposalTitle,
      // Encryption context — without these the modal falls back to the literal
      // "Encrypted Wager" string and gives the user no way to see the terms.
      isEncrypted: Boolean(market.isEncrypted),
      decryptedDescription,
      rawDescription,
      ipfsCid: market.ipfsCid || null,
      resolutionType: market.resolutionType,
      // Surface the wager's resolution/end date on the acceptance screen so the
      // counterparty can see when it settles (e.g. a linked Polymarket's date).
      estimatedMarketEndDate: market.endTime || (market.endDate ? new Date(market.endDate).getTime() : null),
      creator: market.creator,
      participants: market.participants || [],
      arbitrator: market.arbitrator || null,
      marketType: market.type || 'oneVsOne',
      // Headline party's odds for an Offer wager (200 = even money). Surfaced so
      // the acceptance modal shows the real payout instead of defaulting to 1v1.
      opponentOddsMultiplier: market.opponentOddsMultiplier || market.oddsMultiplier || WAGER_DEFAULTS.ODDS_MULTIPLIER,
      status: market.status,
      acceptanceDeadline: typeof market.acceptanceDeadline === 'number'
        ? market.acceptanceDeadline
        : market.acceptanceDeadline ? new Date(market.acceptanceDeadline).getTime() : null,
      minAcceptanceThreshold: market.minAcceptanceThreshold || WAGER_DEFAULTS.MIN_ACCEPTANCE_THRESHOLD,
      stakePerParticipant: market.stakeAmount,
      stakeToken: market.stakeTokenAddress || null,
      stakeTokenSymbol: market.stakeTokenSymbol || 'ETC',
      acceptances: market.acceptances || {},
      acceptedCount: market.acceptedCount || 0
    }
    setAcceptanceMarket(marketData)
    setShowAcceptanceModal(true)
  }

  const handleCloseAcceptance = () => {
    setShowAcceptanceModal(false)
    setAcceptanceMarket(null)
  }

  const handleMarketAccepted = () => {
    handleCloseAcceptance()
    // Refresh markets data
    fetchMarketsData()
  }

  // Clear an expired offer from the user's view. For the creator this also
  // calls claimRefund on-chain so the stake comes back; for an invited
  // opponent (no stake at risk) we just hide locally and let the creator
  // reclaim on their own.
  const handleClearExpired = useCallback(async (market) => {
    const userAddr = account?.toLowerCase()
    const isCreator = userAddr && market.creator?.toLowerCase() === userAddr

    if (isCreator && signer) {
      try {
        if (!isCorrectNetwork) {
          try { await switchNetwork() } catch { /* user declined */ }
        }
        const registry = new ethers.Contract(
          getContractAddressForChain('wagerRegistry', chainId),
          WAGER_REGISTRY_ABI,
          signer
        )
        const tx = await registry.claimRefund(market.wagerId ?? market.id)
        await tx.wait()
      } catch (err) {
        const reason = err?.reason || err?.shortMessage || err?.message || ''
        const userRejected = err?.code === 'ACTION_REJECTED' ||
          err?.code === 4001 || reason.toLowerCase().includes('user rejected')
        if (userRejected) return // leave row visible so they can retry
        // Anything else (e.g. NotRefundable because the chain advanced state)
        // we still dismiss locally — the user's intent is clear.
        console.warn('[MyMarkets] claimRefund failed, dismissing locally:', err)
      }
    }

    dismissMarket(market.id)
  }, [account, signer, isCorrectNetwork, switchNetwork, dismissMarket, chainId])

  const handleClearAllExpired = useCallback((markets) => {
    dismissMarkets(markets.map(m => m.id))
  }, [dismissMarkets])

  // Winner pulls their payout. The contract escrows both stakes and pays the
  // winner via claimPayout (pull, not push), so resolving a wager isn't the
  // end of the flow — the winner still has to claim. This is the action behind
  // the green "Claim" badge in the list and the "Claim Winnings" button in the
  // detail view. claimingId/claimError are keyed by wager id so a single
  // in-flight claim and its error map back to the right row.
  const [claimingId, setClaimingId] = useState(null)
  const [claimError, setClaimError] = useState(null)

  const handleClaimPayout = useCallback(async (market) => {
    if (!signer) return
    const id = String(market.id)

    if (!isCorrectNetwork) {
      try {
        await switchNetwork()
      } catch {
        setClaimError({ id, message: 'Please switch to the correct network.' })
        return
      }
    }

    setClaimingId(id)
    setClaimError(null)

    try {
      const registry = new ethers.Contract(
        getContractAddressForChain('wagerRegistry', chainId),
        WAGER_REGISTRY_ABI,
        signer
      )
      const tx = await registry.claimPayout(market.wagerId ?? market.id)
      await tx.wait()
      // Pull fresh on-chain data so the claimed wager flips to paid (which
      // hides the Claim affordances) and clear its unread activity.
      markWagerRead?.(id)
      fireToast('Winnings claimed 🎉')
      await refreshFriendMarkets?.()
    } catch (err) {
      const reason = err?.reason || err?.shortMessage || err?.data?.message || err?.message || ''
      const lower = reason.toLowerCase()
      let message
      if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 || lower.includes('user rejected')) {
        message = 'Transaction was cancelled in your wallet.'
      } else if (lower.includes('alreadypaid') || lower.includes('already paid') || lower.includes('already claimed')) {
        message = 'This payout has already been claimed.'
      } else if (lower.includes('notwinner') || lower.includes('not winner')) {
        message = 'Only the winning side can claim this payout.'
      } else if (lower.includes('notresolved') || lower.includes('not resolved')) {
        message = 'This wager has not been resolved yet.'
      } else {
        message = 'Failed to claim winnings. Please try again.'
      }
      setClaimError({ id, message })
    } finally {
      setClaimingId(null)
    }
  }, [signer, isCorrectNetwork, switchNetwork, chainId, markWagerRead, refreshFriendMarkets, fireToast])

  // Participant reclaims their stake on a wager that ran past its resolution
  // window without a winner being declared (the "refundable" state). Mirrors
  // handleClaimPayout: a pull call (claimRefund) keyed by wager id so the
  // in-flight spinner and any error map back to the right row. This backs the
  // "Refund" list button (refundable case) — the expired pre-acceptance case is
  // handled separately by handleClearExpired's "Reclaim & Clear".
  const [refundingId, setRefundingId] = useState(null)
  const [refundError, setRefundError] = useState(null)

  const handleClaimRefund = useCallback(async (market) => {
    if (!signer) return
    const id = String(market.id)

    if (!isCorrectNetwork) {
      try {
        await switchNetwork()
      } catch {
        setRefundError({ id, message: 'Please switch to the correct network.' })
        return
      }
    }

    setRefundingId(id)
    setRefundError(null)

    try {
      const registry = new ethers.Contract(
        getContractAddressForChain('wagerRegistry', chainId),
        WAGER_REGISTRY_ABI,
        signer
      )
      const tx = await registry.claimRefund(market.wagerId ?? market.id)
      await tx.wait()
      // Pull fresh on-chain data so the refunded wager leaves the list and clear
      // its unread activity.
      markWagerRead?.(id)
      fireToast('Refund claimed')
      await refreshFriendMarkets?.()
    } catch (err) {
      const reason = err?.reason || err?.shortMessage || err?.data?.message || err?.message || ''
      const lower = reason.toLowerCase()
      let message
      if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 || lower.includes('user rejected')) {
        message = 'Transaction was cancelled in your wallet.'
      } else if (lower.includes('alreadyrefunded') || lower.includes('already refunded')) {
        message = 'This wager has already been refunded.'
      } else if (lower.includes('notrefundable') || lower.includes('not refundable')) {
        message = 'Not refundable yet — the resolution window may still be open. Try resolving instead.'
      } else {
        message = 'Failed to claim refund. Please try again.'
      }
      setRefundError({ id, message })
    } finally {
      setRefundingId(null)
    }
  }, [signer, isCorrectNetwork, switchNetwork, chainId, markWagerRead, refreshFriendMarkets, fireToast])

  if (!isOpen) return null

  return (
    <div
      className="my-markets-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-markets-modal-title"
    >
      <div className="my-markets-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="mm-header">
          <div className="mm-header-content">
            <div className="mm-brand">
              <span className="mm-brand-icon">&#128202;</span>
              <h2 id="my-markets-modal-title">My Wagers</h2>
              {activeNetwork && (
                <span
                  className={`mm-network-tag${activeNetwork.isTestnet ? ' mm-network-tag-testnet' : ''}`}
                  title={`Showing wagers on ${activeNetwork.name}`}
                >
                  {activeNetwork.name}
                </span>
              )}
            </div>
            <p className="mm-subtitle">
              Manage your wagers and positions on {activeNetwork?.name || 'the current network'}
            </p>
          </div>
          <button
            className="mm-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            {/* Two separate <line>s with the stroke on the <svg> (matching the
                tab icons that render reliably). The previous single multi-moveto
                <path> rendered blank on mobile, leaving an empty square. */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="mm-tabs" role="tablist">
          <button
            className={`mm-tab ${activeTab === 'participating' ? 'active' : ''}`}
            onClick={() => { setActiveTab('participating'); setSelectedMarketId(null) }}
            role="tab"
            aria-selected={activeTab === 'participating'}
            aria-label="Participating — wagers others sent you (inbound)"
            title="Participating — wagers others sent you (inbound)"
          >
            {/* Inbound: a wager that came TO you — arrow pointing down into a tray. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Participating</span>
            <span className="mm-tab-count">{categorizedMarkets.participating.length}</span>
          </button>
          <button
            className={`mm-tab ${activeTab === 'created' ? 'active' : ''}`}
            onClick={() => { setActiveTab('created'); setSelectedMarketId(null) }}
            role="tab"
            aria-selected={activeTab === 'created'}
            aria-label="Created — wagers you sent out (outbound)"
            title="Created — wagers you sent out (outbound)"
          >
            {/* Outbound: a wager you sent OUT — arrow pointing up out of a tray. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Created</span>
            <span className="mm-tab-count">{categorizedMarkets.created.length}</span>
          </button>
          {categorizedMarkets.arbitrating.length > 0 && (
            <button
              className={`mm-tab ${activeTab === 'arbitrating' ? 'active' : ''}`}
              onClick={() => { setActiveTab('arbitrating'); setSelectedMarketId(null) }}
              role="tab"
              aria-selected={activeTab === 'arbitrating'}
              aria-label="Arbitrating — wagers you resolve as the neutral arbitrator"
              title="Arbitrating — wagers you resolve as the neutral arbitrator"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v18M5 7h14M5 7l-3 6a4 4 0 008 0L5 7zM19 7l-3 6a4 4 0 008 0l-5-6z"/>
              </svg>
              <span>Arbitrating</span>
              <span className="mm-tab-count">{categorizedMarkets.arbitrating.length}</span>
            </button>
          )}
          <button
            className={`mm-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); setSelectedMarketId(null) }}
            role="tab"
            aria-selected={activeTab === 'history'}
            aria-label="History — resolved and settled wagers"
            title="History — resolved and settled wagers"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>History</span>
            <span className="mm-tab-count">{categorizedMarkets.history.length}</span>
          </button>
        </nav>

        {/* Filter Bar */}
        <div className="mm-filter-bar">
          <div className="mm-filter-group">
            <label htmlFor="mm-sort-select">Sort:</label>
            <select
              id="mm-sort-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="mm-filter-select"
            >
              <option value="newest">Newest</option>
              <option value="endingSoon">Ending soonest</option>
              <option value="stakeHighToLow">Highest stake</option>
            </select>
          </div>
          <div className="mm-filter-group">
            <label htmlFor="mm-status-select">Status:</label>
            <select
              id="mm-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mm-filter-select"
            >
              <option value="all">All Status</option>
              <option value={MarketStatus.PENDING_ACCEPTANCE}>Pending Acceptance</option>
              <option value={MarketStatus.ACTIVE}>Active</option>
              <option value={MarketStatus.PENDING_RESOLUTION}>Pending Resolution</option>
              <option value={MarketStatus.DISPUTED}>Disputed</option>
              <option value={MarketStatus.RESOLVED}>Resolved</option>
              <option value={MarketStatus.EXPIRED}>Expired</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div className="mm-content">
          {!isConnected ? (
            <div className="mm-empty-state">
              <div className="mm-empty-icon">&#128274;</div>
              <h3>Connect Your Wallet</h3>
              <p>Please connect your wallet to view your wagers.</p>
            </div>
          ) : loading ? (
            <div className="mm-loading">
              <div className="mm-spinner"></div>
              <p>Loading your wagers...</p>
            </div>
          ) : error ? (
            <div className="mm-error-state">
              <div className="mm-error-icon">&#9888;</div>
              <p>{error}</p>
              <button className="mm-btn-primary" onClick={fetchMarketsData}>
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Participating Tab */}
              {activeTab === 'participating' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      canResolve={canResolve}
                      onOpenResolution={handleOpenResolution}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting(selectedMarket?.id)}
                      signer={signer}
                      isCorrectNetwork={isCorrectNetwork}
                      switchNetwork={switchNetwork}
                      onClaimPayout={handleClaimPayout}
                      claimingId={claimingId}
                      claimError={claimError}
                      onRefunded={() => {
                        setSelectedMarketId(null)
                        fetchMarketsData?.()
                      }}
                    />
                  ) : categorizedMarkets.participating.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128200;</div>
                      <h3>No Active Positions</h3>
                      <p>You don&apos;t have any active wagers.</p>
                      <p className="mm-hint">Create or accept a wager to see them here.</p>
                    </div>
                  ) : (
                    <WagerList
                      viewMode={viewMode}
                      density={density}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting}
                      onView={handleMarketView}
                      markets={categorizedMarkets.participating}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      showActions={false}
                      canAccept={canAcceptMarket}
                      isCreatorOfPending={isCreatorOfPendingMarket}
                      onAccept={handleOpenAcceptance}
                      account={account}
                      onClearExpired={handleClearExpired}
                      onClearAllExpired={handleClearAllExpired}
                      statusFilter={statusFilter}
                      showResolveCountdown
                      onResolve={handleOpenResolution}
                      onClaim={handleClaimPayout}
                      claimingId={claimingId}
                      claimError={claimError}
                      onRefund={handleClaimRefund}
                      refundingId={refundingId}
                      refundError={refundError}
                    />
                  )}
                </div>
              )}

              {/* Created Tab */}
              {activeTab === 'created' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      canResolve={canResolve}
                      onOpenResolution={handleOpenResolution}
                      isCreatorView
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting(selectedMarket?.id)}
                      signer={signer}
                      isCorrectNetwork={isCorrectNetwork}
                      switchNetwork={switchNetwork}
                      onWithdraw={() => {
                        setSelectedMarketId(null)
                        fetchMarketsData?.()
                      }}
                      onRefunded={() => {
                        setSelectedMarketId(null)
                        fetchMarketsData?.()
                      }}
                    />
                  ) : categorizedMarkets.created.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128203;</div>
                      <h3>No Wagers Created</h3>
                      <p>You haven&apos;t created any wagers yet.</p>
                      <p className="mm-hint">Use the quick actions on the dashboard to create your first wager.</p>
                    </div>
                  ) : (
                    <WagerList
                      viewMode={viewMode}
                      density={density}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting}
                      onView={handleMarketView}
                      markets={categorizedMarkets.created}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      canResolve={canResolve}
                      isCreatorOfPending={isCreatorOfPendingMarket}
                      onResolve={handleOpenResolution}
                      showActions
                      account={account}
                      showResolveCountdown
                      onClearExpired={handleClearExpired}
                      onClearAllExpired={handleClearAllExpired}
                      statusFilter={statusFilter}
                      onRefund={handleClaimRefund}
                      refundingId={refundingId}
                      refundError={refundError}
                    />
                  )}
                </div>
              )}

              {/* Arbitrating Tab — wagers the connected wallet resolves as the neutral arbitrator */}
              {activeTab === 'arbitrating' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      canResolve={canResolve}
                      onOpenResolution={handleOpenResolution}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting(selectedMarket?.id)}
                      signer={signer}
                      isCorrectNetwork={isCorrectNetwork}
                      switchNetwork={switchNetwork}
                    />
                  ) : categorizedMarkets.arbitrating.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#9878;</div>
                      <h3>Nothing to Arbitrate</h3>
                      <p>You aren&apos;t the arbitrator on any active wagers.</p>
                      <p className="mm-hint">When someone names you as the neutral resolver, those wagers appear here.</p>
                    </div>
                  ) : (
                    <WagerList
                      viewMode={viewMode}
                      density={density}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting}
                      onView={handleMarketView}
                      markets={categorizedMarkets.arbitrating}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      canResolve={canResolve}
                      onResolve={handleOpenResolution}
                      showActions
                      account={account}
                      showResolveCountdown
                      statusFilter={statusFilter}
                    />
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div role="tabpanel" className="mm-panel">
                  {selectedMarket ? (
                    <MarketDetailView
                      market={selectedMarket}
                      onBack={handleBackToList}
                      formatDate={formatDate}
                      formatAddress={formatAddress}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      account={account}
                      userPositions={userPositions}
                      isHistoryView
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting(selectedMarket?.id)}
                      onClaimPayout={handleClaimPayout}
                      claimingId={claimingId}
                      claimError={claimError}
                    />
                  ) : categorizedMarkets.history.length === 0 ? (
                    <div className="mm-empty-state">
                      <div className="mm-empty-icon">&#128214;</div>
                      <h3>No Wager History</h3>
                      <p>Your resolved wagers will appear here.</p>
                    </div>
                  ) : (
                    <WagerList
                      viewMode={viewMode}
                      density={density}
                      onDecrypt={handleDecryptMarket}
                      isDecrypting={isMarketDecrypting}
                      onView={handleMarketView}
                      markets={categorizedMarkets.history}
                      onSelect={handleMarketSelect}
                      formatDate={formatDate}
                      getStatusClass={getStatusClass}
                      getStatusLabel={getStatusLabel}
                      getTimeRemaining={getTimeRemaining}
                      showOutcome
                      account={account}
                      onClaim={handleClaimPayout}
                      claimingId={claimingId}
                      claimError={claimError}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Resolution Modal */}
      {showResolutionModal && resolutionMarket && (
        <ResolutionModal
          market={resolutionMarket}
          account={account}
          onClose={() => setShowResolutionModal(false)}
          onResolved={() => {
            setShowResolutionModal(false)
            fetchMarketsData()
          }}
          signer={signer}
          isCorrectNetwork={isCorrectNetwork}
          switchNetwork={switchNetwork}
        />
      )}

      {/* Market Acceptance Modal (for friend markets) */}
      {showAcceptanceModal && acceptanceMarket && (
        <MarketAcceptanceModal
          isOpen={showAcceptanceModal}
          onClose={handleCloseAcceptance}
          marketId={acceptanceMarket.id}
          marketData={acceptanceMarket}
          onAccepted={handleMarketAccepted}
          contractAddress={getContractAddressForChain('wagerRegistry', chainId)}
          contractABI={WAGER_REGISTRY_ABI}
        />
      )}

      {/* Confirmation toast (spec 017 FR-015) */}
      {toast && (
        <div className="mm-toast" role="status" aria-live="polite">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#36B37E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}


/**
 * Market Detail View Component
 */
function MarketDetailView({
  market,
  onBack,
  formatDate,
  formatAddress,
  getStatusClass,
  getStatusLabel,
  getTimeRemaining,
  account,
  onDecrypt,
  isDecrypting,
  userPositions,
  canResolve: _canResolve,
  onOpenResolution,
  isCreatorView = false,
  isHistoryView = false,
  signer,
  isCorrectNetwork,
  switchNetwork,
  onWithdraw,
  onRefunded,
  onClaimPayout,
  claimingId,
  claimError
}) {
  const isCreator = market.creator?.toLowerCase() === account?.toLowerCase()
  // Winner can pull their escrowed payout while the wager is resolved-unpaid.
  const showClaimButton =
    typeof onClaimPayout === 'function' && isWinnerUnpaid(market, account)
  const isClaiming = claimingId === String(market.id)
  const position = userPositions?.find(p => String(p.marketId) === String(market.id))
  // For un-accepted offers, the relevant deadline is the *acceptance*
  // deadline, not the trading/resolve window — the latter is what made
  // expired offers show "tomorrow" in the list/detail view.
  const isPendingLike =
    market.computedStatus === MarketStatus.PENDING_ACCEPTANCE ||
    market.computedStatus === MarketStatus.EXPIRED
  const endTime = isPendingLike && market.acceptanceDeadline
    ? market.acceptanceDeadline
    : (market.tradingEndTime || market.endDate)
  const isExpired = market.computedStatus === MarketStatus.EXPIRED
  const endLabel = isHistoryView
    ? 'Ended'
    : isPendingLike
      ? 'Accept by'
      : 'Ends'
  const remainingDisplay = isExpired ? 'Expired' : getTimeRemaining(endTime)

  // Active chain id so explorer links resolve to the right network
  // (Polygon mainnet vs Amoy testnet) instead of a hardcoded testnet URL.
  const { chainId } = useWeb3()

  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState(null)
  const [withdrawSuccess, setWithdrawSuccess] = useState(false)
  const [withdrawTxHash, setWithdrawTxHash] = useState(null)

  const handleWithdraw = async () => {
    if (!signer) return

    if (!isCorrectNetwork) {
      try {
        await switchNetwork()
      } catch {
        setWithdrawError('Please switch to the correct network')
        return
      }
    }

    setWithdrawing(true)
    setWithdrawError(null)

    try {
      const contract = new ethers.Contract(
        getContractAddressForChain('wagerRegistry', chainId),
        WAGER_REGISTRY_ABI,
        signer
      )
      const tx = await contract.cancelOpen(market.wagerId ?? market.id)
      setWithdrawTxHash(tx.hash)
      await tx.wait()
      setWithdrawSuccess(true)
      onWithdraw?.(market)
    } catch (err) {
      const reason = err?.reason || err?.data?.message || err?.message || ''
      if (reason.includes('user rejected') || reason.includes('ACTION_REJECTED')) {
        setWithdrawError('Transaction was cancelled in your wallet.')
      } else if (reason.includes('NotOpen')) {
        setWithdrawError('This wager is no longer open.')
      } else if (reason.includes('NotCreator')) {
        setWithdrawError('Only the creator can withdraw this offer.')
      } else {
        setWithdrawError('Failed to withdraw the offer. Please try again.')
      }
    } finally {
      setWithdrawing(false)
    }
  }

  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState(null)
  const [refundSuccess, setRefundSuccess] = useState(false)
  const [refundTxHash, setRefundTxHash] = useState(null)

  const status = market.computedStatus || market.status
  const isParticipant = market.participants?.some(
    p => p.toLowerCase() === account?.toLowerCase()
  )
  const showRefundButton = isParticipant && signer &&
    status === MarketStatus.PENDING_RESOLUTION && !refundSuccess

  const handleClaimRefund = async () => {
    if (!signer) return

    if (!isCorrectNetwork) {
      try {
        await switchNetwork()
      } catch {
        setRefundError('Please switch to the correct network')
        return
      }
    }

    setRefunding(true)
    setRefundError(null)

    try {
      const registry = new ethers.Contract(
        getContractAddressForChain('wagerRegistry', chainId),
        WAGER_REGISTRY_ABI,
        signer
      )
      const tx = await registry.claimRefund(market.wagerId ?? market.id)
      setRefundTxHash(tx.hash)
      await tx.wait()
      setRefundSuccess(true)
      onRefunded?.(market)
    } catch (err) {
      const reason = err?.reason || err?.shortMessage || err?.message || ''
      if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 ||
          reason.toLowerCase().includes('user rejected')) {
        setRefundError('Transaction was cancelled in your wallet.')
      } else if (reason.includes('NotRefundable')) {
        setRefundError('This wager is not yet refundable. The resolution window may still be open — try resolving instead.')
      } else {
        setRefundError(reason || 'Failed to claim refund. Please try again.')
      }
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="mm-detail">
      <button type="button" className="mm-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to list
      </button>

      <div className="mm-detail-header">
        <div className="mm-detail-title-row">
          <h3>
            {market.isPrivate && (
              <svg
                className="mm-privacy-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                title="Private wager"
                style={{ marginRight: '8px', verticalAlign: 'middle', opacity: 0.7 }}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            )}
            {getMarketDisplayTitle(market)}
          </h3>
          <span className={`mm-status-badge ${getStatusClass(market.computedStatus)}`}>
            {getStatusLabel(market.computedStatus)}
          </span>
        </div>
        <div className="mm-detail-meta">
          <span className={`mm-type-badge mm-type-${market.type === 'offer' ? 'offer' : market.marketType}`}>
            {market.type === 'offer'
              ? `Offer${market.oddsMultiplier ? ` · ${market.oddsMultiplier / 100}x` : ''}`
              : market.marketType === 'friend' ? 'Friend Wager' : 'Wager'}
          </span>
          {market.category && <span className="mm-category-tag">{market.category}</span>}
        </div>
      </div>

      {/* Encrypted wager: decrypt prompt, in-progress, or (FR-010) terms-unavailable.
          A decrypt/fetch failure shows a clear state with a retry — and crucially
          does NOT hide the resolve/withdraw/refund action row below, which needs no
          plaintext (resolution is on-chain by winner address). */}
      {market.isEncrypted && !market.decryptedMetadata && (
        <div className="mm-detail-description">
          {isDecrypting ? (
            <p style={{ opacity: 0.7 }}>Decrypting...</p>
          ) : (market.decryptionError || market.ipfsEnvelopeError) ? (
            <div className="mm-decrypt-error" role="alert">
              <p className="mm-decrypt-error-message">
                Terms unavailable — {market.ipfsEnvelopeError
                  ? 'the encrypted terms could not be retrieved.'
                  : market.decryptionError}
              </p>
              <button
                type="button"
                className="mm-btn-primary"
                onClick={() => onDecrypt?.(market.id)}
                style={{ marginTop: '8px' }}
              >
                Try again
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mm-btn-primary"
              onClick={() => onDecrypt?.(market.id)}
              style={{ marginTop: '8px' }}
            >
              Decrypt Wager Details
            </button>
          )}
        </div>
      )}

      {/* Show description if available and not a placeholder */}
      {market.description &&
       market.description !== 'Encrypted Market' &&
       market.description !== 'Encrypted Wager' &&
       market.description !== 'Private Market' &&
       market.description !== 'Private Wager' &&
       !market.isEncrypted && (
        <div className="mm-detail-description">
          <p>{market.description}</p>
        </div>
      )}

      <div className="mm-detail-grid">
        <div className="mm-detail-item">
          <span className="mm-detail-label">Wager ID</span>
          <span className="mm-detail-value">#{market.id}</span>
        </div>
        <div className="mm-detail-item">
          <span className="mm-detail-label">Creator</span>
          <span className="mm-detail-value">
            {formatAddress(market.creator)}
            {isCreator && <span className="mm-you-tag">You</span>}
          </span>
        </div>
        <div className="mm-detail-item">
          <span className="mm-detail-label">{endLabel}</span>
          <span className="mm-detail-value">{formatDate(endTime)}</span>
        </div>
        {!isHistoryView && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">{isExpired ? 'Status' : 'Time Remaining'}</span>
            <span className={`mm-detail-value mm-time-remaining${isExpired ? ' mm-time-expired' : ''}`}>{remainingDisplay}</span>
          </div>
        )}
        {market.totalLiquidity && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">Liquidity</span>
            <span className="mm-detail-value">${parseFloat(market.totalLiquidity).toLocaleString()}</span>
          </div>
        )}
        {market.volume24h && (
          <div className="mm-detail-item">
            <span className="mm-detail-label">24h Volume</span>
            <span className="mm-detail-value">${parseFloat(market.volume24h).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* User Position */}
      {position && (
        <div className="mm-position-section">
          <h4>Your Position</h4>
          <div className="mm-position-card">
            <div className="mm-position-item">
              <span className="mm-position-label">Side</span>
              <span className={`mm-position-value ${position.side === 'Pass' || position.side === 'Yes' ? 'positive' : 'negative'}`}>
                {position.side}
              </span>
            </div>
            <div className="mm-position-item">
              <span className="mm-position-label">Amount</span>
              <span className="mm-position-value">{position.amount}</span>
            </div>
            {position.pnl !== undefined && (
              <div className="mm-position-item">
                <span className="mm-position-label">P&L</span>
                <span className={`mm-position-value ${parseFloat(position.pnl) >= 0 ? 'positive' : 'negative'}`}>
                  {parseFloat(position.pnl) >= 0 ? '+' : ''}{position.pnl}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outcome for resolved markets */}
      {isHistoryView && market.outcome && (
        <div className="mm-outcome-section">
          <h4>Wager Outcome</h4>
          <div className={`mm-outcome-display ${market.outcome === 'Pass' || market.outcome === 'Yes' ? 'positive' : 'negative'}`}>
            {market.outcome}
          </div>
          {position && (
            <div className="mm-outcome-result">
              {position.side === market.outcome ? (
                <span className="mm-result-win">You won this wager!</span>
              ) : (
                <span className="mm-result-loss">Better luck next time</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dispute Info */}
      {market.computedStatus === 'disputed' && market.dispute && (
        <div className="mm-dispute-info">
          <h4>Active Dispute</h4>
          <div className="mm-dispute-card">
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Disputed By</span>
              <span className="mm-dispute-value">{formatAddress(market.dispute.disputedBy)}</span>
            </div>
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Reason</span>
              <span className="mm-dispute-value">{market.dispute.reason}</span>
            </div>
            <div className="mm-dispute-item">
              <span className="mm-dispute-label">Status</span>
              <span className="mm-dispute-value">{market.dispute.status}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mm-detail-actions">
        {showClaimButton && (
          <div className="mm-claim-section">
            <button
              type="button"
              className="mm-btn-primary mm-btn-claim"
              onClick={() => onClaimPayout(market)}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <>
                  <span className="mm-spinner-small"></span>
                  Claiming Winnings...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1v22"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                  Claim Winnings
                </>
              )}
            </button>
            <p className="mm-claim-hint">
              You won this wager. Claim to transfer the combined stakes to your wallet.
            </p>
            {claimError?.id === String(market.id) && (
              <p className="mm-withdraw-error" role="alert">{claimError.message}</p>
            )}
          </div>
        )}
        {isCreatorView && isCreator && (market.computedStatus || market.status) === MarketStatus.PENDING_ACCEPTANCE && !withdrawSuccess && (
          <div className="mm-withdraw-section">
            <button
              type="button"
              className="mm-btn-danger"
              onClick={handleWithdraw}
              disabled={withdrawing}
            >
              {withdrawing ? (
                <>
                  <span className="mm-spinner-small"></span>
                  Withdrawing...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                  </svg>
                  Withdraw Offer
                </>
              )}
            </button>
            {withdrawError && (
              <p className="mm-withdraw-error">{withdrawError}</p>
            )}
          </div>
        )}
        {withdrawSuccess && (
          <div className="mm-withdraw-success">
            <span className="mm-withdraw-success-icon">&#10003;</span>
            <p>Offer withdrawn. Your funds have been returned.</p>
            {withdrawTxHash && (
              <a
                href={getTransactionUrl(chainId, withdrawTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mm-tx-link"
              >
                View Transaction
              </a>
            )}
          </div>
        )}
        {onOpenResolution && (
          <ResolveButtonWithCountdown
            market={market}
            onResolve={onOpenResolution}
            account={account}
            variant="full"
          />
        )}
        {refundSuccess && (
          <div className="mm-withdraw-success">
            <span className="mm-withdraw-success-icon">&#10003;</span>
            <p>Refund claimed successfully. Stakes have been returned to both participants.</p>
            {refundTxHash && (
              <a
                href={getTransactionUrl(chainId, refundTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mm-tx-link"
              >
                View Transaction
              </a>
            )}
          </div>
        )}
        {showRefundButton && (
          <div className="mm-refund-section">
            <button
              type="button"
              className="mm-btn-secondary"
              onClick={handleClaimRefund}
              disabled={refunding}
            >
              {refunding ? (
                <>
                  <span className="mm-spinner-small"></span>
                  Claiming Refund...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                  </svg>
                  Claim Refund
                </>
              )}
            </button>
            <p className="mm-refund-hint">
              If the resolution window has expired without a winner declared, both participants can reclaim their stakes.
            </p>
            {refundError && (
              <p className="mm-withdraw-error">{refundError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Resolution Modal Component
 */
function ResolutionModal({
  market,
  account,
  onClose,
  onResolved,
  signer,
  isCorrectNetwork,
  switchNetwork
}) {
  const [selectedOutcome, setSelectedOutcome] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [step, setStep] = useState('select') // 'select', 'confirm', 'success'
  // For a draw on a participant wager, the first call only PROPOSES (awaiting the
  // counterparty); the second SETTLES. Detected from the WagerDrawn event below.
  const [drawSettled, setDrawSettled] = useState(false)
  // Chain-aware explorer link for the payout receipt (avoids a hardcoded testnet host).
  const { chainId } = useWeb3()

  // Canonical outcome keys preserve the on-chain mapping:
  //   outcomes[0] => creator wins, outcomes[1] => opponent wins.
  const outcomes = market.marketType === 'friend'
    ? ['Pass', 'Fail']
    : ['Yes', 'No']

  // Participant-anchored display labels so the resolver clearly sees which party each
  // choice pays out, instead of an ambiguous "Pass/Fail" (Bug #2).
  const fmtParty = (addr) => {
    if (!addr) return 'Unknown'
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`
    const isYou = account && addr.toLowerCase() === account.toLowerCase()
    return isYou ? `${short} (You)` : short
  }
  const outcomeLabels = {
    [outcomes[0]]: { title: 'Creator wins', who: fmtParty(market.creator) },
    [outcomes[1]]: { title: 'Opponent wins', who: fmtParty(market.opponent) },
  }
  const labelFor = (outcome) => {
    if (outcome === DRAW) return 'Draw — both parties refunded'
    const meta = outcomeLabels[outcome]
    return meta ? `${meta.title} — ${meta.who}` : outcome
  }

  // Resolution authority (mirrors the contract). A winner declaration is
  // gated by resolutionType; a DRAW additionally requires both participants to
  // agree for participant types (Either/Creator/Opponent) and is arbitrator-only
  // for ThirdParty. Oracle types are never manually drawn here.
  const DRAW = 'Draw'
  const userAddr = account?.toLowerCase()
  const isCreator = market.creator?.toLowerCase() === userAddr
  const isOpponent = market.participants?.length > 1 &&
    market.participants[1]?.toLowerCase() === userAddr
  const isArbitrator = market.arbitrator &&
    market.arbitrator !== ethers.ZeroAddress &&
    market.arbitrator.toLowerCase() === userAddr
  const resType = market.resolutionType ?? 0
  const isOracleType = resType >= 4 // Polymarket(4), Chainlink(5,6), UMA(7)
  const canDeclareWinner = (() => {
    if (resType === 0) return isCreator || isOpponent || isArbitrator
    if (resType === 1) return isCreator
    if (resType === 2) return isOpponent
    if (resType === 3) return isArbitrator
    return false
  })()
  const canDraw = !isOracleType && (
    ((resType === 0 || resType === 1 || resType === 2) && (isCreator || isOpponent)) ||
    (resType === 3 && isArbitrator)
  )
  const isDrawSelected = selectedOutcome === DRAW

  const handleSubmit = async () => {
    if (!selectedOutcome) {
      setError('Please select an outcome')
      return
    }

    if (!isCorrectNetwork) {
      setError('Please switch to the correct network')
      return
    }

    if (!signer) {
      setError('Please connect your wallet to resolve this wager.')
      return
    }

    // Resolve-window guard (Bug #1): block resolution before the wager's end time `E`.
    if (typeof market.tradingEndTime === 'number' && Date.now() < market.tradingEndTime) {
      setError('This wager cannot be resolved yet. Resolution opens after the wager’s end time.')
      return
    }

    setSubmitting(true)
    setError(null)

    const registryAddress = getContractAddressForChain('wagerRegistry', chainId)
    const registry = new ethers.Contract(
      registryAddress,
      WAGER_REGISTRY_ABI,
      signer
    )

    try {
      const feeOverrides = await getFeeOverrides(signer.provider)

      // Draw: returns each party their own stake. For participant types the
      // first call only proposes (awaiting the counterparty); the second settles.
      if (isDrawSelected) {
        const tx = await registry.declareDraw(market.id, feeOverrides)
        setTxHash(tx.hash)
        const receipt = await tx.wait()
        if (receipt && receipt.status === 0) {
          throw new Error('Transaction reverted on-chain. Draw failed.')
        }
        if (!receipt) {
          throw new Error('Transaction was dropped or replaced. Please try again.')
        }
        // A WagerDrawn event means the draw settled now; otherwise it's a pending
        // proposal awaiting the counterparty's confirmation.
        const settled = receipt.logs.some((l) => {
          try { return registry.interface.parseLog(l)?.name === 'WagerDrawn' } catch { return false }
        })
        setDrawSettled(settled)
        setStep('success')
        return
      }

      // outcome: true = first option wins (Pass/Yes/creator), false = second option (Fail/No/opponent)
      const outcomeBool = selectedOutcome === outcomes[0]

      const w = await registry.getWager(market.id)
      const winner = outcomeBool ? w.creator : w.opponent
      console.log('Resolving wager on-chain:', {
        marketId: market.id,
        winner,
        outcome: outcomeBool,
        selectedOutcome,
        notes: resolutionNotes,
      })

      const tx = await registry.declareWinner(market.id, winner, feeOverrides)
      setTxHash(tx.hash)

      const receipt = await tx.wait()

      if (receipt && receipt.status === 0) {
        throw new Error('Transaction reverted on-chain. Resolution failed.')
      }
      if (!receipt) {
        throw new Error('Transaction was dropped or replaced. Please try again.')
      }

      console.log('Market resolution proposed:', receipt)
      setStep('success')
    } catch (err) {
      console.error('Error resolving market:', err)

      const errStr = [err.reason, err.shortMessage, err.message, err.data?.message].filter(Boolean).join(' ')
      let errorData = err.data
      if (!errorData && err.error?.data) errorData = err.error.data
      if (typeof errorData === 'string' && errorData.length >= 10) {
        try {
          const decoded = registry.interface.parseError(errorData)
          if (decoded?.name) {
            const decodedName = decoded.name
            if (decodedName === 'ResolveExpired') {
              setError('The resolution deadline has passed. This wager can no longer be resolved and may be eligible for a refund.')
            } else if (decodedName === 'NotActive') {
              setError('This wager is not active. It may have already been resolved or is still pending acceptance.')
            } else if (decodedName === 'NotAuthorized') {
              setError('You are not authorized to resolve this wager based on its resolution type.')
            } else if (decodedName === 'NotParticipant') {
              setError('Only the two participants can settle this wager as a draw.')
            } else if (decodedName === 'DrawNotApplicable') {
              setError('This wager resolves from an oracle, so it cannot be settled as a draw manually.')
            } else if (decodedName === 'NoDrawProposal') {
              setError('There is no draw proposal of yours to withdraw.')
            } else {
              setError(`Contract rejected the transaction: ${decodedName}`)
            }
            return
          }
        } catch { /* couldn't decode, fall through */ }
      }

      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setError('Transaction was rejected in your wallet.')
      } else if (errStr.includes('NotActive')) {
        setError('This wager is not active. It may have already been resolved or is still pending acceptance.')
      } else if (errStr.includes('NotAuthorized')) {
        setError('You are not authorized to resolve this wager based on its resolution type.')
      } else if (errStr.includes('ResolveExpired')) {
        setError('The resolution deadline has passed. This wager can no longer be resolved and may be eligible for a refund.')
      } else if (errStr.includes('unknown custom error') || errStr.includes('execution reverted')) {
        setError('Transaction failed. The resolution deadline may have passed, or the wager is no longer active. Check the wager status and try claiming a refund instead.')
      } else {
        setError(err.reason || err.shortMessage || err.message || 'Failed to resolve wager. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose()
    }
  }

  return (
    <div className="mm-sub-modal-backdrop" onClick={handleBackdropClick}>
      <div className="mm-sub-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mm-sub-modal-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Resolve Wager
          </h3>
          <button
            className="mm-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="mm-sub-modal-content">
          {step === 'select' && (
            <>
              <div className="mm-resolution-market-info">
                <h4>{getMarketDisplayTitle(market)}</h4>
                <p className="mm-resolution-hint">
                  {canDeclareWinner
                    ? 'Select the winning party — this pays the entire pot to the chosen participant and is final once confirmed on-chain.'
                    : 'You can settle this wager as a draw.'}
                  {canDraw && ' A draw returns each party their original stake; no winner is paid.'}
                </p>
              </div>

              <div className="mm-resolution-outcomes">
                {canDeclareWinner && (
                  <>
                    <label className="mm-outcome-label">Who won?</label>
                    <div className="mm-outcome-options">
                      {outcomes.map(outcome => (
                        <button
                          key={outcome}
                          type="button"
                          className={`mm-outcome-btn ${selectedOutcome === outcome ? 'selected' : ''} ${outcome === outcomes[0] ? 'positive' : 'negative'}`}
                          onClick={() => setSelectedOutcome(outcome)}
                          disabled={submitting}
                        >
                          <span className="mm-outcome-title">{outcomeLabels[outcome]?.title || outcome}</span>
                          <span className="mm-outcome-addr">{outcomeLabels[outcome]?.who}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {canDraw && (
                  <div className="mm-resolution-draw">
                    <label className="mm-outcome-label">Or settle without a winner</label>
                    <button
                      type="button"
                      className={`mm-outcome-btn mm-outcome-draw ${isDrawSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedOutcome(DRAW)}
                      disabled={submitting}
                      aria-pressed={isDrawSelected}
                    >
                      <span className="mm-outcome-title">Draw — both parties refunded</span>
                      <span className="mm-outcome-addr">
                        {resType === 3
                          ? 'Returns each party their original stake'
                          : 'Both players must select Draw — the second confirms it'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="mm-resolution-notes">
                <label htmlFor="resolution-notes">Resolution Notes (Optional)</label>
                <textarea
                  id="resolution-notes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Add any notes about how the outcome was determined..."
                  rows={3}
                  disabled={submitting}
                />
              </div>

              {!isCorrectNetwork && (
                <div className="mm-warning-banner">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <strong>Wrong Network</strong>
                    <button type="button" onClick={switchNetwork}>Switch Network</button>
                  </div>
                </div>
              )}

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={() => setStep('confirm')}
                  disabled={!selectedOutcome || submitting || !isCorrectNetwork}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="mm-confirmation">
                <div className="mm-confirmation-icon">&#9888;</div>
                <h4>{isDrawSelected ? 'Confirm Draw' : 'Confirm Resolution'}</h4>
                {isDrawSelected ? (
                  <>
                    <p>
                      You are about to settle this wager as a <strong>draw</strong>: each party gets
                      their original stake back and no winner is paid.
                    </p>
                    <p className="mm-confirmation-warning">
                      {resType === 3
                        ? 'As the arbitrator you settle the draw immediately. This is final.'
                        : 'A draw needs both players. If your counterparty has not agreed yet, this records your proposal and waits for their confirmation; the second confirmation settles it.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      You are about to resolve this wager in favour of: <strong>{labelFor(selectedOutcome)}</strong>
                    </p>
                    <p className="mm-confirmation-warning">
                      This action cannot be undone. The full pot is paid to the winner immediately
                      and the result is final.
                    </p>
                  </>
                )}
              </div>

              {error && <div className="mm-error-banner">{error}</div>}

              <div className="mm-sub-modal-actions">
                <button
                  type="button"
                  className="mm-btn-secondary"
                  onClick={() => setStep('select')}
                  disabled={submitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <span className="mm-spinner-small"></span>
                      Resolving...
                    </>
                  ) : (
                    'Confirm Resolution'
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="mm-success-state">
              <div className="mm-success-icon">&#9989;</div>
              <h4>{isDrawSelected ? (drawSettled ? 'Settled as a Draw' : 'Draw Proposed') : 'Wager Resolved'}</h4>
              {isDrawSelected ? (
                drawSettled ? (
                  <p>Both parties have been refunded their original stake. This result is final.</p>
                ) : (
                  <p>Your draw proposal is recorded. The wager settles as a draw once your counterparty also chooses Draw.</p>
                )
              ) : (
                <p>
                  Winnings sent to: <strong>{labelFor(selectedOutcome)}</strong>
                </p>
              )}
              {!isDrawSelected && (
                <p className="mm-success-hint">
                  The full pot has been paid out on-chain. This result is final.
                </p>
              )}
              {txHash && (
                <p className="mm-success-hint">
                  <a href={getTransactionUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer">
                    View transaction
                  </a>
                </p>
              )}
              <button
                type="button"
                className="mm-btn-primary"
                onClick={onResolved}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MyMarketsModal
