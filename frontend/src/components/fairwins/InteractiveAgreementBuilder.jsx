import { useState, useCallback, useMemo } from 'react'
import { ResolutionType } from '../../abis/FriendGroupMarketFactory'
import { TOKENS } from '../../constants/etcswap'
import QRScanner from '../ui/QRScanner'
import './InteractiveAgreementBuilder.css'

// Stake token options (same as FriendMarketsModal)
const STAKE_TOKEN_OPTIONS = [
  { id: 'USC', ...TOKENS.USC, isDefault: true },
  { id: 'WETC', ...TOKENS.WETC },
  { id: 'ETC', ...TOKENS.ETC },
  { id: 'CUSTOM', symbol: 'Custom', name: 'Custom Token', address: '', icon: '🔧' }
]

const STEPS = [
  { id: 'type', label: 'Type', icon: 'handshake' },
  { id: 'participants', label: 'Who', icon: 'people' },
  { id: 'stake', label: 'Stake', icon: 'deposit' },
  { id: 'terms', label: 'Terms', icon: 'terms' },
  { id: 'resolver', label: 'Resolver', icon: 'gavel' },
  { id: 'review', label: 'Review', icon: 'review' }
]

const MARKET_TYPES = [
  { id: 'oneVsOne', label: '1 vs 1', desc: 'Head-to-head bet', icon: 'target' },
  { id: 'smallGroup', label: 'Group', desc: '2-10 friends', icon: 'group' },
  { id: 'eventTracking', label: 'Event', desc: 'Track outcomes', icon: 'trophy' }
]

const RESOLUTION_OPTIONS = [
  { value: ResolutionType.Either, label: 'Either Party', desc: 'Both sides can resolve', icon: 'balance' },
  { value: ResolutionType.Initiator, label: 'Creator Only', desc: 'Only you resolve', icon: 'creator' },
  { value: ResolutionType.Receiver, label: 'Opponent Only', desc: 'They resolve', icon: 'opponent' },
  { value: ResolutionType.ThirdParty, label: 'Arbitrator', desc: 'Trusted third party', icon: 'arbitrator' },
  { value: ResolutionType.AutoPegged, label: 'Linked Market', desc: 'Auto-resolves', icon: 'link' }
]

// Helper to get default dates
const getDefaultEndDateTime = () => {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 16)
}

const getDefaultAcceptanceDeadline = () => {
  const date = new Date()
  date.setHours(date.getHours() + 48)
  return date.toISOString().slice(0, 16)
}

const formatAddress = (addr) => {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const formatUSD = (amount, symbol) => {
  const num = parseFloat(amount) || 0
  const isStablecoin = symbol === 'USC' || symbol === 'USDC' || symbol === 'USDT' || symbol === 'DAI'
  if (isStablecoin) {
    if (num === 0) return '$0.00'
    if (num < 0.01) return '< $0.01'
    return `$${num.toFixed(2)}`
  }
  return `${num} ${symbol || 'tokens'}`
}

// Step icon SVGs
function StepIcon({ type, size = 20 }) {
  const s = size
  switch (type) {
    case 'handshake':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5.4 5.4 0 00-7.65 0l-.77.78-.77-.78a5.4 5.4 0 00-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/></svg>
    case 'people':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
    case 'deposit':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
    case 'terms':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    case 'gavel':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    case 'review':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
    case 'target':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    case 'group':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
    case 'trophy':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 22V8a6 6 0 0112 0v14"/><path d="M8 22V8a6 6 0 0112 0"/></svg>
    case 'balance':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="1 14 12 3 23 14"/></svg>
    case 'creator':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case 'opponent':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/><line x1="21" y1="11" x2="15" y2="11"/></svg>
    case 'arbitrator':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case 'link':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
    case 'qr':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M17 14h4v4h-4zM14 17v4h4"/></svg>
    default:
      return null
  }
}

/**
 * InteractiveAgreementBuilder
 *
 * A step-by-step guided wizard for constructing friend market agreements.
 * Designed mobile-first for users in loud/crowded environments:
 * - Large tap targets, minimal typing
 * - QR scanning for address entry
 * - Visual progress indicator
 * - Review screen with coherent contract summary
 * - Theme-aware (light/dark)
 */
function InteractiveAgreementBuilder({
  account,
  onComplete,
  onCancel,
  hasBookmakerRoles = false,
  submitting = false
}) {
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState({
    marketType: null,
    opponent: '',
    members: [],
    memberInput: '',
    stakeAmount: '10',
    stakeTokenId: 'USC',
    customStakeTokenAddress: '',
    description: '',
    endDateTime: getDefaultEndDateTime(),
    acceptanceDeadline: getDefaultAcceptanceDeadline(),
    minAcceptanceThreshold: 2,
    resolutionType: ResolutionType.Either,
    arbitrator: '',
    enableEncryption: true
  })
  const [errors, setErrors] = useState({})
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrScanTarget, setQrScanTarget] = useState(null)

  const currentStepId = STEPS[currentStep].id

  const selectedToken = useMemo(() => {
    return STAKE_TOKEN_OPTIONS.find(t => t.id === data.stakeTokenId) || STAKE_TOKEN_OPTIONS[0]
  }, [data.stakeTokenId])

  const updateData = useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }, [errors])

  // QR Scanner handlers
  const openQrScanner = (target) => {
    setQrScanTarget(target)
    setQrScannerOpen(true)
  }

  const handleQrScan = useCallback((decodedText) => {
    let address = decodedText

    try {
      const url = new URL(decodedText)
      const pathMatch = url.pathname.match(/0x[a-fA-F0-9]{40}/)
      if (pathMatch) {
        address = pathMatch[0]
      } else {
        const addrParam = url.searchParams.get('address') || url.searchParams.get('addr')
        if (addrParam) address = addrParam
      }
    } catch {
      const addrMatch = decodedText.match(/0x[a-fA-F0-9]{40}/)
      if (addrMatch) address = addrMatch[0]
    }

    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      if (qrScanTarget === 'opponent') {
        updateData('opponent', address)
      } else if (qrScanTarget === 'arbitrator') {
        updateData('arbitrator', address)
      } else if (qrScanTarget === 'member') {
        // Add to members list
        setData(prev => {
          if (prev.members.some(m => m.toLowerCase() === address.toLowerCase())) {
            return prev // Duplicate
          }
          return { ...prev, members: [...prev.members, address] }
        })
      }
    }

    setQrScannerOpen(false)
    setQrScanTarget(null)
  }, [qrScanTarget, updateData])

  // Add a member from the text input
  const addMember = useCallback(() => {
    const addr = data.memberInput.trim()
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      if (!data.members.some(m => m.toLowerCase() === addr.toLowerCase()) &&
          addr.toLowerCase() !== account?.toLowerCase()) {
        setData(prev => ({
          ...prev,
          members: [...prev.members, addr],
          memberInput: ''
        }))
        setErrors(prev => { const n = { ...prev }; delete n.members; return n })
      }
    }
  }, [data.memberInput, data.members, account])

  const removeMember = useCallback((index) => {
    setData(prev => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== index)
    }))
  }, [])

  // Validate current step
  const validateStep = useCallback(() => {
    const newErrors = {}

    switch (currentStepId) {
      case 'type':
        if (!data.marketType) newErrors.marketType = 'Select a market type'
        break

      case 'participants':
        if (data.marketType === 'oneVsOne') {
          if (!data.opponent.trim()) {
            newErrors.opponent = 'Opponent address is required'
          } else if (!/^0x[a-fA-F0-9]{40}$/.test(data.opponent)) {
            newErrors.opponent = 'Invalid Ethereum address'
          } else if (data.opponent.toLowerCase() === account?.toLowerCase()) {
            newErrors.opponent = 'Cannot bet against yourself'
          }
        } else {
          const min = data.marketType === 'eventTracking' ? 3 : 2
          if (data.members.length < min) {
            newErrors.members = `At least ${min} members required`
          } else if (data.members.length > 10) {
            newErrors.members = 'Maximum 10 members'
          }
        }
        break

      case 'stake': {
        const stake = parseFloat(data.stakeAmount)
        if (!data.stakeAmount || stake <= 0) {
          newErrors.stakeAmount = 'Enter a valid stake amount'
        } else if (stake < 0.1) {
          newErrors.stakeAmount = 'Minimum stake is 0.1'
        } else if (stake > 1000) {
          newErrors.stakeAmount = 'Maximum stake is 1000'
        }
        if (data.stakeTokenId === 'CUSTOM' && !/^0x[a-fA-F0-9]{40}$/.test(data.customStakeTokenAddress)) {
          newErrors.customStakeTokenAddress = 'Invalid token address'
        }
        break
      }

      case 'terms': {
        if (!data.description.trim()) {
          newErrors.description = 'Describe the bet'
        } else if (data.description.length < 10) {
          newErrors.description = 'Must be at least 10 characters'
        }
        const endDate = new Date(data.endDateTime)
        const now = new Date()
        if (endDate < new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
          newErrors.endDateTime = 'Must be at least 1 day from now'
        }
        const acceptDate = new Date(data.acceptanceDeadline)
        if (acceptDate < new Date(now.getTime() + 60 * 60 * 1000)) {
          newErrors.acceptanceDeadline = 'Must be at least 1 hour from now'
        } else if (acceptDate >= endDate) {
          newErrors.acceptanceDeadline = 'Must be before end date'
        }
        break
      }

      case 'resolver':
        if (data.resolutionType === ResolutionType.ThirdParty) {
          if (!data.arbitrator.trim()) {
            newErrors.arbitrator = 'Arbitrator address required'
          } else if (!/^0x[a-fA-F0-9]{40}$/.test(data.arbitrator)) {
            newErrors.arbitrator = 'Invalid address'
          }
        } else if (data.resolutionType === ResolutionType.AutoPegged) {
          if (!data.arbitrator.trim()) {
            newErrors.arbitrator = 'Market ID required'
          } else if (!/^\d+$/.test(data.arbitrator.trim())) {
            newErrors.arbitrator = 'Must be a number'
          }
        }
        break

      default:
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [currentStepId, data, account])

  const goNext = useCallback(() => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }, [validateStep])

  const goBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const goToStep = useCallback((index) => {
    // Only allow going back to already-visited steps
    if (index < currentStep) {
      setCurrentStep(index)
    }
  }, [currentStep])

  // Build the form data in the format FriendMarketsModal expects
  const handleFinalize = useCallback(() => {
    const result = {
      marketType: data.marketType,
      description: data.description,
      opponent: data.opponent,
      members: data.members.join(', '),
      memberLimit: String(data.members.length + 1),
      stakeAmount: data.stakeAmount,
      stakeTokenId: data.stakeTokenId,
      customStakeTokenAddress: data.customStakeTokenAddress,
      endDateTime: data.endDateTime,
      acceptanceDeadline: data.acceptanceDeadline,
      minAcceptanceThreshold: String(data.minAcceptanceThreshold),
      resolutionType: data.resolutionType,
      arbitrator: data.arbitrator,
      enableEncryption: data.enableEncryption
    }
    onComplete(result)
  }, [data, onComplete])

  // Resolution type label for review
  const resolutionLabel = useMemo(() => {
    const opt = RESOLUTION_OPTIONS.find(o => o.value === data.resolutionType)
    return opt?.label || 'Unknown'
  }, [data.resolutionType])

  // Participants label for review
  const participantsSummary = useMemo(() => {
    if (data.marketType === 'oneVsOne') {
      return data.opponent ? [data.opponent] : []
    }
    return data.members
  }, [data.marketType, data.opponent, data.members])

  // Render step content
  const renderStep = () => {
    switch (currentStepId) {
      case 'type':
        return renderTypeStep()
      case 'participants':
        return renderParticipantsStep()
      case 'stake':
        return renderStakeStep()
      case 'terms':
        return renderTermsStep()
      case 'resolver':
        return renderResolverStep()
      case 'review':
        return renderReviewStep()
      default:
        return null
    }
  }

  // ========== STEP 1: TYPE ==========
  const renderTypeStep = () => (
    <div className="iab-step-content">
      <h3 className="iab-step-title">What kind of bet?</h3>
      <p className="iab-step-subtitle">Choose how you want to wager</p>
      <div className="iab-type-cards">
        {MARKET_TYPES.map(type => (
          <button
            key={type.id}
            type="button"
            className={`iab-type-card ${data.marketType === type.id ? 'iab-type-selected' : ''}`}
            onClick={() => updateData('marketType', type.id)}
          >
            <div className="iab-type-card-icon">
              <StepIcon type={type.icon} size={28} />
            </div>
            <div className="iab-type-card-text">
              <span className="iab-type-card-label">{type.label}</span>
              <span className="iab-type-card-desc">{type.desc}</span>
            </div>
            {data.marketType === type.id && (
              <div className="iab-type-check">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            )}
          </button>
        ))}
        {hasBookmakerRoles && (
          <button
            type="button"
            className={`iab-type-card iab-type-premium ${data.marketType === 'bookmaker' ? 'iab-type-selected' : ''}`}
            onClick={() => updateData('marketType', 'bookmaker')}
          >
            <div className="iab-type-card-icon">
              <StepIcon type="deposit" size={28} />
            </div>
            <div className="iab-type-card-text">
              <span className="iab-type-card-label">Bookmaker</span>
              <span className="iab-type-card-desc">Custom odds</span>
              <span className="iab-type-card-badge">Premium</span>
            </div>
            {data.marketType === 'bookmaker' && (
              <div className="iab-type-check">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            )}
          </button>
        )}
      </div>
      {errors.marketType && <span className="iab-error">{errors.marketType}</span>}
    </div>
  )

  // ========== STEP 2: PARTICIPANTS ==========
  const renderParticipantsStep = () => (
    <div className="iab-step-content">
      <h3 className="iab-step-title">
        {data.marketType === 'oneVsOne' ? 'Who are you betting against?' : 'Who is in?'}
      </h3>
      <p className="iab-step-subtitle">
        {data.marketType === 'oneVsOne'
          ? 'Enter or scan your opponent\'s address'
          : 'Add group members by address or QR scan'}
      </p>

      {data.marketType === 'oneVsOne' ? (
        <div className="iab-address-entry">
          <div className="iab-address-input-row">
            <input
              type="text"
              className={`iab-input ${errors.opponent ? 'iab-input-error' : ''}`}
              value={data.opponent}
              onChange={(e) => updateData('opponent', e.target.value)}
              placeholder="0x..."
              autoComplete="off"
              spellCheck="false"
            />
            <button
              type="button"
              className="iab-scan-btn"
              onClick={() => openQrScanner('opponent')}
              aria-label="Scan QR code for opponent address"
            >
              <StepIcon type="qr" size={22} />
            </button>
          </div>
          {errors.opponent && <span className="iab-error">{errors.opponent}</span>}
          {data.opponent && /^0x[a-fA-F0-9]{40}$/.test(data.opponent) && (
            <div className="iab-address-preview">
              <StepIcon type="creator" size={16} />
              <span>{formatAddress(data.opponent)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="iab-members-entry">
          <div className="iab-address-input-row">
            <input
              type="text"
              className="iab-input"
              value={data.memberInput}
              onChange={(e) => updateData('memberInput', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMember() } }}
              placeholder="0x..."
              autoComplete="off"
              spellCheck="false"
            />
            <button
              type="button"
              className="iab-scan-btn"
              onClick={() => openQrScanner('member')}
              aria-label="Scan QR code for member address"
            >
              <StepIcon type="qr" size={22} />
            </button>
            <button
              type="button"
              className="iab-add-btn"
              onClick={addMember}
              disabled={!/^0x[a-fA-F0-9]{40}$/.test(data.memberInput.trim())}
              aria-label="Add member"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          {errors.members && <span className="iab-error">{errors.members}</span>}

          {data.members.length > 0 && (
            <div className="iab-members-list">
              {data.members.map((addr, i) => (
                <div key={addr} className="iab-member-chip">
                  <span className="iab-member-index">{i + 1}</span>
                  <span className="iab-member-addr">{formatAddress(addr)}</span>
                  <button
                    type="button"
                    className="iab-member-remove"
                    onClick={() => removeMember(i)}
                    aria-label={`Remove member ${formatAddress(addr)}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <span className="iab-hint">
            {data.members.length} of {data.marketType === 'eventTracking' ? '3-10' : '2-10'} members added
          </span>
        </div>
      )}
    </div>
  )

  // ========== STEP 3: STAKE ==========
  const renderStakeStep = () => (
    <div className="iab-step-content">
      <h3 className="iab-step-title">How much is at stake?</h3>
      <p className="iab-step-subtitle">Set the deposit each participant puts up</p>

      <div className="iab-stake-display">
        <span className="iab-stake-currency">{selectedToken?.icon || '$'}</span>
        <input
          type="number"
          className={`iab-stake-amount ${errors.stakeAmount ? 'iab-input-error' : ''}`}
          value={data.stakeAmount}
          onChange={(e) => updateData('stakeAmount', e.target.value)}
          min="0.1"
          max="1000"
          step="0.01"
          inputMode="decimal"
        />
        <span className="iab-stake-symbol">{selectedToken?.symbol || 'USC'}</span>
      </div>
      {errors.stakeAmount && <span className="iab-error">{errors.stakeAmount}</span>}

      <div className="iab-quick-amounts">
        {['1', '5', '10', '25', '50', '100'].map(amt => (
          <button
            key={amt}
            type="button"
            className={`iab-quick-amt ${data.stakeAmount === amt ? 'iab-quick-amt-active' : ''}`}
            onClick={() => updateData('stakeAmount', amt)}
          >
            {data.stakeTokenId === 'USC' ? `$${amt}` : amt}
          </button>
        ))}
      </div>

      <div className="iab-token-selector">
        <label className="iab-label">Token</label>
        <div className="iab-token-options">
          {STAKE_TOKEN_OPTIONS.filter(t => t.id !== 'CUSTOM').map(token => (
            <button
              key={token.id}
              type="button"
              className={`iab-token-option ${data.stakeTokenId === token.id ? 'iab-token-active' : ''}`}
              onClick={() => updateData('stakeTokenId', token.id)}
            >
              <span className="iab-token-icon">{token.icon}</span>
              <span className="iab-token-sym">{token.symbol}</span>
            </button>
          ))}
          <button
            type="button"
            className={`iab-token-option ${data.stakeTokenId === 'CUSTOM' ? 'iab-token-active' : ''}`}
            onClick={() => updateData('stakeTokenId', 'CUSTOM')}
          >
            <span className="iab-token-icon">🔧</span>
            <span className="iab-token-sym">Custom</span>
          </button>
        </div>
      </div>

      {data.stakeTokenId === 'CUSTOM' && (
        <div className="iab-custom-token">
          <input
            type="text"
            className={`iab-input ${errors.customStakeTokenAddress ? 'iab-input-error' : ''}`}
            value={data.customStakeTokenAddress}
            onChange={(e) => updateData('customStakeTokenAddress', e.target.value)}
            placeholder="Custom token address (0x...)"
          />
          {errors.customStakeTokenAddress && <span className="iab-error">{errors.customStakeTokenAddress}</span>}
        </div>
      )}

      <div className="iab-stake-summary">
        <div className="iab-summary-row">
          <span>Each participant deposits</span>
          <span className="iab-summary-value">{formatUSD(data.stakeAmount, selectedToken?.symbol)}</span>
        </div>
        <div className="iab-summary-row iab-summary-total">
          <span>Total pot ({(data.marketType === 'oneVsOne' ? 2 : data.members.length + 1)} participants)</span>
          <span className="iab-summary-value">
            {formatUSD(
              parseFloat(data.stakeAmount || 0) * (data.marketType === 'oneVsOne' ? 2 : data.members.length + 1),
              selectedToken?.symbol
            )}
          </span>
        </div>
      </div>
    </div>
  )

  // ========== STEP 4: TERMS ==========
  const renderTermsStep = () => (
    <div className="iab-step-content">
      <h3 className="iab-step-title">Define the terms</h3>
      <p className="iab-step-subtitle">What exactly is the bet about?</p>

      <div className="iab-form-group">
        <label className="iab-label" htmlFor="iab-desc">The Bet</label>
        <textarea
          id="iab-desc"
          className={`iab-textarea ${errors.description ? 'iab-input-error' : ''}`}
          value={data.description}
          onChange={(e) => updateData('description', e.target.value)}
          placeholder="e.g., Patriots win the Super Bowl this year"
          rows={3}
          maxLength={200}
        />
        <div className="iab-char-count">{data.description.length}/200</div>
        {errors.description && <span className="iab-error">{errors.description}</span>}
      </div>

      <div className="iab-form-row">
        <div className="iab-form-group iab-form-half">
          <label className="iab-label" htmlFor="iab-end">Market Ends</label>
          <input
            id="iab-end"
            type="datetime-local"
            className={`iab-input iab-datetime ${errors.endDateTime ? 'iab-input-error' : ''}`}
            value={data.endDateTime}
            onChange={(e) => updateData('endDateTime', e.target.value)}
            min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
          />
          {errors.endDateTime && <span className="iab-error">{errors.endDateTime}</span>}
        </div>

        <div className="iab-form-group iab-form-half">
          <label className="iab-label" htmlFor="iab-accept">Accept By</label>
          <input
            id="iab-accept"
            type="datetime-local"
            className={`iab-input iab-datetime ${errors.acceptanceDeadline ? 'iab-input-error' : ''}`}
            value={data.acceptanceDeadline}
            onChange={(e) => updateData('acceptanceDeadline', e.target.value)}
            min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
          />
          {errors.acceptanceDeadline && <span className="iab-error">{errors.acceptanceDeadline}</span>}
        </div>
      </div>

      {(data.marketType === 'smallGroup' || data.marketType === 'eventTracking') && (
        <div className="iab-form-group">
          <label className="iab-label" htmlFor="iab-threshold">Min. Participants to Activate</label>
          <input
            id="iab-threshold"
            type="number"
            className="iab-input iab-input-narrow"
            value={data.minAcceptanceThreshold}
            onChange={(e) => updateData('minAcceptanceThreshold', parseInt(e.target.value, 10) || 2)}
            min={2}
            max={data.members.length + 1}
          />
        </div>
      )}

      <div className="iab-encryption-row">
        <label className="iab-toggle-row">
          <input
            type="checkbox"
            checked={data.enableEncryption}
            onChange={(e) => updateData('enableEncryption', e.target.checked)}
          />
          <span className="iab-toggle-switch"></span>
          <span className="iab-toggle-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Private (Encrypted)
          </span>
        </label>
      </div>
    </div>
  )

  // ========== STEP 5: RESOLVER ==========
  const renderResolverStep = () => (
    <div className="iab-step-content">
      <h3 className="iab-step-title">Who resolves the bet?</h3>
      <p className="iab-step-subtitle">Choose who decides the outcome</p>

      <div className="iab-resolver-options">
        {RESOLUTION_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`iab-resolver-card ${data.resolutionType === opt.value ? 'iab-resolver-selected' : ''}`}
            onClick={() => {
              updateData('resolutionType', opt.value)
              if (opt.value !== ResolutionType.ThirdParty && opt.value !== ResolutionType.AutoPegged) {
                updateData('arbitrator', '')
              }
            }}
          >
            <div className="iab-resolver-icon">
              <StepIcon type={opt.icon} size={24} />
            </div>
            <div className="iab-resolver-text">
              <span className="iab-resolver-label">{opt.label}</span>
              <span className="iab-resolver-desc">{opt.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {data.resolutionType === ResolutionType.ThirdParty && (
        <div className="iab-arbitrator-entry">
          <label className="iab-label">Arbitrator Address</label>
          <div className="iab-address-input-row">
            <input
              type="text"
              className={`iab-input ${errors.arbitrator ? 'iab-input-error' : ''}`}
              value={data.arbitrator}
              onChange={(e) => updateData('arbitrator', e.target.value)}
              placeholder="0x..."
            />
            <button
              type="button"
              className="iab-scan-btn"
              onClick={() => openQrScanner('arbitrator')}
              aria-label="Scan QR code for arbitrator"
            >
              <StepIcon type="qr" size={22} />
            </button>
          </div>
          {errors.arbitrator && <span className="iab-error">{errors.arbitrator}</span>}
        </div>
      )}

      {data.resolutionType === ResolutionType.AutoPegged && (
        <div className="iab-arbitrator-entry">
          <label className="iab-label">Linked Market ID</label>
          <input
            type="text"
            className={`iab-input ${errors.arbitrator ? 'iab-input-error' : ''}`}
            value={data.arbitrator}
            onChange={(e) => updateData('arbitrator', e.target.value)}
            placeholder="e.g., 42"
            inputMode="numeric"
          />
          {errors.arbitrator && <span className="iab-error">{errors.arbitrator}</span>}
          <span className="iab-hint">Auto-resolves based on a public market outcome</span>
        </div>
      )}
    </div>
  )

  // ========== STEP 6: REVIEW ==========
  const renderReviewStep = () => {
    const endDate = new Date(data.endDateTime)
    const acceptDate = new Date(data.acceptanceDeadline)
    const typeLabel = MARKET_TYPES.find(t => t.id === data.marketType)?.label || data.marketType
    const participantCount = data.marketType === 'oneVsOne' ? 2 : data.members.length + 1
    const totalPot = parseFloat(data.stakeAmount || 0) * participantCount

    return (
      <div className="iab-step-content">
        <h3 className="iab-step-title">Review Agreement</h3>
        <p className="iab-step-subtitle">Confirm everything looks correct</p>

        {/* Coherent text summary */}
        <div className="iab-contract-summary">
          <div className="iab-contract-heading">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Escrow Agreement</span>
          </div>
          <p className="iab-contract-text">
            This is a <strong>{typeLabel}</strong> prediction market
            between <strong>{participantCount} participants</strong>.
            Each participant deposits <strong>{formatUSD(data.stakeAmount, selectedToken?.symbol)}</strong> in {selectedToken?.symbol} as escrow.
            The total pot of <strong>{formatUSD(totalPot, selectedToken?.symbol)}</strong> will
            be held until the market resolves.
          </p>
          <p className="iab-contract-text">
            <strong>The bet:</strong> &ldquo;{data.description}&rdquo;
          </p>
          <p className="iab-contract-text">
            Resolution is determined by <strong>{resolutionLabel.toLowerCase()}</strong>
            {data.resolutionType === ResolutionType.ThirdParty && data.arbitrator && (
              <> (<span className="iab-mono">{formatAddress(data.arbitrator)}</span>)</>
            )}
            {data.resolutionType === ResolutionType.AutoPegged && data.arbitrator && (
              <> (linked to market #{data.arbitrator})</>
            )}.
            Participants must accept by <strong>{acceptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>.
            The market closes on <strong>{endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>.
          </p>
          {data.enableEncryption && (
            <p className="iab-contract-privacy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              This agreement is end-to-end encrypted. Only participants can view the terms.
            </p>
          )}
        </div>

        {/* Structured detail cards */}
        <div className="iab-review-cards">
          <div className="iab-review-card" onClick={() => goToStep(1)}>
            <div className="iab-review-card-header">
              <StepIcon type="people" size={16} />
              <span>Participants</span>
              <span className="iab-review-edit">Edit</span>
            </div>
            <div className="iab-review-card-body">
              <div className="iab-review-participant">
                <span className="iab-review-you">You</span>
                <span className="iab-mono">{formatAddress(account)}</span>
              </div>
              {participantsSummary.map((addr, i) => (
                <div key={addr} className="iab-review-participant">
                  <span>{data.marketType === 'oneVsOne' ? 'Opponent' : `Member ${i + 1}`}</span>
                  <span className="iab-mono">{formatAddress(addr)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="iab-review-card" onClick={() => goToStep(2)}>
            <div className="iab-review-card-header">
              <StepIcon type="deposit" size={16} />
              <span>Deposit</span>
              <span className="iab-review-edit">Edit</span>
            </div>
            <div className="iab-review-card-body">
              <div className="iab-review-row">
                <span>Per person</span>
                <span>{formatUSD(data.stakeAmount, selectedToken?.symbol)}</span>
              </div>
              <div className="iab-review-row iab-review-row-bold">
                <span>Total pot</span>
                <span>{formatUSD(totalPot, selectedToken?.symbol)}</span>
              </div>
            </div>
          </div>

          <div className="iab-review-card" onClick={() => goToStep(3)}>
            <div className="iab-review-card-header">
              <StepIcon type="terms" size={16} />
              <span>Terms &amp; Timing</span>
              <span className="iab-review-edit">Edit</span>
            </div>
            <div className="iab-review-card-body">
              <div className="iab-review-row">
                <span>Accept by</span>
                <span>{acceptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="iab-review-row">
                <span>Ends</span>
                <span>{endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          <div className="iab-review-card" onClick={() => goToStep(4)}>
            <div className="iab-review-card-header">
              <StepIcon type="gavel" size={16} />
              <span>Resolution</span>
              <span className="iab-review-edit">Edit</span>
            </div>
            <div className="iab-review-card-body">
              <span>{resolutionLabel}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="iab-container">
      {/* Progress bar */}
      <div className="iab-progress" role="navigation" aria-label="Agreement builder progress">
        {STEPS.map((step, i) => (
          <button
            key={step.id}
            type="button"
            className={`iab-progress-step ${i === currentStep ? 'iab-step-current' : ''} ${i < currentStep ? 'iab-step-done' : ''} ${i > currentStep ? 'iab-step-future' : ''}`}
            onClick={() => goToStep(i)}
            disabled={i > currentStep}
            aria-label={`${step.label}${i < currentStep ? ' (completed)' : i === currentStep ? ' (current)' : ''}`}
            aria-current={i === currentStep ? 'step' : undefined}
          >
            <span className="iab-progress-dot">
              {i < currentStep ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <span>{i + 1}</span>
              )}
            </span>
            <span className="iab-progress-label">{step.label}</span>
          </button>
        ))}
        <div
          className="iab-progress-bar"
          style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
          role="progressbar"
          aria-valuenow={currentStep + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        />
      </div>

      {/* Step content */}
      <div className="iab-body">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="iab-nav">
        {currentStep > 0 ? (
          <button type="button" className="iab-nav-back" onClick={goBack} disabled={submitting}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
        ) : (
          <button type="button" className="iab-nav-back" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}

        {currentStep < STEPS.length - 1 ? (
          <button type="button" className="iab-nav-next" onClick={goNext} disabled={submitting}>
            Next
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="iab-nav-submit"
            onClick={handleFinalize}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="iab-spinner"></span>
                Creating...
              </>
            ) : (
              'Create Market'
            )}
          </button>
        )}
      </div>

      {/* QR Scanner modal */}
      <QRScanner
        isOpen={qrScannerOpen}
        onClose={() => { setQrScannerOpen(false); setQrScanTarget(null) }}
        onScanSuccess={handleQrScan}
      />
    </div>
  )
}

export default InteractiveAgreementBuilder
