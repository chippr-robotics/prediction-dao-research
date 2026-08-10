# Phase 0 Research: Legacy Account Recovery

All decisions below were validated against the existing codebase (portfolio registry, address book,
backup sync, activity ledger, recovery library). No open `NEEDS CLARIFICATION` remain.

## R1 — At-rest secret encryption

**Decision**: Encrypt each legacy secret with **AES-GCM** under a key stretched from a member-chosen
passphrase via **PBKDF2-SHA256 (650k iterations, per-entry 16-byte salt, 12-byte IV)**. Store only
`{ v, kind, address, salt, iv, ct, iterations, importedAt }` (base64) in `localStorage`.

**Rationale**: Mirrors the passkey blob store (`lib/passkey/prfKeys.js`) posture — AES-GCM, wrong
key fails the tag, never falls through to substitute material (FR-008). PBKDF2 sits above OWASP's
600k floor. WebCrypto-only, no new dependency. Already implemented and unit-tested on this branch.

**Alternatives considered**: (a) Wrap under the session's passkey PRF / wallet signature — rejected:
couples a *separate* legacy secret to session identity and forces a ceremony on every unlock; a
per-account passphrase is simpler and independent (spec Assumption). (b) scrypt/Argon2 — rejected:
not in WebCrypto; would add a dependency for marginal gain over 650k PBKDF2 here.

## R2 — Enumerating "all supported assets" for a legacy address

**Decision**: Source the asset list from **`getPortfolioRegistry(chainId)`** (`config/assetTaxonomy.js`),
filtered to `kind === 'native' || kind === 'erc20'`. Read balances for the **arbitrary** legacy
address — native via `provider.getBalance(addr)`, ERC-20 via a minimal-ABI
`balanceOf(addr)` — reusing the exact pattern in **`useAccountAssets.js`** (which already reads
holdings for an arbitrary "From" account). Only assets with a **non-zero** balance are swept.

**Rationale**: `getPortfolioRegistry` is the canonical "all supported assets on a chain" source
(native + wrapped-native + stablecoin + curated ERC-20 list). NFTs are excluded by the `kind`
filter, satisfying the spec's fungible-only scope (FR-017) — disclosed in the UI. Reusing the
registry (not a hand-maintained list) honors the constitution's "config from generated/sync sources."

**Alternatives considered**: `useChainTokens` — rejected: knows only native + the one stablecoin, so
it would silently miss USDC/DAI/WETH/etc. (violates FR-015 "never silently drop an asset").

## R3 — Sweeping multiple assets from a legacy EOA (ordering, gas, failure)

**Decision**: Build the signer with **`walletFromSecret({ kind, secret }, provider)`** (ethers
`Wallet`/`HDNodeWallet.fromPhrase`). Transfer **ERC-20s first** (`Contract.transfer(to, value)` then
`.wait()`), one per non-zero token, then the **native currency last** with the existing leave-a-gas-
reserve logic (`~21000 * gasPrice * 1.2`). Return a **per-asset outcome array**
(`{ asset, status: 'sent'|'skipped'|'failed', txHash?, error? }`); a single token failure does **not**
abort the rest. If the account cannot cover ERC-20 gas or the native reserve, that asset is reported
`failed`/`skipped` with an honest reason — funds are never stranded (FR-015/016).

**Rationale**: A legacy EOA pays its own gas from its native balance, so native must move **last** or
later token transfers can't pay for themselves. Sequential (not batched) because an EOA has no
smart-account batching; ethers manages nonces sequentially across awaited sends. Per-asset outcomes
give the honest reporting FR-015 requires and a natural retry surface.

**Alternatives considered**: (a) Reuse `useTransfer().send` — rejected: it is bound to the *connected*
wallet's signer/`sendCalls`, not a legacy signer. (b) One native sweep only (current behavior) —
rejected: fails FR-012/015 ("all supported assets"). (c) Gasless EIP-3009 rail — rejected: only the
network stablecoin supports it and it needs a configured relayer; a legacy sweep self-submits.

## R4 — Address-book integration (platform-wide availability)

**Decision**: On "save to address book," call **`useAddressBook().findByAddress(address, chainId)`**;
if absent, **`addContact({ nickname, addresses: [{ address, chainId, notes }] }])`**, else
`addAddress` onto the found contact. Default `nickname` to a member-editable label (e.g. "Recovered
account"); `notes` records provenance ("Recovered from legacy private key/word list"). No new store.

**Rationale**: Every `AddressBookButton`/`AddressInput` picker reads the same `useAddressBook` hook,
so an entry added via `addContact` is immediately selectable/resolvable **everywhere** (FR-019). The
hook persists per-wallet and is already part of the spec-032 backup, so this reuse also advances US4.
Identity is `(lowercase(address), chainId)`, so the find-then-add upsert prevents duplicates (FR-020).

**Alternatives considered**: A parallel "recovered accounts" registry surfaced into pickers —
rejected: the address book already *is* the platform-wide reference; forking it violates the spec
assumption and duplicates backup wiring.

## R5 — Backup durability for recovered accounts

**Decision**: Add a new **synced object** `legacyRecoveredKeys` to
`lib/backup/syncedObjects.js`, backed by a new `legacyRecoveredKeysStore.js` that reads/writes the
**encrypted vault** via `userStorage` key `legacy_recovered_keys`. `networkScoped: false` (a legacy
EOA address is the same across EVM chains). `merge` unions by lowercased address, newest `importedAt`
winning; `apply('replace')` overwrites, `apply('merge')` unions.

**Rationale**: The vault entries contain **only the passphrase-encrypted blob** (salt/iv/ct) — no
plaintext — so backing them up satisfies FR-021 while honoring FR-024 (the encrypted-at-rest store is
the *only* place key material lives, and its ciphertext is safe to persist). Modeled on
`vaultReferences` (metadata-style union merge). Because `assertNetworkTagged` only validates known
network-scoped keys, a non-network-scoped domain needs **no** change there.

**Alternatives considered**: (a) Back up decrypted secrets — rejected outright (FR-024). (b) Model on
`openChallengeCodes` (restore only when no local vault) — rejected: we want per-address union so
recovering different accounts on different devices all survive a merge restore.

## R6 — Audit record without key leakage

**Decision**: On a completed recovery, append one **client-ledger** record via a new
`captureLegacyRecovery(account, chainId, { recoveredAddress, source })` helper (a
`data/ledger/sources/legacyRecoverySource.js` wrapper over `appendClientRecord`):
`class: LEDGER_CLASS.MEMBERSHIP`, `kind: 'legacy_account_recovered'`, `direction: NONE`,
`status: SETTLED`, stable `entryId = clientEntryId('legacy-recovered:'+chainId+':'+address)`,
`refs: { recoveredAddress, source }` — **address/time/type metadata only**.

**Rationale**: The spec-051 client ledger is the durable, append-only, backup-carried audit history
(FR-023). A **stable** entryId makes the record idempotent — `appendClientRecord` no-ops on an
existing id and the `activityLedger` domain unions by entryId in both merge and replace — so
re-recovering the same account creates no misleading duplicate (FR-025). `refs` carries only
non-secret metadata (FR-024). Reusing `MEMBERSHIP` avoids a ledger-enum/source expansion; a dedicated
`LEDGER_CLASS.RECOVERY` is a possible follow-up if a distinct report bucket is wanted.

**Alternatives considered**: A separate audit store — rejected: the ledger already provides
append-only + backup semantics; a parallel store duplicates that and risks a path that isn't scrubbed
of secrets.

## R7 — Making the transfer optional (flow shape)

**Decision**: Restructure so the import wizard **terminates at a "saved" confirmation** once the
encrypted secret is stored and (optionally) the address-book entry is created and the audit record
written. "Move funds to a smart account" becomes an **optional action** presented on the saved screen
and on each **stored-key list** row (via unlock → all-asset transfer), never a required wizard step.

**Rationale**: FR-011 requires recovery to complete without moving funds. Decoupling storage from
transfer also lets a member move funds later (e.g. after topping up gas), which the stored-key list
already enables via unlock-then-transfer.

**Alternatives considered**: Keep transfer as the terminal wizard step with a "skip" — rejected:
weaker separation; "skip" reads as an incomplete flow rather than a complete recovery.

## R8 — Test environment note (ethers sha256 under jsdom)

**Decision**: Keep the test-only `registerEthersCrypto()` shim (registers `@noble/hashes` for ethers'
sha256/HMAC/PBKDF2) for any suite that exercises **mnemonic** parsing.

**Rationale**: Under vitest+jsdom, Node's `Buffer` leaks in and ethers' default sha256 returns a
`Buffer` its own `hexlify` rejects, breaking BIP-39 parsing. Real browsers have no `Buffer` and use
the pure-JS path, so this is a **test-env-only** shim with no production effect. Already in place.
