import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import './DAOLaunchpad.css'
import { useEthers } from '../hooks/useWeb3'
import { useNotification, useModal } from '../hooks/useUI'

const DAOFactoryABI = [
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'

const FORM_STORAGE_KEY = 'dao_launchpad_form_data'

function DAOLaunchpad({ onDAOCreated }) {
  const { signer } = useEthers()
  const { showNotification } = useNotification()
  const { showModal } = useModal()
  
  // Load saved form data from sessionStorage
  const loadSavedFormData = () => {
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (err) {
      console.error('Error loading saved form data:', err)
    }
    return {
      name: '',
      description: '',
      treasuryVault: '',
      admins: ''
    }
  }

  const [formData, setFormData] = useState(loadSavedFormData)
  const [fieldErrors, setFieldErrors] = useState({})
  const [creating, setCreating] = useState(false)
  const [success, setSuccess] = useState('')
  
  // Refs for focus management
  const nameRef = useRef(null)
  const descriptionRef = useRef(null)
  const treasuryRef = useRef(null)
  const adminsRef = useRef(null)

  // Save form data to sessionStorage on change
  useEffect(() => {
    if (!creating && !success) {
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData))
    }
  }, [formData, creating, success])

  // Clear saved data on successful submission
  useEffect(() => {
    if (success) {
      sessionStorage.removeItem(FORM_STORAGE_KEY)
    }
  }, [success])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear field-specific error when user types
    if (fieldErrors[name]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
    setSuccess('')
  }

  const validateField = (fieldName, value) => {
    switch (fieldName) {
      case 'name':
        if (!value.trim()) {
          return 'DAO name is required'
        }
        if (value.length < 3) {
          return 'DAO name must be at least 3 characters'
        }
        if (value.length > 100) {
          return 'DAO name must be less than 100 characters'
        }
        break
      case 'description':
        if (!value.trim()) {
          return 'DAO description is required'
        }
        if (value.length < 10) {
          return 'Description must be at least 10 characters'
        }
        break
      case 'treasuryVault':
        if (!value) {
          return 'Treasury vault address is required'
        }
        try {
          ethers.getAddress(value)
        } catch {
          return 'Invalid Ethereum address format'
        }
        break
      case 'admins':
        if (value) {
          const adminAddresses = value.split(',').map(a => a.trim()).filter(a => a)
          for (const addr of adminAddresses) {
            try {
              ethers.getAddress(addr)
            } catch {
              return `Invalid admin address: ${addr}`
            }
          }
        }
        break
      default:
        break
    }
    return null
  }

  const validateForm = () => {
    const errors = {}
    
    // Validate all fields
    Object.keys(formData).forEach(fieldName => {
      const error = validateField(fieldName, formData[fieldName])
      if (error) {
        errors[fieldName] = error
      }
    })

    setFieldErrors(errors)
    
    // Focus first error field
    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0]
      const fieldRefs = {
        name: nameRef,
        description: descriptionRef,
        treasuryVault: treasuryRef,
        admins: adminsRef
      }
      fieldRefs[firstErrorField]?.current?.focus()
      return false
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      showNotification('Please fix the errors in the form', 'error')
      return
    }

    // Show confirmation modal
    showModal({
      title: 'Confirm DAO Creation',
      message: `Are you sure you want to create "${formData.name}"? This will deploy all governance contracts and cannot be undone.`,
      type: 'confirm',
      onConfirm: async () => {
        try {
          setCreating(true)

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

          showNotification('Transaction submitted! Waiting for confirmation...', 'info', 0)

          await tx.wait()
          
          setSuccess('DAO created successfully!')
          showNotification('DAO created successfully!', 'success')
          
          // Reset form
          setFormData({
            name: '',
            description: '',
            treasuryVault: '',
            admins: ''
          })
          setFieldErrors({})

          // Callback to refresh DAO list
          if (onDAOCreated) {
            setTimeout(() => onDAOCreated(), 2000)
          }

        } catch (err) {
          console.error('Error creating DAO:', err)
          let errorMsg = 'Failed to create DAO'
          
          // Handle common errors
          if (err.code === 'ACTION_REJECTED') {
            errorMsg = 'Transaction was rejected by user'
          } else if (err.code === 'INSUFFICIENT_FUNDS') {
            errorMsg = 'Insufficient funds for transaction'
          } else if (err.message) {
            errorMsg = err.message
          }
          
          showNotification(errorMsg, 'error')
        } finally {
          setCreating(false)
        }
      }
    })
  }

  return (
    <div className="launchpad-container">
      <div className="launchpad-header">
        <h2>🚀 Launch a New DAO</h2>
        <p>Deploy a complete DAO instance with all governance components</p>
      </div>

      <form onSubmit={handleSubmit} className="launchpad-form" noValidate>
        <div className="form-group">
          <label htmlFor="name">
            DAO Name <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={nameRef}
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            onBlur={() => {
              const error = validateField('name', formData.name)
              if (error) {
                setFieldErrors(prev => ({ ...prev, name: error }))
              }
            }}
            placeholder="My Prediction DAO"
            disabled={creating}
            aria-describedby="name-hint name-error"
            aria-invalid={!!fieldErrors.name}
            required
          />
          <span id="name-hint" className="form-hint">A clear, descriptive name for your DAO (3-100 characters)</span>
          {fieldErrors.name && (
            <span id="name-error" className="error-text" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠️</span> {fieldErrors.name}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="description">
            Description <span className="required" aria-label="required">*</span>
          </label>
          <textarea
            ref={descriptionRef}
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            onBlur={() => {
              const error = validateField('description', formData.description)
              if (error) {
                setFieldErrors(prev => ({ ...prev, description: error }))
              }
            }}
            placeholder="A decentralized organization for prediction-based governance..."
            rows={4}
            disabled={creating}
            aria-describedby="description-hint description-error"
            aria-invalid={!!fieldErrors.description}
            required
          />
          <span id="description-hint" className="form-hint">Explain the purpose and goals of your DAO (minimum 10 characters)</span>
          {fieldErrors.description && (
            <span id="description-error" className="error-text" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠️</span> {fieldErrors.description}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="treasuryVault">
            Treasury Vault Address <span className="required" aria-label="required">*</span>
          </label>
          <input
            ref={treasuryRef}
            type="text"
            id="treasuryVault"
            name="treasuryVault"
            value={formData.treasuryVault}
            onChange={handleInputChange}
            onBlur={() => {
              const error = validateField('treasuryVault', formData.treasuryVault)
              if (error) {
                setFieldErrors(prev => ({ ...prev, treasuryVault: error }))
              }
            }}
            placeholder="0x..."
            disabled={creating}
            aria-describedby="treasury-hint treasury-error"
            aria-invalid={!!fieldErrors.treasuryVault}
            required
          />
          <span id="treasury-hint" className="form-hint">Contract address for the DAO treasury (0x...)</span>
          {fieldErrors.treasuryVault && (
            <span id="treasury-error" className="error-text" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠️</span> {fieldErrors.treasuryVault}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="admins">Admin Addresses (Optional)</label>
          <input
            ref={adminsRef}
            type="text"
            id="admins"
            name="admins"
            value={formData.admins}
            onChange={handleInputChange}
            onBlur={() => {
              const error = validateField('admins', formData.admins)
              if (error) {
                setFieldErrors(prev => ({ ...prev, admins: error }))
              }
            }}
            placeholder="0x123..., 0x456..."
            disabled={creating}
            aria-describedby="admins-hint admins-error"
            aria-invalid={!!fieldErrors.admins}
          />
          <span id="admins-hint" className="form-hint">Comma-separated list of admin addresses. You'll be added automatically.</span>
          {fieldErrors.admins && (
            <span id="admins-error" className="error-text" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠️</span> {fieldErrors.admins}
            </span>
          )}
        </div>

        {success && (
          <div className="alert alert-success" role="alert" aria-live="polite">
            <span className="alert-icon" aria-hidden="true">✅</span>
            <span>{success}</span>
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="submit-btn"
            disabled={creating}
            aria-busy={creating}
          >
            {creating ? (
              <>
                <span className="spinner-small" aria-hidden="true"></span>
                Creating DAO...
              </>
            ) : (
              'Launch DAO'
            )}
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
