import { useAnnouncement } from '../../hooks/useUI'

/**
 * AnnouncementRegion component for screen reader announcements
 * This is invisible but provides important accessibility feedback
 */
function AnnouncementRegion() {
  const { announcement } = useAnnouncement()

  return (
    <div 
      role="status" 
      aria-live="polite" 
      aria-atomic="true"
      className="sr-only"
      style={{
        position: 'absolute',
        left: '-10000px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      }}
    >
      {announcement}
    </div>
  )
}

export default AnnouncementRegion
