// Spec 062 + 088 — acting as a recovered legacy account signs with the in-memory legacy signer
// (via the audited personal submit path). With no signer in memory the identity still switches
// (address-only, spec 088) and submit PARKS on the deferred ceremony broker: attaching a signer
// resolves the send; a stale chain binding drops the signer and re-runs the ceremony.

import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const PERSONAL_SIGNER = { id: 'personal' }
const LEGACY_SIGNER = { id: 'legacy' }

let connectedChainId = 137
vi.mock('../../hooks', () => ({ useWallet: () => ({ address: '0xowner' }) }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ chainId: connectedChainId, signer: PERSONAL_SIGNER, provider: {} }),
}))

const submitSpy = vi.fn(async () => ({ kind: 'sent', txHash: '0xabc' }))
vi.mock('../../lib/custody/submitAsActiveAccount', () => ({
  submitAsActiveAccount: (...args) => submitSpy(...args),
}))

import { useContext } from 'react'
import { CustodyProvider } from '../../contexts/CustodyContext.jsx'
import { CustodyContext } from '../../contexts/CustodyContext'
import { useActiveAccount } from '../../hooks/useActiveAccount'

function Probe({ withSigner = true }) {
  const [, force] = useState(0)
  const { identity, canActAsLegacy, submit, operateAsLegacy } = useActiveAccount()
  const { signerRequest, attachActingSigner, cancelSignerRequest } = useContext(CustodyContext)
  return (
    <div>
      <span data-testid="mode">{identity.mode}</span>
      <span data-testid="can">{canActAsLegacy ? 'yes' : 'no'}</span>
      <span data-testid="request">{signerRequest ? signerRequest.mode : 'none'}</span>
      <button onClick={() => operateAsLegacy({ address: '0xLegacy', chainId: 137, kind: 'privateKey', signer: withSigner ? LEGACY_SIGNER : undefined })}>as-legacy</button>
      <button onClick={() => force((n) => n + 1)}>re-render</button>
      <button onClick={() => attachActingSigner(LEGACY_SIGNER, connectedChainId)}>attach</button>
      <button onClick={() => cancelSignerRequest()}>cancel</button>
      <button onClick={() => submit({ to: '0xdead', value: 1n }).catch((e) => { document.title = e.message })}>submit</button>
    </div>
  )
}

beforeEach(() => { submitSpy.mockClear(); connectedChainId = 137; document.title = '' })

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

  it('drops a stale wrong-chain signer and re-runs the ceremony instead of sending (spec 088)', async () => {
    render(<CustodyProvider><Probe /></CustodyProvider>)
    fireEvent.click(screen.getByText('as-legacy')) // unlocked for chainId 137
    expect(screen.getByTestId('can')).toHaveTextContent('yes')
    // Member switches networks after unlocking: the cached signer is bound to the old chain.
    connectedChainId = 999
    fireEvent.click(screen.getByText('re-render'))
    fireEvent.click(screen.getByText('submit'))
    // NOT sent with the stale signer — a fresh ceremony is requested instead.
    await waitFor(() => expect(screen.getByTestId('request')).toHaveTextContent('legacy'))
    expect(submitSpy).not.toHaveBeenCalled()
    // Completing the ceremony (rebinding to the CURRENT chain) lets the send proceed.
    fireEvent.click(screen.getByText('attach'))
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    expect(submitSpy.mock.calls[0][1].signer).toBe(LEGACY_SIGNER)
  })

  it('switches address-only without a signer and parks the send on the ceremony (spec 088)', async () => {
    render(<CustodyProvider><Probe withSigner={false} /></CustodyProvider>)
    fireEvent.click(screen.getByText('as-legacy'))
    // The identity switches immediately — the public address is enough to act AS the account.
    expect(screen.getByTestId('mode')).toHaveTextContent('legacy')
    expect(screen.getByTestId('can')).toHaveTextContent('yes')
    fireEvent.click(screen.getByText('submit'))
    // The send parks on the broker; nothing is signed with the personal key.
    await waitFor(() => expect(screen.getByTestId('request')).toHaveTextContent('legacy'))
    expect(submitSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('attach'))
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    expect(submitSpy.mock.calls[0][1].signer).toBe(LEGACY_SIGNER)
    expect(submitSpy.mock.calls[0][1].signer).not.toBe(PERSONAL_SIGNER)
  })

  it('cancelling the ceremony rejects the parked send with a stated reason (spec 088)', async () => {
    render(<CustodyProvider><Probe withSigner={false} /></CustodyProvider>)
    fireEvent.click(screen.getByText('as-legacy'))
    fireEvent.click(screen.getByText('submit'))
    await waitFor(() => expect(screen.getByTestId('request')).toHaveTextContent('legacy'))
    fireEvent.click(screen.getByText('cancel'))
    await waitFor(() => expect(document.title).toMatch(/cancelled/i))
    expect(submitSpy).not.toHaveBeenCalled()
  })
})
