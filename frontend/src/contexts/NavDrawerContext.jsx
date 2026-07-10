import { useCallback, useMemo, useState } from 'react'
import { NavDrawerContext } from './NavDrawerContext.js'

/**
 * Provider for the global navigation drawer ("us"). See NavDrawerContext.js for
 * the context + useNavDrawer hook.
 */
export function NavDrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((o) => !o), [])

  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle])

  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>
}
