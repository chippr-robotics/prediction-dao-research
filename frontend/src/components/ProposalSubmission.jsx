import { useState } from 'react'

function ProposalSubmission({ provider, signer }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    fundingAmount: '',
    recipient: '',
    welfareMetricId: '0'
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
        welfareMetricId: '0'
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

  return (
    <div className="proposal-submission">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Proposal Title</label>
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
          <label htmlFor="description">Description</label>
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
          <label htmlFor="fundingAmount">Funding Amount (ETC)</label>
          <input
            type="number"
            id="fundingAmount"
            name="fundingAmount"
            value={formData.fundingAmount}
            onChange={handleChange}
            placeholder="Amount in ETC"
            step="0.01"
            min="0"
            max="50000"
            required
          />
          <small>Maximum: 50,000 ETC per proposal</small>
        </div>

        <div className="form-group">
          <label htmlFor="recipient">Recipient Address</label>
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
          <label htmlFor="welfareMetricId">Welfare Metric</label>
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
          <strong>Note:</strong> Submitting a proposal requires a bond of 50 ETC
        </div>

        <button type="submit" disabled={submitting} className="submit-button">
          {submitting ? 'Submitting...' : 'Submit Proposal'}
        </button>
      </form>
    </div>
  )
}

export default ProposalSubmission
