import { useState } from 'react'
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

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
      alert('Failed to submit proposal: ' + error.message)
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
          <label htmlFor="title">Proposal Title *</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter proposal title (max 100 characters)"
            maxLength="100"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description *</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Detailed proposal description"
            rows="4"
            required
          />
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
          />
          <small>Enter ERC20 token address, or leave empty for native token (ETH/ETC)</small>
        </div>

        <div className="form-group">
          <label htmlFor="fundingAmount">Funding Amount *</label>
          <input
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
          />
          <small>Maximum: 50,000 tokens per proposal</small>
        </div>

        <div className="form-group">
          <label htmlFor="recipient">Recipient Address *</label>
          <input
            type="text"
            id="recipient"
            name="recipient"
            value={formData.recipient}
            onChange={handleChange}
            placeholder="0x..."
            pattern="^0x[a-fA-F0-9]{40}$"
            required
          />
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
          />
          <small>Earliest date the proposal can be executed (leave empty for immediate)</small>
        </div>

        <div className="form-group">
          <label htmlFor="executionDeadline">Execution Deadline *</label>
          <input
            type="datetime-local"
            id="executionDeadline"
            name="executionDeadline"
            value={formData.executionDeadline}
            onChange={handleChange}
            min={new Date().toISOString().slice(0, 16)}
            required
          />
          <small className="required-field">Required: Latest date the proposal can be executed</small>
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
