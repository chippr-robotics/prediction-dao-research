import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { getDeployedNetworks } from '../config/contracts'
import DeployedNetworks from '../components/fairwins/DeployedNetworks'

describe('getDeployedNetworks()', () => {
  it('lists every chain with a live wagerRegistry, excluding local Hardhat', () => {
    const nets = getDeployedNetworks()
    const ids = nets.map((n) => n.chainId)

    // Public deployments (Polygon, Amoy, Mordor) are present...
    expect(ids).toEqual(expect.arrayContaining([137, 80002, 63]))
    // ...and the local-only Hardhat sandbox (1337) is not.
    expect(ids).not.toContain(1337)
  })

  it('orders mainnets before testnets', () => {
    const nets = getDeployedNetworks()
    const firstTestnetIdx = nets.findIndex((n) => n.isTestnet)
    const lastMainnetIdx = nets.map((n) => n.isTestnet).lastIndexOf(false)
    if (firstTestnetIdx !== -1 && lastMainnetIdx !== -1) {
      expect(lastMainnetIdx).toBeLessThan(firstTestnetIdx)
    }
  })

  it('links each chip to the deployed escrow on the chain explorer', () => {
    const polygon = getDeployedNetworks().find((n) => n.chainId === 137)
    expect(polygon.contractUrl).toMatch(/^https:\/\/polygonscan\.com\/address\/0x/)
  })
})

describe('<DeployedNetworks />', () => {
  it('renders a "Deployed on" label and a chip per deployed network', () => {
    render(<DeployedNetworks />)
    expect(screen.getByText('Deployed on')).toBeInTheDocument()

    const list = screen.getByLabelText(/deployed on/i)
    const expected = getDeployedNetworks()
    expected.forEach((net) => {
      expect(within(list).getByText(net.name)).toBeInTheDocument()
    })
  })

  it('flags testnets with a Testnet tag', () => {
    render(<DeployedNetworks />)
    const testnetCount = getDeployedNetworks().filter((n) => n.isTestnet).length
    expect(screen.getAllByText('Testnet')).toHaveLength(testnetCount)
  })
})
