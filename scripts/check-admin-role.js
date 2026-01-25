const { ethers } = require("hardhat");

async function main() {
  const walletAddress = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  
  // Contract addresses from frontend config
  const roleManagerCore = "0x6a6422Ed3198332AC8DA2852BBff4749B66a3D8D";
  const tieredRoleManager = "0x55e6346Be542B13462De504FCC379a2477D227f0";
  
  console.log("Checking ADMIN role for:", walletAddress);
  console.log("DEFAULT_ADMIN_ROLE hash:", DEFAULT_ADMIN_ROLE);
  console.log("");
  
  // Check RoleManagerCore
  try {
    const rmCore = await ethers.getContractAt("AccessControl", roleManagerCore);
    const hasAdminCore = await rmCore.hasRole(DEFAULT_ADMIN_ROLE, walletAddress);
    console.log(`RoleManagerCore (${roleManagerCore}):`);
    console.log(`  hasRole(DEFAULT_ADMIN_ROLE) = ${hasAdminCore}`);
  } catch (e) {
    console.log(`RoleManagerCore error: ${e.message}`);
  }
  
  // Check TieredRoleManager
  try {
    const trm = await ethers.getContractAt("AccessControl", tieredRoleManager);
    const hasAdminTiered = await trm.hasRole(DEFAULT_ADMIN_ROLE, walletAddress);
    console.log(`TieredRoleManager (${tieredRoleManager}):`);
    console.log(`  hasRole(DEFAULT_ADMIN_ROLE) = ${hasAdminTiered}`);
  } catch (e) {
    console.log(`TieredRoleManager error: ${e.message}`);
  }
  
  // Check other admin roles
  const adminRoles = {
    "OPERATIONS_ADMIN": ethers.keccak256(ethers.toUtf8Bytes("OPERATIONS_ADMIN_ROLE")),
    "EMERGENCY_GUARDIAN": ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_GUARDIAN_ROLE")),
    "CORE_SYSTEM_ADMIN": ethers.keccak256(ethers.toUtf8Bytes("CORE_SYSTEM_ADMIN_ROLE")),
  };
  
  console.log("\nOther admin roles on TieredRoleManager:");
  try {
    const trm = await ethers.getContractAt("AccessControl", tieredRoleManager);
    for (const [name, hash] of Object.entries(adminRoles)) {
      const hasIt = await trm.hasRole(hash, walletAddress);
      console.log(`  ${name}: ${hasIt}`);
    }
  } catch (e) {
    console.log(`Error checking roles: ${e.message}`);
  }
}

main().catch(console.error);
