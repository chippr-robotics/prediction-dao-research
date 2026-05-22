import { useState } from 'react'
import PropTypes from 'prop-types'
import { ethers } from 'ethers'
import { useEthers, useAccount } from '../../hooks/useWeb3'
import { getContractAddress } from '../../config/contracts'

const DAOFactoryABI = [
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

// Check for factory address from environment or deployed config
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || import.meta.env.VITE_DAO_FACTORY_ADDRESS || getContractAddress('daoFactory')

// Helper to check if factory is deployed
const isFactoryDeployed = () => {
  return FACTORY_ADDRESS && FACTORY_ADDRESS !== ethers.ZeroAddress
}

/**
 * Launch DAO form component
 * Shared component for creating new DAOs via the DAOFactory contract.
 *
 * @param {Object} props - Component props
 * @param {() => void} props.onSuccess - Callback when DAO is successfully created
 * @param {boolean} [props.hasClearPathRole=false] - Whether user has ClearPath membership
 * @param {boolean} [props.isWalletConnected=false] - Whether wallet is connected
 */
function LaunchDAOForm({ onSuccess, hasClearPathRole = false, isWalletConnected = false }) {
  const { signer } = useEthers()
  const { account, isConnected } = useAccount()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    treasuryVault: '',
    admins: ''
  })
  const [errors, setErrors] = useState({})
  const [creating, setCreating] = useState(false)

  // Determine if the form should be disabled (use prop or hook value)
  const walletConnected = isWalletConnected || isConnected
  const canCreateDAO = walletConnected && hasClearPathRole && isFactoryDeployed()

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.name.trim()) {
      newErrors.name = 'DAO name is required'
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters'
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters'
    }
    const treasuryVaultAddress = formData.treasuryVault.trim()
    if (treasuryVaultAddress && !ethers.isAddress(treasuryVaultAddress)) {
      newErrors.treasuryVault = 'Treasury vault must be a valid Ethereum address'
    }
    const adminsInput = formData.admins.trim()
    if (adminsInput) {
      const adminAddresses = adminsInput.split(',').map(addr => addr.trim()).filter(Boolean)
      for (const addr of adminAddresses) {
        if (!ethers.isAddress(addr)) {
          newErrors.admins = 'All admin addresses must be valid Ethereum addresses'
          break
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    // Check factory deployment
    if (!isFactoryDeployed()) {
      setErrors({ submit: 'DAO Factory contract is not deployed on this network. DAO creation is temporarily unavailable.' })
      return
    }

    // Check wallet connection
    if (!walletConnected || !signer || !account) {
      setErrors({ submit: 'Please connect your wallet to create a DAO' })
      return
    }

    // Check ClearPath role
    if (!hasClearPathRole) {
      setErrors({ submit: 'ClearPath membership is required to create DAOs. Please upgrade your membership.' })
      return
    }

    setCreating(true)
    try {
      // Create contract instance with signer
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, signer)

      // Parse admin addresses
      const adminAddresses = formData.admins
        ? formData.admins.split(',').map(a => a.trim()).filter(a => a)
        : []

      // Determine treasury vault address
      // If empty, use a zero address which the contract should handle
      const treasuryAddress = formData.treasuryVault.trim() || ethers.ZeroAddress

      // Create DAO transaction
      const tx = await factory.createDAO(
        formData.name,
        formData.description,
        treasuryAddress,
        adminAddresses
      )

      // Wait for transaction confirmation
      const receipt = await tx.wait()

      // Check if transaction was successful
      if (receipt.status === 1) {
        // Clear form data
        setFormData({
          name: '',
          description: '',
          treasuryVault: '',
          admins: ''
        })
        setErrors({})

        // Call success callback to refresh DAO list and switch tabs
        onSuccess()
      } else {
        throw new Error('Transaction failed')
      }
    } catch (err) {
      console.error('Error creating DAO:', err)

      // Handle common error cases
      let errorMessage = 'Failed to create DAO'

      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        errorMessage = 'Transaction was rejected by user'
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for transaction'
      } else if (err.message?.includes('DAO_CREATOR_ROLE')) {
        errorMessage = 'Your account does not have permission to create DAOs. Please contact an administrator.'
      } else if (err.message?.includes('Name cannot be empty')) {
        errorMessage = 'DAO name cannot be empty'
      } else if (err.message?.includes('Invalid treasury vault')) {
        errorMessage = 'Invalid treasury vault address'
      } else if (err.message) {
        // Try to extract a readable error message
        const match = err.message.match(/reason="([^"]+)"/)
        if (match) {
          errorMessage = match[1]
        } else {
          errorMessage = err.message
        }
      }

      setErrors({ submit: errorMessage })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="cp-launch">
      <h3 className="cp-section-title">Launch New DAO</h3>
      <p className="cp-launch-desc">Create a new decentralized autonomous organization with futarchy-based governance.</p>

      {/* Wallet Connection Warning - Show prominently at top */}
      {!walletConnected && (
        <div className="cp-warning-banner cp-wallet-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4" />
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
            <circle cx="18" cy="12" r="2" />
          </svg>
          <div className="cp-warning-content">
            <span className="cp-warning-title">Wallet Not Connected</span>
            <span className="cp-warning-text">Please connect your wallet to create a DAO.</span>
          </div>
        </div>
      )}

      {/* ClearPath Role Warning - Show if wallet connected but no role */}
      {walletConnected && !hasClearPathRole && (
        <div className="cp-warning-banner cp-role-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="cp-warning-content">
            <span className="cp-warning-title">ClearPath Membership Required</span>
            <span className="cp-warning-text">Creating DAOs requires a ClearPath membership. Upgrade your account to access this feature.</span>
          </div>
        </div>
      )}

      {/* Factory Not Deployed Warning */}
      {!isFactoryDeployed() && (
        <div className="cp-warning-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>DAO Factory contract is not deployed on this network. DAO creation is temporarily unavailable.</span>
        </div>
      )}

      <form className="cp-launch-form" onSubmit={handleSubmit}>
        <div className="cp-form-group">
          <label htmlFor="dao-name">
            DAO Name <span className="cp-required">*</span>
          </label>
          <input
            id="dao-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., My Community DAO"
            disabled={creating || !canCreateDAO}
            className={errors.name ? 'error' : ''}
            maxLength={50}
          />
          {errors.name && <span className="cp-error">{errors.name}</span>}
        </div>

        <div className="cp-form-group">
          <label htmlFor="dao-description">
            Description <span className="cp-required">*</span>
          </label>
          <textarea
            id="dao-description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe your DAO's purpose and goals..."
            disabled={creating || !canCreateDAO}
            className={errors.description ? 'error' : ''}
            rows={3}
            maxLength={500}
          />
          {errors.description && <span className="cp-error">{errors.description}</span>}
        </div>

        <div className="cp-form-group">
          <label htmlFor="treasury-vault">
            Treasury Vault Address
          </label>
          <input
            id="treasury-vault"
            type="text"
            value={formData.treasuryVault}
            onChange={(e) => handleChange('treasuryVault', e.target.value)}
            placeholder="0x... (optional - will create new if empty)"
            disabled={creating || !canCreateDAO}
            className={errors.treasuryVault ? 'error' : ''}
          />
          {errors.treasuryVault && <span className="cp-error">{errors.treasuryVault}</span>}
          <span className="cp-hint">Leave empty to create a new treasury vault</span>
        </div>

        <div className="cp-form-group">
          <label htmlFor="dao-admins">
            Initial Admins
          </label>
          <input
            id="dao-admins"
            type="text"
            value={formData.admins}
            onChange={(e) => handleChange('admins', e.target.value)}
            placeholder="0x123..., 0x456... (comma-separated)"
            disabled={creating || !canCreateDAO}
            className={errors.admins ? 'error' : ''}
          />
          {errors.admins && <span className="cp-error">{errors.admins}</span>}
          <span className="cp-hint">Your address will be added automatically</span>
        </div>

        {errors.submit && (
          <div className="cp-error-banner">{errors.submit}</div>
        )}

        <div className="cp-form-actions">
          <button
            type="submit"
            className="cp-btn-primary cp-btn-lg"
            disabled={creating || !canCreateDAO}
          >
            {creating ? (
              <>
                <span className="cp-spinner-small"></span>
                Creating DAO...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Launch DAO
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

LaunchDAOForm.propTypes = {
  onSuccess: PropTypes.func.isRequired,
  hasClearPathRole: PropTypes.bool,
  isWalletConnected: PropTypes.bool
}

export default LaunchDAOForm
