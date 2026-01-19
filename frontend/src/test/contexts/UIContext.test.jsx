import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UIProvider } from '../../contexts/UIContext.jsx'
import { useContext } from 'react'
import { UIContext } from '../../contexts/UIContext'

// Helper component to access context
function UIConsumer() {
  const ui = useContext(UIContext)
  return (
    <div>
      {/* Notification */}
      {ui.notification && (
        <div data-testid="notification">
          <span data-testid="notification-message">{ui.notification.message}</span>
          <span data-testid="notification-type">{ui.notification.type}</span>
        </div>
      )}

      {/* Announcement */}
      <span data-testid="announcement">{ui.announcement}</span>

      {/* Modal */}
      {ui.modal && (
        <div data-testid="modal">
          <span data-testid="modal-content">{ui.modal.content}</span>
        </div>
      )}

      {/* Error */}
      {ui.error && (
        <div data-testid="error">
          <span data-testid="error-message">{ui.error.message}</span>
        </div>
      )}

      {/* Actions */}
      <button onClick={() => ui.showNotification('Test notification')}>Show Notification</button>
      <button onClick={() => ui.showNotification('Warning message', 'warning')}>Show Warning</button>
      <button onClick={() => ui.showNotification('Persistent', 'info', 0)}>Show Persistent</button>
      <button onClick={ui.hideNotification}>Hide Notification</button>
      <button onClick={() => ui.announce('Screen reader announcement')}>Announce</button>
      <button onClick={() => ui.showModal('Modal content')}>Show Modal</button>
      <button onClick={ui.hideModal}>Hide Modal</button>
      <button onClick={() => ui.showError('Error message')}>Show Error</button>
      <button onClick={ui.clearError}>Clear Error</button>
    </div>
  )
}

describe('UIContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Notifications', () => {
    it('should show notification', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Notification'))

      expect(screen.getByTestId('notification')).toBeInTheDocument()
      expect(screen.getByTestId('notification-message')).toHaveTextContent('Test notification')
    })

    it('should default to info type', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Notification'))

      expect(screen.getByTestId('notification-type')).toHaveTextContent('info')
    })

    it('should set custom notification type', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Warning'))

      expect(screen.getByTestId('notification-type')).toHaveTextContent('warning')
    })

    it('should auto-hide notification after duration', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Notification'))
      expect(screen.getByTestId('notification')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.queryByTestId('notification')).not.toBeInTheDocument()
    })

    it('should not auto-hide when duration is 0', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Persistent'))
      expect(screen.getByTestId('notification')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(screen.getByTestId('notification')).toBeInTheDocument()
    })

    it('should hide notification manually', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Notification'))
      expect(screen.getByTestId('notification')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Hide Notification'))

      expect(screen.queryByTestId('notification')).not.toBeInTheDocument()
    })
  })

  describe('Announcements', () => {
    it('should set announcement message', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Announce'))

      expect(screen.getByTestId('announcement')).toHaveTextContent('Screen reader announcement')
    })

    it('should clear announcement after delay', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Announce'))
      expect(screen.getByTestId('announcement')).toHaveTextContent('Screen reader announcement')

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(screen.getByTestId('announcement')).toHaveTextContent('')
    })
  })

  describe('Modal', () => {
    it('should show modal', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Show Modal'))

      expect(screen.getByTestId('modal')).toBeInTheDocument()
      expect(screen.getByTestId('modal-content')).toHaveTextContent('Modal content')
    })

    it('should hide modal', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Modal'))
      expect(screen.getByTestId('modal')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Hide Modal'))

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should show error', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.queryByTestId('error')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Show Error'))

      expect(screen.getByTestId('error')).toBeInTheDocument()
      expect(screen.getByTestId('error-message')).toHaveTextContent('Error message')
    })

    it('should clear error', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      fireEvent.click(screen.getByText('Show Error'))
      expect(screen.getByTestId('error')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Clear Error'))

      expect(screen.queryByTestId('error')).not.toBeInTheDocument()
    })
  })

  describe('Initial State', () => {
    it('should start with no notification', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.queryByTestId('notification')).not.toBeInTheDocument()
    })

    it('should start with empty announcement', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.getByTestId('announcement')).toHaveTextContent('')
    })

    it('should start with no modal', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })

    it('should start with no error', () => {
      render(
        <UIProvider>
          <UIConsumer />
        </UIProvider>
      )

      expect(screen.queryByTestId('error')).not.toBeInTheDocument()
    })
  })
})
