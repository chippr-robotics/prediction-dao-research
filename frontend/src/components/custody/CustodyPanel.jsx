// Spec 043 — Custody surface. Lives under My Wallet → Finance → Custody with two sub-sections: "On chain"
// (Safe multisig) and "Off chain" (reserved, disabled). Gated by Safe availability: on a network without a
// configured Safe deployment, the On chain section shows an honest "unavailable on this network" state (FR-030).

import { useState } from 'react'
import { useWallet } from '../../hooks'
import { useCustody } from '../../hooks/useCustody'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import { isCustodySupported, CUSTODY_SUPPORTED_CHAIN_IDS } from '../../config/safeContracts'
import VaultList from './VaultList'
import VaultDetail from './VaultDetail'
import VaultProposalsPanel from './VaultProposalsPanel'
import CreateVaultWizard from './CreateVaultWizard'
import LoadVaultForm from './LoadVaultForm'
import './Custody.css'

function OnChainSection() {
  const { address } = useWallet()
  const { active, operateAsVault } = useCustody()
  const {
    vaults,
    activeVault,
    activeAddress,
    selectVault,
    loading,
    error,
    loadByAddress,
    createVault,
    previewVaultAddress,
    forget,
  } = useCustodyVaults()
  const [mode, setMode] = useState(null) // null | 'create' | 'load'

  return (
    <div className="custody-onchain" role="region" aria-label="On-chain vaults">
      <div className="custody-actions">
        <button type="button" onClick={() => setMode(mode === 'create' ? null : 'create')}>
          Create vault
        </button>
        <button type="button" onClick={() => setMode(mode === 'load' ? null : 'load')}>
          Load existing
        </button>
      </div>

      {mode === 'create' && (
        <CreateVaultWizard
          connectedAddress={address}
          onCreate={createVault}
          onPreview={previewVaultAddress}
          onDone={() => setMode(null)}
        />
      )}
      {mode === 'load' && <LoadVaultForm onLoad={loadByAddress} onDone={() => setMode(null)} />}

      {loading && <p className="custody-hint">Loading vaults…</p>}
      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}

      <div className="custody-onchain-body">
        <VaultList vaults={vaults} activeAddress={activeAddress} onSelect={selectVault} />
        {activeVault && (
          <div className="custody-vault-column">
            <VaultDetail
              vault={activeVault}
              onForget={forget}
              onOperateAs={operateAsVault}
              isActiveIdentity={active.mode === 'vault' && active.vaultAddress === activeVault.address}
            />
            <VaultProposalsPanel vault={activeVault} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function CustodyPanel() {
  const { chainId } = useWallet()
  const supported = isCustodySupported(chainId)

  return (
    <div className="custody-panel">
      <h2 className="custody-heading">Custody</h2>

      <section className="custody-subsection" aria-labelledby="custody-onchain-title">
        <h3 id="custody-onchain-title" className="custody-subsection-title">
          On chain
        </h3>
        {supported ? (
          <OnChainSection />
        ) : (
          <div className="custody-unavailable" role="status">
            <p>Custody is not available on this network.</p>
            <p className="custody-hint">
              Switch to a supported network to create or manage a multisig vault.
            </p>
          </div>
        )}
      </section>

      <section
        className="custody-subsection custody-subsection--disabled"
        aria-labelledby="custody-offchain-title"
        aria-disabled="true"
      >
        <h3 id="custody-offchain-title" className="custody-subsection-title">
          Off chain
        </h3>
        <p className="custody-hint">Off-chain custody is coming later.</p>
      </section>
    </div>
  )
}

export { CUSTODY_SUPPORTED_CHAIN_IDS }
