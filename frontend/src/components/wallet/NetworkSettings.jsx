import { useChainId, useSwitchChain } from 'wagmi'
import { getSelectableNetworks } from '../../config/networks'
import { getNetworkFeatures } from '../../config/networkCapabilities'
import { BITCOIN_NETWORKS } from '../../config/bitcoinNetworks'
import './NetworkSettings.css'

/**
 * Bitcoin capability tags (spec 061, FR-020) — resolved from the non-EVM
 * registry's `capabilities`, the single source of truth for what Bitcoin
 * supports. `collect: 'stamps-only'` is truthy: the Stamps section without
 * OpenSea integration.
 */
const BITCOIN_FEATURE_TAGS = [
  { key: 'portfolio', label: 'Portfolio', description: 'Native BTC balance in the portfolio.' },
  { key: 'send', label: 'Send', description: 'Send BTC to any standard Bitcoin address.' },
  { key: 'receive', label: 'Receive', description: 'Receive BTC via rotating addresses.' },
  { key: 'collect', label: 'Stamps collectibles', description: 'Bitcoin Stamps shown in Collect (no OpenSea integration).' },
  { key: 'wagers', label: 'P2P Wagers', description: 'Create and settle peer-to-peer wagers.' },
  { key: 'pools', label: 'Wager Pools', description: 'Group wager pools.' },
  { key: 'membership', label: 'Memberships', description: 'On-chain membership tiers and access roles.' },
  { key: 'gasless', label: 'Gasless', description: 'Fee-sponsored transactions. Bitcoin sends always pay the network fee.' },
  { key: 'swap', label: 'Token Swap', description: 'In-app token swaps.' },
  { key: 'earn', label: 'Earn', description: 'In-app lending and yield.' },
  { key: 'predict', label: 'Predict', description: 'Polymarket prediction-market trading.' },
]

/**
 * Display-only Bitcoin network card (spec 061, T033). Bitcoin is a non-EVM
 * network: there is NO wallet chain switch for it (network-registry rule 2),
 * so the card carries no switch affordance — surfaces activate per feature
 * (portfolio, send, receive) instead. Capability tags state truthfully what
 * is and is not supported (FR-020).
 */
function BitcoinNetworkCard({ net }) {
  return (
    <li className="network-card network-card-display-only">
      <div className="network-card-header">
        <div className="network-card-title">
          <span className="network-name">{net.name}</span>
          <span className={`network-kind ${net.isTestnet ? 'testnet' : 'mainnet'}`}>
            {net.isTestnet ? 'Testnet' : 'Mainnet'}
          </span>
        </div>
        <span className="network-active-badge network-display-only-badge">No wallet switch</span>
      </div>

      <ul className="network-feature-tags">
        {BITCOIN_FEATURE_TAGS.map((feature) => {
          const supported = Boolean(net.capabilities?.[feature.key])
          return (
            <li
              key={feature.key}
              className={`network-tag ${supported ? 'available' : 'unavailable'}`}
              title={`${feature.description} ${supported ? '(Supported)' : '(Not supported on Bitcoin)'}`}
            >
              <span className="network-tag-icon" aria-hidden="true">
                {supported ? '✓' : '—'}
              </span>
              <span className="network-tag-label">{feature.label}</span>
            </li>
          )
        })}
      </ul>

      <dl className="network-docs">
        <div className="network-doc-row">
          <dt>Native currency</dt>
          <dd>BTC (Bitcoin)</dd>
        </div>
        {net.explorer?.baseUrl && (
          <div className="network-doc-row">
            <dt>Explorer</dt>
            <dd>
              <a href={net.explorer.baseUrl} target="_blank" rel="noopener noreferrer">
                {net.explorer.name || 'Block explorer'}
              </a>
            </dd>
          </div>
        )}
        <div className="network-doc-row">
          <dt>Wallet</dt>
          <dd>Requires a FairWins passkey on a PRF-capable device.</dd>
        </div>
      </dl>

      <p className="network-display-only-note">
        Bitcoin has no wallet network switch — it activates per feature
        (portfolio, send, receive). Members always pay the Bitcoin network fee.
      </p>
    </li>
  )
}

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

                <dl className="network-docs">
                  <div className="network-doc-row">
                    <dt>Native currency</dt>
                    <dd>
                      {net.nativeCurrency?.symbol}
                      {net.nativeCurrency?.name ? ` (${net.nativeCurrency.name})` : ''}
                    </dd>
                  </div>
                  {net.stablecoin && (
                    <div className="network-doc-row">
                      <dt>Stablecoin</dt>
                      <dd>
                        {net.stablecoin.name} ({net.stablecoin.symbol})
                      </dd>
                    </div>
                  )}
                  {net.explorer?.baseUrl && (
                    <div className="network-doc-row">
                      <dt>Explorer</dt>
                      <dd>
                        <a
                          href={net.explorer.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {net.explorer.name || 'Block explorer'}
                        </a>
                      </dd>
                    </div>
                  )}
                  {net.isTestnet && net.resources?.faucet && (
                    <div className="network-doc-row">
                      <dt>Faucet</dt>
                      <dd>
                        <a
                          href={net.resources.faucet}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {`Get test ${net.nativeCurrency?.symbol || 'tokens'}`}
                        </a>
                      </dd>
                    </div>
                  )}
                  {net.capabilities?.dex && net.dexProvider?.url && (
                    <div className="network-doc-row">
                      <dt>Swap</dt>
                      <dd>
                        <a
                          href={net.dexProvider.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {`Open ${net.dexProvider.name} ↗`}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </li>
            )
          })}
          {/* Non-EVM networks (spec 061): display-only rows — the EVM list
              always includes testnets, and the Bitcoin pair mirrors that. */}
          {Object.values(BITCOIN_NETWORKS)
            .sort((a, b) => Number(a.isTestnet) - Number(b.isTestnet))
            .map((net) => (
              <BitcoinNetworkCard key={net.id} net={net} />
            ))}
        </ul>
      </div>
    </div>
  )
}

export default NetworkSettings
