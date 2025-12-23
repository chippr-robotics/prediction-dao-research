module.exports = {
  skipFiles: [
    'mocks/',
    'ProposalRegistryFuzzTest.sol',
    'WelfareMetricRegistryFuzzTest.sol',
    'DAOFactory.sol', // Skip due to constructor gas limits under coverage instrumentation
  ],
  mocha: {
    timeout: 180000, // 3 minutes for coverage (instrumented code is slower)
  },
  providerOptions: {
    default_balance_ether: 10000,
    total_accounts: 20,
    gasLimit: 0xfffffffffff, // Unlimited gas for coverage runs
    allowUnlimitedContractSize: true,
  },
  configureYulOptimizer: true,
  solcOptimizerDetails: {
    peephole: false,
    inliner: false,
    jumpdestRemover: false,
    orderLiterals: false,
    deduplicate: false,
    cse: false,
    constantOptimizer: false,
    yul: true,
  },
};
