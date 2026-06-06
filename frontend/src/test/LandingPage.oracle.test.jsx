import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock the heavy children so we render just the LandingPage (incl. its footer).
vi.mock('../components/Header', () => ({ default: () => <div data-testid="header" /> }))
vi.mock('../components/fairwins/LiveStats', () => ({ default: () => <div data-testid="livestats" /> }))
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => ({ native: 'ETH', networkName: 'Test' }),
}))

// LandingPage reads SHOW_ALL_ORACLE_MODELS at module load, so we stub the env +
// reset modules + dynamically import per flag value.
async function renderLanding(setting) {
  vi.resetModules()
  vi.unstubAllEnvs()
  if (setting !== undefined) vi.stubEnv('VITE_ORACLE_MODELS', setting)
  const { default: LandingPage } = await import('../components/LandingPage')
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  )
}

describe('LandingPage footer "Oracles" list (VITE_ORACLE_MODELS)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('default → lists only Polymarket; no Chainlink/UMA links (SC-003)', async () => {
    await renderLanding(undefined)
    expect(screen.getByText('Polymarket')).toBeInTheDocument()
    expect(screen.queryByText('Chainlink')).not.toBeInTheDocument()
    expect(screen.queryByText('UMA Protocol')).not.toBeInTheDocument()
  })

  it("'all' → restores the Chainlink + UMA links (reversibility, SC-004)", async () => {
    await renderLanding('all')
    expect(screen.getByText('Polymarket')).toBeInTheDocument()
    expect(screen.getByText('Chainlink')).toBeInTheDocument()
    expect(screen.getByText('UMA Protocol')).toBeInTheDocument()
  })
})
