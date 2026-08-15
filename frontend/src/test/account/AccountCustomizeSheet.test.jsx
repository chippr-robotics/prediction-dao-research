// Spec 086 (FR-008/FR-011) — the one customize surface: live-applied tint/pattern, reset, and
// image failures that state their reason without touching an existing picture.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

vi.mock('../../components/ui/BlockiesAvatar', () => ({
  default: () => <div data-testid="blockies" />,
}))
vi.mock('../../lib/account/profileImage', async (importOriginal) => {
  const mod = await importOriginal()
  return { ...mod, processProfileImage: vi.fn() }
})

import AccountCustomizeSheet from '../../components/account/AccountCustomizeSheet'
import { processProfileImage } from '../../lib/account/profileImage'
import { getAccountProfile, setAccountProfile, clearAccountProfile } from '../../lib/account/accountProfilesStore'

const ADDR = '0xAaAa000000000000000000000000000000000001'
const ACCOUNT = { address: ADDR, label: 'Cold storage' }
const IMG = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => {
  localStorage.clear()
  clearAccountProfile(ADDR)
  vi.mocked(processProfileImage).mockReset()
})

const renderSheet = () => render(<AccountCustomizeSheet open onClose={() => {}} account={ACCOUNT} />)

describe('AccountCustomizeSheet', () => {
  it('applies a tint immediately when its swatch is chosen (FR-008)', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('radio', { name: /violet shade/i }))
    expect(getAccountProfile(ADDR)).toMatchObject({ tint: 'violet' })
    expect(screen.getByRole('radio', { name: /violet shade/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('applies a pattern immediately and "Plain" clears it', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('radio', { name: /dots pattern/i }))
    expect(getAccountProfile(ADDR)).toMatchObject({ pattern: 'dots' })
    fireEvent.click(screen.getByRole('radio', { name: /plain pattern/i }))
    expect(getAccountProfile(ADDR)?.pattern).toBeUndefined()
  })

  it('stores a processed picture from a chosen file (FR-006)', async () => {
    vi.mocked(processProfileImage).mockResolvedValue(IMG)
    renderSheet()
    const input = screen.getByLabelText(/choose a profile picture/i)
    fireEvent.change(input, { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } })
    await waitFor(() => expect(getAccountProfile(ADDR)?.image).toBe(IMG))
  })

  it('states the reason for a refused image and keeps the existing picture (FR-011)', async () => {
    setAccountProfile(ADDR, { image: IMG })
    vi.mocked(processProfileImage).mockRejectedValue(new Error('That file is not an image.'))
    renderSheet()
    const input = screen.getByLabelText(/choose a profile picture/i)
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/not an image/i)
    expect(getAccountProfile(ADDR)?.image).toBe(IMG)
  })

  it('reset returns the card to the defaults', () => {
    setAccountProfile(ADDR, { image: IMG, tint: 'mint', pattern: 'grid' })
    renderSheet()
    fireEvent.click(screen.getByTestId('acs-reset'))
    expect(getAccountProfile(ADDR)).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderSheet()
    expect(await axe(container)).toHaveNoViolations()
  })
})
