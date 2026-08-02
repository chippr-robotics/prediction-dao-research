import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegisterExternalDao from '../RegisterExternalDao'

// Spec 042 US2 + network-agnostic follow-up — register/track flow, now with an explicit target-network picker
// (any clearpath-capable chain, not just the connected one). Client-side framework detection (OZ vs Bravo) gates
// validation; on a registry-less TARGET network the submit routes to trackDAO (device-local) with no network
// switch required. On a registry TARGET network, a wallet connected elsewhere is offered a "Switch to X" prompt
// instead of Register — a signer can only write on its connected chain. Invalid/unknown addresses are rejected
// with a truthful reason and nothing is tracked.

const h = vi.hoisted(() => ({ detect: vi.fn(), track: vi.fn(), switchChainAsync: vi.fn().mockResolvedValue({}) }))

vi.mock('../connectors', () => ({
  detectFramework: (...a) => h.detect(...a),
  getConnector: (fw) => ({ framework: fw, validate: async () => ({ ok: true, name: 'Uniswap Governor Bravo' }) }),
}))
vi.mock('wagmi', () => ({ useSwitchChain: () => ({ switchChainAsync: h.switchChainAsync, isPending: false }) }))
vi.mock('../../../config/networks', () => ({ getNetwork: (id) => ({ name: `Network ${id}` }) }))
// CpAddressField → AddressBookButton → wallet hooks would throw without a provider.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

const ADDR = '0x408ED6354d4973f66138C91495F2f2FCbd8724C3'
const STABLE_READER = {} // referential stability matters — see useClearPath's own cachedReadProvider comment

function renderForm({ hasRegistryChainIds = [], chainIds = [63], connectedChainId = 63 } = {}) {
  return render(
    <RegisterExternalDao
      connectedChainId={connectedChainId}
      connectedReader={STABLE_READER}
      chainIds={chainIds}
      hasRegistryFor={(id) => hasRegistryChainIds.includes(Number(id))}
      readerFor={() => STABLE_READER}
      track={h.track}
      onRegistered={() => {}}
    />
  )
}

describe('RegisterExternalDao (spec 042 US2, network-agnostic)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detects the framework, then tracks device-local on a registry-less network', async () => {
    h.detect.mockResolvedValue(1) // GovernorBravo
    h.track.mockResolvedValue({ added: true })
    const user = userEvent.setup()
    renderForm({ hasRegistryChainIds: [] })
    await user.type(screen.getByLabelText(/governor address/i), ADDR)
    await user.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(screen.getByText(/Recognized Governor Bravo contract/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /track dao/i }))
    await waitFor(() => expect(h.track).toHaveBeenCalledWith(expect.objectContaining({ address: ADDR, framework: 1, chainId: 63 })))
  })

  it('rejects an unrecognized contract with a truthful reason — nothing tracked', async () => {
    h.detect.mockResolvedValue('unknown')
    const user = userEvent.setup()
    renderForm({ hasRegistryChainIds: [] })
    await user.type(screen.getByLabelText(/governor address/i), ADDR)
    await user.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(screen.getByText(/Not a recognized governance contract/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /track dao/i })).toBeDisabled()
    expect(h.track).not.toHaveBeenCalled()
  })

  it('labels the primary action "Register DAO" on a registry network the wallet is already connected to', async () => {
    h.detect.mockResolvedValue(0)
    renderForm({ hasRegistryChainIds: [63], chainIds: [63], connectedChainId: 63 })
    expect(screen.getByRole('button', { name: /register dao/i })).toBeInTheDocument()
  })

  it('defaults the network picker to the connected chain when it is in scope', () => {
    renderForm({ hasRegistryChainIds: [], chainIds: [61, 63], connectedChainId: 63 })
    expect(screen.getByLabelText(/network/i)).toHaveValue('63')
  })

  it('offers a Switch prompt instead of Register when the chosen network has a registry and the wallet is elsewhere', async () => {
    h.detect.mockResolvedValue(0)
    const user = userEvent.setup()
    // Wallet is connected to 137; the DAO is registered on 63, which the member selects explicitly.
    renderForm({ hasRegistryChainIds: [63], chainIds: [63, 137], connectedChainId: 137 })
    await user.selectOptions(screen.getByLabelText(/network/i), '63')
    expect(screen.queryByRole('button', { name: /^register dao$/i })).not.toBeInTheDocument()
    const switchBtn = screen.getByRole('button', { name: /switch to network 63/i })
    expect(switchBtn).toBeInTheDocument()
    await user.type(screen.getByLabelText(/governor address/i), ADDR)
    await user.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(screen.getByText(/Recognized/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /switch to network 63/i }))
    expect(h.switchChainAsync).toHaveBeenCalledWith({ chainId: 63 })
    expect(h.track).not.toHaveBeenCalled()
  })
})
