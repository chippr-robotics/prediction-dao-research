/**
 * Spec 093 — useAdminAccess keeps the monolith's three-way entry distinction.
 *
 * 'granted', 'denied' and 'unverified' are three different statements, and
 * the third exists because "we could not ask" must never be dressed as "you
 * hold nothing" (spec 071 FR-012). Curator authority stays an async registry
 * answer that only counts on a definite yes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const m = vi.hoisted(() => ({
  roles: [],
  estateRead: { read: [137], unreadable: [], swept: true },
  curator: { held: false, outcome: 'not-held' },
}))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: (r) => m.roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => m.roles.includes(r)),
    estateRead: m.estateRead,
    chainsForRole: () => [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: '0xabc', chainId: 137 }),
}))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve(m.curator),
}))

import { useAdminAccess, adminBadgeLabel } from '../../components/admin/useAdminAccess'
import { ROLES } from '../../contexts/RoleContext'

beforeEach(() => {
  m.roles = []
  m.estateRead = { read: [137], unreadable: [], swept: true }
  m.curator = { held: false, outcome: 'not-held' }
})

describe('entryState is three-way, never two', () => {
  it('grants for any admin-adjacent role', () => {
    m.roles = [ROLES.GUARDIAN]
    const { result } = renderHook(() => useAdminAccess())
    expect(result.current.entryState).toBe('granted')
    expect(result.current.flags.isGuardian).toBe(true)
  })

  it('denies only when at least one chain actually answered', () => {
    const { result } = renderHook(() => useAdminAccess())
    expect(result.current.entryState).toBe('denied')
  })

  it('reports unverified when NO chain answered', () => {
    m.estateRead = { read: [], unreadable: [137, 63], swept: true }
    const { result } = renderHook(() => useAdminAccess())
    expect(result.current.entryState).toBe('unverified')
  })

  it('reports unverified when the sweep never completed', () => {
    m.estateRead = { read: [], unreadable: [], swept: false }
    const { result } = renderHook(() => useAdminAccess())
    expect(result.current.entryState).toBe('unverified')
  })

  it('grants a registry-confirmed curator who holds nothing else (async)', async () => {
    m.curator = { held: true, outcome: 'held' }
    const { result } = renderHook(() => useAdminAccess())
    expect(result.current.entryState).toBe('denied') // until the registry answers
    await waitFor(() => expect(result.current.entryState).toBe('granted'))
    expect(result.current.flags.isAppCurator).toBe(true)
  })

  it('gates an uncertain curator answer as not-held (fails closed for nav)', async () => {
    m.curator = { held: false, outcome: 'unverified' }
    const { result } = renderHook(() => useAdminAccess())
    await waitFor(() => expect(result.current.curatorAuthority).not.toBeNull())
    expect(result.current.flags.isAppCurator).toBe(false)
  })
})

describe('adminBadgeLabel names the role that got the operator in', () => {
  it('never says "Admin" for a non-admin', () => {
    expect(adminBadgeLabel({ isFeeAdmin: true })).toBe('Fee Administrator')
    expect(adminBadgeLabel({ isLiquidityAdmin: true })).toBe('Liquidity Administrator')
    expect(adminBadgeLabel({})).toBe('Operator')
  })
})
