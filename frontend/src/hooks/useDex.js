import { useContext } from 'react'
import { DexContext } from '../contexts/DexContext'

/**
 * Hook to access the active chain's DEX context.
 * @returns {Object} DEX context value
 * @throws {Error} If used outside DexProvider
 */
export function useDex() {
  const context = useContext(DexContext)
  if (!context) {
    throw new Error('useDex must be used within a DexProvider')
  }
  return context
}
