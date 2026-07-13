import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the resolution hooks so we drive AddressInput's callsign branch without wagmi / a live registry.
const ensState = { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false }
const callsignState = { isCallsign: false, address: null, status: null, verified: false, isLoading: false, message: null }
const onResolvedChange = vi.fn()

vi.mock('../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ensState,
  useEnsReverseLookup: () => ({ ensName: null, isLoading: false }),
}))
vi.mock('../hooks/useCallsignResolution', () => ({
  useCallsignResolution: () => callsignState,
}))

import AddressInput from '../components/ui/AddressInput'

const OWNER = '0x1111111111111111111111111111111111111111'

function reset() {
  Object.assign(ensState, { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false })
  Object.assign(callsignState, { isCallsign: false, address: null, status: null, verified: false, isLoading: false, message: null })
  onResolvedChange.mockReset()
}

describe('AddressInput — callsign entry (spec 054)', () => {
  beforeEach(reset)

  it('shows the resolved full address for an ACTIVE callsign and reports it upward (FR-011)', () => {
    Object.assign(callsignState, { isCallsign: true, address: OWNER, status: 1 /* ACTIVE */, verified: true })
    render(<AddressInput id="a" value="%chipprbots" onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.getByText(/resolves to:/i)).toBeInTheDocument()
    expect(screen.getByText(/0x1111\.\.\.1111/)).toBeInTheDocument()
    // verification marker present for a verified callsign
    expect(screen.getByLabelText(/verified/i)).toBeInTheDocument()
    // abuse-report affordance is offered on a resolved counterparty callsign (FR-025)
    expect(screen.getByRole('link', { name: /report/i })).toBeInTheDocument()
    // the callsign-resolved address is reported to the parent (committable)
    expect(onResolvedChange).toHaveBeenLastCalledWith(OWNER)
  })

  it('surfaces a non-committable message for a non-ACTIVE callsign and does not report an address', () => {
    Object.assign(callsignState, { isCallsign: true, address: null, status: 3 /* QUARANTINED */, message: 'This callsign is no longer active' })
    render(<AddressInput id="b" value="%oldtag" onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer active/i)
    expect(onResolvedChange).toHaveBeenLastCalledWith(null)
  })

  it('leaves raw-address entry unaffected (no callsign branch)', () => {
    Object.assign(ensState, { resolvedAddress: OWNER, isAddress: true })
    render(<AddressInput id="c" value={OWNER} onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.queryByText(/resolves to:/i)).not.toBeInTheDocument()
    expect(onResolvedChange).toHaveBeenLastCalledWith(OWNER)
  })

  it('degrades gracefully when the registry is unreachable — no error, no false address (FR-013/SC-008)', () => {
    // Soft-fail state useCallsignResolution returns for a callsign-shaped input it could not resolve
    // (undeployed / unreachable registry): isCallsign true, but address/status/message all null.
    Object.assign(callsignState, { isCallsign: true, address: null, status: null, message: null })
    render(<AddressInput id="d" value="%chipprbots" onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/resolves to:/i)).not.toBeInTheDocument()
    // No committable address is fabricated; the field falls back to whatever ENS/raw entry produced (null here).
    expect(onResolvedChange).toHaveBeenLastCalledWith(null)
  })
})
