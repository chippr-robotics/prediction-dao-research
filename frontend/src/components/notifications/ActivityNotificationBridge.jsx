import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Bridges a tapped system notification (raised for 'push'-mode activity)
 * into in-app navigation. public/sw.js#notificationclick focuses this window and
 * postMessages the entry's router link ({ to, state } — e.g. state.openWagerId);
 * we perform the navigation here, inside the router. Renders nothing.
 */
function ActivityNotificationBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
    const handler = (event) => {
      const data = event.data
      if (!data || data.type !== 'ACTIVITY_NAVIGATE' || !data.link?.to) return
      navigate(data.link.to, data.link.state ? { state: data.link.state } : undefined)
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [navigate])

  return null
}

export default ActivityNotificationBridge
