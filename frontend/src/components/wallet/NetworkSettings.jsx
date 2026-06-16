import { useChainId, useSwitchChain } from 'wagmi'
import { getSelectableNetworks } from '../../config/networks'
import { getNetworkFeatures } from '../../config/networkCapabilities'
import './NetworkSettings.css'

/**
 * NetworkSettings
 *
 * The relocated network selector that lives on the My Account → Network tab.
 * Lists every user-switchable network as a card and surfaces capability tags
 * (Sanctions Guard, oracles, swaps, …) so members can make an informed switch
 * before moving to another chain. Switching goes through wagmi.switchChain, so
 * the connected wallet prompts the user to confirm the chain change.
 */
function NetworkSettings() {
  const chainId = useChainId()
  const { switchChain, isPending, variables, error } = useSwitchChain()
  const networks = getSelectableNetworks()
  const pendingChainId = isPending ? variables?.chainId : null

  return (
    <div className="network-settings" role="tabpanel">
      <div className="section">
        <h3>Network</h3>
        <p className="section-description">
          Choose which network FairWins connects to. Tags show which protocol
          features are deployed on each network so you can switch with
          confidence — switching prompts your wallet to confirm.
        </p>

        {error && (
          <div className="key-error" role="alert">
            {error.shortMessage || error.message || 'Failed to switch network.'}
          </div>
        )}

        <ul className="network-card-list">
          {networks.map((net) => {
            const isActive = net.chainId === chainId
            const features = getNetworkFeatures(net.chainId)
            const switching = pendingChainId === net.chainId
            return (
              <li
                key={net.chainId}
                className={`network-card ${isActive ? 'active' : ''}`}
              >
                <div className="network-card-header">
                  <div className="network-card-title">
                    <span className="network-name">{net.name}</span>
                    <span
                      className={`network-kind ${net.isTestnet ? 'testnet' : 'mainnet'}`}
                    >
                      {net.isTestnet ? 'Testnet' : 'Mainnet'}
                    </span>
                  </div>
                  {isActive ? (
                    <span className="network-active-badge">Connected</span>
                  ) : (
                    <button
                      type="button"
                      className="network-switch-btn"
                      onClick={() => switchChain({ chainId: net.chainId })}
                      disabled={isPending}
                      aria-label={`Switch to ${net.name}`}
                    >
                      {switching ? 'Switching…' : 'Switch'}
                    </button>
                  )}
                </div>

                <ul className="network-feature-tags">
                  {features.map((feature) => (
                    <li
                      key={feature.key}
                      className={`network-tag ${feature.deployed ? 'available' : 'unavailable'}`}
                      title={`${feature.description} ${feature.deployed ? '(Deployed)' : '(Not deployed)'}`}
                    >
                      <span className="network-tag-icon" aria-hidden="true">
                        {feature.deployed ? '✓' : '—'}
                      </span>
                      <span className="network-tag-label">{feature.label}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default NetworkSettings
