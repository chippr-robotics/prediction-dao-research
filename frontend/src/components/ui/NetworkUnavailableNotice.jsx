import { useWeb3 } from '../../hooks/useWeb3'
import './NetworkUnavailableNotice.css'

/**
 * Shown when a contract a view needs has no deployment on the wallet's connected
 * network (spec 008, FR-006/FR-008). Names a supported network and offers a
 * one-click switch wired to the existing `switchNetwork()` (targets the primary
 * chain). Replaces generic "contract not found" wording with actionable guidance.
 *
 * @param {object} props
 * @param {string} [props.feature]    - What is unavailable (e.g. "Membership purchases")
 * @param {string} [props.targetName] - Name of the network to switch to (default "Polygon")
 */
function NetworkUnavailableNotice({ feature = 'This feature', targetName = 'Polygon' }) {
  const { switchNetwork } = useWeb3()
  return (
    <div className="network-unavailable" role="alert">
      <span className="network-unavailable__icon" aria-hidden="true">🔌</span>
      <div className="network-unavailable__body">
        <strong className="network-unavailable__title">
          {feature} isn’t available on this network
        </strong>
        <p className="network-unavailable__text">
          Switch your wallet to {targetName} to continue.
        </p>
        {typeof switchNetwork === 'function' && (
          <button
            type="button"
            className="network-unavailable__action"
            onClick={() => switchNetwork()}
          >
            Switch to {targetName}
          </button>
        )}
      </div>
    </div>
  )
}

export default NetworkUnavailableNotice
