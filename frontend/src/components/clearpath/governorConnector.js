import { ethers } from 'ethers'
import {
  GOVERNOR_READ_ABI,
  VOTING_TOKEN_READ_ABI,
  ERC20_BALANCE_ABI,
  GOVERNOR_PROPOSAL_ABI,
  GOVERNOR_WRITE_ABI,
} from '../../abis/externalDAORegistry'

/**
 * Per-DAO extra treasury vaults that are NOT the OZ timelock. Some platforms (Olympia) hold funds in a separate
 * vault contract; the generic Governor connector can't infer it, so known vaults are overlaid here by
 * (chainId → governor-address-lowercased). Keep this small + verified — never guess an address.
 */
const EXTRA_TREASURIES = {
  63: {
    // Olympia DAO on Mordor — OlympiaTreasury (basefee vault), separate from the Governor's TimelockController.
    '0xb85dbc899472756470ef4033b9637ff8fa2fd23d': [
      { label: 'Olympia Treasury', address: '0x035b2e3c189B772e52F4C3DA6c45c84A3bB871bf' },
    ],
  },
}

/** Known extra (non-timelock) treasury vaults for a DAO, or [] if none. */
export function extraTreasuries(chainId, governorAddr) {
  const byChain = EXTRA_TREASURIES[Number(chainId)] || {}
  return byChain[String(governorAddr).toLowerCase()] || []
}

// Spec 030 (US3/US5) — the ClearPath connector for OpenZeppelin Governor DAOs. Reads any external (or native)
// Governor via the standard IGovernor ABI, so the same surface serves Olympia and any Governor-based DAO. All
// reads are real on-chain calls; nothing is fabricated. ClearPath holds no authority — management actions (a
// later step) are constructed here for the user to sign against the DAO's own contract.

/**
 * Pre-validate (client-side) that `address` looks like a Governor — mirrors the on-chain `_isGovernor` check the
 * registry enforces, so the UI can give fast feedback before the user pays for a register tx. The contract is
 * the source of truth. Returns `{ ok, name, reason }`.
 */
export async function validateGovernor(reader, address) {
  if (!reader) return { ok: false, reason: 'No provider available.' }
  if (!ethers.isAddress(address)) return { ok: false, reason: 'Not a valid address.' }
  const code = await reader.getCode(address)
  if (!code || code === '0x') return { ok: false, reason: 'No contract at this address (looks like a wallet).' }
  const gov = new ethers.Contract(address, GOVERNOR_READ_ABI, reader)
  // A real Governor answers these standard views; a random contract reverts.
  try {
    const mode = await gov.COUNTING_MODE()
    await gov.votingPeriod()
    let name = ''
    try { name = await gov.name() } catch { name = '' }
    if (!mode || mode.length === 0) return { ok: false, reason: 'Not a recognized governance contract.' }
    return { ok: true, name, reason: '' }
  } catch {
    return { ok: false, reason: 'Not a recognized governance contract (no IGovernor interface).' }
  }
}

/**
 * Read a Governor's live summary for the tracking view. Each field is read independently and degrades to null on
 * a missing/optional method (e.g. a Governor without a timelock), so a non-standard Governor still renders
 * truthfully rather than failing wholesale.
 */
export async function readGovernorSummary(reader, address) {
  const gov = new ethers.Contract(address, GOVERNOR_READ_ABI, reader)
  const safe = async (p) => { try { return await p } catch { return null } }

  const [name, tokenAddr, timelock, votingDelay, votingPeriod, proposalThreshold, countingMode, clockMode] =
    await Promise.all([
      safe(gov.name()),
      safe(gov.token()),
      safe(gov.timelock()),
      safe(gov.votingDelay()),
      safe(gov.votingPeriod()),
      safe(gov.proposalThreshold()),
      safe(gov.COUNTING_MODE()),
      safe(gov.CLOCK_MODE()),
    ])

  let tokenName = null
  let tokenSymbol = null
  if (tokenAddr && ethers.isAddress(tokenAddr) && tokenAddr !== ethers.ZeroAddress) {
    const t = new ethers.Contract(tokenAddr, VOTING_TOKEN_READ_ABI, reader)
    tokenName = await safe(t.name())
    tokenSymbol = await safe(t.symbol())
  }

  // Treasury = the timelock's native balance (the OZ Governor pattern: the timelock holds + executes funds).
  let treasuryNative = null
  if (timelock && ethers.isAddress(timelock) && timelock !== ethers.ZeroAddress) {
    treasuryNative = await safe(reader.getBalance(timelock))
  }

  return {
    name,
    tokenAddr,
    tokenName,
    tokenSymbol,
    timelock,
    treasuryNative,
    votingDelay: votingDelay != null ? votingDelay.toString() : null,
    votingPeriod: votingPeriod != null ? votingPeriod.toString() : null,
    proposalThreshold: proposalThreshold != null ? proposalThreshold.toString() : null,
    countingMode,
    clockMode,
  }
}

/**
 * Read native + USDC balances for a DAO's treasury vault(s) — the Governor's timelock plus any known extra vault
 * (e.g. OlympiaTreasury). Real on-chain reads; each balance degrades to null independently.
 */
export async function readTreasuries(reader, vaults, usdcAddr) {
  const safe = async (p) => { try { return await p } catch { return null } }
  let usdcDecimals = 6
  let usdcSymbol = 'USDC'
  let usdc = null
  if (usdcAddr && ethers.isAddress(usdcAddr)) {
    usdc = new ethers.Contract(usdcAddr, ERC20_BALANCE_ABI, reader)
    const d = await safe(usdc.decimals())
    if (d != null) usdcDecimals = Number(d)
    const s = await safe(usdc.symbol())
    if (s) usdcSymbol = s
  }
  return Promise.all(
    vaults.map(async (v) => {
      const native = await safe(reader.getBalance(v.address))
      const usdcBal = usdc ? await safe(usdc.balanceOf(v.address)) : null
      return {
        label: v.label,
        address: v.address,
        native,
        usdc: usdcBal,
        usdcSymbol,
        usdcDecimals,
      }
    })
  )
}

const PROPOSAL_CREATED_TOPIC = ethers.id(
  'ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)'
)
const PROPOSAL_IFACE = new ethers.Interface(GOVERNOR_PROPOSAL_ABI)

/**
 * Limited LIVE on-chain indexing for chains without a subgraph (Mordor/ETC): a bounded, chunked `eth_getLogs`
 * scan of the Governor's `ProposalCreated` events, newest-first, enriched with live `state` + `proposalVotes`.
 * Resilient: if the RPC rejects a chunk it stops and returns what it has (marked `partial`) rather than failing
 * wholesale; only a first-chunk failure yields `{ ok: false }`. Never fabricates — returns exactly what chain has.
 */
export async function fetchGovernorProposals(reader, governor, { lookbackBlocks = 500000, chunk = 50000, max = 50 } = {}) {
  if (!reader) return { ok: false, error: 'No provider.', proposals: [] }
  let current
  try {
    current = await reader.getBlockNumber()
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not read block number.', proposals: [] }
  }
  const floor = Math.max(0, current - lookbackBlocks)
  const govRead = new ethers.Contract(governor, [...GOVERNOR_READ_ABI, ...GOVERNOR_PROPOSAL_ABI], reader)
  const raw = []
  let scannedFrom = current
  let partial = false
  let firstChunk = true
  for (let to = current; to >= floor; to -= chunk) {
    const from = Math.max(floor, to - chunk + 1)
    try {
      const logs = await reader.getLogs({ address: governor, topics: [PROPOSAL_CREATED_TOPIC], fromBlock: from, toBlock: to })
      raw.push(...logs)
      scannedFrom = from
      firstChunk = false
    } catch (e) {
      if (firstChunk) return { ok: false, error: e?.shortMessage || e?.message || 'RPC rejected getLogs.', proposals: [] }
      partial = true
      break
    }
    if (raw.length >= max) { partial = true; break }
  }

  // newest first, enrich with live state + votes
  raw.reverse()
  const proposals = []
  for (const log of raw.slice(0, max)) {
    let parsed
    try { parsed = PROPOSAL_IFACE.parseLog(log) } catch { continue }
    const a = parsed.args
    const id = a.proposalId
    const state = await (async () => { try { return Number(await govRead.state(id)) } catch { return null } })()
    const votes = await (async () => {
      try {
        const [against, forV, abstain] = await govRead.proposalVotes(id)
        return { against: against.toString(), for: forV.toString(), abstain: abstain.toString() }
      } catch { return null }
    })()
    proposals.push({
      id: id.toString(),
      proposer: a.proposer,
      description: a.description,
      targets: a.targets,
      values: a.values.map((v) => v.toString()),
      calldatas: a.calldatas,
      descriptionHash: ethers.id(a.description),
      voteStart: a.voteStart.toString(),
      voteEnd: a.voteEnd.toString(),
      state,
      votes,
    })
  }
  return { ok: true, proposals, scannedFrom, scannedTo: current, partial }
}

// --- US5: user-signed management actions (the member signs; the external DAO's own rules gate authorization) ---

function writeContract(signer, governor) {
  return new ethers.Contract(governor, GOVERNOR_WRITE_ABI, signer)
}

export function castVote(signer, governor, proposalId, support) {
  return writeContract(signer, governor).castVote(proposalId, support)
}
export function queueProposal(signer, governor, p) {
  return writeContract(signer, governor).queue(p.targets, p.values, p.calldatas, p.descriptionHash)
}
export function executeProposal(signer, governor, p) {
  return writeContract(signer, governor).execute(p.targets, p.values, p.calldatas, p.descriptionHash)
}
export function proposeAction(signer, governor, { targets, values, calldatas, description }) {
  return writeContract(signer, governor).propose(targets, values, calldatas, description)
}
