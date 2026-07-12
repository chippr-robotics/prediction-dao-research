import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the resolution hooks so we drive AddressInput's tag branch without wagmi / a live registry.
const ensState = { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false }
const tagState = { isTag: false, address: null, status: null, verified: false, isLoading: false, message: null }
const onResolvedChange = vi.fn()

vi.mock('../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ensState,
  useEnsReverseLookup: () => ({ ensName: null, isLoading: false }),
}))
vi.mock('../hooks/useTagResolution', () => ({
  useTagResolution: () => tagState,
}))

import AddressInput from '../components/ui/AddressInput'

const OWNER = '0x1111111111111111111111111111111111111111'

function reset() {
  Object.assign(ensState, { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false })
  Object.assign(tagState, { isTag: false, address: null, status: null, verified: false, isLoading: false, message: null })
  onResolvedChange.mockReset()
}

describe('AddressInput — wager tag entry (spec 054)', () => {
  beforeEach(reset)

  it('shows the resolved full address for an ACTIVE tag and reports it upward (FR-011)', () => {
    Object.assign(tagState, { isTag: true, address: OWNER, status: 1 /* ACTIVE */, verified: true })
    render(<AddressInput id="a" value="%chipprbots" onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.getByText(/resolves to:/i)).toBeInTheDocument()
    expect(screen.getByText(/0x1111\.\.\.1111/)).toBeInTheDocument()
    // verification marker present for a verified tag
    expect(screen.getByLabelText(/verified/i)).toBeInTheDocument()
    // the tag-resolved address is reported to the parent (committable)
    expect(onResolvedChange).toHaveBeenLastCalledWith(OWNER)
  })

  it('surfaces a non-committable message for a non-ACTIVE tag and does not report an address', () => {
    Object.assign(tagState, { isTag: true, address: null, status: 3 /* QUARANTINED */, message: 'This tag is no longer active' })
    render(<AddressInput id="b" value="%oldtag" onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer active/i)
    expect(onResolvedChange).toHaveBeenLastCalledWith(null)
  })

  it('leaves raw-address entry unaffected (no tag branch)', () => {
    Object.assign(ensState, { resolvedAddress: OWNER, isAddress: true })
    render(<AddressInput id="c" value={OWNER} onChange={() => {}} onResolvedChange={onResolvedChange} />)
    expect(screen.queryByText(/resolves to:/i)).not.toBeInTheDocument()
    expect(onResolvedChange).toHaveBeenLastCalledWith(OWNER)
  })
})
