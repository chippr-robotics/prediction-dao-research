/**
 * E2E-ONLY: stand up the Protect (custody) estate on the local chain.
 *
 * Protect needs two things a fresh Hardhat node does not have:
 *
 *  1. **Safe v1.4.1 at its canonical addresses.** Those addresses are identical on every chain the
 *     Safe Singleton Factory reached, and `frontend/src/config/safeContracts.js` hard-codes them —
 *     the app will call no others. The code is placed with `hardhat_setCode` rather than deployed
 *     through the singleton factory: the factory route needs a funded presigned deployer and
 *     reproduces the same runtime bytes anyway, and the app only ever calls these contracts (it
 *     never reads their construction). Safe's constructors set no immutables, so placed code and
 *     deployed code behave identically here; a vault created through the factory reads back with
 *     the right owners, threshold and VERSION.
 *
 *  2. **Our own custody contracts** — the two policy guards, the setup helper, and the proposal
 *     hub — at the addresses the app is BUILT with, plus a recorded deploy block for the hub
 *     (without one, proposal discovery is silently dead, which is exactly the failure spec 043
 *     warns about).
 *
 * SAFETY: this rewrites contract code at fixed addresses, so it refuses to run anywhere but a
 * local node. The chain id is not enough on its own — the e2e node impersonates Amoy — so the
 * check is on the RPC exposing hardhat_setCode at all, which no public endpoint does.
 *
 * Usage: npx hardhat run scripts/e2e/setup-custody-fixtures.js --network localhost
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

// Canonical Safe v1.4.1 — must stay identical to frontend/src/config/safeContracts.js. A mismatch
// means the app calls an address with no code, which surfaces as "this is not a Safe" rather than
// as a configuration error, so it is asserted below rather than assumed.
const SAFE_V1_4_1 = {
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
  multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
};

const SAFE_ARTIFACTS = {
  singletonL2: "SafeL2.sol/SafeL2.json",
  proxyFactory: "proxies/SafeProxyFactory.sol/SafeProxyFactory.json",
  fallbackHandler: "handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json",
  multiSendCallOnly: "libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json",
};

/*
 * Our custody contracts, and the addresses the APP is built with
 * (frontend/src/config/contracts.js — HARDHAT_CONTRACTS).
 *
 * The code is PLACED at those addresses rather than deployed to wherever a fresh CREATE2 lands.
 * A deterministic deploy here does NOT reproduce them: `policyGuardSetup` and `safeProposalHub`
 * are recorded at the same addresses on the live custody chains, so those constants describe real
 * deployments, and the local bytecode has since moved on. Rewriting the constants to match this
 * node would therefore be wrong — the app's config is the authority, and the fixture's job is to
 * make the local chain answer at the addresses the app will actually call.
 *
 * All four take no constructor arguments and keep their state in their own storage, which starts
 * empty on a fresh chain — exactly what a test wants — so placed code behaves identically.
 */
const OURS = [
  { contract: "SafePolicyGuard", key: "safePolicyGuard", address: "0xBE509C8E6c4F132e2Af49761A318FfA362e9CE38" },
  { contract: "SafePolicyGuardV2", key: "safePolicyGuardV2", address: "0xc01E5F3EAFd2C0138e98382A3F54B6CeB3dc05cf" },
  { contract: "PolicyGuardSetup", key: "policyGuardSetup", address: "0xD0CB9D0ca2E56e9552cb833eC6D16F86ce818C2b" },
  { contract: "SafeProposalHub", key: "safeProposalHub", address: "0x94b5b38C247CE51F7C42C83B63115998b7e970E7" },
];

function safeArtifact(relativePath) {
  const full = path.join(
    __dirname, "..", "..", "node_modules", "@safe-global", "safe-contracts",
    "build", "artifacts", "contracts", relativePath,
  );
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

async function assertLocalNode(provider) {
  try {
    // A no-op that only a development node answers. Public RPCs reject the method outright.
    await provider.send("hardhat_setCode", [ethers.ZeroAddress, "0x"]);
  } catch (e) {
    throw new Error(
      "refusing to run: this RPC does not expose hardhat_setCode, so it is not a local node. " +
      `This script rewrites contract code at fixed addresses and must never touch a real chain. (${e.message})`,
    );
  }
}

async function main() {
  const provider = ethers.provider;
  await assertLocalNode(provider);

  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const [deployer] = await ethers.getSigners();
  console.log(`Custody E2E fixtures on chain ${chainId} (deployer ${deployer.address})\n`);

  // ---- 1. Safe v1.4.1 at canonical addresses --------------------------------------------------
  for (const [key, address] of Object.entries(SAFE_V1_4_1)) {
    const { deployedBytecode } = safeArtifact(SAFE_ARTIFACTS[key]);
    if (!deployedBytecode || deployedBytecode === "0x") {
      throw new Error(`@safe-global/safe-contracts has no deployedBytecode for ${key}`);
    }
    await provider.send("hardhat_setCode", [address, deployedBytecode]);
    const placed = await provider.getCode(address);
    if (placed === "0x") throw new Error(`failed to place Safe ${key} at ${address}`);
    console.log(`  Safe ${key.padEnd(18)} ${address}  ${(placed.length - 2) / 2} bytes`);
  }

  // ---- 2. Our custody contracts -----------------------------------------------------------------
  const record = readRecord(chainId);
  record.contracts = record.contracts || {};
  record.deployBlocks = record.deployBlocks || {};

  console.log("");
  for (const { contract, key, address } of OURS) {
    // Deploy once to obtain the runtime code, then place it where the app will look.
    const built = await (await ethers.getContractFactory(contract, deployer)).deploy();
    await built.waitForDeployment();
    const code = await provider.getCode(await built.getAddress());
    if (code === "0x") throw new Error(`${contract} deployed with no runtime code`);
    await provider.send("hardhat_setCode", [address, code]);
    if ((await provider.getCode(address)) !== code) {
      throw new Error(`failed to place ${contract} at ${address}`);
    }
    record.contracts[key] = address;
    /*
     * The hub's deploy block is what proposal discovery scans from — without one, the queue is
     * silently empty, which spec 043 calls out as the failure to guard against. Placed code emits
     * no ProxyCreation-style log, so "now" is the honest starting point: there are no earlier hub
     * logs on this chain to miss.
     */
    if (key === "safeProposalHub") {
      record.deployBlocks[key] = await provider.getBlockNumber();
    }
    console.log(`  ${contract.padEnd(20)} ${address}`);
  }

  writeRecord(chainId, record);
  console.log(`\nRecorded in ${recordName(chainId)}`);
  console.log(
    "\nAddresses come FROM frontend/src/config/contracts.js (HARDHAT_CONTRACTS): the E2E job does\n" +
    "not run sync:frontend-contracts, so the app reads those constants and the chain must answer there.",
  );
}

function recordName(chainId) {
  return `localhost-chain${chainId}-v2.json`;
}

function recordPath(chainId) {
  return path.join(__dirname, "..", "..", "deployments", recordName(chainId));
}

function readRecord(chainId) {
  const p = recordPath(chainId);
  if (!fs.existsSync(p)) {
    throw new Error(`no deployment record at ${p} — run npm run setup:e2e first`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeRecord(chainId, record) {
  fs.writeFileSync(recordPath(chainId), `${JSON.stringify(record, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
