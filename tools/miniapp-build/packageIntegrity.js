/**
 * Package integrity helpers (spec 073, research R3).
 *
 * The launch-time integrity chain is
 * `registry.approved.manifestHash == keccak256(manifest.json bytes)` and then
 * `manifest.files[path].sha256 == sha256(fetched bytes)` for every executed
 * file. This module owns the build-side half of that chain: the SHA-256 digests
 * written into the manifest, and the re-verification the publish script runs
 * before it pins anything.
 *
 * Digests are always computed from the bytes ON DISK — the bytes a gateway will
 * actually serve — never from an in-memory rollup chunk that a later build step
 * could still rewrite.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { MANIFEST_FILENAME } from './constants.js'

/**
 * SHA-256 of a byte buffer, lowercase hex (the manifest's `files[].sha256`
 * encoding). Hex rather than multibase so the host can compare it against
 * `@noble/hashes` output without a codec dependency.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {string} 64-character lowercase hex digest
 */
export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

/**
 * List every file in a built package directory, as posix-relative paths.
 * `manifest.json` is excluded: it is the anchor that carries the digests, so
 * hashing it into its own `files` map is impossible by construction.
 *
 * @param {string} dir - built package directory
 * @returns {string[]} relative paths, sorted for deterministic manifest bytes
 */
export function listPackageFiles(dir) {
  const found = []

  const walk = (absolute, prefix) => {
    for (const dirent of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, dirent.name)
      const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name
      if (dirent.isDirectory()) {
        walk(child, relative)
      } else if (dirent.isFile() && relative !== MANIFEST_FILENAME) {
        found.push(relative)
      }
    }
  }

  walk(dir, '')
  return found.sort()
}

/**
 * Build the manifest `files` map for a package directory.
 *
 * Every emitted file is listed, not just the entry and stylesheets: the host
 * refuses to execute anything absent from `files`, so listing the whole
 * directory keeps a package's own assets fetchable without weakening the rule.
 *
 * @param {string} dir - built package directory
 * @returns {Record<string, {sha256: string}>} path -> digest, in sorted key order
 */
export function buildFileDigests(dir) {
  const files = {}
  for (const relative of listPackageFiles(dir)) {
    files[relative] = { sha256: sha256Hex(fs.readFileSync(path.join(dir, relative))) }
  }
  return files
}

/**
 * Re-verify a built package against its own manifest.
 *
 * Used by `scripts/miniapps/publish.js` so nothing is ever pinned or staged
 * that was not proven self-consistent first — a package whose manifest does not
 * describe its own bytes would be refused at launch by every host, after the
 * vendor had already paid for an on-chain submission.
 *
 * Reports EVERY problem found rather than the first, so one run tells the whole
 * story (the `validate-tenant-manifest.js` convention).
 *
 * @param {string} dir - built package directory
 * @returns {{manifest: object, manifestBytes: Buffer, files: string[]}}
 * @throws {Error} when the manifest is missing, unreadable, or disagrees with the bytes on disk
 */
export function verifyPackageDigests(dir) {
  const manifestPath = path.join(dir, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[miniapp-build] no ${MANIFEST_FILENAME} in ${dir} — the package was not built by this preset`)
  }

  const manifestBytes = fs.readFileSync(manifestPath)
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch (error) {
    throw new Error(`[miniapp-build] ${manifestPath} is not valid JSON: ${error.message}`)
  }

  const problems = []
  const listed = manifest.files && typeof manifest.files === 'object' ? manifest.files : null
  if (!listed) problems.push('manifest.files is missing or not an object')

  const onDisk = listPackageFiles(dir)
  const listedPaths = listed ? Object.keys(listed) : []

  for (const relative of listedPaths) {
    const absolute = path.join(dir, relative)
    if (!fs.existsSync(absolute)) {
      problems.push(`${relative}: listed in the manifest but missing from the package`)
      continue
    }
    const actual = sha256Hex(fs.readFileSync(absolute))
    const expected = listed[relative] && listed[relative].sha256
    if (actual !== expected) {
      problems.push(`${relative}: sha256 ${actual} does not match manifest ${expected}`)
    }
  }

  for (const relative of onDisk) {
    if (!listedPaths.includes(relative)) {
      problems.push(`${relative}: present in the package but not listed in the manifest (the host would refuse it)`)
    }
  }

  if (manifest.entry && !onDisk.includes(manifest.entry)) {
    problems.push(`entry "${manifest.entry}" is not present in the package`)
  }

  for (const style of manifest.styles || []) {
    if (!onDisk.includes(style)) problems.push(`style "${style}" is not present in the package`)
  }

  if (problems.length > 0) {
    throw new Error(
      `[miniapp-build] package at ${dir} does not match its manifest:\n  ` + problems.join('\n  ')
    )
  }

  return { manifest, manifestBytes, files: onDisk }
}
