import { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { OPEN_ERC20_ABI, OPEN_ERC721_ABI, RESTRICTED_ERC20_ABI, TOKEN_STANDARD } from '../../abis/tokenFactory'

const RESTRICTION_LABEL = {
  0: 'OK — transfer allowed',
  1: 'Sender not eligible',
  2: 'Recipient not eligible',
  3: 'Sender frozen',
  4: 'Sanctioned',
}

function abiFor(standard) {
  if (standard === TOKEN_STANDARD.OPEN_ERC721) return OPEN_ERC721_ABI
  if (standard === TOKEN_STANDARD.RESTRICTED_ERC1404) return RESTRICTED_ERC20_ABI
  return OPEN_ERC20_ABI
}

/**
 * Spec 028 — per-token administration surface (US2/US3). Reads the token's standard + capabilities and renders
 * ONLY the controls it actually supports (FR-018): no pause for a non-pausable token, freeze/eligibility only
 * for ERC-1404, etc. Every action is a real on-chain transaction restricted on-chain to the owner (FR-019);
 * the UI also surfaces the rejection reason. For restricted tokens it offers an eligibility pre-check whose
 * result matches the actual transfer outcome (SC-003).
 */
export default function TokenAdminPanel({ token }) {
  const { account, signer, provider } = useWallet()
  const reader = provider || signer?.provider || null

  const [caps, setCaps] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // form fields
  const [mintTo, setMintTo] = useState('')
  const [mintAmount, setMintAmount] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [eligAddr, setEligAddr] = useState('')
  const [frozenAddr, setFrozenAddr] = useState('')
  const [precheck, setPrecheck] = useState({ from: '', to: '', result: null })

  const standard = token?.standard
  const abi = abiFor(standard)

  const contract = useCallback(
    (withSigner = false) => {
      const runner = withSigner ? signer : reader
      if (!runner) return null
      return new ethers.Contract(token.tokenAddress, abi, runner)
    },
    [token, abi, signer, reader]
  )

  useEffect(() => {
    let cancelled = false
    async function loadCaps() {
      const c = contract(false)
      if (!c) return
      try {
        const owner = await c.owner()
        const next = { owner, isOwner: account && owner.toLowerCase() === account.toLowerCase() }
        if (standard === TOKEN_STANDARD.OPEN_ERC20) {
          next.pausable = await c.pausable()
          next.burnable = await c.burnable()
          next.paused = next.pausable ? await c.paused() : false
          next.decimals = Number(await c.decimals())
        } else if (standard === TOKEN_STANDARD.RESTRICTED_ERC1404) {
          next.decimals = Number(await c.decimals())
        } else if (standard === TOKEN_STANDARD.OPEN_ERC721) {
          next.burnable = await c.burnable()
        }
        if (!cancelled) setCaps(next)
      } catch (e) {
        if (!cancelled) setError(e?.shortMessage || e?.message || 'Could not read token state.')
      }
    }
    loadCaps()
    return () => {
      cancelled = true
    }
  }, [contract, standard, account])

  const run = useCallback(
    async (label, fn) => {
      if (!signer) {
        setError('Connect a wallet to administer this token.')
        return
      }
      setStatus('working')
      setError(null)
      setNotice(null)
      try {
        const tx = await fn(contract(true))
        await tx.wait()
        setStatus('idle')
        setNotice(`${label} confirmed.`)
      } catch (e) {
        setStatus('error')
        setError(e?.shortMessage || e?.reason || e?.message || `${label} failed.`)
      }
    },
    [signer, contract]
  )

  const doMint = () =>
    run('Mint', (c) => {
      if (standard === TOKEN_STANDARD.OPEN_ERC721) return c.mint(mintTo, mintAmount /* used as tokenURI */)
      return c.mint(mintTo, ethers.parseUnits(String(mintAmount || '0'), caps.decimals))
    })
  const doPause = () => run('Pause', (c) => c.pause())
  const doUnpause = () => run('Unpause', (c) => c.unpause())
  const doTransferOwnership = () => run('Ownership transfer', (c) => c.transferOwnership(newOwner))
  const doSetEligible = (ok) => run(ok ? 'Mark eligible' : 'Mark ineligible', (c) => c.setEligible(eligAddr, ok))
  const doSetFrozen = (f) => run(f ? 'Freeze' : 'Unfreeze', (c) => c.setFrozen(frozenAddr, f))

  const doPrecheck = useCallback(async () => {
    const c = contract(false)
    if (!c) return
    try {
      const code = Number(await c.detectTransferRestriction(precheck.from, precheck.to, 1))
      const msg = await c.messageForTransferRestriction(code)
      setPrecheck((p) => ({ ...p, result: { code, msg, label: RESTRICTION_LABEL[code] || msg } }))
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Eligibility check failed.')
    }
  }, [contract, precheck.from, precheck.to])

  if (!token) return null
  if (!caps) {
    return (
      <div className="token-admin" role="status">
        Loading {token.name} controls…
      </div>
    )
  }

  const busy = status === 'working'
  const isErc721 = standard === TOKEN_STANDARD.OPEN_ERC721
  const isRestricted = standard === TOKEN_STANDARD.RESTRICTED_ERC1404

  return (
    <div className="token-admin" aria-busy={busy}>
      <h3>
        Administer {token.name} <span className="token-symbol">({token.symbol})</span>
      </h3>

      {!caps.isOwner && (
        <div className="token-notice" role="status">
          You aren’t the owner of this token. Administrative actions will be rejected on-chain.
        </div>
      )}
      {error && (
        <div className="token-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="token-success" role="status">
          {notice}
        </div>
      )}

      {/* Mint — always available to the owner */}
      <section className="token-admin-section">
        <h4>Mint</h4>
        <label htmlFor="adm-mint-to">Recipient</label>
        <input id="adm-mint-to" value={mintTo} onChange={(e) => setMintTo(e.target.value)} placeholder="0x…" />
        <label htmlFor="adm-mint-amt">{isErc721 ? 'Token URI' : 'Amount'}</label>
        <input
          id="adm-mint-amt"
          value={mintAmount}
          onChange={(e) => setMintAmount(e.target.value)}
          placeholder={isErc721 ? 'ipfs://…' : '0'}
        />
        <button type="button" className="btn btn-primary" onClick={doMint} disabled={busy || !caps.isOwner}>
          Mint
        </button>
      </section>

      {/* Pause — only for a pausable ERC-20 (FR-018) */}
      {caps.pausable && (
        <section className="token-admin-section">
          <h4>Pause</h4>
          <p>Status: {caps.paused ? 'Paused' : 'Active'}</p>
          <button type="button" className="btn" onClick={doPause} disabled={busy || !caps.isOwner}>
            Pause
          </button>
          <button type="button" className="btn" onClick={doUnpause} disabled={busy || !caps.isOwner}>
            Unpause
          </button>
        </section>
      )}

      {caps.burnable && (
        <section className="token-admin-section">
          <h4>Burnable</h4>
          <p>Holders may burn their own {isErc721 ? 'tokens' : 'balance'}.</p>
        </section>
      )}

      {/* Restricted-token policy admin + eligibility pre-check (FR-009/FR-010) */}
      {isRestricted && (
        <>
          <section className="token-admin-section">
            <h4>Eligibility</h4>
            <label htmlFor="adm-elig">Address</label>
            <input id="adm-elig" value={eligAddr} onChange={(e) => setEligAddr(e.target.value)} placeholder="0x…" />
            <button type="button" className="btn" onClick={() => doSetEligible(true)} disabled={busy || !caps.isOwner}>
              Mark eligible
            </button>
            <button type="button" className="btn" onClick={() => doSetEligible(false)} disabled={busy || !caps.isOwner}>
              Mark ineligible
            </button>
          </section>
          <section className="token-admin-section">
            <h4>Freeze</h4>
            <label htmlFor="adm-frz">Address</label>
            <input id="adm-frz" value={frozenAddr} onChange={(e) => setFrozenAddr(e.target.value)} placeholder="0x…" />
            <button type="button" className="btn" onClick={() => doSetFrozen(true)} disabled={busy || !caps.isOwner}>
              Freeze
            </button>
            <button type="button" className="btn" onClick={() => doSetFrozen(false)} disabled={busy || !caps.isOwner}>
              Unfreeze
            </button>
          </section>
          <section className="token-admin-section">
            <h4>Eligibility pre-check</h4>
            <label htmlFor="adm-pc-from">From</label>
            <input
              id="adm-pc-from"
              value={precheck.from}
              onChange={(e) => setPrecheck((p) => ({ ...p, from: e.target.value }))}
              placeholder="0x…"
            />
            <label htmlFor="adm-pc-to">To</label>
            <input
              id="adm-pc-to"
              value={precheck.to}
              onChange={(e) => setPrecheck((p) => ({ ...p, to: e.target.value }))}
              placeholder="0x…"
            />
            <button type="button" className="btn" onClick={doPrecheck}>
              Check
            </button>
            {precheck.result && (
              <p className="token-precheck-result" role="status">
                Code {precheck.result.code}: {precheck.result.label}
              </p>
            )}
          </section>
        </>
      )}

      {/* Ownership transfer — all standards (FR-020) */}
      <section className="token-admin-section">
        <h4>Transfer ownership</h4>
        <label htmlFor="adm-owner">New owner</label>
        <input id="adm-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x…" />
        <button type="button" className="btn" onClick={doTransferOwnership} disabled={busy || !caps.isOwner}>
          Transfer ownership
        </button>
      </section>
    </div>
  )
}
