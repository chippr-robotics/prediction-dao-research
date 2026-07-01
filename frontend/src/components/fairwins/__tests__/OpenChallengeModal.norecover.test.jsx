import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The modal renders MakerPanel by default; mock its flow hooks so it renders without a chain.
vi.mock('../../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge: vi.fn(), busy: false, error: null }) }
})
vi.mock('../../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ lookup: vi.fn(), discover: vi.fn(), accept: vi.fn(), busy: false, error: null }),
}))

import OpenChallengeModal from '../OpenChallengeModal'

describe('OpenChallengeModal — recovery codes relocated (spec 037, US3)', () => {
  it('keeps Create/Take tabs but no longer shows a "Recover codes" tab', () => {
    render(<OpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByRole('tab', { name: /create a challenge/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /take a challenge/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /recover codes/i })).toBeNull()
  })
})
