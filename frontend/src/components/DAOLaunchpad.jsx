import { useState } from 'react'
import { ethers } from 'ethers'
import './DAOLaunchpad.css'
import { useEthers } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'

const DAOFactoryABI = [
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'

function DAOLaunchpad({ onDAOCreated }) {
  const { signer } = useEthers()
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    treasuryVault: '',
    admins: ''
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    setError('')
    setSuccess('')
  }

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('DAO name is required')
      return false
    }

    if (formData.name.length < 3) {
      setError('DAO name must be at least 3 characters')
      return false
    }

    if (!formData.description.trim()) {
      setError('DAO description is required')
      return false
    }

    if (!formData.treasuryVault) {
      setError('Treasury vault address is required')
      return false
    }

    try {
      ethers.getAddress(formData.treasuryVault)
    } catch {
      setError('Invalid treasury vault address')
      return false
    }

    if (formData.admins) {
      const adminAddresses = formData.admins.split(',').map(a => a.trim()).filter(a => a)
      for (const addr of adminAddresses) {
        try {
          ethers.getAddress(addr)
        } catch {
          setError(`Invalid admin address: ${addr}`)
          return false
        }
      }
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setCreating(true)
      setError('')
      setSuccess('')

      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, signer)

      // Parse admin addresses
      const adminAddresses = formData.admins
        ? formData.admins.split(',').map(a => a.trim()).filter(a => a)
        : []

      // Create DAO
      const tx = await factory.createDAO(
        formData.name,
        formData.description,
        formData.treasuryVault,
        adminAddresses
      )

      setSuccess('Transaction submitted! Waiting for confirmation...')

      const receipt = await tx.wait()
      
      setSuccess('DAO created successfully!')
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        treasuryVault: '',
        admins: ''
      })

      // Callback to refresh DAO list
      if (onDAOCreated) {
        setTimeout(() => onDAOCreated(), 2000)
      }

    } catch (err) {
      console.error('Error creating DAO:', err)
      setError(err.message || 'Failed to create DAO')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="launchpad-container">
      <div className="launchpad-header">
        <h2>🚀 Launch a New DAO</h2>
        <p>Deploy a complete DAO instance with all governance components</p>
      </div>

      <form onSubmit={handleSubmit} className="launchpad-form">
        <div className="form-group">
          <label htmlFor="name">DAO Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="My Prediction DAO"
            disabled={creating}
            required
          />
          <span className="form-hint">A clear, descriptive name for your DAO</span>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description *</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="A decentralized organization for prediction-based governance..."
            rows={4}
            disabled={creating}
            required
          />
          <span className="form-hint">Explain the purpose and goals of your DAO</span>
        </div>

        <div className="form-group">
          <label htmlFor="treasuryVault">Treasury Vault Address *</label>
          <input
            type="text"
            id="treasuryVault"
            name="treasuryVault"
            value={formData.treasuryVault}
            onChange={handleInputChange}
            placeholder="0x..."
            disabled={creating}
            required
          />
          <span className="form-hint">Contract address for the DAO treasury</span>
        </div>

        <div className="form-group">
          <label htmlFor="admins">Admin Addresses (Optional)</label>
          <input
            type="text"
            id="admins"
            name="admins"
            value={formData.admins}
            onChange={handleInputChange}
            placeholder="0x123..., 0x456..."
            disabled={creating}
          />
          <span className="form-hint">Comma-separated list of admin addresses. You'll be added automatically.</span>
        </div>

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span className="alert-icon">✅</span>
            <span>{success}</span>
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="submit-btn"
            disabled={creating}
          >
            {creating ? 'Creating DAO...' : 'Launch DAO'}
          </button>
        </div>

        <div className="info-box">
          <h4>📋 What gets deployed:</h4>
          <ul>
            <li>FutarchyGovernor - Main governance coordinator</li>
            <li>WelfareMetricRegistry - Welfare metrics management</li>
            <li>ProposalRegistry - Proposal submission & tracking</li>
            <li>ConditionalMarketFactory - Prediction markets</li>
            <li>PrivacyCoordinator - Privacy mechanisms</li>
            <li>OracleResolver - Oracle resolution system</li>
            <li>RagequitModule - Minority protection</li>
          </ul>
        </div>
      </form>
    </div>
  )
}

export default DAOLaunchpad
