import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3 } from '../hooks/useWeb3'
import TokenMintTab from '../components/fairwins/TokenMintTab'
import TokenMintBuilderModal from '../components/fairwins/TokenMintBuilderModal'
import TokenMintHeroCard from '../components/fairwins/TokenMintHeroCard'
import '../components/fairwins/FairWinsAppNew.css'

function TokenMintPage() {
  const { account, isConnected } = useWeb3()
  const navigate = useNavigate()
  const [tokens, setTokens] = useState([])
  const [selectedToken, setSelectedToken] = useState(null)
  const [showTokenBuilder, setShowTokenBuilder] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [showHero, setShowHero] = useState(false)

  const loadUserTokens = useCallback(async () => {
    if (!account || !isConnected) {
      setTokens([])
      return
    }
    
    try {
      setTokenLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const mockTokens = [
        {
          tokenId: 1,
          tokenType: 0,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          owner: account,
          name: 'Demo Token',
          symbol: 'DEMO',
          metadataURI: 'ipfs://QmDemo123',
          createdAt: Math.floor(Date.now() / 1000) - 86400 * 7,
          listedOnETCSwap: true,
          isBurnable: true,
          isPausable: false
        },
        {
          tokenId: 2,
          tokenType: 1,
          tokenAddress: '0x0987654321098765432109876543210987654321',
          owner: account,
          name: 'Demo NFT Collection',
          symbol: 'DNFT',
          metadataURI: 'ipfs://QmNFTBase/',
          createdAt: Math.floor(Date.now() / 1000) - 86400 * 3,
          listedOnETCSwap: false,
          isBurnable: false,
          isPausable: false
        }
      ]
      
      setTokens(mockTokens)
      setTokenLoading(false)
    } catch (error) {
      console.error('Error loading tokens:', error)
      setTokenLoading(false)
    }
  }, [account, isConnected])

  const handleCreateToken = async (tokenData) => {
    console.log('Creating token:', tokenData)
    alert(`Token creation requires deployed contracts.

Token Details:
- Type: ${tokenData.tokenType}
- Name: ${tokenData.name}
- Symbol: ${tokenData.symbol}
${tokenData.tokenType === 'ERC20' ? `- Initial Supply: ${tokenData.initialSupply}` : ''}
- Metadata URI: ${tokenData.metadataURI || 'None'}
- Features: ${tokenData.isBurnable ? 'Burnable ' : ''}${tokenData.isPausable ? 'Pausable ' : ''}
- List on ETCSwap: ${tokenData.listOnETCSwap ? 'Yes' : 'No'}

This would call TokenMintFactory.create${tokenData.tokenType}() on the blockchain.`)
    
    await loadUserTokens()
  }

  const handleTokenClick = (token) => {
    setSelectedToken(token)
    setShowHero(true)
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

  useEffect(() => {
    loadUserTokens()
  }, [loadUserTokens])

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

      {!showHero ? (
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
            setShowHero(false)
          }}
          onMint={handleTokenMint}
          onBurn={handleTokenBurn}
          onTransfer={handleTokenTransfer}
          onListOnETCSwap={handleListOnETCSwap}
        />
      )}

      <TokenMintBuilderModal 
        isOpen={showTokenBuilder}
        onClose={() => setShowTokenBuilder(false)}
        onCreate={handleCreateToken}
      />
    </div>
  )
}

export default TokenMintPage
