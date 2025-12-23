const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Helper function to submit and activate a proposal
 * @param {Object} contracts - System contracts
 * @param {Object} accounts - Test accounts
 * @param {Object} proposalData - Proposal parameters
 * @returns {BigInt} proposalId
 */
async function submitAndActivateProposal(contracts, accounts, proposalData) {
  const { proposalRegistry, futarchyGovernor } = contracts;
  const { proposer, owner } = accounts;

  const tx = await proposalRegistry
    .connect(proposer)
    .submitProposal(
      proposalData.title,
      proposalData.description,
      proposalData.fundingAmount,
      proposalData.recipient,
      proposalData.metricId,
      proposalData.token || ethers.ZeroAddress,
      proposalData.startDate || 0,
      proposalData.deadline,
      { value: proposalData.bond }
    );

  const receipt = await tx.wait();
  const event = receipt.logs.find(log => {
    try {
      return proposalRegistry.interface.parseLog(log).name === "ProposalSubmitted";
    } catch {
      return false;
    }
  });
  
  const proposalId = event ? proposalRegistry.interface.parseLog(event).args.proposalId : 0n;

  // Wait for review period to end (7 days)
  await time.increase(7 * 24 * 3600 + 1); // 7 days + 1 second

  await proposalRegistry
    .connect(owner)
    .activateProposal(proposalId);

  return proposalId;
}

/**
 * Execute trades from multiple traders on a market
 * @param {Object} marketFactory - Market factory contract
 * @param {Array} trades - Array of trade objects {signer, buyPass, amount}
 * @param {BigInt} marketId - Market identifier
 */
async function executeTrades(marketFactory, trades, marketId) {
  for (const trade of trades) {
    await marketFactory
      .connect(trade.signer)
      .buyTokens(marketId, trade.buyPass, trade.amount, {
        value: trade.amount
      });
  }
}

/**
 * Complete oracle resolution process including challenge period
 * @param {Object} oracleResolver - Oracle resolver contract
 * @param {Object} accounts - Test accounts with owner and reporter
 * @param {BigInt} proposalId - Proposal identifier
 * @param {BigInt} value - Welfare metric value
 * @param {String} evidence - Evidence string or IPFS hash
 */
async function completeOracleResolution(oracleResolver, accounts, proposalId, value, evidence) {
  const { owner, reporter } = accounts;

  // Reporter submits the report
  await oracleResolver
    .connect(reporter)
    .submitReport(proposalId, value, evidence || "Integration test evidence");

  // Wait for challenge period to pass (3 days)
  await time.increase(3 * 24 * 3600);

  // Owner finalizes the resolution
  await oracleResolver
    .connect(owner)
    .finalizeResolution(proposalId);
}

/**
 * Get future timestamp for deadlines
 * @param {Number} daysFromNow - Number of days in the future
 * @returns {Number} Unix timestamp
 */
async function getFutureTimestamp(daysFromNow) {
  const currentTime = await time.latest();
  return currentTime + (daysFromNow * 24 * 3600);
}

/**
 * Advance time by specified number of days
 * @param {Number} days - Number of days to advance
 */
async function advanceDays(days) {
  await time.increase(days * 24 * 3600);
}

/**
 * Create default proposal data object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Proposal data
 */
async function createProposalData(overrides = {}) {
  const defaults = {
    title: "Integration Test Proposal",
    description: "Testing complete flow",
    fundingAmount: ethers.parseEther("1000"),
    recipient: null, // Must be provided
    metricId: 0,
    token: ethers.ZeroAddress,
    startDate: 0,
    deadline: await getFutureTimestamp(90),
    bond: ethers.parseEther("50")
  };

  return { ...defaults, ...overrides };
}

/**
 * Wait for market trading period to end
 * @param {Number} tradingPeriodDays - Trading period in days (default 14)
 */
async function waitForTradingPeriodEnd(tradingPeriodDays = 14) {
  await advanceDays(tradingPeriodDays);
}

/**
 * Verify proposal state
 * @param {Object} proposalRegistry - Proposal registry contract
 * @param {BigInt} proposalId - Proposal identifier
 * @param {Number} expectedStatus - Expected status code
 */
async function verifyProposalState(proposalRegistry, proposalId, expectedStatus) {
  const proposal = await proposalRegistry.getProposal(proposalId);
  return proposal.status === expectedStatus;
}

/**
 * Create trade configurations for multiple traders
 * @param {Array} traders - Array of signer objects
 * @param {Array} directions - Array of booleans (true for PASS, false for FAIL)
 * @param {Array} amounts - Array of amounts (as strings or BigInt)
 * @returns {Array} Array of trade objects
 */
function createTradeConfigs(traders, directions, amounts) {
  return traders.map((trader, index) => ({
    signer: trader,
    buyPass: directions[index],
    amount: typeof amounts[index] === 'string' ? ethers.parseEther(amounts[index]) : amounts[index]
  }));
}

module.exports = {
  submitAndActivateProposal,
  executeTrades,
  completeOracleResolution,
  getFutureTimestamp,
  advanceDays,
  createProposalData,
  waitForTradingPeriodEnd,
  verifyProposalState,
  createTradeConfigs
};
