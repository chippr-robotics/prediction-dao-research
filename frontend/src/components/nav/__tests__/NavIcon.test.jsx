import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import NavIcon from '../NavIcon'

describe('NavIcon', () => {
  it.each(['arrowOut', 'arrowIn', 'headToHead'])(
    'renders the spec-058 home-bar glyph "%s" as a decorative svg',
    (name) => {
      const { container } = render(<NavIcon name={name} size={20} />)
      const svg = container.querySelector('svg.nav-icon')
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg.innerHTML.length).toBeGreaterThan(0)
    },
  )

  it('renders nothing for an unknown icon name', () => {
    const { container } = render(<NavIcon name="not-a-real-icon" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
