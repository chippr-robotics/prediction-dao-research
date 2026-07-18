/**
 * CallsignPanel (spec 054) — the account-settings body for the optional `%callsign` naming registry.
 *
 * A Gold-tier-or-above member may OPTIONALLY register, change, release, or repoint a callsign
 * (`%chipprbots`). Nothing on the platform requires a callsign — a wager can always be created, accepted,
 * and settled with a raw address — so the copy leads with that optionality (FR-015, constitution III:
 * honest state). Membership below Gold sees an upgrade prompt, never a dead disabled control.
 *
 * All reads go straight to the on-chain CallsignRegistry (no subgraph, research R7); every write is a
 * self-call routed through the wallet's unified `sendCalls` (spec 041) — the same path the sibling account
 * panels use — so it works identically for passkey smart-account sessions (which have no ethers signer and
 * submit a UserOp) and classic injected wallets (a plain signer transaction). Registration is a two-step
 * commit -> reveal: the desired callsign + a random salt are committed as a hash, then revealed after a
 * short min-commit age so a pending pick can't be front-run. The salt is persisted locally so a page reload
 * between the two steps can still finish.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import useRoleDetails, { MembershipTier } from '../../hooks/useRoleDetails'
import {
  normalizeCallsign,
  isValidCallsign,
  formatCallsign,
  statusMessage,
  CallsignStatus,
} from '../../lib/callsigns'
import { CALLSIGN_REGISTRY_ABI } from '../../abis/callsignRegistry'
import { getContractAddressForChain } from '../../config/contracts'

// Registration commit -> reveal min age. The contract enforces the real value against block time; this
// is only the client-side countdown (kept in sync with the on-chain minimum, ~60s). A premature reveal
// simply reverts CommitmentTooNew and we re-arm — never a stranded flow.
const MIN_COMMIT_AGE_SECONDS = 60
// Consequences we must state plainly BEFORE the user acts (honest-state copy).
const RELEASE_QUARANTINE_DAYS = 90
const REPOINT_DELAY_HOURS = 48

// ---------------------------------------------------------------------------
// Local persistence — a pending commit's salt must survive a reload so the user
// can still complete step 2 (reveal). Keyed per (chain, account); soft-failing.
// ---------------------------------------------------------------------------
function pendingKey(chainId, account) {
  return `fairwins:callsign:pending:${chainId}:${account.toLowerCase()}`
}
function ownedKey(chainId, account) {
  return `fairwins:callsign:owned:${chainId}:${account.toLowerCase()}`
}
function loadPending(chainId, account) {
  try {
    const raw = localStorage.getItem(pendingKey(chainId, account))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function savePending(chainId, account, record) {
  try {
    localStorage.setItem(pendingKey(chainId, account), JSON.stringify(record))
  } catch {
    /* storage unavailable — the in-memory reveal still works this session */
  }
}
function clearPending(chainId, account) {
  try {
    localStorage.removeItem(pendingKey(chainId, account))
  } catch {
    /* ignore */
  }
}
// Remember the owned callsign so a pending repoint (where callsignOf() returns "" because the
// callsign is no longer ACTIVE) can still be surfaced and cancelled.
function rememberOwned(chainId, account, callsign) {
  try {
    localStorage.setItem(ownedKey(chainId, account), callsign)
  } catch {
    /* ignore */
  }
}
function readOwned(chainId, account) {
  try {
    return localStorage.getItem(ownedKey(chainId, account)) || null
  } catch {
    return null
  }
}
function clearOwned(chainId, account) {
  try {
    localStorage.removeItem(ownedKey(chainId, account))
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Contract-view -> plain object, and friendly custom-error decoding.
// ---------------------------------------------------------------------------
function toCallsignInfo(raw) {
  return {
    owner: raw?.owner,
    status: Number(raw?.status ?? 0),
    verified: Boolean(raw?.verified),
    pendingOwner: raw?.pendingOwner,
    repointEffectiveAt: Number(raw?.repointEffectiveAt ?? 0),
    quarantinedUntil: Number(raw?.quarantinedUntil ?? 0),
  }
}

function formatDate(seconds) {
  if (!seconds) return ''
  try {
    return new Date(Number(seconds) * 1000).toLocaleString()
  } catch {
    return ''
  }
}

// Pull a decoded custom error ({name, args}) out of an ethers v6 error, whether it
// arrived pre-decoded on `.revert` or as raw selector data nested in the RPC payload.
function extractRevert(err, iface) {
  if (err?.revert?.name) return { name: err.revert.name, args: err.revert.args }
  const candidates = [
    err?.data,
    err?.info?.error?.data,
    err?.error?.data,
    err?.error?.error?.data,
  ]
  for (const data of candidates) {
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try {
        const parsed = iface.parseError(data)
        if (parsed) return { name: parsed.name, args: parsed.args }
      } catch {
        /* not one of our errors — keep looking */
      }
    }
  }
  return null
}

function describeError(err, iface) {
  // A dismissed passkey ceremony (spec 041) is a clean abort, not a failure.
  if (
    err?.name === 'CeremonyCancelled' ||
    err?.code === 'ACTION_REJECTED' ||
    /reject|denied/i.test(err?.message || '')
  ) {
    return 'Transaction was rejected.'
  }
  const revert = extractRevert(err, iface)
  if (revert) {
    switch (revert.name) {
      // GOLD-specific copy — intentionally NOT the Silver open-challenge wording.
      case 'InsufficientMembershipTier':
        return 'Requires a Gold membership or above to register a callsign.'
      case 'ChangeCooldownActive': {
        const next = Number(revert.args?.nextAllowedAt ?? revert.args?.[0] ?? 0)
        return next > 0
          ? `You changed your callsign recently. You can change it again after ${formatDate(next)}.`
          : 'You changed your callsign recently. Please try again later.'
      }
      case 'CallsignUnavailable':
        return 'That callsign is already taken. Try a different one.'
      case 'CallsignIsReserved':
        return 'That callsign is reserved and cannot be registered.'
      case 'InvalidCallsignFormat':
        return 'That callsign is not valid. Use 3-20 lowercase letters, digits, or single hyphens (no leading, trailing, or repeated hyphens).'
      case 'AlreadyHasCallsign':
        return 'This wallet already has a callsign. Release it before registering a new one.'
      case 'NoCommitment':
        return 'We could not find your reservation. Start over to pick your callsign.'
      case 'CommitmentTooNew':
        return 'Your reservation is still settling. Wait a few seconds and try again.'
      case 'CommitmentExpired':
        return 'Your reservation expired before you completed it. Start over to pick your callsign.'
      case 'CommitmentPending':
        return 'A matching reservation is still active. Wait for it to settle or expire, then try again.'
      case 'SanctionedAccount':
        return 'This action is blocked by sanctions screening.'
      default:
        break
    }
  }
  return err?.reason || err?.shortMessage || err?.message || 'Something went wrong. Please try again.'
}

function safeNormalize(input) {
  try {
    return normalizeCallsign(input)
  } catch {
    return ''
  }
}

export default function CallsignPanel() {
  const { address: account, sendCalls, provider, chainId, isConnected } = useWallet()
  const navigate = useNavigate()

  // Current-user membership tier (read via the shared role-details hook).
  const { getRoleDetails } = useRoleDetails()
  const membership = getRoleDetails('WAGER_PARTICIPANT')
  const isGold = Boolean(
    membership && membership.isActive && membership.tier >= MembershipTier.GOLD,
  )
  // membership is null only until the hook's first fetch resolves.
  const tierPending = isConnected && Boolean(account) && membership == null

  const registryAddress = useMemo(
    () => getContractAddressForChain('callsignRegistry', chainId),
    [chainId],
  )
  const iface = useMemo(() => new ethers.Interface(CALLSIGN_REGISTRY_ABI), [])
  const readRegistry = useMemo(
    () =>
      registryAddress && provider
        ? new ethers.Contract(registryAddress, CALLSIGN_REGISTRY_ABI, provider)
        : null,
    [registryAddress, provider],
  )

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { kind: 'error'|'success'|'info', text }

  // Owned-callsign state.
  const [ownedCallsign, setOwnedCallsign] = useState(null)
  const [callsignInfo, setCallsignInfo] = useState(null)
  const [callsignLoading, setCallsignLoading] = useState(false)
  const [openAction, setOpenAction] = useState(null) // null | 'change' | 'repoint' | 'release'

  // Register / change chooser state.
  const [desiredCallsign, setDesiredCallsign] = useState('')
  const [available, setAvailable] = useState(null) // null | boolean
  const [checkingAvail, setCheckingAvail] = useState(false)

  // Repoint state.
  const [repointAddress, setRepointAddress] = useState('')

  // Pending commit (commit -> reveal), and a 1s clock to drive the reveal countdown.
  const [pending, setPending] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  // ------------------------------------------------------------------ reads
  const loadCallsign = useCallback(async () => {
    if (!readRegistry || !account) {
      setOwnedCallsign(null)
      setCallsignInfo(null)
      return
    }
    setCallsignLoading(true)
    try {
      const active = await readRegistry.callsignOf(account)
      if (active) {
        rememberOwned(chainId, account, active)
        const info = await readRegistry.resolve(active)
        setOwnedCallsign(active)
        setCallsignInfo(toCallsignInfo(info))
        return
      }
      // callsignOf() only returns ACTIVE callsigns — a mid-repoint callsign reads "". Fall back to the
      // remembered callsign so the pending address change stays visible and cancellable.
      const remembered = readOwned(chainId, account)
      if (remembered) {
        try {
          const info = await readRegistry.resolve(remembered)
          const mapped = toCallsignInfo(info)
          if (
            mapped.owner &&
            mapped.owner.toLowerCase() === account.toLowerCase() &&
            mapped.status !== CallsignStatus.NONE
          ) {
            setOwnedCallsign(remembered)
            setCallsignInfo(mapped)
            return
          }
        } catch {
          /* soft-fail (FR-013) */
        }
        clearOwned(chainId, account)
      }
      setOwnedCallsign(null)
      setCallsignInfo(null)
    } catch {
      // Never hard-block on a read — treat as "no callsign" and let the user proceed.
      setOwnedCallsign(null)
      setCallsignInfo(null)
    } finally {
      setCallsignLoading(false)
    }
  }, [readRegistry, account, chainId])

  useEffect(() => {
    loadCallsign()
  }, [loadCallsign])

  // Restore any pending commit for this wallet on mount / wallet switch.
  useEffect(() => {
    if (!account || chainId == null) {
      setPending(null)
      return
    }
    setPending(loadPending(chainId, account))
  }, [account, chainId])

  // Live availability check for the chooser input (debounced, cancel-safe).
  useEffect(() => {
    if (!readRegistry) return undefined
    const canonical = safeNormalize(desiredCallsign)
    if (!canonical) {
      setAvailable(null)
      setCheckingAvail(false)
      return undefined
    }
    setCheckingAvail(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const ok = await readRegistry.isAvailable(canonical)
        if (!cancelled) setAvailable(Boolean(ok))
      } catch {
        if (!cancelled) setAvailable(null)
      } finally {
        if (!cancelled) setCheckingAvail(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [desiredCallsign, readRegistry])

  // Tick the reveal countdown once per second while a commit is pending.
  useEffect(() => {
    if (!pending) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pending])

  // ------------------------------------------------------------------ writes
  const startCommit = useCallback(
    async (mode) => {
      setNotice(null)
      const canonical = safeNormalize(desiredCallsign)
      if (!canonical) {
        setNotice({ kind: 'error', text: 'That callsign is not valid yet.' })
        return
      }
      if (!registryAddress || !account || !readRegistry) {
        setNotice({ kind: 'error', text: 'Connect a wallet to continue.' })
        return
      }
      setBusy(true)
      try {
        const salt = ethers.hexlify(ethers.randomBytes(32))
        // makeCommitment is a pure view — resolve it over the read transport so passkey
        // sessions (which have no signer) can compute it too.
        const commitment = await readRegistry.makeCommitment(canonical, account, salt)
        // Persist BEFORE sending so a reload after signing can still reveal.
        const record = { mode, callsign: canonical, salt, commitment, committedAt: Date.now() }
        savePending(chainId, account, record)
        await sendCalls([{ target: registryAddress, data: iface.encodeFunctionData('commit', [commitment]) }])
        // Anchor the countdown to the mined moment.
        const mined = { ...record, committedAt: Date.now() }
        savePending(chainId, account, mined)
        setPending(mined)
        setOpenAction(null)
        setNotice({
          kind: 'info',
          text: `Reserved ${formatCallsign(canonical)}. Finish in about a minute — your reservation is saved, so a refresh is fine.`,
        })
      } catch (e) {
        clearPending(chainId, account)
        setNotice({ kind: 'error', text: describeError(e, iface) })
      } finally {
        setBusy(false)
      }
    },
    [desiredCallsign, registryAddress, account, readRegistry, sendCalls, chainId, iface],
  )

  const completeReveal = useCallback(async () => {
    if (!pending || !registryAddress || !account) return
    setNotice(null)
    setBusy(true)
    try {
      const data =
        pending.mode === 'change'
          ? iface.encodeFunctionData('changeCallsign', [pending.callsign, pending.salt])
          : iface.encodeFunctionData('register', [pending.callsign, pending.salt])
      await sendCalls([{ target: registryAddress, data }])
      clearPending(chainId, account)
      rememberOwned(chainId, account, pending.callsign)
      setPending(null)
      setDesiredCallsign('')
      setNotice({
        kind: 'success',
        text: `${formatCallsign(pending.callsign)} is now yours. Callsigns are optional — you can change or release it anytime.`,
      })
      await loadCallsign()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [pending, registryAddress, account, sendCalls, chainId, iface, loadCallsign])

  const discardPending = useCallback(() => {
    clearPending(chainId, account)
    setPending(null)
    setNotice({
      kind: 'info',
      text: 'Reservation discarded. You can pick a callsign again whenever you like.',
    })
  }, [chainId, account])

  const doRelease = useCallback(async () => {
    if (!registryAddress || !account) return
    setNotice(null)
    setBusy(true)
    try {
      await sendCalls([{ target: registryAddress, data: iface.encodeFunctionData('release', []) }])
      clearOwned(chainId, account)
      setOpenAction(null)
      setNotice({
        kind: 'success',
        text: `Your callsign was released and is now in a ${RELEASE_QUARANTINE_DAYS}-day quarantine.`,
      })
      await loadCallsign()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [registryAddress, account, sendCalls, chainId, iface, loadCallsign])

  const requestRepoint = useCallback(async () => {
    const to = repointAddress.trim()
    if (!ethers.isAddress(to)) {
      setNotice({ kind: 'error', text: 'Enter a valid wallet address.' })
      return
    }
    if (account && to.toLowerCase() === account.toLowerCase()) {
      setNotice({ kind: 'error', text: 'That is already the callsign’s address.' })
      return
    }
    if (!registryAddress || !account) return
    setNotice(null)
    setBusy(true)
    try {
      await sendCalls([
        { target: registryAddress, data: iface.encodeFunctionData('requestRepoint', [to]) },
      ])
      setOpenAction(null)
      setRepointAddress('')
      setNotice({
        kind: 'success',
        text: `Address change requested. It finalizes after a ${REPOINT_DELAY_HOURS}-hour delay; you can cancel until then.`,
      })
      await loadCallsign()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [repointAddress, account, registryAddress, sendCalls, iface, loadCallsign])

  const cancelRepoint = useCallback(async () => {
    if (!registryAddress || !account) return
    setNotice(null)
    setBusy(true)
    try {
      await sendCalls([
        { target: registryAddress, data: iface.encodeFunctionData('cancelRepoint', []) },
      ])
      setNotice({ kind: 'success', text: 'Address change cancelled. Your callsign stays put.' })
      await loadCallsign()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [registryAddress, account, sendCalls, iface, loadCallsign])

  // ------------------------------------------------------------- derived UI
  const canonical = safeNormalize(desiredCallsign)
  const canReserve = Boolean(canonical) && available === true && !checkingAvail && !busy
  let availabilityMessage = ''
  if (desiredCallsign.trim()) {
    if (!isValidCallsign(desiredCallsign)) availabilityMessage = 'That callsign is not valid yet.'
    else if (checkingAvail) availabilityMessage = 'Checking availability…'
    else if (available === true) availabilityMessage = `${formatCallsign(canonical)} is available.`
    else if (available === false) availabilityMessage = `${formatCallsign(canonical)} is taken.`
  }

  const remainingMs = pending
    ? pending.committedAt + MIN_COMMIT_AGE_SECONDS * 1000 - now
    : 0
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const revealReady = pending ? remainingMs <= 0 : false

  const repointValid =
    ethers.isAddress(repointAddress.trim()) &&
    (!account || repointAddress.trim().toLowerCase() !== account.toLowerCase())

  // Shared callsign-entry chooser (register + change reuse it).
  const renderChooser = (mode, cta) => (
    <div className="callsign-panel__chooser" data-testid={`callsign-${mode}`}>
      <label htmlFor="callsign-input">
        {mode === 'change' ? 'Choose a new callsign' : 'Choose a callsign'}
      </label>
      <div className="callsign-panel__input-row">
        <span className="callsign-panel__prefix" aria-hidden="true">
          %
        </span>
        <input
          id="callsign-input"
          type="text"
          value={desiredCallsign}
          onChange={(e) => setDesiredCallsign(e.target.value.replace(/^%+/, ''))}
          placeholder="chipprbots"
          autoComplete="off"
          spellCheck="false"
          aria-describedby="callsign-help callsign-availability"
          disabled={busy}
        />
      </div>
      <p id="callsign-help" className="callsign-panel__hint">
        3-20 lowercase letters, digits, or single hyphens (no leading, trailing, or repeated hyphens).
      </p>
      <p
        id="callsign-availability"
        className="callsign-panel__availability"
        role="status"
        aria-live="polite"
      >
        {availabilityMessage}
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => startCommit(mode)}
        disabled={!canReserve}
      >
        {busy ? 'Reserving…' : cta}
      </button>
    </div>
  )

  // --------------------------------------------------------------- body
  let body
  if (!isConnected || !account) {
    body = (
      <p role="note">Connect your wallet to manage an optional callsign.</p>
    )
  } else if (!registryAddress) {
    body = (
      <p role="note">Callsigns are not available on this network yet.</p>
    )
  } else if (tierPending) {
    body = <p role="status">Checking your membership…</p>
  } else if (!isGold) {
    // Upgrade prompt — an actionable route to Gold, never a disabled dead control.
    body = (
      <div className="callsign-panel__gate" role="note" data-testid="callsign-upgrade">
        <p>
          Callsigns are a <strong>Gold-tier</strong> perk. Upgrade to Gold or above to claim your
          optional <code>%callsign</code>. You never need one to wager — it is purely a convenience.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/wallet?tab=membership')}
        >
          Go to Membership
        </button>
      </div>
    )
  } else if (callsignLoading) {
    body = <p role="status">Loading your callsign…</p>
  } else if (pending) {
    // Step 2 of commit -> reveal (works for both register and change modes).
    body = (
      <div className="callsign-panel__reveal" data-testid="callsign-reveal">
        <h4>Finish {pending.mode === 'change' ? 'changing' : 'registering'} your callsign</h4>
        <p>
          You reserved <strong>{formatCallsign(pending.callsign)}</strong>
          {pending.mode === 'change' && ownedCallsign ? (
            <> to replace {formatCallsign(ownedCallsign)}</>
          ) : null}
          . A brief waiting period protects your reservation from being front-run.
        </p>
        {revealReady ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={completeReveal}
            disabled={busy}
          >
            {busy ? 'Completing…' : 'Complete registration'}
          </button>
        ) : (
          <p role="status" aria-live="polite">
            Reservation secured. You can complete it in {remainingSeconds}s…
          </p>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={discardPending}
          disabled={busy}
        >
          Start over
        </button>
      </div>
    )
  } else if (ownedCallsign) {
    const status = callsignInfo?.status
    body = (
      <div className="callsign-panel__owned" data-testid="callsign-owned">
        <p className="callsign-panel__current">
          Your callsign: <strong>{formatCallsign(ownedCallsign)}</strong>
          {callsignInfo?.verified ? (
            <span className="callsign-panel__verified"> (verified)</span>
          ) : null}
        </p>
        {status != null && status !== CallsignStatus.ACTIVE ? (
          <p role="status">{statusMessage(status)}</p>
        ) : null}

        {status === CallsignStatus.REPOINTING ? (
          <div
            className="callsign-panel__repoint-pending"
            role="group"
            aria-label="Pending address change"
          >
            <p>
              This callsign is moving to <code>{callsignInfo.pendingOwner}</code>
              {callsignInfo.repointEffectiveAt ? (
                <> — effective {formatDate(callsignInfo.repointEffectiveAt)}</>
              ) : null}
              .
            </p>
            <button type="button" className="btn" onClick={cancelRepoint} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel address change'}
            </button>
          </div>
        ) : status === CallsignStatus.ACTIVE ? (
          <>
            <div className="callsign-panel__actions" role="group" aria-label="Callsign actions">
              <button
                type="button"
                className="btn"
                onClick={() => setOpenAction(openAction === 'change' ? null : 'change')}
                aria-expanded={openAction === 'change'}
                disabled={busy}
              >
                Change callsign
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setOpenAction(openAction === 'repoint' ? null : 'repoint')}
                aria-expanded={openAction === 'repoint'}
                disabled={busy}
              >
                Change linked address
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setOpenAction(openAction === 'release' ? null : 'release')}
                aria-expanded={openAction === 'release'}
                disabled={busy}
              >
                Release callsign
              </button>
            </div>

            {openAction === 'change' ? renderChooser('change', 'Reserve new callsign') : null}

            {openAction === 'repoint' ? (
              <div
                className="callsign-panel__repoint"
                role="group"
                aria-label="Change linked address"
              >
                <p className="callsign-panel__warning">
                  Repointing moves <strong>{formatCallsign(ownedCallsign)}</strong> to a different wallet.
                  For your security this takes effect only after a {REPOINT_DELAY_HOURS}-hour
                  delay, during which the callsign cannot be used for value. You can cancel any time
                  before it finalizes.
                </p>
                <label htmlFor="callsign-repoint-input">New wallet address</label>
                <input
                  id="callsign-repoint-input"
                  type="text"
                  value={repointAddress}
                  onChange={(e) => setRepointAddress(e.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck="false"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={requestRepoint}
                  disabled={busy || !repointValid}
                >
                  {busy ? 'Submitting…' : 'Request address change'}
                </button>
              </div>
            ) : null}

            {openAction === 'release' ? (
              <div className="callsign-panel__release" role="group" aria-label="Release callsign">
                <p className="callsign-panel__warning">
                  Releasing <strong>{formatCallsign(ownedCallsign)}</strong> gives it up and starts a{' '}
                  {RELEASE_QUARANTINE_DAYS}-day quarantine — during that window <em>no one</em>{' '}
                  (including you) can re-register it. This cannot be undone.
                </p>
                <div className="callsign-panel__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpenAction(null)}
                    disabled={busy}
                  >
                    Keep my callsign
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={doRelease}
                    disabled={busy}
                  >
                    {busy ? 'Releasing…' : `Release ${formatCallsign(ownedCallsign)}`}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    )
  } else {
    // Gold+, no callsign yet — step 1 of commit -> reveal.
    body = renderChooser('register', 'Reserve callsign')
  }

  return (
    <section
      className="callsign-panel section"
      aria-label="Callsign"
      data-testid="callsign-panel"
    >
      <h3>
        Callsign <span className="callsign-panel__optional">(optional)</span>
      </h3>
      <p className="section-description">
        A callsign like <code>%chipprbots</code> is a memorable handle others can use to find you.
        Callsigns are completely optional — you never need one to create, accept, or settle a wager, and
        you can change or release yours at any time.
      </p>

      {body}

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`callsign-panel__${notice.kind}`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  )
}
