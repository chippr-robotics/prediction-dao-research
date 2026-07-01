import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The modal renders MakerPanel by default; mock its create hook so it renders without a chain.
vi.mock('../../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge: vi.fn(), busy: false, error: null }) }
})

import OpenChallengeModal from '../OpenChallengeModal'

describe('OpenChallengeModal — create-only after spec 037 (recovery + taking relocated)', () => {
  it('shows only the Create tab — no "Take a challenge" or "Recover codes" tabs', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByRole('tab', { name: /create a challenge/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /take a challenge/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /recover codes/i })).toBeNull()
  })
})
