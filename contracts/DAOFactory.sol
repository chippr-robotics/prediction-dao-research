// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./WelfareMetricRegistry.sol";
import "./ProposalRegistry.sol";
import "./ConditionalMarketFactory.sol";
import "./PrivacyCoordinator.sol";
import "./OracleResolver.sol";
import "./RagequitModule.sol";
import "./FutarchyGovernor.sol";

/**
 * @title DAOFactory
 * @notice Factory contract for deploying multiple DAO instances with role-based access control
 * @dev Uses OpenZeppelin AccessControl for managing administrators, participants, and other roles
 */
contract DAOFactory is AccessControl, ReentrancyGuard {
    // Role definitions
    bytes32 public constant PLATFORM_ADMIN_ROLE = keccak256("PLATFORM_ADMIN_ROLE");
    bytes32 public constant DAO_CREATOR_ROLE = keccak256("DAO_CREATOR_ROLE");

    struct DAOInstance {
        string name;
        string description;
        address futarchyGovernor;
        address welfareRegistry;
        address proposalRegistry;
        address marketFactory;
        address privacyCoordinator;
        address oracleResolver;
        address ragequitModule;
        address treasuryVault;
        address creator;
        uint256 createdAt;
        bool active;
    }

    // DAO ID => DAOInstance
    mapping(uint256 => DAOInstance) public daos;
    uint256 public daoCount;

    // User address => array of DAO IDs they're associated with
    mapping(address => uint256[]) public userDAOs;

    // DAO ID => address => role => bool
    mapping(uint256 => mapping(address => mapping(bytes32 => bool))) public daoRoles;

    // DAO-specific role definitions
    bytes32 public constant DAO_ADMIN_ROLE = keccak256("DAO_ADMIN_ROLE");
    bytes32 public constant DAO_PARTICIPANT_ROLE = keccak256("DAO_PARTICIPANT_ROLE");
    bytes32 public constant DAO_PROPOSER_ROLE = keccak256("DAO_PROPOSER_ROLE");
    bytes32 public constant DAO_ORACLE_ROLE = keccak256("DAO_ORACLE_ROLE");

    // Implementation contract addresses
    address public immutable welfareRegistryImpl;
    address public immutable proposalRegistryImpl;
    address public immutable marketFactoryImpl;
    address public immutable privacyCoordinatorImpl;
    address public immutable oracleResolverImpl;
    address public immutable ragequitModuleImpl;
    address public immutable futarchyGovernorImpl;

    event DAOCreated(
        uint256 indexed daoId,
        string name,
        address indexed creator,
        address futarchyGovernor,
        uint256 timestamp
    );

    event DAORoleGranted(
        uint256 indexed daoId,
        address indexed user,
        bytes32 indexed role
    );

    event DAORoleRevoked(
        uint256 indexed daoId,
        address indexed user,
        bytes32 indexed role
    );

    event DAOStatusUpdated(uint256 indexed daoId, bool active);

    constructor() {
        // Grant deployer the default admin role
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PLATFORM_ADMIN_ROLE, msg.sender);
        _grantRole(DAO_CREATOR_ROLE, msg.sender);

        // Set role admin relationships
        _setRoleAdmin(PLATFORM_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(DAO_CREATOR_ROLE, PLATFORM_ADMIN_ROLE);

        // Deploy implementation contracts once
        welfareRegistryImpl = address(new WelfareMetricRegistry());
        proposalRegistryImpl = address(new ProposalRegistry());
        marketFactoryImpl = address(new ConditionalMarketFactory());
        privacyCoordinatorImpl = address(new PrivacyCoordinator());
        oracleResolverImpl = address(new OracleResolver());
        ragequitModuleImpl = address(new RagequitModule());
        futarchyGovernorImpl = address(new FutarchyGovernor());
    }

    /**
     * @notice Deploy a new DAO instance with all required components
     * @param name Name of the DAO
     * @param description Description of the DAO
     * @param treasuryVault Address of the treasury vault
     * @param admins Array of addresses to grant DAO_ADMIN_ROLE
     * @return daoId ID of the newly created DAO
     */
    function createDAO(
        string memory name,
        string memory description,
        address treasuryVault,
        address[] memory admins
    ) external nonReentrant onlyRole(DAO_CREATOR_ROLE) returns (uint256 daoId) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(treasuryVault != address(0), "Invalid treasury vault");

        daoId = daoCount++;

        // Deploy components and governor
        (
            address futarchyGovernor,
            address welfareRegistry,
            address proposalRegistry,
            address marketFactory,
            address privacyCoordinator,
            address oracleResolver,
            address ragequitModule
        ) = _deployDAOComponents(treasuryVault);

        // Store DAO instance
        daos[daoId] = DAOInstance({
            name: name,
            description: description,
            futarchyGovernor: futarchyGovernor,
            welfareRegistry: welfareRegistry,
            proposalRegistry: proposalRegistry,
            marketFactory: marketFactory,
            privacyCoordinator: privacyCoordinator,
            oracleResolver: oracleResolver,
            ragequitModule: ragequitModule,
            treasuryVault: treasuryVault,
            creator: msg.sender,
            createdAt: block.timestamp,
            active: true
        });

        // Grant roles
        _setupDAORoles(daoId, admins);

        emit DAOCreated(daoId, name, msg.sender, futarchyGovernor, block.timestamp);
    }

    /**
     * @dev Internal function to deploy DAO components
     * @param treasuryVault Address of the treasury vault
     * @return Addresses of all deployed contracts
     */
    function _deployDAOComponents(address treasuryVault) 
        internal 
        returns (
            address,
            address,
            address,
            address,
            address,
            address,
            address
        ) 
    {
        // Clone DAO components using minimal proxies
        address welfareRegistry = Clones.clone(welfareRegistryImpl);
        address proposalRegistry = Clones.clone(proposalRegistryImpl);
        address marketFactory = Clones.clone(marketFactoryImpl);
        address privacyCoordinator = Clones.clone(privacyCoordinatorImpl);
        address oracleResolver = Clones.clone(oracleResolverImpl);
        address payable ragequitModule = payable(Clones.clone(ragequitModuleImpl));
        address payable futarchyGovernor = payable(Clones.clone(futarchyGovernorImpl));

        // Initialize clones (ownership starts with factory)
        WelfareMetricRegistry(welfareRegistry).initialize(address(this));
        ProposalRegistry(proposalRegistry).initialize(address(this));
        ConditionalMarketFactory(marketFactory).initialize(address(this));
        PrivacyCoordinator(privacyCoordinator).initialize(address(this));
        OracleResolver(oracleResolver).initialize(address(this));
        RagequitModule(ragequitModule).initialize(
            address(this),
            address(this), // Placeholder: DAO must set proper governance token after creation
            treasuryVault
        );

        // Initialize FutarchyGovernor - ownership remains with factory
        FutarchyGovernor(futarchyGovernor).initialize(
            address(this),
            welfareRegistry,
            proposalRegistry,
            marketFactory,
            privacyCoordinator,
            oracleResolver,
            ragequitModule,
            treasuryVault
        );

        // Transfer ownership of components to FutarchyGovernor
        WelfareMetricRegistry(welfareRegistry).transferOwnership(futarchyGovernor);
        ProposalRegistry(proposalRegistry).transferOwnership(futarchyGovernor);
        ConditionalMarketFactory(marketFactory).transferOwnership(futarchyGovernor);
        OracleResolver(oracleResolver).transferOwnership(futarchyGovernor);
        RagequitModule(ragequitModule).transferOwnership(futarchyGovernor);

        return (
            futarchyGovernor,
            welfareRegistry,
            proposalRegistry,
            marketFactory,
            privacyCoordinator,
            oracleResolver,
            ragequitModule
        );
    }

    /**
     * @dev Internal function to setup DAO roles
     * @param daoId ID of the DAO
     * @param admins Array of addresses to grant admin roles
     */
    function _setupDAORoles(uint256 daoId, address[] memory admins) internal {
        // Grant roles to creator
        _grantDAORole(daoId, msg.sender, DAO_ADMIN_ROLE);
        _grantDAORole(daoId, msg.sender, DAO_PARTICIPANT_ROLE);
        _grantDAORole(daoId, msg.sender, DAO_PROPOSER_ROLE);

        // Grant admin roles to specified addresses
        for (uint256 i = 0; i < admins.length; i++) {
            if (admins[i] != address(0) && admins[i] != msg.sender) {
                _grantDAORole(daoId, admins[i], DAO_ADMIN_ROLE);
                _grantDAORole(daoId, admins[i], DAO_PARTICIPANT_ROLE);
            }
        }
    }

    /**
     * @notice Grant a role to a user for a specific DAO
     * @param daoId ID of the DAO
     * @param user Address to grant role to
     * @param role Role to grant
     */
    function grantDAORole(
        uint256 daoId,
        address user,
        bytes32 role
    ) external {
        require(daoId < daoCount, "DAO does not exist");
        require(user != address(0), "Invalid user address");
        require(
            hasRole(PLATFORM_ADMIN_ROLE, msg.sender) ||
            daoRoles[daoId][msg.sender][DAO_ADMIN_ROLE],
            "Not authorized"
        );

        _grantDAORole(daoId, user, role);
    }

    /**
     * @notice Revoke a role from a user for a specific DAO
     * @param daoId ID of the DAO
     * @param user Address to revoke role from
     * @param role Role to revoke
     */
    function revokeDAORole(
        uint256 daoId,
        address user,
        bytes32 role
    ) external {
        require(daoId < daoCount, "DAO does not exist");
        require(
            hasRole(PLATFORM_ADMIN_ROLE, msg.sender) ||
            daoRoles[daoId][msg.sender][DAO_ADMIN_ROLE],
            "Not authorized"
        );

        _revokeDAORole(daoId, user, role);
    }

    /**
     * @notice Check if a user has a specific role for a DAO
     * @param daoId ID of the DAO
     * @param user Address to check
     * @param role Role to check
     * @return bool True if user has the role
     */
    function hasDAORole(
        uint256 daoId,
        address user,
        bytes32 role
    ) external view returns (bool) {
        return daoRoles[daoId][user][role] || hasRole(PLATFORM_ADMIN_ROLE, user);
    }

    /**
     * @notice Get all DAOs associated with a user
     * @param user Address to query
     * @return uint256[] Array of DAO IDs
     */
    function getUserDAOs(address user) external view returns (uint256[] memory) {
        return userDAOs[user];
    }

    /**
     * @notice Get DAO details
     * @param daoId ID of the DAO
     * @return DAOInstance struct
     */
    function getDAO(uint256 daoId) external view returns (DAOInstance memory) {
        require(daoId < daoCount, "DAO does not exist");
        return daos[daoId];
    }

    /**
     * @notice Get all DAOs (paginated)
     * @param start Start index
     * @param limit Number of DAOs to return
     * @return DAOInstance[] Array of DAO instances
     */
    function getAllDAOs(uint256 start, uint256 limit) 
        external 
        view 
        returns (DAOInstance[] memory) 
    {
        require(start < daoCount, "Start index out of bounds");
        
        uint256 end = start + limit;
        if (end > daoCount) {
            end = daoCount;
        }
        
        uint256 length = end - start;
        DAOInstance[] memory result = new DAOInstance[](length);
        
        for (uint256 i = 0; i < length; i++) {
            result[i] = daos[start + i];
        }
        
        return result;
    }

    /**
     * @notice Update DAO active status
     * @param daoId ID of the DAO
     * @param active New active status
     */
    function setDAOStatus(uint256 daoId, bool active) external onlyRole(PLATFORM_ADMIN_ROLE) {
        require(daoId < daoCount, "DAO does not exist");
        daos[daoId].active = active;
        emit DAOStatusUpdated(daoId, active);
    }

    /**
     * @dev Internal function to grant DAO role
     */
    function _grantDAORole(uint256 daoId, address user, bytes32 role) internal {
        daoRoles[daoId][user][role] = true;
        
        // Add to user's DAO list if not already present
        bool found = false;
        uint256[] storage userDaoList = userDAOs[user];
        for (uint256 i = 0; i < userDaoList.length; i++) {
            if (userDaoList[i] == daoId) {
                found = true;
                break;
            }
        }
        if (!found) {
            userDaoList.push(daoId);
        }
        
        emit DAORoleGranted(daoId, user, role);
    }

    /**
     * @dev Internal function to revoke DAO role
     */
    function _revokeDAORole(uint256 daoId, address user, bytes32 role) internal {
        if (daoRoles[daoId][user][role]) {
            daoRoles[daoId][user][role] = false;
            emit DAORoleRevoked(daoId, user, role);
        }
    }
}
