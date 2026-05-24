module.exports = {
  skipFiles: [
    'mocks/',
    'test/',
    'ProposalRegistryFuzzTest.sol',
    'WelfareMetricRegistryFuzzTest.sol',
    'DAOFactory.sol',
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
