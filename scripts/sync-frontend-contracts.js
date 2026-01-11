#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--network') out.network = argv[++i]
    else if (a === '--chainId') out.chainId = Number(argv[++i])
    else if (a === '--deploymentFile') out.deploymentFile = argv[++i]
    else if (a === '--contractsFile') out.contractsFile = argv[++i]
  }
  return out
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function findDeploymentFile({ deploymentsDir, network, chainId }) {
  const explicit = path.join(deploymentsDir, `${network}-chain${chainId}-deterministic-deployment.json`)
  if (fs.existsSync(explicit)) return explicit

  const fallback = path.join(deploymentsDir, `${network}-deployment.json`)
  if (fs.existsSync(fallback)) return fallback

  // As a last resort, pick newest file that matches the network prefix.
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.startsWith(`${network}-`) && f.endsWith('.json'))
    .map((f) => path.join(deploymentsDir, f))

  if (files.length === 0) return null

  files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
    } catch {
      return 0
    }
  })

  return files[0]
}

function updateObjectLiteralValue(source, key, newValueLiteral) {
  // Matches: <spaces>key: <value>,
  // key is assumed to be a simple identifier (no quotes) as used in contracts.js.
  const re = new RegExp(`(^\\s*${key}\\s*:\\s*)([^,\\n]+)(\\s*,?)$`, 'm')
  if (re.test(source)) {
    return source.replace(re, `$1${newValueLiteral}$3`)
  }

  // Insert before closing brace of DEPLOYED_CONTRACTS.
  const insertionPoint = source.indexOf('}\n\n/**')
  if (insertionPoint === -1) {
    throw new Error(`Could not find insertion point to add ${key} in contracts.js`)
  }

  const before = source.slice(0, insertionPoint)
  const after = source.slice(insertionPoint)
  const line = `  ${key}: ${newValueLiteral},\n`
  return `${before}${line}${after}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const repoRoot = path.join(__dirname, '..')
  const deploymentsDir = path.join(repoRoot, 'deployments')

  const network = args.network || 'mordor'
  const chainId = Number.isFinite(args.chainId) ? args.chainId : 63

  const deploymentFile = args.deploymentFile
    ? path.resolve(repoRoot, args.deploymentFile)
    : findDeploymentFile({ deploymentsDir, network, chainId })

  if (!deploymentFile || !fs.existsSync(deploymentFile)) {
    throw new Error(
      `Deployment JSON not found. Looked for ${network} chainId=${chainId} in ${deploymentsDir}. ` +
        `You can pass --deploymentFile <path>.`
    )
  }

  const contractsFile = args.contractsFile
    ? path.resolve(repoRoot, args.contractsFile)
    : path.join(repoRoot, 'frontend', 'src', 'config', 'contracts.js')

  const deployment = readJson(deploymentFile)
  const deployed = deployment.contracts || {}

  let source = fs.readFileSync(contractsFile, 'utf8')

  // Update known keys used by the frontend.
  const mapping = {
    // New naming
    tieredRoleManager: deployed.tieredRoleManager,
    // Existing frontend keys
    welfareRegistry: deployed.welfareRegistry,
    proposalRegistry: deployed.proposalRegistry,
    marketFactory: deployed.marketFactory,
    privacyCoordinator: deployed.privacyCoordinator,
    oracleResolver: deployed.oracleResolver,
    ragequitModule: deployed.ragequitModule,
    futarchyGovernor: deployed.futarchyGovernor,

    // Factory contracts
    tokenMintFactory: deployed.tokenMintFactory,
    daoFactory: deployed.daoFactory,

    // Aliases (same address)
    roleManager: deployed.tieredRoleManager,
    roleManagerCore: deployed.tieredRoleManager,
  }

  for (const [key, value] of Object.entries(mapping)) {
    if (!value) continue
    source = updateObjectLiteralValue(source, key, `'${value}'`)
  }

  // Keep deployer in sync too (use explicit field if present).
  if (deployment.deployer) {
    source = updateObjectLiteralValue(source, 'deployer', `'${deployment.deployer}'`)
  }

  fs.writeFileSync(contractsFile, source)

  console.log(`Synced frontend contracts from: ${deploymentFile}`)
  console.log(`Updated: ${contractsFile}`)
}

main()
