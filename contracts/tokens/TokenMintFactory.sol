// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../access/TieredRoleManager.sol";

/**
 * @title TokenMintFactory
 * @notice Factory for creating ERC-20 and ERC-721 tokens with OpenZeppelin standards
 * @dev Integrates with TieredRoleManager for access control and supports OpenSea metadata
 * 
 * Features:
 * - Create ERC-20 tokens with optional burn/pause functionality
 * - Create ERC-721 NFT collections with metadata URI support
 * - Track token ownership per wallet
 * - OpenSea metadata standard support (URI/IPFS CID)
 * - Optional ETCSwap listing integration
 * - Role-based access control via TOKENMINT_ROLE
 */
contract TokenMintFactory is ReentrancyGuard {
    
    // ========== Token Types ==========
    
    enum TokenType {
        ERC20,
        ERC721
    }
    
    // ========== Token Metadata ==========
    
    struct TokenInfo {
        uint256 tokenId;
        TokenType tokenType;
        address tokenAddress;
        address owner;
        string name;
        string symbol;
        string metadataURI; // IPFS CID or URI (OpenSea standard)
        uint256 createdAt;
        bool listedOnETCSwap;
        bool isBurnable;
        bool isPausable; // ERC20 only
    }
    
    // ========== State Variables ==========
    
    TieredRoleManager public roleManager;
    uint256 public tokenCount;
    
    // tokenId => TokenInfo
    mapping(uint256 => TokenInfo) public tokens;
    
    // owner address => array of token IDs
    mapping(address => uint256[]) public ownerTokens;
    
    // token address => token ID (for reverse lookup)
    mapping(address => uint256) public tokenAddressToId;
    
    // ========== Events ==========
    
    event TokenCreated(
        uint256 indexed tokenId,
        TokenType indexed tokenType,
        address indexed tokenAddress,
        address owner,
        string name,
        string symbol,
        string metadataURI
    );
    
    event TokenListedOnETCSwap(
        uint256 indexed tokenId,
        address indexed tokenAddress
    );
    
    event MetadataURIUpdated(
        uint256 indexed tokenId,
        string newURI
    );
    
    // ========== Constructor ==========
    
    constructor(address _roleManager) {
        require(_roleManager != address(0), "Invalid role manager");
        roleManager = TieredRoleManager(_roleManager);
    }
    
    // ========== Modifiers ==========
    
    modifier onlyTokenMinter() {
        require(
            roleManager.hasRole(roleManager.TOKENMINT_ROLE(), msg.sender),
            "Caller does not have TOKENMINT_ROLE"
        );
        _;
    }
    
    modifier onlyTokenOwner(uint256 tokenId) {
        require(tokens[tokenId].owner == msg.sender, "Not token owner");
        _;
    }
    
    // ========== Token Creation Functions ==========
    
    /**
     * @notice Create a new ERC-20 token
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply (in wei)
     * @param metadataURI IPFS CID or URI for token metadata (OpenSea standard)
     * @param isBurnable Whether token supports burning
     * @param isPausable Whether token supports pausing
     * @param listOnETCSwap Whether to list on ETCSwap
     * @return tokenId The ID of the created token
     */
    function createERC20(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        string memory metadataURI,
        bool isBurnable,
        bool isPausable,
        bool listOnETCSwap
    ) external onlyTokenMinter nonReentrant returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(symbol).length > 0, "Symbol required");
        
        // Create token contract based on features
        address tokenAddress;
        if (isPausable && isBurnable) {
            tokenAddress = address(new ERC20BurnablePausable(name, symbol, initialSupply, msg.sender));
        } else if (isBurnable) {
            tokenAddress = address(new ERC20BurnableToken(name, symbol, initialSupply, msg.sender));
        } else if (isPausable) {
            tokenAddress = address(new ERC20PausableToken(name, symbol, initialSupply, msg.sender));
        } else {
            tokenAddress = address(new ERC20Basic(name, symbol, initialSupply, msg.sender));
        }
        
        // Register token
        uint256 tokenId = ++tokenCount;
        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            tokenType: TokenType.ERC20,
            tokenAddress: tokenAddress,
            owner: msg.sender,
            name: name,
            symbol: symbol,
            metadataURI: metadataURI,
            createdAt: block.timestamp,
            listedOnETCSwap: false,
            isBurnable: isBurnable,
            isPausable: isPausable
        });
        
        ownerTokens[msg.sender].push(tokenId);
        tokenAddressToId[tokenAddress] = tokenId;
        
        emit TokenCreated(tokenId, TokenType.ERC20, tokenAddress, msg.sender, name, symbol, metadataURI);
        
        // List on ETCSwap if requested
        if (listOnETCSwap) {
            _listOnETCSwap(tokenId);
        }
        
        return tokenId;
    }
    
    /**
     * @notice Create a new ERC-721 NFT collection
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for token metadata (OpenSea standard)
     * @param isBurnable Whether NFTs support burning
     * @return tokenId The ID of the created token collection
     */
    function createERC721(
        string memory name,
        string memory symbol,
        string memory baseURI,
        bool isBurnable
    ) external onlyTokenMinter nonReentrant returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(symbol).length > 0, "Symbol required");
        
        // Create NFT collection contract
        address tokenAddress;
        if (isBurnable) {
            tokenAddress = address(new ERC721BurnableCollection(name, symbol, msg.sender));
        } else {
            tokenAddress = address(new ERC721Basic(name, symbol, msg.sender));
        }
        
        // Register token
        uint256 tokenId = ++tokenCount;
        tokens[tokenId] = TokenInfo({
            tokenId: tokenId,
            tokenType: TokenType.ERC721,
            tokenAddress: tokenAddress,
            owner: msg.sender,
            name: name,
            symbol: symbol,
            metadataURI: baseURI,
            createdAt: block.timestamp,
            listedOnETCSwap: false, // NFTs not listed on swap
            isBurnable: isBurnable,
            isPausable: false // NFTs don't have pause functionality
        });
        
        ownerTokens[msg.sender].push(tokenId);
        tokenAddressToId[tokenAddress] = tokenId;
        
        emit TokenCreated(tokenId, TokenType.ERC721, tokenAddress, msg.sender, name, symbol, baseURI);
        
        return tokenId;
    }
    
    // ========== Token Management Functions ==========
    
    /**
     * @notice Update metadata URI for a token
     * @param tokenId Token ID
     * @param newURI New metadata URI
     */
    function updateMetadataURI(uint256 tokenId, string memory newURI) 
        external 
        onlyTokenOwner(tokenId) 
    {
        require(tokenId > 0 && tokenId <= tokenCount, "Invalid token ID");
        tokens[tokenId].metadataURI = newURI;
        emit MetadataURIUpdated(tokenId, newURI);
    }
    
    /**
     * @notice List token on ETCSwap (placeholder for future integration)
     * @param tokenId Token ID
     */
    function listOnETCSwap(uint256 tokenId) 
        external 
        onlyTokenOwner(tokenId) 
    {
        _listOnETCSwap(tokenId);
    }
    
    function _listOnETCSwap(uint256 tokenId) internal {
        require(tokens[tokenId].tokenType == TokenType.ERC20, "Only ERC20 can be listed on swap");
        require(!tokens[tokenId].listedOnETCSwap, "Already listed");
        
        // TODO: Integrate with ETCSwap contract
        // For now, just mark as listed
        tokens[tokenId].listedOnETCSwap = true;
        
        emit TokenListedOnETCSwap(tokenId, tokens[tokenId].tokenAddress);
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Get all tokens owned by an address
     * @param owner Owner address
     * @return Array of token IDs
     */
    function getOwnerTokens(address owner) external view returns (uint256[] memory) {
        return ownerTokens[owner];
    }
    
    /**
     * @notice Get detailed token information
     * @param tokenId Token ID
     * @return TokenInfo struct
     */
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory) {
        require(tokenId > 0 && tokenId <= tokenCount, "Invalid token ID");
        return tokens[tokenId];
    }
    
    /**
     * @notice Get token ID from token address
     * @param tokenAddress Token contract address
     * @return Token ID
     */
    function getTokenIdByAddress(address tokenAddress) external view returns (uint256) {
        return tokenAddressToId[tokenAddress];
    }
}

// ========== Token Implementation Contracts ==========

/**
 * @title ERC20Basic
 * @notice Basic ERC20 token with no additional features
 */
contract ERC20Basic is ERC20, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/**
 * @title ERC20BurnableToken
 * @notice ERC20 token with burn functionality
 */
contract ERC20BurnableToken is ERC20, ERC20Burnable, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/**
 * @title ERC20PausableToken
 * @notice ERC20 token with pause functionality
 */
contract ERC20PausableToken is ERC20, ERC20Pausable, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}

/**
 * @title ERC20BurnablePausable
 * @notice ERC20 token with both burn and pause functionality
 */
contract ERC20BurnablePausable is ERC20, ERC20Burnable, ERC20Pausable, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}

/**
 * @title ERC721Basic
 * @notice Basic ERC721 NFT collection
 */
contract ERC721Basic is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;
    
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC721(name, symbol) Ownable(initialOwner) {}
    
    function mint(address to, string memory uri) external onlyOwner returns (uint256) {
        uint256 tokenId = ++_tokenIdCounter;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }
    
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

/**
 * @title ERC721BurnableCollection
 * @notice ERC721 NFT collection with burn functionality
 */
contract ERC721BurnableCollection is ERC721, ERC721URIStorage, ERC721Burnable, Ownable {
    uint256 private _tokenIdCounter;
    
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC721(name, symbol) Ownable(initialOwner) {}
    
    function mint(address to, string memory uri) external onlyOwner returns (uint256) {
        uint256 tokenId = ++_tokenIdCounter;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }
    
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
