/**
 * Address Book constants (Spec 021).
 *
 * Client-side, per-wallet contact storage. These constants are shared by the
 * pure store, the encrypted export/import module, and the UI.
 */

// Per-wallet localStorage key suffix used with utils/userStorage.js
// (resolves to `fw_user_<address>_addressBook`).
export const STORAGE_KEY = 'addressBook'

// On-disk schema version for forward migration.
export const SCHEMA_VERSION = 1

// Encrypted export envelope identifiers.
export const EXPORT_FORMAT = 'fairwins-address-book-backup'
export const EXPORT_VERSION = 1

// Plaintext export payload type (inside the encrypted ciphertext).
export const EXPORT_PAYLOAD_TYPE = 'fairwins-address-book'

// Domain-separated signing message for the backup key. Intentionally DISTINCT
// from the wager-encryption signing messages in utils/crypto/constants.js so the
// backup key can never coincide with a member's wager-encryption private key.
export const ADDRESS_BOOK_BACKUP_MESSAGE_V1 = 'FairWins Address Book Backup v1'

// How long a screening result stays fresh in-session before a re-screen (ms).
export const SCREENING_TTL_MS = 60_000

// Field limits.
export const MAX_NICKNAME_LENGTH = 60
export const MAX_NOTES_LENGTH = 500
