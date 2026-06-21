import { getDeployedNetworks } from '../../config/contracts'
import './DeployedNetworks.css'

/**
 * "Deployed on" cluster for the landing hero. Replaces the old single
 * "Built on <network>" badge: as FairWins ships to more chains this lists
 * every network with a live wagerRegistry deployment (see getDeployedNetworks).
 *
 * Each chip links to the deployed escrow contract on that chain's explorer
 * when one is known; otherwise it renders as a static pill.
 */
function DeployedNetworks() {
  const networks = getDeployedNetworks()
  if (networks.length === 0) return null

  return (
    <div className="deployed-networks" aria-label="Networks FairWins is deployed on">
      <span className="deployed-networks-label">Deployed on</span>
      <ul className="deployed-networks-list">
        {networks.map((net) => {
          const Tag = net.contractUrl ? 'a' : 'span'
          const linkProps = net.contractUrl
            ? { href: net.contractUrl, target: '_blank', rel: 'noopener noreferrer' }
            : {}
          return (
            <li key={net.chainId}>
              <Tag className="deployed-network-chip" {...linkProps}>
                <span className="deployed-network-dot" aria-hidden="true" />
                <span className="deployed-network-name">{net.name}</span>
                {net.isTestnet && (
                  <span className="deployed-network-tag">Testnet</span>
                )}
              </Tag>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default DeployedNetworks
