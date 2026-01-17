/**
 * Clone Module - Floppy Disk Cloning, Forking, and Sync
 *
 * Provides functionality to:
 * - Initialize mother disks
 * - Fork clones with unique derivation indices
 * - Sync changes between mother and clones (push/pull)
 * - Clone floppy keystores to backup disks
 *
 * @module clone
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const CONFIG = require('./config');
const integrity = require('./integrity');
const registry = require('./registry');

const KEYSTORE_DIR = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR);
const IDENTITY_DIR = path.join(KEYSTORE_DIR, 'identity');

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Prompt for text input
 */
function promptInput(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Wait for user to press Enter
 */
async function waitForEnter(message = 'Press Enter to continue...') {
  await promptInput(message);
}

/**
 * Get all files in keystore directory recursively
 *
 * @returns {object[]} Array of { relativePath, absolutePath, size }
 */
function getKeystoreFiles() {
  const files = [];

  function scanDir(dir, baseDir) {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, baseDir);
      } else {
        files.push({
          relativePath: path.relative(baseDir, fullPath),
          absolutePath: fullPath,
          size: stat.size
        });
      }
    }
  }

  scanDir(KEYSTORE_DIR, KEYSTORE_DIR);
  return files;
}

/**
 * Copy a single file preserving structure
 *
 * @param {string} srcPath - Source file path
 * @param {string} destDir - Destination base directory
 * @param {string} relativePath - Relative path within structure
 */
function copyFile(srcPath, destDir, relativePath) {
  const destPath = path.join(destDir, relativePath);
  const destFolder = path.dirname(destPath);

  // Create directory structure
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { mode: 0o700, recursive: true });
  }

  // Copy file with same permissions
  fs.copyFileSync(srcPath, destPath);
  fs.chmodSync(destPath, 0o600);
}

/**
 * Clone source disk to destination
 *
 * This function assumes:
 * - Source disk is currently mounted
 * - Destination disk will be mounted at same location (after unmount/remount)
 *
 * @param {object} options - Clone options
 * @param {string} options.password - Password for signing
 * @param {string} options.newDiskId - Optional new disk ID (default: auto-generate)
 * @param {boolean} options.skipVerify - Skip verification steps
 * @returns {Promise<object>} Clone result
 */
async function cloneDisk(options = {}) {
  const result = {
    success: false,
    sourceManifest: null,
    cloneManifest: null,
    filesCopied: [],
    errors: []
  };

  try {
    // 1. Verify source disk
    console.log('\n1. Verifying source disk integrity...');
    const sourceVerify = integrity.verifyDiskIntegrity();

    if (!sourceVerify.valid) {
      console.log('   Warnings found on source disk:');
      sourceVerify.errors.forEach(e => console.log('   - ' + e));
      const proceed = await promptInput('   Continue anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        result.errors.push('User cancelled due to source verification warnings');
        return result;
      }
    } else {
      console.log('   Source disk verified');
    }

    result.sourceManifest = integrity.getManifest();

    // 2. Collect files to copy
    console.log('\n2. Collecting files...');
    const files = getKeystoreFiles();
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    console.log(`   Found ${files.length} files (${formatBytes(totalSize)})`);

    // 3. Read all files into memory before unmounting
    console.log('\n3. Reading source files into memory...');
    const fileContents = {};
    for (const file of files) {
      fileContents[file.relativePath] = {
        content: fs.readFileSync(file.absolutePath),
        size: file.size
      };
      console.log(`   Read: ${file.relativePath} (${formatBytes(file.size)})`);
    }

    // 4. Prepare clone manifest
    const sourceManifest = result.sourceManifest || {};
    const cloneDiskId = options.newDiskId ||
      `${sourceManifest.diskId || 'unknown'}-backup-${Date.now().toString(36)}`;

    const cloneManifest = {
      ...sourceManifest,
      diskId: cloneDiskId,
      diskName: `${sourceManifest.diskName || 'Unknown'} (Clone)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentDiskId: sourceManifest.diskId,
      cloneGeneration: (sourceManifest.cloneGeneration || 0) + 1,
      // Signature will be updated after copy
      signature: null,
      signedAt: null,
      hasUnsignedChanges: true
    };

    // Update manifest in file contents
    const manifestRelPath = 'identity/manifest.json';
    fileContents[manifestRelPath] = {
      content: Buffer.from(JSON.stringify(cloneManifest, null, 2)),
      size: 0 // Will be updated
    };
    fileContents[manifestRelPath].size = fileContents[manifestRelPath].content.length;

    // 5. Unmount source disk
    console.log('\n4. Unmounting source disk...');
    try {
      execSync('sync', { stdio: 'ignore' });
      execSync(`sudo umount "${CONFIG.MOUNT_POINT}"`, { stdio: 'inherit' });
      console.log('   Source disk unmounted');
    } catch (e) {
      result.errors.push('Failed to unmount source disk: ' + e.message);
      return result;
    }

    // 6. Prompt for destination disk
    console.log('\n5. Insert destination floppy disk');
    console.log('   WARNING: All data on destination disk will be overwritten!');
    await waitForEnter('   Press Enter when ready...');

    // 7. Mount destination disk
    console.log('\n6. Mounting destination disk...');
    try {
      const mountOptions = CONFIG.MOUNT_OPTIONS.join(',');
      execSync(`sudo mount -o ${mountOptions} "${CONFIG.DEVICE}" "${CONFIG.MOUNT_POINT}"`, { stdio: 'inherit' });
      console.log('   Destination disk mounted');
    } catch (e) {
      result.errors.push('Failed to mount destination disk: ' + e.message);
      return result;
    }

    // 8. Clear existing data on destination (if any)
    console.log('\n7. Preparing destination disk...');
    const destKeystoreDir = path.join(CONFIG.MOUNT_POINT, CONFIG.KEYSTORE_DIR);
    if (fs.existsSync(destKeystoreDir)) {
      try {
        fs.rmSync(destKeystoreDir, { recursive: true, force: true });
        console.log('   Cleared existing keystore directory');
      } catch (e) {
        console.log('   Warning: Could not clear existing directory: ' + e.message);
      }
    }

    // 9. Write files to destination
    console.log('\n8. Writing files to destination...');
    for (const [relativePath, data] of Object.entries(fileContents)) {
      const destPath = path.join(destKeystoreDir, relativePath);
      const destFolder = path.dirname(destPath);

      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { mode: 0o700, recursive: true });
      }

      fs.writeFileSync(destPath, data.content, { mode: 0o600 });
      console.log(`   Wrote: ${relativePath} (${formatBytes(data.size)})`);
      result.filesCopied.push(relativePath);
    }

    // 10. Sync to disk
    execSync('sync', { stdio: 'ignore' });
    console.log('   Synced to disk');

    // 11. Sign manifest if password provided
    if (options.password) {
      console.log('\n9. Signing clone manifest...');
      try {
        const { decryptMnemonic } = require('./keystore');
        const { deriveKeys } = require('./chains');

        // Load keystore and derive signing key
        const keystorePath = path.join(destKeystoreDir, CONFIG.KEYSTORE_FILENAME);
        const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
        const mnemonic = await decryptMnemonic(keystore, options.password);
        const keys = await deriveKeys(mnemonic, 'ethereum', { count: 1 });

        // Sign manifest
        const manifestPath = path.join(destKeystoreDir, 'identity', 'manifest.json');
        let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        const sigData = integrity.signManifest(manifest, keys[0].privateKey);
        manifest.signerAddress = sigData.signerAddress;
        manifest.signature = sigData.signature;
        manifest.signedAt = sigData.signedAt;
        manifest.hasUnsignedChanges = false;

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
        execSync('sync', { stdio: 'ignore' });

        result.cloneManifest = manifest;
        console.log(`   Signed by: ${manifest.signerAddress}`);
      } catch (e) {
        console.log('   Warning: Could not sign manifest: ' + e.message);
        result.errors.push('Signing failed: ' + e.message);
      }
    } else {
      console.log('\n9. Manifest not signed (no password provided)');
      console.log('   Run "sign" command later to sign the manifest');
    }

    // 12. Verify clone
    if (!options.skipVerify) {
      console.log('\n10. Verifying clone integrity...');
      const cloneVerify = integrity.verifyDiskIntegrity();

      if (cloneVerify.valid || (cloneVerify.warnings.length > 0 && cloneVerify.errors.length === 0)) {
        console.log('    Clone verified');
        result.success = true;
      } else {
        console.log('    Clone verification issues:');
        cloneVerify.errors.forEach(e => console.log('    - ' + e));
        result.errors.push(...cloneVerify.errors);
      }
    } else {
      result.success = true;
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    if (result.success) {
      console.log('Clone complete!');
      console.log(`  Clone ID: ${cloneManifest.diskId}`);
      console.log(`  Parent: ${cloneManifest.parentDiskId}`);
      console.log(`  Generation: ${cloneManifest.cloneGeneration}`);
      console.log(`  Files: ${result.filesCopied.length}`);
    } else {
      console.log('Clone completed with errors:');
      result.errors.forEach(e => console.log('  - ' + e));
    }

  } catch (error) {
    result.errors.push('Clone failed: ' + error.message);
    console.error('\nClone failed:', error.message);
  }

  return result;
}

/**
 * Interactive clone workflow
 * Guides user through the entire clone process
 *
 * @param {Function} promptPassword - Password prompt function
 */
async function interactiveClone(promptPassword) {
  console.log('\n' + '='.repeat(50));
  console.log('  CLONE FLOPPY DISK');
  console.log('='.repeat(50));

  // Check source disk
  const manifest = integrity.getManifest();
  if (!manifest) {
    console.log('\nError: No manifest found on source disk.');
    console.log('Run "sign" command first to create a manifest.');
    return { success: false };
  }

  // Display source info
  console.log('\nSource Disk:');
  console.log(`  ID: ${manifest.diskId}`);
  console.log(`  Name: ${manifest.diskName}`);
  console.log(`  Signer: ${manifest.signerAddress || '(not signed)'}`);
  console.log(`  Entries: ${manifest.entryCount || 0}`);
  console.log(`  Last signed: ${manifest.signedAt || 'never'}`);

  // Confirm
  const confirm = await promptInput('\nProceed with clone? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return { success: false };
  }

  // Get password
  let password = null;
  const signChoice = await promptInput('Sign the clone? (yes/no): ');
  if (signChoice.toLowerCase() === 'yes') {
    password = await promptPassword('Enter keystore password: ');
  }

  // Execute clone
  return await cloneDisk({ password });
}

/**
 * Restore from backup
 * Similar to clone but with different UX flow
 *
 * @param {object} options - Restore options
 */
async function restoreFromBackup(options = {}) {
  console.log('\n' + '='.repeat(50));
  console.log('  RESTORE FROM BACKUP');
  console.log('='.repeat(50));

  console.log('\nThis will restore a backup disk to a new disk.');
  console.log('The backup disk should be currently mounted.');

  // Verify it's a clone
  const manifest = integrity.getManifest();
  if (!manifest) {
    console.log('\nError: No manifest found. Is this a valid backup?');
    return { success: false };
  }

  if (!manifest.parentDiskId) {
    console.log('\nWarning: This disk does not appear to be a clone.');
    console.log(`  Disk ID: ${manifest.diskId}`);
  } else {
    console.log(`\nBackup of: ${manifest.parentDiskId}`);
    console.log(`Generation: ${manifest.cloneGeneration}`);
  }

  // Proceed with clone to restore
  return await cloneDisk(options);
}

// ============================================================================
// Mother/Clone Branching Operations
// ============================================================================

/**
 * Initialize current disk as a mother
 *
 * @param {string} motherId - Unique ID for this mother
 * @returns {object} Registry
 */
function initMother(motherId) {
  if (registry.isMother()) {
    throw new Error('This disk is already a mother');
  }

  if (registry.isClone()) {
    throw new Error('This disk is a clone, cannot convert to mother');
  }

  // Initialize registry
  const reg = registry.initializeMother(motherId);

  console.log('\nMother disk initialized!');
  console.log(`  ID: ${motherId}`);
  console.log(`  Next clone index: ${reg.nextIndex}`);
  console.log('\nYou can now fork clones with: node cli.js fork --name=<clone-name>');

  return reg;
}

/**
 * Prepare fork data on mother disk
 * Returns all data needed to create a clone
 *
 * @param {object} options
 * @param {string} options.cloneId - ID for the new clone
 * @param {string} options.cloneName - Human-readable name
 * @param {string} options.purpose - Purpose description
 * @returns {object} Fork data to write to clone disk
 */
function prepareFork(options) {
  if (!registry.isMother()) {
    throw new Error('This disk is not a mother. Run "init-mother" first.');
  }

  const { cloneId, cloneName, purpose = '' } = options;

  if (!cloneId) {
    throw new Error('Clone ID is required');
  }

  // Get current state
  const identity = require('./identity');
  const entries = identity.getMemory();
  const currentManifest = integrity.getManifest();
  const currentSequence = entries.reduce((max, e) => Math.max(max, e.sequence || 0), 0);

  // Register clone and get derivation index
  const cloneRecord = registry.registerClone({
    cloneId,
    cloneName: cloneName || cloneId,
    forkSequence: currentSequence,
    purpose
  });

  // Read all files
  const files = {};
  const keystoreFiles = getKeystoreFiles();
  for (const file of keystoreFiles) {
    // Skip registry file - clones don't get it
    if (file.relativePath === 'registry.json') continue;
    files[file.relativePath] = fs.readFileSync(file.absolutePath);
  }

  // Prepare clone manifest
  const cloneManifest = {
    ...(currentManifest || {}),
    diskId: cloneId,
    diskName: cloneName || cloneId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Branching metadata
    motherId: registry.getRegistry().motherId,
    derivationIndex: cloneRecord.derivationIndex,
    derivationPath: cloneRecord.derivationPath,
    forkSequence: currentSequence,
    forkedAt: new Date().toISOString(),

    // Legacy clone tracking
    parentDiskId: registry.getRegistry().motherId,
    cloneGeneration: 1,

    // Signature will be added when clone is signed
    signature: null,
    signedAt: null,
    hasUnsignedChanges: true
  };

  return {
    cloneId,
    cloneName: cloneName || cloneId,
    cloneRecord,
    files,
    manifest: cloneManifest,
    forkSequence: currentSequence,
    motherId: registry.getRegistry().motherId
  };
}

/**
 * Write fork data to destination disk (clone disk)
 *
 * @param {object} forkData - Data from prepareFork()
 * @returns {boolean} Success
 */
function writeForkToDisk(forkData) {
  const { files, manifest, cloneId } = forkData;

  console.log(`\nWriting clone "${cloneId}" to disk...`);

  // Clear existing keystore if present
  if (fs.existsSync(KEYSTORE_DIR)) {
    fs.rmSync(KEYSTORE_DIR, { recursive: true, force: true });
  }

  // Write all files
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(KEYSTORE_DIR, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { mode: 0o700, recursive: true });
    }

    fs.writeFileSync(fullPath, content, { mode: 0o600 });
    console.log(`  Wrote: ${relativePath} (${content.length} bytes)`);
  }

  // Write updated manifest
  const manifestPath = path.join(IDENTITY_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`  Wrote: identity/manifest.json`);

  // Update metadata with clone info
  const metadataPath = path.join(IDENTITY_DIR, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    metadata['disk.name'] = forkData.cloneId;
    metadata['disk.mother'] = forkData.motherId;
    metadata['disk.derivationIndex'] = forkData.cloneRecord.derivationIndex;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  }

  // Sync
  try {
    execSync('sync', { stdio: 'ignore' });
  } catch {}

  console.log('\nClone written successfully!');
  return true;
}

/**
 * Get status of current disk
 *
 * @returns {object} Status information
 */
function getStatus() {
  const role = registry.getDiskRole();
  const manifest = integrity.getManifest();

  const status = {
    role,
    diskId: manifest?.diskId || 'unknown',
    diskName: manifest?.diskName || 'Unknown',
    entryCount: manifest?.entryCount || 0,
    lastSequence: manifest?.lastSequence || 0,
    hasUnsignedChanges: manifest?.hasUnsignedChanges || false,
    lastSigned: manifest?.signedAt || null
  };

  if (role === 'mother') {
    const reg = registry.getRegistry();
    status.motherId = reg.motherId;
    status.totalClones = reg.clones.length;
    status.activeClones = reg.clones.filter(c => c.status === 'active').length;
    status.nextIndex = reg.nextIndex;
  } else if (role === 'clone') {
    status.motherId = manifest?.motherId;
    status.derivationIndex = manifest?.derivationIndex;
    status.derivationPath = manifest?.derivationPath;
    status.forkSequence = manifest?.forkSequence;
    status.forkedAt = manifest?.forkedAt;
  }

  return status;
}

/**
 * Prepare push data (clone → mother)
 * Exports entries created since fork for mother to import
 *
 * @returns {object} Push data
 */
function preparePush() {
  const role = registry.getDiskRole();
  if (role !== 'clone') {
    throw new Error('Push can only be run from a clone disk');
  }

  const identity = require('./identity');
  const manifest = integrity.getManifest();
  const entries = identity.getMemory();

  // Find entries created since fork
  const forkSequence = manifest.forkSequence || 0;
  const newEntries = entries.filter(e => (e.sequence || 0) > forkSequence);

  return {
    cloneId: manifest.diskId,
    motherId: manifest.motherId,
    derivationIndex: manifest.derivationIndex,
    forkSequence,
    currentSequence: manifest.lastSequence,
    entries: newEntries,
    entryCount: newEntries.length,
    manifest: manifest
  };
}

/**
 * Import push data into mother
 *
 * @param {object} pushData - Data from preparePush()
 * @param {object} options
 * @param {boolean} options.dryRun - Just show what would be imported
 * @returns {object} Import result
 */
function importPush(pushData, options = {}) {
  const role = registry.getDiskRole();
  if (role !== 'mother') {
    throw new Error('Import can only be run on mother disk');
  }

  const { cloneId, entries, forkSequence, currentSequence } = pushData;

  // Verify clone is registered
  const cloneRecord = registry.getClone(cloneId);
  if (!cloneRecord) {
    throw new Error(`Clone "${cloneId}" is not registered with this mother`);
  }

  if (cloneRecord.status === 'revoked') {
    throw new Error(`Clone "${cloneId}" has been revoked`);
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      cloneId,
      entriesWouldImport: entries.length,
      fromSequence: forkSequence,
      toSequence: currentSequence
    };
  }

  // Import entries with attribution
  const identity = require('./identity');
  let imported = 0;

  for (const entry of entries) {
    // Add with clone attribution
    identity.addMemory({
      type: entry.type,
      content: entry.content,
      tags: [...(entry.tags || []), `from:${cloneId}`],
      importance: entry.importance,
      metadata: {
        ...entry.metadata,
        sourceClone: cloneId,
        sourceSequence: entry.sequence,
        importedAt: new Date().toISOString()
      }
    });
    imported++;
  }

  // Record sync
  registry.recordSync({
    cloneId,
    direction: 'push',
    entriesTransferred: imported,
    fromSequence: forkSequence,
    toSequence: currentSequence
  });

  return {
    cloneId,
    entriesImported: imported,
    fromSequence: forkSequence,
    toSequence: currentSequence
  };
}

/**
 * Prepare pull data (mother → clone)
 * Gets entries from mother that clone doesn't have
 *
 * @param {object} cloneManifest - Clone's current manifest
 * @returns {object} Pull data
 */
function preparePull(cloneManifest) {
  const role = registry.getDiskRole();
  if (role !== 'mother') {
    throw new Error('Pull data can only be prepared from mother disk');
  }

  const identity = require('./identity');
  const entries = identity.getMemory();

  // Find entries created on mother since clone's fork
  // (entries that don't have sourceClone attribution)
  const forkSequence = cloneManifest.forkSequence || 0;
  const motherEntries = entries.filter(e => {
    const seq = e.sequence || 0;
    const isFromMother = !e.metadata?.sourceClone;
    return seq > forkSequence && isFromMother;
  });

  return {
    motherId: registry.getRegistry().motherId,
    cloneId: cloneManifest.diskId,
    forkSequence,
    entries: motherEntries,
    entryCount: motherEntries.length
  };
}

/**
 * Import pull data into clone
 *
 * @param {object} pullData - Data from preparePull()
 * @returns {object} Import result
 */
function importPull(pullData) {
  const role = registry.getDiskRole();
  if (role !== 'clone') {
    throw new Error('Import can only be run on clone disk');
  }

  const { motherId, entries } = pullData;
  const identity = require('./identity');

  let imported = 0;
  for (const entry of entries) {
    identity.addMemory({
      type: entry.type,
      content: entry.content,
      tags: [...(entry.tags || []), `from:mother`],
      importance: entry.importance,
      metadata: {
        ...entry.metadata,
        sourceMother: motherId,
        sourceSequence: entry.sequence,
        importedAt: new Date().toISOString()
      }
    });
    imported++;
  }

  return {
    motherId,
    entriesImported: imported
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Legacy clone operations
  cloneDisk,
  interactiveClone,
  restoreFromBackup,
  getKeystoreFiles,
  formatBytes,

  // Mother/Clone branching
  initMother,
  prepareFork,
  writeForkToDisk,
  getStatus,

  // Sync operations
  preparePush,
  importPush,
  preparePull,
  importPull
};
