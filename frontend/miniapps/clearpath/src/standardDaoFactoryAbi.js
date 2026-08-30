// Spec 030 pillar A — the native standard-DAO factory's write surface.
// Hand-maintained, like externalDAORegistryAbi.js (the repo does not auto-generate frontend ABIs; the
// sync script only moves addresses). Refresh from the compiled artifact after contract changes.

/**
 * StandardDAOFactory (UUPS proxy, deployment key `standardDaoFactory`).
 *
 * `createDAO` takes ONE tuple, in this exact field order — ethers encodes a struct positionally, so a
 * reordered object here produces a valid transaction that builds the wrong DAO (a swapped
 * votingDelay/votingPeriod would sail through every client-side check). Mirror
 * `IStandardDAOFactory.DAOParams` and nothing else.
 */
export const STANDARD_DAO_FACTORY_ABI = [
  'function createDAO((string name, string purpose, address votesToken, string tokenName, string tokenSymbol, uint256 initialSupply, uint48 votingDelay, uint32 votingPeriod, uint256 proposalThreshold, uint8 quorumPercent, uint256 timelockDelay) params) returns (uint256 id, address governor, address timelock, address token)',
  'function daoCount() view returns (uint256)',
  'function getDAO(uint256 id) view returns ((address governor, address timelock, address token, address creator, uint64 createdAt, bool tokenDeployed, string name))',
  'function getDAOsByCreator(address creator) view returns (uint256[])',
  'function isDAO(address governor) view returns (bool)',
  'function MAX_TIMELOCK_DELAY() view returns (uint256)',
  'function DAO_MEMBER_ROLE() view returns (bytes32)',
  'event StandardDAOCreated(uint256 indexed id, address indexed creator, address indexed governor, address timelock, address token, bool tokenDeployed, string name)',
]

/**
 * The DAO the transaction actually produced, read from the receipt's own log.
 *
 * Deliberately NOT the return value of `createDAO`: a transaction has no return value once mined, and
 * `submit` resolves at BROADCAST. The event is the only statement about what was created that survives
 * to confirmation time. Returns null when no matching log is present, which the caller must treat as
 * "created, but the addresses could not be read here" — never as a failure.
 */
export function parseCreatedDAO(iface, receipt) {
  for (const log of receipt?.logs ?? []) {
    let parsed
    try {
      parsed = iface.parseLog(log)
    } catch {
      continue // a log from another contract in the same transaction
    }
    if (parsed?.name !== 'StandardDAOCreated') continue
    return {
      id: parsed.args.id?.toString?.() ?? String(parsed.args.id),
      creator: parsed.args.creator,
      governor: parsed.args.governor,
      timelock: parsed.args.timelock,
      token: parsed.args.token,
      tokenDeployed: parsed.args.tokenDeployed,
      name: parsed.args.name,
    }
  }
  return null
}
