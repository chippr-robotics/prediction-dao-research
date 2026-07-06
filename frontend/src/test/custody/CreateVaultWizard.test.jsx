// Spec 043 (US1) — create wizard: validation (FR-005), address preview, and create delegation.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import CreateVaultWizard from '../../components/custody/CreateVaultWizard'

const OWNER = '0x1111111111111111111111111111111111111111'
const OWNER2 = '0x2222222222222222222222222222222222222222'

describe('CreateVaultWizard', () => {
  it('blocks create when threshold exceeds owner count (FR-005)', () => {
    render(<CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: '2' } }) // 1 owner, threshold 2
    expect(screen.getByRole('alert')).toHaveTextContent(/exceed/i)
    expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
  })

  it('previews the predicted address for a valid config', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xABCdef0000000000000000000000000000000123')
    render(<CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={onPreview} />)
    fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
    const inputs = screen.getAllByPlaceholderText('0x…')
    fireEvent.change(inputs[1], { target: { value: OWNER2 } })
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(screen.getByText(/0xABCdef/i)).toBeInTheDocument())
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ owners: [OWNER, OWNER2], threshold: 2 }),
    )
  })

  it('calls onCreate then onDone with the same salt used for preview', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xabc')
    const onCreate = vi.fn().mockResolvedValue({ address: '0xabc' })
    const onDone = vi.fn()
    render(
      <CreateVaultWizard connectedAddress={OWNER} onCreate={onCreate} onPreview={onPreview} onDone={onDone} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(onPreview).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /create vault/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const previewSalt = onPreview.mock.calls[0][0].saltNonce
    const createSalt = onCreate.mock.calls[0][0].saltNonce
    expect(createSalt).toBe(previewSalt)
    expect(onDone).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
