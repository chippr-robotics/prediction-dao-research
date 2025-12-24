import { useContext } from 'react'
import { ETCswapContext } from '../contexts/ETCswapContext'

/**
 * Hook to access ETCswap context
 * @returns {Object} ETCswap context value
 * @throws {Error} If used outside ETCswapProvider
 */
export function useETCswap() {
  const context = useContext(ETCswapContext)
  if (!context) {
    throw new Error('useETCswap must be used within an ETCswapProvider')
  }
  return context
}
