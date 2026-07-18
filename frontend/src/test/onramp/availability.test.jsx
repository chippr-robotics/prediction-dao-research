/**
 * Honest-availability degraded states (spec 060 US2) at the modal level: the pre-handoff surface
 * itself re-validates and degrades honestly — unavailable message instead of a broken flow, and a
 * mid-sheet network switch re-evaluates against the new chain before any handoff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import BuyCryptoModal from '../../components/wallet/BuyCryptoModal'
import { fetchOnrampOptions, createOnrampSession } from '../../lib/onramp/onrampClient'

vi.mock('../../lib/onramp/onrampClient', () => ({
  fetchOnrampOptions: vi.fn(),
  createOnrampSession: vi.fn(),
}))

const DEST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

beforeEach(() => {
  vi.stubGlobal('open', vi.fn(() => ({})))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('degraded availability states', () => {
  it('catalog says unavailable -> honest message, no Continue action', async () => {
    fetchOnrampOptions.mockResolvedValue({ chainId: 137, available: false, assets: [], defaultAsset: null })
    render(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={137} />)
    expect(await screen.findByText(/not available on Polygon right now/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue to coinbase/i })).not.toBeInTheDocument()
    expect(createOnrampSession).not.toHaveBeenCalled()
  })

  it('catalog fetch failure -> the same honest unavailable state, never a broken flow', async () => {
    fetchOnrampOptions.mockRejectedValue(new Error('gateway down'))
    render(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={137} />)
    expect(await screen.findByText(/not available on Polygon right now/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue to coinbase/i })).not.toBeInTheDocument()
  })

  it('a mid-sheet network switch re-fetches availability for the NEW chain before any handoff', async () => {
    fetchOnrampOptions.mockResolvedValue({ chainId: 137, available: true, assets: ['USDC'], defaultAsset: 'USDC' })
    const { rerender } = render(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={137} />)
    await waitFor(() => expect(fetchOnrampOptions).toHaveBeenCalledWith(137))
    expect(await screen.findByText('Polygon')).toBeInTheDocument()

    // The member switches networks while the modal is open (spec edge case): the live chainId
    // prop changes and availability is re-evaluated against the new chain.
    fetchOnrampOptions.mockResolvedValue({ chainId: 1, available: true, assets: ['ETH', 'USDC'], defaultAsset: 'USDC' })
    rerender(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={1} />)
    await waitFor(() => expect(fetchOnrampOptions).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Ethereum')).toBeInTheDocument()
  })

  it('while the catalog check is in flight the modal shows checking, not a premature Continue', async () => {
    let resolveOptions
    fetchOnrampOptions.mockReturnValue(new Promise((r) => (resolveOptions = r)))
    render(<BuyCryptoModal isOpen onClose={vi.fn()} address={DEST} chainId={137} />)
    expect(screen.getByRole('status')).toHaveTextContent(/checking availability/i)
    expect(screen.queryByRole('button', { name: /continue to coinbase/i })).not.toBeInTheDocument()
    resolveOptions({ available: true, assets: ['USDC'], defaultAsset: 'USDC' })
    expect(await screen.findByRole('button', { name: /continue to coinbase/i })).toBeInTheDocument()
  })
})
