/**
 * Configuration for floppy disk keystore
 */
export default {
  // Floppy device path
  DEVICE: process.env.FLOPPY_DEVICE || '/dev/sde',

  // Mount point
  MOUNT_POINT: process.env.FLOPPY_MOUNT || '/mnt/floppy',

  // Keystore file path on floppy
  KEYSTORE_DIR: '.keystore',
  KEYSTORE_FILENAME: 'mnemonic-keystore.json',

  // KDF parameters (scrypt) - strong but reasonable
  SCRYPT_N: 262144,  // 2^18
  SCRYPT_R: 8,
  SCRYPT_P: 1,
  SCRYPT_DKLEN: 32,

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
