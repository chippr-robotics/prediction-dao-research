import { useState, useCallback, useEffect } from 'react'
import { useTokenCreation, TxState } from '../../../hooks/useTokenCreation'
import StepIndicator from './StepIndicator'
import TokenTypeStep from './TokenTypeStep'
import ConfigurationStep from './ConfigurationStep'
import ReviewStep from './ReviewStep'
import './TokenCreationModal.css'

/**
 * TokenCreationModal Component
 *
 * Modern, minimalist token creation modal with 3-step wizard flow.
 * Full web3 integration for deploying ERC-20 and ERC-721 tokens.
 *
 * Steps:
 * 1. Token Type Selection (ERC-20 vs ERC-721)
 * 2. Configuration (name, symbol, features)
 * 3. Review & Deploy (summary, gas estimate, transaction)
 */

const STEPS = [
  { id: 'type', label: 'Token Type' },
  { id: 'config', label: 'Configuration' },
  { id: 'review', label: 'Review & Deploy' }
]

const DEFAULT_FORM_DATA = {
  name: '',
  symbol: '',
  initialSupply: '',
  decimals: 18,
  metadataURI: '',
  isBurnable: false,
  isPausable: false,
  listOnETCSwap: false
}

function TokenCreationModal({ isOpen, onClose, onSuccess }) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(0)
  const [tokenType, setTokenType] = useState('ERC20')
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA)
  const [errors, setErrors] = useState({})

  // Web3 integration
  const {
    isConnected,
    isCorrectNetwork,
    walletAddress,
    isContractDeployed,
    txState,
    txHash,
    txError,
    createdToken,
    createToken,
    resetTxState,
    getExplorerUrl
  } = useTokenCreation()

  // Reset form when modal opens/closes
  const resetForm = useCallback(() => {
    setCurrentStep(0)
    setTokenType('ERC20')
    setFormData(DEFAULT_FORM_DATA)
    setErrors({})
    resetTxState()
  }, [resetTxState])

  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow close animation
      const timer = setTimeout(resetForm, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen, resetForm])

  // Validation
  const validateStep = useCallback((step) => {
    const newErrors = {}

    if (step === 0) {
      // Token type is always valid (has default)
    }

    if (step === 1) {
      // Name validation
      if (!formData.name.trim()) {
        newErrors.name = 'Token name is required'
      } else if (formData.name.length < 2) {
        newErrors.name = 'Name must be at least 2 characters'
      } else if (formData.name.length > 50) {
        newErrors.name = 'Name must be under 50 characters'
      }

      // Symbol validation
      if (!formData.symbol.trim()) {
        newErrors.symbol = 'Symbol is required'
      } else if (!/^[A-Z0-9]+$/.test(formData.symbol)) {
        newErrors.symbol = 'Symbol must be uppercase letters and numbers only'
      } else if (formData.symbol.length > 11) {
        newErrors.symbol = 'Symbol must be under 11 characters'
      }

      // Initial supply validation (ERC-20 only)
      if (tokenType === 'ERC20') {
        if (!formData.initialSupply) {
          newErrors.initialSupply = 'Initial supply is required'
        } else {
          const supply = parseInt(formData.initialSupply)
          if (isNaN(supply) || supply <= 0) {
            newErrors.initialSupply = 'Supply must be a positive number'
          } else if (supply > 1e18) {
            newErrors.initialSupply = 'Supply exceeds maximum allowed'
          }
        }
      }

      // Metadata URI validation (optional but must be valid if provided)
      if (formData.metadataURI.trim()) {
        const uri = formData.metadataURI.trim()
        if (!uri.startsWith('ipfs://') && !uri.startsWith('https://')) {
          newErrors.metadataURI = 'URI must start with ipfs:// or https://'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, tokenType])

  // Step indicator click handler
  const handleStepClick = useCallback((stepIndex) => {
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex)
    } else if (stepIndex === currentStep + 1 && validateStep(currentStep)) {
      setCurrentStep(stepIndex)
    }
  }, [currentStep, validateStep])

  // Deploy token
  const handleDeploy = useCallback(async () => {
    if (!validateStep(1)) {
      setCurrentStep(1)
      return
    }

    try {
      const result = await createToken({
        tokenType,
        ...formData
      })

      // Call onSuccess callback if provided
      if (onSuccess && result) {
        onSuccess(result)
      }
    } catch (error) {
      console.error('Token creation failed:', error)
    }
  }, [createToken, tokenType, formData, validateStep, onSuccess])

  // Close handler
  const handleClose = useCallback(() => {
    // Don't allow closing during transaction
    if (txState === TxState.PENDING_SIGNATURE || txState === TxState.PENDING_CONFIRMATION) {
      return
    }
    onClose()
  }, [txState, onClose])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  // Handle backdrop click - only close if clicking directly on overlay
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [handleClose])

  if (!isOpen) return null

  const isDeploying = txState === TxState.PENDING_SIGNATURE || txState === TxState.PENDING_CONFIRMATION
  const isSuccess = txState === TxState.SUCCESS

  return (
    <div
      className="tcm-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcm-title"
    >
      <div className="tcm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="tcm-header">
          <h2 id="tcm-title">
            {isSuccess ? 'Token Created' : 'Create Token'}
          </h2>
          <button
            type="button"
            className="tcm-close-btn"
            onClick={handleClose}
            disabled={isDeploying}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Step Indicator (hide on success) */}
        {!isSuccess && (
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={handleStepClick}
          />
        )}

        {/* Content */}
        <div className="tcm-content">
          {currentStep === 0 && (
            <TokenTypeStep
              tokenType={tokenType}
              onTokenTypeChange={setTokenType}
              disabled={isDeploying}
            />
          )}

          {currentStep === 1 && (
            <ConfigurationStep
              tokenType={tokenType}
              formData={formData}
              onFormChange={setFormData}
              errors={errors}
              disabled={isDeploying}
            />
          )}

          {currentStep === 2 && (
            <ReviewStep
              tokenType={tokenType}
              formData={formData}
              txState={txState}
              txHash={txHash}
              txError={txError}
              createdToken={createdToken}
              walletAddress={walletAddress}
              isCorrectNetwork={isCorrectNetwork}
              isContractDeployed={isContractDeployed}
              getExplorerUrl={getExplorerUrl}
              disabled={isDeploying || !isContractDeployed}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="tcm-footer">
          <div className="tcm-footer-left">
            {currentStep > 0 && !isSuccess && (
              <button
                type="button"
                className="tcm-btn-secondary"
                onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))}
                disabled={isDeploying}
              >
                Back
              </button>
            )}
          </div>

          <div className="tcm-footer-right">
            {isSuccess ? (
              <button
                type="button"
                className="tcm-btn-primary"
                onClick={handleClose}
              >
                Done
              </button>
            ) : currentStep < STEPS.length - 1 ? (
              <button
                type="button"
                className="tcm-btn-primary"
                onClick={() => {
                  if (validateStep(currentStep)) {
                    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1))
                  }
                }}
                disabled={isDeploying}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="tcm-btn-primary tcm-btn-deploy"
                onClick={handleDeploy}
                disabled={isDeploying || !isConnected || !isCorrectNetwork}
              >
                {isDeploying && <span className="tcm-spinner" />}
                {txState === TxState.PENDING_SIGNATURE
                  ? 'Confirm in Wallet...'
                  : txState === TxState.PENDING_CONFIRMATION
                    ? 'Deploying...'
                    : 'Deploy Token'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

export default TokenCreationModal
