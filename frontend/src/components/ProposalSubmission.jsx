import { useState, useRef } from 'react'
import { ethers } from 'ethers'

function ProposalSubmission({ provider, signer }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    fundingAmount: '',
    recipient: '',
    welfareMetricId: '0',
    fundingToken: '',
    startDate: '',
    executionDeadline: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  
  // Refs for focus management
  const titleRef = useRef(null)
  const descriptionRef = useRef(null)
  const fundingAmountRef = useRef(null)
  const recipientRef = useRef(null)
  const executionDeadlineRef = useRef(null)

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Proposal title is required'
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must be 100 characters or less'
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }
    
    if (!formData.fundingAmount || parseFloat(formData.fundingAmount) <= 0) {
      newErrors.fundingAmount = 'Funding amount must be greater than 0'
    } else if (parseFloat(formData.fundingAmount) > 50000) {
      newErrors.fundingAmount = 'Funding amount cannot exceed 50,000 tokens'
    }
    
    if (!formData.recipient.trim()) {
      newErrors.recipient = 'Recipient address is required'
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.recipient)) {
      newErrors.recipient = 'Invalid Ethereum address format'
    }
    
    if (formData.fundingToken && !/^0x[a-fA-F0-9]{40}$/.test(formData.fundingToken)) {
      newErrors.fundingToken = 'Invalid token address format'
    }
    
    if (!formData.executionDeadline) {
      newErrors.executionDeadline = 'Execution deadline is required'
    }
    
    setErrors(newErrors)
    
    // Focus first error field
    if (newErrors.title) titleRef.current?.focus()
    else if (newErrors.description) descriptionRef.current?.focus()
    else if (newErrors.fundingAmount) fundingAmountRef.current?.focus()
    else if (newErrors.recipient) recipientRef.current?.focus()
    else if (newErrors.executionDeadline) executionDeadlineRef.current?.focus()
    
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    setSubmitting(true)
    setErrors({})

    try {
      // In a real implementation, this would interact with the ProposalRegistry contract
      alert('Proposal submission functionality requires deployed contracts. This is a demonstration UI.')
      console.log('Proposal data:', formData)
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        fundingAmount: '',
        recipient: '',
        welfareMetricId: '0',
        fundingToken: '',
        startDate: '',
        executionDeadline: ''
      })
    } catch (error) {
      console.error('Error submitting proposal:', error)
      setErrors({ submit: 'Failed to submit proposal: ' + error.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const formatDateForInput = (date) => {
    return date ? new Date(date).toISOString().slice(0, 16) : ''
  }

  return (
    <div className="proposal-submission">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">
            Proposal Title
            <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={titleRef}
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter proposal title (max 100 characters)"
            maxLength="100"
            required
            aria-required="true"
            aria-describedby="title-help"
            aria-invalid={errors.title ? "true" : "false"}
          />
          <small id="title-help">Brief, descriptive title for your proposal (max 100 characters)</small>
          {errors.title && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.title}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="description">
            Description
            <span className="required" aria-label="required">*</span>
          </label>
          <textarea
            ref={descriptionRef}
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Detailed proposal description"
            rows="4"
            required
            aria-required="true"
            aria-describedby="description-help"
            aria-invalid={errors.description ? "true" : "false"}
          />
          <small id="description-help">Detailed explanation of the proposal and its benefits</small>
          {errors.description && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.description}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="fundingToken">Funding Token</label>
          <input
            type="text"
            id="fundingToken"
            name="fundingToken"
            value={formData.fundingToken}
            onChange={handleChange}
            placeholder="0x... (leave empty for native token)"
            pattern="^$|^0x[a-fA-F0-9]{40}$"
            aria-describedby="funding-token-help"
            aria-invalid={errors.fundingToken ? "true" : "false"}
          />
          <small id="funding-token-help">Enter ERC20 token address, or leave empty for native token (ETH/ETC)</small>
          {errors.fundingToken && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.fundingToken}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="fundingAmount">
            Funding Amount
            <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={fundingAmountRef}
            type="number"
            id="fundingAmount"
            name="fundingAmount"
            value={formData.fundingAmount}
            onChange={handleChange}
            placeholder="Amount in tokens"
            step="0.01"
            min="0"
            max="50000"
            required
            aria-required="true"
            aria-describedby="funding-amount-help"
            aria-invalid={errors.fundingAmount ? "true" : "false"}
          />
          <small id="funding-amount-help">Maximum: 50,000 tokens per proposal</small>
          {errors.fundingAmount && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.fundingAmount}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="recipient">
            Recipient Address
            <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={recipientRef}
            type="text"
            id="recipient"
            name="recipient"
            value={formData.recipient}
            onChange={handleChange}
            placeholder="0x..."
            pattern="^0x[a-fA-F0-9]{40}$"
            required
            aria-required="true"
            aria-describedby="recipient-help"
            aria-invalid={errors.recipient ? "true" : "false"}
          />
          <small id="recipient-help">Ethereum address that will receive the funds</small>
          {errors.recipient && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.recipient}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="startDate">Start Date (Optional)</label>
          <input
            type="datetime-local"
            id="startDate"
            name="startDate"
            value={formData.startDate}
            onChange={handleChange}
            min={new Date().toISOString().slice(0, 16)}
            aria-describedby="start-date-help"
          />
          <small id="start-date-help">Earliest date the proposal can be executed (leave empty for immediate)</small>
        </div>

        <div className="form-group">
          <label htmlFor="executionDeadline">
            Execution Deadline
            <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={executionDeadlineRef}
            type="datetime-local"
            id="executionDeadline"
            name="executionDeadline"
            value={formData.executionDeadline}
            onChange={handleChange}
            min={new Date().toISOString().slice(0, 16)}
            required
            aria-required="true"
            aria-describedby="execution-deadline-help"
            aria-invalid={errors.executionDeadline ? "true" : "false"}
          />
          <small id="execution-deadline-help">Latest date the proposal can be executed</small>
          {errors.executionDeadline && (
            <span 
              className="error-text" 
              role="alert"
              aria-live="assertive"
            >
              {errors.executionDeadline}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="welfareMetricId">Welfare Metric *</label>
          <select
            id="welfareMetricId"
            name="welfareMetricId"
            value={formData.welfareMetricId}
            onChange={handleChange}
            required
          >
            <option value="0">Treasury Value (Primary)</option>
            <option value="1">Network Activity (Secondary)</option>
            <option value="2">Hash Rate Security (Tertiary)</option>
            <option value="3">Developer Activity (Quaternary)</option>
          </select>
        </div>

        <div className="bond-notice">
          <strong>⚠️ Important:</strong>
          <ul>
            <li>Submitting a proposal requires a bond of 50 ETC</li>
            <li>You must set an execution deadline to ensure time-bound execution</li>
            <li>Treasury must have approved tokens if using ERC20</li>
          </ul>
        </div>

        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Submitting...' : 'Submit Proposal'}
        </button>
      </form>
    </div>
  )
}

export default ProposalSubmission
