require("dotenv").config();
const { ethers } = require("ethers");
const IMPL = "0xfC5086A397e4FbAAF8f73892807415Da8d255E61";
const FACTORY = "0xd519C25e9dEd0DAC586B764574100479CB318734";
const EP = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const DEPLOYER = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
const nets = [
  ["mainnet", process.env.MAINNET_RPC_URL],
  ["optimism", process.env.OPTIMISM_RPC_URL],
  ["base", process.env.BASE_RPC_URL],
  ["arbitrum", process.env.ARBITRUM_RPC_URL],
  ["polygon", process.env.POLYGON_RPC_URL],
  ["etc", process.env.ETC_RPC_URL || "https://etc.rivet.link"],
  ["mordor", process.env.MORDOR_RPC_URL || "https://rpc.mordor.etccooperative.org"],
  ["amoy", process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"],
];
(async () => {
  for (const [name, url] of nets) {
    if (!url) { console.log(name, "NO URL"); continue; }
    const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true, batchMaxCount: 1 });
    try {
      const [net, bal, blk] = await Promise.all([p.getNetwork(), p.getBalance(DEPLOYER), p.getBlock("latest")]);
      const codes = {};
      for (const [k, a] of [["c2", C2], ["ep", EP], ["impl", IMPL], ["factory", FACTORY]]) {
        const c = await p.getCode(a).catch(() => "ERR");
        codes[k] = c === "ERR" ? "ERR" : (c === "0x" ? "NONE" : ((c.length - 2) / 2) + "B");
      }
      let prio = null;
      try { prio = await p.send("eth_maxPriorityFeePerGas", []); } catch (e) { prio = "ERR:" + (e.shortMessage || e.message || "").slice(0, 40); }
      let gp = null;
      try { gp = await p.send("eth_gasPrice", []); } catch { }
      console.log(JSON.stringify({
        name, chainId: Number(net.chainId),
        balanceEth: ethers.formatEther(bal),
        baseFeeGwei: blk.baseFeePerGas ? ethers.formatUnits(blk.baseFeePerGas, "gwei") : null,
        gasPriceGwei: gp ? ethers.formatUnits(BigInt(gp), "gwei") : null,
        maxPrioGwei: (typeof prio === "string" && prio.startsWith("0x")) ? ethers.formatUnits(BigInt(prio), "gwei") : prio,
        ...codes,
      }));
    } catch (e) {
      console.log(name, "FAILED:", (e.shortMessage || e.message || String(e)).slice(0, 120));
    }
  }
})();
