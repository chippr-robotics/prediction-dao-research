import { useMemo } from 'react'

/**
 * ConfigurationStep Component
 *
 * Step 2: Token configuration form
 * - Basic info (name, symbol, supply)
 * - Feature toggles (burnable, pausable, mintable)
 * - Metadata URI
 * - ETCSwap listing option
 */
function ConfigurationStep({
  tokenType,
  formData,
  onFormChange,
  errors,
  disabled
}) {
  // Preset supply options for ERC-20
  const supplyPresets = useMemo(() => [
    { label: '1M', value: '1000000' },
    { label: '10M', value: '10000000' },
    { label: '100M', value: '100000000' },
    { label: '1B', value: '1000000000' }
  ], [])

  const handleChange = (field, value) => {
    onFormChange({ ...formData, [field]: value })
  }

  const formatSupply = (value) => {
    if (!value) return ''
    const num = parseInt(value.replace(/,/g, ''))
    if (isNaN(num)) return value
    return num.toLocaleString()
  }

  const parseSupply = (value) => {
    return value.replace(/,/g, '')
  }

  return (
    <div className="tcm-step-content">
      {/* Basic Information */}
      <section className="tcm-section">
        <h3 className="tcm-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Basic Information
        </h3>

        <div className="tcm-form-row">
          <div className="tcm-field">
            <label htmlFor="token-name">
              Token Name <span className="tcm-required">*</span>
            </label>
            <input
              id="token-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="My Awesome Token"
              disabled={disabled}
              className={errors.name ? 'error' : ''}
              maxLength={50}
              autoComplete="off"
            />
            <div className="tcm-field-footer">
              <span className="tcm-char-count">{formData.name.length}/50</span>
              {errors.name && <span className="tcm-error">{errors.name}</span>}
            </div>
          </div>

          <div className="tcm-field tcm-field-small">
            <label htmlFor="token-symbol">
              Symbol <span className="tcm-required">*</span>
            </label>
            <input
              id="token-symbol"
              type="text"
              value={formData.symbol}
              onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
              placeholder="MAT"
              disabled={disabled}
              className={errors.symbol ? 'error' : ''}
              maxLength={11}
              autoComplete="off"
            />
            <div className="tcm-field-footer">
              <span className="tcm-char-count">{formData.symbol.length}/11</span>
              {errors.symbol && <span className="tcm-error">{errors.symbol}</span>}
            </div>
          </div>
        </div>

        {/* Symbol Preview */}
        {formData.symbol && (
          <div className="tcm-symbol-preview">
            <span className="tcm-preview-label">Preview:</span>
            <span className="tcm-symbol-badge">{formData.symbol}</span>
          </div>
        )}

        {/* Initial Supply (ERC-20 only) */}
        {tokenType === 'ERC20' && (
          <div className="tcm-field">
            <label htmlFor="initial-supply">
              Initial Supply <span className="tcm-required">*</span>
            </label>
            <div className="tcm-supply-input">
              <input
                id="initial-supply"
                type="text"
                value={formatSupply(formData.initialSupply)}
                onChange={(e) => handleChange('initialSupply', parseSupply(e.target.value))}
                placeholder="1,000,000"
                disabled={disabled}
                className={errors.initialSupply ? 'error' : ''}
                autoComplete="off"
              />
              <div className="tcm-supply-presets">
                {supplyPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`tcm-preset-btn ${formData.initialSupply === preset.value ? 'active' : ''}`}
                    onClick={() => handleChange('initialSupply', preset.value)}
                    disabled={disabled}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="tcm-field-footer">
              <span className="tcm-hint">Total number of tokens to create</span>
              {errors.initialSupply && <span className="tcm-error">{errors.initialSupply}</span>}
            </div>
          </div>
        )}
      </section>

      {/* Features */}
      <section className="tcm-section">
        <h3 className="tcm-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Features
        </h3>

        <div className="tcm-toggles">
          <label className={`tcm-toggle ${formData.isBurnable ? 'active' : ''}`}>
            <div className="tcm-toggle-content">
              <div className="tcm-toggle-header">
                <span className="tcm-toggle-title">Burnable</span>
                <button
                  type="button"
                  className="tcm-toggle-switch"
                  role="switch"
                  aria-checked={formData.isBurnable}
                  onClick={() => handleChange('isBurnable', !formData.isBurnable)}
                  disabled={disabled}
                >
                  <span className="tcm-toggle-track">
                    <span className="tcm-toggle-thumb" />
                  </span>
                </button>
              </div>
              <p className="tcm-toggle-desc">
                Token holders can permanently destroy their tokens, reducing total supply.
              </p>
            </div>
          </label>

          {tokenType === 'ERC20' && (
            <label className={`tcm-toggle ${formData.isPausable ? 'active' : ''}`}>
              <div className="tcm-toggle-content">
                <div className="tcm-toggle-header">
                  <span className="tcm-toggle-title">Pausable</span>
                  <span className="tcm-toggle-badge">ERC-20 only</span>
                  <button
                    type="button"
                    className="tcm-toggle-switch"
                    role="switch"
                    aria-checked={formData.isPausable}
                    onClick={() => handleChange('isPausable', !formData.isPausable)}
                    disabled={disabled}
                  >
                    <span className="tcm-toggle-track">
                      <span className="tcm-toggle-thumb" />
                    </span>
                  </button>
                </div>
                <p className="tcm-toggle-desc">
                  Owner can pause all token transfers in case of emergency.
                </p>
              </div>
            </label>
          )}

          {tokenType === 'ERC20' && (
            <label className={`tcm-toggle ${formData.listOnETCSwap ? 'active' : ''}`}>
              <div className="tcm-toggle-content">
                <div className="tcm-toggle-header">
                  <span className="tcm-toggle-title">List on ETCSwap</span>
                  <span className="tcm-toggle-badge">ERC-20 only</span>
                  <button
                    type="button"
                    className="tcm-toggle-switch"
                    role="switch"
                    aria-checked={formData.listOnETCSwap}
                    onClick={() => handleChange('listOnETCSwap', !formData.listOnETCSwap)}
                    disabled={disabled}
                  >
                    <span className="tcm-toggle-track">
                      <span className="tcm-toggle-thumb" />
                    </span>
                  </button>
                </div>
                <p className="tcm-toggle-desc">
                  Automatically create a trading pair on ETCSwap DEX after deployment.
                </p>
                {formData.listOnETCSwap && (
                  <div className="tcm-toggle-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Requires additional ETC for initial liquidity
                  </div>
                )}
              </div>
            </label>
          )}
        </div>
      </section>

      {/* Metadata */}
      <section className="tcm-section">
        <h3 className="tcm-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Metadata (Optional)
        </h3>

        <div className="tcm-field">
          <label htmlFor="metadata-uri">
            {tokenType === 'ERC20' ? 'Metadata URI' : 'Base URI'}
          </label>
          <input
            id="metadata-uri"
            type="text"
            value={formData.metadataURI}
            onChange={(e) => handleChange('metadataURI', e.target.value)}
            placeholder="ipfs://QmYourCID or https://..."
            disabled={disabled}
            className={errors.metadataURI ? 'error' : ''}
            autoComplete="off"
          />
          <div className="tcm-field-footer">
            <span className="tcm-hint">
              {tokenType === 'ERC20'
                ? 'IPFS CID or URL pointing to token metadata (OpenSea standard)'
                : 'Base URI for NFT metadata. Token ID will be appended.'}
            </span>
            {errors.metadataURI && <span className="tcm-error">{errors.metadataURI}</span>}
          </div>
        </div>
      </section>
    </div>
  )
}

export default ConfigurationStep
