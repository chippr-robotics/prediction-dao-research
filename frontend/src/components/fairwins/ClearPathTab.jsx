import ClearPathDashboard from '../Dashboard'
import './ClearPathTab.css'

/**
 * ClearPathTab - Integrates ClearPath DAO Governance into FairWins
 * This component wraps the ClearPath Dashboard for seamless integration
 * within the FairWins platform while maintaining its functionality.
 */
function ClearPathTab() {
  return (
    <div className="clearpath-tab">
      <div className="clearpath-tab-header">
        <h2>🏛️ ClearPath Governance</h2>
        <p className="clearpath-subtitle">DAO Management & Futarchy-Based Decision Making</p>
      </div>

      <div className="clearpath-content">
        <ClearPathDashboard />
      </div>
    </div>
  )
}

export default ClearPathTab
