import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import InfoTip from '../components/ui/InfoTip'

describe('InfoTip accessibility (spec 039 FR-007)', () => {
  it('has no violations closed', async () => {
    const { container } = render(
      <InfoTip label="About: Stake — each side">Enter the amount in USD.</InfoTip>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations open', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <InfoTip label="About: Stake — each side">Enter the amount in USD.</InfoTip>
    )
    await user.click(screen.getByRole('button', { name: 'About: Stake — each side' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('wires aria-expanded and aria-controls on the trigger', async () => {
    const user = userEvent.setup()
    render(<InfoTip label="About: Stake — each side">Enter the amount in USD.</InfoTip>)
    const btn = screen.getByRole('button', { name: 'About: Stake — each side' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    const region = document.getElementById(btn.getAttribute('aria-controls'))
    expect(region).toHaveAttribute('aria-live', 'polite')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(region).toContainElement(screen.getByRole('note'))
  })
})
