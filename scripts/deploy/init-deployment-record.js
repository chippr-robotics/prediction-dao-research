/**
 * init-deployment-record.js — create an EMPTY deployment record for a network that has none.
 *
 * IT DEPLOYS NOTHING. It sends no transaction, needs no gas, and touches no chain state. The only
 * thing it produces is `deployments/<network>-chain<id>-v2.json` with `contracts: {}` — the file the
 * targeted deploy scripts append to.
 *
 * Why this exists
 * ---------------
 * `deploy-fee-router.js` and `deploy-bridge-liquidity.js` both open with:
 *
 *     No existing deployment record at deployments/<file>. Run the core deploy first.
 *
 * That instruction is correct on Polygon/Amoy/Mordor and WRONG on the spec-067 control-plane
 * networks. Ethereum (1), Optimism (10), Base (8453) and Arbitrum One (42161) are ROUTER-ONLY: the
 * frontend gives them maps containing just `bridgeRouter` + `liquidityRouter`
 * (`frontend/src/config/contracts.js`), there is no wager/membership/oracle deployment planned for
 * them, and running the full `deploy.js` core there would spend real ETH deploying an escrow,
 * membership manager, voucher NFT and oracle adapters that nothing will ever call — on four chains.
 * So on those four networks the refusal above was a dead end: no legitimate way to get the record
 * that the FeeRouter and the two routers require. This is that way.
 *
 * The record is deliberately EMPTY. It asserts nothing about what is deployed, because nothing is:
 * `deploy-fee-router.js` fills in `feeRouter`, `deploy-bridge-liquidity.js` fills in the two
 * routers, and each writes its own addresses as it goes. Downstream tooling already behaves
 * correctly against an empty record — `scripts/deploy/verify.js` refuses a record with no addresses
 * rather than printing "Done", and `sync-frontend-contracts.js` copies only the keys that are
 * present. What it does establish, once, is the two facts those scripts cannot derive themselves:
 * which chain the record belongs to, and where the platform's fee revenue goes.
 *
 * Usage
 * -----
 *   TREASURY=0xabc… npx hardhat run scripts/deploy/init-deployment-record.js --network base
 *
 *   # local sandbox, where hardhat.config.js pins no chainId, so state it:
 *   TREASURY=0xabc… EXPECT_CHAIN_ID=31337 npx hardhat run … --network localhost
 *
 * Env (or the equivalent `-- --flag value` after the script path):
 *   TREASURY        / --treasury    REQUIRED. Fee/revenue destination. No default — see below.
 *   DEPLOYER        / --deployer    Recorded deployer address. Defaults to the configured signer.
 *   EXPECT_CHAIN_ID / --chain-id    Required only when the hardhat network pins no chainId.
 *
 * There is deliberately no CONFIRM_MAINNET gate here, unlike the deploy scripts: this run cannot
 * spend anything or change a live contract, and `git checkout` undoes it completely. The hazard it
 * does have — a record created for the wrong chain — is not a mainnet-specific hazard and is guarded
 * directly, below.
 *
 * Then, in order:
 *   1. CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-fee-router.js       --network <net>
 *   2. CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network <net>
 *   3. npm run sync:frontend-contracts -- --network <net> --chainId <id>
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename, loadDeployment } = require("./lib/helpers");
const { SALT_PREFIXES } = require("./lib/constants");

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Resolve the chain id from TWO independent sources and require them to agree.
 *
 * This is the guard the whole script is built around. A deployment record is keyed by chain id in
 * its filename AND in its body, and every later tool trusts that: `deploy-fee-router.js` picks its
 * record by `<network>-chain<id>-v2.json`, `verify.js` submits sources to the explorer for that
 * chain, `sync-frontend-contracts.js` writes into the contracts.js block for that chain, and the
 * relay-gateway pins its FeeRouter address by it. A record created under the wrong chain id
 * therefore does not fail — it succeeds at the wrong thing, repeatedly, and every address that
 * lands in it afterwards is filed against a chain it does not exist on.
 *
 * The realistic way that happens is an RPC env var pointing somewhere else than its name claims:
 * BASE_RPC_URL still holding an Optimism endpoint after a copy-paste, say. `hre.network.config
 * .chainId` is what the operator DECLARED for this network; `eth_chainId` is what the endpoint
 * actually IS. Comparing them catches exactly that, before a file exists to mislead anyone.
 *
 * When the network pins no chainId (`localhost`), there is only one source, so demand the operator
 * supply the second rather than accepting the endpoint's word for it unchallenged.
 */
async function resolveChainId(networkName) {
  let rpcChainId;
  try {
    rpcChainId = Number((await ethers.provider.getNetwork()).chainId);
  } catch (err) {
    // An unreachable RPC must never be treated as "close enough to write the file anyway": with no
    // chain to check against, the declared id is unverified and this script has no reason to exist.
    throw new Error(
      `Could not read the chain id from the '${networkName}' RPC endpoint, so the record's chain id ` +
        `cannot be verified: ${err?.message || String(err)}`
    );
  }

  const declared = hre.network.config.chainId ? Number(hre.network.config.chainId) : null;
  if (declared !== null && declared !== rpcChainId) {
    throw new Error(
      `Chain id mismatch for network '${networkName}': hardhat.config.js declares ${declared}, but ` +
        `the configured RPC endpoint reports ${rpcChainId}. The endpoint env var for this network ` +
        `points at chain ${rpcChainId}. Fix it before creating a record — every address later ` +
        `written into this file would be filed under the wrong chain.`
    );
  }

  const expected = process.env.EXPECT_CHAIN_ID || argVal("--chain-id");
  if (declared === null && !expected) {
    throw new Error(
      `Network '${networkName}' pins no chainId in hardhat.config.js, so the RPC's answer ` +
        `(${rpcChainId}) is the only statement of which chain this record is for. Set ` +
        `EXPECT_CHAIN_ID=${rpcChainId} to confirm that is the chain you mean.`
    );
  }
  if (expected && Number(expected) !== rpcChainId) {
    throw new Error(
      `EXPECT_CHAIN_ID=${expected} but the '${networkName}' RPC endpoint reports chain ${rpcChainId}. ` +
        `Refusing to create a record for a chain you did not ask for.`
    );
  }

  return rpcChainId;
}

/**
 * The treasury MUST be stated. `deploy-fee-router.js` reads `record.treasury` and passes it straight
 * into `FeeRouter.initialize` as the destination for every platform fee the network ever charges, so
 * a default here would be a default for where members' money goes. There is no defensible guess:
 * the Polygon treasury is a hardware wallet that has nothing to do with a new chain, and the
 * deployer EOA is the address this deploy is explicitly moving AWAY from (Safe-held admin).
 *
 * The zero address is rejected too, even though the FeeRouter accepts it (zero ⇒ the charge path
 * skips the fee, so funds are never lost). Accepting it here would mean this file — created before
 * anyone has thought about revenue — is what silently produced a router with no fee destination,
 * needing a later `setTreasury` from whatever holds admin by then. An operator who genuinely wants
 * to defer that can pass TREASURY=0x0…0 to the FeeRouter deploy itself, where it is a visible
 * choice about that deployment rather than a fossil in a bootstrap record.
 */
function resolveTreasury() {
  const raw = process.env.TREASURY || argVal("--treasury");
  if (!raw) {
    throw new Error(
      `TREASURY is required. It becomes FeeRouter.treasury on this network — the destination for ` +
        `every platform fee charged here — and there is nothing safe to default it to. ` +
        `Pass TREASURY=<address> (the multisig that should receive platform revenue on this chain).`
    );
  }
  if (!ethers.isAddress(raw)) {
    throw new Error(`TREASURY="${raw}" is not an address.`);
  }
  const treasury = ethers.getAddress(raw);
  if (treasury === ethers.ZeroAddress) {
    throw new Error(
      `TREASURY is the zero address. That is a valid FeeRouter state (fees are skipped rather than ` +
        `lost), but it must not be baked into a bootstrap record — pass TREASURY=0x0…0 to ` +
        `deploy-fee-router.js instead, where it is a deliberate choice about that deployment.`
    );
  }
  return treasury;
}

/** Recorded deployer. Defaults to the configured signer; DEPLOYER overrides (e.g. Safe-first setups). */
async function resolveDeployer() {
  const override = process.env.DEPLOYER || argVal("--deployer");
  if (override) {
    if (!ethers.isAddress(override)) throw new Error(`DEPLOYER="${override}" is not an address.`);
    return ethers.getAddress(override);
  }
  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error(
      `No signer configured for network '${hre.network.name}', so the record's deployer is unknown. ` +
        `Mount the floppy keystore (or set PRIVATE_KEY in .env), or pass DEPLOYER=<address> if the ` +
        `deploy will be made from an address this machine does not hold.`
    );
  }
  return signer.address;
}

async function main() {
  const networkName = hre.network.name;

  console.log("=".repeat(60));
  console.log("Initialize deployment record — CREATES A FILE, DEPLOYS NOTHING");
  console.log("=".repeat(60));

  const chainId = await resolveChainId(networkName);
  console.log(`Network:  ${networkName} (chainId ${chainId}, confirmed against the RPC endpoint)`);

  // getDeploymentFilename() is the same helper the deploy scripts use to LOOK for this file, so the
  // record cannot land next to where they read — a mismatch would just reproduce the dead end. It is
  // handed the id resolveChainId() just verified, not a second read of the network.
  const filename = getDeploymentFilename({ chainId }, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);

  // Refuse to overwrite. This is the destructive risk in this script and the only one: an existing
  // record holds live proxy addresses (deployments/ is the source of truth for them), and replacing
  // it with `contracts: {}` would not take those contracts off-chain — it would orphan them. The
  // proxies would keep holding value with no record of where they are, and a re-run of
  // deploy-fee-router.js, seeing no recorded feeRouter, would deploy a SECOND router and strand
  // every registered service, cap and rate on the first. Appending is the deploy scripts' job.
  if (fs.existsSync(filepath)) {
    const existing = loadDeployment(filename) || {};
    const count = Object.keys(existing.contracts || {}).length;
    throw new Error(
      `deployments/${filename} already exists (${count} recorded contract address(es)) — refusing to ` +
        `overwrite it. This script only bootstraps a network that has NO record; the deploy scripts ` +
        `append to an existing one. If the record is genuinely wrong, fix it in git with the ` +
        `on-chain addresses in hand; never replace it with an empty one.`
    );
  }

  const treasury = resolveTreasury();
  const deployer = await resolveDeployer();
  console.log(`Deployer: ${deployer}`);
  console.log(`Treasury: ${treasury}`);

  /**
   * Schema mirrors the record `scripts/deploy/deploy.js` writes (see its `const record = {…}`), so
   * every existing reader — deploy-fee-router.js, deploy-bridge-liquidity.js, verify.js,
   * scripts/utils/sync-frontend-contracts.js, services/relay-gateway/src/config — finds the shape it
   * expects. The keys that carry addresses are explicitly null rather than omitted: null says "this
   * network has none" out loud, and both the sync mapping and verify.js already skip null values,
   * whereas an absent key reads as an oversight.
   *
   * The router-only control-plane networks have no payment token, no wrapped native and no
   * Polymarket CTF in FairWins' use of them — members bridge and supply their own assets there;
   * there is no escrow, no membership sale and no prediction market. If a chain later gains a core
   * deploy, deploy.js sets these itself.
   */
  const record = {
    network: networkName,
    chainId,
    deployer,
    treasury,
    paymentToken: null,
    wmatic: null,
    polymarketCTF: null,
    contracts: {},
    mocks: null,
    constructorArgs: {},
    saltPrefix: SALT_PREFIXES.V2,
    timestamp: new Date().toISOString(),
    // Provenance: this record was bootstrapped empty, not produced by a deploy. Anyone reading it
    // (or reviewing the commit) can tell the difference without checking git history.
    bootstrappedBy: "scripts/deploy/init-deployment-record.js",
    bootstrapNote:
      "Created empty — no contracts were deployed by this file. Addresses are appended by the " +
      "targeted deploy scripts (deploy-fee-router.js, deploy-bridge-liquidity.js).",
  };

  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log(`Created deployments/${filename} with contracts: {} — EMPTY.`);
  console.log("Nothing was deployed and no transaction was sent.");
  console.log("=".repeat(60));
  console.log("\nNext:");
  console.log(`  1. CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-fee-router.js --network ${networkName}`);
  console.log(`  2. CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network ${networkName}`);
  console.log(`  3. npm run sync:frontend-contracts -- --network ${networkName} --chainId ${chainId}`);
  console.log("\n  (drop CONFIRM_MAINNET on a testnet; step 3 needs a contracts.js block for this");
  console.log("   chain — the sync refuses rather than writing into another chain's block.)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
