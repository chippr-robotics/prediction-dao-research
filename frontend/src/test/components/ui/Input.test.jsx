/**
 * Tests for Input component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import Input from '../../../components/ui/Input'

describe('Input', () => {
  it('renders an input element', () => {
    const { container } = render(<Input value="" onChange={() => {}} />)
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('defaults to type="text"', () => {
    const { container } = render(<Input value="" onChange={() => {}} />)
    expect(container.querySelector('input').type).toBe('text')
  })

  it('uses provided type', () => {
    const { container } = render(<Input type="email" value="" onChange={() => {}} />)
    expect(container.querySelector('input').type).toBe('email')
  })

  it('sets value', () => {
    const { container } = render(<Input value="hello" onChange={() => {}} />)
    expect(container.querySelector('input').value).toBe('hello')
  })

  it('calls onChange handler', () => {
    const onChange = vi.fn()
    const { container } = render(<Input value="" onChange={onChange} />)
    fireEvent.change(container.querySelector('input'), { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('sets placeholder', () => {
    const { container } = render(<Input placeholder="Enter text" value="" onChange={() => {}} />)
    expect(container.querySelector('input').placeholder).toBe('Enter text')
  })

  it('applies disabled state', () => {
    const { container } = render(<Input disabled value="" onChange={() => {}} />)
    expect(container.querySelector('input').disabled).toBe(true)
  })

  it('applies required state', () => {
    const { container } = render(<Input required value="" onChange={() => {}} />)
    const input = container.querySelector('input')
    expect(input.required).toBe(true)
    expect(input.getAttribute('aria-required')).toBe('true')
  })

  it('applies id', () => {
    const { container } = render(<Input id="my-input" value="" onChange={() => {}} />)
    expect(container.querySelector('#my-input')).toBeTruthy()
  })

  it('applies error styling', () => {
    const { container } = render(<Input error value="" onChange={() => {}} />)
    const input = container.querySelector('input')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('applies aria-describedby', () => {
    const { container } = render(<Input ariaDescribedBy="help-text" value="" onChange={() => {}} />)
    expect(container.querySelector('input').getAttribute('aria-describedby')).toBe('help-text')
  })

  it('applies ariaInvalid override', () => {
    const { container } = render(<Input ariaInvalid="false" value="" onChange={() => {}} />)
    expect(container.querySelector('input').getAttribute('aria-invalid')).toBe('false')
  })

  it('applies additional className', () => {
    const { container } = render(<Input className="custom" value="" onChange={() => {}} />)
    const input = container.querySelector('input')
    expect(input.className).toContain('custom')
  })

  it('forwards ref', () => {
    const ref = React.createRef()
    render(<Input ref={ref} value="" onChange={() => {}} />)
    expect(ref.current).toBeTruthy()
    expect(ref.current.tagName).toBe('INPUT')
  })
})
