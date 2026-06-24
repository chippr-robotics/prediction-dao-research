import { ethers } from 'ethers'
import { GOVERNOR_READ_ABI, VOTING_TOKEN_READ_ABI } from '../../abis/externalDAORegistry'

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
