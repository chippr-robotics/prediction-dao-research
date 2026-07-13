import { useCallback, useContext, useRef, useState } from 'react'
import { WalletContext } from '../contexts/WalletContext'
import {
  CODE_VAULT_SIGN_MESSAGE,
  deriveVaultKey,
  deriveVaultKeyFromSeed,
  addEntry,
  readEntries,
  removeEntry,
  hasVault,
} from '../lib/openChallenge/codeVault'
import { resolveMasterSeed } from '../lib/passkey/encryption'
import { readSession } from '../connectors/passkey'

/**
 * Recover-an-open-challenge-code vault (feature 024 follow-up).
 *
 * Keeps a wallet-encrypted, device-local backup of the four-word codes a creator generates, so a forgotten
 * code can be recovered later (FairWins never stores the code server-side). Unlocking prompts a single
 * wallet signature; the derived key is cached for the component's lifetime so repeated reads/saves don't
 * re-prompt. Reads WalletContext directly (not the throwing useWallet) so the maker form still renders in
 * environments without a wallet provider — there it simply reports `canUse: false`.
 */
export function useOpenChallengeCodeVault() {
  const ctx = useContext(WalletContext)
  const account = ctx?.account || null
  const signer = ctx?.signer || null
  const chainId = ctx?.chainId ?? null
  const loginMethod = ctx?.loginMethod || null
  const keyRef = useRef(null)
  const [busy, setBusy] = useState(false)

  // Derive (and cache) the vault key with one ceremony the first time, login-method agnostic:
  //  - classic wallet: a signature over the fixed unlock message;
  //  - passkey account: one WebAuthn PRF ceremony → the account's master seed.
  // Both are deterministic per account, so the same account always unlocks the same on-device vault.
  const getKey = useCallback(async () => {
    if (keyRef.current) return keyRef.current
    let key
    if (loginMethod === 'passkey') {
      if (!account) throw new Error('Connect your account to use code backups.')
      const credentialId = readSession()?.credentialId
      const seed = await resolveMasterSeed({ account, credentialId })
      key = deriveVaultKeyFromSeed(seed)
    } else {
      if (!signer) throw new Error('Connect your wallet to use code backups.')
      const sig = await signer.signMessage(CODE_VAULT_SIGN_MESSAGE)
      key = deriveVaultKey(sig)
    }
    keyRef.current = key
    return key
  }, [loginMethod, account, signer])

  // Save (or refresh) one code backup. `entry` carries the code + light metadata for the recovery list.
  const saveCode = useCallback(async (entry) => {
    if (!account) throw new Error('Connect your wallet to save a backup.')
    setBusy(true)
    try {
      const key = await getKey()
      addEntry(account, key, { chainId, ...entry })
    } finally {
      setBusy(false)
    }
  }, [account, chainId, getKey])

  // Decrypt and return the saved codes (newest first).
  const recoverCodes = useCallback(async () => {
    if (!account) throw new Error('Connect your wallet to recover codes.')
    setBusy(true)
    try {
      const key = await getKey()
      return readEntries(account, key)
    } finally {
      setBusy(false)
    }
  }, [account, getKey])

  // Forget one saved code.
  const forgetCode = useCallback(async (code) => {
    if (!account) return []
    const key = await getKey()
    return removeEntry(account, key, code)
  }, [account, getKey])

  return {
    canUse: Boolean(account),
    hasBackup: account ? hasVault(account) : false,
    busy,
    saveCode,
    recoverCodes,
    forgetCode,
  }
}

export default useOpenChallengeCodeVault
