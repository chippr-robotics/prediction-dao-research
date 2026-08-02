/**
 * Grant the mini-app vendor tier the MiniAppRegistry requires (spec 073, operator action).
 *
 * `submitApp` / `submitUpdate` gate on `getActiveTier(vendor, membershipRole) >= minTier` — Silver
 * on the deployed registries. A FairWins service account publishing FIRST-PARTY packages has to
 * clear the same gate as any third party, and there is no reason for the platform to buy a
 * membership from itself, so an operator with ROLE_MANAGER_ROLE grants it instead.
 *
 * Reads the floor off the registry rather than taking a tier argument: the gate is the registry's
 * to define, and a hardcoded "Silver" here would drift the day `setMinTier` is used.
 *
 * NOTE ON EXPIRY. `isLaunchable` does NOT read membership — it is vendor + status + an approved
 * CID — so an expired grant never takes a published app offline. What it blocks is the vendor's
 * next `submitUpdate`. That is why this defaults to a year rather than something unbounded: the
 * failure mode is a refused update with a clear revert, not a dark catalog.
 *
 *   MINIAPP_VENDOR        vendor address (default: the signer)
 *   MINIAPP_GRANT_DAYS    duration in days (default 365)
 *
 *   npx hardhat run scripts/miniapps/grant-vendor-tier.js --network polygon
 */
const { ethers, network } = require('hardhat')

const TIERS = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum']
const REG = [
  'function membershipManager() view returns (address)',
  'function membershipRole() view returns (bytes32)',
  'function minTier() view returns (uint8)',
]
const MM = [
  'function ROLE_MANAGER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function getActiveTier(address,bytes32) view returns (uint8)',
  'function grantMembership(address user, bytes32 role, uint8 tier, uint32 durationDays)',
]

async function main() {
  const [signer] = await ethers.getSigners()
  const chainId = Number((await ethers.provider.getNetwork()).chainId)
  const deployments = require(`../../deployments/${network.name}-chain${chainId}-v2.json`)
  const registryAddress = deployments.contracts?.miniAppRegistry
  if (!registryAddress) throw new Error(`no miniAppRegistry recorded for ${network.name} (chain ${chainId})`)

  const vendor = process.env.MINIAPP_VENDOR || signer.address
  const days = Number(process.env.MINIAPP_GRANT_DAYS || 365)

  const registry = new ethers.Contract(registryAddress, REG, ethers.provider)
  const [mmAddress, role, minTier] = await Promise.all([
    registry.membershipManager(),
    registry.membershipRole(),
    registry.minTier(),
  ])
  const tier = Number(minTier)

  console.log(`\nnetwork    ${network.name} (${chainId})`)
  console.log(`registry   ${registryAddress}`)
  console.log(`signer     ${signer.address}`)
  console.log(`vendor     ${vendor}`)
  console.log(`\nregistry requires tier >= ${tier} (${TIERS[tier]}) on role ${role}`)

  const mm = new ethers.Contract(mmAddress, MM, signer)
  const current = Number(await mm.getActiveTier(vendor, role))
  console.log(`vendor currently holds tier ${current} (${TIERS[current]})`)
  if (current >= tier) {
    console.log('\nAlready eligible — nothing to do.')
    return
  }

  // Authority read before the write: "you do not hold ROLE_MANAGER_ROLE" is a better answer than
  // a bare `execution reverted` from AccessControl.
  const roleManager = await mm.ROLE_MANAGER_ROLE()
  if (!(await mm.hasRole(roleManager, signer.address))) {
    throw new Error(`${signer.address} does not hold ROLE_MANAGER_ROLE on membershipManager ${mmAddress}`)
  }

  console.log(`\ngrantMembership(${vendor}, role, ${TIERS[tier]}, ${days} days) …`)
  const tx = await mm.grantMembership(vendor, role, tier, days)
  console.log(`  tx ${tx.hash}`)
  const receipt = await tx.wait()
  console.log(`  mined in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`)

  const after = Number(await mm.getActiveTier(vendor, role))
  console.log(`\nvendor now holds tier ${after} (${TIERS[after]}) — ${after >= tier ? 'ELIGIBLE' : 'STILL BLOCKED'}`)
}

main().catch((e) => {
  console.error(`\n✗ ${e.shortMessage || e.message}`)
  process.exitCode = 1
})
