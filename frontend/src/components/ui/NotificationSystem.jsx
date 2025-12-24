import { useNotification } from '../../hooks/useUI'
import './NotificationSystem.css'

function NotificationSystem() {
  const { notification, hideNotification } = useNotification()

  if (!notification) {
    return null
  }

  const { message, type } = notification

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓'
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      default:
        return 'ℹ'
    }
  }

  const getAriaLive = () => {
    return type === 'error' ? 'assertive' : 'polite'
  }

  return (
    <div 
      className={`notification notification-${type}`}
      role="alert"
      aria-live={getAriaLive()}
      aria-atomic="true"
    >
      <span className="notification-icon" aria-hidden="true">
        {getIcon()}
      </span>
      <span className="notification-message">{message}</span>
      <button 
        className="notification-close"
        onClick={hideNotification}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  )
}

export default NotificationSystem
