import { useMemo } from 'react'
import { ethers } from 'ethers'
import { useNotification } from '../../hooks/useUI'
import useClipboard from '../../hooks/useClipboard'
import { getNetwork, listSupportedChainIds, NETWORKS } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import { TOKEN_STANDARD, TOKEN_STANDARD_LABEL } from '../../abis/tokenFactory'
import { v2AbiForStandard, v1AbiForStandard } from './useTokenFactory'

// Spec 028 expansion (US13, FR-044) — the per-token Contract surface: metadata, source-verification status +
// block-explorer deep links, the per-network factory deployment list, and copy address / copy ABI. Strictly
// truthful (Constitution III): there is NO client-reachable verification API and a no-backend footprint, so
// this NEVER claims a contract is "verified" — it links to the explorer where the status can be confirmed, and
// reports the deployment list only for networks that actually carry a tokenFactory.

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
}

function fmtDate(unixSeconds) {
  const n = Number(unixSeconds)
  if (!n) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}

export default function ContractPanel({ token, caps, chainId }) {
  const { showNotification } = useNotification()
  const { copy } = useClipboard()

  const net = getNetwork(chainId)
  const explorerName = net?.explorer?.name || 'the block explorer'
  const explorerBase = (net?.explorer?.baseUrl || '').replace(/\/$/, '')
  // Blockscout selects the source tab with ?tab=contract; Etherscan-family explorers use the #code fragment.
  const isBlockscout = /blockscout/i.test(net?.explorer?.name || '') || /blockscout/i.test(explorerBase)
  const addressUrl = explorerBase ? `${explorerBase}/address/${token.tokenAddress}` : ''
  const codeUrl = explorerBase ? `${addressUrl}${isBlockscout ? '?tab=contract' : '#code'}` : ''
  const isErc721 = token.standard === TOKEN_STANDARD.OPEN_ERC721
  const created = fmtDate(token.createdAt)

  // Canonical JSON ABI for copy — the per-standard/-model ABI is a human-readable string array, so round-trip
  // it through ethers' Interface to emit a real JSON ABI (only the fragments we declare; truthfully partial).
  // Requires a resolved model: emit nothing until `caps` is known, so we never hand out the wrong (v1 vs v2) ABI.
  const abiJson = useMemo(() => {
    if (!caps) return ''
    try {
      const abi = caps.model === 'v2' ? v2AbiForStandard(token.standard) : v1AbiForStandard(token.standard)
      return JSON.stringify(JSON.parse(new ethers.Interface(abi).formatJson()), null, 2)
    } catch {
      return ''
    }
  }, [caps, token.standard])

  // Truthful per-network deployment list: only chains that actually carry a tokenFactory (excludes the local
  // sandbox). With the current deployments this is Mordor only — do NOT imply availability elsewhere.
  const deployments = useMemo(
    () =>
      listSupportedChainIds()
        .filter((id) => id !== 1337)
        .map((id) => ({ chainId: id, name: NETWORKS[id]?.name || `Chain ${id}`, address: getContractAddressForChain('tokenFactory', id) }))
        .filter((n) => ethers.isAddress(n.address || '')),
    []
  )

  async function handleCopy(text, label) {
    if (!text) return showNotification(`No ${label.toLowerCase()} to copy.`, 'warning')
    const ok = await copy(text)
    showNotification(ok ? `${label} copied.` : `Couldn’t copy ${label.toLowerCase()} — copy it manually.`, ok ? 'success' : 'error')
  }

  return (
    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="tm-grid-2">
        <div className="tm-card">
          <h4 style={{ marginBottom: '0.6rem' }}>Contract metadata</h4>
          <div className="tm-kv"><span className="k">Standard</span><span>{TOKEN_STANDARD_LABEL[token.standard]}</span></div>
          <div className="tm-kv"><span className="k">Address</span><code className="tm-mono">{short(token.tokenAddress)}</code></div>
          <div className="tm-kv"><span className="k">Model</span><span>{caps ? (caps.model === 'v2' ? 'Role-based (AccessControl)' : 'Owner-managed (Ownable)') : 'Detecting…'}</span></div>
          {caps && !isErc721 && <div className="tm-kv"><span className="k">Decimals</span><span className="tm-mono">{caps.decimals}</span></div>}
          {caps?.capped && <div className="tm-kv"><span className="k">Cap</span><span className="tm-mono">{ethers.formatUnits(caps.cap, caps.decimals)}</span></div>}
          <div className="tm-kv"><span className="k">Issuer</span><code className="tm-mono">{short(token.issuer)}</code></div>
          {created && <div className="tm-kv"><span className="k">Created</span><span>{created}</span></div>}
          {token.metadataURI && <div className="tm-kv"><span className="k">Metadata</span><code className="tm-mono">{token.metadataURI}</code></div>}
          <div className="tm-kv"><span className="k">Source toolchain</span><span>Solidity ^0.8.24 · OpenZeppelin 5.4.0 · MIT</span></div>
        </div>

        <div className="tm-card">
          <h4 style={{ marginBottom: '0.6rem' }}>Source &amp; verification</h4>
          {explorerBase ? (
            <>
              <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>
                Source verification is performed out-of-band by the deploy pipeline (not from the browser).
                Confirm the current verification status and view the source on {explorerName}.
              </p>
              <div className="tm-row-actions">
                <a className="tm-btn" href={codeUrl} target="_blank" rel="noreferrer">View source ↗</a>
                <a className="tm-btn" href={addressUrl} target="_blank" rel="noreferrer">Open in {explorerName} ↗</a>
              </div>
            </>
          ) : (
            <p className="tm-intro" style={{ margin: 0 }}>This network has no block explorer configured, so source verification can’t be linked here.</p>
          )}
        </div>
      </div>

      <div className="tm-card">
        <h4 style={{ marginBottom: '0.6rem' }}>Factory deployments</h4>
        <p className="tm-intro" style={{ margin: '0 0 0.6rem' }}>Networks where the FairWins token factory is deployed. This token lives on {net?.name || 'the active network'}.</p>
        {deployments.length === 0 ? (
          <p className="tm-row-sub">No factory deployments are configured.</p>
        ) : (
          deployments.map((d) => (
            <div key={d.chainId} className="tm-kv">
              <span className="k">{d.name}{d.chainId === chainId ? ' · this token' : ''}</span>
              <code className="tm-mono">{short(d.address)}</code>
            </div>
          ))
        )}
      </div>

      <div className="tm-card">
        <h4 style={{ marginBottom: '0.6rem' }}>Copy</h4>
        <div className="tm-row-actions">
          <button type="button" className="tm-btn" onClick={() => handleCopy(token.tokenAddress, 'Address')}>Copy address</button>
          <button type="button" className="tm-btn" disabled={!abiJson} onClick={() => handleCopy(abiJson, 'ABI')}>Copy ABI</button>
        </div>
        <p className="tm-row-sub" style={{ marginTop: '0.6rem' }}>The ABI reflects the administration surface this app uses (not the full standard ERC interface).</p>
      </div>
    </div>
  )
}
