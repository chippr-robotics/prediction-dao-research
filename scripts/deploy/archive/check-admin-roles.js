const { ethers } = require('hardhat');

const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';
const ADMIN = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';

const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000';
const OPS_ADMIN = ethers.keccak256(ethers.toUtf8Bytes('OPERATIONS_ADMIN_ROLE'));

async function main() {
  const roleManager = await ethers.getContractAt(
    ['function hasRole(bytes32,address) view returns (bool)'],
    TIERED_ROLE_MANAGER
  );

  console.log('Checking ADMIN roles for:', ADMIN);
  console.log('DEFAULT_ADMIN_ROLE:', await roleManager.hasRole(DEFAULT_ADMIN, ADMIN));
  console.log('OPERATIONS_ADMIN_ROLE:', await roleManager.hasRole(OPS_ADMIN, ADMIN));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
