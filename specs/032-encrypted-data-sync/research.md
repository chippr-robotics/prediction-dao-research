# Phase 0 Research: Encrypted Data Backup & Restore

Grounded in a read of the existing encryption/IPFS infra, the local data stores, and the contract/deploy
conventions. Each decision: **Decision / Rationale / Alternatives considered**.

## R1 — Reuse existing client-side encryption (no new crypto)

**Decision**: Reuse the audited `@noble` primitives already in the app. Derive the backup's symmetric key with
the existing pattern `keccak256(signer.signMessage(<domain message>))` (as `addressBookCrypto.deriveBackupKey`
does), and encrypt/decrypt the JSON bundle with `primitives.encryptJson/decryptJson` (ChaCha20-Poly1305, AAD
binding the envelope header). Add only a **new domain-separated message** (e.g. `"FairWins Data Backup v1"`)
and a backup envelope `format`/`version` tag — no new crypto code.

**Rationale**: The spec-021 address-book encrypted export/import is a near-exact precedent (signature-derived
key, no passphrase, JSON-in/JSON-out AEAD with header AAD). Reusing it satisfies FR-001/FR-007/FR-009,
inherits the audit, and keeps the wallet-signature determinism behavior the app already depends on
(`deriveKeyPair`, `deriveBackupKey`). A distinct domain message ensures the backup key can never coincide with
a member's wager-encryption key.

**Alternatives considered**: A member passphrase (rejected by clarification — extra secret to lose); PBKDF2/
HKDF over the signature (unnecessary — keccak256(sig) is the established repo pattern and the signature is
already high-entropy); a brand-new envelope (rejected — clone the address-book envelope shape).

## R2 — Key derivation + determinism guard

**Decision**: Derive the key from `signer.signMessage(DATA_BACKUP_MESSAGE_V1)` (cached once per session via the
existing `useEncryption` signature cache). Rely on RFC-6979 deterministic ECDSA (standard for EOAs/MetaMask).
The **guard** for non-deterministic signers is honest failure: restore that decrypts to garbage is treated as
"no usable backup" (FR-013) and local data is left untouched (FR-012) — never an unrestorable-but-claimed
backup. Optionally re-derive + compare on the same device at backup time to warn early.

**Rationale**: The repo already trusts signature determinism for wager encryption and address-book backup, so
this matches shipped behavior. A failed decrypt is a clean, detectable terminal state (AEAD auth fails), so
the honest-failure guard needs no new mechanism. FR-001a is satisfied without a passphrase.

**Alternatives considered**: Sign-twice-and-compare on every backup (extra wallet prompt/UX cost — keep as an
optional early-warning, not mandatory); maintaining a wallet allowlist (brittle).

## R3 — Storage: IPFS via the existing service

**Decision**: Pin the encrypted bundle with `ipfsService.uploadJson(envelope, { name })` (Pinata via the nginx
proxy in prod or `VITE_PINATA_JWT`), and fetch with `ipfsService.fetchByCid(cid)`. The CID is the pointer
stored on-chain.

**Rationale**: This is the platform's existing, no-backend IPFS path (already used for encrypted wager
envelopes). Reusing it satisfies FR-001/FR-004/FR-017 with zero new plumbing and inherits caching/retry.

**Alternatives considered**: Direct gateway upload (loses pinning/persistence); a new pinning provider (out of
footprint).

## R4 — On-chain pointer: a minimal, non-upgradeable `BackupPointerRegistry`

**Decision**: Ship `contracts/privacy/BackupPointerRegistry.sol` — `mapping(address => string) _pointer`, a
`msg.sender`-keyed `setPointer(string cid)` (with a CID length bound + `BackupPointerSet` event), and
`getPointer(address)`/`hasPointer(address)` views. **Plain, non-upgradeable**, cloning the audited
`KeyRegistry` shape; deployed deterministically (CREATE2) for a stable address. Uses **no OpenZeppelin**.

**Rationale**: The contract is value-free, role-free, and has no external calls — the lowest-risk surface in
the repo (CEI trivial, reentrancy impossible, Slither-clean). UUPS exists for *value-bearing, role-controlled*
contracts; a one-line self-write setter has nothing to upgrade, so an upgrade path would be pure attack
surface and governance burden (violates YAGNI). CREATE2 gives address stability without a proxy. Using no OZ
sidesteps the OZ-`mcopy`/pre-Cancun constraint, so the same contract compiles on Mordor too.

**Alternatives considered**: UUPS/`UUPSManaged` (rejected — over-engineered for a value-free pointer); IPNS
(rejected by clarification — resolution reliability); reusing `KeyRegistry` itself (rejected — different
semantics/length bounds; a dedicated contract is clearer and independently reviewable).

## R5 — Canonical network: Polygon mainnet (137)

**Decision**: The unified backup pointer lives on **Polygon mainnet (137)** as the single canonical network.
Backup writes the pointer there (one small tx; the app prompts a network switch + uses the member's POL);
restore reads it via a read-only provider regardless of the member's connected network. The contract is also
deployable to Amoy/Mordor at the same CREATE2 address for testing.

**Rationale**: Polygon mainnet is where the platform is live and where members already transact and hold gas;
it is low-cost (~cents) and durable — the right home for a real, persistent backup pointer. A single canonical
network gives one unambiguous "latest" per wallet (the clarified unified model). Reads being free means
restore never costs the member anything.

**Alternatives considered**: Amoy/Mordor (testnets — not durable for real backups); per-network registries +
multi-registry search (rejected by clarification — chose unified/canonical); writing to the current chain
(rejected — ambiguous "latest" across chains).

## R6 — Unified, network-tagged bundle (reconciles "one file" with "network-aware elements")

**Decision**: The bundle is one unified per-wallet JSON object whose **network-specific elements each carry a
`chainId`**. The address book already does this (every `SavedAddress` has `chainId`; identity is
`(lowercase(address), chainId)`), so it drops in unchanged — one `loadAddressBook(account)` read yields all
networks' entries. Global preferences are stored network-agnostic. A **Synced-Object Registry**
(`lib/backup/syncedObjects.js`) declares, per object: how to load/save it, whether it is network-scoped, and
its merge rule (additive-by-(id,network) vs last-writer-wins). Future objects (tokens, DAOs) register the same
way and MUST declare network-scope (FR-015a/FR-016).

**Rationale**: Satisfies the network-aware requirement (FR-015a, SC-012a) while keeping one unified file
(clarified scope). The address book needs no enumeration across chains (chainId is inside one key); merge is
already per-`addressKey` = `(address,chainId)`, so identical addresses on different networks never collide
(FR-008). The registry is the extensibility seam (FR-016) and the place network-scope is enforced.

**Alternatives considered**: Per-(account,chain) bundles (rejected by clarification — chose unified); a flat
untagged bundle (rejected — would mis-attribute the same identifier across networks, violating FR-015a).

## R7 — Scope of backed-up objects (initial) + exclusions

**Decision**: Back up the **address book** (multi-chain, chainId-tagged) and **global market/app preferences**
(`recent_searches`, `favorite_markets`, `default_slippage`, `polymarket_categories`). Strongly consider
including the **open-challenge code vault** (`fairwins.ocCodeVault.<addr>`) — it is the only at-rest copy of
one-time claim codes and is **irrecoverable if lost** (already wallet-encrypted) — flag it in `/speckit-tasks`
as a high-value addition. Exclude re-derivable caches: the activity store, tax-report history, wager/friend-
market caches, and device-local UI acks/dismissals.

**Rationale**: Matches FR-015 (user-authored, not re-derivable). The OC code vault is the highest-loss item in
the app and is a natural fit; preferences + address book are the stated initial scope.

**Alternatives considered**: Backing up role/purchase mirrors (excluded — re-derivable from chain); backing up
caches (excluded — noise + re-derivable).

## R8 — Backup/restore flow + honest state

**Decision**: **Backup** = build bundle → encrypt → `uploadJson` (await pin) → `setPointer(cid)` (await tx
confirm) → only then show success + last-backup time. **Restore** = read pointer (free) → `fetchByCid` →
decrypt → present **merge or replace** with confirmation → apply via `mergeBook`/`applyConflictResolutions`
(address book) and the registry's per-object rule. Any failure (offline, pin error, tx reject, fetch fail,
decrypt fail) leaves local data untouched and surfaces honestly; backup requires gas on the canonical network
(blocked clearly if absent — restore still works read-only).

**Rationale**: Satisfies FR-002/004/006/007/008/012/013/014 and the honest-finality constitution principle.
Reuses the address-book merge engine for the additive, conflict-aware merge.

**Alternatives considered**: Auto-overwrite on restore (rejected — destructive, FR-007); marking success on pin
before the pointer confirms (rejected — dishonest; a second device couldn't find it).

## Resolved unknowns

| Unknown | Resolution |
|---------|-----------|
| Encryption + key | R1/R2 — reuse `deriveBackupKey`+`encryptJson`; new domain message; honest-failure guard |
| IPFS | R3 — reuse `uploadJson`/`fetchByCid` |
| Contract shape | R4 — minimal non-upgradeable, clone `KeyRegistry`, CREATE2, no OZ |
| Canonical network | R5 — Polygon mainnet (137); reads free, write switches network |
| Unified vs network-aware | R6 — one unified bundle, every network-specific element chainId-tagged; Synced-Object Registry enforces |
| Object scope | R7 — address book + preferences (+ OC code vault candidate); exclude caches |
| Flow + honest state | R8 — pin+pointer-confirm before success; merge/replace; non-destructive failure |

All `NEEDS CLARIFICATION` resolved. No application backend introduced. One value-free contract added.
