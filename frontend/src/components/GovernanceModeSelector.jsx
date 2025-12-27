import { useState } from 'react'
import './GovernanceModeSelector.css'
import TraditionalVoting from './TraditionalVoting'
import ProposalList from './ProposalList'

const GOVERNANCE_MODES = {
  FUTARCHY: 'futarchy',
  TRADITIONAL: 'traditional'
}

function GovernanceModeSelector({ daoData, provider, account }) {
  const [mode, setMode] = useState(GOVERNANCE_MODES.FUTARCHY)

  const handleModeChange = (newMode) => {
    setMode(newMode)
  }

  return (
    <div className="governance-mode-selector">
      <div className="mode-selector-header">
        <h2>Governance</h2>
        <div className="mode-toggle">
          <button
            className={`mode-button ${mode === GOVERNANCE_MODES.FUTARCHY ? 'active' : ''}`}
            onClick={() => handleModeChange(GOVERNANCE_MODES.FUTARCHY)}
          >
            <span className="mode-icon">📊</span>
            <span className="mode-name">Futarchy</span>
            <span className="mode-subtitle">Prediction Markets</span>
          </button>
          <button
            className={`mode-button ${mode === GOVERNANCE_MODES.TRADITIONAL ? 'active' : ''}`}
            onClick={() => handleModeChange(GOVERNANCE_MODES.TRADITIONAL)}
          >
            <span className="mode-icon">🗳️</span>
            <span className="mode-name">Traditional</span>
            <span className="mode-subtitle">Token Voting</span>
          </button>
        </div>
      </div>

      <div className="mode-description">
        {mode === GOVERNANCE_MODES.FUTARCHY ? (
          <div className="description-content">
            <h3>Futarchy Governance</h3>
            <p>
              Decisions are made through prediction markets. Token holders trade on the expected 
              impact of proposals on welfare metrics. The market's assessment determines approval.
            </p>
            <ul>
              <li>Market-driven decision making</li>
              <li>Prediction-based on welfare metrics</li>
              <li>PASS/FAIL token trading</li>
              <li>Privacy-preserving mechanisms</li>
            </ul>
          </div>
        ) : (
          <div className="description-content">
            <h3>Traditional Democracy Voting</h3>
            <p>
              Standard token-weighted voting where token holders directly vote For, Against, or 
              Abstain on proposals. Decisions are made based on majority vote with quorum requirements.
            </p>
            <ul>
              <li>Direct token-weighted voting</li>
              <li>For / Against / Abstain options</li>
              <li>Configurable quorum requirements</li>
              <li>Simple majority wins</li>
            </ul>
          </div>
        )}
      </div>

      <div className="mode-content">
        {mode === GOVERNANCE_MODES.FUTARCHY ? (
          <ProposalList 
            governorAddress={daoData?.futarchyGovernor} 
            provider={provider} 
            account={account}
          />
        ) : (
          <TraditionalVoting
            governorAddress={daoData?.traditionalGovernor}
            registryAddress={daoData?.proposalRegistry}
            provider={provider}
            account={account}
          />
        )}
      </div>
    </div>
  )
}

export default GovernanceModeSelector
