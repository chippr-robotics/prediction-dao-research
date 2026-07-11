/**
 * Live Amoy validation for the deployed FairWinsVerifyingPaymaster (spec 050).
 *
 * Proves the DEPLOYED paymaster sponsors a real UserOp against the REAL Amoy EntryPoint v0.6,
 * paying from its deposit. ADC for the KMS signer isn't available in every env, so this temporarily
 * rotates verifyingSigner to a local ephemeral key (owner-only), submits one sponsored UserOp, then
 * RESTORES the KMS signer (with a final assert). Safe + reversible; leaves the paymaster exactly as
 * found. Run: `... npx hardhat run scripts/validate-paymaster-amoy.js --network amoy`.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");

const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const PM_ADDR = process.env.PM_ADDRESS || "0xA00A06ae44FA2bd40Ec10D9613c96afD779b6898";
const KMS_SIGNER = process.env.PM_VERIFYING_SIGNER || "0x9Ec0d8fF320c3590b47Da5B06ae0253Ab1Ca22CD";

const EP_ABI = [
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops, address beneficiary)",
  "function balanceOf(address account) view returns (uint256)",
  "function getNonce(address sender, uint192 key) view returns (uint256)",
];

async function main() {
  const [owner] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Validate paymaster ${PM_ADDR} on ${hre.network.name} (chainId ${chainId}) as ${owner.address}`);
  if (chainId !== 80002n) throw new Error("This validation is Amoy-only (80002).");

  const pm = await ethers.getContractAt("FairWinsVerifyingPaymaster", PM_ADDR);
  const entryPoint = new ethers.Contract(ENTRYPOINT_V06, EP_ABI, owner);

  const before = await entryPoint.balanceOf(PM_ADDR);
  console.log(`  deposit before: ${ethers.formatEther(before)} POL`);
  const originalSigner = await pm.verifyingSigner();
  console.log(`  current verifyingSigner: ${originalSigner}`);

  const local = ethers.Wallet.createRandom();
  const restoreTo = originalSigner.toLowerCase() === ethers.ZeroAddress ? KMS_SIGNER : originalSigner;

  try {
    console.log(`  rotating verifyingSigner -> ${local.address} (ephemeral, for validation)…`);
    await (await pm.connect(owner).setVerifyingSigner(local.address)).wait();

    const Acct = await ethers.getContractFactory("MockAccount");
    const account = await Acct.deploy();
    await account.waitForDeployment();
    const acctAddr = await account.getAddress();
    const nonce = await entryPoint.getNonce(acctAddr, 0);
    const fee = await ethers.provider.getFeeData();

    const userOp = {
      sender: acctAddr,
      nonce,
      initCode: "0x",
      callData: account.interface.encodeFunctionData("noop"),
      callGasLimit: 200000n,
      verificationGasLimit: 400000n,
      preVerificationGas: 150000n,
      maxFeePerGas: (fee.maxFeePerGas ?? fee.gasPrice) * 2n,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? ethers.parseUnits("30", "gwei"),
      paymasterAndData: "0x",
      signature: "0x",
    };
    const validUntil = 4_000_000_000;
    const hash = await pm.getHash(userOp, validUntil, 0);
    const sig = await local.signMessage(ethers.getBytes(hash));
    userOp.paymasterAndData = ethers.solidityPacked(["address", "uint48", "uint48", "bytes"], [PM_ADDR, validUntil, 0, sig]);

    console.log("  submitting sponsored UserOp to the real Amoy EntryPoint…");
    const rc = await (await entryPoint.handleOps([userOp], owner.address)).wait();
    console.log(`  ✓ included in block ${rc.blockNumber} (tx ${rc.hash})`);

    const after = await entryPoint.balanceOf(PM_ADDR);
    console.log(`  deposit after: ${ethers.formatEther(after)} POL  (paid ${ethers.formatEther(before - after)} POL of gas)`);
    if (!(after < before)) throw new Error("VALIDATION FAILED: deposit did not decrease");
    const acctBal = await ethers.provider.getBalance(acctAddr);
    if (acctBal !== 0n) throw new Error("VALIDATION FAILED: sponsored account paid native (should be 0)");
    console.log("  ✓ paymaster paid; the account's native balance stayed 0 — SPONSORSHIP CONFIRMED ON LIVE AMOY");
  } finally {
    console.log(`  restoring verifyingSigner -> ${restoreTo}…`);
    await (await pm.connect(owner).setVerifyingSigner(restoreTo)).wait();
    const now = await pm.verifyingSigner();
    if (now.toLowerCase() !== restoreTo.toLowerCase()) {
      throw new Error(`!!! verifyingSigner NOT restored (is ${now}, expected ${restoreTo}) — re-run setVerifyingSigner`);
    }
    console.log(`  ✓ verifyingSigner restored to ${now}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
