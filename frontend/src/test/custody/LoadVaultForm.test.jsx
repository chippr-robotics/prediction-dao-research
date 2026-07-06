// Spec 043 (US1) — load form: surfaces the classified error for a non-Safe and confirms a loaded vault.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import LoadVaultForm from '../../components/custody/LoadVaultForm'

const VAULT = '0x1111111111111111111111111111111111111111'

describe('LoadVaultForm', () => {
  it('shows an error when the address is not a Safe', async () => {
    const onLoad = vi.fn().mockRejectedValue(Object.assign(new Error('Not a Safe vault.'), { classification: 'not-a-safe' }))
    render(<LoadVaultForm onLoad={onLoad} />)
    fireEvent.change(screen.getByLabelText(/vault address/i), { target: { value: VAULT } })
    fireEvent.click(screen.getByRole('button', { name: /load vault/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not a safe/i))
  })

  it('confirms a loaded view-only vault', async () => {
    const onLoad = vi.fn().mockResolvedValue({ isSafe: true, owner: false, owners: [VAULT, VAULT], threshold: 2 })
    render(<LoadVaultForm onLoad={onLoad} />)
    fireEvent.change(screen.getByLabelText(/vault address/i), { target: { value: VAULT } })
    fireEvent.click(screen.getByRole('button', { name: /load vault/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/view-only vault/i))
  })

  it('disables load until an address is entered and has no axe violations', async () => {
    const { container } = render(<LoadVaultForm onLoad={vi.fn()} />)
    expect(screen.getByRole('button', { name: /load vault/i })).toBeDisabled()
    expect(await axe(container)).toHaveNoViolations()
  })
})
