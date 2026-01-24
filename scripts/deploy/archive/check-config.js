const { ethers } = require('hardhat');

const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const MEMBERSHIP_PAYMENT_MANAGER = '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28';
const ADMIN = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

const OPS_ADMIN = ethers.keccak256(ethers.toUtf8Bytes('OPERATIONS_ADMIN_ROLE'));
const DEFAULT_ADMIN = '0x0000000000000000000000000000000000000000000000000000000000000000';

async function main() {
  // Check PaymentProcessor configuration
  console.log('=== PaymentProcessor Configuration ===');
  const paymentProcessor = await ethers.getContractAt(
    [
      'function tierRegistry() view returns (address)',
      'function membershipManager() view returns (address)',
      'function paymentManager() view returns (address)',
      'function roleManagerCore() view returns (address)'
    ],
    PAYMENT_PROCESSOR
  );

  const tierReg = await paymentProcessor.tierRegistry();
  const memMgr = await paymentProcessor.membershipManager();
  const payMgr = await paymentProcessor.paymentManager();
  const roleMgr = await paymentProcessor.roleManagerCore();

  console.log('tierRegistry:', tierReg);
  console.log('membershipManager:', memMgr);
  console.log('paymentManager:', payMgr);
  console.log('roleManagerCore:', roleMgr);

  // Check if paymentManager matches MembershipPaymentManager
  console.log('\n=== Address Verification ===');
  console.log('Expected MembershipPaymentManager:', MEMBERSHIP_PAYMENT_MANAGER);
  console.log('PaymentProcessor.paymentManager:', payMgr);
  console.log('Match:', payMgr.toLowerCase() === MEMBERSHIP_PAYMENT_MANAGER.toLowerCase());

  // Check role admin for OPS_ADMIN
  console.log('\n=== Role Admin Check ===');
  const roleManager = await ethers.getContractAt(
    ['function getRoleAdmin(bytes32) view returns (bytes32)'],
    TIERED_ROLE_MANAGER
  );

  const opsRoleAdmin = await roleManager.getRoleAdmin(OPS_ADMIN);
  console.log('OPS_ADMIN role admin:', opsRoleAdmin);
  console.log('Is DEFAULT_ADMIN?:', opsRoleAdmin === DEFAULT_ADMIN);

  console.log('\n=== MembershipPaymentManager Check ===');
  const paymentManager = await ethers.getContractAt(
    [
      'function paymentTokens(address) view returns (address tokenAddress, bool isActive, uint8 decimals, string symbol)',
      'function treasury() view returns (address)'
    ],
    MEMBERSHIP_PAYMENT_MANAGER
  );

  try {
    const uscInfo = await paymentManager.paymentTokens(USC_ADDRESS);
    console.log('USC token:', uscInfo);
  } catch (e) {
    console.log('Error reading USC:', e.message);
  }

  try {
    const treasury = await paymentManager.treasury();
    console.log('Treasury:', treasury);
  } catch (e) {
    console.log('Error reading treasury:', e.message);
  }

  console.log('\n✅ Done!');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
