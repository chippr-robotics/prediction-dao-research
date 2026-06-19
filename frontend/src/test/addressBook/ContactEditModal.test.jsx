import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ContactEditModal from '../../components/account/ContactEditModal'

const NETWORKS = [
  { chainId: 137, name: 'Polygon' },
  { chainId: 63, name: 'Ethereum Classic Mordor' },
]
const VALID = '0x1111111111111111111111111111111111111111'

function setup(props = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <ContactEditModal
      contact={null}
      defaultChainId={137}
      networks={NETWORKS}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSave, onCancel }
}

describe('ContactEditModal', () => {
  it('rejects invalid addresses (FR-005)', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()
    await user.type(screen.getByLabelText('Nickname *'), 'Alex')
    await user.type(screen.getByLabelText('Address *'), 'not-an-address')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('saves a valid contact with the selected network (FR-002, FR-003)', async () => {
    const user = userEvent.setup()
    const { onSave } = setup()
    await user.type(screen.getByLabelText('Nickname *'), 'Alex')
    await user.type(screen.getByLabelText('Address *'), VALID)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({
      nickname: 'Alex',
      addresses: [{ address: VALID, chainId: 137, notes: '' }],
    })
  })

  it('defaults the network to the active chain', () => {
    setup({ defaultChainId: 63 })
    expect(screen.getByLabelText('Network *')).toHaveValue('63')
  })

  it('warns when an address is already saved (edge case)', async () => {
    const user = userEvent.setup()
    const findDuplicate = vi.fn(() => ({ contact: { id: 'x', nickname: 'Bob' } }))
    setup({ findDuplicate })
    await user.type(screen.getByLabelText('Address *'), VALID)
    expect(await screen.findByText(/Already saved under "Bob"/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ContactEditModal contact={null} defaultChainId={137} networks={NETWORKS} onSave={() => {}} onCancel={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
