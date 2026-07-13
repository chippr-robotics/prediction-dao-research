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

/**
 * Emit a plain-JSON ABI next to a hand-maintained `export const X_ABI = [ ... ]`
 * JS ABI module, so the subgraph (and any other JSON consumer) reads a generated
 * artifact rather than a hand-copied one (constitution V). The JS ABI body is a
 * JSON array literal, so we slice from the first `[` to the last `]` and validate
 * by parsing before writing.
 */
function emitAbiJson({ jsAbiPath, jsonAbiPath }) {
  if (!fs.existsSync(jsAbiPath)) {
    console.warn(`ABI source not found, skipping JSON emit: ${jsAbiPath}`)
    return
  }
  const src = fs.readFileSync(jsAbiPath, 'utf8')
  const start = src.indexOf('[')
  const end = src.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not locate ABI array literal in ${jsAbiPath}`)
  }
  const abi = JSON.parse(src.slice(start, end + 1)) // validates it is real JSON
  fs.writeFileSync(jsonAbiPath, JSON.stringify(abi, null, 2) + '\n')
  console.log(`Emitted JSON ABI: ${jsonAbiPath}`)
}

function findDeploymentFile({ deploymentsDir, network, chainId }) {
  // Prefer v2 file (P2P betting architecture)
  const v2 = path.join(deploymentsDir, `${network}-chain${chainId}-v2.json`)
  if (fs.existsSync(v2)) return v2

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

/**
 * Optionally scope a regex update to a named block (e.g. AMOY_CONTRACTS = { ... }).
 * If blockName is null, behaves as before (updates first occurrence anywhere).
 */
function updateObjectLiteralValue(source, key, newValueLiteral, blockName = null) {
  if (blockName) {
    // Find the named block and constrain the update to its body.
    const blockStartRe = new RegExp(`(?:const|let|var)\\s+${blockName}\\s*=\\s*\\{`)
    const startMatch = blockStartRe.exec(source)
    if (!startMatch) {
      throw new Error(`Block ${blockName} not found in contracts file`)
    }
    const bodyStart = startMatch.index + startMatch[0].length
    // Find matching closing brace by depth tracking
    let depth = 1
    let bodyEnd = bodyStart
    for (let i = bodyStart; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { bodyEnd = i; break }
      }
    }
    const before = source.slice(0, bodyStart)
    const block = source.slice(bodyStart, bodyEnd)
    const after = source.slice(bodyEnd)

    // Trailing `// comment` after the value must be tolerated, else the `$`
    // anchor fails to match and the key is wrongly treated as missing → a
    // duplicate gets inserted (e.g. sanctionsGuard/polymarketAdapter).
    const re = new RegExp(`(^\\s*${key}\\s*:\\s*)([^,\\n]+)(\\s*,?)(\\s*\\/\\/[^\\n]*)?$`, 'm')
    if (re.test(block)) {
      const updated = block.replace(re, `$1${newValueLiteral}$3$4`)
      return before + updated + after
    }
    // Insert at end of block (before closing brace)
    const line = `  ${key}: ${newValueLiteral},\n`
    return before + block + line + after
  }

  // Matches: <spaces>key: <value>,  (optionally followed by a // comment, which
  // must be tolerated so the key isn't treated as missing and re-inserted).
  // key is assumed to be a simple identifier (no quotes) as used in contracts.js.
  const re = new RegExp(`(^\\s*${key}\\s*:\\s*)([^,\\n]+)(\\s*,?)(\\s*\\/\\/[^\\n]*)?$`, 'm')
  if (re.test(source)) {
    return source.replace(re, `$1${newValueLiteral}$3$4`)
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

/**
 * Map chainId to the corresponding contracts block name in contracts.js.
 * Returns null if no block is known for this chain (caller falls back to whole-file update).
 */
function blockNameForChain(chainId) {
  const map = {
    63: 'MORDOR_CONTRACTS',
    80002: 'AMOY_CONTRACTS',
    137: 'POLYGON_CONTRACTS',
    1337: 'HARDHAT_CONTRACTS',
    31337: 'HARDHAT_CONTRACTS',
  }
  return map[chainId] || null
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const repoRoot = path.join(__dirname, '..', '..')
  const deploymentsDir = path.join(repoRoot, 'deployments')

  const network = args.network || 'amoy'
  const chainId = Number.isFinite(args.chainId) ? args.chainId : 80002

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
  const isV2 = Boolean(deployed.wagerRegistry || deployed.membershipManager && deployed.keyRegistry)

  let source = fs.readFileSync(contractsFile, 'utf8')

  // Build mapping. v2 = lean P2P architecture; v1 = legacy full futarchy stack.
  const mapping = isV2
    ? {
        wagerRegistry: deployed.wagerRegistry,
        membershipManager: deployed.membershipManager,
        membershipVoucher: deployed.membershipVoucher,
        voucherBatchMinter: deployed.voucherBatchMinter,
        keyRegistry: deployed.keyRegistry,
        sanctionsGuard: deployed.sanctionsGuard,
        tokenFactory: deployed.tokenFactory, // spec 028 — token issuance (only present where deployed)
        externalDAORegistry: deployed.externalDAORegistry, // spec 030 — ClearPath external-DAO registry
        backupPointerRegistry: deployed.backupPointerRegistry, // spec 032 — encrypted-backup pointer registry
        wagerPoolFactory: deployed.wagerPoolFactory, // spec 034 — WagerPools factory, address-based (only where deployed)
        callsignRegistry: deployed.callsignRegistry, // spec 054 — %callsign naming registry (only where deployed)
        safeProposalHub: deployed.safeProposalHub, // spec 043 — Safe custody proposal broadcaster (only where deployed)
        safePolicyGuard: deployed.safePolicyGuard, // spec 049 — multisig policy engine guard (only where deployed)
        policyGuardSetup: deployed.policyGuardSetup, // spec 049 — Safe.setup policy attach helper (only where deployed)
        entryPoint: deployed.entryPoint, // spec 041 — ERC-4337 EntryPoint v0.6 (canonical or self-deployed)
        accountFactory: deployed.accountFactory, // spec 041 — deterministic CoinbaseSmartWalletFactory (same address on every network)
        p256Verifier: deployed.p256Verifier, // spec 041 — only on networks needing an external P-256 verifier
        polymarketAdapter: deployed.polymarketAdapter,
        chainlinkDataFeedAdapter: deployed.chainlinkDataFeedAdapter,
        chainlinkFunctionsAdapter: deployed.chainlinkFunctionsAdapter,
        umaAdapter: deployed.umaAdapter,
        paymentToken: deployment.paymentToken,
        wmatic: deployment.wmatic,
      }
    : {
        // v1 mapping (kept for legacy Mordor reads)
        tieredRoleManager: deployed.tieredRoleManager,
        roleManager: deployed.tieredRoleManager,
        roleManagerCore: deployed.roleManagerCore || deployed.tieredRoleManager,
        tierRegistry: deployed.tierRegistry,
        usageTracker: deployed.usageTracker,
        membershipManager: deployed.membershipManager,
        paymentProcessor: deployed.paymentProcessor,
        membershipPaymentManager: deployed.membershipPaymentManager,
        welfareRegistry: deployed.welfareRegistry,
        proposalRegistry: deployed.proposalRegistry,
        marketFactory: deployed.marketFactory,
        privacyCoordinator: deployed.privacyCoordinator,
        oracleResolver: deployed.oracleResolver,
        ragequitModule: deployed.ragequitModule,
        futarchyGovernor: deployed.futarchyGovernor,
        tokenMintFactory: deployed.tokenMintFactory,
        daoFactory: deployed.daoFactory,
        ctf1155: deployed.ctf1155,
        friendGroupMarketFactory: deployed.friendGroupMarketFactory,
        marketCorrelationRegistry: deployed.marketCorrelationRegistry,
        nullifierRegistry: deployed.nullifierRegistry,
      }

  // Determine target block in contracts.js (multi-network layout). If the file
  // doesn't have a per-chain block, blockName stays null and we update globally
  // (preserves backwards compatibility with the test fixture).
  const deploymentChainId = Number(deployment.chainId) || chainId
  let blockName = blockNameForChain(deploymentChainId)
  if (blockName) {
    const hasBlock = new RegExp(`(?:const|let|var)\\s+${blockName}\\s*=\\s*\\{`).test(source)
    if (!hasBlock) blockName = null
  }

  for (const [key, value] of Object.entries(mapping)) {
    if (!value) continue
    source = updateObjectLiteralValue(source, key, `'${value}'`, blockName)
  }

  // Keep deployer in sync too (use explicit field if present).
  if (deployment.deployer) {
    source = updateObjectLiteralValue(source, 'deployer', `'${deployment.deployer}'`, blockName)
  }

  fs.writeFileSync(contractsFile, source)

  console.log(`Synced frontend contracts from: ${deploymentFile}`)
  console.log(`Updated: ${contractsFile}`)

  // Emit the JSON ABI the subgraph consumes (generated artifact, not hand-copied).
  const abisDir = path.join(repoRoot, 'frontend', 'src', 'abis')
  emitAbiJson({
    jsAbiPath: path.join(abisDir, 'WagerRegistry.js'),
    jsonAbiPath: path.join(abisDir, 'WagerRegistry.json'),
  })
}

main()
