import { useState, useRef } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import './MarketCreation.css'

function MarketCreation() {
  const { isConnected } = useWeb3()
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    tradingEndTime: '',
    resolutionDate: '',
    initialLiquidity: '',
    resolutionCriteria: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  
  const questionRef = useRef(null)

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.question.trim()) {
      newErrors.question = 'Market question is required'
    } else if (formData.question.length < 10) {
      newErrors.question = 'Question must be at least 10 characters'
    } else if (formData.question.length > 200) {
      newErrors.question = 'Question must be less than 200 characters'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Market description is required'
    } else if (formData.description.length < 50) {
      newErrors.description = 'Description must be at least 50 characters'
    }

    if (!formData.tradingEndTime) {
      newErrors.tradingEndTime = 'Trading end time is required'
    } else {
      const tradingEnd = new Date(formData.tradingEndTime)
      const now = new Date()
      if (tradingEnd <= now) {
        newErrors.tradingEndTime = 'Trading end time must be in the future'
      }
    }

    if (!formData.resolutionDate) {
      newErrors.resolutionDate = 'Resolution date is required'
    } else {
      const resolutionDate = new Date(formData.resolutionDate)
      const tradingEnd = new Date(formData.tradingEndTime)
      if (resolutionDate <= tradingEnd) {
        newErrors.resolutionDate = 'Resolution date must be after trading ends'
      }
    }

    if (!formData.initialLiquidity) {
      newErrors.initialLiquidity = 'Initial liquidity is required'
    } else if (parseFloat(formData.initialLiquidity) < 100) {
      newErrors.initialLiquidity = 'Minimum liquidity is 100 ETC'
    } else if (parseFloat(formData.initialLiquidity) > 1000000) {
      newErrors.initialLiquidity = 'Maximum liquidity is 1,000,000 ETC'
    }

    if (!formData.resolutionCriteria.trim()) {
      newErrors.resolutionCriteria = 'Resolution criteria is required'
    } else if (formData.resolutionCriteria.length < 20) {
      newErrors.resolutionCriteria = 'Resolution criteria must be at least 20 characters'
    }

    setErrors(newErrors)

    // Focus first error field
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0]
      // Focus the first field with an error
      if (firstErrorField === 'question' && questionRef.current) {
        questionRef.current.focus()
      }
      // Additional field refs can be added here as needed for complete focus management
    }

    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      alert('Please connect your wallet to create a market')
      return
    }

    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      // In production, this would interact with ConditionalMarketFactory contract
      // Mock delay to simulate transaction processing
      const MOCK_TRANSACTION_DELAY_MS = 1500
      await new Promise(resolve => setTimeout(resolve, MOCK_TRANSACTION_DELAY_MS))

      alert(`Market Creation functionality requires deployed contracts.

Market Details:
- Question: ${formData.question}
- Trading Ends: ${new Date(formData.tradingEndTime).toLocaleString()}
- Resolution Date: ${new Date(formData.resolutionDate).toLocaleString()}
- Initial Liquidity: ${formData.initialLiquidity} ETC

This would:
1. Create a new prediction market contract
2. Deploy PASS/FAIL token pairs
3. Initialize liquidity pool
4. Set resolution parameters
5. Return market ID and contract address`)

      // Reset form
      setFormData({
        question: '',
        description: '',
        tradingEndTime: '',
        resolutionDate: '',
        initialLiquidity: '',
        resolutionCriteria: ''
      })
      setErrors({})
    } catch (error) {
      console.error('Error creating market:', error)
      alert('Failed to create market: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="market-creation">
      <div className="creation-header">
        <h2>Create a Prediction Market</h2>
        <p className="header-description">
          Launch your own prediction market with custom parameters and resolution criteria.
          Your market will be accessible to all FairWins users.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="creation-form" noValidate>
        <div className="form-section">
          <h3>Market Question</h3>
          
          <div className="form-group">
            <label htmlFor="question">
              Question
              <span className="required" aria-label="required">*</span>
            </label>
            <input
              ref={questionRef}
              id="question"
              type="text"
              value={formData.question}
              onChange={(e) => handleChange('question', e.target.value)}
              placeholder="e.g., Will Bitcoin reach $100,000 by end of 2025?"
              required
              aria-required="true"
              aria-invalid={errors.question ? "true" : "false"}
              aria-describedby={errors.question ? "question-error" : "question-help"}
              maxLength={200}
            />
            <small id="question-help" className="helper-text">
              Be specific and clear about what you're predicting (10-200 characters)
            </small>
            {errors.question && (
              <span 
                id="question-error"
                className="error-text" 
                role="alert"
                aria-live="assertive"
              >
                {errors.question}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">
              Description
              <span className="required" aria-label="required">*</span>
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Provide detailed context about the prediction, data sources, and any relevant background information..."
              rows="5"
              required
              aria-required="true"
              aria-invalid={errors.description ? "true" : "false"}
              aria-describedby={errors.description ? "description-error" : "description-help"}
            />
            <small id="description-help" className="helper-text">
              Provide context and background (minimum 50 characters)
            </small>
            {errors.description && (
              <span 
                id="description-error"
                className="error-text" 
                role="alert"
                aria-live="assertive"
              >
                {errors.description}
              </span>
            )}
          </div>
        </div>

        <div className="form-section">
          <h3>Market Timing</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tradingEndTime">
                Trading Ends
                <span className="required" aria-label="required">*</span>
              </label>
              <input
                id="tradingEndTime"
                type="datetime-local"
                value={formData.tradingEndTime}
                onChange={(e) => handleChange('tradingEndTime', e.target.value)}
                required
                aria-required="true"
                aria-invalid={errors.tradingEndTime ? "true" : "false"}
                aria-describedby={errors.tradingEndTime ? "tradingEndTime-error" : "tradingEndTime-help"}
              />
              <small id="tradingEndTime-help" className="helper-text">
                When should trading stop?
              </small>
              {errors.tradingEndTime && (
                <span 
                  id="tradingEndTime-error"
                  className="error-text" 
                  role="alert"
                  aria-live="assertive"
                >
                  {errors.tradingEndTime}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="resolutionDate">
                Resolution Date
                <span className="required" aria-label="required">*</span>
              </label>
              <input
                id="resolutionDate"
                type="datetime-local"
                value={formData.resolutionDate}
                onChange={(e) => handleChange('resolutionDate', e.target.value)}
                required
                aria-required="true"
                aria-invalid={errors.resolutionDate ? "true" : "false"}
                aria-describedby={errors.resolutionDate ? "resolutionDate-error" : "resolutionDate-help"}
              />
              <small id="resolutionDate-help" className="helper-text">
                When will the outcome be known?
              </small>
              {errors.resolutionDate && (
                <span 
                  id="resolutionDate-error"
                  className="error-text" 
                  role="alert"
                  aria-live="assertive"
                >
                  {errors.resolutionDate}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Market Parameters</h3>
          
          <div className="form-group">
            <label htmlFor="initialLiquidity">
              Initial Liquidity (ETC)
              <span className="required" aria-label="required">*</span>
            </label>
            <input
              id="initialLiquidity"
              type="number"
              value={formData.initialLiquidity}
              onChange={(e) => handleChange('initialLiquidity', e.target.value)}
              placeholder="1000"
              min="100"
              max="1000000"
              step="0.01"
              required
              aria-required="true"
              aria-invalid={errors.initialLiquidity ? "true" : "false"}
              aria-describedby={errors.initialLiquidity ? "initialLiquidity-error" : "initialLiquidity-help"}
            />
            <small id="initialLiquidity-help" className="helper-text">
              Minimum 100 ETC, Maximum 1,000,000 ETC
            </small>
            {errors.initialLiquidity && (
              <span 
                id="initialLiquidity-error"
                className="error-text" 
                role="alert"
                aria-live="assertive"
              >
                {errors.initialLiquidity}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="resolutionCriteria">
              Resolution Criteria
              <span className="required" aria-label="required">*</span>
            </label>
            <textarea
              id="resolutionCriteria"
              value={formData.resolutionCriteria}
              onChange={(e) => handleChange('resolutionCriteria', e.target.value)}
              placeholder="Specify exactly how the market will be resolved. Include data sources and clear conditions..."
              rows="4"
              required
              aria-required="true"
              aria-invalid={errors.resolutionCriteria ? "true" : "false"}
              aria-describedby={errors.resolutionCriteria ? "resolutionCriteria-error" : "resolutionCriteria-help"}
            />
            <small id="resolutionCriteria-help" className="helper-text">
              Clear, verifiable criteria for determining the outcome (minimum 20 characters)
            </small>
            {errors.resolutionCriteria && (
              <span 
                id="resolutionCriteria-error"
                className="error-text" 
                role="alert"
                aria-live="assertive"
              >
                {errors.resolutionCriteria}
              </span>
            )}
          </div>
        </div>

        <div className="info-notice" role="note">
          <span aria-hidden="true">ℹ️</span>
          <div className="notice-content">
            <strong>Important:</strong> Creating a market requires staking collateral that 
            will be returned after proper resolution. Make sure your resolution criteria 
            are clear and verifiable. Improper resolution may result in disputes and 
            collateral forfeiture.
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="create-button"
            disabled={submitting}
          >
            {submitting ? 'Creating Market...' : 'Create Market'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default MarketCreation
