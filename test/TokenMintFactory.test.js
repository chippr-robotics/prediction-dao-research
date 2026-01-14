const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenMintFactory", function () {
  let tokenMintFactory;
  let roleManager;
  let owner, user1, user2;
  const TOKENMINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKENMINT_ROLE"));

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy RoleManager
    const RoleManager = await ethers.getContractFactory("TieredRoleManager");
    roleManager = await RoleManager.deploy();
    await roleManager.waitForDeployment();

    // Initialize with admin
    await roleManager.initialize(owner.address);
    
    // Set up TokenMint tier metadata (Bronze tier)
    await roleManager.setTierMetadata(
      TOKENMINT_ROLE,
      1, // Bronze
      "Token Mint Bronze",
      "Basic token mint tier",
      ethers.parseEther("150"),
      {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 10,
        maxPositionSize: ethers.parseEther("10"),
        maxConcurrentMarkets: 5,
        withdrawalLimit: ethers.parseEther("100"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: false,
        feeDiscount: 0
      },
      true // isActive
    );

    // Deploy TokenMintFactory
    const TokenMintFactory = await ethers.getContractFactory("TokenMintFactory");
    tokenMintFactory = await TokenMintFactory.deploy(await roleManager.getAddress());
    await tokenMintFactory.waitForDeployment();

    // Purchase TOKENMINT_ROLE for user1 (Bronze tier)
    const tierMetadata = await roleManager.tierMetadata(TOKENMINT_ROLE, 1); // Bronze = 1
    await roleManager.connect(user1).purchaseRoleWithTier(TOKENMINT_ROLE, 1, 30, {
      value: tierMetadata.price
    });
  });

  describe("ERC20 Token Creation", function () {
    it("Should create a basic ERC20 token", async function () {
      const name = "Test Token";
      const symbol = "TEST";
      const initialSupply = ethers.parseEther("1000000");
      const metadataURI = "ipfs://QmTest123";

      const tx = await tokenMintFactory.connect(user1).createERC20(
        name,
        symbol,
        initialSupply,
        metadataURI,
        false, // not burnable
        false, // not pausable
        false  // don't list on ETCSwap
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return tokenMintFactory.interface.parseLog(log).name === 'TokenCreated';
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      const parsedEvent = tokenMintFactory.interface.parseLog(event);
      expect(parsedEvent.args.owner).to.equal(user1.address);
      expect(parsedEvent.args.name).to.equal(name);
      expect(parsedEvent.args.symbol).to.equal(symbol);

      // Verify token info
      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.name).to.equal(name);
      expect(tokenInfo.symbol).to.equal(symbol);
      expect(tokenInfo.owner).to.equal(user1.address);
      expect(tokenInfo.metadataURI).to.equal(metadataURI);
      expect(tokenInfo.tokenType).to.equal(0); // ERC20
      expect(tokenInfo.isBurnable).to.equal(false);
      expect(tokenInfo.isPausable).to.equal(false);
    });

    it("Should create a burnable ERC20 token", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Burnable Token",
        "BURN",
        ethers.parseEther("1000"),
        "",
        true,  // burnable
        false, // not pausable
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.isBurnable).to.equal(true);
      expect(tokenInfo.isPausable).to.equal(false);
    });

    it("Should create a pausable ERC20 token", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Pausable Token",
        "PAUSE",
        ethers.parseEther("1000"),
        "",
        false, // not burnable
        true,  // pausable
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.isBurnable).to.equal(false);
      expect(tokenInfo.isPausable).to.equal(true);
    });

    it("Should create a burnable and pausable ERC20 token", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Full Feature Token",
        "FULL",
        ethers.parseEther("1000"),
        "",
        true, // burnable
        true, // pausable
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.isBurnable).to.equal(true);
      expect(tokenInfo.isPausable).to.equal(true);
    });

    it("Should fail without TOKENMINT_ROLE", async function () {
      await expect(
        tokenMintFactory.connect(user2).createERC20(
          "Test Token",
          "TEST",
          ethers.parseEther("1000"),
          "",
          false,
          false,
          false
        )
      ).to.be.revertedWith("Caller does not have TOKENMINT_ROLE");
    });

    it("Should require name and symbol", async function () {
      await expect(
        tokenMintFactory.connect(user1).createERC20(
          "",
          "TEST",
          ethers.parseEther("1000"),
          "",
          false,
          false,
          false
        )
      ).to.be.revertedWith("Name required");

      await expect(
        tokenMintFactory.connect(user1).createERC20(
          "Test Token",
          "",
          ethers.parseEther("1000"),
          "",
          false,
          false,
          false
        )
      ).to.be.revertedWith("Symbol required");
    });
  });

  describe("ERC721 Token Creation", function () {
    it("Should create a basic ERC721 collection", async function () {
      const name = "Test NFT";
      const symbol = "TNFT";
      const baseURI = "ipfs://QmBaseURI/";

      const tx = await tokenMintFactory.connect(user1).createERC721(
        name,
        symbol,
        baseURI,
        false // not burnable
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return tokenMintFactory.interface.parseLog(log).name === 'TokenCreated';
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      const parsedEvent = tokenMintFactory.interface.parseLog(event);
      expect(parsedEvent.args.owner).to.equal(user1.address);
      expect(parsedEvent.args.name).to.equal(name);
      expect(parsedEvent.args.symbol).to.equal(symbol);

      // Verify token info
      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.name).to.equal(name);
      expect(tokenInfo.symbol).to.equal(symbol);
      expect(tokenInfo.owner).to.equal(user1.address);
      expect(tokenInfo.metadataURI).to.equal(baseURI);
      expect(tokenInfo.tokenType).to.equal(1); // ERC721
      expect(tokenInfo.isBurnable).to.equal(false);
    });

    it("Should create a burnable ERC721 collection", async function () {
      await tokenMintFactory.connect(user1).createERC721(
        "Burnable NFT",
        "BNFT",
        "ipfs://base/",
        true // burnable
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.isBurnable).to.equal(true);
      expect(tokenInfo.tokenType).to.equal(1); // ERC721
    });

    it("Should fail without TOKENMINT_ROLE", async function () {
      await expect(
        tokenMintFactory.connect(user2).createERC721(
          "Test NFT",
          "TNFT",
          "ipfs://base/",
          false
        )
      ).to.be.revertedWith("Caller does not have TOKENMINT_ROLE");
    });
  });

  describe("Token Ownership Tracking", function () {
    it("Should track tokens owned by address", async function () {
      // Create multiple tokens
      await tokenMintFactory.connect(user1).createERC20(
        "Token 1",
        "TK1",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        false
      );

      await tokenMintFactory.connect(user1).createERC20(
        "Token 2",
        "TK2",
        ethers.parseEther("2000"),
        "",
        false,
        false,
        false
      );

      await tokenMintFactory.connect(user1).createERC721(
        "NFT 1",
        "NFT1",
        "ipfs://nft1/",
        false
      );

      const ownedTokens = await tokenMintFactory.getOwnerTokens(user1.address);
      expect(ownedTokens.length).to.equal(3);
      expect(ownedTokens[0]).to.equal(1);
      expect(ownedTokens[1]).to.equal(2);
      expect(ownedTokens[2]).to.equal(3);
    });

    it("Should allow reverse lookup by token address", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const tokenId = await tokenMintFactory.getTokenIdByAddress(tokenInfo.tokenAddress);
      expect(tokenId).to.equal(1);
    });
  });

  describe("Metadata Management", function () {
    it("Should allow owner to update metadata URI", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "ipfs://old",
        false,
        false,
        false
      );

      const newURI = "ipfs://new123";
      await tokenMintFactory.connect(user1).updateMetadataURI(1, newURI);

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.metadataURI).to.equal(newURI);
    });

    it("Should not allow non-owner to update metadata URI", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "ipfs://old",
        false,
        false,
        false
      );

      // Purchase role for user2
      const tierMetadata = await roleManager.tierMetadata(TOKENMINT_ROLE, 1); // Bronze = 1
      await roleManager.connect(user2).purchaseRoleWithTier(TOKENMINT_ROLE, 1, {
        value: tierMetadata.price
      });

      await expect(
        tokenMintFactory.connect(user2).updateMetadataURI(1, "ipfs://new")
      ).to.be.revertedWith("Not token owner");
    });
  });

  describe("ETCSwap Listing", function () {
    it("Should allow listing ERC20 on ETCSwap", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        false
      );

      await tokenMintFactory.connect(user1).listOnETCSwap(1);

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.listedOnETCSwap).to.equal(true);
    });

    it("Should auto-list on creation if requested", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        true // list on ETCSwap
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      expect(tokenInfo.listedOnETCSwap).to.equal(true);
    });

    it("Should not allow listing ERC721 on ETCSwap", async function () {
      await tokenMintFactory.connect(user1).createERC721(
        "Test NFT",
        "TNFT",
        "ipfs://base/",
        false
      );

      await expect(
        tokenMintFactory.connect(user1).listOnETCSwap(1)
      ).to.be.revertedWith("Only ERC20 can be listed on swap");
    });

    it("Should not allow duplicate listing", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        true // list on ETCSwap
      );

      await expect(
        tokenMintFactory.connect(user1).listOnETCSwap(1)
      ).to.be.revertedWith("Already listed");
    });

    it("Should not allow non-owner to list on ETCSwap", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        false
      );

      // Purchase role for user2
      const tierMetadata = await roleManager.tierMetadata(TOKENMINT_ROLE, 1); // Bronze = 1
      await roleManager.connect(user2).purchaseRoleWithTier(TOKENMINT_ROLE, 1, {
        value: tierMetadata.price
      });

      await expect(
        tokenMintFactory.connect(user2).listOnETCSwap(1)
      ).to.be.revertedWith("Not token owner");
    });
  });

  describe("Token Functionality", function () {
    it("Should allow minting tokens from ERC20Basic contract", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Test Token",
        "TEST",
        ethers.parseEther("1000"),
        "",
        false,
        false,
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const ERC20 = await ethers.getContractFactory("ERC20BasicImpl");
      const token = ERC20.attach(tokenInfo.tokenAddress);

      // Mint additional tokens
      await token.connect(user1).mint(user2.address, ethers.parseEther("500"));

      const balance = await token.balanceOf(user2.address);
      expect(balance).to.equal(ethers.parseEther("500"));
    });

    it("Should allow burning tokens from ERC20Burnable contract", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Burnable Token",
        "BURN",
        ethers.parseEther("1000"),
        "",
        true, // burnable
        false,
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const ERC20 = await ethers.getContractFactory("ERC20BurnableImpl");
      const token = ERC20.attach(tokenInfo.tokenAddress);

      const initialBalance = await token.balanceOf(user1.address);
      
      // Burn tokens
      await token.connect(user1).burn(ethers.parseEther("100"));

      const finalBalance = await token.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance - ethers.parseEther("100"));
    });

    it("Should allow pausing ERC20Pausable contract", async function () {
      await tokenMintFactory.connect(user1).createERC20(
        "Pausable Token",
        "PAUSE",
        ethers.parseEther("1000"),
        "",
        false,
        true, // pausable
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const ERC20 = await ethers.getContractFactory("ERC20PausableImpl");
      const token = ERC20.attach(tokenInfo.tokenAddress);

      // Pause the token
      await token.connect(user1).pause();

      // Transfers should fail when paused
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.reverted;

      // Unpause
      await token.connect(user1).unpause();

      // Transfers should work after unpause
      await token.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      const balance = await token.balanceOf(user2.address);
      expect(balance).to.equal(ethers.parseEther("100"));
    });

    it("Should allow minting NFTs from ERC721Basic contract", async function () {
      await tokenMintFactory.connect(user1).createERC721(
        "Test NFT",
        "TNFT",
        "ipfs://base/",
        false
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const ERC721 = await ethers.getContractFactory("ERC721BasicImpl");
      const nft = ERC721.attach(tokenInfo.tokenAddress);

      // Mint an NFT
      await nft.connect(user1).mint(user2.address, "ipfs://metadata/1");

      const owner = await nft.ownerOf(1);
      expect(owner).to.equal(user2.address);

      const uri = await nft.tokenURI(1);
      expect(uri).to.equal("ipfs://metadata/1");
    });

    it("Should allow burning NFTs from ERC721Burnable contract", async function () {
      await tokenMintFactory.connect(user1).createERC721(
        "Burnable NFT",
        "BNFT",
        "ipfs://base/",
        true // burnable
      );

      const tokenInfo = await tokenMintFactory.getTokenInfo(1);
      const ERC721 = await ethers.getContractFactory("ERC721BurnableImpl");
      const nft = ERC721.attach(tokenInfo.tokenAddress);

      // Mint an NFT
      await nft.connect(user1).mint(user1.address, "ipfs://metadata/1");

      // Burn the NFT
      await nft.connect(user1).burn(1);

      // Token should no longer exist
      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });
});
