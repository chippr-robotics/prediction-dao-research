# Legacy account recovery (spec 062)

The **Recovery** section (formerly "Backup & Security") lets a member bring an older account into
FairWins from a raw **EOA private key** or a **BIP-39 word list**, store it encrypted on-device, and
optionally move its funds to a smart account. It is a **frontend-only** feature — no contracts, no
gateway — that composes existing subsystems.

## Where it lives

| Concern | Module |
|---|---|
| Classify / encrypt / decrypt / vault / sweep | `frontend/src/lib/recovery/legacyKeys.js` |
| Backup-synced encrypted store (ciphertext only) | `frontend/src/lib/recovery/legacyRecoveredKeysStore.js` |
| BIP-39 word suggestions (typo help) | `frontend/src/lib/recovery/bip39Suggest.js` |
| Audit ledger record (no secrets) | `frontend/src/data/ledger/sources/legacyRecoverySource.js` |
| UI (guided bottom sheets) | `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` |
| Backup domain registration | `frontend/src/lib/backup/syncedObjects.js` (`legacyRecoveredKeys`) |

## Rules to keep

- **Secrets are encrypted at rest, never in the clear, never transmitted, never logged.** The raw
  private key / mnemonic is wrapped with AES-GCM under a PBKDF2-SHA256 (650k) key stretched from a
  member-chosen passphrase. A wrong passphrase fails the GCM tag — never fall through to substitute
  material. Only the **ciphertext blob** (`{ v, kind, address, salt, iv, ct, iterations, importedAt }`)
  is persisted or backed up.
- **The vault is per-account.** `legacyKeyVault(account)` is a CRUD facade over
  `legacyRecoveredKeysStore` (userStorage key `legacy_recovered_keys`). The store owns the key + shape;
  do not read/write that key from anywhere else.
- **Moving funds is OPTIONAL.** Storing the encrypted secret completes recovery (the SAVED screen).
  The sweep (`sweepAllAssets`) moves **all supported fungible assets** — native + every supported
  ERC-20 from `getPortfolioRegistry(chainId)` — ERC-20s first, native last (leaving a gas reserve).
  It returns a **per-asset outcome** array; one asset failing never aborts the rest, and nothing is
  silently dropped. NFTs/collectibles are out of scope and disclosed as such.
- **Recovered accounts are first-class.** Saving to the address book uses `useAddressBook()`
  (`findByAddress` → `addContact`/`updateContact`) so the account is usable on every picker. The
  encrypted records ride the spec-032 backup via the `legacyRecoveredKeys` synced object (not
  network-scoped — a legacy EOA address is the same across EVM chains).
- **Audit without leakage.** `captureLegacyRecovery(account, chainId, { recoveredAddress, source })`
  appends one client-ledger record (`kind: 'legacy_account_recovered'`, `refs` = address + type only)
  with a **stable entryId**, so it is idempotent and never carries key material.

## End-to-end coverage

Two specs cover this feature, split by the tiering rule that a flow validatable without a chain
must not sit in the full tier ([the tiering policy](./e2e-testing-policy.md)):

- `frontend/cypress/e2e/fast/28-legacy-recovery.cy.js` — the import, asserted against the STORAGE
  rather than the screen, plus spec 063's cross-chain scan.
- `frontend/cypress/e2e/full/28-legacy-recovery-sweep.cy.js` — the sweep, judged by chain state.

Status and depth per flow live in the [coverage matrix](./e2e-coverage-matrix.md); it is generated,
so record changes in `frontend/cypress/coverage/matrix.json` and run `npm run e2e:matrix`.

Notes for anyone extending these:

- The sweep is the reason `cy.mockWeb3Provider` grew `realBalances`. The default mock answers a
  fixed 100 ETH for **every** address, which is harmless while a spec only reads the connected
  account and a fabrication the moment it reads one it does not control — such as a recovered
  legacy key.
- Fixtures come from the `legacyFixture` Cypress task (`frontend/cypress.config.js`), which mints a
  **fresh** EOA per test. A fixed key accumulates balances across runs, and "what moved" stops
  being a property of the code.
- The per-asset failure has to be forced at the moment of TRANSFER. `sweepAllAssets` re-reads
  balances itself, so draining a token before "Transfer all" just drops it from the run and proves
  nothing. `makeTokenRefuse` swaps in `ReentrantToken`'s code (contracts/mocks) over the token the
  app scans and arms it to refuse one transfer — a token that holds the balance and declines to
  move it, which is what a blocklisting stablecoin does. Balances are untouched by the swap, and
  the per-spec chain checkpoint restores the original code.
- Writing these tests found two real defects in `sweepAllAssets`, both fixed and both invisible to
  the unit suite because a stubbed provider's nonce and balance never move: the coin leg reused a
  token leg's nonce, and its value was sized from a balance taken before the token transfers had
  paid their gas. With any ERC-20 to move first, the member's coin never left.
- Moving funds is optional, so both tiers assert that too: storing the key completes recovery, and
  on chain nothing moves until the member asks.

## Testing note

Under vitest+jsdom, Node's `Buffer` leaks in and ethers' default sha256 returns a `Buffer` its own
`hexlify` rejects, breaking BIP-39 parsing. Any suite that exercises mnemonics calls
`registerEthersCrypto()` (`frontend/src/test/recovery/registerEthersCrypto.js`) to register
`@noble/hashes`. Real browsers have no `Buffer` and use the pure-JS path — production is unaffected.

See `specs/062-legacy-account-recovery/` for the spec, plan, and task breakdown.
