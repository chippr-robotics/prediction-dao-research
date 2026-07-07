// Spec 043 (US4) — governance panel: proposes add/remove/threshold as vault transactions targeting the Safe,
// enforces threshold bounds (FR-018/005), and is hidden for view-only members (FR-016).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Interface, getAddress } from 'ethers'
import OwnersThresholdPanel from '../../components/custody/OwnersThresholdPanel'
import { SAFE_ABI } from '../../abis/Safe'

const A = '0x000000000000000000000000000000000000aaa1'
const B = '0x000000000000000000000000000000000000bbb2'
const C = '0x000000000000000000000000000000000000ccc3'
const VAULT = '0x1111111111111111111111111111111111111111'
const safeIface = new Interface(SAFE_ABI)

const ownedVault = { isSafe: true, owner: true, address: VAULT, chainId: 63, owners: [A, B], threshold: 1 }

describe('OwnersThresholdPanel', () => {
  it('proposes addOwnerWithThreshold targeting the Safe', async () => {
    const onPropose = vi.fn().mockResolvedValue({})
    render(<OwnersThresholdPanel vault={ownedVault} onPropose={onPropose} />)
    fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
    fireEvent.change(screen.getByLabelText(/new owner address/i), { target: { value: C } })
    fireEvent.change(screen.getByLabelText(/new threshold/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /propose add owner/i }))
    await waitFor(() => expect(onPropose).toHaveBeenCalled())
    const { to, data } = onPropose.mock.calls[0][0]
    expect(getAddress(to)).toBe(getAddress(VAULT))
    const decoded = safeIface.decodeFunctionData('addOwnerWithThreshold', data)
    expect(getAddress(decoded[0])).toBe(getAddress(C))
    expect(decoded[1]).toBe(2n)
  })

  it('blocks a threshold greater than the resulting owner count', () => {
    render(<OwnersThresholdPanel vault={ownedVault} onPropose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
    fireEvent.change(screen.getByLabelText(/new owner address/i), { target: { value: C } })
    fireEvent.change(screen.getByLabelText(/new threshold/i), { target: { value: '4' } }) // max would be 3
    expect(screen.getByRole('alert')).toHaveTextContent(/between 1 and 3/i)
    expect(screen.getByRole('button', { name: /propose add owner/i })).toBeDisabled()
  })

  it('proposes changeThreshold and has no axe violations', async () => {
    const onPropose = vi.fn().mockResolvedValue({})
    const threeVault = { ...ownedVault, owners: [A, B, C], threshold: 2 }
    const { container } = render(<OwnersThresholdPanel vault={threeVault} onPropose={onPropose} />)
    fireEvent.click(screen.getByRole('button', { name: /change threshold/i }))
    fireEvent.change(screen.getByLabelText(/new threshold/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /propose threshold change/i }))
    await waitFor(() => expect(onPropose).toHaveBeenCalled())
    const decoded = safeIface.decodeFunctionData('changeThreshold', onPropose.mock.calls[0][0].data)
    expect(decoded[0]).toBe(3n)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders nothing for a view-only member', () => {
    const { container } = render(<OwnersThresholdPanel vault={{ ...ownedVault, owner: false }} onPropose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
