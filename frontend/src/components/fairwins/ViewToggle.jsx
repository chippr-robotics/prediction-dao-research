import { VIEW_MODES } from '../../utils/viewPreference'
import './ViewToggle.css'

function ViewToggle({ currentView, onViewChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="View mode toggle">
      <button
        className={`toggle-button ${currentView === VIEW_MODES.GRID ? 'active' : ''}`}
        onClick={() => onViewChange(VIEW_MODES.GRID)}
        aria-pressed={currentView === VIEW_MODES.GRID}
        aria-label="Grid view"
        title="Grid view"
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="toggle-label">Grid</span>
      </button>
      <button
        className={`toggle-button ${currentView === VIEW_MODES.COMPACT ? 'active' : ''}`}
        onClick={() => onViewChange(VIEW_MODES.COMPACT)}
        aria-pressed={currentView === VIEW_MODES.COMPACT}
        aria-label="Compact view"
        title="Compact view"
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span className="toggle-label">Compact</span>
      </button>
    </div>
  )
}

export default ViewToggle
