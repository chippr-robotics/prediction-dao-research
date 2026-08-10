// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// IOptimisticOracleV3 — the subset of UMA's Optimistic Oracle V3 that FairWins calls, declared
// here rather than imported from the `@uma/core` package.
//
// (Deliberately line comments, not a NatSpec `/** */` block: solc parses a leading `@` inside
// NatSpec as a documentation tag, so writing the package name there fails the build with
// `DocstringParsingError: Documentation tag @uma/core` not valid for contracts`.)
//
// WHY THIS FILE EXISTS — two independent reasons, both load-bearing:
//
//  1. LICENSE. UMA's interface sources are AGPL-3.0-only; this repository is Apache-2.0. Copying
//     them into the tree would place AGPL sources in an Apache-2.0 project and misstate the
//     license of the combined work. What is reproduced below is the ABI of a deployed contract —
//     function names, parameter types, ordering — which is a factual description of an on-chain
//     interface, not the original expression of the UMA sources. No comments, layout, structs, or
//     helper types were copied.
//
//  2. DEPENDENCY WEIGHT. That package was the single largest thing in the dependency tree:
//     1,157 of 3,202 installed packages existed only to satisfy it — including 411 legacy
//     truffle/web3/ethereumjs packages carrying 43 of the repository's npm advisories — all to
//     supply 199 lines of Solidity that no JavaScript ever imported. Removing it took the lockfile
//     from 3,202 packages to 2,064.
//
// DECLARE ONLY WHAT IS CALLED. This is deliberately not the full OOv3 interface. Adding a member
// that nothing calls re-creates the maintenance burden this file removes. If a new call site needs
// another function, add exactly that function and verify it against the deployed OOv3 ABI.
//
// SELECTOR STABILITY IS THE WHOLE CONTRACT HERE. These signatures are what the adapter's compiled
// bytecode encodes; changing a parameter type or its position silently repoints a live oracle call
// at a function that does not exist. `scripts/codegen/bytecode-digest.js` is what proves the move
// off the package did not change a byte, and test/fork/AmoyOracles.fork.test.js is what proves the
// selectors still match the real deployed oracle on Amoy.
//
// Reference: UMA Protocol Optimistic Oracle V3.
interface IOptimisticOracleV3 {
    /// @notice Assert a claim, posting `bond` of `currency`, callable back at `callbackRecipient`.
    /// @return assertionId identifier UMA assigns to this assertion.
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId);

    /// @notice The identifier OOv3 uses when a caller does not supply one.
    function defaultIdentifier() external view returns (bytes32);
}

// IOptimisticOracleV3CallbackRecipient — the callbacks OOv3 invokes on the `callbackRecipient`
// passed to `assertTruth`.
//
// Implemented by UMAOptimisticOracleV3Adapter. Both are access-controlled to the oracle address on
// the implementing side — the oracle is the only party permitted to resolve or dispute, and these
// entry points would otherwise let anyone write a resolution.
interface IOptimisticOracleV3CallbackRecipient {
    /// @notice Called when an assertion settles. `assertedTruthfully` is the outcome.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    /// @notice Called when an assertion is disputed and escalated to UMA's DVM.
    function assertionDisputedCallback(bytes32 assertionId) external;
}
