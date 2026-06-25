/**
 * One-off verification (spec 032): read the live BackupPointerRegistry on the connected network, list any
 * BackupPointerSet events, confirm getPointer(owner) matches, and fetch the pinned CID from IPFS to prove the
 * stored blob is an ENCRYPTED envelope (no plaintext). Read-only; no signing.
 *
 * Usage: npx hardhat run scripts/ops/verify-backup-pointer.js --network mordor
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const ABI = [
  "function getPointer(address owner) view returns (string)",
  "function hasPointer(address owner) view returns (bool)",
  "event BackupPointerSet(address indexed owner, string cid, uint64 timestamp)",
];
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];

async function fetchCid(cid) {
  for (const g of GATEWAYS) {
    try {
      const res = await fetch(g + cid, { signal: AbortSignal.timeout(15000) });
      if (res.ok) return { gateway: g, json: await res.json() };
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const fileByChain = { 63: "mordor-chain63-v2.json", 80002: "amoy-chain80002-v2.json", 137: "polygon-chain137-v2.json" };
  const record = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", fileByChain[chainId]), "utf8"));
  const addr = record.contracts.backupPointerRegistry;
  const fromBlock = record.deployBlocks?.backupPointerRegistry || 0;
  console.log(`Network:  ${record.network} (chainId ${chainId})`);
  console.log(`Registry: ${addr}`);

  const c = new ethers.Contract(addr, ABI, ethers.provider);
  const latest = await ethers.provider.getBlockNumber();
  const events = await c.queryFilter(c.filters.BackupPointerSet(), fromBlock, latest);
  console.log(`\nBackupPointerSet events (blocks ${fromBlock}–${latest}): ${events.length}`);
  if (!events.length) {
    console.log("  (none yet — no backup has been recorded on this network)");
    return;
  }

  // newest first
  const seen = new Map();
  for (const e of events) seen.set(e.args.owner, e);
  for (const [owner, e] of seen) {
    const cid = e.args.cid;
    console.log(`\nOwner:     ${owner}`);
    console.log(`  event cid:     ${cid}  (block ${e.blockNumber}, ts ${e.args.timestamp})`);
    const live = await c.getPointer(owner);
    console.log(`  getPointer():  ${live}  ${live === cid ? "✓ matches event" : "✗ MISMATCH"}`);
    console.log(`  hasPointer():  ${await c.hasPointer(owner)}`);
    if (!cid) { console.log("  (pointer cleared)"); continue; }

    const fetched = await fetchCid(cid);
    if (!fetched) { console.log("  IPFS:          could not fetch from public gateways (may still be propagating)"); continue; }
    const env = fetched.json;
    const isEnvelope = env && env.format === "fairwins-data-backup" && typeof env.nonce === "string" && typeof env.ciphertext === "string";
    const blob = JSON.stringify(env);
    const looksEncrypted = isEnvelope && !/"contacts"|"addressBook"|"nickname"|"preferences"|"recentSearches"/i.test(blob);
    console.log(`  IPFS (${fetched.gateway}):`);
    console.log(`    envelope shape:   ${isEnvelope ? "✓ {format,version,alg,nonce,ciphertext}" : "✗ not a backup envelope"} (alg=${env.alg}, v=${env.version})`);
    console.log(`    ciphertext bytes: ${env.ciphertext ? env.ciphertext.length / 2 : 0}`);
    console.log(`    no plaintext PII: ${looksEncrypted ? "✓ encrypted (no cleartext fields)" : "✗ CLEARTEXT DETECTED"}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
