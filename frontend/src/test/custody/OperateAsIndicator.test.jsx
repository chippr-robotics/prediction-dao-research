// Spec 043 (US3, FR-020/023) — the persistent indicator: hidden in personal mode; shows identity + switch-back
// in vault mode; warns on network mismatch.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'

let active = { mode: 'personal' }
let canActAsVault = true
const operateAsPersonal = vi.fn()
vi.mock('../../hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({
    isVault: active.mode === 'vault',
    identity: active,
    canActAsVault,
    operateAsPersonal,
  }),
}))

import OperateAsIndicator from '../../components/custody/OperateAsIndicator'

describe('OperateAsIndicator', () => {
  it('renders nothing in personal mode', () => {
    active = { mode: 'personal' }
    const { container } = render(<OperateAsIndicator />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the active vault and a switch-back control', async () => {
    active = { mode: 'vault', vaultAddress: '0x1111111111111111111111111111111111111111', chainId: 63, label: 'Coop' }
    canActAsVault = true
    const { container } = render(<OperateAsIndicator />)
    expect(screen.getByText(/operating as/i)).toHaveTextContent(/Coop/)
    fireEvent.click(screen.getByRole('button', { name: /switch back to personal/i }))
    expect(operateAsPersonal).toHaveBeenCalled()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('warns when connected to the wrong network', () => {
    active = { mode: 'vault', vaultAddress: '0x1111111111111111111111111111111111111111', chainId: 137, label: 'Coop' }
    canActAsVault = false
    render(<OperateAsIndicator />)
    expect(screen.getByText(/switch to network 137/i)).toBeInTheDocument()
  })
})
