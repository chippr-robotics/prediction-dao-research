// Spec 043 (US3) — access the active-identity context (operate as personal wallet vs. a vault).

import { useContext } from 'react'
import { CustodyContext } from '../contexts/CustodyContext'

export function useCustody() {
  const ctx = useContext(CustodyContext)
  if (!ctx) throw new Error('useCustody must be used within a CustodyProvider')
  return ctx
}

export default useCustody
