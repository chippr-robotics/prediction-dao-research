// Preflight (no transactions sent): confirm the Semaphore closure artifacts load via getContractFactory
// and estimate deploy gas/fees on the target network, so we can size GAS_PRICE_WEI under the node's
// per-tx fee cap before spending real ETC. Run with --no-compile so it uses the copied artifacts.
const { ethers } = require("hardhat");

const FQN_POSEIDON = "poseidon-solidity/PoseidonT3.sol:PoseidonT3";
const FQN_VERIFIER = "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol:SemaphoreVerifier";
const FQN_SEMAPHORE = "@semaphore-protocol/contracts/Semaphore.sol:Semaphore";

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  const gasPrice = process.env.GAS_PRICE_WEI ? BigInt(process.env.GAS_PRICE_WEI) : (await provider.getFeeData()).gasPrice;
  console.log(`Network chainId ${Number(net.chainId)}; deployer ${deployer.address}`);
  console.log(`gasPrice used: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

  const poseidon = await ethers.getContractFactory(FQN_POSEIDON, deployer);
  const poseidonGas = await provider.estimateGas({ from: deployer.address, data: poseidon.bytecode });
  console.log(`\nPoseidonT3     bytecode ${(poseidon.bytecode.length - 2) / 2} bytes  est gas ${poseidonGas}  fee ${ethers.formatEther(poseidonGas * gasPrice)} ETC`);

  const verifier = await ethers.getContractFactory(FQN_VERIFIER, deployer);
  const verifierGas = await provider.estimateGas({ from: deployer.address, data: verifier.bytecode });
  console.log(`SemaphoreVerifier bytecode ${(verifier.bytecode.length - 2) / 2} bytes  est gas ${verifierGas}  fee ${ethers.formatEther(verifierGas * gasPrice)} ETC`);

  // Semaphore needs PoseidonT3 linked to estimate; use a placeholder (deployer addr) just for sizing.
  const semaphore = await ethers.getContractFactory(FQN_SEMAPHORE, {
    signer: deployer,
    libraries: { [FQN_POSEIDON]: deployer.address },
  });
  // Constructor takes the verifier address; use a placeholder for the estimate.
  const semDeployTx = await semaphore.getDeployTransaction(deployer.address);
  let semGas;
  try {
    semGas = await provider.estimateGas({ from: deployer.address, data: semDeployTx.data });
  } catch (e) {
    semGas = 0n;
    console.log(`Semaphore estimate skipped (needs real linked libs/verifier): ${e.shortMessage || e.message}`);
  }
  console.log(`Semaphore      bytecode ${(semaphore.bytecode.length - 2) / 2} bytes  est gas ${semGas}  fee ${semGas ? ethers.formatEther(semGas * gasPrice) : "n/a"} ETC`);

  const totalGas = poseidonGas + verifierGas + (semGas || 3000000n);
  console.log(`\nTOTAL est gas ~${totalGas}  fee ~${ethers.formatEther(totalGas * gasPrice)} ETC (using 3M fallback for Semaphore if skipped)`);
  const maxSingleFee = (verifierGas > poseidonGas ? verifierGas : poseidonGas) * gasPrice;
  console.log(`Largest single-tx fee ~${ethers.formatEther(maxSingleFee)} ETC (must stay under the ~1 ETC node cap)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
