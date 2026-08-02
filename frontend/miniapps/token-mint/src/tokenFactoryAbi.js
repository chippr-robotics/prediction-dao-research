// Hand-authored ABIs for the spec-028 token-mint module (frontend ABIs are hand-maintained — the sync script
// only updates addresses). Keep these in step with contracts/tokens/*.sol after any interface change.

export const TOKEN_FACTORY_ABI = [
  // issuance (v1 — open/Ownable)
  'function createOpenERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, string metadataURI, bool burnable, bool pausable) returns (uint256 id, address token)',
  'function createOpenERC721(string name, string symbol, string baseURI, bool burnable) returns (uint256 id, address token)',
  'function createRestrictedERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, string metadataURI, address[] initialEligible) returns (uint256 id, address token)',
  // issuance (v2 — role-based + optional cap; cap 0 = uncapped)
  'function createOpenERC20V2(string name, string symbol, uint8 decimals, uint256 initialSupply, uint256 cap, string metadataURI) returns (uint256 id, address token)',
  'function createOpenERC721V2(string name, string symbol, string baseURI) returns (uint256 id, address token)',
  'function createRestrictedERC20V2(string name, string symbol, uint8 decimals, uint256 initialSupply, uint256 cap, string metadataURI, address[] initialEligible) returns (uint256 id, address token)',
  // v2 template slots (presence ⇒ v2 issuance available on this network)
  'function openERC20V2Impl() view returns (address)',
  'function openERC721V2Impl() view returns (address)',
  'function restrictedERC20V2Impl() view returns (address)',
  // registry views
  'function getToken(uint256 id) view returns (tuple(uint256 id, uint8 standard, address tokenAddress, address issuer, string name, string symbol, string metadataURI, bool isBurnable, bool isPausable, tuple(address identityRegistry, address compliance, address claimTopicsRegistry, address trustedIssuersRegistry) suite, uint64 createdAt))',
  'function getTokensByIssuer(address issuer) view returns (uint256[])',
  'function getTokenIdByAddress(address token) view returns (uint256)',
  'function tokenCount() view returns (uint256)',
  // roles
  'function TOKEN_ISSUER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  // events
  'event TokenCreated(uint256 indexed id, uint8 indexed standard, address indexed token, address issuer, string name, string symbol)',
]

export const OPEN_ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function burnable() view returns (bool)',
  'function pausable() view returns (bool)',
  'function paused() view returns (bool)',
  'function mint(address to, uint256 amount)',
  'function burn(uint256 value)',
  'function pause()',
  'function unpause()',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferOwnership(address newOwner)',
]

export const OPEN_ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function owner() view returns (address)',
  'function burnable() view returns (bool)',
  'function baseTokenURI() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function mint(address to, string uri) returns (uint256 tokenId)',
  'function burn(uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function transferOwnership(address newOwner)',
]

export const RESTRICTED_ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function eligible(address) view returns (bool)',
  'function frozen(address) view returns (bool)',
  'function detectTransferRestriction(address from, address to, uint256 value) view returns (uint8)',
  'function messageForTransferRestriction(uint8 code) view returns (string)',
  'function setEligible(address account, bool ok)',
  'function setEligibleBatch(address[] accounts, bool ok)',
  'function setFrozen(address account, bool isFrozen)',
  'function mint(address to, uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferOwnership(address newOwner)',
]

// --- v2 role-based templates (spec 028 expansion) ---

// Shared AccessControl + role-id + ownership surface for all v2 templates.
const V2_ROLE_SURFACE = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleMember(bytes32 role, uint256 index) view returns (address)',
  'function getRoleMemberCount(bytes32 role) view returns (uint256)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function MINTER_ROLE() view returns (bytes32)',
  'function PAUSER_ROLE() view returns (bytes32)',
  'function BURNER_ROLE() view returns (bytes32)',
  'function transferOwnership(address newOwner)',
  'function renounceOwnership()',
  // freeze list (FR-033)
  'function frozen(address) view returns (bool)',
  'function frozenCount() view returns (uint256)',
  'function frozenAt(uint256 index) view returns (address)',
  'function paused() view returns (bool)',
  'function pause()',
  'function unpause()',
]

export const OPEN_ERC20_V2_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function cap() view returns (uint256)',
  'function capped() view returns (bool)',
  'function setFrozen(address account, bool isFrozen)',
  'function mint(address to, uint256 amount)',
  'function adminBurn(address from, uint256 amount)',
  'function burn(uint256 value)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function batchTransfer(address[] recipients, uint256[] amounts)',
  'function batchMint(address[] recipients, uint256[] amounts)',
  ...V2_ROLE_SURFACE,
]

export const OPEN_ERC721_V2_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function baseTokenURI() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function setFrozen(address account, bool isFrozen)',
  'function mint(address to, string uri) returns (uint256 tokenId)',
  'function batchMint(address[] recipients, string[] uris)',
  'function burn(uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  ...V2_ROLE_SURFACE,
]

export const RESTRICTED_ERC20_V2_ABI = [
  ...OPEN_ERC20_V2_ABI,
  'function COMPLIANCE_ROLE() view returns (bytes32)',
  'function eligible(address) view returns (bool)',
  'function eligibilityEnforced() view returns (bool)',
  'function defaultRestrictionMessage() view returns (string)',
  'function detectTransferRestriction(address from, address to, uint256 value) view returns (uint8)',
  'function messageForTransferRestriction(uint8 code) view returns (string)',
  'function setEligible(address account, bool ok)',
  'function setEligibleBatch(address[] accounts, bool ok)',
  'function setDefaultRestrictionMessage(string message)',
  'function setEligibilityEnforced(bool enforced)',
]

// TokenStandard enum ordinals — must match contracts/tokens/interfaces/ITokenFactory.sol.
export const TOKEN_STANDARD = {
  OPEN_ERC20: 0,
  OPEN_ERC721: 1,
  RESTRICTED_ERC1404: 2,
  PERMISSIONED_ERC3643: 3,
}

export const TOKEN_STANDARD_LABEL = {
  0: 'Open ERC-20',
  1: 'Open ERC-721',
  2: 'Restricted (ERC-1404)',
  3: 'Permissioned (ERC-3643)',
}
