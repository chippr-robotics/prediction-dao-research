import { expect } from "chai";
import hre from "hardhat";

describe("CTF1155 - Conditional Token Framework", function () {
    let ethers;
    let ctf1155;
    let collateralToken;
    let owner, oracle, user1, user2;
    let questionId;
    let conditionId;

    beforeEach(async function () {
        const connection = await hre.network.connect();
        ethers = connection.ethers;
        [owner, oracle, user1, user2] = await ethers.getSigners();

        // Deploy CTF1155
        const CTF1155 = await ethers.getContractFactory("CTF1155");
        ctf1155 = await CTF1155.deploy();
        await ctf1155.waitForDeployment();

        // Deploy mock ERC20 collateral token
        const MockERC20 = await ethers.getContractFactory("ConditionalToken");
        collateralToken = await MockERC20.deploy("Collateral", "COL");
        await collateralToken.waitForDeployment();

        // Mint collateral to users
        await collateralToken.mint(user1.address, ethers.parseEther("1000"));
        await collateralToken.mint(user2.address, ethers.parseEther("1000"));

        // Prepare question ID
        questionId = ethers.encodeBytes32String("Will it rain tomorrow?");
    });

    describe("Condition Preparation", function () {
        it("Should prepare a binary condition", async function () {
            const tx = await ctf1155.prepareCondition(oracle.address, questionId, 2);
            const receipt = await tx.wait();

            // Calculate expected condition ID
            const expectedConditionId = ethers.solidityPackedKeccak256(
                ["address", "bytes32", "uint256"],
                [oracle.address, questionId, 2]
            );

            // Check event
            const event = receipt.logs.find(log => {
                try {
                    const parsed = ctf1155.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsed && parsed.name === "ConditionPreparation";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;

            // Verify condition stored
            const [condOracle, condQuestionId, condOutcomeCount, condResolved] = await ctf1155.getCondition(expectedConditionId);
            expect(condOracle).to.equal(oracle.address);
            expect(condQuestionId).to.equal(questionId);
            expect(condOutcomeCount).to.equal(2);
            expect(condResolved).to.be.false;

            conditionId = expectedConditionId;
        });

        it("Should prepare a multi-outcome condition", async function () {
            await ctf1155.prepareCondition(oracle.address, questionId, 4);

            const condId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 4]);

            const [, , condOutcomeCount] = await ctf1155.getCondition(condId);
            expect(condOutcomeCount).to.equal(4);
        });

        it("Should reject condition with < 2 outcomes", async function () {
            await expect(
                ctf1155.prepareCondition(oracle.address, questionId, 1)
            ).to.be.revertedWith("At least 2 outcomes required");
        });

        it("Should reject duplicate condition", async function () {
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            
            await expect(
                ctf1155.prepareCondition(oracle.address, questionId, 2)
            ).to.be.revertedWith("Condition already prepared");
        });

        it("Should reject condition with > 256 outcomes", async function () {
            await expect(
                ctf1155.prepareCondition(oracle.address, questionId, 257)
            ).to.be.revertedWith("Too many outcomes");
        });
    });

    describe("Position Splitting", function () {
        beforeEach(async function () {
            // Prepare condition
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);
        });

        it("Should split collateral into conditional tokens", async function () {
            const amount = ethers.parseEther("100");
            
            // Approve collateral
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);

            // Split into YES (index 1) and NO (index 2) positions
            const partition = [1, 2]; // Binary: 01 and 10
            const parentCollectionId = ethers.ZeroHash;

            await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                parentCollectionId,
                conditionId,
                partition,
                amount
            );

            // Verify balances
            const yesCollectionId = await ctf1155.getCollectionId(parentCollectionId, conditionId, 1);
            const noCollectionId = await ctf1155.getCollectionId(parentCollectionId, conditionId, 2);
            
            const yesPositionId = await ctf1155.getPositionId(await collateralToken.getAddress(), yesCollectionId);
            const noPositionId = await ctf1155.getPositionId(await collateralToken.getAddress(), noCollectionId);

            expect(await ctf1155.balanceOf(user1.address, yesPositionId)).to.equal(amount);
            expect(await ctf1155.balanceOf(user1.address, noPositionId)).to.equal(amount);
        });

        it("Should reject split with zero amount", async function () {
            await expect(
                ctf1155.connect(user1).splitPosition(
                    await collateralToken.getAddress(),
                    ethers.ZeroHash,
                    conditionId,
                    [1, 2],
                    0
                )
            ).to.be.revertedWith("Amount must be positive");
        });

        it("Should reject split with single partition", async function () {
            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);

            await expect(
                ctf1155.connect(user1).splitPosition(
                    await collateralToken.getAddress(),
                    ethers.ZeroHash,
                    conditionId,
                    [3], // Only one partition
                    amount
                )
            ).to.be.revertedWith("Partition must have at least 2 parts");
        });

        it("Should reject split with invalid partition", async function () {
            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);

            await expect(
                ctf1155.connect(user1).splitPosition(
                    await collateralToken.getAddress(),
                    ethers.ZeroHash,
                    conditionId,
                    [0, 1], // Invalid: 0 in partition
                    amount
                )
            ).to.be.revertedWith("Invalid partition");
        });

        it("Should support combinatorial outcomes", async function () {
            // Prepare 3-outcome condition
            const question2 = ethers.encodeBytes32String("Election outcome?");
            await ctf1155.prepareCondition(oracle.address, question2, 3);
            
            const cond2 = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, question2, 3]);

            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);

            // Split into: A (001), B (010), C (100) - non-overlapping
            const partition = [1, 2, 4]; // Binary: 001, 010, 100
            
            await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                cond2,
                partition,
                amount
            );

            // Verify all positions created
            const collectionA = await ctf1155.getCollectionId(ethers.ZeroHash, cond2, 1);
            const positionA = await ctf1155.getPositionId(await collateralToken.getAddress(), collectionA);
            expect(await ctf1155.balanceOf(user1.address, positionA)).to.equal(amount);
        });
    });

    describe("Position Merging", function () {
        beforeEach(async function () {
            // Prepare condition and split positions
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);

            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);
            await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [1, 2],
                amount
            );
        });

        it("Should merge conditional tokens back to collateral", async function () {
            const amount = ethers.parseEther("50");
            const initialBalance = await collateralToken.balanceOf(user1.address);

            await ctf1155.connect(user1).mergePositions(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [1, 2],
                amount
            );

            // Verify collateral returned
            const finalBalance = await collateralToken.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(amount);

            // Verify positions burned
            const yesCollection = await ctf1155.getCollectionId(ethers.ZeroHash, conditionId, 1);
            const yesPosition = await ctf1155.getPositionId(await collateralToken.getAddress(), yesCollection);
            expect(await ctf1155.balanceOf(user1.address, yesPosition)).to.equal(ethers.parseEther("50"));
        });

        it("Should reject merge with zero amount", async function () {
            await expect(
                ctf1155.connect(user1).mergePositions(
                    await collateralToken.getAddress(),
                    ethers.ZeroHash,
                    conditionId,
                    [1, 2],
                    0
                )
            ).to.be.revertedWith("Amount must be positive");
        });
    });

    describe("Condition Resolution", function () {
        beforeEach(async function () {
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);
        });

        it("Should report payouts for binary condition", async function () {
            const payouts = [1, 0]; // YES wins, NO loses
            
            await ctf1155.connect(oracle).reportPayouts(questionId, payouts);

            const [, , , resolved] = await ctf1155.getCondition(conditionId);
            expect(resolved).to.be.true;
            expect(await ctf1155.getPayoutDenominator(conditionId)).to.equal(1);

            const nums = await ctf1155.getPayoutNumerators(conditionId);
            expect(nums[0]).to.equal(1);
            expect(nums[1]).to.equal(0);
        });

        it("Should report partial payouts", async function () {
            const payouts = [3, 1]; // 75% YES, 25% NO
            
            await ctf1155.connect(oracle).reportPayouts(questionId, payouts);

            expect(await ctf1155.getPayoutDenominator(conditionId)).to.equal(4);
        });

        it("Should reject payout from non-oracle", async function () {
            await expect(
                ctf1155.connect(user1).reportPayouts(questionId, [1, 0])
            ).to.be.revertedWith("Not the oracle");
        });

        it("Should reject payout for resolved condition", async function () {
            await ctf1155.connect(oracle).reportPayouts(questionId, [1, 0]);
            
            await expect(
                ctf1155.connect(oracle).reportPayouts(questionId, [0, 1])
            ).to.be.revertedWith("Already resolved");
        });

        it("Should reject invalid payout array", async function () {
            // The reportPayouts function calculates conditionId using msg.sender + questionId + payouts.length
            // So passing wrong number of payouts will look for non-existent condition
            // To properly test invalid payout length, we need a 3-outcome condition
            const question3 = ethers.encodeBytes32String("3-outcome");
            await ctf1155.prepareCondition(oracle.address, question3, 3);
            
            // Try to report with 2 payouts for a 3-outcome condition - this will look for wrong condition
            // Actually this test demonstrates the security feature: can't report payouts for wrong outcome count
            await expect(
                ctf1155.connect(oracle).reportPayouts(question3, [1, 0])
            ).to.be.revertedWith("Not the oracle"); // Condition with 2 outcomes doesn't exist
        });

        it("Should reject zero denominator", async function () {
            await expect(
                ctf1155.connect(oracle).reportPayouts(questionId, [0, 0])
            ).to.be.revertedWith("Payout denominator must be positive");
        });
    });

    describe("Position Redemption", function () {
        beforeEach(async function () {
            // Prepare, split, and resolve condition
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);

            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);
            await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [1, 2],
                amount
            );

            // Resolve: YES wins fully
            await ctf1155.connect(oracle).reportPayouts(questionId, [1, 0]);
        });

        it("Should redeem winning position", async function () {
            const initialBalance = await collateralToken.balanceOf(user1.address);

            await ctf1155.connect(user1).redeemPositions(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [1] // Redeem YES position
            );

            const finalBalance = await collateralToken.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("100"));

            // Position should be burned
            const yesCollection = await ctf1155.getCollectionId(ethers.ZeroHash, conditionId, 1);
            const yesPosition = await ctf1155.getPositionId(await collateralToken.getAddress(), yesCollection);
            expect(await ctf1155.balanceOf(user1.address, yesPosition)).to.equal(0);
        });

        it("Should redeem losing position (gets nothing)", async function () {
            const initialBalance = await collateralToken.balanceOf(user1.address);

            await ctf1155.connect(user1).redeemPositions(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [2] // Redeem NO position (loser)
            );

            const finalBalance = await collateralToken.balanceOf(user1.address);
            expect(finalBalance).to.equal(initialBalance); // No payout for losing position
        });

        it("Should redeem partial payout", async function () {
            // Create new condition with partial payout
            const question2 = ethers.encodeBytes32String("Partial outcome?");
            await ctf1155.prepareCondition(oracle.address, question2, 2);
            
            const cond2 = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, question2, 2]);

            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);
            await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                cond2,
                [1, 2],
                amount
            );

            // Resolve with 75% / 25% split
            await ctf1155.connect(oracle).reportPayouts(question2, [3, 1]);

            const initialBalance = await collateralToken.balanceOf(user1.address);

            // Redeem YES position (should get 75%)
            await ctf1155.connect(user1).redeemPositions(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                cond2,
                [1]
            );

            const finalBalance = await collateralToken.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("75"));
        });

        it("Should reject redemption before resolution", async function () {
            const question2 = ethers.encodeBytes32String("Unresolved?");
            await ctf1155.prepareCondition(oracle.address, question2, 2);
            
            const cond2 = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, question2, 2]);

            await expect(
                ctf1155.connect(user1).redeemPositions(
                    await collateralToken.getAddress(),
                    ethers.ZeroHash,
                    cond2,
                    [1]
                )
            ).to.be.revertedWith("Condition not resolved");
        });
    });

    describe("View Functions", function () {
        it("Should calculate correct condition ID", async function () {
            const expectedId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);

            const calculatedId = await ctf1155.getConditionId(oracle.address, questionId, 2);
            expect(calculatedId).to.equal(expectedId);
        });

        it("Should calculate correct collection ID", async function () {
            const parentId = ethers.ZeroHash;
            const condId = ethers.encodeBytes32String("condition");
            const indexSet = 1;

            const expectedId = ethers.solidityPackedKeccak256(["bytes32", "bytes32", "uint256"], [parentId, condId, indexSet]);

            const calculatedId = await ctf1155.getCollectionId(parentId, condId, indexSet);
            expect(calculatedId).to.equal(expectedId);
        });

        it("Should check resolution status", async function () {
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            const condId = await ctf1155.getConditionId(oracle.address, questionId, 2);

            expect(await ctf1155.isResolved(condId)).to.be.false;

            await ctf1155.connect(oracle).reportPayouts(questionId, [1, 0]);

            expect(await ctf1155.isResolved(condId)).to.be.true;
        });
    });

    describe("Gas Efficiency", function () {
        it("Should efficiently batch split positions", async function () {
            await ctf1155.prepareCondition(oracle.address, questionId, 2);
            conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [oracle.address, questionId, 2]);

            const amount = ethers.parseEther("100");
            await collateralToken.connect(user1).approve(await ctf1155.getAddress(), amount);

            const tx = await ctf1155.connect(user1).splitPosition(
                await collateralToken.getAddress(),
                ethers.ZeroHash,
                conditionId,
                [1, 2],
                amount
            );

            const receipt = await tx.wait();
            console.log("      Gas used for split:", receipt.gasUsed.toString());
            
            // Should be under 200k gas for binary split
            expect(receipt.gasUsed < 200000n).to.be.true;
        });
    });
});
