/**
 * Inspect a deployed FeeRouter: proxy wiring, treasury, role holders and registered services.
 * Read-only. Used to confirm a deploy that the tooling reported ambiguously.
 *
 * Usage: FEE_ROUTER=0x… npx hardhat run scripts/ops/inspect-fee-router.js --network <net>
 *        (falls back to the address recorded in deployments/)
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");
const { LAUNCH_FEE_SERVICES } = require("../deploy/lib/feeServices");

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  let address = process.env.FEE_ROUTER;
  if (!address) {
    const file = path.join(process.cwd(), "deployments", getDeploymentFilename(network, "v2"));
    address = JSON.parse(fs.readFileSync(file, "utf8"))?.contracts?.feeRouter;
  }
  if (!address) throw new Error(`No FeeRouter address for chain ${chainId} (set FEE_ROUTER=)`);

  console.log(`\nchain ${chainId} — FeeRouter ${address}`);
  const code = await ethers.provider.getCode(address);
  console.log(`  proxy code: ${(code.length - 2) / 2} bytes`);
  const raw = await ethers.provider.getStorage(address, IMPL_SLOT);
  const impl = ethers.getAddress("0x" + raw.slice(-40));
  const implCode = await ethers.provider.getCode(impl);
  console.log(`  implementation: ${impl} (${(implCode.length - 2) / 2} bytes)`);
  if (implCode === "0x") throw new Error("implementation slot points at an address with no code");

  const r = await ethers.getContractAt("FeeRouter", address);
  const [signer] = await ethers.getSigners();
  console.log(`  treasury: ${await r.treasury()}`);
  for (const role of ["DEFAULT_ADMIN_ROLE", "UPGRADER_ROLE", "FEE_ADMIN_ROLE"]) {
    try {
      const id = await r[role]();
      console.log(`  ${role} held by deployer: ${await r.hasRole(id, signer.address)}`);
    } catch {
      console.log(`  ${role}: not exposed`);
    }
  }

  console.log("  services:");
  let missing = 0;
  for (const svc of LAUNCH_FEE_SERVICES) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
    const s = await r.getService(id);
    const registered = Number(s.kind) !== 0;
    if (!registered) missing++;
    console.log(
      `    ${registered ? "✓" : "·"} ${svc.label.padEnd(20)} ${registered ? `cap ${s.capBps} bps, rate ${s.feeBps} bps` : "NOT registered"}`,
    );
  }
  console.log(missing === 0 ? "\n  all services registered" : `\n  ${missing} service(s) MISSING — router is incomplete`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
