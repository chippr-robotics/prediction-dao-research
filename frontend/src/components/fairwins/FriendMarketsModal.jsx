import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet, useWeb3 } from '../../hooks'
import { useEncryption } from '../../hooks/useEncryption'
import { useFriendMarketCreation } from '../../hooks/useFriendMarketCreation'
import { useDex } from '../../hooks/useDex'
import {
  WAGER_DEFAULTS,
  getDefaultEndDateTime,
  getMidpointAcceptanceDeadline,
  toDateTimeLocal
} from '../../constants/wagerDefaults'
import { ResolutionType, isOracleModelExposed } from '../../constants/wagerDefaults'
import QRScanner from '../ui/QRScanner'
import AddressInput from '../ui/AddressInput'
import { isEnsName } from '../../utils/validation'
import { getCurrentDocument } from '../../utils/legalDocs'

/**
 * The in-force Terms version bound into a new wager's encryption (Spec 007, FR-056/FR-058):
 * { id, hash } of the current Terms & Conditions, so the wager carries tamper-evident proof
 * of its governing terms. Returns null if unavailable (legacy/no-AAD path).
 */
function currentTermsVersion() {
  const t = getCurrentDocument('terms')
  return t ? { id: t.id, hash: t.hash } : null
}
import { useChainTokens } from '../../hooks/useChainTokens'
import { usePolymarketSearch } from '../../hooks/usePolymarketSearch'
import PolymarketBrowser from './PolymarketBrowser'
import OracleConditionPicker from './OracleConditionPicker'
import { getContractAddress } from '../../config/contracts'
import { formatUSD, getMarketUrl } from './marketHelpers'
import TransactionProgress from './TransactionProgress'
import './FriendMarketsModal.css'

// Stake token options derived from the active chain's tokens. The token
// metadata is sourced from useDex() at render time so the Testnet/Mainnet
// toggle picks up the right addresses without a reload.
const CUSTOM_TOKEN_OPTION = { id: 'CUSTOM', symbol: 'Custom', name: 'Custom Token', address: '', icon: '🔧' }

// Participant-resolved (people settle it) resolution types, in enum order.
// Oracle-resolved types are computed per-chain at render time (adapter-gated).
const PARTICIPANT_RESOLUTION_TYPES = [
  ResolutionType.Either,
  ResolutionType.Creator,
  ResolutionType.Opponent,
  // ThirdParty re-enabled (Spec Kit 005): the WagerRegistry v3 per-user index now
  // records the arbitrator (so they can discover the wagers they oversee via
  // getUserWagers), and the creator encrypts the private terms for the arbitrator
  // too — so a designated arbiter can both find and read the wager to resolve it.
  ResolutionType.ThirdParty,
]

// Dropdown labels + helper text for every resolution type. Kept here so the
// participant/oracle flows render from a single mapped source instead of a
// hand-maintained option list.
const RESOLUTION_TYPE_LABELS = {
  [ResolutionType.Either]: 'Either Party',
  [ResolutionType.Creator]: 'Creator Only',
  [ResolutionType.Opponent]: 'Opponent Only',
  [ResolutionType.ThirdParty]: 'Third Party (Arbitrator)',
  [ResolutionType.Polymarket]: 'Linked Market (Polymarket)',
  [ResolutionType.ChainlinkDataFeed]: 'Chainlink Data Feed (price condition)',
  [ResolutionType.ChainlinkFunctions]: 'Chainlink Functions (custom request)',
  [ResolutionType.UMA]: 'UMA Optimistic Oracle (claim assertion)',
}
const RESOLUTION_TYPE_HINTS = {
  [ResolutionType.Either]: 'Either you or your opponent can resolve the wager',
  [ResolutionType.Creator]: 'Only you (the creator) can resolve the wager',
  [ResolutionType.Opponent]: 'Only your opponent can resolve the wager',
  [ResolutionType.ThirdParty]: 'A neutral third party you name resolves the wager (they can read the terms but cannot take a side)',
  [ResolutionType.Polymarket]: 'Settles automatically when the linked Polymarket market resolves',
  [ResolutionType.ChainlinkDataFeed]: 'Settles automatically once the price feed reading at the deadline passes the threshold',
  [ResolutionType.ChainlinkFunctions]: 'Settles when the Chainlink Functions DON returns a result (admin-registered request)',
  [ResolutionType.UMA]: 'Settles via UMA Optimistic Oracle — someone posts the bond and the assertion stands after the liveness window',
}

// Oracle resolution types in enum order. Rendered as tabs (always shown; locked
// when the adapter/CTF isn't reachable on the active chain) so users can see
// every settlement source at a glance instead of a filtered dropdown.
// Only the oracle models EXPOSED by the current VITE_ORACLE_MODELS setting are
// offered as tabs (default: Polymarket only). Hidden models are not selectable by
// any path; flip the flag to 'all' to restore them.
const ORACLE_TAB_TYPES = [
  ResolutionType.Polymarket,
  ResolutionType.ChainlinkDataFeed,
  ResolutionType.ChainlinkFunctions,
  ResolutionType.UMA,
].filter(isOracleModelExposed)

// Short labels for the resolution tab strip — the full RESOLUTION_TYPE_LABELS
// are too long to read comfortably as tabs.
const RESOLUTION_TAB_LABELS = {
  [ResolutionType.Either]: 'Either Party',
  [ResolutionType.Creator]: 'Creator',
  [ResolutionType.Opponent]: 'Opponent',
  [ResolutionType.Polymarket]: 'Polymarket',
  [ResolutionType.ChainlinkDataFeed]: 'Chainlink Data Feed',
  [ResolutionType.ChainlinkFunctions]: 'Chainlink Functions',
  [ResolutionType.UMA]: 'UMA',
}

/**
 * FriendMarketsModal
 *
 * Focused modal for creating a new 1v1 friend market (either a standard
 * even-stakes wager or a Bookmaker odds wager). Opens directly into the form
 * for the provided initialType, defaulting to 1v1. The `resolutionCategory`
 * prop narrows the resolution choices to participant-resolved or
 * oracle-resolved so each flow can present the right configuration. Group/event
 * wagers are not supported — the v2 WagerRegistry contract is 1v1 only.
 * Viewing/managing existing wagers lives in MyMarketsModal.
 */
function FriendMarketsModal({
  isOpen,
  onClose,
  onCreate,
  pendingTransaction = null,
  onClearPendingTransaction = () => {},
  initialType = null,
  resolutionCategory = 'all',
  initialPolymarketMarket = null
}) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Per-chain capabilities — drives which resolution-type options the user
  // sees. Polymarket-pegged side bets only render on chains where the
  // Polymarket CTF is reachable (Polygon Amoy and Mainnet).
  const { capabilities } = useChainTokens()
  const polymarketSidebetsEnabled = Boolean(capabilities?.polymarketSidebets)

  // Adapter addresses for the extensible oracle resolution types. Each option
  // in the resolution-type dropdown self-gates on the adapter being deployed
  // on the active chain — synced into frontend/src/config/contracts.js by
  // `npm run sync:frontend-contracts`.
  const chainlinkDataFeedAdapter  = getContractAddress('chainlinkDataFeedAdapter')
  const chainlinkFunctionsAdapter = getContractAddress('chainlinkFunctionsAdapter')
  const umaAdapter                = getContractAddress('umaAdapter')
  const isExtensibleOracleType = (t) => (
    t === ResolutionType.ChainlinkDataFeed ||
    t === ResolutionType.ChainlinkFunctions ||
    t === ResolutionType.UMA
  )

  // Resolution choices are split into two flows, driven by `resolutionCategory`:
  //   - 'participant' → people settle it (Either / Creator / Opponent)
  //   - 'oracle'      → an oracle settles it (Polymarket / Chainlink / UMA), each
  //                     self-gated on being reachable/deployed on the active chain
  //   - 'all'         → both (used by the Bookmaker card)
  // The Set/order mirrors `enum ResolutionType` in IWagerRegistry.sol.
  // Only adapters that are reachable AND exposed by the current VITE_ORACLE_MODELS
  // setting are offered (default: Polymarket only). This drives the selectable
  // options and the auto-selected default in both the 1v1 and Bookmaker flows.
  const availableOracleResolutionTypes = useMemo(() => [
    ...(polymarketSidebetsEnabled && isOracleModelExposed(ResolutionType.Polymarket) ? [ResolutionType.Polymarket] : []),
    ...(chainlinkDataFeedAdapter && isOracleModelExposed(ResolutionType.ChainlinkDataFeed) ? [ResolutionType.ChainlinkDataFeed] : []),
    ...(chainlinkFunctionsAdapter && isOracleModelExposed(ResolutionType.ChainlinkFunctions) ? [ResolutionType.ChainlinkFunctions] : []),
    ...(umaAdapter && isOracleModelExposed(ResolutionType.UMA) ? [ResolutionType.UMA] : []),
  ], [polymarketSidebetsEnabled, chainlinkDataFeedAdapter, chainlinkFunctionsAdapter, umaAdapter])

  const resolutionOptionTypes = useMemo(() => {
    if (resolutionCategory === 'participant') return PARTICIPANT_RESOLUTION_TYPES
    if (resolutionCategory === 'oracle') return availableOracleResolutionTypes
    return [...PARTICIPANT_RESOLUTION_TYPES, ...availableOracleResolutionTypes]
  }, [resolutionCategory, availableOracleResolutionTypes])

  // Default resolution to pre-select when the modal opens, per category.
  const defaultResolutionType = useMemo(() => {
    if (resolutionCategory === 'participant') return ResolutionType.Either
    if (resolutionCategory === 'oracle') {
      return availableOracleResolutionTypes[0] ?? ResolutionType.Polymarket
    }
    return WAGER_DEFAULTS.RESOLUTION_TYPE
  }, [resolutionCategory, availableOracleResolutionTypes])

  // The oracle ('oracle') and Bookmaker ('all') flows present the settlement
  // source as a tab strip at the top of the form (with the market/condition
  // picker right under it) instead of a dropdown buried below the stake fields.
  // The participant-only flow keeps its simple "Who Can Resolve?" dropdown.
  const useResolutionTabs = resolutionCategory === 'oracle' || resolutionCategory === 'all'

  // Availability + locked-reason per oracle resolution type, reusing the same
  // gates as `availableOracleResolutionTypes`. Unavailable oracles render as
  // locked tabs rather than being hidden.
  const oracleAvailability = useMemo(() => ({
    [ResolutionType.Polymarket]: {
      enabled: polymarketSidebetsEnabled,
      lockedReason: 'Requires the Polymarket CTF. Switch to Polygon (Amoy or Mainnet) to use it.',
    },
    [ResolutionType.ChainlinkDataFeed]: {
      enabled: Boolean(chainlinkDataFeedAdapter),
      lockedReason: "Chainlink Data Feed adapter isn't deployed on this network yet.",
    },
    [ResolutionType.ChainlinkFunctions]: {
      enabled: Boolean(chainlinkFunctionsAdapter),
      lockedReason: "Chainlink Functions adapter isn't deployed on this network yet.",
    },
    [ResolutionType.UMA]: {
      enabled: Boolean(umaAdapter),
      lockedReason: "UMA Optimistic Oracle adapter isn't deployed on this network yet.",
    },
  }), [polymarketSidebetsEnabled, chainlinkDataFeedAdapter, chainlinkFunctionsAdapter, umaAdapter])

  // Resolution types rendered as tabs. Oracle types are always shown (locked
  // when unavailable). The Bookmaker ('all') flow also lists the participant
  // settlement choices first.
  const resolutionTabTypes = useMemo(() => {
    if (resolutionCategory === 'oracle') return ORACLE_TAB_TYPES
    return [...PARTICIPANT_RESOLUTION_TYPES, ...ORACLE_TAB_TYPES]
  }, [resolutionCategory])

  // A tab is locked only for oracle types whose adapter/CTF isn't reachable.
  const isTabLocked = useCallback(
    (t) => Boolean(oracleAvailability[t]) && !oracleAvailability[t].enabled,
    [oracleAvailability]
  )
  const anyOracleEnabled = ORACLE_TAB_TYPES.some((t) => oracleAvailability[t]?.enabled)

  // Chain-aware token metadata for the Stake Token dropdown. Recomputed
  // whenever the user switches Testnet/Mainnet so the right addresses are
  // submitted with the wager.
  const { tokens: chainTokens } = useDex()
  const STAKE_TOKEN_OPTIONS = useMemo(() => [
    { id: 'STABLE', ...chainTokens.STABLE, isDefault: true },
    { id: 'WNATIVE', ...chainTokens.WNATIVE },
    { id: 'NATIVE', ...chainTokens.NATIVE },
    CUSTOM_TOKEN_OPTION,
  ], [chainTokens])

  // Built-in market creation handler used when no external onCreate is provided
  const { createFriendMarket } = useFriendMarketCreation()
  const handleCreate = onCreate || createFriendMarket

  // Encryption hook for friend market privacy
  const {
    isInitialized: encryptionInitialized,
    isInitializing: encryptionInitializing,
    createEncrypted,
    lookupOpponentKey,
    addRecipientByPublicKey
  } = useEncryption()

  // Creation flow state
  const [creationStep, setCreationStep] = useState('form') // 'form', 'success'
  const [friendMarketType, setFriendMarketType] = useState(initialType || 'oneVsOne')
  const [createdMarket, setCreatedMarket] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    description: '',
    opponent: '',
    // ENS-resolved opponent address. `opponent` holds the raw input (may be
    // an ENS name); `opponentResolved` is the 0x address used for validation
    // and contract submission.
    opponentResolved: '',
    // Arbitrator (ThirdParty resolution only). `arbitrator` is the raw input
    // (may be an ENS name); `arbitratorResolved` is the 0x address.
    arbitrator: '',
    arbitratorResolved: '',
    endDateTime: getDefaultEndDateTime(),
    stakeAmount: WAGER_DEFAULTS.STAKE_AMOUNT,
    stakeTokenId: WAGER_DEFAULTS.STAKE_TOKEN_ID,
    customStakeTokenAddress: '', // Used when stakeTokenId is 'CUSTOM'
    oracleConditionId: '',
    // Which outcome of a linked Polymarket the creator is taking. Stored as
    // the 0-based outcome index ('' = unset, '0' = YES/first, '1' = NO/second)
    // to match PolymarketOracleAdapter's payouts ordering (YES=0, NO=1).
    creatorSide: '',
    // Deterministic accept-by time (midpoint of now → end).
    acceptanceDeadline: getMidpointAcceptanceDeadline(getDefaultEndDateTime()),
    // Leverage/odds for Bookmaker markets (200 = 2x equal stakes, 10000 = 100x)
    oddsMultiplier: WAGER_DEFAULTS.ODDS_MULTIPLIER,
    // Resolution type: 0=Either, 1=Creator, 2=Opponent, 4=Polymarket, 5/6/7=oracle adapters
    resolutionType: WAGER_DEFAULTS.RESOLUTION_TYPE
  })

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Transaction progress state
  const [txProgress, setTxProgress] = useState({
    step: 'idle', // 'idle', 'verify', 'approve', 'create', 'complete'
    message: '',
    txHash: null,
    error: null
  })

  // QR Scanner state
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrScanTarget, setQrScanTarget] = useState(null) // 'opponent'

  // Polymarket event selection — the PolymarketBrowser component below handles
  // browsing/searching internally. We only need to track the picked market so
  // its conditionId can be committed to formData.oracleConditionId.
  const [selectedPolymarketMarket, setSelectedPolymarketMarket] = useState(null)
  // Once a market is linked, the browse/search area collapses behind an
  // accordion so the form stays compact. Users can re-open it to swap markets
  // without losing their current pick.
  const [polymarketBrowserOpen, setPolymarketBrowserOpen] = useState(false)
  const { clear: clearPolymarket } = usePolymarketSearch({ limit: 10 })

  // Tracks the last description we generated from (creatorSide + Polymarket
  // question). If the user hasn't edited the field since, we may overwrite it
  // when those inputs change; once they edit, we leave their text alone.
  const lastAutoDescriptionRef = useRef('')

  // Encryption state
  const [enableEncryption, setEnableEncryption] = useState(true) // Default to encrypted for privacy
  // The "What gets encrypted?" field breakdown is collapsed by default to save
  // space; the user expands it only if they want the detail.
  const [showEncryptionDetails, setShowEncryptionDetails] = useState(false)

  // Reset form function - memoized to prevent stale closures
  const resetForm = useCallback(() => {
    setFormData({
      description: '',
      opponent: '',
      opponentResolved: '',
      arbitrator: '',
      arbitratorResolved: '',
      endDateTime: getDefaultEndDateTime(),
      stakeAmount: WAGER_DEFAULTS.STAKE_AMOUNT,
      stakeTokenId: WAGER_DEFAULTS.STAKE_TOKEN_ID,
      customStakeTokenAddress: '',
      oracleConditionId: '',
      creatorSide: '',
      acceptanceDeadline: getMidpointAcceptanceDeadline(getDefaultEndDateTime()),
      oddsMultiplier: WAGER_DEFAULTS.ODDS_MULTIPLIER,
      resolutionType: defaultResolutionType
    })
    setErrors({})
    setSelectedPolymarketMarket(null)
    setPolymarketBrowserOpen(false)
    clearPolymarket()
    lastAutoDescriptionRef.current = ''
    setEnableEncryption(true)
  }, [clearPolymarket, defaultResolutionType])

  // Reset modal state when opened. Always lands on the form for the
  // provided initialType (1v1 by default), since this modal is now
  // single-purpose.
  useEffect(() => {
    if (isOpen) {
      setFriendMarketType(initialType || 'oneVsOne')
      setCreationStep('form')
      setCreatedMarket(null)
      setErrors({})
      resetForm()
      // When opened from a Polymarket card on the dashboard, jump the user
      // straight into the linked-market resolution flow with the chosen
      // market and question pre-filled.
      if (initialPolymarketMarket?.conditionId) {
        setSelectedPolymarketMarket(initialPolymarketMarket)
        setFormData((prev) => {
          const seeded = prev.description || initialPolymarketMarket.question || ''
          if (!prev.description && seeded) {
            lastAutoDescriptionRef.current = seeded
          }
          // Lock end time to the linked market's own end time so payouts settle
          // when Polymarket resolves, not whatever the user typed.
          const linkedEnd = toDateTimeLocal(initialPolymarketMarket.endDate)
          return {
            ...prev,
            resolutionType: ResolutionType.Polymarket,
            oracleConditionId: initialPolymarketMarket.conditionId,
            description: seeded,
            ...(linkedEnd ? { endDateTime: linkedEnd, acceptanceDeadline: getMidpointAcceptanceDeadline(linkedEnd) } : {}),
          }
        })
      }
    }
  }, [isOpen, resetForm, initialType, initialPolymarketMarket])

  const handleClose = useCallback(() => {
    if (!submitting) {
      onClose()
    }
  }, [submitting, onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  // Whenever the user switches AWAY from Polymarket resolution, drop the
  // selected Polymarket market so the linked-market UI doesn't bleed into
  // the new oracle-condition flow. We can't do this inside handleFormChange's
  // setFormData callback because selectedPolymarketMarket is separate state.
  useEffect(() => {
    if (formData.resolutionType !== ResolutionType.Polymarket && selectedPolymarketMarket) {
      setSelectedPolymarketMarket(null)
      setPolymarketBrowserOpen(false)
    }
  }, [formData.resolutionType, selectedPolymarketMarket])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleFormChange = useCallback((field, value) => {
    // If the user is typing in the description, treat it as a manual edit and
    // stop auto-syncing it from the side + Polymarket question.
    if (field === 'description' && value !== lastAutoDescriptionRef.current) {
      lastAutoDescriptionRef.current = ''
    }

    setFormData(prev => {
      // Skip no-op updates so callbacks driven by useEffect (e.g. the
      // AddressInput resolved-address callback) don't cause re-render loops.
      if (prev[field] === value) return prev

      const updated = { ...prev, [field]: value }

      // Clear linked-market state when switching to a resolution type that
      // doesn't need it.
      const valueIsOracleResolved = value === ResolutionType.Polymarket ||
        value === ResolutionType.ChainlinkDataFeed ||
        value === ResolutionType.ChainlinkFunctions ||
        value === ResolutionType.UMA
      if (field === 'resolutionType' && !valueIsOracleResolved) {
        // Leaving the oracle family entirely → clear conditionId + side.
        updated.oracleConditionId = ''
        updated.creatorSide = ''
      }
      if (field === 'resolutionType' && valueIsOracleResolved && prev.resolutionType !== value) {
        // Switching among oracle types resets the conditionId — different
        // adapters register different ids, so carrying state across is wrong.
        // (Side preference IS preserved: YES/NO maps the same way for all.)
        updated.oracleConditionId = ''
      }

      // Auto-set acceptance deadline to the midpoint between now and the end
      // time whenever the end time changes.
      if (field === 'endDateTime') {
        updated.acceptanceDeadline = getMidpointAcceptanceDeadline(value)
      }

      return updated
    })

    setErrors(prev => {
      if (!prev[field]) return prev
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  // Build the canonical "I'm betting <SIDE>: <question>" phrasing so both
  // creator and counterparties can see which side of the linked market the
  // creator is on. `sideIndex` is the 0-based outcome index ('0' or '1').
  const buildSideDescription = useCallback((market, sideIndex) => {
    if (!market || sideIndex === '' || sideIndex == null) return ''
    const question = (market.question || '').trim()
    const outcomeName = market.outcomes?.[Number(sideIndex)]?.name?.trim()
    const sideLabel = outcomeName || (sideIndex === '0' ? 'YES' : 'NO')
    if (!question) return `I'm betting ${sideLabel}`
    return `I'm betting ${sideLabel}: ${question}`
  }, [])

  // QR Scanner handlers
  const openQrScanner = (target) => {
    setQrScanTarget(target)
    setQrScannerOpen(true)
  }

  const handleQrScanSuccess = (decodedText) => {
    // Try to extract Ethereum address from scanned data
    let address = decodedText
    let isFromTrustedSource = false

    // If it's a URL, try to extract address from path or query
    try {
      const url = new URL(decodedText)
      // Check if URL is from a trusted origin (same origin)
      const trustedOrigins = [window.location.origin]
      isFromTrustedSource = trustedOrigins.some(origin => url.origin === origin)
      
      // Check for address in pathname (e.g., /address/0x...)
      const pathMatch = url.pathname.match(/0x[a-fA-F0-9]{40}/)
      if (pathMatch) {
        address = pathMatch[0]
      } else {
        // Check query params
        const addrParam = url.searchParams.get('address') || url.searchParams.get('addr')
        if (addrParam) address = addrParam
      }
      
      // Warn if from external source
      if (!isFromTrustedSource) {
        const proceed = window.confirm(
          'This QR code contains a URL from an external source. ' +
          'Please verify the address before proceeding. Continue?'
        )
        if (!proceed) {
          setQrScannerOpen(false)
          setQrScanTarget(null)
          return
        }
      }
    } catch {
      // Not a URL, check if it's a raw address
      const addrMatch = decodedText.match(/0x[a-fA-F0-9]{40}/)
      if (addrMatch) {
        address = addrMatch[0]
      }
    }

    // Update the appropriate field. Also mirror the value into the
    // *Resolved field so validation/submission skip the ENS resolution path
    // for a scanned hex address.
    if (qrScanTarget && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      handleFormChange(qrScanTarget, address)
      handleFormChange(`${qrScanTarget}Resolved`, address)
    }

    setQrScannerOpen(false)
    setQrScanTarget(null)
  }

  const handleQrScannerClose = () => {
    setQrScannerOpen(false)
    setQrScanTarget(null)
  }

  // Polymarket event selection — picking a market commits the condition id to
  // formData so submit-time validation passes. If a side is already chosen,
  // re-sync the description to the new question.
  const handleSelectPolymarketMarket = (market) => {
    setSelectedPolymarketMarket(market)
    setPolymarketBrowserOpen(false)
    setFormData(prev => {
      const updated = { ...prev, oracleConditionId: market.conditionId }
      // Lock the wager's end time to the linked market so the side bet can't
      // resolve before (or long after) Polymarket does.
      const linkedEnd = toDateTimeLocal(market.endDate)
      if (linkedEnd) {
        updated.endDateTime = linkedEnd
      }
      const sideSynced = prev.creatorSide !== '' && (
        prev.description === '' || prev.description === lastAutoDescriptionRef.current
      )
      if (sideSynced) {
        const next = buildSideDescription(market, prev.creatorSide)
        updated.description = next
        lastAutoDescriptionRef.current = next
      } else if (!prev.description) {
        // Preserve prior behavior: seed an empty description with the question
        // so users have a starting point even before they pick a side.
        updated.description = market.question || ''
        lastAutoDescriptionRef.current = updated.description
      }
      return updated
    })
    if (errors.oracleConditionId) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.oracleConditionId
        return newErrors
      })
    }
    if (errors.endDateTime) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.endDateTime
        return newErrors
      })
    }
  }

  const clearPolymarketSelection = () => {
    setSelectedPolymarketMarket(null)
    setPolymarketBrowserOpen(true)
    // End time was locked to the linked market — restore the default
    // so the user can pick their own again.
    setFormData(prev => ({
      ...prev,
      oracleConditionId: '',
      creatorSide: '',
      endDateTime: getDefaultEndDateTime(),
    }))
    clearPolymarket()
    lastAutoDescriptionRef.current = ''
  }

  // User picks which Polymarket outcome they're taking. Auto-sync the
  // description to the canonical phrasing unless they've already customized
  // it past the last auto-generated value.
  const handleSelectCreatorSide = (sideIndex) => {
    setFormData(prev => {
      const updated = { ...prev, creatorSide: sideIndex }
      const canOverwrite = prev.description === '' ||
        prev.description === lastAutoDescriptionRef.current ||
        prev.description === selectedPolymarketMarket?.question
      if (canOverwrite && selectedPolymarketMarket) {
        const next = buildSideDescription(selectedPolymarketMarket, sideIndex)
        updated.description = next
        lastAutoDescriptionRef.current = next
      }
      return updated
    })
    if (errors.creatorSide) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.creatorSide
        return newErrors
      })
    }
    if (errors.description) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors.description
        return newErrors
      })
    }
  }

  const validateForm = useCallback(() => {
    const newErrors = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }

    // Every supported wager type (1v1 and Bookmaker) is a head-to-head bet with
    // a single opponent — the v2 contract has no group mode.
    {
      const rawOpponent = formData.opponent.trim()
      const resolvedOpponent = (formData.opponentResolved || '').trim()
      if (!rawOpponent) {
        newErrors.opponent = 'Opponent address is required'
      } else if (!resolvedOpponent) {
        newErrors.opponent = isEnsName(rawOpponent)
          ? 'Could not resolve ENS name — check the name and try again'
          : 'Enter a valid Ethereum address or ENS name'
      } else if (resolvedOpponent.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        newErrors.opponent = 'Cannot use the zero address'
      } else if (resolvedOpponent.toLowerCase() === account?.toLowerCase()) {
        newErrors.opponent = 'Cannot bet against yourself'
      }
    }

    // Arbitrator (ThirdParty resolution): a neutral third party, distinct from
    // both participants (the contract reverts ArbitratorRequired/ArbitratorDisallowed).
    if (formData.resolutionType === ResolutionType.ThirdParty) {
      const rawArb = (formData.arbitrator || '').trim()
      const resolvedArb = (formData.arbitratorResolved || '').trim()
      const opp = (formData.opponentResolved || '').trim().toLowerCase()
      if (!rawArb) {
        newErrors.arbitrator = 'Arbitrator address is required for third-party resolution'
      } else if (!resolvedArb) {
        newErrors.arbitrator = isEnsName(rawArb)
          ? 'Could not resolve ENS name — check the name and try again'
          : 'Enter a valid Ethereum address or ENS name'
      } else if (resolvedArb.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        newErrors.arbitrator = 'Cannot use the zero address'
      } else if (resolvedArb.toLowerCase() === account?.toLowerCase()) {
        newErrors.arbitrator = 'The arbitrator must be neutral — it cannot be you (the creator)'
      } else if (opp && resolvedArb.toLowerCase() === opp) {
        newErrors.arbitrator = 'The arbitrator must be neutral — it cannot be the opponent'
      }
    }

    const stake = parseFloat(formData.stakeAmount)
    const selectedToken = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
    if (!formData.stakeAmount || stake <= 0) {
      newErrors.stakeAmount = 'Valid stake amount is required'
    } else if (stake < 0.1) {
      newErrors.stakeAmount = `Minimum stake is 0.1 ${selectedToken?.symbol || 'tokens'}`
    } else if (stake > 1000) {
      newErrors.stakeAmount = `Maximum stake is 1000 ${selectedToken?.symbol || 'tokens'}`
    }

    // Validate custom stake token address if custom token is selected
    if (formData.stakeTokenId === 'CUSTOM') {
      if (!formData.customStakeTokenAddress) {
        newErrors.customStakeTokenAddress = 'Custom token address is required'
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.customStakeTokenAddress)) {
        newErrors.customStakeTokenAddress = 'Invalid token address format'
      }
    }

    // Validate end date/time. Min mirrors the on-chain MIN_TRADING_PERIOD (1h)
    // — comfortably past Polygon/Ethereum finality so a reorg can't unwind it.
    const endDate = new Date(formData.endDateTime)
    const now = new Date()
    const minDate = new Date(now.getTime() + WAGER_DEFAULTS.MIN_TRADING_PERIOD_SECONDS * 1000)
    const maxDate = new Date(now.getTime() + WAGER_DEFAULTS.MAX_TRADING_PERIOD_SECONDS * 1000)
    const isLinkedMarket = formData.resolutionType === ResolutionType.Polymarket &&
      selectedPolymarketMarket?.endDate

    if (!formData.endDateTime || isNaN(endDate.getTime())) {
      newErrors.endDateTime = 'Please select a valid end date and time'
    } else if (isLinkedMarket) {
      // End time is locked to the linked Polymarket and not user-editable —
      // skip the standard min/max bounds. The on-chain min trading period is
      // still enforced by ConditionalMarketFactory.
    } else if (endDate < minDate) {
      newErrors.endDateTime = 'End date must be at least 1 hour from now'
    } else if (endDate > maxDate) {
      newErrors.endDateTime = 'End date must be within 21 days'
    }

    // Acceptance deadline is deterministic (midpoint of now → end), so
    // recalculate it fresh and update formData to keep the display in sync.
    const freshDeadline = getMidpointAcceptanceDeadline(formData.endDateTime)
    if (freshDeadline !== formData.acceptanceDeadline) {
      setFormData(prev => ({ ...prev, acceptanceDeadline: freshDeadline }))
    }

    // Validate linked-market ID based on resolution type
    {
      if (formData.resolutionType === ResolutionType.Polymarket) {
        // Polymarket condition id (bytes32 hex) is required.
        const cid = (formData.oracleConditionId || '').trim()
        if (!cid) {
          newErrors.oracleConditionId = 'Pick a Polymarket event to link this wager to'
        } else if (!/^0x[a-fA-F0-9]{64}$/.test(cid)) {
          newErrors.oracleConditionId = 'Invalid Polymarket condition id (expected 0x + 64 hex chars)'
        }
        // Creator must declare which side of the linked market they're taking
        // so the bet description unambiguously identifies who is on which side.
        if (formData.creatorSide !== '0' && formData.creatorSide !== '1') {
          newErrors.creatorSide = 'Pick which side of the linked market you are taking'
        }
        // Linked-market deadline guards: the standard MIN/MAX deadline checks
        // are skipped for linked markets (we lock endDateTime to the Polymarket
        // end date). Re-validate against the linked market's own clock so we
        // don't submit a wager whose accept window outlives the Polymarket.
        if (selectedPolymarketMarket?.endDate) {
          const linkedEnd = new Date(selectedPolymarketMarket.endDate)
          if (!Number.isNaN(linkedEnd.getTime())) {
            // The on-chain resolveDeadline (linkedEnd + 48h) must fall within the
            // contract's MAX_RESOLVE_WINDOW (180d). Markets ending beyond that
            // can't be wagered on yet — block with a clear message instead of
            // letting createWager revert with BadDeadlines.
            const maxLinkedEnd = Date.now() +
              (WAGER_DEFAULTS.MAX_RESOLVE_WINDOW_SECONDS - WAGER_DEFAULTS.RESOLUTION_WINDOW_SECONDS) * 1000
            if (linkedEnd.getTime() <= Date.now()) {
              newErrors.oracleConditionId = 'This Polymarket has already ended. Pick an active market.'
            } else if (linkedEnd.getTime() > maxLinkedEnd) {
              newErrors.oracleConditionId = 'This market ends too far in the future to wager on (it must resolve within ~180 days). Pick a sooner-resolving market.'
            } else if (freshDeadline) {
              const acceptEnd = new Date(freshDeadline)
              if (!Number.isNaN(acceptEnd.getTime()) && acceptEnd.getTime() >= linkedEnd.getTime()) {
                newErrors.acceptanceDeadline = 'Acceptance deadline must be before the linked market ends.'
              }
            }
          }
        }
      } else if (isExtensibleOracleType(formData.resolutionType)) {
        // The same oracle conditionId field, validated the same way as the
        // Polymarket branch above but with messaging that reflects the
        // generic picker UX.
        const cid = (formData.oracleConditionId || '').trim()
        if (!cid) {
          newErrors.oracleConditionId = 'Pick (or paste) a registered conditionId for the chosen oracle'
        } else if (!/^0x[a-fA-F0-9]{64}$/.test(cid)) {
          newErrors.oracleConditionId = 'Invalid conditionId (expected 0x + 64 hex chars)'
        }
        if (formData.creatorSide !== '0' && formData.creatorSide !== '1') {
          newErrors.creatorSide = 'Pick which side of the bet you are taking (YES or NO)'
        }
        // We don't have an off-chain "linked market end date" for these, so
        // the standard MIN/MAX deadline checks (run earlier in this function)
        // already cover the deadline path.
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, account, STAKE_TOKEN_OPTIONS, selectedPolymarketMarket?.endDate])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      setErrors({ submit: 'Please connect your wallet to continue' })
      return
    }

    if (!isCorrectNetwork) {
      setErrors({ submit: 'Please switch to the correct network' })
      return
    }

    if (!validateForm()) return

    setSubmitting(true)
    // Reset transaction progress
    setTxProgress({ step: 'idle', message: '', txHash: null, error: null })

    // Progress callback for updating UI
    const handleProgress = (progress) => {
      setTxProgress(prev => ({
        ...prev,
        step: progress.step || prev.step,
        message: progress.message || prev.message,
        txHash: progress.txHash || prev.txHash
      }))
    }

    try {
      // Get the stake token info for submission
      const getStakeTokenInfo = () => {
        if (formData.stakeTokenId === 'CUSTOM') {
          return {
            symbol: 'Custom',
            address: formData.customStakeTokenAddress,
            icon: '🔧',
            decimals: 18 // Default to 18 for custom tokens
          }
        }
        const token = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
        return token || STAKE_TOKEN_OPTIONS[0] // Default to STABLE if not found
      }
      const stakeToken = getStakeTokenInfo()

      // Prepare market metadata for encryption
      const marketMetadata = {
        name: formData.description,
        description: formData.description,
        marketType: friendMarketType,
        stakeAmount: formData.stakeAmount,
        stakeToken: stakeToken.symbol,
        endDateTime: formData.endDateTime,
        createdAt: new Date().toISOString(),
        attributes: [
          { trait_type: 'Market Source', value: 'friend' },
          { trait_type: 'Market Type', value: friendMarketType }
        ]
      }

      // Handle encryption if enabled
      let finalMetadata = marketMetadata

      if (enableEncryption) {
        // Every wager type (1v1 + Bookmaker) is head-to-head, so we always
        // encrypt to the single opponent. Use the ENS-resolved address (falls
        // back to raw input when the user typed a hex address, since
        // onResolvedChange mirrors that value).
        const opponentAddress = formData.opponentResolved

        if (opponentAddress) {
          const opponentKey = await lookupOpponentKey(opponentAddress)
          if (!opponentKey) {
            throw new Error(
              'Your opponent has not registered their encryption key yet. ' +
              'They must visit the app and register their key before you can create an encrypted wager. ' +
              'You can still create an unencrypted wager.'
            )
          }

          // 1v1 encrypted: force X25519 so we can add the opponent using the
          // X25519 public key returned by the on-chain KeyRegistry. The X-Wing
          // (v2.0) path can't be used here because the registry only stores
          // 32-byte X25519 keys; addRecipientByPublicKey would then read an
          // undefined `ephemeralPublicKey` off an X-Wing wrapped-key entry.
          const { envelope } = await createEncrypted(marketMetadata, { algorithm: 'x25519', termsVersion: currentTermsVersion() })
          finalMetadata = addRecipientByPublicKey(envelope, opponentAddress, opponentKey)

          // ThirdParty (Spec Kit 005): the arbitrator must also read the private
          // terms to resolve the wager, so encrypt for them as a third recipient.
          // Key-gate: they must have a registered encryption key (mirrors the
          // opponent gate above) — otherwise block, don't create an unreadable wager.
          if (formData.resolutionType === ResolutionType.ThirdParty && formData.arbitratorResolved) {
            const arbitratorKey = await lookupOpponentKey(formData.arbitratorResolved)
            if (!arbitratorKey) {
              throw new Error(
                'The arbitrator has not registered their encryption key yet. ' +
                'They must register their key before you can create an encrypted third-party wager, ' +
                'or you can create an unencrypted wager instead.'
              )
            }
            finalMetadata = addRecipientByPublicKey(finalMetadata, formData.arbitratorResolved, arbitratorKey)
          }
        } else {
          // Defensive fallback: validation guarantees an opponent, but if one
          // is somehow missing, encrypt to the creator only rather than crash.
          const { envelope } = await createEncrypted(marketMetadata, { termsVersion: currentTermsVersion() })
          finalMetadata = envelope
        }
      }

      // Calculate trading period BEFORE building submit data
      // This must happen before onCreate so WalletButton receives the correct value
      const endDate = new Date(formData.endDateTime)
      const now = new Date()
      // Pass seconds directly so sub-day precision survives (e.g., a Polymarket
      // event ending in 6 hours stays a 6-hour wager, not rounded up to 1 day).
      // Floor to a whole second and clamp to the contract's min so we never
      // submit a sub-minimum period.
      const rawSeconds = Math.floor((endDate.getTime() - now.getTime()) / 1000)
      const tradingPeriodSeconds = Math.max(rawSeconds, WAGER_DEFAULTS.MIN_TRADING_PERIOD_SECONDS)
      const tradingPeriodDays = Math.max(1, Math.ceil(tradingPeriodSeconds / (60 * 60 * 24)))

      // Translate UI-side semantics into contract-facing semantics:
      //  - creatorSide ('0' = first Polymarket outcome, '1' = second) → creatorIsYes (bool).
      //    PolymarketOracleAdapter.getOutcome returns `payouts[0] > payouts[1]`, so picking
      //    outcome index 0 means the creator wins iff that outcome wins ⇒ creatorIsYes = true.
      //  - oracleConditionId (form field) → passed straight to the hook; the hook forwards it
      //    to the contract's still-named `polymarketConditionId` arg.
      // creatorIsYes only matters for oracle-resolved wagers; default true for the others.
      const creatorIsYes = formData.creatorSide === '0' || formData.creatorSide === ''
        ? true
        : false

      // Recalculate acceptance deadline fresh so the midpoint reflects the
      // current wall-clock time, not the time the user last changed endDateTime.
      const freshAcceptanceDeadline = getMidpointAcceptanceDeadline(formData.endDateTime)

      // Build submit data with token address for WalletButton
      const submitData = {
        type: 'friend',
        marketType: friendMarketType,
        data: {
          ...formData,
          acceptanceDeadline: freshAcceptanceDeadline,
          // Downstream hooks (useFriendMarketCreation) read `opponent` as a 0x
          // address. Substitute the ENS-resolved value so a user can enter
          // `name.eth` and the contract still gets a hex address.
          opponent: formData.opponentResolved || formData.opponent,
          // Arbitrator (ENS-resolved) for ThirdParty resolution; the creation
          // hook only forwards it on-chain when the resolution type is ThirdParty.
          arbitrator: formData.arbitratorResolved || formData.arbitrator || '',
          // Translated UI → contract semantics (see comment above).
          creatorIsYes,
          // Pass calculated trading period so downstream uses the user's selected end date.
          // `tradingPeriodSeconds` is the source of truth; `tradingPeriod` (days)
          // is kept for any legacy consumers that still parse it.
          tradingPeriodSeconds,
          tradingPeriod: tradingPeriodDays,
          // Pass actual token address so WalletButton can use correct decimals
          // 'native' means the chain's native token (no ERC20 address), pass null for this case
          collateralToken: stakeToken.address === 'native' ? null : (stakeToken.address || null),
          // Include encrypted metadata (opponent's key wrapped via on-chain registry)
          encryptedMetadata: enableEncryption ? finalMetadata : null,
          isEncrypted: enableEncryption,
          // Progress callback for transaction status updates
          onProgress: handleProgress
        }
      }

      const result = await handleCreate(submitData, signer)

      // Calculate acceptance deadline info
      const acceptanceDeadline = new Date(freshAcceptanceDeadline)
      // 1v1 head-to-head: both sides (creator + opponent) must be in for the
      // wager to activate.
      const minThreshold = WAGER_DEFAULTS.MIN_ACCEPTANCE_THRESHOLD

      // Created market with acceptance flow fields
      const newMarket = {
        id: result?.id || `friend-${Date.now()}`,
        type: friendMarketType,
        description: formData.description,
        stakeAmount: formData.stakeAmount,
        stakeTokenId: formData.stakeTokenId,
        stakeTokenSymbol: stakeToken.symbol,
        stakeTokenIcon: stakeToken.icon,
        stakeTokenAddress: stakeToken.address,
        endDateTime: formData.endDateTime,
        endDate: endDate.toISOString(),
        tradingPeriod: tradingPeriodDays,
        participants: [account, formData.opponentResolved],
        creator: account,
        createdAt: new Date().toISOString(),
        status: 'pending_acceptance',
        // Acceptance flow fields
        acceptanceDeadline: acceptanceDeadline.getTime(),
        acceptanceDeadlineFormatted: acceptanceDeadline.toISOString(),
        minAcceptanceThreshold: minThreshold,
        acceptedCount: 1, // Creator has accepted
        acceptances: {
          [account.toLowerCase()]: {
            hasAccepted: true,
            stakedAmount: formData.stakeAmount,
            isArbitrator: false
          }
        },
        // Encryption fields
        isEncrypted: enableEncryption,
        ipfsCid: result?.ipfsCid || null,
        metadataHash: result?.metadataHash || null,
      }

      setCreatedMarket(newMarket)
      setCreationStep('success')
    } catch (error) {
      console.error('Error creating friend market:', error)
      const errorMessage = error.message || 'Failed to create wager. Please try again.'
      setErrors({ submit: errorMessage })
      // Reset step to 'idle' so the error banner is visible
      // (TransactionProgress unmounts when submitting=false, and
      // the error banner only shows when txProgress.step === 'idle')
      setTxProgress({ step: 'idle', message: '', txHash: null, error: errorMessage })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateAnother = () => {
    // Keep friendMarketType so the user starts a fresh wager of the same
    // type rather than seeing a (now-removed) type picker.
    setCreationStep('form')
    setCreatedMarket(null)
    resetForm()
    setTxProgress({ step: 'idle', message: '', txHash: null, error: null })
  }

  // Get type label (used on success screen)
  const getTypeLabel = (type) => {
    switch (type) {
      case 'oneVsOne': return '1v1'
      case 'bookmaker': return 'Bookmaker'
      default: return type
    }
  }

  // Format helpers used by the form and success screen
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Get selected stake token info for display
  const selectedStakeToken = useMemo(() => {
    const token = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
    if (formData.stakeTokenId === 'CUSTOM' && formData.customStakeTokenAddress) {
      return {
        ...token,
        displayAddress: formData.customStakeTokenAddress
      }
    }
    return token
  }, [formData.stakeTokenId, formData.customStakeTokenAddress, STAKE_TOKEN_OPTIONS])

  if (!isOpen) return null

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-markets-modal-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#127808;</span>
              <h2 id="friend-markets-modal-title">Wagers</h2>
            </div>
            <p className="fm-subtitle">Private wagers with friends</p>
          </div>
          <button
            className="fm-close-btn"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        {/* Content Area */}
        <div className="fm-content">
          <div className="fm-panel">
              {/* Form Step */}
              {creationStep === 'form' && (
                <form className="fm-form" onSubmit={handleSubmit}>
                  <div className="fm-form-grid">
                    {/* Settlement source + market selection — surfaced at the very
                        top of the oracle / Bookmaker flows so users pick the
                        resource they're betting on (Polymarket event / oracle
                        condition) first. The source is chosen via tabs; oracle
                        sources that aren't reachable on the active chain render as
                        locked tabs. */}
                    {useResolutionTabs && (
                      <>
                        {/* Tab strip: hidden when there's only one settlement type to
                            pick (e.g. the oracle flow with Polymarket-only exposure).
                            The type-specific inputs below (Polymarket search, oracle
                            condition pickers) still render, so the Polymarket search is
                            always visible in the oracle flow. */}
                        {!(resolutionCategory === 'oracle' && resolutionTabTypes.length <= 1) && (
                        <div className="fm-form-group fm-form-full">
                          <label id="fm-resolution-tabs-label">
                            {resolutionCategory === 'oracle' ? 'Which oracle settles this?' : 'How does this settle?'}
                          </label>
                          <div
                            className="fm-resolution-tabs"
                            role="tablist"
                            aria-labelledby="fm-resolution-tabs-label"
                          >
                            {resolutionTabTypes.map((t) => {
                              const locked = isTabLocked(t)
                              const active = formData.resolutionType === t
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  role="tab"
                                  aria-selected={active}
                                  aria-disabled={locked}
                                  disabled={submitting || locked}
                                  title={locked ? oracleAvailability[t]?.lockedReason : undefined}
                                  className={`fm-resolution-tab ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                                  onClick={() => { if (!locked) handleFormChange('resolutionType', t) }}
                                >
                                  <span className="fm-resolution-tab-label">{RESOLUTION_TAB_LABELS[t]}</span>
                                  {locked && (
                                    <svg className="fm-resolution-tab-lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          <span className="fm-hint">
                            {isTabLocked(formData.resolutionType)
                              ? oracleAvailability[formData.resolutionType]?.lockedReason
                              : RESOLUTION_TYPE_HINTS[formData.resolutionType]}
                            {resolutionCategory === 'oracle' && !anyOracleEnabled && (
                              <em style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                                {isOracleModelExposed(ResolutionType.ChainlinkDataFeed)
                                  ? 'No oracle is available on this network. Switch to a chain with the Polymarket CTF (Polygon Amoy or Mainnet) or a deployed Chainlink/UMA adapter, or create a wager that your friends settle instead.'
                                  : 'No oracle is available on this network. Switch to a chain with the Polymarket CTF (Polygon Amoy or Mainnet), or create a wager that your friends settle instead.'}
                              </em>
                            )}
                          </span>
                        </div>
                        )}

                        {/* Linked Market — Polymarket event lookup */}
                        {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') &&
                         formData.resolutionType === ResolutionType.Polymarket && (
                          <div className="fm-form-group fm-form-full">
                            <label htmlFor="fm-polymarket-search">
                              Linked Polymarket Event <span className="fm-required">*</span>
                            </label>

                            {selectedPolymarketMarket && (
                              <div className="fm-polymarket-selected">
                                <div className="fm-polymarket-selected-body">
                                  <strong>{selectedPolymarketMarket.question}</strong>
                                  <div className="fm-polymarket-meta">
                                    {selectedPolymarketMarket.endDate && (
                                      <span>Wager ends {formatDate(selectedPolymarketMarket.endDate)} (locked to linked market)</span>
                                    )}
                                    {selectedPolymarketMarket.outcomes?.length > 0 && (
                                      <span>
                                        {selectedPolymarketMarket.outcomes
                                          .map((o) => `${o.name}${o.price != null ? ` ${Math.round(o.price * 100)}¢` : ''}`)
                                          .join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                  <code className="fm-polymarket-cid">{selectedPolymarketMarket.conditionId}</code>
                                </div>
                                <button
                                  type="button"
                                  className="fm-link-btn"
                                  onClick={clearPolymarketSelection}
                                  disabled={submitting}
                                >
                                  Change
                                </button>
                              </div>
                            )}

                            {selectedPolymarketMarket ? (
                              <div className={`fm-polymarket-browse-accordion ${polymarketBrowserOpen ? 'open' : ''}`}>
                                <button
                                  type="button"
                                  className="fm-polymarket-browse-toggle"
                                  onClick={() => setPolymarketBrowserOpen(o => !o)}
                                  aria-expanded={polymarketBrowserOpen}
                                  aria-controls="fm-polymarket-browse-panel"
                                  disabled={submitting}
                                >
                                  <span>Browse other Polymarket events</span>
                                  <svg
                                    className="fm-polymarket-browse-chevron"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                </button>
                                {polymarketBrowserOpen && (
                                  <div id="fm-polymarket-browse-panel" className="fm-polymarket-browse-panel">
                                    <span className="fm-hint">
                                      Browse top markets by category, or search for a specific event. Picking a different one will replace your current selection.
                                    </span>
                                    <PolymarketBrowser
                                      variant="inline"
                                      showFilters
                                      limit={20}
                                      selectedConditionId={selectedPolymarketMarket?.conditionId}
                                      onSelectMarket={handleSelectPolymarketMarket}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <span className="fm-hint">
                                  Browse top markets by category, or search for a specific event. Pick one and the wager will settle automatically when that Polymarket market resolves.
                                </span>

                                <PolymarketBrowser
                                  variant="inline"
                                  showFilters
                                  limit={20}
                                  selectedConditionId={selectedPolymarketMarket?.conditionId}
                                  onSelectMarket={handleSelectPolymarketMarket}
                                />
                              </>
                            )}

                            {errors.oracleConditionId && (
                              <span className="fm-error">{errors.oracleConditionId}</span>
                            )}
                          </div>
                        )}

                        {/* Oracle condition picker — Chainlink Data Feed / Chainlink Functions / UMA */}
                        {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') &&
                         isExtensibleOracleType(formData.resolutionType) && (
                          <div className="fm-form-group fm-form-full">
                            <label htmlFor="fm-oracle-condition-picker">
                              Oracle condition <span className="fm-required">*</span>
                            </label>
                            <OracleConditionPicker
                              kind={
                                formData.resolutionType === ResolutionType.ChainlinkDataFeed ? 'datafeed' :
                                formData.resolutionType === ResolutionType.ChainlinkFunctions ? 'functions' :
                                'uma'
                              }
                              adapterAddress={
                                formData.resolutionType === ResolutionType.ChainlinkDataFeed ? chainlinkDataFeedAdapter :
                                formData.resolutionType === ResolutionType.ChainlinkFunctions ? chainlinkFunctionsAdapter :
                                umaAdapter
                              }
                              value={formData.oracleConditionId}
                              onChange={(id) => handleFormChange('oracleConditionId', id || '')}
                              error={errors.oracleConditionId}
                              disabled={submitting}
                            />
                          </div>
                        )}

                        {/* Generic YES/NO side picker for the non-Polymarket oracle types.
                            Polymarket has its own outcome-named side picker below — we
                            skip it for the new types and use a binary YES/NO labelling
                            that maps to the contract's creatorIsYes bool. */}
                        {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') &&
                         isExtensibleOracleType(formData.resolutionType) && (
                          <div className="fm-form-group fm-form-full">
                            <label>
                              Your side of the bet <span className="fm-required">*</span>
                            </label>
                            <span className="fm-hint">
                              The oracle will return a YES or NO outcome. Pick which side you&apos;re taking — your opponent gets the other.
                            </span>
                            <div className="fm-side-picker">
                              {[
                                { idx: '0', label: 'YES' },
                                { idx: '1', label: 'NO' },
                              ].map(({ idx, label }) => {
                                const active = formData.creatorSide === idx
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    className={`fm-side-btn ${active ? 'active' : ''}`}
                                    onClick={() => handleFormChange('creatorSide', idx)}
                                    disabled={submitting}
                                    aria-pressed={active}
                                  >
                                    <span className="fm-side-btn-label">I&apos;m taking {label}</span>
                                  </button>
                                )
                              })}
                            </div>
                            {errors.creatorSide && (
                              <span className="fm-error">{errors.creatorSide}</span>
                            )}
                          </div>
                        )}

                        {/* Creator side — which outcome of the linked Polymarket are you taking? */}
                        {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') &&
                         formData.resolutionType === ResolutionType.Polymarket &&
                         selectedPolymarketMarket && (
                          <div className="fm-form-group fm-form-full">
                            <label>
                              Your side of the bet <span className="fm-required">*</span>
                            </label>
                            <span className="fm-hint">
                              Pick which outcome you&apos;re taking. Your opponent will be on the other side, and the bet description will say so explicitly.
                            </span>
                            <div className="fm-side-picker">
                              {['0', '1'].map((idx) => {
                                const outcome = selectedPolymarketMarket.outcomes?.[Number(idx)]
                                const fallback = idx === '0' ? 'YES' : 'NO'
                                const name = outcome?.name || fallback
                                const active = formData.creatorSide === idx
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    className={`fm-side-btn ${active ? 'active' : ''}`}
                                    onClick={() => handleSelectCreatorSide(idx)}
                                    disabled={submitting}
                                    aria-pressed={active}
                                  >
                                    <span className="fm-side-btn-label">I&apos;m taking {name}</span>
                                  </button>
                                )
                              })}
                            </div>
                            {formData.creatorSide !== '' && (
                              <span className="fm-hint">
                                Your opponent will be taking{' '}
                                <strong>
                                  {selectedPolymarketMarket.outcomes?.[formData.creatorSide === '0' ? 1 : 0]?.name
                                    || (formData.creatorSide === '0' ? 'NO' : 'YES')}
                                </strong>.
                              </span>
                            )}
                            {errors.creatorSide && (
                              <span className="fm-error">{errors.creatorSide}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <div className="fm-form-group fm-form-full">
                      <label htmlFor="fm-description">
                        What&apos;s the bet? <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-description"
                        type="text"
                        value={formData.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                        placeholder="e.g., I'm betting YES that the Patriots win the Super Bowl"
                        disabled={submitting}
                        className={errors.description ? 'error' : ''}
                        maxLength={200}
                      />
                      <span className="fm-hint">
                        Phrase this so it&apos;s clear which side you&apos;re on (e.g., &ldquo;I&apos;m betting YES that...&rdquo;). Your opponent takes the opposite side.
                      </span>
                      {errors.description && <span className="fm-error">{errors.description}</span>}
                    </div>

                    {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-opponent">
                          Opponent Address <span className="fm-required">*</span>
                        </label>
                        <div className="fm-input-with-action">
                          <div className="fm-address-input-wrap">
                            <AddressInput
                              id="fm-opponent"
                              value={formData.opponent}
                              onChange={(e) => handleFormChange('opponent', e.target.value)}
                              onResolvedChange={(addr) => handleFormChange('opponentResolved', addr || '')}
                              placeholder="0x... or ENS name (e.g., vitalik.eth)"
                              disabled={submitting}
                              error={!!errors.opponent}
                              errorMessage={errors.opponent}
                            />
                          </div>
                          <button
                            type="button"
                            className="fm-scan-btn"
                            onClick={() => openQrScanner('opponent')}
                            disabled={submitting}
                            title="Scan QR code"
                            aria-label="Scan QR code"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}


                    <div className="fm-form-group">
                      <label htmlFor="fm-stake">
                        Stake Amount <span className="fm-required">*</span>
                      </label>
                      <div className="fm-stake-input-wrapper">
                        {(formData.stakeTokenId === 'STABLE' || formData.stakeTokenId === 'CUSTOM') && (
                          <span className="fm-stake-prefix">$</span>
                        )}
                        <input
                          id="fm-stake"
                          type="number"
                          value={formData.stakeAmount}
                          onChange={(e) => handleFormChange('stakeAmount', e.target.value)}
                          placeholder={formData.stakeTokenId === 'STABLE' ? '10.00' : '10'}
                          min="0.1"
                          max="1000"
                          step="0.01"
                          disabled={submitting}
                          className={`${errors.stakeAmount ? 'error' : ''} ${formData.stakeTokenId === 'STABLE' ? 'fm-stake-usd' : ''}`}
                        />
                        {formData.stakeTokenId !== 'STABLE' && formData.stakeTokenId !== 'CUSTOM' && (
                          <span className="fm-stake-suffix">{selectedStakeToken?.symbol || 'MATIC'}</span>
                        )}
                      </div>
                      <span className="fm-hint">
                        {formData.stakeTokenId === 'STABLE'
                          ? 'Enter amount in USD (e.g., 10.00 for $10)'
                          : `Enter amount in ${selectedStakeToken?.symbol || 'tokens'}`}
                      </span>
                      {errors.stakeAmount && <span className="fm-error">{errors.stakeAmount}</span>}
                    </div>

                    <div className="fm-form-group">
                      <label htmlFor="fm-stake-token">
                        Stake Token
                      </label>
                      <select
                        id="fm-stake-token"
                        value={formData.stakeTokenId}
                        onChange={(e) => handleFormChange('stakeTokenId', e.target.value)}
                        disabled={submitting}
                        className="fm-token-select"
                      >
                        {STAKE_TOKEN_OPTIONS.map(token => (
                          <option key={token.id} value={token.id}>
                            {token.icon} {token.symbol} - {token.name}
                          </option>
                        ))}
                      </select>
                      <span className="fm-hint">
                        {formData.stakeTokenId === 'NATIVE'
                          ? 'The chain native token will be used for stakes'
                          : formData.stakeTokenId === 'CUSTOM'
                          ? 'Enter custom token address below'
                          : `${selectedStakeToken?.name} from the active chain`}
                      </span>
                    </div>

                    {/* Custom token address input - only shown when CUSTOM is selected */}
                    {formData.stakeTokenId === 'CUSTOM' && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-custom-token">
                          Custom Token Address <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-custom-token"
                          type="text"
                          value={formData.customStakeTokenAddress}
                          onChange={(e) => handleFormChange('customStakeTokenAddress', e.target.value)}
                          placeholder="0x..."
                          disabled={submitting}
                          className={errors.customStakeTokenAddress ? 'error' : ''}
                        />
                        <span className="fm-hint">Enter a valid ERC-20 token address</span>
                        {errors.customStakeTokenAddress && <span className="fm-error">{errors.customStakeTokenAddress}</span>}
                      </div>
                    )}

                    {/* Resolution Type selector (participant flow only). The
                        oracle / Bookmaker flows render a tab strip at the top of
                        the form instead — see the settlement section above. */}
                    {!useResolutionTabs && resolutionOptionTypes.length > 0 && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-resolution-type">Who Can Resolve?</label>
                        <select
                          id="fm-resolution-type"
                          value={formData.resolutionType}
                          onChange={(e) => handleFormChange('resolutionType', parseInt(e.target.value, 10))}
                          disabled={submitting}
                          className="fm-select"
                        >
                          {resolutionOptionTypes.map((t) => (
                            <option key={t} value={t}>{RESOLUTION_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                        <span className="fm-hint">
                          {RESOLUTION_TYPE_HINTS[formData.resolutionType]}
                        </span>
                      </div>
                    )}

                    {/* Arbitrator address — required when a neutral third party resolves. */}
                    {formData.resolutionType === ResolutionType.ThirdParty &&
                     (friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-arbitrator">
                          Arbitrator Address <span className="fm-required">*</span>
                        </label>
                        <AddressInput
                          id="fm-arbitrator"
                          value={formData.arbitrator}
                          onChange={(e) => handleFormChange('arbitrator', e.target.value)}
                          onResolvedChange={(addr) => handleFormChange('arbitratorResolved', addr || '')}
                          placeholder="0x... or ENS name — the neutral resolver"
                          disabled={submitting}
                          error={!!errors.arbitrator}
                          errorMessage={errors.arbitrator}
                        />
                        <span className="fm-hint">
                          A neutral third party who decides the outcome and can read the
                          {enableEncryption ? ' private ' : ' '}wager terms to resolve it — they cannot take a side.
                          They must have registered an encryption key.
                        </span>
                      </div>
                    )}

                    {/* Odds/Leverage selector - only for Bookmaker markets */}
                    {friendMarketType === 'bookmaker' && (
                      <div className="fm-form-group fm-form-full">
                        <div className="fm-input-header">
                          <label htmlFor="fm-odds">Opponent&apos;s Odds</label>
                          <span className="fm-odds-value">{formData.oddsMultiplier / 100}x</span>
                        </div>
                        <input
                          id="fm-odds"
                          type="range"
                          min="200"
                          max="10000"
                          step="100"
                          value={formData.oddsMultiplier}
                          onChange={(e) => handleFormChange('oddsMultiplier', parseInt(e.target.value, 10))}
                          disabled={submitting}
                          className="fm-odds-slider"
                        />
                        <div className="fm-odds-presets">
                          {[200, 300, 500, 1000, 2000, 5000, 10000].map(odds => (
                            <button
                              key={odds}
                              type="button"
                              className={formData.oddsMultiplier === odds ? 'active' : ''}
                              onClick={() => handleFormChange('oddsMultiplier', odds)}
                              disabled={submitting}
                            >
                              {odds / 100}x
                            </button>
                          ))}
                        </div>
                        <div className="fm-odds-summary">
                          <div className="fm-odds-row">
                            <span>Opponent stakes:</span>
                            <span>{formatUSD(formData.stakeAmount, selectedStakeToken?.symbol)}</span>
                          </div>
                          <div className="fm-odds-row">
                            <span>You stake:</span>
                            <span>{formatUSD(
                              parseFloat(formData.stakeAmount || 0) * (formData.oddsMultiplier - 100) / 100,
                              selectedStakeToken?.symbol
                            )}</span>
                          </div>
                          <div className="fm-odds-row fm-odds-highlight">
                            <span>Total pot:</span>
                            <span>{formatUSD(
                              parseFloat(formData.stakeAmount || 0) * formData.oddsMultiplier / 100,
                              selectedStakeToken?.symbol
                            )}</span>
                          </div>
                        </div>
                        <span className="fm-hint">
                          {formData.oddsMultiplier === 200
                            ? 'Equal stakes - both sides risk the same amount'
                            : `You're the insurer - risking more for smaller returns. Opponent risks ${formatUSD(formData.stakeAmount, selectedStakeToken?.symbol)} to win ${formatUSD(parseFloat(formData.stakeAmount || 0) * formData.oddsMultiplier / 100, selectedStakeToken?.symbol)}`}
                        </span>
                      </div>
                    )}

                    {/*
                      End date input. Hidden entirely when a Polymarket is
                      linked — the wager's end time is locked to that market's
                      own end time so the side bet can't settle before (or
                      long after) the linked event.
                    */}
                    {!(formData.resolutionType === ResolutionType.Polymarket && selectedPolymarketMarket) && (
                      <div className="fm-form-group">
                        <label htmlFor="fm-end-date">
                          End Date &amp; Time <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-end-date"
                          type="datetime-local"
                          value={formData.endDateTime}
                          onChange={(e) => handleFormChange('endDateTime', e.target.value)}
                          min={toDateTimeLocal(new Date(Date.now() + WAGER_DEFAULTS.MIN_TRADING_PERIOD_SECONDS * 1000))}
                          max={toDateTimeLocal(new Date(Date.now() + WAGER_DEFAULTS.MAX_TRADING_PERIOD_SECONDS * 1000))}
                          disabled={submitting}
                          className={`fm-datetime-input ${errors.endDateTime ? 'error' : ''}`}
                        />
                        <span className="fm-hint">When does this wager end? You can resolve it once this time passes. (min: 1 hour, max: 21 days)</span>
                        {errors.endDateTime && <span className="fm-error">{errors.endDateTime}</span>}
                      </div>
                    )}

                    {/* Acceptance Deadline - deterministic, not user-editable */}
                    <div className="fm-form-group">
                      <label>Acceptance Deadline</label>
                      <div className="fm-readonly-value">
                        {formData.acceptanceDeadline
                          ? new Date(formData.acceptanceDeadline).toLocaleString()
                          : '—'}
                      </div>
                      <span className="fm-hint">Halfway between now and the end time — your opponent must accept before this.</span>
                    </div>

                    {/* Resolution window — derived from the end time so the full timeline is
                        clear before the user commits (Bug #1). Resolve allowed in
                        [end time, end time + 48h]; refundable after that. */}
                    {formData.endDateTime && !Number.isNaN(new Date(formData.endDateTime).getTime()) && (() => {
                      const end = new Date(formData.endDateTime)
                      const windowMs = (WAGER_DEFAULTS.RESOLUTION_WINDOW_SECONDS || 48 * 3600) * 1000
                      const resolveClose = new Date(end.getTime() + windowMs)
                      return (
                        <div className="fm-form-group">
                          <label>Resolution Window</label>
                          <div className="fm-readonly-value">
                            {end.toLocaleString()} → {resolveClose.toLocaleString()}
                          </div>
                          <span className="fm-hint">
                            You have 48 hours after the end time to resolve. If unresolved by{' '}
                            {resolveClose.toLocaleString()}, both stakes can be refunded.
                          </span>
                        </div>
                      )
                    })()}

                    {/* Privacy / Encryption Toggle */}
                    <div className="fm-form-group fm-form-full">
                      <div className={`fm-encryption-toggle ${enableEncryption ? 'fm-encryption-enabled' : ''}`}>
                        <label className="fm-toggle-label">
                          <input
                            type="checkbox"
                            checked={enableEncryption}
                            onChange={(e) => setEnableEncryption(e.target.checked)}
                            disabled={submitting}
                          />
                          <span className="fm-toggle-switch"></span>
                          <span className="fm-toggle-text">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            Private Wager
                          </span>
                        </label>

                        {enableEncryption && (
                          <div className="fm-pq-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            </svg>
                            <span>End-to-End Encrypted</span>
                          </div>
                        )}

                        {!enableEncryption && (
                          <span className="fm-hint">
                            Wager details will be publicly visible on the blockchain.
                          </span>
                        )}

                        {/* Encryption explainer is collapsed by default to save space;
                            the toggle + badge convey the state, details are one click away. */}
                        {enableEncryption && (
                          <div className="fm-encryption-info">
                            <button
                              type="button"
                              className="fm-encryption-info-header fm-encryption-info-toggle"
                              onClick={() => setShowEncryptionDetails(v => !v)}
                              aria-expanded={showEncryptionDetails}
                              aria-controls="fm-encryption-details"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 16v-4M12 8h.01"/>
                              </svg>
                              <span>How encryption works</span>
                              <svg
                                className={`fm-encryption-chevron ${showEncryptionDetails ? 'open' : ''}`}
                                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                aria-hidden="true"
                              >
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>

                            {showEncryptionDetails && (
                              <div id="fm-encryption-details" className="fm-encryption-details">
                                <p className="fm-hint">
                                  End-to-end encrypted. Only participants can decrypt wager details.
                                </p>

                                <div className="fm-encryption-subhead">What gets encrypted?</div>
                                <div className="fm-encryption-fields">
                                  <div className="fm-field-encrypted"><span className="fm-field-icon">🔒</span><span>Bet description &amp; terms</span></div>
                                  <div className="fm-field-encrypted"><span className="fm-field-icon">🔒</span><span>Wager metadata</span></div>
                                  <div className="fm-field-public"><span className="fm-field-icon">🌐</span><span>Participant addresses</span></div>
                                  <div className="fm-field-public"><span className="fm-field-icon">🌐</span><span>Stake amount &amp; token</span></div>
                                  <div className="fm-field-public"><span className="fm-field-icon">🌐</span><span>Wager timing</span></div>
                                </div>

                                {!encryptionInitialized && !encryptionInitializing && (
                                  <div className="fm-encryption-warning">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10"/>
                                      <path d="M12 16v-4M12 8h.01"/>
                                    </svg>
                                    <span>You&apos;ll be asked to sign a message to derive your encryption keys</span>
                                  </div>
                                )}

                                {(friendMarketType === 'oneVsOne' || friendMarketType === 'bookmaker') && (
                                  <p className="fm-encryption-note">
                                    Your opponent must have registered their encryption key to create an encrypted wager.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {encryptionInitializing && (
                          <div className="fm-encryption-status">
                            <span className="fm-spinner-small"></span>
                            <span>Deriving encryption keys...</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Network Warning */}
                  {isConnected && !isCorrectNetwork && (
                    <div className="fm-warning">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <div>
                        <strong>Wrong Network</strong>
                        <button type="button" onClick={switchNetwork}>Switch Network</button>
                      </div>
                    </div>
                  )}

                  {/* Transaction Progress - shows during active submission or when pending transaction exists */}
                  {(submitting && txProgress.step !== 'idle') || (pendingTransaction && !submitting) ? (
                    <TransactionProgress
                      type="friend_market"
                      currentStep={submitting ? txProgress.step : 'idle'}
                      error={txProgress.error}
                      txHash={txProgress.txHash}
                      isNativeToken={formData.stakeTokenId === 'NATIVE'}
                      pendingState={!submitting && pendingTransaction ? {
                        step: pendingTransaction.step,
                        txHash: pendingTransaction.txHash,
                        timestamp: pendingTransaction.timestamp
                      } : null}
                      onRetry={() => {
                        if (pendingTransaction && !submitting) {
                          // Resume: pre-fill form with pending data and start submission
                          if (pendingTransaction.data) {
                            setFormData(prev => ({
                              ...prev,
                              description: pendingTransaction.data.description || prev.description,
                              opponent: pendingTransaction.data.opponent || prev.opponent,
                              stakeAmount: pendingTransaction.data.stakeAmount || prev.stakeAmount
                            }))
                          }
                          // Clear pending state and let user try again
                          onClearPendingTransaction()
                        } else {
                          setTxProgress({ step: 'idle', message: '', txHash: null, error: null })
                          setErrors({})
                        }
                      }}
                      onCancel={() => {
                        setSubmitting(false)
                        setTxProgress({ step: 'idle', message: '', txHash: null, error: null })
                        setErrors({})
                        onClearPendingTransaction()
                      }}
                    />
                  ) : null}

                  {/* Submit Error (only show when not in progress view) */}
                  {errors.submit && txProgress.step === 'idle' && (
                    <div className="fm-error-banner">{errors.submit}</div>
                  )}

                  {/* Actions */}
                  <div className="fm-form-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleClose}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fm-btn-primary"
                      disabled={submitting || !isConnected || !isCorrectNetwork}
                    >
                      {submitting ? (
                        <>
                          <span className="fm-spinner"></span>
                          Creating...
                        </>
                      ) : (
                        'Create Wager'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Success Step with QR Code */}
              {creationStep === 'success' && createdMarket && (
                <div className="fm-success">
                  <div className="fm-success-icon">&#9989;</div>
                  <h3>Wager Created!</h3>
                  <p className="fm-success-desc">{createdMarket.description}</p>

                  <div className="fm-qr-section">
                    <div className="fm-qr-container">
                      <QRCodeSVG
                        value={getMarketUrl(createdMarket)}
                        size={180}
                        level="H"
                        includeMargin={false}
                        fgColor="#36B37E"
                        bgColor="transparent"
                        aria-label="QR code to share this wager"
                        imageSettings={{
                          src: '/assets/logo_fairwins.svg',
                          height: 32,
                          width: 32,
                          excavate: true,
                        }}
                      />
                    </div>
                    <p className="fm-qr-hint">
                      Share this QR code with participants to accept the wager
                    </p>
                    <div className="fm-acceptance-info">
                      <span className="fm-acceptance-status">&#9203; Waiting for acceptance</span>
                      {createdMarket.acceptanceDeadline && (
                        <span className="fm-acceptance-deadline">
                          Deadline: {new Date(createdMarket.acceptanceDeadline).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="fm-qr-url">
                      <label htmlFor="fm-market-url">Acceptance link</label>
                      <input
                        id="fm-market-url"
                        type="text"
                        value={getMarketUrl(createdMarket)}
                        readOnly
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>

                  <div className="fm-success-details">
                    <div className="fm-detail-row">
                      <span>Status</span>
                      <span className="fm-status-pending">Pending Acceptance</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Privacy</span>
                      <span className={`fm-privacy-badge ${createdMarket.isEncrypted ? 'fm-private' : 'fm-public'}`}>
                        {createdMarket.isEncrypted ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            Encrypted
                          </>
                        ) : 'Public'}
                      </span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Type</span>
                      <span>{getTypeLabel(createdMarket.type)}</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Stake Required</span>
                      <span>
                        {createdMarket.stakeTokenIcon} {formatUSD(createdMarket.stakeAmount, createdMarket.stakeTokenSymbol)}
                      </span>
                    </div>
                    {createdMarket.acceptanceDeadline && (
                      <div className="fm-detail-row">
                        <span>Accept By</span>
                        <span>{new Date(createdMarket.acceptanceDeadline).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="fm-detail-row">
                      <span>Wager Ends</span>
                      <span>{createdMarket.endDateTime ? new Date(createdMarket.endDateTime).toLocaleString() : `${createdMarket.tradingPeriod} days`}</span>
                    </div>
                  </div>

                  <div className="fm-success-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleCreateAnother}
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      className="fm-btn-primary"
                      onClick={async () => {
                        const url = getMarketUrl(createdMarket)
                        if (!navigator.clipboard || !navigator.clipboard.writeText) {
                          window.alert('Copy to clipboard is not supported in this browser. Please copy the link manually.')
                          return
                        }
                        try {
                          await navigator.clipboard.writeText(url)
                          window.alert('Link copied to clipboard.')
                        } catch (error) {
                          console.error('Failed to copy link to clipboard:', error)
                          window.alert('Failed to copy the link. Please copy it manually.')
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy Link
                    </button>
                  </div>
                  <button
                    type="button"
                    className="fm-success-done"
                    onClick={handleClose}
                  >
                    Done — back to My Wagers
                  </button>
                </div>
              )}
            </div>
        </div>
      </div>

      {/* QR Scanner Modal — opens for the opponent address field */}
      <QRScanner
        isOpen={qrScannerOpen}
        onClose={handleQrScannerClose}
        onScanSuccess={handleQrScanSuccess}
      />
    </div>
  )
}
export default FriendMarketsModal
