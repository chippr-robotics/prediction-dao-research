/**
 * gmxUiFee.js (spec 083) — the pure, network-free half of `scripts/ops/set-gmx-ui-fee-factor.js`.
 *
 * Everything here is a value transformation or a refusal. There is no provider, no signer, and no
 * `require("hardhat")`, so it can be unit-tested without a chain — which matters because the script
 * that uses it is run by an operator against MAINNET with a real key, and the two things that can
 * quietly go wrong (a wrong unit conversion, and crediting the fee to the wrong address) are both
 * decided here.
 *
 * The live reads — `MAX_UI_FEE_FACTOR`, the current factor, the post-send verification — stay in
 * the script: the cap is deliberately read from GMX rather than assumed, and a test must not be
 * able to make that assumption on GMX's behalf.
 *
 * See specs/083-perps-position-management/contracts/fee-rails.md.
 */
const { ethers } = require("ethers");

// Arbitrum 42161. Sourced from docs.gmx.io + @gmx-io/sdk — deliberately NOT from the
// gmx-synthetics repo's deployments/ directory, which disagrees on exactly the churning contracts.
const GMX = {
  42161: {
    exchangeRouter: "0x7dE39FF2e232A2203196788d37e234cF8F1b83f1",
    dataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
  },
};

// GMX's factor precision. 1e30 is "1.0"; 1e27 is 0.001 = 10 bps (the live MAX_UI_FEE_FACTOR).
const FLOAT_PRECISION = 10n ** 30n;
const BPS_TO_FACTOR = 10n ** 26n; // 1 bp = 1e26 against 1e30

const EXCHANGE_ROUTER_ABI = ["function setUiFeeFactor(uint256 uiFeeFactor) external"];
const DATA_STORE_ABI = ["function getUint(bytes32 key) external view returns (uint256)"];

/** GMX Keys.sol: keccak256(abi.encode("UI_FEE_FACTOR")) then keccak256(abi.encode(that, account)). */
const abi = ethers.AbiCoder.defaultAbiCoder();
const UI_FEE_FACTOR = ethers.keccak256(abi.encode(["string"], ["UI_FEE_FACTOR"]));
const MAX_UI_FEE_FACTOR = ethers.keccak256(abi.encode(["string"], ["MAX_UI_FEE_FACTOR"]));
const uiFeeFactorKey = (account) =>
  ethers.keccak256(abi.encode(["bytes32", "address"], [UI_FEE_FACTOR, account]));

const factorToBps = (factor) => Number((factor * 10_000n) / FLOAT_PRECISION);
const bpsToFactor = (bps) => BigInt(bps) * BPS_TO_FACTOR;

/**
 * The GMX addresses for a chain, or a refusal naming the one chain this script is for.
 * GMX v2 exists on Avalanche too; FairWins integrates Arbitrum only (config/perps.js), so a
 * silent success on another chain would configure a rate the app never reads.
 */
function gmxAddressesFor(chainId) {
  const cfg = GMX[chainId];
  if (!cfg) {
    throw new Error(
      `GMX v2 is not deployed on chainId ${chainId}. This script is Arbitrum (42161) only — ` +
        `run with --network arbitrum.`
    );
  }
  return cfg;
}

/**
 * Is a BPS value present at all? An UNSET BPS is the report-only default and the whole point of a
 * safe default run. A BLANK one (`BPS=` / `BPS="  "`) is not a rate: `Number("")` is 0 in
 * JavaScript, so without this it would read as "set the rate to zero" and silently turn the fee
 * off. Blank falls through to parseBps, which refuses it loudly.
 */
const bpsProvided = (raw) => raw !== undefined && raw !== null;

/** Parse BPS exactly as the CLI always has, but never let a blank string mean zero. */
function parseBps(raw) {
  const bad = () => {
    throw new Error(`BPS must be a non-negative integer; got ${JSON.stringify(raw)}`);
  };
  if (typeof raw === "string" && raw.trim() === "") bad();
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0) bad();
  return bps;
}

/**
 * Refuse a rate above GMX's live cap BEFORE sending. GMX would revert `InvalidUiFeeFactor`, so
 * this saves gas — but more importantly it never silently clamps: an operator who asked for 11 bps
 * gets a refusal, not 10 bps they did not ask for.
 */
function assertWithinCap({ bps, factor, maxFactor }) {
  if (factor > maxFactor) {
    throw new Error(
      `BPS=${bps} (factor ${factor}) exceeds GMX's live MAX_UI_FEE_FACTOR ${maxFactor} ` +
        `(${factorToBps(maxFactor)} bps). GMX would revert InvalidUiFeeFactor.`
    );
  }
}

/**
 * `ExchangeRouter.setUiFeeFactor` takes `account = msg.sender`. The SENDING address IS the fee
 * receiver; there is no parameter naming a different one. If the operator expected some other
 * receiver, sending would attribute fees to an address that never accrues them — silently, and
 * only discoverable later as missing revenue.
 */
function assertSignerIsReceiver({ signerAddress, expectedReceiver }) {
  if (!signerAddress) {
    throw new Error("No signer available. Configure one before attempting to send.");
  }
  if (expectedReceiver.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `Receiver mismatch. setUiFeeFactor credits msg.sender, so the signer IS the fee receiver.\n` +
        `  signer:   ${signerAddress}\n  expected: ${expectedReceiver}\n` +
        `Send from the expected receiver, or unset RECEIVER to accept the signer as the receiver.`
    );
  }
}

/** The DataStore must report back exactly what was asked for; anything else is not a success. */
function assertPostCheck({ expected, actual }) {
  if (actual !== expected) {
    throw new Error(`Post-check mismatch: expected ${expected}, DataStore reports ${actual}.`);
  }
}

module.exports = {
  GMX,
  FLOAT_PRECISION,
  BPS_TO_FACTOR,
  EXCHANGE_ROUTER_ABI,
  DATA_STORE_ABI,
  UI_FEE_FACTOR,
  MAX_UI_FEE_FACTOR,
  uiFeeFactorKey,
  factorToBps,
  bpsToFactor,
  gmxAddressesFor,
  bpsProvided,
  parseBps,
  assertWithinCap,
  assertSignerIsReceiver,
  assertPostCheck,
};
