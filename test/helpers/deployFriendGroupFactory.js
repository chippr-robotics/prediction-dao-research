const { ethers } = require("hardhat");

/**
 * Deploy external libraries required by FriendGroupMarketFactory.
 * Returns a libraries object suitable for ethers.getContractFactory({ libraries }).
 */
async function deployFriendGroupLibraries() {
  const libs = {};
  for (const name of [
    "FriendGroupResolutionLib",
    "FriendGroupClaimsLib",
    "FriendGroupCreationLib",
  ]) {
    const Lib = await ethers.getContractFactory(name);
    const lib = await Lib.deploy();
    await lib.waitForDeployment();
    libs[name] = await lib.getAddress();
  }
  return libs;
}

/**
 * Get the FriendGroupMarketFactory contract factory with linked libraries.
 * Deploys the libraries first if not already deployed.
 */
async function getFriendGroupMarketFactoryWithLibs(libraries) {
  const libs = libraries || (await deployFriendGroupLibraries());
  return ethers.getContractFactory("FriendGroupMarketFactory", { libraries: libs });
}

module.exports = {
  deployFriendGroupLibraries,
  getFriendGroupMarketFactoryWithLibs,
};
