/**
 * Ops: fund a relayer gas wallet (spec 036) from the network deployer.
 *
 * The engine's hot gas key lives in Cloud KMS; its derived address (see
 * scripts/operations/relayer/kms-gas-address.js) must hold a low-value, capped gas balance. This
 * tops it up from the hardhat network signer (the deployer / PRIVATE_KEY). NEVER fund from or to
 * the floppy admin keys (SC-015) — the deployer is a low-value operational key.
 *
 *   RELAYER_GAS_ADDRESS=0x... FUND_AMOUNT_ETH=3 GAS_PRICE_WEI=100000000000 \
 *     npx hardhat run scripts/operations/relayer/fund-gas-wallet.js --network mordor
 */
const { ethers } = require("hardhat");

async function main() {
  const to = process.env.RELAYER_GAS_ADDRESS;
  const amountEth = process.env.FUND_AMOUNT_ETH || "3";
  if (!to || !ethers.isAddress(to)) throw new Error(`Set RELAYER_GAS_ADDRESS to the gas wallet (got: ${to})`);

  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const amount = ethers.parseEther(amountEth);
  const buffer = ethers.parseEther("0.2"); // keep gas for the deployer itself

  const balDeployer = await ethers.provider.getBalance(deployer.address);
  const balTarget = await ethers.provider.getBalance(to);
  console.log(`Network:  ${net.name || "?"} (chainId ${Number(net.chainId)})`);
  console.log(`From:     ${deployer.address}  (${ethers.formatEther(balDeployer)})`);
  console.log(`To (gas): ${to}  (${ethers.formatEther(balTarget)})`);
  console.log(`Amount:   ${amountEth}`);

  if (balDeployer < amount + buffer) {
    throw new Error(
      `Deployer balance ${ethers.formatEther(balDeployer)} < amount ${amountEth} + 0.2 buffer. ` +
        `Lower FUND_AMOUNT_ETH or top up the deployer.`
    );
  }

  const txReq = { to, value: amount };
  if (process.env.GAS_PRICE_WEI) txReq.gasPrice = BigInt(process.env.GAS_PRICE_WEI); // legacy type-0 for ETC/Mordor
  const tx = await deployer.sendTransaction(txReq);
  console.log(`\nSent ${amountEth} in tx ${tx.hash} — waiting...`);
  const rcpt = await tx.wait();
  console.log(`  ✓ mined in block ${rcpt.blockNumber}`);
  console.log(`  gas wallet now: ${ethers.formatEther(await ethers.provider.getBalance(to))}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
