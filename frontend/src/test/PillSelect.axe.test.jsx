import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PillSelect from '../components/ui/PillSelect'

const OPTIONS = [
  { value: 'a', label: 'Alpha', icon: '🅰️' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true, disabledReason: 'Not available on this network.' },
]

describe('PillSelect accessibility (spec 038 FR-016)', () => {
  it('has no accessibility violations with a mix of enabled and locked options', async () => {
    const { container } = render(
      <PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={() => {}} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations when disabled', async () => {
    const { container } = render(
      <PillSelect label="Who settles?" options={OPTIONS} value="a" onChange={() => {}} disabled />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
