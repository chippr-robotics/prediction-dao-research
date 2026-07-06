import { ethers } from 'ethers'
import {
  BRAVO_READ_ABI,
  BRAVO_TOKEN_ABI,
  BRAVO_WRITE_ABI,
  ERC20_BALANCE_ABI,
} from '../../../abis/externalDAORegistry'
import {
  getLogsRange,
  parseProposalLog,
  readTreasuries as ozReadTreasuries,
  extraTreasuries as ozExtraTreasuries,
  explainTxError as ozExplainTxError,
} from './ozGovernor'

// Spec 042 — GovernorBravo / Compound connector (framework 1). Serves Uniswap and any Bravo-style DAO through
// the shared connector interface (contracts/connector-interface.md), so the ClearPath UI + daoDataSource never
// branch on framework. All reads are real on-chain calls with honest degradation; ClearPath is non-custodial
// (actions are constructed for the member's signer against the DAO's own contract).

const safe = async (p) => {
  try {
    return await p
  } catch {
    return null
  }
}

/** Probe: a Bravo governor answers proposalCount()+quorumVotes() (OZ Governor exposes neither). */
export async function matches(reader, address) {
  if (!reader || !ethers.isAddress(address || '')) return false
  const code = await safe(reader.getCode(address))
  if (!code || code === '0x') return false
  const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
  const count = await safe(gov.proposalCount())
  const quorum = await safe(gov.quorumVotes())
  return count != null && quorum != null
}

/** Client-side pre-validation mirroring `matches`, returning `{ ok, name, reason }` for register-form feedback. */
export async function validate(reader, address) {
  if (!reader) return { ok: false, reason: 'No provider available.' }
  if (!ethers.isAddress(address)) return { ok: false, reason: 'Not a valid address.' }
  const code = await safe(reader.getCode(address))
  if (!code || code === '0x') return { ok: false, reason: 'No contract at this address (looks like a wallet).' }
  const ok = await matches(reader, address)
  if (!ok) return { ok: false, reason: 'Not a recognized Governor Bravo contract.' }
  const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
  const name = (await safe(gov.name())) || ''
  return { ok: true, name, reason: '' }
}

/** The governance token address — Bravo forks name the getter differently (token/comp/uni); probe in order. */
async function resolveToken(gov) {
  for (const g of ['token', 'comp', 'uni']) {
    const addr = await safe(gov[g]())
    if (addr && ethers.isAddress(addr) && addr !== ethers.ZeroAddress) return addr
  }
  return null
}

export async function readSummary(reader, address) {
  const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
  const [name, timelock, votingDelay, votingPeriod, proposalThreshold, quorumVotes] = await Promise.all([
    safe(gov.name()),
    safe(gov.timelock()),
    safe(gov.votingDelay()),
    safe(gov.votingPeriod()),
    safe(gov.proposalThreshold()),
    safe(gov.quorumVotes()),
  ])
  const tokenAddr = await resolveToken(gov)
  let tokenName = null
  let tokenSymbol = null
  if (tokenAddr) {
    const t = new ethers.Contract(tokenAddr, BRAVO_TOKEN_ABI, reader)
    tokenName = await safe(t.name())
    tokenSymbol = await safe(t.symbol())
  }
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
    quorumVotes: quorumVotes != null ? quorumVotes.toString() : null,
    // Bravo is block-clocked; there is no CLOCK_MODE/COUNTING_MODE. Report null truthfully.
    countingMode: null,
    clockMode: null,
  }
}

// Treasury reads reuse the OZ implementation (native + USDC per vault) against the Bravo timelock.
export const readTreasuries = ozReadTreasuries
export const extraTreasuries = ozExtraTreasuries
export const explainTxError = ozExplainTxError

/**
 * Live on-chain indexing for Bravo: scan `ProposalCreated` (same event signature/topic as OZ, so the OZ log
 * parser is reused), newest-first, enriched with live `state()` + `proposals(id)` tallies. Resilient to RPC
 * block-range caps (bounded/chunked); truthful partial/error — never fabricated.
 */
export async function fetchProposals(reader, address, { lookbackBlocks = 500000, chunk = 50000, max = 50 } = {}) {
  if (!reader) return { ok: false, error: 'No provider.', proposals: [] }
  let current
  try {
    current = await reader.getBlockNumber()
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not read block number.', proposals: [] }
  }
  const floor = Math.max(0, current - lookbackBlocks)
  const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
  const raw = []
  let scannedFrom = current
  let partial = false
  let firstChunk = true
  for (let to = current; to >= floor; to -= chunk) {
    const from = Math.max(floor, to - chunk + 1)
    try {
      const logs = await getLogsRange(reader, address, from, to)
      raw.push(...logs)
      scannedFrom = from
      firstChunk = false
    } catch (e) {
      if (firstChunk) return { ok: false, error: e?.shortMessage || e?.message || 'RPC rejected getLogs.', proposals: [] }
      partial = true
      break
    }
    if (raw.length >= max) {
      partial = true
      break
    }
  }
  raw.reverse()
  const proposals = []
  for (const log of raw.slice(0, max)) {
    let base
    try {
      base = parseProposalLog(log)
    } catch {
      continue
    }
    const state = await (async () => {
      try {
        return Number(await gov.state(base.id))
      } catch {
        return null
      }
    })()
    const votes = await (async () => {
      try {
        const p = await gov.proposals(base.id)
        return { against: p.againstVotes.toString(), for: p.forVotes.toString(), abstain: p.abstainVotes.toString() }
      } catch {
        return null
      }
    })()
    proposals.push({ ...base, state, votes })
  }
  return { ok: true, proposals, scannedFrom, scannedTo: current, partial }
}

/**
 * Per-user vote state. `getReceipt` gives hasVoted + support + the weight actually used; pre-vote voting power
 * (to decide eligibility) comes from the TOKEN's `getPriorVotes(account, startBlock)` when the token resolves.
 * Honest degradation to null anywhere a read is unavailable.
 */
export async function readVoterState(reader, address, proposal, account) {
  if (!account || !reader) return { hasVoted: null, votingPower: null, support: null }
  const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
  const receipt = await safe(gov.getReceipt(proposal.id, account))
  const hasVoted = receipt ? Boolean(receipt.hasVoted ?? receipt[0]) : null
  const support = receipt && hasVoted ? Number(receipt.support ?? receipt[1]) : null
  let votingPower = null
  if (hasVoted && receipt) {
    const w = receipt.votes ?? receipt[2]
    votingPower = w != null ? w.toString() : null
  } else if (proposal.voteStart != null) {
    const tokenAddr = await resolveToken(gov)
    if (tokenAddr) {
      const t = new ethers.Contract(tokenAddr, BRAVO_TOKEN_ABI, reader)
      const p = await safe(t.getPriorVotes(account, proposal.voteStart))
      votingPower = p != null ? p.toString() : null
    }
  }
  return { hasVoted, votingPower, support }
}

/** Queued-proposal execution ETA (unix seconds) from `proposals(id).eta`, or null if not queued/unavailable. */
export async function readProposalEta(reader, address, proposalId) {
  try {
    const gov = new ethers.Contract(address, BRAVO_READ_ABI, reader)
    const p = await gov.proposals(proposalId)
    const n = Number(p.eta)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

// --- member-signed actions (the member signs; the DAO's own rules gate authorization) ---

function writeContract(signer, address) {
  return new ethers.Contract(address, BRAVO_WRITE_ABI, signer)
}

export function castVote(signer, address, proposalId, support) {
  return writeContract(signer, address).castVote(proposalId, support)
}
// Bravo queue/execute take ONLY the proposal id (contrast OZ's targets/values/calldatas/descriptionHash).
export function queue(signer, address, p) {
  return writeContract(signer, address).queue(p.id)
}
export function execute(signer, address, p) {
  return writeContract(signer, address).execute(p.id)
}
// Bravo propose carries an extra `signatures` array (defaulted to empty strings when the builder omits it).
export function propose(signer, address, { targets, values, calldatas, description, signatures }) {
  const sigs = Array.isArray(signatures) && signatures.length === targets.length ? signatures : targets.map(() => '')
  return writeContract(signer, address).propose(targets, values, sigs, calldatas, description)
}

// Bravo timelocks hold funds directly — there is no ECIP-1112/1113 executor-gated vault to detect. Return null
// uniformly so ExternalDaoView can call detectTreasuryFunding across frameworks without branching.
export async function detectTreasuryFunding() {
  return null
}

/** The pluggable connector object (framework 1). */
export const governorBravoConnector = {
  framework: 1,
  matches,
  validate,
  readSummary,
  readTreasuries,
  extraTreasuries,
  detectTreasuryFunding,
  fetchProposals,
  readVoterState,
  readProposalEta,
  castVote,
  queue,
  execute,
  propose,
  explainTxError,
}
