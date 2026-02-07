import hre from "hardhat";
import { ZeroAddress, parseEther, toUtf8Bytes } from "ethers";

// Helper to get networkHelpers.time from Hardhat 3 connection
async function getTime() {
  const { networkHelpers } = await hre.network.connect();
  return networkHelpers.time;
}

/**
 * Helper function to submit and activate a proposal
 * @param {Object} contracts - System contracts
 * @param {Object} accounts - Test accounts
 * @param {Object} proposalData - Proposal parameters
 * @returns {BigInt} proposalId
 */
export async function submitAndActivateProposal(contracts, accounts, proposalData) {
  const { proposalRegistry, marketFactory, futarchyGovernor } = contracts;
  const { proposer, owner } = accounts;

  const tx = await proposalRegistry
    .connect(proposer)
    .submitProposal(
      proposalData.title,
      proposalData.description,
      proposalData.fundingAmount,
      proposalData.recipient,
      proposalData.metricId,
      proposalData.token || ZeroAddress,
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
  const time = await getTime();
  await time.increase(7 * 24 * 3600 + 1); // 7 days + 1 second

  await proposalRegistry
    .connect(owner)
    .activateProposal(proposalId);

  // Create governance proposal with market through FutarchyGovernor
  await futarchyGovernor
    .connect(owner)
    .createGovernanceProposal(
      proposalId,
      parseEther("1000"), // 1000 ETH liquidity
      parseEther("100"), // liquidity parameter
      10 * 24 * 3600 // 10 days trading period
    );

  return proposalId;
}

/**
 * Execute trades from multiple traders on a market
 * @param {Object} marketFactory - Market factory contract
 * @param {Object} collateralToken - Collateral ERC20 token contract
 * @param {Array} trades - Array of trade objects {signer, buyPass, amount}
 * @param {BigInt} marketId - Market identifier
 */
export async function executeTrades(marketFactory, collateralToken, trades, marketId) {
  for (const trade of trades) {
    // Approve collateral token transfer
    await collateralToken.connect(trade.signer).approve(await marketFactory.getAddress(), trade.amount);

    // Execute buy with ERC20 collateral (no ETH value)
    await marketFactory
      .connect(trade.signer)
      .buyTokens(marketId, trade.buyPass, trade.amount);
  }
}

/**
 * Complete oracle resolution process including challenge period
 * @param {Object} oracleResolver - Oracle resolver contract
 * @param {Object} accounts - Test accounts with owner and reporter
 * @param {BigInt} proposalId - Proposal identifier
 * @param {BigInt} passValue - Welfare metric value if proposal passes
 * @param {BigInt} failValue - Welfare metric value if proposal fails
 * @param {String} evidence - Evidence string or IPFS hash
 */
export async function completeOracleResolution(oracleResolver, accounts, proposalId, passValue, failValue, evidence) {
  const { owner, reporter } = accounts;

  const reporterBond = await oracleResolver.REPORTER_BOND();

  // Reporter submits the report
  await oracleResolver
    .connect(reporter)
    .submitReport(
      proposalId,
      passValue,
      failValue,
      toUtf8Bytes(evidence || "Integration test evidence"),
      { value: reporterBond }
    );

  // Wait for challenge period to pass (2 days)
  const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
  const time = await getTime();
  await time.increase(Number(challengePeriod) + 1);

  // Owner finalizes the resolution
  await oracleResolver
    .connect(owner)
    .finalizeResolution(proposalId);
}

/**
 * Submit oracle report (initial report submission stage)
 * @param {Object} oracleResolver - Oracle resolver contract
 * @param {Object} reporter - Reporter signer
 * @param {BigInt} proposalId - Proposal identifier
 * @param {BigInt} passValue - Welfare metric value if proposal passes
 * @param {BigInt} failValue - Welfare metric value if proposal fails
 * @param {String} evidence - Evidence string or IPFS hash
 * @returns {Object} Transaction receipt
 */
export async function submitOracleReport(oracleResolver, reporter, proposalId, passValue, failValue, evidence) {
  const reporterBond = await oracleResolver.REPORTER_BOND();

  return await oracleResolver
    .connect(reporter)
    .submitReport(
      proposalId,
      passValue,
      failValue,
      toUtf8Bytes(evidence || "Oracle report evidence"),
      { value: reporterBond }
    );
}

/**
 * Challenge an oracle report during challenge period
 * @param {Object} oracleResolver - Oracle resolver contract
 * @param {Object} challenger - Challenger signer
 * @param {BigInt} proposalId - Proposal identifier
 * @param {BigInt} counterPassValue - Alternative pass value
 * @param {BigInt} counterFailValue - Alternative fail value
 * @param {String} counterEvidence - Counter-evidence
 * @returns {Object} Transaction receipt
 */
export async function challengeOracleReport(oracleResolver, challenger, proposalId, counterPassValue, counterFailValue, counterEvidence) {
  const challengerBond = await oracleResolver.CHALLENGER_BOND();

  return await oracleResolver
    .connect(challenger)
    .challengeReport(
      proposalId,
      counterPassValue,
      counterFailValue,
      toUtf8Bytes(counterEvidence || "Challenge evidence"),
      { value: challengerBond }
    );
}

/**
 * Complete oracle resolution with challenge
 * @param {Object} oracleResolver - Oracle resolver contract
 * @param {Object} accounts - Test accounts with owner, reporter, and challenger
 * @param {BigInt} proposalId - Proposal identifier
 * @param {Object} reportValues - Initial report {passValue, failValue, evidence}
 * @param {Object} challengeValues - Challenge values {passValue, failValue, evidence}
 * @returns {Object} Final resolution values
 */
export async function completeOracleResolutionWithChallenge(
  oracleResolver,
  accounts,
  proposalId,
  reportValues,
  challengeValues
) {
  const { owner, reporter, challenger } = accounts;

  // Submit initial report
  await submitOracleReport(
    oracleResolver,
    reporter,
    proposalId,
    reportValues.passValue,
    reportValues.failValue,
    reportValues.evidence
  );

  // Submit challenge
  await challengeOracleReport(
    oracleResolver,
    challenger,
    proposalId,
    challengeValues.passValue,
    challengeValues.failValue,
    challengeValues.evidence
  );

  // Owner finalizes (accepts challenge)
  await oracleResolver
    .connect(owner)
    .finalizeResolution(proposalId);

  // Return final resolution
  return await oracleResolver.getResolution(proposalId);
}

/**
 * Get future timestamp for deadlines
 * @param {Number} daysFromNow - Number of days in the future
 * @returns {Number} Unix timestamp
 */
export async function getFutureTimestamp(daysFromNow) {
  const time = await getTime();
  const currentTime = await time.latest();
  return currentTime + (daysFromNow * 24 * 3600);
}

/**
 * Advance time by specified number of days
 * @param {Number} days - Number of days to advance
 */
export async function advanceDays(days) {
  const time = await getTime();
  await time.increase(days * 24 * 3600);
}

/**
 * Create default proposal data object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Proposal data
 */
export async function createProposalData(overrides = {}) {
  const defaults = {
    title: "Integration Test Proposal",
    description: "Testing complete flow",
    fundingAmount: parseEther("1000"),
    recipient: null, // Must be provided
    metricId: 0,
    token: ZeroAddress,
    startDate: 0,
    deadline: await getFutureTimestamp(90),
    bond: parseEther("50")
  };

  return { ...defaults, ...overrides };
}

/**
 * Wait for market trading period to end
 * @param {Number} tradingPeriodDays - Trading period in days (default 14)
 */
export async function waitForTradingPeriodEnd(tradingPeriodDays = 14) {
  await advanceDays(tradingPeriodDays);
}

/**
 * Verify proposal state
 * @param {Object} proposalRegistry - Proposal registry contract
 * @param {BigInt} proposalId - Proposal identifier
 * @param {Number} expectedStatus - Expected status code
 */
export async function verifyProposalState(proposalRegistry, proposalId, expectedStatus) {
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
export function createTradeConfigs(traders, directions, amounts) {
  return traders.map((trader, index) => ({
    signer: trader,
    buyPass: directions[index],
    amount: typeof amounts[index] === 'string' ? parseEther(amounts[index]) : amounts[index]
  }));
}

/**
 * Move governance proposal through phases to execution
 * @param {Object} futarchyGovernor - FutarchyGovernor contract
 * @param {Object} oracleResolver - OracleResolver contract
 * @param {Object} accounts - Test accounts with owner and reporter
 * @param {BigInt} proposalId - Proposal identifier
 * @param {BigInt} passValue - Pass welfare value
 * @param {BigInt} failValue - Fail welfare value
 * @param {String} evidence - Evidence for oracle
 * @returns {BigInt} governanceProposalId
 */
export async function advanceProposalToExecution(futarchyGovernor, oracleResolver, accounts, proposalId, passValue, failValue, evidence) {
  const { owner, reporter } = accounts;

  // Get governance proposal ID (it's always proposalId = governanceProposalId for first proposal)
  const governanceProposalId = 0n;

  // Wait for trading period to end (10 days)
  const time = await getTime();
  await time.increase(10 * 24 * 3600 + 1);

  // Move to resolution phase
  await futarchyGovernor.connect(owner).moveToResolution(governanceProposalId);

  // Complete oracle resolution
  await completeOracleResolution(oracleResolver, accounts, proposalId, passValue, failValue, evidence);

  // Finalize proposal (sets execution phase)
  await futarchyGovernor.connect(owner).finalizeProposal(governanceProposalId);

  // Wait for timelock (2 days minimum)
  await time.increase(2 * 24 * 3600 + 1);

  return governanceProposalId;
}
