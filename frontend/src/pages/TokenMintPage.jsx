import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTokenMintFactory } from '../hooks'
import TokenMintTab from '../components/fairwins/TokenMintTab'
import TokenCreationModal from '../components/fairwins/TokenCreationModal'
import TokenMintHeroCard from '../components/fairwins/TokenMintHeroCard'
import '../components/fairwins/FairWinsAppNew.css'

function TokenMintPage() {
  const navigate = useNavigate()
  const [selectedToken, setSelectedToken] = useState(null)
  const [showTokenBuilder, setShowTokenBuilder] = useState(false)
  const [showTokenDetails, setShowTokenDetails] = useState(false)

  // Use the real blockchain data hook
  const {
    tokens,
    isLoading: tokenLoading,
    refreshTokens,
    hasContract
  } = useTokenMintFactory()

  /**
   * Handle successful token creation
   * Called by TokenCreationModal after token is deployed on-chain
   */
  const handleTokenCreated = async (tokenData) => {
    console.log('Token created:', tokenData)
    // Refresh token list from blockchain to show the new token
    await refreshTokens(true) // force refresh
  }

  const handleTokenClick = (token) => {
    setSelectedToken(token)
    setShowTokenDetails(true)
  }

  const handleTokenMint = async (tokenId, data) => {
    console.log('Minting tokens:', tokenId, data)
    alert('Mint functionality requires deployed contracts.')
  }

  const handleTokenBurn = async (tokenId, data) => {
    console.log('Burning tokens:', tokenId, data)
    alert('Burn functionality requires deployed contracts.')
  }

  const handleTokenTransfer = async (tokenId, data) => {
    console.log('Transferring tokens:', tokenId, data)
    alert('Transfer functionality requires deployed contracts.')
  }

  const handleListOnETCSwap = async (tokenId) => {
    console.log('Listing on ETCSwap:', tokenId)
    alert('ETCSwap listing requires deployed contracts.')
  }

  const handleClose = () => {
    navigate(-1)
  }

  return (
    <div className="tokenmint-page">
      <div className="tokenmint-page-header">
        <button 
          className="back-btn"
          onClick={handleClose}
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1>🪙 Token Management</h1>
      </div>

      {!showTokenDetails ? (
        <TokenMintTab 
          tokens={tokens}
          loading={tokenLoading}
          onTokenClick={handleTokenClick}
          onCreateToken={() => setShowTokenBuilder(true)}
        />
      ) : (
        <TokenMintHeroCard 
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null)
            setShowTokenDetails(false)
          }}
          onMint={handleTokenMint}
          onBurn={handleTokenBurn}
          onTransfer={handleTokenTransfer}
          onListOnETCSwap={handleListOnETCSwap}
        />
      )}

      <TokenCreationModal
        isOpen={showTokenBuilder}
        onClose={() => setShowTokenBuilder(false)}
        onSuccess={handleTokenCreated}
      />
    </div>
  )
}

export default TokenMintPage
