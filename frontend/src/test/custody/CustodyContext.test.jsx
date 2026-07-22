// Spec 043 (US3) — active-identity context: operate-as-vault sets the identity, switch-back resets, and a
// change of connected account resets to personal.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let walletCtx = { address: '0xowner' }
vi.mock('../../hooks', () => ({ useWallet: () => walletCtx }))

import { CustodyProvider } from '../../contexts/CustodyContext.jsx'
import { useCustody } from '../../hooks/useCustody'

function Probe() {
  const { active, operateAsVault, operateAsPersonal } = useCustody()
  return (
    <div>
      <span data-testid="mode">{active.mode}</span>
      <span data-testid="vault">{active.vaultAddress || ''}</span>
      <button onClick={() => operateAsVault({ address: '0xVault', chainId: 63, label: 'Coop' })}>as-vault</button>
      <button onClick={operateAsPersonal}>as-personal</button>
    </div>
  )
}

beforeEach(() => {
  walletCtx = { address: '0xowner' }
})

describe('CustodyContext', () => {
  it('defaults to personal and switches to a vault then back', () => {
    render(
      <CustodyProvider>
        <Probe />
      </CustodyProvider>,
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
    fireEvent.click(screen.getByText('as-vault'))
    expect(screen.getByTestId('mode')).toHaveTextContent('vault')
    expect(screen.getByTestId('vault')).toHaveTextContent('0xVault')
    fireEvent.click(screen.getByText('as-personal'))
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
  })

  it('operates as a recovered legacy account and holds its signer, clearing on switch-back', () => {
    const signer = { sendTransaction: vi.fn() }
    function LegacyProbe() {
      const { active, legacySigner, operateAsLegacy, operateAsPersonal } = useCustody()
      return (
        <div>
          <span data-testid="mode">{active.mode}</span>
          <span data-testid="legacy-addr">{active.address || ''}</span>
          <span data-testid="has-signer">{legacySigner ? 'yes' : 'no'}</span>
          <button onClick={() => operateAsLegacy({ address: '0xLegacy', chainId: 137, kind: 'privateKey', label: 'Old', signer })}>as-legacy</button>
          <button onClick={operateAsPersonal}>as-personal</button>
        </div>
      )
    }
    render(
      <CustodyProvider>
        <LegacyProbe />
      </CustodyProvider>,
    )
    fireEvent.click(screen.getByText('as-legacy'))
    expect(screen.getByTestId('mode')).toHaveTextContent('legacy')
    expect(screen.getByTestId('legacy-addr')).toHaveTextContent('0xLegacy')
    expect(screen.getByTestId('has-signer')).toHaveTextContent('yes')
    fireEvent.click(screen.getByText('as-personal'))
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
    expect(screen.getByTestId('has-signer')).toHaveTextContent('no') // in-memory key dropped
  })

  it('ignores a legacy descriptor with no signer (never acts as an un-unlocked key)', () => {
    function BadLegacy() {
      const { active, operateAsLegacy } = useCustody()
      return (
        <div>
          <span data-testid="mode">{active.mode}</span>
          <button onClick={() => operateAsLegacy({ address: '0xLegacy', chainId: 137 })}>bad</button>
        </div>
      )
    }
    render(
      <CustodyProvider>
        <BadLegacy />
      </CustodyProvider>,
    )
    fireEvent.click(screen.getByText('bad'))
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
  })

  it('ignores an invalid vault (missing address/chainId)', () => {
    function BadProbe() {
      const { active, operateAsVault } = useCustody()
      return (
        <div>
          <span data-testid="mode">{active.mode}</span>
          <button onClick={() => operateAsVault({ label: 'x' })}>bad</button>
        </div>
      )
    }
    render(
      <CustodyProvider>
        <BadProbe />
      </CustodyProvider>,
    )
    fireEvent.click(screen.getByText('bad'))
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
  })
})
