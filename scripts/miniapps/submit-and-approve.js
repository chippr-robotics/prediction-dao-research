#!/usr/bin/env node
/**
 * List a published mini-app package on the registry and approve it (spec 073).
 *
 *     npx hardhat run scripts/miniapps/submit-and-approve.js --network mordor
 *
 * Configured by environment so the same script serves a vendor submitting and a curator
 * approving:
 *
 *     MINIAPP_CID           the CID `scripts/miniapps/publish.js` printed
 *     MINIAPP_MANIFEST_HASH the keccak256 it printed alongside
 *     MINIAPP_NAME          listing name (first submission only)
 *     MINIAPP_DESCRIPTION   listing copy (first submission only)
 *     MINIAPP_CATEGORY      0..5, see IMiniAppRegistry.Category
 *     MINIAPP_APPROVE       "1" to approve after submitting (needs APP_CURATOR_ROLE)
 *
 * TWO PROPERTIES ARE LOAD-BEARING, and both are about the same failure:
 *
 * 1. **Approval is CONTENT-COMMITTED.** `approveApp(id, expectedManifestHash)` reverts
 *    `StaleProposal` if the proposed tuple moved since it was read. An adversarial review found
 *    that an id-only approve let a vendor swap the package after review — front-running the
 *    approval or landing inside a multisig signing window — and get UNREVIEWED code marked
 *    Approved. The host's integrity chain cannot catch it, because the substituted manifest
 *    hashes correctly against itself. So this script re-reads the proposed tuple immediately
 *    before approving and passes the hash it actually saw, never the one it was told to expect.
 *
 * 2. **It verifies the gateway serves those exact bytes first.** Approving a package nobody can
 *    fetch produces a listing that is Approved and unlaunchable; approving one whose bytes hash
 *    differently produces a listing every member's host will refuse. Either way the failure
 *    surfaces to members rather than here, which is the wrong end.
 */

const { ethers, network } = require('hardhat')

const REGISTRY_ABI = [
  'function submitApp(string name, string description, uint8 category, string cid, bytes32 manifestHash) returns (uint256 id)',
  'function submitUpdate(uint256 id, string cid, bytes32 manifestHash)',
  'function approveApp(uint256 id, bytes32 expectedManifestHash)',
  'function idByName(string name) view returns (uint256)',
  'function getApp(uint256 id) view returns ((uint256 id, address vendor, string name, string description, uint8 category, uint8 status, bool launchable, (string cid, bytes32 manifestHash, uint64 version) approved, (string cid, bytes32 manifestHash, uint64 version) proposed, uint64 submittedAt, uint64 approvedAt, uint64 updatedAt))',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function APP_CURATOR_ROLE() view returns (bytes32)',
]

const GATEWAYS = [
  'https://gateway.pinata.cloud',
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
]

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

/** Fetch the manifest from the first gateway that answers, and hash the RAW BYTES. */
async function fetchManifestHash(cid) {
  const errors = []
  for (const gateway of GATEWAYS) {
    const url = `${gateway}/ipfs/${cid}/manifest.json`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) {
        errors.push(`${gateway}: HTTP ${res.status}`)
        continue
      }
      // Hashed from the bytes on the wire, never from a re-serialized object: the registry stores
      // keccak256 of the manifest FILE, and re-stringifying would normalize whitespace and key
      // order into a hash no host could ever reproduce.
      const bytes = new Uint8Array(await res.arrayBuffer())
      return { hash: ethers.keccak256(bytes), gateway, bytes }
    } catch (error) {
      errors.push(`${gateway}: ${error.message}`)
    }
  }
  throw new Error(`no gateway served ${cid}/manifest.json — ${errors.join('; ')}`)
}

async function main() {
  const cid = required('MINIAPP_CID')
  const expected = required('MINIAPP_MANIFEST_HASH').toLowerCase()
  const name = process.env.MINIAPP_NAME || 'Token Mint'
  const description = process.env.MINIAPP_DESCRIPTION || ''
  const category = Number(process.env.MINIAPP_CATEGORY ?? 2)
  const approve = process.env.MINIAPP_APPROVE === '1'

  const [signer] = await ethers.getSigners()
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const deployments = require(`../../deployments/${network.name}-chain${chainId}-v2.json`)
  const address = deployments.contracts?.miniAppRegistry
  if (!address) throw new Error(`no miniAppRegistry recorded for ${network.name} (chain ${chainId})`)

  console.log(`\nnetwork    ${network.name} (${chainId})`)
  console.log(`registry   ${address}`)
  console.log(`signer     ${signer.address}`)

  // 1. The bytes must be fetchable AND hash to what we were told, before anything is written.
  const served = await fetchManifestHash(cid)
  console.log(`\ngateway    ${served.gateway} served ${served.bytes.length} bytes`)
  console.log(`hash       ${served.hash}`)
  if (served.hash.toLowerCase() !== expected) {
    throw new Error(`manifest hash mismatch — gateway serves ${served.hash}, expected ${expected}`)
  }
  console.log('           matches the published manifestHash')

  const registry = new ethers.Contract(address, REGISTRY_ABI, signer)

  // 2. Submit, or add a version to an existing listing.
  let id = await registry.idByName(name)
  if (id === 0n) {
    console.log(`\nsubmitApp("${name}", …, category ${category}) …`)
    const tx = await registry.submitApp(name, description, category, cid, served.hash)
    const receipt = await tx.wait()
    id = await registry.idByName(name)
    console.log(`  id ${id} — ${receipt.hash}`)
  } else {
    const current = await registry.getApp(id)
    if (current.approved.cid === cid && current.approved.manifestHash.toLowerCase() === expected) {
      console.log(`\nalready approved as id ${id} at this exact package — nothing to do`)
      return
    }
    console.log(`\nsubmitUpdate(${id}, …) — "${name}" is already listed`)
    const tx = await registry.submitUpdate(id, cid, served.hash)
    console.log(`  ${(await tx.wait()).hash}`)
  }

  if (!approve) {
    console.log('\nLeft Pending. Set MINIAPP_APPROVE=1 to approve (needs APP_CURATOR_ROLE).')
    return
  }

  // 3. Approve against the tuple AS IT STANDS RIGHT NOW — see property 1 in the header.
  const role = await registry.APP_CURATOR_ROLE()
  if (!(await registry.hasRole(role, signer.address))) {
    throw new Error(`${signer.address} does not hold APP_CURATOR_ROLE on ${network.name}`)
  }
  const app = await registry.getApp(id)
  const proposedHash = app.proposed.manifestHash
  if (proposedHash.toLowerCase() !== expected) {
    throw new Error(
      `proposed tuple moved: chain holds ${proposedHash}, reviewed ${expected} — refusing to approve`,
    )
  }
  console.log(`\napproveApp(${id}, ${proposedHash}) …`)
  const tx = await registry.approveApp(id, proposedHash)
  console.log(`  ${(await tx.wait()).hash}`)

  const final = await registry.getApp(id)
  console.log(`\nid ${final.id} "${final.name}"`)
  // Status: 0 Pending · 1 Approved · 2 Suspended · 3 Deprecated (terminal).
  console.log(`  status      ${final.status} (1 = Approved)`)
  // `launchable` is the SERVING decision, not `status` — a Pending record with a prior approval
  // is a live app whose update is in review (FR-003). Read it, never re-derive it.
  console.log(`  launchable  ${final.launchable}`)
  console.log(`  approved    v${final.approved.version} ${final.approved.cid}`)
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`)
  process.exitCode = 1
})
