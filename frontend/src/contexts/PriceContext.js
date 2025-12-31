import { createContext, useContext } from 'react'

const PriceContext = createContext(null)

export function usePrice() {
  const context = useContext(PriceContext)
  if (!context) {
    throw new Error('usePrice must be used within a PriceProvider')
  }
  return context
}

export default PriceContext
