import usePriceConversion from '../hooks/usePriceConversion'
import PriceContext from './PriceContext'

export function PriceProvider({ children }) {
  const priceData = usePriceConversion()

  return (
    <PriceContext.Provider value={priceData}>
      {children}
    </PriceContext.Provider>
  )
}
