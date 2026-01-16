/**
 * Identity and Memory Storage Module
 *
 * Provides persistent storage for agent identity, DID documents, and memory
 * on the floppy disk alongside cryptographic keys.
 *
 * Storage capacity: ~1.4 MB available after keystores
 *
 * Features:
 * - DID document storage (W3C DID Core compatible)
 * - Agent profile and identity
 * - Persistent memory/notes (encrypted or plain)
 * - Key-value metadata store
 *
 * @module identity
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');

const IDENTITY_DIR = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR, 'identity');
const DID_FILE = path.join(IDENTITY_DIR, 'did.json');
const PROFILE_FILE = path.join(IDENTITY_DIR, 'profile.json');
const MEMORY_FILE = path.join(IDENTITY_DIR, 'memory.json');
const MEMORY_ENCRYPTED_FILE = path.join(IDENTITY_DIR, 'memory.enc');
const METADATA_FILE = path.join(IDENTITY_DIR, 'metadata.json');

/**
 * Ensure identity directory exists
 */
function ensureIdentityDir() {
  if (!fs.existsSync(IDENTITY_DIR)) {
    fs.mkdirSync(IDENTITY_DIR, { mode: 0o700, recursive: true });
  }
}

/**
 * Check if identity storage is available
 * @returns {boolean}
 */
function isIdentityAvailable() {
  try {
    const { execSync } = require('child_process');
    execSync(`mountpoint -q "${CONFIG.MOUNT_POINT}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// DID Document Management
// ============================================================================

/**
 * Create a new DID document for the agent
 *
 * @param {object} options - DID options
 * @param {string} options.method - DID method (default: 'key')
 * @param {string} options.controller - Controller DID (optional)
 * @param {object[]} options.verificationMethods - Additional verification methods
 * @param {object[]} options.services - Service endpoints
 * @returns {object} The created DID document
 */
function createDIDDocument(options = {}) {
  ensureIdentityDir();

  const {
    method = 'key',
    controller = null,
    verificationMethods = [],
    services = []
  } = options;

  // Generate a unique DID identifier
  const didId = crypto.randomBytes(16).toString('hex');
  const did = `did:${method}:${didId}`;

  const didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: did,
    controller: controller || did,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    verificationMethod: [
      {
        id: `${did}#keys-1`,
        type: 'JsonWebKey2020',
        controller: did,
        // Public key will be derived from floppy keystore when needed
        publicKeyJwk: null
      },
      ...verificationMethods
    ],
    authentication: [`${did}#keys-1`],
    assertionMethod: [`${did}#keys-1`],
    keyAgreement: [],
    service: services
  };

  fs.writeFileSync(DID_FILE, JSON.stringify(didDocument, null, 2), { mode: 0o600 });
  syncDisk();

  return didDocument;
}

/**
 * Get the DID document
 * @returns {object|null}
 */
function getDIDDocument() {
  if (!fs.existsSync(DID_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(DID_FILE, 'utf8'));
}

/**
 * Update the DID document
 * @param {object} updates - Fields to update
 * @returns {object} Updated DID document
 */
function updateDIDDocument(updates) {
  const doc = getDIDDocument();
  if (!doc) {
    throw new Error('DID document not found. Create one first.');
  }

  const updated = {
    ...doc,
    ...updates,
    updated: new Date().toISOString()
  };

  // Preserve immutable fields
  updated.id = doc.id;
  updated.created = doc.created;

  fs.writeFileSync(DID_FILE, JSON.stringify(updated, null, 2), { mode: 0o600 });
  syncDisk();

  return updated;
}

/**
 * Add a service endpoint to the DID document
 * @param {object} service - Service to add
 */
function addDIDService(service) {
  const doc = getDIDDocument();
  if (!doc) {
    throw new Error('DID document not found');
  }

  doc.service = doc.service || [];
  doc.service.push({
    id: `${doc.id}#${service.id || 'service-' + (doc.service.length + 1)}`,
    type: service.type,
    serviceEndpoint: service.endpoint,
    ...service
  });

  return updateDIDDocument({ service: doc.service });
}

// ============================================================================
// Agent Profile
// ============================================================================

/**
 * Create or update agent profile
 *
 * @param {object} profile - Profile data
 * @param {string} profile.name - Agent name
 * @param {string} profile.description - Agent description
 * @param {string} profile.version - Agent version
 * @param {string[]} profile.capabilities - List of capabilities
 * @param {object} profile.preferences - Agent preferences
 * @returns {object} The profile
 */
function setProfile(profile) {
  ensureIdentityDir();

  const existing = getProfile() || {};

  const updated = {
    ...existing,
    ...profile,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString()
  };

  fs.writeFileSync(PROFILE_FILE, JSON.stringify(updated, null, 2), { mode: 0o600 });
  syncDisk();

  return updated;
}

/**
 * Get agent profile
 * @returns {object|null}
 */
function getProfile() {
  if (!fs.existsSync(PROFILE_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
}

// ============================================================================
// Persistent Memory
// ============================================================================

/**
 * Memory entry structure
 * @typedef {object} MemoryEntry
 * @property {string} id - Unique identifier
 * @property {string} type - Entry type (note, context, fact, etc.)
 * @property {string} content - The content
 * @property {string[]} tags - Searchable tags
 * @property {number} importance - 1-10 importance score
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {object} metadata - Additional metadata
 */

/**
 * Get all memory entries
 * @returns {MemoryEntry[]}
 */
function getMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    return [];
  }
  const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  return data.entries || [];
}

/**
 * Add a memory entry
 *
 * @param {object} entry - Memory entry
 * @param {string} entry.type - Entry type
 * @param {string} entry.content - Content
 * @param {string[]} entry.tags - Tags
 * @param {number} entry.importance - Importance (1-10)
 * @returns {MemoryEntry}
 */
function addMemory(entry) {
  ensureIdentityDir();

  const entries = getMemory();

  const newEntry = {
    id: crypto.randomBytes(8).toString('hex'),
    type: entry.type || 'note',
    content: entry.content,
    tags: entry.tags || [],
    importance: Math.min(10, Math.max(1, entry.importance || 5)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: entry.metadata || {}
  };

  entries.push(newEntry);

  const data = {
    version: 1,
    entries,
    stats: {
      count: entries.length,
      lastUpdated: new Date().toISOString()
    }
  };

  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  syncDisk();

  return newEntry;
}

/**
 * Search memory entries
 *
 * @param {object} query - Search query
 * @param {string} query.type - Filter by type
 * @param {string[]} query.tags - Filter by tags (any match)
 * @param {string} query.text - Full-text search in content
 * @param {number} query.minImportance - Minimum importance
 * @param {number} query.limit - Max results
 * @returns {MemoryEntry[]}
 */
function searchMemory(query = {}) {
  let entries = getMemory();

  if (query.type) {
    entries = entries.filter(e => e.type === query.type);
  }

  if (query.tags && query.tags.length > 0) {
    entries = entries.filter(e =>
      query.tags.some(tag => e.tags.includes(tag))
    );
  }

  if (query.text) {
    const searchTerm = query.text.toLowerCase();
    entries = entries.filter(e =>
      e.content.toLowerCase().includes(searchTerm)
    );
  }

  if (query.minImportance) {
    entries = entries.filter(e => e.importance >= query.minImportance);
  }

  // Sort by importance desc, then by date desc
  entries.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  if (query.limit) {
    entries = entries.slice(0, query.limit);
  }

  return entries;
}

/**
 * Update a memory entry
 *
 * @param {string} id - Entry ID
 * @param {object} updates - Fields to update
 * @returns {MemoryEntry|null}
 */
function updateMemory(id, updates) {
  const entries = getMemory();
  const index = entries.findIndex(e => e.id === id);

  if (index === -1) {
    return null;
  }

  entries[index] = {
    ...entries[index],
    ...updates,
    id: entries[index].id, // Preserve ID
    createdAt: entries[index].createdAt, // Preserve creation date
    updatedAt: new Date().toISOString()
  };

  const data = {
    version: 1,
    entries,
    stats: {
      count: entries.length,
      lastUpdated: new Date().toISOString()
    }
  };

  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  syncDisk();

  return entries[index];
}

/**
 * Delete a memory entry
 *
 * @param {string} id - Entry ID
 * @returns {boolean}
 */
function deleteMemory(id) {
  const entries = getMemory();
  const filtered = entries.filter(e => e.id !== id);

  if (filtered.length === entries.length) {
    return false;
  }

  const data = {
    version: 1,
    entries: filtered,
    stats: {
      count: filtered.length,
      lastUpdated: new Date().toISOString()
    }
  };

  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  syncDisk();

  return true;
}

/**
 * Clear all memory entries
 */
function clearMemory() {
  if (fs.existsSync(MEMORY_FILE)) {
    fs.unlinkSync(MEMORY_FILE);
    syncDisk();
  }
}

// ============================================================================
// Encrypted Memory (for sensitive data)
// ============================================================================

/**
 * Save encrypted memory
 *
 * @param {object} data - Data to encrypt
 * @param {string} password - Encryption password
 */
async function saveEncryptedMemory(data, password) {
  ensureIdentityDir();

  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  // Derive key with scrypt (lower params for faster operation)
  const key = crypto.scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1
  });

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(data);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  const envelope = {
    version: 1,
    cipher: 'aes-256-gcm',
    kdf: 'scrypt',
    kdfparams: { n: 16384, r: 8, p: 1, dklen: 32 },
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    authTag: authTag.toString('hex'),
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(
    MEMORY_ENCRYPTED_FILE,
    JSON.stringify(envelope, null, 2),
    { mode: 0o600 }
  );
  syncDisk();
}

/**
 * Load encrypted memory
 *
 * @param {string} password - Decryption password
 * @returns {object} Decrypted data
 */
function loadEncryptedMemory(password) {
  if (!fs.existsSync(MEMORY_ENCRYPTED_FILE)) {
    return null;
  }

  const envelope = JSON.parse(fs.readFileSync(MEMORY_ENCRYPTED_FILE, 'utf8'));

  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const ciphertext = Buffer.from(envelope.ciphertext, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');

  const key = crypto.scryptSync(password, salt, 32, {
    N: envelope.kdfparams.n,
    r: envelope.kdfparams.r,
    p: envelope.kdfparams.p
  });

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

// ============================================================================
// Key-Value Metadata Store
// ============================================================================

/**
 * Get all metadata
 * @returns {object}
 */
function getMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
}

/**
 * Set a metadata value
 *
 * @param {string} key - Key
 * @param {*} value - Value (must be JSON serializable)
 */
function setMetadataValue(key, value) {
  ensureIdentityDir();

  const metadata = getMetadata();
  metadata[key] = value;

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  syncDisk();
}

/**
 * Get a metadata value
 *
 * @param {string} key - Key
 * @param {*} defaultValue - Default if not found
 * @returns {*}
 */
function getMetadataValue(key, defaultValue = null) {
  const metadata = getMetadata();
  return metadata.hasOwnProperty(key) ? metadata[key] : defaultValue;
}

/**
 * Delete a metadata value
 *
 * @param {string} key - Key
 */
function deleteMetadataValue(key) {
  const metadata = getMetadata();
  delete metadata[key];

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  syncDisk();
}

// ============================================================================
// Disk Space Management
// ============================================================================

/**
 * Sync filesystem to ensure data is written
 */
function syncDisk() {
  try {
    const { execSync } = require('child_process');
    execSync('sync', { stdio: 'ignore' });
  } catch {
    // Ignore sync errors
  }
}

/**
 * Get storage statistics
 *
 * @returns {object} Storage stats
 */
function getStorageStats() {
  const FLOPPY_CAPACITY = 1474560; // 1.44 MB in bytes

  let usedBytes = 0;
  const files = {};

  const keystoreDir = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR);

  function countDir(dir) {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        countDir(fullPath);
      } else {
        usedBytes += stat.size;
        files[fullPath.replace(keystoreDir, '')] = stat.size;
      }
    }
  }

  if (fs.existsSync(keystoreDir)) {
    countDir(keystoreDir);
  }

  const availableBytes = FLOPPY_CAPACITY - usedBytes - 10240; // Reserve 10KB for filesystem

  return {
    capacity: FLOPPY_CAPACITY,
    capacityFormatted: formatBytes(FLOPPY_CAPACITY),
    used: usedBytes,
    usedFormatted: formatBytes(usedBytes),
    available: Math.max(0, availableBytes),
    availableFormatted: formatBytes(Math.max(0, availableBytes)),
    usedPercent: ((usedBytes / FLOPPY_CAPACITY) * 100).toFixed(1),
    files
  };
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Availability
  isIdentityAvailable,
  ensureIdentityDir,

  // DID Document
  createDIDDocument,
  getDIDDocument,
  updateDIDDocument,
  addDIDService,

  // Profile
  setProfile,
  getProfile,

  // Memory (plain)
  getMemory,
  addMemory,
  searchMemory,
  updateMemory,
  deleteMemory,
  clearMemory,

  // Memory (encrypted)
  saveEncryptedMemory,
  loadEncryptedMemory,

  // Metadata
  getMetadata,
  setMetadataValue,
  getMetadataValue,
  deleteMetadataValue,

  // Storage
  getStorageStats,
  syncDisk,

  // Paths
  IDENTITY_DIR,
  DID_FILE,
  PROFILE_FILE,
  MEMORY_FILE,
  MEMORY_ENCRYPTED_FILE,
  METADATA_FILE
};
