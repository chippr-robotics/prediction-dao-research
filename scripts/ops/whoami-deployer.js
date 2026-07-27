/**
 * Print every signer hardhat would deploy from on the selected network, with balance and nonce.
 *
 * Read-only. Use before a rollout to pin down WHICH address needs funding — a nonce of 0 alongside
 * a zero balance means the account has never transacted on that chain, which distinguishes "not
 * funded yet" from "funded and already spent".
 *
 * Usage: npx hardhat run scripts/ops/whoami-deployer.js --network <net>
 */
const { ethers } = require("hardhat");

async function main() {
  const net = await ethers.provider.getNetwork();
  const signers = await ethers.getSigners();
  console.log(`chainId ${Number(net.chainId)} — ${signers.length} signer(s) configured`);
  if (signers.length === 0) {
    console.log("  none: no floppy keystore mounted and no PRIVATE_KEY fallback");
    return;
  }
  for (const s of signers) {
    const [bal, nonce] = await Promise.all([
      ethers.provider.getBalance(s.address),
      ethers.provider.getTransactionCount(s.address),
    ]);
    console.log(`  ${s.address}  balance=${ethers.formatEther(bal)}  nonce=${nonce}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
