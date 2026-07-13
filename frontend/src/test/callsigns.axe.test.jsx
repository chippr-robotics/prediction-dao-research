import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'

// ---- CallsignPanel dependencies (mocked so we can render each gate state without a live wallet) ----
const walletState = { address: null, signer: null, provider: null, chainId: 137, isConnected: false }
const membershipState = { isActive: false, tier: 0 }
let registryAddress = '0x0000000000000000000000000000000000000abc'

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => walletState,
}))
vi.mock('../hooks/useRoleDetails', () => ({
  default: () => ({ getRoleDetails: () => membershipState }),
  MembershipTier: { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 },
}))
vi.mock('../config/contracts', () => ({
  getContractAddressForChain: () => registryAddress,
}))

// ---- AddressInput resolution hooks (mocked like the AddressInput callsign test) ----
const ensState = { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false }
const callsignState = { isCallsign: false, address: null, status: null, verified: false, isLoading: false, message: null }
vi.mock('../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ensState,
  useEnsReverseLookup: () => ({ ensName: null, isLoading: false }),
}))
vi.mock('../hooks/useCallsignResolution', () => ({
  useCallsignResolution: () => callsignState,
}))

import CallsignPanel from '../components/account/CallsignPanel'
import AddressInput from '../components/ui/AddressInput'

function renderPanel() {
  return render(
    <MemoryRouter>
      <CallsignPanel />
    </MemoryRouter>,
  )
}

describe('Callsign surfaces — accessibility (spec 054, WCAG 2.1 AA)', () => {
  beforeEach(() => {
    Object.assign(walletState, { address: null, signer: null, provider: null, chainId: 137, isConnected: false })
    Object.assign(membershipState, { isActive: false, tier: 0 })
    Object.assign(ensState, { resolvedAddress: null, isLoading: false, error: null, isEns: false, isAddress: false })
    Object.assign(callsignState, { isCallsign: false, address: null, status: null, verified: false, isLoading: false, message: null })
    registryAddress = '0x0000000000000000000000000000000000000abc'
  })

  it('CallsignPanel — disconnected state has no violations', async () => {
    const { container } = renderPanel()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('CallsignPanel — below-Gold upgrade prompt has no violations', async () => {
    Object.assign(walletState, { address: '0x1111111111111111111111111111111111111111', isConnected: true })
    Object.assign(membershipState, { isActive: true, tier: 1 /* Bronze */ })
    const { container } = renderPanel()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('AddressInput — resolved callsign affordance (preview + verified badge + report link) has no violations', async () => {
    Object.assign(callsignState, {
      isCallsign: true,
      address: '0x2222222222222222222222222222222222222222',
      status: 1 /* ACTIVE */,
      verified: true,
    })
    const { container } = render(
      <AddressInput id="callsign-a11y" label="Opponent" value="%chipprbots" onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
