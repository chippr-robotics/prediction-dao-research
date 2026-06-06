import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { ethers } from 'ethers'
import { isSupportedChainId, getNetwork, listSupportedChainIds, PRIMARY_CHAIN_ID } from '../config/networks'
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
    let ignore = false

    const updateProviderAndSigner = async () => {
      if (isConnected && window.ethereum) {
        try {
          const ethersProvider = new ethers.BrowserProvider(window.ethereum)
          const ethersSigner = await ethersProvider.getSigner()
          if (!ignore) {
            setProvider(ethersProvider)
            setSigner(ethersSigner)
          }
        } catch (error) {
          console.error('Error creating provider/signer:', error)
        }
      } else {
        if (!ignore) {
          setProvider(null)
          setSigner(null)
        }
      }
    }

    updateProviderAndSigner()

    return () => { ignore = true }
  }, [isConnected, address])

  // Check network compatibility. Only emit a network error when the connected
  // chain is not in the supported set (Polygon Amoy or local Hardhat).
  useEffect(() => {
    let ignore = false

    const checkNetwork = async () => {
      if (isConnected && !isSupportedChainId(chainId)) {
        const supported = listSupportedChainIds()
          .map((id) => getNetwork(id)?.name)
          .filter(Boolean)
          .join(' or ')
        const primary = getNetwork(PRIMARY_CHAIN_ID)
        if (!ignore) {
          setNetworkError(
            `Wrong network. Please switch to ${supported || primary?.name || 'a supported network'}.`
          )
        }
      } else {
        if (!ignore) {
          setNetworkError(null)
        }
      }
    }

    checkNetwork()

    return () => { ignore = true }
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
    // Switch to the configured primary chain (Polygon mainnet). This path only
    // runs when the user is on an unrecognized network.
    const target = PRIMARY_CHAIN_ID
    try {
      await switchChain({ chainId: target })
    } catch (error) {
      console.error('Error switching network:', error)
      const targetNet = getNetwork(target)
      alert(
        `Please manually switch to the correct network in your wallet:\n` +
        `Network: ${targetNet?.name || 'Polygon'}\nChain ID: ${target}`
      )
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
    
    // Network state — "correct" means the user is on a supported chain
    // (Polygon Amoy or local Hardhat). Use capabilities from networks.js to
    // decide whether a feature is available on the connected chain.
    networkError,
    isCorrectNetwork: isConnected && isSupportedChainId(chainId),
    
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
