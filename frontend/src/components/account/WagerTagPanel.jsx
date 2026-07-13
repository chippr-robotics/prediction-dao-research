/**
 * WagerTagPanel (spec 054) — the account-settings body for the optional `%tag` naming registry.
 *
 * A Gold-tier-or-above member may OPTIONALLY register, change, release, or repoint a wager tag
 * (`%chipprbots`). Nothing on the platform requires a tag — a wager can always be created, accepted,
 * and settled with a raw address — so the copy leads with that optionality (FR-015, constitution III:
 * honest state). Membership below Gold sees an upgrade prompt, never a dead disabled control.
 *
 * All reads go straight to the on-chain WagerTagRegistry (no subgraph, research R7); every write is a
 * plain self-submitted ethers v6 transaction against the connected wallet's signer — the same path the
 * sibling account panels use. Registration is a two-step commit -> reveal: the desired tag + a random
 * salt are committed as a hash, then revealed after a short min-commit age so a pending pick can't be
 * front-run. The salt is persisted locally so a page reload between the two steps can still finish.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import useRoleDetails, { MembershipTier } from '../../hooks/useRoleDetails'
import {
  normalizeTag,
  isValidTag,
  formatTag,
  statusMessage,
  TagStatus,
} from '../../lib/tags'
import { WAGER_TAG_REGISTRY_ABI } from '../../abis/wagerTagRegistry'
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
  return `fairwins:wagerTag:pending:${chainId}:${account.toLowerCase()}`
}
function ownedKey(chainId, account) {
  return `fairwins:wagerTag:owned:${chainId}:${account.toLowerCase()}`
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
// Remember the owned tag so a pending repoint (where tagOf() returns "" because the
// tag is no longer ACTIVE) can still be surfaced and cancelled.
function rememberOwned(chainId, account, tag) {
  try {
    localStorage.setItem(ownedKey(chainId, account), tag)
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
function toTagInfo(raw) {
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
  if (err?.code === 'ACTION_REJECTED' || /reject|denied/i.test(err?.message || '')) {
    return 'Transaction was rejected.'
  }
  const revert = extractRevert(err, iface)
  if (revert) {
    switch (revert.name) {
      // GOLD-specific copy — intentionally NOT the Silver open-challenge wording.
      case 'InsufficientMembershipTier':
        return 'Requires a Gold membership or above to register a wager tag.'
      case 'ChangeCooldownActive': {
        const next = Number(revert.args?.nextAllowedAt ?? revert.args?.[0] ?? 0)
        return next > 0
          ? `You changed your tag recently. You can change it again after ${formatDate(next)}.`
          : 'You changed your tag recently. Please try again later.'
      }
      case 'TagUnavailable':
        return 'That tag is already taken. Try a different one.'
      case 'TagIsReserved':
        return 'That tag is reserved and cannot be registered.'
      case 'InvalidTagFormat':
        return 'That tag is not valid. Use 3-20 lowercase letters, digits, or single hyphens (no leading, trailing, or repeated hyphens).'
      case 'AlreadyHasTag':
        return 'This wallet already has a tag. Release it before registering a new one.'
      case 'NoCommitment':
        return 'We could not find your reservation. Start over to pick your tag.'
      case 'CommitmentTooNew':
        return 'Your reservation is still settling. Wait a few seconds and try again.'
      case 'CommitmentExpired':
        return 'Your reservation expired before you completed it. Start over to pick your tag.'
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
    return normalizeTag(input)
  } catch {
    return ''
  }
}

export default function WagerTagPanel() {
  const { address: account, signer, provider, chainId, isConnected } = useWallet()
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
    () => getContractAddressForChain('wagerTagRegistry', chainId),
    [chainId],
  )
  const iface = useMemo(() => new ethers.Interface(WAGER_TAG_REGISTRY_ABI), [])
  const readRegistry = useMemo(
    () =>
      registryAddress && provider
        ? new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, provider)
        : null,
    [registryAddress, provider],
  )

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { kind: 'error'|'success'|'info', text }

  // Owned-tag state.
  const [ownedTag, setOwnedTag] = useState(null)
  const [tagInfo, setTagInfo] = useState(null)
  const [tagLoading, setTagLoading] = useState(false)
  const [openAction, setOpenAction] = useState(null) // null | 'change' | 'repoint' | 'release'

  // Register / change chooser state.
  const [desiredTag, setDesiredTag] = useState('')
  const [available, setAvailable] = useState(null) // null | boolean
  const [checkingAvail, setCheckingAvail] = useState(false)

  // Repoint state.
  const [repointAddress, setRepointAddress] = useState('')

  // Pending commit (commit -> reveal), and a 1s clock to drive the reveal countdown.
  const [pending, setPending] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  // ------------------------------------------------------------------ reads
  const loadTag = useCallback(async () => {
    if (!readRegistry || !account) {
      setOwnedTag(null)
      setTagInfo(null)
      return
    }
    setTagLoading(true)
    try {
      const active = await readRegistry.tagOf(account)
      if (active) {
        rememberOwned(chainId, account, active)
        const info = await readRegistry.resolve(active)
        setOwnedTag(active)
        setTagInfo(toTagInfo(info))
        return
      }
      // tagOf() only returns ACTIVE tags — a mid-repoint tag reads "". Fall back to the
      // remembered tag so the pending address change stays visible and cancellable.
      const remembered = readOwned(chainId, account)
      if (remembered) {
        try {
          const info = await readRegistry.resolve(remembered)
          const mapped = toTagInfo(info)
          if (
            mapped.owner &&
            mapped.owner.toLowerCase() === account.toLowerCase() &&
            mapped.status !== TagStatus.NONE
          ) {
            setOwnedTag(remembered)
            setTagInfo(mapped)
            return
          }
        } catch {
          /* soft-fail (FR-013) */
        }
        clearOwned(chainId, account)
      }
      setOwnedTag(null)
      setTagInfo(null)
    } catch {
      // Never hard-block on a read — treat as "no tag" and let the user proceed.
      setOwnedTag(null)
      setTagInfo(null)
    } finally {
      setTagLoading(false)
    }
  }, [readRegistry, account, chainId])

  useEffect(() => {
    loadTag()
  }, [loadTag])

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
    const canonical = safeNormalize(desiredTag)
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
  }, [desiredTag, readRegistry])

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
      const canonical = safeNormalize(desiredTag)
      if (!canonical) {
        setNotice({ kind: 'error', text: 'That tag is not valid yet.' })
        return
      }
      if (!registryAddress || !signer) {
        setNotice({ kind: 'error', text: 'Connect a wallet to continue.' })
        return
      }
      setBusy(true)
      try {
        const salt = ethers.hexlify(ethers.randomBytes(32))
        const write = new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, signer)
        const commitment = await write.makeCommitment(canonical, account, salt)
        // Persist BEFORE sending so a reload after signing can still reveal.
        const record = { mode, tag: canonical, salt, commitment, committedAt: Date.now() }
        savePending(chainId, account, record)
        const tx = await write.commit(commitment)
        await tx.wait()
        // Anchor the countdown to the mined moment.
        const mined = { ...record, committedAt: Date.now() }
        savePending(chainId, account, mined)
        setPending(mined)
        setOpenAction(null)
        setNotice({
          kind: 'info',
          text: `Reserved ${formatTag(canonical)}. Finish in about a minute — your reservation is saved, so a refresh is fine.`,
        })
      } catch (e) {
        clearPending(chainId, account)
        setNotice({ kind: 'error', text: describeError(e, iface) })
      } finally {
        setBusy(false)
      }
    },
    [desiredTag, registryAddress, signer, account, chainId, iface],
  )

  const completeReveal = useCallback(async () => {
    if (!pending || !registryAddress || !signer) return
    setNotice(null)
    setBusy(true)
    try {
      const write = new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, signer)
      const tx =
        pending.mode === 'change'
          ? await write.changeTag(pending.tag, pending.salt)
          : await write.register(pending.tag, pending.salt)
      await tx.wait()
      clearPending(chainId, account)
      rememberOwned(chainId, account, pending.tag)
      setPending(null)
      setDesiredTag('')
      setNotice({
        kind: 'success',
        text: `${formatTag(pending.tag)} is now yours. Tags are optional — you can change or release it anytime.`,
      })
      await loadTag()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [pending, registryAddress, signer, account, chainId, iface, loadTag])

  const discardPending = useCallback(() => {
    clearPending(chainId, account)
    setPending(null)
    setNotice({
      kind: 'info',
      text: 'Reservation discarded. You can pick a tag again whenever you like.',
    })
  }, [chainId, account])

  const doRelease = useCallback(async () => {
    if (!registryAddress || !signer) return
    setNotice(null)
    setBusy(true)
    try {
      const write = new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, signer)
      const tx = await write.release()
      await tx.wait()
      clearOwned(chainId, account)
      setOpenAction(null)
      setNotice({
        kind: 'success',
        text: `Your tag was released and is now in a ${RELEASE_QUARANTINE_DAYS}-day quarantine.`,
      })
      await loadTag()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [registryAddress, signer, chainId, account, iface, loadTag])

  const requestRepoint = useCallback(async () => {
    const to = repointAddress.trim()
    if (!ethers.isAddress(to)) {
      setNotice({ kind: 'error', text: 'Enter a valid wallet address.' })
      return
    }
    if (account && to.toLowerCase() === account.toLowerCase()) {
      setNotice({ kind: 'error', text: 'That is already the tag’s address.' })
      return
    }
    if (!registryAddress || !signer) return
    setNotice(null)
    setBusy(true)
    try {
      const write = new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, signer)
      const tx = await write.requestRepoint(to)
      await tx.wait()
      setOpenAction(null)
      setRepointAddress('')
      setNotice({
        kind: 'success',
        text: `Address change requested. It finalizes after a ${REPOINT_DELAY_HOURS}-hour delay; you can cancel until then.`,
      })
      await loadTag()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [repointAddress, account, registryAddress, signer, iface, loadTag])

  const cancelRepoint = useCallback(async () => {
    if (!registryAddress || !signer) return
    setNotice(null)
    setBusy(true)
    try {
      const write = new ethers.Contract(registryAddress, WAGER_TAG_REGISTRY_ABI, signer)
      const tx = await write.cancelRepoint()
      await tx.wait()
      setNotice({ kind: 'success', text: 'Address change cancelled. Your tag stays put.' })
      await loadTag()
    } catch (e) {
      setNotice({ kind: 'error', text: describeError(e, iface) })
    } finally {
      setBusy(false)
    }
  }, [registryAddress, signer, iface, loadTag])

  // ------------------------------------------------------------- derived UI
  const canonical = safeNormalize(desiredTag)
  const canReserve = Boolean(canonical) && available === true && !checkingAvail && !busy
  let availabilityMessage = ''
  if (desiredTag.trim()) {
    if (!isValidTag(desiredTag)) availabilityMessage = 'That tag is not valid yet.'
    else if (checkingAvail) availabilityMessage = 'Checking availability…'
    else if (available === true) availabilityMessage = `${formatTag(canonical)} is available.`
    else if (available === false) availabilityMessage = `${formatTag(canonical)} is taken.`
  }

  const remainingMs = pending
    ? pending.committedAt + MIN_COMMIT_AGE_SECONDS * 1000 - now
    : 0
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const revealReady = pending ? remainingMs <= 0 : false

  const repointValid =
    ethers.isAddress(repointAddress.trim()) &&
    (!account || repointAddress.trim().toLowerCase() !== account.toLowerCase())

  // Shared tag-entry chooser (register + change reuse it).
  const renderChooser = (mode, cta) => (
    <div className="wager-tag-panel__chooser" data-testid={`wager-tag-${mode}`}>
      <label htmlFor="wager-tag-input">
        {mode === 'change' ? 'Choose a new tag' : 'Choose a tag'}
      </label>
      <div className="wager-tag-panel__input-row">
        <span className="wager-tag-panel__prefix" aria-hidden="true">
          %
        </span>
        <input
          id="wager-tag-input"
          type="text"
          value={desiredTag}
          onChange={(e) => setDesiredTag(e.target.value.replace(/^%+/, ''))}
          placeholder="chipprbots"
          autoComplete="off"
          spellCheck="false"
          aria-describedby="wager-tag-help wager-tag-availability"
          disabled={busy}
        />
      </div>
      <p id="wager-tag-help" className="wager-tag-panel__hint">
        3-20 lowercase letters, digits, or single hyphens (no leading, trailing, or repeated hyphens).
      </p>
      <p
        id="wager-tag-availability"
        className="wager-tag-panel__availability"
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
      <p role="note">Connect your wallet to manage an optional wager tag.</p>
    )
  } else if (!registryAddress) {
    body = (
      <p role="note">Wager tags are not available on this network yet.</p>
    )
  } else if (tierPending) {
    body = <p role="status">Checking your membership…</p>
  } else if (!isGold) {
    // Upgrade prompt — an actionable route to Gold, never a disabled dead control.
    body = (
      <div className="wager-tag-panel__gate" role="note" data-testid="wager-tag-upgrade">
        <p>
          Wager tags are a <strong>Gold-tier</strong> perk. Upgrade to Gold or above to claim your
          optional <code>%tag</code>. You never need one to wager — it is purely a convenience.
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
  } else if (tagLoading) {
    body = <p role="status">Loading your tag…</p>
  } else if (pending) {
    // Step 2 of commit -> reveal (works for both register and change modes).
    body = (
      <div className="wager-tag-panel__reveal" data-testid="wager-tag-reveal">
        <h4>Finish {pending.mode === 'change' ? 'changing' : 'registering'} your tag</h4>
        <p>
          You reserved <strong>{formatTag(pending.tag)}</strong>
          {pending.mode === 'change' && ownedTag ? (
            <> to replace {formatTag(ownedTag)}</>
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
  } else if (ownedTag) {
    const status = tagInfo?.status
    body = (
      <div className="wager-tag-panel__owned" data-testid="wager-tag-owned">
        <p className="wager-tag-panel__current">
          Your tag: <strong>{formatTag(ownedTag)}</strong>
          {tagInfo?.verified ? (
            <span className="wager-tag-panel__verified"> (verified)</span>
          ) : null}
        </p>
        {status != null && status !== TagStatus.ACTIVE ? (
          <p role="status">{statusMessage(status)}</p>
        ) : null}

        {status === TagStatus.REPOINTING ? (
          <div
            className="wager-tag-panel__repoint-pending"
            role="group"
            aria-label="Pending address change"
          >
            <p>
              This tag is moving to <code>{tagInfo.pendingOwner}</code>
              {tagInfo.repointEffectiveAt ? (
                <> — effective {formatDate(tagInfo.repointEffectiveAt)}</>
              ) : null}
              .
            </p>
            <button type="button" className="btn" onClick={cancelRepoint} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel address change'}
            </button>
          </div>
        ) : status === TagStatus.ACTIVE ? (
          <>
            <div className="wager-tag-panel__actions" role="group" aria-label="Tag actions">
              <button
                type="button"
                className="btn"
                onClick={() => setOpenAction(openAction === 'change' ? null : 'change')}
                aria-expanded={openAction === 'change'}
                disabled={busy}
              >
                Change tag
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
                Release tag
              </button>
            </div>

            {openAction === 'change' ? renderChooser('change', 'Reserve new tag') : null}

            {openAction === 'repoint' ? (
              <div
                className="wager-tag-panel__repoint"
                role="group"
                aria-label="Change linked address"
              >
                <p className="wager-tag-panel__warning">
                  Repointing moves <strong>{formatTag(ownedTag)}</strong> to a different wallet.
                  For your security this takes effect only after a {REPOINT_DELAY_HOURS}-hour
                  delay, during which the tag cannot be used for value. You can cancel any time
                  before it finalizes.
                </p>
                <label htmlFor="wager-tag-repoint-input">New wallet address</label>
                <input
                  id="wager-tag-repoint-input"
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
              <div className="wager-tag-panel__release" role="group" aria-label="Release tag">
                <p className="wager-tag-panel__warning">
                  Releasing <strong>{formatTag(ownedTag)}</strong> gives it up and starts a{' '}
                  {RELEASE_QUARANTINE_DAYS}-day quarantine — during that window <em>no one</em>{' '}
                  (including you) can re-register it. This cannot be undone.
                </p>
                <div className="wager-tag-panel__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpenAction(null)}
                    disabled={busy}
                  >
                    Keep my tag
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={doRelease}
                    disabled={busy}
                  >
                    {busy ? 'Releasing…' : `Release ${formatTag(ownedTag)}`}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    )
  } else {
    // Gold+, no tag yet — step 1 of commit -> reveal.
    body = renderChooser('register', 'Reserve tag')
  }

  return (
    <section
      className="wager-tag-panel section"
      aria-label="Wager tag"
      data-testid="wager-tag-panel"
    >
      <h3>
        Wager tag <span className="wager-tag-panel__optional">(optional)</span>
      </h3>
      <p className="section-description">
        A wager tag like <code>%chipprbots</code> is a memorable handle others can use to find you.
        Tags are completely optional — you never need one to create, accept, or settle a wager, and
        you can change or release yours at any time.
      </p>

      {body}

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`wager-tag-panel__${notice.kind}`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  )
}
