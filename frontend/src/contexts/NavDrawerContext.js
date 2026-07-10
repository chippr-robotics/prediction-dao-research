import { createContext, useContext } from 'react'

/**
 * Global navigation drawer state (spec: app navigation redesign).
 *
 * The redesigned nav shell moves the section menu out of the My Account page and
 * into a global left slide-over ("us") that the clover logo opens on every
 * in-app route. This context is the single open/close handle shared by the
 * Header logo (opener) and AppNavDrawer (the drawer itself).
 *
 * The provider lives in NavDrawerContext.jsx (mirrors DexContext.js/.jsx).
 */
export const NavDrawerContext = createContext(null)

/**
 * Access the global nav drawer. Returns a no-op handle when used outside a
 * provider (e.g. the landing-page Header) so callers never have to guard.
 */
export function useNavDrawer() {
  const ctx = useContext(NavDrawerContext)
  if (!ctx) {
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {}, available: false }
  }
  return { ...ctx, available: true }
}
