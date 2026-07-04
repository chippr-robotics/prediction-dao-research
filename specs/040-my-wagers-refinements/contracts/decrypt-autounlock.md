# Contract: Decrypt Auto-Unlock (US3)

## Open-challenge auto-decrypt flow

When the member opens an encrypted open-challenge item in My Wagers:

```
1. If terms already decrypted -> render.
2. Else look up a saved code in the vault:
     key   = sessionVaultKey ?? deriveVaultKey(await signOnce(CODE_VAULT_SIGN_MESSAGE))
     codes = readEntries(wallet, key)               // lib/openChallenge/codeVault.js
     match = codes.find(matches this challenge)
   If match -> deriveFromCode(match.code) -> decrypt -> render (NO words prompt).  (FR-011)
3. Else -> show OpenChallengeDecryptModal (prompt once). On success:
     addEntry(wallet, key, { code, challengeId, label })   // remember for next time  (FR-009)
```

**Session vault key**
```
getSessionVaultKey(wallet) -> Uint8Array | null   // in-memory only
```
- Derived once per session from a single wallet signature; cached in memory (never persisted).
- Cleared on wallet change / unmount. Enables auto-decrypt of every saved item without re-signing.

**Guarantees**
- Stored codes stay wallet-scoped and at-rest encrypted; no plaintext persistence (FR-010).
- A member who unlocked an item once is not prompted again on the same wallet+device (FR-009/011).

## Pools

- Pools use Semaphore identities, not passphrase decrypt words. My Wagers MUST NOT prompt for words to
  view the member's own pools (it does not today). Requirement is satisfied by reusing the
  device-persisted pool identity; covered by a regression test asserting no words prompt appears for a
  member's pool.
