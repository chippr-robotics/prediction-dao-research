// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OracleResolver
 * @notice Multi-stage resolution with dispute mechanisms
 * @dev Implements UMA-style escalation for oracle resolution
 */
contract OracleResolver is Ownable, ReentrancyGuard {
    enum ResolutionStage {
        Unreported,
        DesignatedReporting,
        OpenChallenge,
        Dispute,
        Finalized
    }

    struct Report {
        address reporter;
        uint256 passValue;
        uint256 failValue;
        bytes evidence;
        uint256 timestamp;
        uint256 bond;
    }

    struct Challenge {
        address challenger;
        uint256 counterPassValue;
        uint256 counterFailValue;
        bytes counterEvidence;
        uint256 timestamp;
        uint256 bond;
    }

    struct Resolution {
        uint256 proposalId;
        ResolutionStage stage;
        Report report;
        Challenge challenge;
        uint256 finalPassValue;
        uint256 finalFailValue;
        bool finalized;
    }

    // Proposal ID => Resolution
    mapping(uint256 => Resolution) public resolutions;

    uint256 public constant SETTLEMENT_WINDOW = 3 days;
    uint256 public constant CHALLENGE_PERIOD = 2 days;
    uint256 public constant REPORTER_BOND = 100 ether;
    uint256 public constant CHALLENGER_BOND = 150 ether;

    // Designated reporters
    mapping(address => bool) public designatedReporters;

    bool private _initialized;

    event ReportSubmitted(
        uint256 indexed proposalId,
        address indexed reporter,
        uint256 passValue,
        uint256 failValue
    );
    event ReportChallenged(
        uint256 indexed proposalId,
        address indexed challenger,
        uint256 counterPassValue,
        uint256 counterFailValue
    );
    event DisputeEscalated(uint256 indexed proposalId);
    event ResolutionFinalized(uint256 indexed proposalId, uint256 passValue, uint256 failValue);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        _initialized = true;
        designatedReporters[initialOwner] = true;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Submit initial report for a proposal
     * @param proposalId ID of the proposal
     * @param passValue Welfare metric value if proposal passes
     * @param failValue Welfare metric value if proposal fails
     * @param evidence IPFS hash or URL of evidence
     */
    function submitReport(
        uint256 proposalId,
        uint256 passValue,
        uint256 failValue,
        bytes calldata evidence
    ) external payable nonReentrant {
        require(designatedReporters[msg.sender], "Not designated reporter");
        require(msg.value == REPORTER_BOND, "Incorrect bond amount");
        Resolution storage resolution = resolutions[proposalId];
        require(resolution.stage == ResolutionStage.Unreported, "Already reported");

        resolution.proposalId = proposalId;
        resolution.stage = ResolutionStage.DesignatedReporting;
        resolution.report = Report({
            reporter: msg.sender,
            passValue: passValue,
            failValue: failValue,
            evidence: evidence,
            timestamp: block.timestamp,
            bond: msg.value
        });

        emit ReportSubmitted(proposalId, msg.sender, passValue, failValue);
    }

    /**
     * @notice Challenge a report during challenge period
     * @param proposalId ID of the proposal
     * @param counterPassValue Alternative pass value
     * @param counterFailValue Alternative fail value
     * @param counterEvidence Counter-evidence
     */
    function challengeReport(
        uint256 proposalId,
        uint256 counterPassValue,
        uint256 counterFailValue,
        bytes calldata counterEvidence
    ) external payable nonReentrant {
        require(msg.value == CHALLENGER_BOND, "Incorrect bond amount");
        Resolution storage resolution = resolutions[proposalId];
        require(resolution.stage == ResolutionStage.DesignatedReporting, "Not in challenge period");
        require(block.timestamp <= resolution.report.timestamp + CHALLENGE_PERIOD, "Challenge period ended");

        resolution.stage = ResolutionStage.OpenChallenge;
        resolution.challenge = Challenge({
            challenger: msg.sender,
            counterPassValue: counterPassValue,
            counterFailValue: counterFailValue,
            counterEvidence: counterEvidence,
            timestamp: block.timestamp,
            bond: msg.value
        });

        emit ReportChallenged(proposalId, msg.sender, counterPassValue, counterFailValue);
    }

    /**
     * @notice Escalate to UMA dispute resolution
     * @param proposalId ID of the proposal
     */
    function escalateToUMA(uint256 proposalId) external onlyOwner {
        Resolution storage resolution = resolutions[proposalId];
        require(resolution.stage == ResolutionStage.OpenChallenge, "Not in challenge stage");

        resolution.stage = ResolutionStage.Dispute;
        emit DisputeEscalated(proposalId);
    }

    /**
     * @notice Finalize resolution after challenge period or dispute
     * @param proposalId ID of the proposal
     */
    function finalizeResolution(uint256 proposalId) external onlyOwner nonReentrant {
        Resolution storage resolution = resolutions[proposalId];
        require(!resolution.finalized, "Already finalized");
        require(
            resolution.stage == ResolutionStage.DesignatedReporting ||
            resolution.stage == ResolutionStage.OpenChallenge ||
            resolution.stage == ResolutionStage.Dispute,
            "Invalid stage"
        );

        // Initialize variables to prevent uninitialized variable warnings
        uint256 passValue = 0;
        uint256 failValue = 0;
        address bondRecipient = address(0);
        uint256 bondAmount = 0;

        if (resolution.stage == ResolutionStage.DesignatedReporting) {
            // No challenge, use reporter's values
            require(block.timestamp > resolution.report.timestamp + CHALLENGE_PERIOD, "Challenge period not ended");
            passValue = resolution.report.passValue;
            failValue = resolution.report.failValue;
            bondRecipient = resolution.report.reporter;
            bondAmount = resolution.report.bond;
        } else if (resolution.stage == ResolutionStage.OpenChallenge) {
            // Challenge accepted by owner, use challenger's values
            passValue = resolution.challenge.counterPassValue;
            failValue = resolution.challenge.counterFailValue;
            bondRecipient = resolution.challenge.challenger;
            bondAmount = resolution.report.bond + resolution.challenge.bond;
        } else if (resolution.stage == ResolutionStage.Dispute) {
            // Dispute resolved, owner sets final values
            passValue = resolution.report.passValue; // Can be overridden before calling
            failValue = resolution.report.failValue;
            bondRecipient = resolution.report.reporter; // Simplified
            bondAmount = resolution.report.bond;
        }

        resolution.finalPassValue = passValue;
        resolution.finalFailValue = failValue;
        resolution.finalized = true;
        resolution.stage = ResolutionStage.Finalized;

        // Return bonds to winning party
        if (bondAmount > 0 && bondRecipient != address(0)) {
            (bool success, ) = payable(bondRecipient).call{value: bondAmount}("");
            require(success, "Bond return failed");
        }

        emit ResolutionFinalized(proposalId, passValue, failValue);
    }

    /**
     * @notice Add designated reporter
     * @param reporter Address of reporter
     */
    function addDesignatedReporter(address reporter) external onlyOwner {
        require(reporter != address(0), "Invalid reporter");
        designatedReporters[reporter] = true;
        emit ReporterAdded(reporter);
    }

    /**
     * @notice Remove designated reporter
     * @param reporter Address of reporter
     */
    function removeDesignatedReporter(address reporter) external onlyOwner {
        designatedReporters[reporter] = false;
        emit ReporterRemoved(reporter);
    }

    /**
     * @notice Get resolution details
     * @param proposalId ID of the proposal
     */
    function getResolution(uint256 proposalId) external view returns (
        ResolutionStage stage,
        uint256 finalPassValue,
        uint256 finalFailValue,
        bool finalized
    ) {
        Resolution storage resolution = resolutions[proposalId];
        return (
            resolution.stage,
            resolution.finalPassValue,
            resolution.finalFailValue,
            resolution.finalized
        );
    }

    /**
     * @notice Get report details
     * @param proposalId ID of the proposal
     */
    function getReport(uint256 proposalId) external view returns (Report memory) {
        return resolutions[proposalId].report;
    }

    /**
     * @notice Get challenge details
     * @param proposalId ID of the proposal
     */
    function getChallenge(uint256 proposalId) external view returns (Challenge memory) {
        return resolutions[proposalId].challenge;
    }
}
