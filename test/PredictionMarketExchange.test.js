import { expect } from "chai";
import hre from "hardhat";

describe("PredictionMarketExchange", function () {
    let ethers;
    let exchange;
    let ctf1155;
    let collateralToken;
    let owner, feeRecipient, maker, taker, oracle;
    let makerAsset, takerAsset;
    let makerTokenId, takerTokenId;

    beforeEach(async function () {
        const connection = await hre.network.connect();
        ethers = connection.ethers;
        [owner, feeRecipient, maker, taker, oracle] = await ethers.getSigners();

        // Deploy CTF1155
        const CTF1155 = await ethers.getContractFactory("CTF1155");
        ctf1155 = await CTF1155.deploy();
        await ctf1155.waitForDeployment();

        // Deploy mock ERC20 collateral
        const MockERC20 = await ethers.getContractFactory("ConditionalToken");
        collateralToken = await MockERC20.deploy("Collateral", "COL");
        await collateralToken.waitForDeployment();

        // Deploy exchange
        const Exchange = await ethers.getContractFactory("PredictionMarketExchange");
        exchange = await Exchange.deploy(feeRecipient.address);
        await exchange.waitForDeployment();

        // Setup CTF positions
        const questionId = ethers.encodeBytes32String("Test question");
        await ctf1155.prepareCondition(oracle.address, questionId, 2);
        
        const conditionId = await ctf1155.getConditionId(oracle.address, questionId, 2);

        // Mint collateral and split positions
        await collateralToken.mint(maker.address, ethers.parseEther("1000"));
        await collateralToken.mint(taker.address, ethers.parseEther("1000"));

        await collateralToken.connect(maker).approve(await ctf1155.getAddress(), ethers.parseEther("500"));
        await collateralToken.connect(taker).approve(await ctf1155.getAddress(), ethers.parseEther("500"));

        await ctf1155.connect(maker).splitPosition(
            await collateralToken.getAddress(),
            ethers.ZeroHash,
            conditionId,
            [1, 2],
            ethers.parseEther("500")
        );

        await ctf1155.connect(taker).splitPosition(
            await collateralToken.getAddress(),
            ethers.ZeroHash,
            conditionId,
            [1, 2],
            ethers.parseEther("500")
        );

        // Get position IDs
        const yesCollection = await ctf1155.getCollectionId(ethers.ZeroHash, conditionId, 1);
        const noCollection = await ctf1155.getCollectionId(ethers.ZeroHash, conditionId, 2);
        
        makerTokenId = await ctf1155.getPositionId(await collateralToken.getAddress(), yesCollection);
        takerTokenId = await ctf1155.getPositionId(await collateralToken.getAddress(), noCollection);

        makerAsset = await ctf1155.getAddress();
        takerAsset = await ctf1155.getAddress();

        // Approve exchange
        await ctf1155.connect(maker).setApprovalForAll(await exchange.getAddress(), true);
        await ctf1155.connect(taker).setApprovalForAll(await exchange.getAddress(), true);
    });

    describe("Deployment", function () {
        it("Should set correct fee recipient", async function () {
            expect(await exchange.feeRecipient()).to.equal(feeRecipient.address);
        });

        it("Should set default fee to 10 bps (0.1%)", async function () {
            expect(await exchange.feeBps()).to.equal(10);
        });
    });

    describe("Order Creation and Hashing", function () {
        it("Should create valid order hash", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 1,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            const orderHash = await exchange.getOrderHash(order);
            expect(orderHash).to.not.equal(ethers.ZeroHash);
        });
    });

    describe("Single Order Filling", function () {
        it("Should fill a valid order", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 1,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            // Sign order
            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await maker.signTypedData(domain, types, order);

            // Fill order
            const takerBalanceBefore = await ctf1155.balanceOf(taker.address, makerTokenId);
            const makerBalanceBefore = await ctf1155.balanceOf(maker.address, takerTokenId);

            await exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("100"));

            // Verify balances
            const takerBalanceAfter = await ctf1155.balanceOf(taker.address, makerTokenId);
            const makerBalanceAfter = await ctf1155.balanceOf(maker.address, takerTokenId);
            const feeBalance = await ctf1155.balanceOf(feeRecipient.address, takerTokenId);

            expect(takerBalanceAfter - takerBalanceBefore).to.equal(ethers.parseEther("100"));
            
            // Maker receives taker amount minus fee (0.1%)
            const expectedFee = ethers.parseEther("100") * 10n / 10000n;
            expect(makerBalanceAfter - makerBalanceBefore).to.equal(ethers.parseEther("100") - expectedFee);
            expect(feeBalance).to.equal(expectedFee);
        });

        it("Should partially fill an order", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 2,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await maker.signTypedData(domain, types, order);

            // Partially fill (50%)
            await exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("50"));

            // Check filled amount
            const orderHash = await exchange.getOrderHash(order);
            const filledAmount = await exchange.getFilledAmount(orderHash);
            expect(filledAmount).to.equal(ethers.parseEther("50"));
        });

        it("Should reject expired order", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 3,
                expiration: (await ethers.provider.getBlock('latest')).timestamp - 3600, // Expired
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await maker.signTypedData(domain, types, order);

            await expect(
                exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("100"))
            ).to.be.revertedWith("Order expired");
        });

        it("Should reject invalid signature", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 4,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            // Sign with wrong signer
            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await taker.signTypedData(domain, types, order); // Wrong signer

            await expect(
                exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("100"))
            ).to.be.revertedWith("Invalid signature");
        });
    });

    describe("Order Cancellation", function () {
        it("Should cancel order by nonce", async function () {
            const nonce = 10;
            
            await exchange.connect(maker).cancelOrder(nonce);

            expect(await exchange.isCancelled(maker.address, nonce)).to.be.true;
        });

        it("Should batch cancel orders", async function () {
            const nonces = [11, 12, 13, 14, 15];
            
            await exchange.connect(maker).batchCancelOrders(nonces);

            for (const nonce of nonces) {
                expect(await exchange.isCancelled(maker.address, nonce)).to.be.true;
            }
        });

        it("Should reject filling cancelled order", async function () {
            const nonce = 20;
            await exchange.connect(maker).cancelOrder(nonce);

            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: nonce,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await maker.signTypedData(domain, types, order);

            await expect(
                exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("100"))
            ).to.be.revertedWith("Order cancelled");
        });
    });

    describe("Fee Management", function () {
        it("Should update fee", async function () {
            await exchange.setFeeBps(20); // 0.2%
            expect(await exchange.feeBps()).to.equal(20);
        });

        it("Should reject fee > 1%", async function () {
            await expect(
                exchange.setFeeBps(101)
            ).to.be.revertedWith("Fee too high");
        });

        it("Should update fee recipient", async function () {
            const [, , , , , newRecipient] = await ethers.getSigners();
            await exchange.setFeeRecipient(newRecipient.address);
            expect(await exchange.feeRecipient()).to.equal(newRecipient.address);
        });

        it("Should reject zero address fee recipient", async function () {
            await expect(
                exchange.setFeeRecipient(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid recipient");
        });

        it("Should reject fee changes from non-owner", async function () {
            await expect(
                exchange.connect(maker).setFeeBps(20)
            ).to.be.reverted;
        });
    });

    describe("Gas Optimization", function () {
        it("Should efficiently fill order", async function () {
            const order = {
                maker: maker.address,
                makerAsset: makerAsset,
                takerAsset: takerAsset,
                makerAmount: ethers.parseEther("100"),
                takerAmount: ethers.parseEther("100"),
                nonce: 100,
                expiration: (await ethers.provider.getBlock('latest')).timestamp + 3600,
                salt: ethers.randomBytes(32),
                isMakerERC1155: true,
                isTakerERC1155: true,
                makerTokenId: makerTokenId,
                takerTokenId: takerTokenId
            };

            const domain = {
                name: "PredictionMarketExchange",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await exchange.getAddress()
            };

            const types = {
                Order: [
                    { name: "maker", type: "address" },
                    { name: "makerAsset", type: "address" },
                    { name: "takerAsset", type: "address" },
                    { name: "makerAmount", type: "uint256" },
                    { name: "takerAmount", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "expiration", type: "uint256" },
                    { name: "salt", type: "bytes32" },
                    { name: "isMakerERC1155", type: "bool" },
                    { name: "isTakerERC1155", type: "bool" },
                    { name: "makerTokenId", type: "uint256" },
                    { name: "takerTokenId", type: "uint256" }
                ]
            };

            const signature = await maker.signTypedData(domain, types, order);

            const tx = await exchange.connect(taker).fillOrder(order, signature, ethers.parseEther("100"));
            const receipt = await tx.wait();
            
            console.log("      Gas used for order fill:", receipt.gasUsed.toString());
            
            // Should be under 200k gas for ERC1155 order
            expect(receipt.gasUsed < 200000n).to.be.true;
        });
    });
});
