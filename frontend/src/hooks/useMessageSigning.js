/**
 * Protect ▸ Verify — signing and verification state for the current identity.
 *
 * Wiring only: every decision lives in `lib/verify/` so it is testable without React, and the
 * hook's job is to bind the identity (spec 043 operate-as, spec 041 login method, spec 062
 * recovered legacy keys) to those functions and hold the result.
 *
 * The signing capability is resolved EAGERLY (not on click) so the surface can disclose up
 * front what this account can and cannot do — a vault has no signing key, and finding that out
 * only after a member has typed their message is a worse experience than being told first.
 */

import { useCallback, useContext, useMemo, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { CustodyContext } from '../contexts/CustodyContext'
import { readSession } from '../connectors/passkey'
import { resolveMessageSigner, signMessageAsAccount, SignatureDeclined } from '../lib/verify/signMessage'
import { verifyMessage } from '../lib/verify/verifyMessage'

const PERSONAL = { mode: 'personal' }

export function useMessageSigning({ deps = {} } = {}) {
  const { address, chainId, loginMethod, signer } = useWallet()
  // Read the context directly and degrade to personal mode when no CustodyProvider is mounted,
  // matching useActiveAccount — this surface renders inside Protect, but its forms are also
  // mounted bare in tests.
  const custody = useContext(CustodyContext)
  const identity = custody?.active ?? PERSONAL
  const legacySigner = custody?.legacySigner ?? null

  const [signing, setSigning] = useState(false)
  const [document, setDocument] = useState(null)
  const [signError, setSignError] = useState(null)

  const [verifying, setVerifying] = useState(false)
  const [verdict, setVerdict] = useState(null)

  // Acting as a recovered legacy account (spec 062) signs with THAT key, so the proof is
  // attributed to the recovered address the member is presenting — not to the wallet that
  // happens to be connected underneath it.
  const activeSigner = identity.mode === 'legacy' ? legacySigner : signer
  const activeAddress = identity.mode === 'legacy' ? identity.address ?? address : address

  const resolved = useMemo(() => {
    const credentialId = loginMethod === 'passkey' ? (deps.readSession ?? readSession)()?.credentialId : undefined
    return (deps.resolveMessageSigner ?? resolveMessageSigner)({
      loginMethod: identity.mode === 'legacy' ? 'legacy' : loginMethod,
      signer: activeSigner,
      address: activeAddress,
      chainId,
      identity,
      passkey: credentialId ? { credentialId } : null,
    })
    // `deps` is a pinned test seam, not a reactive input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMethod, activeSigner, activeAddress, chainId, identity])

  // A legacy identity that has lost its in-memory key must be re-unlocked before it can sign;
  // resolveMessageSigner sees only "no signer", so name the real remedy here.
  const capability = useMemo(() => {
    if (identity.mode === 'legacy' && !legacySigner) {
      return {
        canSign: false,
        kind: 'legacy',
        reason: 'Unlock this recovered account again in Recovery before signing as it.',
      }
    }
    return resolved
  }, [identity.mode, legacySigner, resolved])

  const sign = useCallback(
    async (message) => {
      setSignError(null)
      setSigning(true)
      try {
        const doc = await (deps.signMessageAsAccount ?? signMessageAsAccount)({
          message,
          resolved: capability,
          chainId,
        })
        setDocument(doc)
        return doc
      } catch (error) {
        setDocument(null)
        setSignError(
          error instanceof SignatureDeclined
            ? 'Signing was cancelled — nothing was signed.'
            : error?.shortMessage || error?.message || 'The message could not be signed.',
        )
        return null
      } finally {
        setSigning(false)
      }
    },
    [capability, chainId, deps],
  )

  const clearSigned = useCallback(() => {
    setDocument(null)
    setSignError(null)
  }, [])

  const verify = useCallback(
    async (claim) => {
      setVerifying(true)
      try {
        const result = await (deps.verifyMessage ?? verifyMessage)(claim)
        setVerdict(result)
        return result
      } finally {
        setVerifying(false)
      }
    },
    [deps],
  )

  const clearVerdict = useCallback(() => setVerdict(null), [])

  return {
    address: activeAddress,
    chainId,
    identity,
    capability,
    signing,
    document,
    signError,
    sign,
    clearSigned,
    verifying,
    verdict,
    verify,
    clearVerdict,
  }
}

export default useMessageSigning
