import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import RestrictionTag from '../../components/account/RestrictionTag'

describe('RestrictionTag', () => {
  it('shows restricted with text (not colour alone) (FR-023)', () => {
    render(<RestrictionTag status="restricted" />)
    expect(screen.getByText('Restricted')).toBeInTheDocument()
  })

  it('shows uncertain as Unscreened, distinct from clear (FR-011)', () => {
    render(<RestrictionTag status="uncertain" />)
    expect(screen.getByText('Unscreened')).toBeInTheDocument()
  })

  it('renders nothing for clear status', () => {
    const { container } = render(<RestrictionTag status="clear" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <div>
        <RestrictionTag status="restricted" />
        <RestrictionTag status="uncertain" />
      </div>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
