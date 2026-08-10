/**
 * Shared state for a group of AccordionSections (Recovery tab, spec 062 UX).
 *
 * Kept in its own module (no components) so Vite fast-refresh stays happy and so
 * a section can work standalone: `useAccordionGroup()` returns null when there is
 * no provider above, and the section falls back to its own local open state.
 */

import { createContext, useContext } from 'react'

export const AccordionGroupContext = createContext(null)

export function useAccordionGroup() {
  return useContext(AccordionGroupContext)
}
