// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Compiles Semaphore V4 into this repo so it can be SELF-DEPLOYED on Ethereum Classic / Mordor, which
// has no canonical Semaphore singleton (research.md §3; ETC has the alt_bn128 precompiles + PUSH0).
// Amoy/Polygon use the canonical singleton and do NOT need this. This file deploys nothing itself — it
// only forces hardhat to compile the Semaphore + verifier artifacts so the deploy script can deploy them.
//
// solhint-disable-next-line no-unused-import
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
// solhint-disable-next-line no-unused-import
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
