// Spec 043 — Custody surface. Lives under Tools → Protect with two sub-sections: "On chain"
// (Safe multisig) and "Off chain" (reserved, disabled). Gated by Safe availability: on a network without a
// configured Safe deployment, vault CREATION shows an honest "unavailable on this network" state (FR-030).
//
// Spec 068 (US1) — the vault LIST is no longer gated by the connected chain: a member's vaults on
// every chain are always listed with their chain identity (FR-003), and only creation/load are
// restricted to networks where custody is deployed (FR-005). Actions on a vault whose chain is not
// the connected one are withheld behind a switch prompt (FR-004).

import { useState } from 'react'
import { useWallet } from '../../hooks'
import { useCustody } from '../../hooks/useCustody'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import { useVaultProposals } from '../../hooks/useVaultProposals'
import { isCustodySupported, CUSTODY_SUPPORTED_CHAIN_IDS } from '../../config/safeContracts'
import { NETWORKS } from '../../config/networks'
import VaultList from './VaultList'
import VaultDetail from './VaultDetail'
import VaultProposalsPanel from './VaultProposalsPanel'
import CreateVaultWizard from './CreateVaultWizard'
import LoadVaultForm from './LoadVaultForm'
import './Custody.css'

/** Custody chains other than the connected one, for the "create elsewhere" affordance (FR-005). */
function otherCustodyChains(chainId) {
  return CUSTODY_SUPPORTED_CHAIN_IDS.filter((id) => id !== Number(chainId)).map((id) => ({
    chainId: id,
    name: NETWORKS[id]?.name || `Chain ${id}`,
  }))
}

function OnChainSection() {
  const { address, chainId, switchNetwork } = useWallet()
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
  // Spec 049 — one shared proposal-queue instance for the active vault, so policy-change proposals
  // (VaultDetail → PolicyPanel) land in the same queue the VaultProposalsPanel renders.
  const proposals = useVaultProposals(activeVault)
  const onVaultChain = Boolean(activeVault && Number(chainId) === Number(activeVault.chainId))
  const canCreateHere = isCustodySupported(chainId)
  const elsewhere = otherCustodyChains(chainId)

  return (
    <div className="custody-onchain" role="region" aria-label="On-chain vaults">
      {canCreateHere ? (
        <div className="custody-actions">
          <button type="button" onClick={() => setMode(mode === 'create' ? null : 'create')}>
            Create vault
          </button>
          <button type="button" onClick={() => setMode(mode === 'load' ? null : 'load')}>
            Load existing
          </button>
        </div>
      ) : (
        // FR-005: creation is honestly unavailable here, but the member's existing vaults on other
        // chains stay listed below — the estate never disappears because of the connected network.
        <div className="custody-unavailable" role="status">
          <p>New vaults cannot be created on this network.</p>
          {elsewhere.length > 0 && (
            <p className="custody-hint">
              Custody is available on {elsewhere.map((c) => c.name).join(', ')}.{' '}
              {switchNetwork && (
                <button type="button" className="custody-link" onClick={() => switchNetwork(elsewhere[0].chainId)}>
                  Switch to {elsewhere[0].name}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {canCreateHere && mode === 'create' && (
        <CreateVaultWizard
          connectedAddress={address}
          chainId={chainId}
          onCreate={createVault}
          onPreview={previewVaultAddress}
          onDone={() => setMode(null)}
        />
      )}
      {canCreateHere && mode === 'load' && <LoadVaultForm onLoad={loadByAddress} onDone={() => setMode(null)} />}

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
              onProposePolicy={activeVault.owner && onVaultChain ? proposals.propose : undefined}
              onSwitchNetwork={switchNetwork}
            />
            <VaultProposalsPanel vault={activeVault} proposals={proposals} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function CustodyPanel() {
  return (
    <div className="custody-panel">
      <h2 className="custody-heading">Protect</h2>

      <section className="custody-subsection" aria-labelledby="custody-onchain-title">
        <h3 id="custody-onchain-title" className="custody-subsection-title">
          On chain
        </h3>
        {/* Always rendered: the vault list spans chains, so it must survive an unsupported
            connected network (FR-003/FR-005). OnChainSection itself gates creation. */}
        <OnChainSection />
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
