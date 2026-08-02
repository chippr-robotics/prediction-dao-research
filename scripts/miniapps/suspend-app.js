/**
 * Suspend (or reinstate) a listing on the MiniAppRegistry — spec 073, curator operation.
 *
 * Suspension is the curator's answer to "this listing must stop being served, now": `launchable`
 * goes false immediately and the host refuses the launch, without touching the package tuple, so
 * the decision is fully reversible by re-approving the same content.
 *
 * Reinstatement is deliberately NOT a `reinstate(id)` here. It is `approveApp(id, manifestHash)` —
 * the same content-committed approval as any other, because the reason a listing was suspended may
 * well be the package, and re-serving it is an approval decision that has to name the bytes.
 *
 *   MINIAPP_APP_ID       required, the listing id
 *   MINIAPP_REINSTATE    "1" to re-approve instead of suspend (also needs MINIAPP_MANIFEST_HASH)
 *   MINIAPP_MANIFEST_HASH  required when reinstating; must equal the proposed tuple's hash
 *
 *   npx hardhat run scripts/miniapps/suspend-app.js --network mordor
 */
const { ethers, network } = require('hardhat')

const ABI = [
  'function APP_CURATOR_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function appCount() view returns (uint256)',
  'function getApp(uint256) view returns (tuple(uint256 id,address vendor,string name,string description,uint8 category,uint8 status,bool launchable,tuple(string cid,bytes32 manifestHash,uint64 version) approved,tuple(string cid,bytes32 manifestHash,uint64 version) proposed,uint64 submittedAt,uint64 approvedAt,uint64 updatedAt))',
  'function suspendApp(uint256)',
  'function approveApp(uint256,bytes32)',
]

// Mirrors IMiniAppRegistry.Status EXACTLY (Pending=0, Approved=1, Suspended=2, Deprecated=3).
// Getting this wrong is worse than printing the raw number: a curator reads the word, and a script
// that calls a suspended listing "Pending" tells them their suspension did not take.
const STATUS = ['Pending', 'Approved', 'Suspended', 'Deprecated']

function required(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

async function main() {
  const appId = Number(required('MINIAPP_APP_ID'))
  const reinstate = process.env.MINIAPP_REINSTATE === '1'

  const [signer] = await ethers.getSigners()
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const deployments = require(`../../deployments/${network.name}-chain${chainId}-v2.json`)
  const address = deployments.contracts?.miniAppRegistry
  if (!address) throw new Error(`no miniAppRegistry recorded for ${network.name} (chain ${chainId})`)

  const registry = new ethers.Contract(address, ABI, signer)
  console.log(`\nnetwork    ${network.name} (${chainId})`)
  console.log(`registry   ${address}`)
  console.log(`signer     ${signer.address}`)

  // Authority read first: a revert from the contract is an honest answer, but a curator who is
  // about to be told "execution reverted" deserves to know it was the role and not the app.
  const role = await registry.APP_CURATOR_ROLE()
  if (!(await registry.hasRole(role, signer.address))) {
    throw new Error(`${signer.address} does not hold APP_CURATOR_ROLE on ${network.name}`)
  }

  const before = await registry.getApp(appId)
  console.log(`\n#${before.id} "${before.name}"`)
  console.log(`  status     ${STATUS[Number(before.status)] ?? before.status} (launchable ${before.launchable})`)
  console.log(`  approved   ${before.approved.cid} v${before.approved.version}`)
  console.log(`  proposed   ${before.proposed.cid} v${before.proposed.version}`)

  let tx
  if (reinstate) {
    const expected = required('MINIAPP_MANIFEST_HASH').toLowerCase()
    // Re-read at execution time and refuse on any drift — the same rule approveApp itself enforces
    // on-chain. Checking here too turns a StaleProposal revert into a sentence.
    const proposed = String(before.proposed.manifestHash).toLowerCase()
    if (proposed !== expected) {
      throw new Error(`proposed tuple is ${proposed}, not the ${expected} you named — refusing to approve`)
    }
    console.log(`\napproveApp(${appId}, ${expected}) …`)
    tx = await registry.approveApp(appId, expected)
  } else {
    console.log(`\nsuspendApp(${appId}) …`)
    tx = await registry.suspendApp(appId)
  }
  console.log(`  tx ${tx.hash}`)
  const receipt = await tx.wait()
  console.log(`  mined in block ${receipt.blockNumber}`)

  const after = await registry.getApp(appId)
  console.log(`\n#${after.id} is now ${STATUS[Number(after.status)] ?? after.status} (launchable ${after.launchable})`)
}

main().catch((e) => {
  console.error(`\n✗ ${e.shortMessage || e.message}`)
  process.exitCode = 1
})
