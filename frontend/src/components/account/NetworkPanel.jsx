import { useState } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { getSelectableNetworks } from '../../config/networks'
import { getNetworkFeatures } from '../../config/networkCapabilities'
import { BITCOIN_NETWORKS } from '../../config/bitcoinNetworks'
import { useRpcEndpoints } from '../../hooks/useRpcEndpoints'
import NetworkEndpointForm from './NetworkEndpointForm'
import './NetworkPanel.css'

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
 * NetworkPanel
 *
 * Network settings, reached from the account button beside Preferences (spec 069 — it used
 * to be a Tools section, which no longer fits: FairWins reads every supported network at
 * once, so "which network am I on" is a per-transaction detail, not a place you go).
 *
 * The panel does two things:
 *
 *   1. Documents each network and its capabilities, and offers a wallet switch. The switch
 *      is deliberately framed as optional — assets carry their own chainId and reads fan out
 *      across chains regardless of the connected one, so a member only needs to switch when
 *      they SEND on a network their wallet is not currently on (and the sending surfaces
 *      prompt for that themselves).
 *   2. Lets the member own the route: their own RPC endpoint, a failover behind it, and any
 *      API key their provider needs, per network (`NetworkEndpointForm`). Every read in the
 *      app resolves through those settings (lib/network/rpcEndpoints).
 */
function NetworkPanel() {
  const chainId = useChainId()
  const { switchChain, isPending, variables, error } = useSwitchChain()
  const networks = getSelectableNetworks()
  const pendingChainId = isPending ? variables?.chainId : null
  const { entryFor, describe, save, reset, probe, reloadRecommended } = useRpcEndpoints()
  const [editingChainId, setEditingChainId] = useState(null)

  return (
    <div className="network-settings" role="tabpanel">
      <div className="section">
        <h3>Network</h3>
        <p className="section-description">
          FairWins reads every supported network at once — your assets carry their own network,
          so you only need to switch when sending on a network your wallet is not currently on.
          Tags show which protocol features are deployed where, and each network can run on your
          own RPC endpoint.
        </p>

        {reloadRecommended && (
          <p className="network-reload-note" role="status">
            Endpoint changes apply to new lookups right away. Reload the app so wallet
            transactions use them too.
          </p>
        )}

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
            // Both are read during render, so a save (which re-renders through the store
            // subscription) immediately re-describes the route.
            const route = describe(net.chainId)
            const entry = entryFor(net.chainId)
            const editing = editingChainId === net.chainId
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

                {/* Endpoint row: which route this network's reads actually take, always
                    redacted (a provider URL routinely carries the API key in its path). */}
                <div className="network-endpoint-row">
                  <div className="network-endpoint-summary">
                    <span className={`network-endpoint-source ${route.source}`}>
                      {route.source === 'member' ? 'Your endpoint' : 'App default'}
                    </span>
                    <span className="network-endpoint-url">{route.primary || 'No endpoint configured'}</span>
                    {route.failover && (
                      <span className="network-endpoint-failover">failover {route.failover}</span>
                    )}
                    {route.hasAuth && <span className="network-endpoint-auth-badge">API key</span>}
                  </div>
                  <button
                    type="button"
                    className="network-endpoint-edit-btn"
                    onClick={() => setEditingChainId(editing ? null : net.chainId)}
                    aria-expanded={editing}
                    aria-label={`${editing ? 'Close' : 'Edit'} ${net.name} endpoints`}
                  >
                    {editing ? 'Close' : 'Edit endpoints'}
                  </button>
                </div>

                {editing && (
                  <NetworkEndpointForm
                    network={net}
                    entry={entry}
                    onSave={(next) => save(net.chainId, next)}
                    onReset={() => reset(net.chainId)}
                    onProbe={(next) => probe(net.chainId, next)}
                    onCancel={() => setEditingChainId(null)}
                  />
                )}
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

export default NetworkPanel
