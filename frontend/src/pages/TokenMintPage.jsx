import { useState } from 'react'
import CreateTokenWizard from '../components/tokens/CreateTokenWizard'
import TokenList from '../components/tokens/TokenList'
import TokenAdminPanel from '../components/tokens/TokenAdminPanel'

/**
 * Spec 028 — Token Mint page. Composes the create wizard, the issuer's network-scoped token list, and the
 * per-token admin surface. All real Web3, no mock data (Constitution III): the list reads the on-chain factory
 * registry and the feature self-disables on networks without a deployed factory (FR-023).
 */
export default function TokenMintPage() {
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="token-mint-page" aria-labelledby="token-mint-heading">
      <h1 id="token-mint-heading">Token Mint</h1>
      <p className="token-mint-intro">
        Issue and administer your own tokens — open ERC-20/ERC-721 and restricted ERC-1404 — directly on-chain.
      </p>

      <div className="token-mint-layout">
        <section className="token-mint-create">
          <CreateTokenWizard onCreated={() => setRefreshKey((k) => k + 1)} />
        </section>

        <section className="token-mint-manage">
          <TokenList refreshKey={refreshKey} onSelect={setSelected} />
          {selected && <TokenAdminPanel token={selected} />}
        </section>
      </div>
    </main>
  )
}
