/**
 * set-gmx-ui-fee-factor.js (spec 083) — report, and optionally SET, FairWins' GMX v2 UI fee factor.
 *
 * Why this exists
 * ---------------
 * GMX is the one perps fee rail whose rate does NOT live on our FeeRouter. GMX stores it in GMX's
 * own DataStore under `uiFeeFactorKey(receiver)` and applies it itself, inside `getPositionFees`,
 * at ORDER EXECUTION — which is exactly why it is safe: a cancelled or frozen order pays nothing.
 * Registering a `perps.gmx.uifee` service on the FeeRouter would create a second config store for a
 * rate we cannot enforce, and put a settable control in the admin panel that silently does nothing
 * (see specs/083-perps-position-management/contracts/fee-rails.md). So the authority is GMX's
 * DataStore, and this script is how an operator changes it.
 *
 * The critical property: `ExchangeRouter.setUiFeeFactor` takes `account = msg.sender`. The SENDING
 * address IS the fee receiver. There is no parameter to name a different one, so the address that
 * signs here must be the address recorded as `uiFeeReceiver` in `frontend/src/config/perps.js`, or
 * the app will attribute fees to a receiver that never accrues them. This script refuses to send
 * when those two disagree.
 *
 * Permissionless by design: GMX requires no approval to self-register a UI fee receiver. The only
 * bound is `MAX_UI_FEE_FACTOR`, read live from the DataStore rather than assumed.
 *
 * The unit conversion, the cap comparison, the DataStore key derivations and every refusal live in
 * `scripts/ops/lib/gmxUiFee.js` so they can be tested without a network
 * (`test/perps/gmxUiFee.test.js`). What stays here is exactly what needs a chain: the live reads,
 * the signer, and the send.
 *
 * Usage
 * -----
 *   # report only — current factor, live cap, and what 5 bps would mean (sends nothing)
 *   npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum
 *
 *   # rehearse a change (prints the exact call, sends nothing)
 *   BPS=5 DRY_RUN=true npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum
 *
 *   # set the rate
 *   BPS=5 npx hardhat run scripts/ops/set-gmx-ui-fee-factor.js --network arbitrum
 *
 * Env:
 *   BPS       fee rate in basis points of NOTIONAL (not of margin). Omit for a report-only run.
 *   DRY_RUN   'true' => report + print the call, send nothing.
 *   RECEIVER  expected receiver address; defaults to the configured one. The signer must match it.
 */
const hre = require("hardhat");
const { ethers } = hre;

const {
  EXCHANGE_ROUTER_ABI,
  DATA_STORE_ABI,
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
} = require("./lib/gmxUiFee");

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const cfg = gmxAddressesFor(chainId);

  const bpsRaw = process.env.BPS;
  const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true";

  const dataStore = new ethers.Contract(cfg.dataStore, DATA_STORE_ABI, ethers.provider);

  // The cap is read live: GMX governance can move it, and assuming 10 bps would be a guess.
  const maxFactor = await dataStore.getUint(MAX_UI_FEE_FACTOR);
  const maxBps = factorToBps(maxFactor);

  const signers = await ethers.getSigners();
  const signer = signers[0] || null;
  const signerAddress = signer ? await signer.getAddress() : null;
  const expectedReceiver = process.env.RECEIVER || signerAddress;

  const currentFactor = expectedReceiver
    ? await dataStore.getUint(uiFeeFactorKey(expectedReceiver))
    : 0n;

  console.log("=".repeat(72));
  console.log("GMX v2 UI fee factor (spec 083 — the GMX perps fee rail)");
  console.log("=".repeat(72));
  console.log(`Network:        ${hre.network.name} (chainId ${chainId})`);
  console.log(`ExchangeRouter: ${cfg.exchangeRouter}`);
  console.log(`DataStore:      ${cfg.dataStore}`);
  console.log(`Receiver:       ${expectedReceiver ?? "(no signer — report only)"}`);
  console.log("");
  console.log(`Live cap:       ${maxFactor} (${maxBps} bps)  [MAX_UI_FEE_FACTOR, read live]`);
  console.log(`Current factor: ${currentFactor} (${factorToBps(currentFactor)} bps)`);
  console.log("");
  console.log("The fee is charged on NOTIONAL (size), on BOTH open and close, and is computed by");
  console.log("GMX at execution — a cancelled or frozen order pays nothing.");

  if (!bpsProvided(bpsRaw)) {
    console.log("");
    console.log("(report only — pass BPS=<n> to set the rate. Nothing was sent.)");
    return;
  }

  const bps = parseBps(bpsRaw);
  const factor = bpsToFactor(bps);
  assertWithinCap({ bps, factor, maxFactor });

  console.log("");
  console.log(`Requested:      ${factor} (${bps} bps)`);

  // setUiFeeFactor takes account = msg.sender, so the signer IS the receiver. If the operator
  // expected a different receiver, sending would attribute fees to the wrong address silently.
  assertSignerIsReceiver({ signerAddress, expectedReceiver });

  if (dryRun) {
    console.log("");
    console.log("DRY RUN — the call that WOULD be sent:");
    console.log(`  to:   ${cfg.exchangeRouter}`);
    console.log(`  from: ${signerAddress}`);
    console.log(`  data: setUiFeeFactor(${factor})`);
    console.log("Nothing was sent.");
    return;
  }

  const router = new ethers.Contract(cfg.exchangeRouter, EXCHANGE_ROUTER_ABI, signer);
  console.log("");
  console.log("Sending setUiFeeFactor…");
  const tx = await router.setUiFeeFactor(factor);
  console.log(`  tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  mined in block ${receipt.blockNumber}`);

  const after = await dataStore.getUint(uiFeeFactorKey(signerAddress));
  console.log(`  verified factor now ${after} (${factorToBps(after)} bps)`);
  assertPostCheck({ expected: factor, actual: after });
  console.log("");
  console.log(`Record ${signerAddress} as uiFeeReceiver in frontend/src/config/perps.js, or the`);
  console.log("app will attach a receiver that does not accrue.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
