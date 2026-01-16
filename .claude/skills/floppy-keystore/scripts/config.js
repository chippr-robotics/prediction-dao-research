/**
 * Configuration for floppy disk keystore
 *
 * This module provides configuration for the floppy keystore skill.
 * All values can be overridden via environment variables.
 */
module.exports = {
  // Floppy device path
  DEVICE: process.env.FLOPPY_DEVICE || '/dev/sde',

  // Mount point
  MOUNT_POINT: process.env.FLOPPY_MOUNT || '/mnt/floppy',

  // Keystore file paths on floppy
  KEYSTORE_DIR: '.keystore',
  KEYSTORE_FILENAME: 'mnemonic-keystore.json',
  ADMIN_KEYSTORE_FILENAME: 'admin-keystore.json',

  // KDF parameters (scrypt) - strong security
  SCRYPT_N: 262144,  // 2^18 - ~512MB memory
  SCRYPT_R: 8,
  SCRYPT_P: 1,
  SCRYPT_DKLEN: 32,

  // Admin key uses lower params for faster operation
  ADMIN_SCRYPT_N: 16384,  // 2^14 - ~16MB memory

  // Cipher
  CIPHER: 'aes-128-ctr',

  // Mount options for security
  MOUNT_OPTIONS: [
    'noexec',      // Prevent executable files
    'nosuid',      // Ignore setuid bits
    'nodev',       // Ignore device files
    'umask=077',   // Owner-only permissions (rwx------)
    'sync',        // Synchronous writes
    'flush'        // Flush frequently
  ]
};
