import { useEffect } from 'react'
import { useEthers } from './useWeb3'
import { useNotification, useAnnouncement } from './useUI'

/**
 * Hook to listen to contract events and provide real-time notifications
 * @param {Object} contract - Ethers contract instance
 * @param {string} eventName - Name of the event to listen to
 * @param {Function} onEvent - Callback function when event is triggered
 * @param {boolean} notify - Whether to show notifications for events
 */
export function useContractEvent(contract, eventName, onEvent, notify = true) {
  const { provider } = useEthers()
  const { showNotification } = useNotification()
  const { announce } = useAnnouncement()

  useEffect(() => {
    if (!contract || !provider) {
      return
    }

    let isSubscribed = true

    const setupListener = async () => {
      try {
        // Create event filter
        const filter = contract.filters[eventName]?.()
        
        if (!filter) {
          console.warn(`Event ${eventName} not found on contract`)
          return
        }

        // Event handler
        const handleEvent = (...args) => {
          if (!isSubscribed) return

          // Extract event data (last argument is the event object)
          const event = args[args.length - 1]
          const eventArgs = args.slice(0, -1)

          console.log(`Event ${eventName} triggered:`, eventArgs)

          // Call custom handler
          if (onEvent) {
            onEvent(...eventArgs, event)
          }

          // Show notification if enabled
          if (notify) {
            showNotification(`${eventName} event detected`, 'info', 3000)
            announce(`${eventName} event detected`)
          }
        }

        // Subscribe to event
        contract.on(filter, handleEvent)

        // Cleanup function
        return () => {
          contract.off(filter, handleEvent)
        }
      } catch (error) {
        console.error(`Error setting up listener for ${eventName}:`, error)
      }
    }

    const cleanup = setupListener()

    return () => {
      isSubscribed = false
      if (cleanup && typeof cleanup === 'function') {
        cleanup()
      }
    }
  }, [contract, eventName, onEvent, notify, provider, showNotification, announce])
}

/**
 * Hook to listen to multiple contract events
 * @param {Object} contract - Ethers contract instance
 * @param {Array} events - Array of event configurations: [{ name, handler, notify }]
 */
export function useContractEvents(contract, events = []) {
  const { provider } = useEthers()
  const { showNotification } = useNotification()
  const { announce } = useAnnouncement()

  useEffect(() => {
    if (!contract || !provider || events.length === 0) {
      return
    }

    const cleanupFunctions = []

    events.forEach(({ name, handler, notify = true, message }) => {
      try {
        const filter = contract.filters[name]?.()
        
        if (!filter) {
          console.warn(`Event ${name} not found on contract`)
          return
        }

        const handleEvent = (...args) => {
          const event = args[args.length - 1]
          const eventArgs = args.slice(0, -1)

          console.log(`Event ${name} triggered:`, eventArgs)

          if (handler) {
            handler(...eventArgs, event)
          }

          if (notify) {
            const notificationMessage = message || `${name} event detected`
            showNotification(notificationMessage, 'info', 3000)
            announce(notificationMessage)
          }
        }

        contract.on(filter, handleEvent)

        cleanupFunctions.push(() => {
          contract.off(filter, handleEvent)
        })
      } catch (error) {
        console.error(`Error setting up listener for ${name}:`, error)
      }
    })

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [contract, events, provider, showNotification, announce])
}

/**
 * Hook to listen to account changes from wallet
 * @param {Function} onAccountChange - Callback when account changes
 */
export function useAccountChange(onAccountChange) {
  const { announce } = useAnnouncement()
  const { showNotification } = useNotification()

  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        announce('Please connect to MetaMask')
        showNotification('Please connect to MetaMask', 'warning')
      } else {
        announce('Account changed')
        showNotification('Account changed', 'info')
        if (onAccountChange) {
          onAccountChange(accounts[0])
        }
      }
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
    }
  }, [onAccountChange, announce, showNotification])
}

/**
 * Hook to listen to chain changes from wallet
 * @param {Function} onChainChange - Callback when chain changes
 */
export function useChainChange(onChainChange) {
  const { announce } = useAnnouncement()
  const { showNotification } = useNotification()

  useEffect(() => {
    if (!window.ethereum) return

    const handleChainChanged = (chainId) => {
      announce('Network changed')
      showNotification('Network changed, reloading...', 'info')
      
      if (onChainChange) {
        onChainChange(chainId)
      } else {
        // Default behavior: reload the page
        window.location.reload()
      }
    }

    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [onChainChange, announce, showNotification])
}
