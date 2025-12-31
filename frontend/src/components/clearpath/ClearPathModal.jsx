import Dashboard from '../Dashboard'
import './ClearPathModal.css'

/**
 * ClearPathModal Component
 * 
 * Modal wrapper for ClearPath governance features.
 * Displays the Dashboard and related governance functionality.
 * 
 * @param {string} defaultTab - Optional default tab to display in dashboard
 */
function ClearPathModal({ defaultTab = 'daos' }) {
  return (
    <div className="clearpath-modal-content">
      <div className="clearpath-modal-header">
        <div className="clearpath-branding">
          <img 
            src="/assets/clearpath_no-text_logo.svg" 
            alt="ClearPath" 
            className="clearpath-modal-logo"
            width="40"
            height="40"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div className="clearpath-text">
            <h2>ClearPath Governance</h2>
            <p className="subtitle">Institutional-Grade DAO Management</p>
          </div>
        </div>
      </div>

      <div className="clearpath-modal-body">
        <Dashboard defaultTab={defaultTab} />
      </div>
    </div>
  )
}

export default ClearPathModal
