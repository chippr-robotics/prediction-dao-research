import { useState } from 'react'
import './TokenMintBuilderModal.css'

function TokenMintBuilderModal({ isOpen, onClose, onCreate }) {
  const [tokenType, setTokenType] = useState('ERC20') // 'ERC20' or 'ERC721'
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    initialSupply: '1000000', // ERC20 only
    metadataURI: '',
    isBurnable: false,
    isPausable: false, // ERC20 only
    listOnETCSwap: false
  })
  const [errors, setErrors] = useState({})
  const [creating, setCreating] = useState(false)

  if (!isOpen) return null

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for this field
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
      newErrors.name = 'Token name is required'
    }
    
    if (!formData.symbol.trim()) {
      newErrors.symbol = 'Token symbol is required'
    } else if (formData.symbol.length > 11) {
      newErrors.symbol = 'Symbol must be 11 characters or less'
    }
    
    if (tokenType === 'ERC20') {
      const supply = parseFloat(formData.initialSupply)
      if (isNaN(supply) || supply <= 0) {
        newErrors.initialSupply = 'Initial supply must be greater than 0'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) {
      return
    }

    setCreating(true)
    try {
      await onCreate({
        tokenType,
        ...formData
      })
      
      // Reset form
      setFormData({
        name: '',
        symbol: '',
        initialSupply: '1000000',
        metadataURI: '',
        isBurnable: false,
        isPausable: false,
        listOnETCSwap: false
      })
      setErrors({})
      onClose()
    } catch (error) {
      console.error('Error creating token:', error)
      setErrors({ submit: error.message || 'Failed to create token' })
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    if (!creating) {
      setErrors({})
      onClose()
    }
  }

  return (
    <div 
      className="tokenmint-modal-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tokenmint-modal-title"
    >
      <div 
        className="tokenmint-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="tokenmint-modal-title">🪙 Create New Token</h2>
          <button
            className="close-btn"
            onClick={handleClose}
            disabled={creating}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {/* Token Type Selection */}
            <div className="form-section">
              <label className="section-label">Token Type</label>
              <div className="token-type-selector">
                <button
                  type="button"
                  className={`type-option ${tokenType === 'ERC20' ? 'active' : ''}`}
                  onClick={() => setTokenType('ERC20')}
                  disabled={creating}
                >
                  <div className="type-icon">💰</div>
                  <div className="type-name">ERC-20</div>
                  <div className="type-desc">Fungible Token</div>
                </button>
                <button
                  type="button"
                  className={`type-option ${tokenType === 'ERC721' ? 'active' : ''}`}
                  onClick={() => setTokenType('ERC721')}
                  disabled={creating}
                >
                  <div className="type-icon">🎨</div>
                  <div className="type-name">ERC-721</div>
                  <div className="type-desc">NFT Collection</div>
                </button>
              </div>
            </div>

            {/* Basic Information */}
            <div className="form-section">
              <label className="section-label">Basic Information</label>
              
              <div className="form-group">
                <label htmlFor="token-name">
                  Token Name <span className="required">*</span>
                </label>
                <input
                  id="token-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., My Awesome Token"
                  disabled={creating}
                  className={errors.name ? 'error' : ''}
                  required
                />
                {errors.name && <div className="error-message">{errors.name}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="token-symbol">
                  Symbol <span className="required">*</span>
                </label>
                <input
                  id="token-symbol"
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
                  placeholder="e.g., MAT"
                  maxLength={11}
                  disabled={creating}
                  className={errors.symbol ? 'error' : ''}
                  required
                />
                {errors.symbol && <div className="error-message">{errors.symbol}</div>}
              </div>

              {tokenType === 'ERC20' && (
                <div className="form-group">
                  <label htmlFor="initial-supply">
                    Initial Supply <span className="required">*</span>
                  </label>
                  <input
                    id="initial-supply"
                    type="number"
                    value={formData.initialSupply}
                    onChange={(e) => handleChange('initialSupply', e.target.value)}
                    placeholder="1000000"
                    min="1"
                    disabled={creating}
                    className={errors.initialSupply ? 'error' : ''}
                    required
                  />
                  {errors.initialSupply && <div className="error-message">{errors.initialSupply}</div>}
                  <div className="field-hint">
                    Total number of tokens to create initially
                  </div>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="form-section">
              <label className="section-label">
                Metadata (OpenSea Standard)
              </label>
              
              <div className="form-group">
                <label htmlFor="metadata-uri">
                  {tokenType === 'ERC20' ? 'Metadata URI' : 'Base URI'}
                </label>
                <input
                  id="metadata-uri"
                  type="text"
                  value={formData.metadataURI}
                  onChange={(e) => handleChange('metadataURI', e.target.value)}
                  placeholder="ipfs://QmYourCID or https://..."
                  disabled={creating}
                />
                <div className="field-hint">
                  {tokenType === 'ERC20' 
                    ? 'IPFS CID or URL pointing to token metadata (optional)'
                    : 'Base URI for NFT metadata (individual token URIs will be appended)'}
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="form-section">
              <label className="section-label">Features</label>
              
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.isBurnable}
                    onChange={(e) => handleChange('isBurnable', e.target.checked)}
                    disabled={creating}
                  />
                  <span className="checkbox-text">
                    <span className="checkbox-icon">🔥</span>
                    <div>
                      <div className="checkbox-title">Burnable</div>
                      <div className="checkbox-desc">
                        Token holders can burn (destroy) their tokens
                      </div>
                    </div>
                  </span>
                </label>

                {tokenType === 'ERC20' && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.isPausable}
                      onChange={(e) => handleChange('isPausable', e.target.checked)}
                      disabled={creating}
                    />
                    <span className="checkbox-text">
                      <span className="checkbox-icon">⏸️</span>
                      <div>
                        <div className="checkbox-title">Pausable</div>
                        <div className="checkbox-desc">
                          Owner can pause all token transfers
                        </div>
                      </div>
                    </span>
                  </label>
                )}

                {tokenType === 'ERC20' && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.listOnETCSwap}
                      onChange={(e) => handleChange('listOnETCSwap', e.target.checked)}
                      disabled={creating}
                    />
                    <span className="checkbox-text">
                      <span className="checkbox-icon">🔄</span>
                      <div>
                        <div className="checkbox-title">List on ETCSwap</div>
                        <div className="checkbox-desc">
                          Automatically list token on ETCSwap DEX after creation
                        </div>
                      </div>
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="submit-error">
                {errors.submit}
              </div>
            )}

            {/* Actions */}
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={handleClose}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="create-btn"
                disabled={creating}
              >
                {creating ? (
                  <>
                    <span className="spinner-small"></span>
                    Creating...
                  </>
                ) : (
                  `Create ${tokenType} Token`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default TokenMintBuilderModal
