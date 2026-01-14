const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Check raw storage for authorizedExtensions mapping
 */

const TIER_REGISTRY = '0x31405f0359703109C424d31A86bd7CEF08836A12';
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';

async function main() {
  console.log("Checking TierRegistry storage...\n");

  // Storage layout for TierRegistry:
  // Slot 0: Ownable - _owner (address)
  // Slot 1: _initialized (bool) + roleManagerCore (address) - packed? No, separate
  // Let me check the actual layout...

  // Actually, let's just read the storage slots
  for (let i = 0; i < 10; i++) {
    const slot = await ethers.provider.getStorage(TIER_REGISTRY, i);
    console.log(`Slot ${i}: ${slot}`);
  }

  console.log("\n--- Checking authorizedExtensions mapping ---");

  // authorizedExtensions is at slot 2 (after _initialized at 0, roleManagerCore at 1... but need to verify)
  // For OZ Ownable, _owner is at slot 0
  // Then _initialized (bool) likely slot 1
  // roleManagerCore (address) likely slot 2
  // authorizedExtensions (mapping) likely slot 3

  // For a mapping(address => bool) at slot N:
  // storage[keccak256(abi.encode(key, N))] = value

  // Let's try different slots for the mapping
  for (let mappingSlot = 0; mappingSlot < 10; mappingSlot++) {
    const storageKey = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [PAYMENT_PROCESSOR, mappingSlot]
      )
    );

    const value = await ethers.provider.getStorage(TIER_REGISTRY, storageKey);

    if (value !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log(`Found non-zero value at mapping slot ${mappingSlot}!`);
      console.log(`  Storage key: ${storageKey}`);
      console.log(`  Value: ${value}`);
    }
  }

  // Also check what the contract function returns
  console.log("\n--- Checking via contract call ---");
  const tierRegistry = await ethers.getContractAt("TierRegistry", TIER_REGISTRY);

  try {
    const owner = await tierRegistry.owner();
    console.log("owner():", owner);
  } catch (e) {
    console.log("owner() failed:", e.message);
  }

  try {
    const roleManagerCore = await tierRegistry.roleManagerCore();
    console.log("roleManagerCore():", roleManagerCore);
  } catch (e) {
    console.log("roleManagerCore() failed:", e.message);
  }

  try {
    const authorized = await tierRegistry.authorizedExtensions(PAYMENT_PROCESSOR);
    console.log("authorizedExtensions(PaymentProcessor):", authorized);
  } catch (e) {
    console.log("authorizedExtensions() failed:", e.message);
  }

  // Check contract bytecode
  console.log("\n--- Checking contract bytecode ---");
  const code = await ethers.provider.getCode(TIER_REGISTRY);
  console.log("Contract code length:", code.length);
  console.log("First 100 chars:", code.substring(0, 100));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
