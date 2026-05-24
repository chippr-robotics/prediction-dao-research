import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { UIContext } from '../contexts/UIContext'
import ModalSystem from '../components/ui/ModalSystem'

function createWrapper(modalValue = null) {
  const hideModal = vi.fn()
  const value = {
    modal: modalValue,
    showModal: vi.fn(),
    hideModal,
    notification: null,
    showNotification: vi.fn(),
    hideNotification: vi.fn(),
    announcement: '',
    announce: vi.fn(),
    error: null,
    showError: vi.fn(),
    clearError: vi.fn(),
  }
  function Wrapper({ children }) {
    return <UIContext.Provider value={value}>{children}</UIContext.Provider>
  }
  return { Wrapper, hideModal }
}

describe('ModalSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  it('should render nothing when modal is null', () => {
    const { Wrapper } = createWrapper(null)
    const { container } = render(<ModalSystem />, { wrapper: Wrapper })
    expect(container.innerHTML).toBe('')
  })

  it('should render nothing when modal has no content', () => {
    const { Wrapper } = createWrapper({ content: null, options: {} })
    const { container } = render(<ModalSystem />, { wrapper: Wrapper })
    expect(container.innerHTML).toBe('')
  })

  it('should render modal content when provided', () => {
    const { Wrapper } = createWrapper({
      content: <p>Modal body</p>,
      options: { title: 'Test Modal' },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal body')).toBeInTheDocument()
  })

  it('should render with dialog role and aria-modal', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: { title: 'Accessible Modal' },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
  })

  it('should render close button when closable and has title', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: { title: 'Title', closable: true },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const closeBtn = screen.getByLabelText('Close modal')
    expect(closeBtn).toBeInTheDocument()
  })

  it('should call hideModal when close button is clicked', () => {
    const { Wrapper, hideModal } = createWrapper({
      content: <p>Content</p>,
      options: { title: 'Title', closable: true },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    fireEvent.click(screen.getByLabelText('Close modal'))
    expect(hideModal).toHaveBeenCalled()
  })

  it('should call hideModal when backdrop is clicked and closable', () => {
    const { Wrapper, hideModal } = createWrapper({
      content: <p>Content</p>,
      options: { closable: true },
    })
    const { container } = render(<ModalSystem />, { wrapper: Wrapper })

    const backdrop = container.querySelector('.modal-backdrop')
    fireEvent.click(backdrop)
    expect(hideModal).toHaveBeenCalled()
  })

  it('should NOT call hideModal when backdrop clicked and not closable', () => {
    const { Wrapper, hideModal } = createWrapper({
      content: <p>Content</p>,
      options: { closable: false },
    })
    const { container } = render(<ModalSystem />, { wrapper: Wrapper })

    const backdrop = container.querySelector('.modal-backdrop')
    fireEvent.click(backdrop)
    expect(hideModal).not.toHaveBeenCalled()
  })

  it('should apply size class from options', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: { size: 'large' },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('modal-large')
  })

  it('should default to medium size', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: {},
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('modal-medium')
  })

  it('should render close button absolutely when no title and closable', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: { closable: true },
    })
    const { container } = render(<ModalSystem />, { wrapper: Wrapper })

    const closeBtn = container.querySelector('.modal-close-absolute')
    expect(closeBtn).toBeInTheDocument()
  })

  it('should not render any close button when not closable', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: { closable: false },
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const closeBtn = screen.queryByLabelText('Close modal')
    expect(closeBtn).not.toBeInTheDocument()
  })

  it('should hide modal on Escape key', () => {
    const { Wrapper, hideModal } = createWrapper({
      content: <p>Content</p>,
      options: {},
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hideModal).toHaveBeenCalled()
  })

  it('should set aria-label when no title', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: {},
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Dialog')
  })

  it('should prevent body scroll when modal is open', () => {
    const { Wrapper } = createWrapper({
      content: <p>Content</p>,
      options: {},
    })
    render(<ModalSystem />, { wrapper: Wrapper })

    expect(document.body.style.overflow).toBe('hidden')
  })
})
