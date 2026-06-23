import { useState } from 'react'
import CreateTokenWizard from './CreateTokenWizard'
import TokenList from './TokenList'
import TokenAdminPanel from './TokenAdminPanel'
import TokenDetail from './TokenDetail'

/**
 * Spec 028 — Token Mint panel, embedded as the "Tokens" tab of the My Account (Account Center) page. Composes
 * the create wizard, the issuer's network-scoped list (→ admin surface), and public discovery/browse (→ read-
 * only detail). All real Web3, no mock data (Constitution III): lists read the on-chain factory registry and the
 * feature self-disables on networks without a deployed factory (FR-023).
 */
export default function TokensPanel() {
  const [adminToken, setAdminToken] = useState(null)
  const [detailToken, setDetailToken] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="token-mint-layout">
      <p className="token-mint-intro">
        Issue and administer your own tokens — open ERC-20/ERC-721 and restricted ERC-1404 — directly on-chain.
      </p>

      <section className="token-mint-create">
        <CreateTokenWizard onCreated={() => setRefreshKey((k) => k + 1)} />
      </section>

      <section className="token-mint-manage">
        <TokenList
          mode="mine"
          refreshKey={refreshKey}
          selectLabel="Administer"
          onSelect={(t) => {
            setAdminToken(t)
            setDetailToken(null)
          }}
        />
        {adminToken && <TokenAdminPanel token={adminToken} />}
      </section>

      <section className="token-mint-browse">
        <TokenList
          mode="all"
          refreshKey={refreshKey}
          selectLabel="View"
          onSelect={(t) => {
            setDetailToken(t)
            setAdminToken(null)
          }}
        />
        {detailToken && <TokenDetail token={detailToken} />}
      </section>
    </div>
  )
}
