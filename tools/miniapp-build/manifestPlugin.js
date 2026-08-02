/**
 * Manifest emission plugin (spec 073, data-model.md §2).
 *
 * Writes `manifest.json` next to the built package. The manifest is the
 * package's runtime contract AND its integrity anchor: the registry stores
 * `keccak256(manifest.json bytes)`, so these exact bytes are what a curator
 * approves and what every host re-hashes before executing a single line of the
 * package. Three consequences shape this file:
 *
 * 1. **Deterministic bytes.** Fields are emitted in the schema's declared order
 *    and every list/map is sorted, so rebuilding unchanged sources reproduces
 *    the same hash. A gratuitously reordered key would look, on-chain, exactly
 *    like a tampered package.
 * 2. **Described, not assumed.** `entry`, `styles` and `files` are read back
 *    from what the build actually emitted, never hardcoded — a manifest that
 *    described an intended output rather than the real one would fail at launch
 *    on the member's machine instead of here.
 * 3. **Digests from disk.** Hashing happens in `writeBundle`, after rollup has
 *    written the files, so the digests cover the bytes a gateway will serve.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  HOST_API_VERSION,
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA
} from './constants.js'
import { sharedDepsFromBundle } from './hostScopePlugin.js'
import { buildFileDigests } from './packageIntegrity.js'

/**
 * Create the manifest plugin.
 *
 * @param {object} options
 * @param {string} options.appId - registry slug; becomes `manifest.id`
 * @param {string} options.name - display name
 * @param {string} options.version - display version string
 * @param {string[]} options.permissions - declared host capabilities
 * @param {string[]} options.storeKeys - declared namespaced-store keys
 * @returns {import('vite').Plugin} Vite/rollup plugin
 */
export function manifestPlugin(options) {
  const { appId, name, version, permissions, storeKeys } = options

  return {
    name: 'fairwins-miniapp-manifest',

    writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir || path.dirname(outputOptions.file)

      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk')
      const entryChunks = chunks.filter((chunk) => chunk.isEntry)
      if (entryChunks.length !== 1) {
        throw new Error(
          `[miniapp-build] expected exactly one entry chunk, found ${entryChunks.length}. ` +
            'A mini-app package is a single ES module; check that the preset\'s lib entry was not overridden.'
        )
      }
      if (chunks.length !== 1) {
        // Code splitting would leave the host with chunks it never fetched and
        // therefore never hashed — the package must be one verifiable module.
        throw new Error(
          '[miniapp-build] the build produced more than one chunk: ' +
            chunks.map((chunk) => chunk.fileName).join(', ') +
            '. Dynamic imports must stay inlined (rollupOptions.output.inlineDynamicImports).'
        )
      }

      const styles = Object.values(bundle)
        .filter((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
        .map((output) => output.fileName)
        .sort()

      // Field order IS the manifest schema (data-model.md §2) — see note 1 above.
      const manifest = {
        schema: MANIFEST_SCHEMA,
        id: appId,
        name,
        version,
        entry: entryChunks[0].fileName,
        styles,
        hostApi: HOST_API_VERSION,
        sharedDeps: sharedDepsFromBundle(bundle),
        permissions: [...permissions].sort(),
        storeKeys: [...storeKeys].sort(),
        files: buildFileDigests(outDir)
      }

      const bytes = `${JSON.stringify(manifest, null, 2)}\n`
      fs.writeFileSync(path.join(outDir, MANIFEST_FILENAME), bytes, 'utf8')

      const fileCount = Object.keys(manifest.files).length
      this.info(
        `${MANIFEST_FILENAME} written for "${appId}" v${version} — entry ${manifest.entry}, ` +
          `${fileCount} file(s) hashed, shared deps: ${manifest.sharedDeps.join(', ') || 'none'}`
      )
    }
  }
}
