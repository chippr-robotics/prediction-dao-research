/**
 * wait-for-amoy-funding.js — poll the Amoy deployer balance until it can cover
 * the v2 redeploy (~0.27 POL). Exits 0 when funded, 1 on timeout. Read-only.
 */
const ADDR = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
const RPC = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
// Adapter + MembershipManager + tiers already deployed. Remaining = WagerRegistry
// (gates at 0.1204 POL buffered) + SanctionsGuard/KeyRegistry/wiring. Need ~0.145.
const THRESH = 145000000000000000n; // 0.145 POL
const MAX_ITERS = 180; // 180 * 20s = 60 min
const POLL_MS = 20000;

async function balance() {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [ADDR, "latest"], id: 1 }),
  });
  const j = await r.json();
  if (!j.result) throw new Error(JSON.stringify(j.error || j));
  return BigInt(j.result);
}

(async () => {
  for (let i = 0; i < MAX_ITERS; i++) {
    try {
      const b = await balance();
      const pol = Number(b) / 1e18;
      if (b >= THRESH) {
        console.log(`FUNDED: ${pol.toFixed(4)} POL (>= 0.27). Ready to deploy.`);
        process.exit(0);
      }
      console.log(`[${i}] balance ${pol.toFixed(4)} POL — below 0.27, waiting...`);
    } catch (e) {
      console.log(`[${i}] poll error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("TIMEOUT: deployer still underfunded after 40 min.");
  process.exit(1);
})();
