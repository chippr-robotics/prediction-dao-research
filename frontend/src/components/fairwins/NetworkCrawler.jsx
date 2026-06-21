import { getDeployedNetworks } from '../../config/contracts'
import './NetworkCrawler.css'

/**
 * Subtle horizontally-scrolling ticker of the networks FairWins is deployed on.
 * Lives in the landing header as a low-key trust signal — replaces the former
 * prominent hero "Deployed on" cluster.
 *
 * The network list is rendered twice and the track is translated by -50% so the
 * marquee loops seamlessly; the second copy is aria-hidden so assistive tech and
 * tests see each network once. The animation pauses on hover/focus (so the
 * explorer links are clickable) and stops entirely under prefers-reduced-motion.
 */
function NetworkCrawler() {
  const networks = getDeployedNetworks()
  if (networks.length === 0) return null

  const renderGroup = (clone) => (
    <ul
      className="network-crawler-group"
      aria-hidden={clone || undefined}
      data-testid={clone ? undefined : 'network-crawler-content'}
    >
      <li className="network-crawler-label">Deployed on</li>
      {networks.map((net) => {
        const Tag = net.contractUrl ? 'a' : 'span'
        const linkProps = net.contractUrl
          ? { href: net.contractUrl, target: '_blank', rel: 'noopener noreferrer' }
          : {}
        return (
          <li key={`${clone ? 'clone' : 'item'}-${net.chainId}`}>
            <Tag className="network-crawler-item" {...linkProps}>
              <span className="network-crawler-dot" aria-hidden="true" />
              <span className="network-crawler-name">{net.name}</span>
              {net.isTestnet && <span className="network-crawler-tag">testnet</span>}
            </Tag>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="network-crawler" aria-label="Networks FairWins is deployed on">
      <div className="network-crawler-track">
        {renderGroup(false)}
        {renderGroup(true)}
      </div>
    </div>
  )
}

export default NetworkCrawler
