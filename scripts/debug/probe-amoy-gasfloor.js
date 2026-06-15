/**
 * probe-amoy-gasfloor.js — find the minimum gas price Amoy will mine.
 * Sends a 0-value self-tx at the requested gwei; if it doesn't confirm in ~40s,
 * replaces it at the same nonce with 30 gwei so no nonce is left stuck.
 *
 *   node scripts/debug/probe-amoy-gasfloor.js <gwei>
 */
require("dotenv").config();
const { ethers } = require("ethers");

const RPC = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const GWEI = process.argv[2] || "5";

async function waitMined(provider, hash, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const rc = await provider.getTransactionReceipt(hash);
    if (rc) return rc;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  let pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not in env");
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  const w = new ethers.Wallet(pk, provider);

  const nonce = await provider.getTransactionCount(w.address, "latest");
  const gasPrice = ethers.parseUnits(GWEI, "gwei");
  console.log(`Probing ${GWEI} gwei from ${w.address} (nonce ${nonce})...`);

  const tx = await w.sendTransaction({ to: w.address, value: 0, gasPrice, gasLimit: 21000, nonce });
  console.log(`  sent ${tx.hash}`);
  const rc = await waitMined(provider, tx.hash, 40000);
  if (rc) {
    console.log(`  ✓ MINED at ${GWEI} gwei in block ${rc.blockNumber} — floor <= ${GWEI} gwei`);
    process.exit(0);
  }

  console.log(`  … not mined in 40s at ${GWEI} gwei; replacing at 30 gwei (same nonce) to clear...`);
  const repl = await w.sendTransaction({ to: w.address, value: 0, gasPrice: ethers.parseUnits("30", "gwei"), gasLimit: 21000, nonce });
  console.log(`  replacement ${repl.hash}`);
  const rc2 = await waitMined(provider, repl.hash, 40000);
  console.log(rc2 ? `  ✓ replacement mined (block ${rc2.blockNumber}); floor is ABOVE ${GWEI} gwei` : `  ⚠️ replacement also pending — check network`);
  process.exit(rc2 ? 2 : 1);
})().catch((e) => {
  console.error("ERR", e.shortMessage || e.message);
  if (e.info) console.error("  info:", JSON.stringify(e.info));
  if (e.error) console.error("  error:", JSON.stringify(e.error));
  process.exit(1);
});
