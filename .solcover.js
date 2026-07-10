module.exports = {
  skipFiles: [
    'mocks/', // test-only mock contracts (never deployed)
    // NOTE: contracts/test/* (Medusa/Echidna fuzz harnesses + mock oracles) are test-only
    // and show as ~0% in the per-file report, but they are intentionally NOT added to
    // skipFiles: skipping that whole directory corrupts solidity-coverage's source-map
    // attribution for the production contracts those harnesses import (collapsing
    // WagerRegistry coverage to ~5%). Read the per-file production rows (access/, oracles/,
    // privacy/, upgradeable/, wagers/) rather than the blended "All files" total.
  ],
  mocha: {
    timeout: 180000, // 3 minutes for coverage (instrumented code is slower)
  },
  // Emit a machine-readable summary (spec 046). Both CI workflows read
  // coverage/coverage-summary.json; without this reporter it was never produced, so
  // every coverage summary/gate fell through to "not available". First-party-only
  // accounting is done in post-processing (scripts/coverage/lib/first-party.js) rather
  // than via skipFiles, because skipping vendored account/lib/** (which the first-party
  // wallet contracts import) would corrupt their source-map attribution — same hazard
  // the skipFiles note above describes for contracts/test/*.
  istanbulReporter: ['json-summary', 'lcov', 'text'],
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
