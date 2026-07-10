// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.24;

// Test-only compilation shim (spec 049): pulls the real Safe v1.4.1 sources (devDependency
// @safe-global/safe-contracts) into the Hardhat artifact set so the policy-guard integration
// suite (test/integration/policy-guard-safe.test.js) can deploy an actual Safe + proxy factory
// and exercise execTransaction/setGuard/setup semantics. Never deployed by any script; live
// networks use the canonical pre-deployed Safe contracts (frontend/src/config/safeContracts.js).

import {SafeL2} from "@safe-global/safe-contracts/contracts/SafeL2.sol";
import {SafeProxyFactory} from "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import {CompatibilityFallbackHandler} from "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol";
import {MultiSendCallOnly} from "@safe-global/safe-contracts/contracts/libraries/MultiSendCallOnly.sol";
