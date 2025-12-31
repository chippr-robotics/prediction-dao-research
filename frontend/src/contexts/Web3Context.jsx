import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { ethers } from 'ethers'
import { EXPECTED_CHAIN_ID, getExpectedChain } from '../wagmi'
import { Web3Context } from './Web3Context'

export function Web3Provider({ children }) {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [networkError, setNetworkError] = useState(null)

  // Update provider and signer when connection changes
  useEffect(() => {
    const updateProviderAndSigner = async () => {
      if (isConnected && window.ethereum) {
        try {
          const ethersProvider = new ethers.BrowserProvider(window.ethereum)
          const ethersSigner = await ethersProvider.getSigner()
          setProvider(ethersProvider)
          setSigner(ethersSigner)
        } catch (error) {
          console.error('Error creating provider/signer:', error)
        }
      } else {
        setProvider(null)
        setSigner(null)
      }
    }
    
    updateProviderAndSigner()
  }, [isConnected, address])

  // Check network compatibility
  useEffect(() => {
    if (isConnected && chainId !== EXPECTED_CHAIN_ID) {
      const expectedChain = getExpectedChain()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setNetworkError(`Wrong network. Please switch to ${expectedChain.name} (Chain ID: ${EXPECTED_CHAIN_ID})`)
    } else {
      setNetworkError(null)
    }
  }, [chainId, isConnected])

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask to use this application')
        return false
      }

      const connector = connectors.find(c => c.id === 'injected')
      if (!connector) {
        alert('No wallet connector available')
        return false
      }

      await connect({ connector })
      return true
    } catch (error) {
      console.error('Error connecting wallet:', error)
      
      // Check for user rejection via error code or name
      if (error.code === 4001 || error.name === 'UserRejectedRequestError') {
        alert('Please approve the connection request')
      } else {
        alert('Failed to connect wallet')
      }
      return false
    }
  }, [connect, connectors])

  const disconnectWallet = useCallback(() => {
    disconnect()
  }, [disconnect])

  const handleSwitchNetwork = useCallback(async () => {
    try {
      await switchChain({ chainId: EXPECTED_CHAIN_ID })
    } catch (error) {
      console.error('Error switching network:', error)
      
      // If switching failed, show instructions
      alert(`Please manually switch to the correct network in MetaMask:\nNetwork: ${getExpectedChain().name}\nChain ID: ${EXPECTED_CHAIN_ID}`)
    }
  }, [switchChain])

  const value = {
    // Connection state
    account: address,
    isConnected,
    chainId,
    
    // Provider and signer
    provider,
    signer,
    
    // Network state
    networkError,
    isCorrectNetwork: isConnected && chainId === EXPECTED_CHAIN_ID,
    
    // Actions
    connectWallet,
    disconnectWallet,
    switchNetwork: handleSwitchNetwork,
  }

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  )
}
