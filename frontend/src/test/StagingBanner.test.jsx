import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

/**
 * Non-production marker (spec 076, FR-025/FR-026d), T036/T037.
 *
 * The mainnet case is the one that carries safety weight: that service mirrors production against
 * the live Polygon estate, so its transactions are real. The banner must say so in terms a tester
 * cannot read as "sandbox".
 */
async function load() {
  vi.resetModules()
  return import('../components/ui/StagingBanner')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('StagingBanner', () => {
  it('renders nothing in a production build', async () => {
    vi.stubEnv('VITE_STAGING_BANNER', '')
    const { default: StagingBanner } = await load()
    const { container } = render(<StagingBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an unrecognized value rather than guessing a cohort', async () => {
    for (const bad of ['yes', 'true', 'prod', 'polygon']) {
      vi.stubEnv('VITE_STAGING_BANNER', bad)
      const { default: StagingBanner } = await load()
      const { container } = render(<StagingBanner />)
      expect(container, `"${bad}" must not render a banner`).toBeEmptyDOMElement()
    }
  })

  it('discloses that mainnet staging spends REAL funds (FR-026d)', async () => {
    vi.stubEnv('VITE_STAGING_BANNER', 'mainnet')
    const { default: StagingBanner } = await load()
    render(<StagingBanner />)
    const banner = screen.getByTestId('staging-banner')
    expect(banner).toHaveAttribute('data-mode', 'mainnet')
    expect(banner.textContent).toMatch(/REAL/)
    expect(banner.textContent).toMatch(/real funds/i)
    // It must NOT read as a sandbox — that is the misreading the disclosure exists to prevent.
    expect(banner.textContent).not.toMatch(/simulat|sandbox|dry run|no real/i)
  })

  it('says plainly that testnet staging risks no real funds', async () => {
    vi.stubEnv('VITE_STAGING_BANNER', 'testnet')
    const { default: StagingBanner } = await load()
    render(<StagingBanner />)
    const banner = screen.getByTestId('staging-banner')
    expect(banner).toHaveAttribute('data-mode', 'testnet')
    expect(banner.textContent).toMatch(/No real funds/i)
  })

  it('gives the two cohorts materially different copy', async () => {
    vi.stubEnv('VITE_STAGING_BANNER', 'mainnet')
    const { default: MainnetBanner } = await load()
    const { container: mainnet } = render(<MainnetBanner />)
    const mainnetText = mainnet.textContent

    vi.stubEnv('VITE_STAGING_BANNER', 'testnet')
    const { default: TestnetBanner } = await load()
    const { container: testnet } = render(<TestnetBanner />)

    // "Test environment" would be true of both and useful for neither.
    expect(mainnetText).not.toBe(testnet.textContent)
  })

  it('is not dismissible — no control that could hide it', async () => {
    vi.stubEnv('VITE_STAGING_BANNER', 'mainnet')
    const { default: StagingBanner } = await load()
    const { container } = render(<StagingBanner />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('has no accessibility violations in either cohort', async () => {
    for (const mode of ['mainnet', 'testnet']) {
      vi.stubEnv('VITE_STAGING_BANNER', mode)
      const { default: StagingBanner } = await load()
      const { container } = render(<StagingBanner />)
      expect(await axe(container)).toHaveNoViolations()
    }
  })
})
