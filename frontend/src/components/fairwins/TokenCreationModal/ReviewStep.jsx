import { TxState } from '../../../hooks/useTokenCreation'

/**
 * ReviewStep Component
 *
 * Step 3: Review configuration and deploy token
 * - Summary of all settings
 * - Gas estimation display
 * - Transaction status tracking
 * - Success state with next steps
 */
function ReviewStep({
  tokenType,
  formData,
  txState,
  txHash,
  txError,
  createdToken,
  totalCostETC,
  walletAddress,
  isCorrectNetwork,
  isContractDeployed = true,
  getExplorerUrl,
  onEstimateGas,
  disabled
}) {
  // Copy address to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Add token to wallet (MetaMask)
  const addToWallet = async () => {
    if (!createdToken?.tokenAddress || !window.ethereum) return

    try {
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: tokenType === 'ERC20' ? 'ERC20' : 'ERC721',
          options: {
            address: createdToken.tokenAddress,
            symbol: formData.symbol,
            decimals: tokenType === 'ERC20' ? 18 : 0,
          },
        },
      })
    } catch (err) {
      console.error('Failed to add token:', err)
    }
  }

  // Render transaction status
  const renderTransactionStatus = () => {
    switch (txState) {
      case TxState.ESTIMATING:
        return (
          <div className="tcm-tx-status tcm-tx-estimating">
            <div className="tcm-tx-spinner" />
            <div className="tcm-tx-info">
              <strong>Estimating gas...</strong>
              <p>Calculating deployment cost</p>
            </div>
          </div>
        )

      case TxState.PENDING_SIGNATURE:
        return (
          <div className="tcm-tx-status tcm-tx-pending">
            <div className="tcm-tx-spinner" />
            <div className="tcm-tx-info">
              <strong>Waiting for signature...</strong>
              <p>Please confirm the transaction in your wallet</p>
            </div>
          </div>
        )

      case TxState.PENDING_CONFIRMATION:
        return (
          <div className="tcm-tx-status tcm-tx-pending">
            <div className="tcm-tx-spinner" />
            <div className="tcm-tx-info">
              <strong>Transaction submitted</strong>
              <p>Waiting for blockchain confirmation...</p>
              {txHash && (
                <a
                  href={getExplorerUrl(txHash, 'tx')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tcm-tx-link"
                >
                  View on Explorer
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )

      case TxState.SUCCESS:
        return (
          <div className="tcm-tx-status tcm-tx-success">
            <div className="tcm-tx-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 10 10.5 15.5 8 13" />
              </svg>
            </div>
            <div className="tcm-tx-info">
              <strong>Token Created Successfully!</strong>
              <p>{formData.name} ({formData.symbol})</p>
            </div>
          </div>
        )

      case TxState.ERROR:
        return (
          <div className="tcm-tx-status tcm-tx-error">
            <div className="tcm-tx-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="tcm-tx-info">
              <strong>Transaction Failed</strong>
              <p>{txError || 'An error occurred'}</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Success state view
  if (txState === TxState.SUCCESS && createdToken) {
    return (
      <div className="tcm-step-content tcm-success-view">
        {renderTransactionStatus()}

        <div className="tcm-success-card">
          <div className="tcm-success-detail">
            <span className="tcm-detail-label">Contract Address</span>
            <div className="tcm-detail-value tcm-address">
              <code>{createdToken.tokenAddress}</code>
              <button
                type="button"
                className="tcm-copy-btn"
                onClick={() => copyToClipboard(createdToken.tokenAddress)}
                title="Copy address"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="tcm-success-detail">
            <span className="tcm-detail-label">Transaction Hash</span>
            <div className="tcm-detail-value">
              <code>{txHash?.slice(0, 10)}...{txHash?.slice(-8)}</code>
              <a
                href={getExplorerUrl(txHash, 'tx')}
                target="_blank"
                rel="noopener noreferrer"
                className="tcm-explorer-link"
                title="View on Explorer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="tcm-next-steps">
          <h4>What's Next?</h4>
          <ul>
            <li>Add token to your wallet for easy tracking</li>
            {tokenType === 'ERC20' && <li>Create a liquidity pool on ETCSwap</li>}
            <li>Manage your token in Token Management</li>
          </ul>
        </div>

        <div className="tcm-success-actions">
          {tokenType === 'ERC20' && (
            <button
              type="button"
              className="tcm-btn-secondary"
              onClick={addToWallet}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Add to Wallet
            </button>
          )}
          <a
            href={getExplorerUrl(createdToken.tokenAddress, 'address')}
            target="_blank"
            rel="noopener noreferrer"
            className="tcm-btn-secondary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            View Contract
          </a>
        </div>
      </div>
    )
  }

  // Review state view
  return (
    <div className="tcm-step-content">
      {/* Transaction Status */}
      {txState !== TxState.IDLE && renderTransactionStatus()}

      {/* Contract Not Deployed Warning */}
      {!isContractDeployed && (
        <div className="tcm-warning tcm-warning-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div>
            <strong>TokenMintFactory Not Available</strong>
            <p>The TokenMintFactory contract is not deployed on this network. Token creation is temporarily unavailable.</p>
          </div>
        </div>
      )}

      {/* Network Warning */}
      {isContractDeployed && !isCorrectNetwork && (
        <div className="tcm-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Wrong Network</strong>
            <p>Please switch to the correct network to deploy your token.</p>
          </div>
        </div>
      )}

      {/* Token Summary */}
      <section className="tcm-section">
        <h3 className="tcm-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Token Summary
        </h3>

        <div className="tcm-review-card">
          <div className="tcm-review-header">
            <span className="tcm-review-badge">{tokenType}</span>
            <h4>{formData.name || 'Unnamed Token'}</h4>
            {formData.symbol && <span className="tcm-symbol-badge">{formData.symbol}</span>}
          </div>

          <div className="tcm-review-grid">
            <div className="tcm-review-item">
              <span className="tcm-review-label">Token Type</span>
              <span className="tcm-review-value">
                {tokenType === 'ERC20' ? 'Fungible Token' : 'NFT Collection'}
              </span>
            </div>
            {tokenType === 'ERC20' && (
              <div className="tcm-review-item">
                <span className="tcm-review-label">Initial Supply</span>
                <span className="tcm-review-value">
                  {parseInt(formData.initialSupply || 0).toLocaleString()}
                </span>
              </div>
            )}
            <div className="tcm-review-item">
              <span className="tcm-review-label">Features</span>
              <span className="tcm-review-value tcm-features">
                {formData.isBurnable && <span className="tcm-feature">Burnable</span>}
                {formData.isPausable && <span className="tcm-feature">Pausable</span>}
                {formData.listOnETCSwap && <span className="tcm-feature">ETCSwap</span>}
                {!formData.isBurnable && !formData.isPausable && !formData.listOnETCSwap && (
                  <span className="tcm-feature tcm-feature-basic">Basic</span>
                )}
              </span>
            </div>
            {formData.metadataURI && (
              <div className="tcm-review-item">
                <span className="tcm-review-label">Metadata</span>
                <span className="tcm-review-value tcm-metadata">
                  {formData.metadataURI.length > 40
                    ? `${formData.metadataURI.slice(0, 20)}...${formData.metadataURI.slice(-15)}`
                    : formData.metadataURI}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Deployment Cost */}
      <section className="tcm-section">
        <h3 className="tcm-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          Deployment Cost
        </h3>

        <div className="tcm-cost-card">
          {totalCostETC ? (
            <>
              <div className="tcm-cost-row">
                <span>Estimated Gas</span>
                <span>~{totalCostETC} ETC</span>
              </div>
              <div className="tcm-cost-row tcm-cost-deployer">
                <span>Deployer</span>
                <span className="tcm-address-short">
                  {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                </span>
              </div>
            </>
          ) : (
            <div className="tcm-cost-estimate">
              <button
                type="button"
                className="tcm-estimate-btn"
                onClick={onEstimateGas}
                disabled={disabled || txState !== TxState.IDLE}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                Estimate Gas
              </button>
              <span className="tcm-hint">Click to calculate deployment cost</span>
            </div>
          )}
        </div>
      </section>

      {/* Warning */}
      <div className="tcm-deploy-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>This action is irreversible. Token parameters cannot be changed after deployment.</span>
      </div>
    </div>
  )
}

export default ReviewStep
