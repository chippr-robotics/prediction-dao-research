const { ethers } = require("hardhat");

/**
 * Debug USC transferFrom to see if the issue is with the proxy
 */

async function main() {
  const factoryAddress = "0xD9A26537947d99c6961C1013490f0B80d1DFE283";
  const uscAddress = "0xDE093684c796204224BC081f937aa059D903c52a";
  const tester1 = "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E";
  const stakeAmount = ethers.parseUnits("10", 6); // 10 USC

  const [deployer] = await ethers.getSigners();
  const provider = deployer.provider;

  console.log("=".repeat(60));
  console.log("Debug USC TransferFrom");
  console.log("=".repeat(60));

  // Get USC contract with full interface
  const uscABI = [
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function implementation() view returns (address)",
    "function totalSupply() view returns (uint256)"
  ];

  const usc = new ethers.Contract(uscAddress, uscABI, provider);

  console.log("\n--- USC Token Info ---");
  console.log("Address:", uscAddress);
  try {
    console.log("Name:", await usc.name());
    console.log("Symbol:", await usc.symbol());
    console.log("Decimals:", await usc.decimals());
    console.log("Total Supply:", ethers.formatUnits(await usc.totalSupply(), 6));
  } catch (e) {
    console.log("Error getting token info:", e.message);
  }

  console.log("\n--- Check if USC is a Proxy ---");
  try {
    const impl = await usc.implementation();
    console.log("Implementation:", impl);
    console.log("USC is a PROXY contract");
  } catch (e) {
    console.log("No implementation() function - may not be a proxy or different proxy type");
  }

  // Check bytecode at address
  const code = await provider.getCode(uscAddress);
  console.log("Contract code size:", code.length, "bytes");

  console.log("\n--- Tester1 Status ---");
  const balance = await usc.balanceOf(tester1);
  const allowance = await usc.allowance(tester1, factoryAddress);
  console.log("Balance:", ethers.formatUnits(balance, 6), "USC");
  console.log("Allowance to Factory:", ethers.formatUnits(allowance, 6), "USC");
  console.log("Stake Amount:", ethers.formatUnits(stakeAmount, 6), "USC");

  // Try to simulate the transferFrom that the factory would do
  console.log("\n--- Simulating transferFrom (factory perspective) ---");
  console.log("This simulates: USC.transferFrom(tester1, factory, 10 USC)");

  // Encode the transferFrom call
  const iface = new ethers.Interface(["function transferFrom(address,address,uint256) returns (bool)"]);
  const calldata = iface.encodeFunctionData("transferFrom", [tester1, factoryAddress, stakeAmount]);
  console.log("Calldata:", calldata);

  // Try eth_call from factory's perspective
  try {
    const result = await provider.call({
      to: uscAddress,
      from: factoryAddress,
      data: calldata
    });
    console.log("eth_call result:", result);
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], result);
    console.log("Decoded result:", decoded[0]);
    console.log("✅ transferFrom WOULD succeed if called by factory");
  } catch (e) {
    console.log("❌ eth_call failed:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  // Check the factory's code to see if there's something wrong with how it calls
  console.log("\n--- Factory Contract Info ---");
  const factoryCode = await provider.getCode(factoryAddress);
  console.log("Factory code size:", factoryCode.length, "bytes");
  console.log("Factory code exists:", factoryCode.length > 2);

  // Try to call acceptMarket using eth_call from tester1
  console.log("\n--- Simulating acceptMarket(0) from Tester1 ---");
  const factoryABI = ["function acceptMarket(uint256 friendMarketId) payable"];
  const factoryIface = new ethers.Interface(factoryABI);
  const acceptCalldata = factoryIface.encodeFunctionData("acceptMarket", [0]);

  try {
    const result = await provider.call({
      to: factoryAddress,
      from: tester1,
      data: acceptCalldata
    });
    console.log("eth_call result:", result);
    console.log("✅ acceptMarket WOULD succeed");
  } catch (e) {
    console.log("❌ acceptMarket eth_call failed:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
      // Decode known errors
      const errorSelectors = {
        "0x06417a60": "InvalidMarketId()",
        "0x7dc6505a": "NotPending()",
        "0x70f65caa": "DeadlinePassed()",
        "0x1aa8064c": "AlreadyAccepted()",
        "0x779a6f41": "NotInvited()",
        "0x90b8ec18": "TransferFailed()",
        "0xcd1c8867": "InsufficientPayment()"
      };
      const selector = e.data?.slice(0, 10);
      if (errorSelectors[selector]) {
        console.log("Decoded error:", errorSelectors[selector]);
      }
    }
  }

  // Also try with deployer to compare
  console.log("\n--- Simulating acceptMarket(0) from Deployer (should fail with AlreadyAccepted or NotInvited) ---");
  try {
    const result = await provider.call({
      to: factoryAddress,
      from: deployer.address,
      data: acceptCalldata
    });
    console.log("eth_call result:", result);
  } catch (e) {
    console.log("Deployer acceptMarket failed (expected):", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
      const errorSelectors = {
        "0x06417a60": "InvalidMarketId()",
        "0x7dc6505a": "NotPending()",
        "0x70f65caa": "DeadlinePassed()",
        "0x1aa8064c": "AlreadyAccepted()",
        "0x779a6f41": "NotInvited()",
        "0x90b8ec18": "TransferFailed()",
        "0xcd1c8867": "InsufficientPayment()"
      };
      const selector = e.data?.slice(0, 10);
      if (errorSelectors[selector]) {
        console.log("Decoded error:", errorSelectors[selector]);
      }
    }
  }
}

main().catch(console.error);
