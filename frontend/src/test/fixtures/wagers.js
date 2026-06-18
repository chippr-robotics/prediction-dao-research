/**
 * Sample wager + lifecycle-event + receipt fixtures for the tax-report suites
 * (spec 016-wager-tax-report). Covers deposit/payout/refund directions across
 * multiple months and a transfer the user did NOT send (fee N/A case).
 *
 * Amounts are in token base units (USDC, 6 decimals). Block timestamps are in
 * seconds (chain convention); the report converts to ms.
 */

export const USER = '0x1111111111111111111111111111111111111111'
export const OTHER = '0x2222222222222222222222222222222222222222'
export const REGISTRY = '0x9999999999999999999999999999999999999999'
export const TOKEN = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // USDC (Polygon)
export const CHAIN_ID = 137

const sec = (...args) => Math.floor(Date.UTC(...args) / 1000)

/** blockNumber → unix seconds */
export const BLOCKS = {
  100: sec(2026, 0, 15), // Jan 15 2026 — wager A created
  110: sec(2026, 0, 16), // Jan 16 — wager A accepted
  120: sec(2026, 0, 20), // Jan 20 — wager B created
  130: sec(2026, 0, 21), // Jan 21 — wager B accepted (user)
  140: sec(2026, 2, 5), //  Mar 5  — wager C created
  150: sec(2026, 2, 6), //  Mar 6  — wager C refunded
  200: sec(2026, 1, 20), // Feb 20 — wager A payout
}

/** txHash → receipt (from = the EOA that sent the tx; gas in wei) */
export const RECEIPTS = {
  '0xa1': { from: USER, gasUsed: 120000n, effectiveGasPrice: 30000000000n, blockNumber: 100 },
  '0xa2': { from: OTHER, gasUsed: 90000n, effectiveGasPrice: 30000000000n, blockNumber: 110 },
  '0xa3': { from: USER, gasUsed: 80000n, effectiveGasPrice: 30000000000n, blockNumber: 200 },
  '0xb1': { from: OTHER, gasUsed: 120000n, effectiveGasPrice: 25000000000n, blockNumber: 120 },
  '0xb2': { from: USER, gasUsed: 90000n, effectiveGasPrice: 25000000000n, blockNumber: 130 },
  '0xc1': { from: USER, gasUsed: 120000n, effectiveGasPrice: 20000000000n, blockNumber: 140 },
  '0xc2': { from: OTHER, gasUsed: 70000n, effectiveGasPrice: 20000000000n, blockNumber: 150 },
}

/** wagerId → context (mirrors WagerRepository fields used by the report) */
export const WAGERS = {
  1: { id: '1', creator: USER, participants: [USER, OTHER], stakeAmount: '100000000', stakeTokenAddress: TOKEN },
  2: { id: '2', creator: OTHER, participants: [OTHER, USER], stakeAmount: '50000000', stakeTokenAddress: TOKEN },
  3: { id: '3', creator: USER, participants: [USER, OTHER], stakeAmount: '30000000', stakeTokenAddress: TOKEN },
}

/** wagerId → ordered lifecycle events (args keyed by name for readability) */
export const EVENTS = {
  1: [
    { name: 'WagerCreated', transactionHash: '0xa1', blockNumber: 100, args: { wagerId: '1', creator: USER, opponent: OTHER, token: TOKEN, creatorStake: '100000000', opponentStake: '100000000' } },
    { name: 'WagerAccepted', transactionHash: '0xa2', blockNumber: 110, args: { wagerId: '1', opponent: OTHER } },
    { name: 'PayoutClaimed', transactionHash: '0xa3', blockNumber: 200, args: { wagerId: '1', winner: USER, amount: '200000000' } },
  ],
  2: [
    { name: 'WagerCreated', transactionHash: '0xb1', blockNumber: 120, args: { wagerId: '2', creator: OTHER, opponent: USER, token: TOKEN, creatorStake: '50000000', opponentStake: '50000000' } },
    { name: 'WagerAccepted', transactionHash: '0xb2', blockNumber: 130, args: { wagerId: '2', opponent: USER } },
  ],
  3: [
    { name: 'WagerCreated', transactionHash: '0xc1', blockNumber: 140, args: { wagerId: '3', creator: USER, opponent: OTHER, token: TOKEN, creatorStake: '30000000', opponentStake: '30000000' } },
    { name: 'WagerRefunded', transactionHash: '0xc2', blockNumber: 150, args: { wagerId: '3', creator: USER, opponent: OTHER } },
  ],
}

/**
 * A fixture-backed dataSource matching the interface reportBuilder expects.
 * The real app wires these to WagerRepository (enumeration) + an ethers
 * provider (events/blocks/receipts).
 */
export function makeFixtureDataSource() {
  return {
    async enumerateWagers() {
      return Object.values(WAGERS)
    },
    async getWagerEvents(wagerId) {
      return EVENTS[wagerId] || []
    },
    async getBlock(blockNumber) {
      return { timestamp: BLOCKS[blockNumber] }
    },
    async getTransactionReceipt(txHash) {
      return RECEIPTS[txHash] || null
    },
  }
}
