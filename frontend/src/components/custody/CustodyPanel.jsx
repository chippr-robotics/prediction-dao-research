// Spec 043 — Custody surface shell. Lives under My Wallet → Finance → Custody with two sub-sections:
// "On chain" (Safe multisig; filled in by later tasks) and "Off chain" (reserved, disabled). Gated by Safe
// availability: on a network without a configured Safe deployment, the On chain section shows an honest
// "unavailable on this network" state rather than a broken UI (FR-030).

import { useWallet } from '../../hooks'
import { isCustodySupported, CUSTODY_SUPPORTED_CHAIN_IDS } from '../../config/safeContracts'
import './Custody.css'

function OnChainSection({ chainId }) {
  const supported = isCustodySupported(chainId)
  if (!supported) {
    return (
      <div className="custody-unavailable" role="status">
        <p>Custody is not available on this network.</p>
        <p className="custody-hint">
          Switch to a supported network to create or manage a multisig vault.
        </p>
      </div>
    )
  }
  // Vault list / create / load are wired in by subsequent custody tasks (US1+). The shell renders the
  // onboarding empty state so the section is usable and testable on its own.
  return (
    <div className="custody-onchain-empty" role="region" aria-label="On-chain vaults">
      <p>No vaults yet.</p>
      <p className="custody-hint">Create a new multisig vault or load an existing one by address.</p>
    </div>
  )
}

export default function CustodyPanel() {
  const { chainId } = useWallet()

  return (
    <div className="custody-panel">
      <h2 className="custody-heading">Custody</h2>

      <section className="custody-subsection" aria-labelledby="custody-onchain-title">
        <h3 id="custody-onchain-title" className="custody-subsection-title">
          On chain
        </h3>
        <OnChainSection chainId={chainId} />
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
