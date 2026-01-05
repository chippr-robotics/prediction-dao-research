import { createContext, useContext } from 'react'
import usePriceConversion from '../hooks/usePriceConversion'

const PriceContext = createContext(null)

export function usePrice() {
  const context = useContext(PriceContext)
  if (!context) {
    throw new Error('usePrice must be used within a PriceProvider')
  }
  return context
}

export function PriceProvider({ children }) {
  const priceData = usePriceConversion()

  return (
    <PriceContext.Provider value={priceData}>
      {children}
    </PriceContext.Provider>
  )
}

export default PriceContext
