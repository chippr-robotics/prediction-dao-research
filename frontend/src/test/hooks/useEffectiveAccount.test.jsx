// Spec 063 (US1, T005) — useEffectiveAccount resolves the acting account's address for every surface.

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { WalletContext } from '../../contexts/WalletContext'
import { CustodyContext } from '../../contexts/CustodyContext'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'

const CONNECTED = '0xConnected0000000000000000000000000000001'

function wrapper({ active, address = CONNECTED } = {}) {
  return ({ children }) => (
    <WalletContext.Provider value={{ address }}>
      <CustodyContext.Provider value={{ active: active ?? { mode: 'personal' } }}>
        {children}
      </CustodyContext.Provider>
    </WalletContext.Provider>
  )
}

describe('useEffectiveAccount', () => {
  it('resolves to the connected wallet when acting as personal', () => {
    const { result } = renderHook(() => useEffectiveAccount(), { wrapper: wrapper() })
    expect(result.current.type).toBe('personal')
    expect(result.current.address).toBe(CONNECTED)
    expect(result.current.isActingAccount).toBe(false)
  })

  it('resolves to the vault address when acting as a vault', () => {
    const vaultAddr = '0xVault00000000000000000000000000000000002'
    const { result } = renderHook(() => useEffectiveAccount(), {
      wrapper: wrapper({ active: { mode: 'vault', vaultAddress: vaultAddr, chainId: 137, label: 'Team' } }),
    })
    expect(result.current.type).toBe('vault')
    expect(result.current.address).toBe(vaultAddr)
    expect(result.current.label).toBe('Team')
    expect(result.current.isActingAccount).toBe(true)
    expect(result.current.connectedAddress).toBe(CONNECTED)
    expect(result.current.chainId).toBe(137)
  })

  it('resolves to the recovered account address when acting as legacy', () => {
    const legacyAddr = '0xLegacy0000000000000000000000000000000003'
    const { result } = renderHook(() => useEffectiveAccount(), {
      wrapper: wrapper({ active: { mode: 'legacy', address: legacyAddr, chainId: 61, label: '0xLeg…0003' } }),
    })
    expect(result.current.type).toBe('legacy')
    expect(result.current.address).toBe(legacyAddr)
    expect(result.current.isActingAccount).toBe(true)
  })

  it('resolves a derived (cross-chain) account by its EVM address', () => {
    const derivedAddr = '0xDerived000000000000000000000000000000004'
    const { result } = renderHook(() => useEffectiveAccount(), {
      wrapper: wrapper({ active: { mode: 'derived', address: derivedAddr, label: 'Recovered BTC' } }),
    })
    expect(result.current.type).toBe('derived')
    expect(result.current.address).toBe(derivedAddr)
    expect(result.current.isActingAccount).toBe(true)
  })

  it('falls back to personal when a vault selection lacks an address', () => {
    const { result } = renderHook(() => useEffectiveAccount(), {
      wrapper: wrapper({ active: { mode: 'vault' } }),
    })
    expect(result.current.type).toBe('personal')
    expect(result.current.address).toBe(CONNECTED)
  })

  it('degrades to personal with no address when no providers are mounted', () => {
    const { result } = renderHook(() => useEffectiveAccount())
    expect(result.current.type).toBe('personal')
    expect(result.current.address).toBeNull()
    expect(result.current.isActingAccount).toBe(false)
  })
})
