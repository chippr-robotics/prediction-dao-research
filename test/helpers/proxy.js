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

/// Deploy the three OZ-5-native clone implementation templates (spec 028) and return their addresses.
async function deployTokenTemplates() {
  const OpenERC20 = await ethers.getContractFactory("OpenERC20");
  const openERC20Impl = await OpenERC20.deploy();
  await openERC20Impl.waitForDeployment();

  const OpenERC721 = await ethers.getContractFactory("OpenERC721");
  const openERC721Impl = await OpenERC721.deploy();
  await openERC721Impl.waitForDeployment();

  const RestrictedERC20 = await ethers.getContractFactory("RestrictedERC20");
  const restrictedERC20Impl = await RestrictedERC20.deploy();
  await restrictedERC20Impl.waitForDeployment();

  return {
    openERC20Impl: await openERC20Impl.getAddress(),
    openERC721Impl: await openERC721Impl.getAddress(),
    restrictedERC20Impl: await restrictedERC20Impl.getAddress(),
  };
}

/// Deploy TokenFactory behind an ERC1967 UUPS proxy (spec 028) with freshly-deployed templates, and return the
/// contract bound to the proxy address. `opts.admin` is required; `opts.sanctionsGuard` defaults to zero
/// (screening disabled). Same manual-proxy rationale as the helpers above.
async function deployTokenFactory({ admin, sanctionsGuard = ethers.ZeroAddress } = {}) {
  const templates = await deployTokenTemplates();

  const Impl = await ethers.getContractFactory("TokenFactory");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();

  const initArgs = [
    admin,
    sanctionsGuard,
    templates.openERC20Impl,
    templates.openERC721Impl,
    templates.restrictedERC20Impl,
  ];
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();

  const factory = Impl.attach(await proxy.getAddress());
  return { factory, templates };
}

/// Deploy the three role-based v2 clone templates (spec 028 expansion) and return their addresses.
async function deployTokenTemplatesV2() {
  const out = {};
  for (const [name, key] of [
    ["OpenERC20V2", "openERC20V2Impl"],
    ["OpenERC721V2", "openERC721V2Impl"],
    ["RestrictedERC20V2", "restrictedERC20V2Impl"],
  ]) {
    const C = await ethers.getContractFactory(name);
    const c = await C.deploy();
    await c.waitForDeployment();
    out[key] = await c.getAddress();
  }
  return out;
}

/// Deploy TokenFactory with BOTH v1 and v2 templates registered (admin sets the v2 slots). `admin` must be the
/// proxy admin signer so setV2Template is authorized. Returns { factory, templates, v2 }.
async function deployTokenFactoryV2({ adminSigner, sanctionsGuard = ethers.ZeroAddress } = {}) {
  const { factory, templates } = await deployTokenFactory({ admin: adminSigner.address, sanctionsGuard });
  const v2 = await deployTokenTemplatesV2();
  const Standard = { OPEN_ERC20: 0, OPEN_ERC721: 1, RESTRICTED_ERC1404: 2 };
  await factory.connect(adminSigner).setV2Template(Standard.OPEN_ERC20, v2.openERC20V2Impl);
  await factory.connect(adminSigner).setV2Template(Standard.OPEN_ERC721, v2.openERC721V2Impl);
  await factory.connect(adminSigner).setV2Template(Standard.RESTRICTED_ERC1404, v2.restrictedERC20V2Impl);
  return { factory, templates, v2 };
}

module.exports = {
  deployWagerRegistry,
  deployMembershipManager,
  deployTokenTemplates,
  deployTokenFactory,
  deployTokenTemplatesV2,
  deployTokenFactoryV2,
};
