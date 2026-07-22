// Spec 062 follow-up — acting as a recovered legacy account signs with the
// unlocked in-memory legacy signer (via the audited personal submit path), and
// refuses to act when the signer is gone.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const PERSONAL_SIGNER = { id: 'personal' }
const LEGACY_SIGNER = { id: 'legacy' }

vi.mock('../../hooks', () => ({ useWallet: () => ({ address: '0xowner' }) }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ chainId: 137, signer: PERSONAL_SIGNER, provider: {} }),
}))

const submitSpy = vi.fn(async () => ({ kind: 'sent', txHash: '0xabc' }))
vi.mock('../../lib/custody/submitAsActiveAccount', () => ({
  submitAsActiveAccount: (...args) => submitSpy(...args),
}))

import { CustodyProvider } from '../../contexts/CustodyContext.jsx'
import { useActiveAccount } from '../../hooks/useActiveAccount'

function Probe({ withSigner = true }) {
  const { identity, canActAsLegacy, submit, operateAsLegacy } = useActiveAccount()
  return (
    <div>
      <span data-testid="mode">{identity.mode}</span>
      <span data-testid="can">{canActAsLegacy ? 'yes' : 'no'}</span>
      <button onClick={() => operateAsLegacy({ address: '0xLegacy', chainId: 137, kind: 'privateKey', signer: withSigner ? LEGACY_SIGNER : undefined })}>as-legacy</button>
      <button onClick={() => submit({ to: '0xdead', value: 1n }).catch((e) => { document.title = e.message })}>submit</button>
    </div>
  )
}

beforeEach(() => submitSpy.mockClear())

describe('useActiveAccount — legacy acting account', () => {
  it('signs with the unlocked legacy signer via the personal submit path', async () => {
    render(<CustodyProvider><Probe /></CustodyProvider>)
    fireEvent.click(screen.getByText('as-legacy'))
    expect(screen.getByTestId('mode')).toHaveTextContent('legacy')
    expect(screen.getByTestId('can')).toHaveTextContent('yes')

    fireEvent.click(screen.getByText('submit'))
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    const [, ctx] = submitSpy.mock.calls[0]
    expect(ctx.signer).toBe(LEGACY_SIGNER) // the legacy key, not the connected wallet
    expect(ctx.signer).not.toBe(PERSONAL_SIGNER)
  })

  it('refuses to act as a legacy account with no signer in memory', async () => {
    render(<CustodyProvider><Probe withSigner={false} /></CustodyProvider>)
    fireEvent.click(screen.getByText('as-legacy'))
    // Descriptor without a signer is ignored → stays personal, never acts on an un-unlocked key.
    expect(screen.getByTestId('mode')).toHaveTextContent('personal')
    fireEvent.click(screen.getByText('submit'))
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    // Falls back to the connected (personal) signer, not a phantom legacy key.
    expect(submitSpy.mock.calls[0][1].signer).toBe(PERSONAL_SIGNER)
  })
})
