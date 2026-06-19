# Phase 0 Research: Address Book

All five spec ambiguities were resolved during `/speckit-clarify` (see
`spec.md` → Clarifications). This document records the technical research that
grounds the plan against the existing FairWins frontend, so there are no remaining
`NEEDS CLARIFICATION` items.

## R1. Where the Address Book tab lives (My Account)

- **Decision**: Add a new `{ id: 'addressbook', label: 'Address Book' }` entry to
  `WALLET_TABS` in `frontend/src/pages/WalletPage.jsx` and render
  `<AddressBookPanel address={address} />` when `activeTab === 'addressbook'`.
- **Rationale**: "My Account" is the `/wallet` route (`WalletPage`), which already
  drives sections through a `WalletTabMenu` kebab menu and an `activeTab` state
  (`WalletPage.jsx:20-29,73`). Account/Membership/Network/Security/etc. are all
  rendered this way; Address Book is just another section.
- **Alternatives considered**: A separate route — rejected; the spec asks for a tab
  *within* My Account and the existing tab menu is the established pattern.

## R2. Client-side, per-wallet persistence

- **Decision**: Persist the book in `localStorage` via the existing
  `utils/userStorage.js` helpers (`saveUserPreference/getUserPreference` with
  `useLocalStorage = true`), under a single key per wallet
  (`fw_user_<address>_addressBook`).
- **Rationale**: `userStorage.js` already implements per-wallet, lowercase-normalised,
  JSON-serialised storage with a `fw_user_` convention — satisfying FR-006
  (persist between sessions) and FR-009 (scoped to the connected wallet, no leakage
  between members on a shared device) without new infrastructure. `localStorage`
  (not `sessionStorage`) is required because the book must survive across sessions.
- **Alternatives considered**: IndexedDB — rejected as overkill for tens–hundreds of
  contacts; raw `localStorage` without the helper — rejected to keep key-naming and
  per-wallet scoping consistent with the rest of the app.

## R3. Sanctions / compliance screening (advisory client check)

- **Decision**: Reuse `utils/sanctionsScreen.js` — `screenAddress(account, provider)`
  returns `{ allowed, available }`, and `isClear(result)` is true only when
  `available && allowed`. Map results to three UI states: `clear`, `restricted`
  (`available && !allowed`), `uncertain` (`!available`). Wrap with a
  `useAddressScreening` hook that batches/de-dupes lookups and caches results in a
  short-lived in-session cache keyed by `(chainId, normalisedAddress)`.
- **Rationale**: `sanctionsScreen.js` already resolves the `SanctionsGuard` for the
  provider's chain (`getContractAddressForChain('sanctionsGuard', chainId)`) and is
  documented as the advisory UX pre-check, with the on-chain guard as the real
  enforcement (satisfies FR-010, FR-013, FR-014). Its fail-closed contract
  (unavailable ⇒ not clear) directly satisfies FR-011. Per-chain resolution gives us
  network-scoped status for free.
- **Cadence (clarified)**: Screen on book open and on selection; cache briefly within
  the session; no background/periodic refresh. The cache TTL is a short window
  (target ~60s) so a contact that becomes restricted is reflected on the next open
  after expiry (spec Edge Case) without hammering the RPC.
- **Alternatives considered**: Storing a screened status at save time only — rejected
  by clarification (status goes stale); background polling — rejected as unnecessary
  work and extra RPC load.

## R4. Encrypted export/import (wallet-signature-derived key)

- **Decision**: Derive a symmetric key by having the member sign a **new,
  domain-separated** message (e.g. `"FairWins Address Book Backup v1"`), hashing the
  signature with keccak256 to 32 bytes, and using it as the ChaCha20-Poly1305 key
  via the existing `crypto/primitives.js` (`encryptJson` / `decryptJson`). The export
  file is a small JSON envelope `{ format, version, chainAgnostic, alg, nonce,
  ciphertext }`. Import re-signs the same message with the connected wallet,
  re-derives the key, and decrypts; a wrong wallet (or corrupt file) fails AEAD
  authentication and is reported as an error with the existing book untouched.
- **Rationale**: This matches the project's established "wallet-signature ⇒
  deterministic key" pattern (`deriveKeyPair`/`deriveKeyPairFromSignature` in
  `crypto/envelopeEncryption.js`) and reuses audited `@noble` AEAD primitives, so no
  new crypto is introduced (satisfies FR-019/020/021 and the clarified decision).
  **Domain separation** (a distinct signing message from the encryption-key message)
  prevents the backup key from coinciding with the wager-encryption private key.
- **Why same-wallet-only is acceptable**: The clarification explicitly accepted that
  a backup is restorable only with the same wallet; portability is across devices for
  that wallet. No passphrase to remember.
- **Alternatives considered**: Passphrase-derived key (PBKDF2/scrypt) — rejected by
  clarification; reusing the existing encryption private key directly — rejected for
  domain-separation hygiene.

## R5. Reuse anywhere an address is entered

- **Decision**: Extend `components/ui/AddressInput.jsx` with optional, backward-
  compatible props (`enableAddressBook`, plus an internal `AddressBookPicker`) that
  add a searchable contact/address dropdown and surface a `RestrictionTag` when the
  resolved/selected address is restricted. Selecting an entry calls the existing
  `onChange`/`onResolvedChange` callbacks so call sites need no rework. Opt the
  opponent and arbitrator inputs in `FriendMarketsModal.jsx` into the picker.
- **Rationale**: `AddressInput` is the single component used wherever a counterparty
  address is typed (`FriendMarketsModal.jsx:1445,1581`), already supports ENS
  resolution and accessible status/error display, and exposes `onChange` /
  `onResolvedChange` — the natural seam for "select a saved contact" (FR-015/016) and
  for surfacing warnings in-flow. Keeping new props optional avoids regressions at
  other (future) call sites.
- **Alternatives considered**: A separate standalone picker component dropped next to
  each input — rejected as more wiring and inconsistent UX; every address field would
  have to be updated individually.

## R6. Save-prompt as a non-blocking toast (post-success)

- **Decision**: After a wager create/accept confirms on-chain in
  `FriendMarketsModal.jsx`, if the counterparty address is not already in the book,
  show a dismissible `SaveAddressToast` offering to save it (nickname, network
  defaulted to active, optional notes). Dismiss/ignore is a no-op (FR-017/018).
- **Rationale**: Matches the clarified non-blocking-toast decision and ties the
  prompt to a real, completed interaction. The app already shows transient UI; a
  lightweight toast keeps the flow uninterrupted.
- **Alternatives considered**: Modal on field submit — rejected by clarification
  (interrupts flow, fires for abandoned actions).

## R7. Network model

- **Decision**: Network is a required field on each saved address, defaulted to the
  active chain. The selectable set comes from `config/networks.js`
  (`getSelectableNetworks()` / `listSupportedChainIds()`); human names from
  `NETWORK_INFO_BY_CHAIN` in `config/contracts.js`. Entry identity is
  `(normalisedAddress, chainId)`.
- **Rationale**: The app is network-scoped throughout (wagers, membership, sanctions),
  the active chain is available via `useWallet`/`config`, and per-chain screening is
  only meaningful against a specific chain (FR-003/007/014, clarified Q3).
- **Alternatives considered**: Free-text network label — rejected by clarification;
  storing chainId keeps screening and duplicate detection deterministic.

## R8. Testing approach

- **Decision**: Unit-test the pure store (`addressBookStore`) and crypto
  (`addressBookCrypto`) with Vitest; component-test `AddressBookPanel`,
  `AddressBookPicker`, `SaveAddressToast`, and `RestrictionTag` with
  @testing-library/react; add `vitest-axe` accessibility tests mirroring
  `test/account/AccountDashboard.axe.test.jsx`. Mock `screenAddress` and wallet/signer
  in component tests; the existing `test/setup.js` already mocks ethers/wagmi/storage.
- **Rationale**: Matches Constitution II/V and the established `frontend/src/test/`
  conventions; pure-logic separation makes the highest-value paths cheap to test.

## Summary of resolved unknowns

| Topic | Resolution |
|-------|-----------|
| Tab placement | `WalletPage` `WALLET_TABS` + `AddressBookPanel` |
| Persistence | `userStorage.js` localStorage, per-wallet key |
| Screening source/cadence | `sanctionsScreen.js`, on-open/on-select, short TTL cache |
| Export encryption | Domain-separated wallet signature → ChaCha20-Poly1305 (`crypto/primitives.js`) |
| App-wide reuse | Extend `AddressInput` + `AddressBookPicker` |
| Save prompt | Non-blocking `SaveAddressToast` after on-chain success |
| Network | Required, defaulted to active chain; identity `(address, chainId)` |
| Tests | Vitest + testing-library + vitest-axe under `test/addressBook/` |
