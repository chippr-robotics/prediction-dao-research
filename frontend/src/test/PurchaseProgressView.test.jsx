import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import PurchaseProgressView from '../components/ui/PurchaseProgressView'

const step = (id, kind, state, extra = {}) => ({
  id,
  label: { approve: 'Approve USDC spending', pay: 'Pay for membership', sign: 'Sign to set up private wagers', register: 'Register your encryption key' }[id],
  detail: 'detail text',
  kind,
  blocking: id === 'approve' || id === 'pay',
  state,
  failureReason: null,
  txHash: null,
  ...extra,
})

const runningProps = (over = {}) => ({
  steps: [
    step('pay', 'transaction', 'completed'),
    step('sign', 'signature', 'active'),
    step('register', 'transaction', 'pending'),
  ],
  activeIndex: 1,
  activeStep: step('sign', 'signature', 'active'),
  status: 'running',
  completedCount: 1,
  total: 3,
  progressFraction: 1 / 3,
  canContinueAnyway: false,
  onRetry: vi.fn(),
  onContinueAnyway: vi.fn(),
  ...over,
})

describe('PurchaseProgressView — labels & kind (US1)', () => {
  it('renders each step label (FR-002)', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    expect(screen.getByText('Pay for membership')).toBeInTheDocument()
    expect(screen.getByText('Sign to set up private wagers')).toBeInTheDocument()
    expect(screen.getByText('Register your encryption key')).toBeInTheDocument()
  })

  it('distinguishes signature steps from transaction steps (FR-003)', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    // signature indicator present for the sign step, transaction indicator for others
    expect(screen.getByText(/Signature · no gas/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Transaction · in wallet/i).length).toBeGreaterThanOrEqual(1)
  })

  it('announces the active step via a live region (FR-013)', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/Sign to set up private wagers/i)
  })
})

describe('PurchaseProgressView — progress position & states (US2)', () => {
  it('shows overall position "step N of M" (FR-005)', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument()
  })

  it('exposes a progressbar reflecting completed count', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
  })

  it('marks the active step with aria-current (FR-004)', () => {
    render(<PurchaseProgressView {...runningProps()} />)
    const current = document.querySelector('[aria-current="step"]')
    expect(current).toBeTruthy()
    expect(current.textContent).toMatch(/Sign to set up private wagers/i)
  })
})

describe('PurchaseProgressView — failure & recovery (US3)', () => {
  const failedBlocking = () => runningProps({
    steps: [step('pay', 'transaction', 'failed', { failureReason: 'Transaction rejected by user' }), step('sign', 'signature', 'pending'), step('register', 'transaction', 'pending')],
    status: 'failed',
    activeIndex: 0,
    activeStep: step('pay', 'transaction', 'failed', { failureReason: 'Transaction rejected by user' }),
    canContinueAnyway: false,
  })

  const failedKey = () => runningProps({
    steps: [step('pay', 'transaction', 'completed'), step('sign', 'signature', 'completed'), step('register', 'transaction', 'failed', { failureReason: 'register boom' })],
    status: 'failed',
    activeIndex: 2,
    completedCount: 2,
    activeStep: step('register', 'transaction', 'failed', { failureReason: 'register boom' }),
    canContinueAnyway: true,
  })

  it('shows the failure reason and a Retry action (FR-007)', () => {
    render(<PurchaseProgressView {...failedBlocking()} />)
    expect(screen.getByText('Transaction rejected by user')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('does NOT offer Continue anyway for a blocking failure', () => {
    render(<PurchaseProgressView {...failedBlocking()} />)
    expect(screen.queryByRole('button', { name: /continue anyway/i })).not.toBeInTheDocument()
  })

  it('offers Continue anyway only for a non-blocking key-step failure (FR-010)', async () => {
    const props = failedKey()
    render(<PurchaseProgressView {...props} />)
    const cont = screen.getByRole('button', { name: /continue anyway/i })
    await userEvent.click(cont)
    expect(props.onContinueAnyway).toHaveBeenCalled()
  })

  it('fires onRetry when Retry is clicked', async () => {
    const props = failedKey()
    render(<PurchaseProgressView {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(props.onRetry).toHaveBeenCalled()
  })
})

describe('PurchaseProgressView — accessibility (FR-013, constitution V)', () => {
  it('has no axe violations while running', async () => {
    const { container } = render(<PurchaseProgressView {...runningProps()} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in a failed state', async () => {
    const { container } = render(<PurchaseProgressView {...runningProps({
      steps: [step('pay', 'transaction', 'completed'), step('register', 'transaction', 'failed', { failureReason: 'boom' })],
      status: 'failed', activeIndex: 1, total: 2, completedCount: 1, canContinueAnyway: true,
      activeStep: step('register', 'transaction', 'failed', { failureReason: 'boom' }),
    })} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
