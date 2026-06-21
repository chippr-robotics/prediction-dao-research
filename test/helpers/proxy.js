const { ethers } = require("hardhat");

/// Deploy WagerRegistry behind an ERC1967 UUPS proxy and return the contract bound to the proxy address.
/// Mirrors production (the implementation's initializers are disabled by UUPSManaged; the proxy is
/// initialized once). `initArgs` is the same ordered list the former constructor took:
///   [admin, membershipManager, polymarketAdapter, initialTokens]
/// Manual proxy wiring (not the hardhat-upgrades plugin) keeps the large existing suite fast and free of the
/// plugin's build-info coupling; the plugin's storage-layout/safety validation is exercised separately in
/// test/upgradeable/ and via `npm run check:storage-layout`.
async function deployWagerRegistry(initArgs) {
  const Impl = await ethers.getContractFactory("WagerRegistry");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();

  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();

  return Impl.attach(await proxy.getAddress());
}

/// Deploy MembershipManager behind an ERC1967 UUPS proxy and return the contract bound to the proxy address
/// (spec 027). `initArgs` is the same ordered list the former constructor took:
///   [admin, paymentToken, treasury]
/// Same rationale as deployWagerRegistry: manual proxy wiring keeps the existing suite fast; the plugin's
/// storage-layout/safety validation is exercised in test/upgradeable/ and via `npm run check:storage-layout`.
async function deployMembershipManager(initArgs) {
  const Impl = await ethers.getContractFactory("MembershipManager");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();

  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();

  return Impl.attach(await proxy.getAddress());
}

module.exports = { deployWagerRegistry, deployMembershipManager };
