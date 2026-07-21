# Client-Side Encrypted Data Sync: Moving Your Data Between Devices Without a Server That Can Read It

*How FairWins backs up a member's address book and preferences to public storage — encrypted with a key only their wallet can reproduce, located by a 40-line contract*

| | |
|---|---|
| **Series** | Privacy Architecture (part 3) |
| **Audience** | Privacy-focused app engineers |
| **Tags** | `e2ee`, `data-sync`, `privacy`, `client-side-encryption` |
| **Reading time** | ~8 minutes |

## The data that lives in one browser

A member has been using FairWins on their laptop for six months. They have a curated address book — contacts with nicknames, notes, and saved addresses across Polygon and Mordor. They have tuned preferences: favorite markets, default slippage, saved searches. Then they open the app on their phone. Everything is empty.

This isn't a bug. FairWins deliberately has no application backend — the footprint is client, IPFS, and chain. There is no user database to sync from, which is exactly why the platform can promise it never reads your data: it never holds it. But the flip side is that user-authored state lives in one browser's `localStorage`, scoped to the connected wallet. A second device can't see it, and clearing the browser destroys it permanently.

The conventional fix is a sync server. The server stores each user's data, devices pull it down, everyone is happy — except now there's a database of every member's contact list, and a party that can read, lose, or be compelled to hand over all of it. That trade was never on the table here.

Spec 032's answer keeps the no-backend constraint intact: the client bundles the data, encrypts it with a key **only the member's wallet can reproduce**, pins the ciphertext to IPFS, and records a pointer to it in a tiny on-chain registry. Any device that controls the same wallet can walk that chain backwards — read the pointer, fetch the blob, re-derive the key, decrypt. The "server" in this sync system is public infrastructure that stores only ciphertext and a content hash. Let's walk each stage.

## Keys that travel with the user

The hard problem in client-side encrypted sync isn't the encryption — it's key distribution. If the key is stored on device A, device B can't decrypt. If the key is stored on a server, you've rebuilt the thing you were avoiding. If the user must transcribe a recovery code, they'll lose it.

FairWins sidesteps storage entirely: the key is *derived*, deterministically, from something the member already carries — their wallet. `frontend/src/lib/backup/backupCrypto.js` asks the wallet to sign a fixed domain message and hashes the signature into a 32-byte symmetric key:

```javascript
export const DATA_BACKUP_MESSAGE_V1 = 'FairWins Data Backup v1'

/** Derive the 32-byte symmetric key from a signature string. Pure + deterministic. */
export function deriveKeyFromSignature(signature) {
  return getBytes(keccak256(toUtf8Bytes(signature)))
}

export async function deriveKey(signer) {
  const signature = await signer.signMessage(DATA_BACKUP_MESSAGE_V1)
  return deriveKeyFromSignature(signature)
}
```

This works because standard wallets implement RFC 6979 deterministic ECDSA: the same key signing the same message produces the same signature every time, on every device. Sign once on the laptop to encrypt; sign the same message on the phone and you hold the same key. Nothing is stored, transmitted, or escrowed. This is the same pattern part 1 of this series used for wager-content keys — but the domain message is deliberately distinct (`"FairWins Data Backup v1"` vs. the wager and address-book messages), so the backup key can never coincide with any other key the wallet derives.

Passkey accounts (spec 041) don't have an ECDSA signer to prompt, so the same file ships a login-method-agnostic twin: `deriveKeyFromSeed(seed)` hashes the account's PRF-derived master seed together with the same domain message. Both paths are deterministic per account, so a backup made under a wallet session restores under a passkey session for the same account, and vice versa. The determinism assumption is guarded, not assumed silently: spec 032's FR-001a requires that a wallet which cannot reproduce its signature fails *honestly* — a wrong key can only ever produce an AEAD authentication failure, surfaced as "no usable backup," never a garbage restore.

## The bundle: one file, every network

What actually gets encrypted is a single unified bundle per wallet, assembled by `frontend/src/lib/backup/backupBundle.js` from an explicit registry of synced objects (`frontend/src/lib/backup/syncedObjects.js`). Each entry declares how to load itself, how to merge on restore, and — critically — whether it is **network-scoped**. Today the registry holds five objects:

- **Address book** — additive merge keyed on `(address, chainId)`; every saved address carries its chain id.
- **Preferences** — global scalars and lists (favorite markets, default slippage); last-writer-wins.
- **Vault references** (spec 043) — custody vault pointers, identity `(chainId, address)`.
- **Activity ledger** (spec 051) — client-only records that can't be re-derived from chain; both merge and replace modes union by `entryId`, because a "replace" that deleted audit history would violate the ledger's append-only guarantee.
- **Open-challenge recovery codes** — stored in the bundle as an *opaque, already-encrypted envelope*; the codes never enter the backup channel in cleartext, and restore only writes it when the device has no local vault.

The network tagging matters more than it looks. A backup made while connected to Mordor must restore Polygon contacts to Polygon. Rather than fragmenting backups per network, every network-specific element carries its chain id inside the one bundle, and `parseBundle` rejects any network-scoped element missing its tag — a malformed bundle throws before it can touch local data. Data that re-derives from chain (balances, tier caches, on-chain history) is deliberately excluded: sync user-authored state, not caches.

Adding a future object — tokens, DAOs — is one registry entry declaring its merge rule and scope truthfully. No redesign of the machinery (FR-016).

## Encrypt, pin, point

The backup path in `frontend/src/hooks/useDataBackup.js` is four steps: build the bundle, derive the key, encrypt, then persist twice — once to IPFS, once to chain. Encryption is ChaCha20-Poly1305 (via the audited `@noble/ciphers`, in `frontend/src/utils/crypto/primitives.js`) with a random 96-bit nonce and the format/version string bound as AEAD associated data, so an envelope can't be silently reinterpreted under a different format version.

The ciphertext is pinned to IPFS, which returns a CID. But a CID on its own recreates the recovery-code problem — the phone doesn't know it. So the last step is a transaction to `contracts/privacy/BackupPointerRegistry.sol` on a single canonical network (Polygon mainnet, chain 137), and the contract is almost aggressively boring:

```solidity
contract BackupPointerRegistry {
    uint256 private constant MAX_CID_LENGTH = 256;
    mapping(address => string) private _pointer;

    event BackupPointerSet(address indexed owner, string cid, uint64 timestamp);

    /// @notice Set, overwrite, or clear (with "") the caller's backup pointer.
    function setPointer(string calldata cid) external {
        if (bytes(cid).length > MAX_CID_LENGTH) revert CidTooLong();
        _pointer[msg.sender] = cid;
        emit BackupPointerSet(msg.sender, cid, uint64(block.timestamp));
    }

    function getPointer(address owner) external view returns (string memory) { ... }
}
```

Value-free, no roles, no external calls, keyed purely on `msg.sender` — only a wallet can set its own pointer. It uses no OpenZeppelin imports so it also compiles on pre-Cancun targets like ETC/Mordor. Writing `""` clears the pointer, which is how "remove my backup" works: the locator is severed and the pin can lapse.

Restore inverts the pipeline with no transaction at all: read `getPointer` through a read-only provider (free, and it works whatever network the member is connected to), fetch the envelope by CID, re-derive the key, decrypt, validate, then apply. Before anything is written, the member chooses **merge** (additive, the default) or **replace** (confirmed, destructive) — a restore that silently overwrote a newer local address book would cause the very loss the feature exists to prevent.

## Honest state, everywhere

A sync feature earns trust through its failure modes. The implementation is strict about three distinctions:

- **"No backup" vs. "couldn't check."** `readPointer` in `frontend/src/lib/backup/backupRegistry.js` returns `""` for a genuinely empty pointer but `null` for an unreachable RPC — the UI says "nothing to restore" for one and "try again later" for the other, and never presents empty-as-truth.
- **"Backed up" means both writes confirmed.** Success is shown only after the IPFS pin *and* the pointer transaction confirm. No optimistic checkmarks.
- **Undecryptable means untouched.** A wrong key, tampered envelope, or foreign format fails AEAD authentication or bundle validation and is reported as "no usable backup"; local data — which remains the working source of truth throughout — is never overwritten with garbage.

## Trade-offs

**The pointer is public by design.** Anyone can see that a wallet has a backup, its CID, and when it changed (spec 032, FR-005b). That metadata is the accepted price of trustless retrieval — the alternative locators all reintroduce something worse. IPNS was rejected for resolution reliability; a member-held recovery code is loss-prone; a platform lookup service breaks the no-backend rule. The *content* stays ciphertext, so the metadata never discloses personal data.

**Manual, not automatic.** This is explicit backup/restore, not background sync. Automatic sync would mean gas per change, always-on discovery, and data leaving the device without a deliberate act — spec 032 makes opt-in-by-action a hard requirement (FR-010): nothing leaves the device until the member triggers it, and they're told about the on-chain cost before signing. Background sync remains a possible later evolution, on this same substrate.

**Lose the wallet, lose the backup.** There is no recovery path without the key material, by design. A general social-recovery scheme is explicitly out of scope; the encrypted export/import file from spec 021 remains as a zero-infrastructure offline fallback for members who prefer not to transact.

**One canonical network.** Backups cost cents of gas on Polygon and require switching to it; restore reads are free from anywhere. A soft ~1 MB size cap warns — but never blocks — oversized bundles.

The sum is a sync system where every storage layer is public — IPFS blobs anyone can fetch, a registry anyone can read — and none of it is readable by anyone but the wallet holder. The key never exists at rest; it exists wherever the member is.

## Sources

- `specs/032-encrypted-data-sync/spec.md`, `plan.md` — feature spec and canonical-network decision
- `contracts/privacy/BackupPointerRegistry.sol` — the on-chain locator
- `frontend/src/lib/backup/backupCrypto.js`, `backupBundle.js`, `syncedObjects.js`, `backupRegistry.js` — key derivation, bundle, object registry, pointer client
- `frontend/src/hooks/useDataBackup.js` — backup/restore orchestration
- `frontend/src/utils/crypto/primitives.js` — ChaCha20-Poly1305 AEAD via `@noble/ciphers`
- `frontend/src/abis/backupPointerRegistry.js` — ABI + canonical chain id (Polygon, 137)
- `specs/002-e2e-encryption-lifecycle/`, `docs/developer-guide/encryption-architecture.md` — the wallet-signature key-derivation pattern this feature reuses
- RFC 6979 — Deterministic ECDSA: https://datatracker.ietf.org/doc/html/rfc6979
- RFC 8439 — ChaCha20-Poly1305 AEAD: https://datatracker.ietf.org/doc/html/rfc8439
- EIP-191 — Signed data standard (`personal_sign`): https://eips.ethereum.org/EIPS/eip-191
- IPFS CIDs: https://docs.ipfs.tech/concepts/content-addressing/
