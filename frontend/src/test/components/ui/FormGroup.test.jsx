/**
 * Tests for FormGroup component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import FormGroup from '../../../components/ui/FormGroup'

describe('FormGroup', () => {
  it('renders label and input', () => {
    render(<FormGroup label="Email" id="email" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('shows required indicator when required', () => {
    render(<FormGroup label="Name" id="name" required value="" onChange={() => {}} />)
    expect(screen.getByText('*')).toBeTruthy()
    expect(screen.getByLabelText(/required/)).toBeTruthy()
  })

  it('does not show required indicator when not required', () => {
    const { container } = render(<FormGroup label="Name" id="name" value="" onChange={() => {}} />)
    expect(container.querySelector('[aria-label="required"]')).toBeNull()
  })

  it('renders helper text', () => {
    render(<FormGroup label="Field" id="field" helperText="Enter your name" value="" onChange={() => {}} />)
    expect(screen.getByText('Enter your name')).toBeTruthy()
  })

  it('renders error message instead of helper text when error present', () => {
    render(
      <FormGroup
        label="Field"
        id="field"
        helperText="Enter your name"
        error="Name is required"
        value=""
        onChange={() => {}}
      />
    )
    expect(screen.getByText('Name is required')).toBeTruthy()
    expect(screen.queryByText('Enter your name')).toBeNull()
  })

  it('error message has role="alert"', () => {
    render(
      <FormGroup
        label="Field"
        id="field"
        error="Required"
        value=""
        onChange={() => {}}
      />
    )
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('calls onChange when input changes', () => {
    const onChange = vi.fn()
    render(<FormGroup label="Input" id="input" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Input'), { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('passes through additional props to input', () => {
    const { container } = render(
      <FormGroup label="Email" id="email" type="email" placeholder="you@example.com" value="" onChange={() => {}} />
    )
    const input = container.querySelector('input')
    expect(input.type).toBe('email')
    expect(input.placeholder).toBe('you@example.com')
  })

  it('applies disabled state', () => {
    const { container } = render(
      <FormGroup label="Field" id="field" disabled value="" onChange={() => {}} />
    )
    expect(container.querySelector('input').disabled).toBe(true)
  })

  it('applies extra className', () => {
    const { container } = render(
      <FormGroup label="Field" id="field" className="custom" value="" onChange={() => {}} />
    )
    expect(container.firstChild.className).toContain('custom')
  })
})
