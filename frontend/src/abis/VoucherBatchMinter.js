// Human-readable ABI for the VoucherBatchMinter helper (spec 026): one approval + one tx to buy a quantity of
// vouchers and/or gift them to an address, over the immutable single-mint MembershipVoucher.
export const VOUCHER_BATCH_MINTER_ABI = [
  'function mintBatch(bytes32 role, uint8 tier, uint256 quantity, address recipient) returns (uint256 firstId, uint256 lastId)',
  'function MAX_QUANTITY() view returns (uint256)',
  'event BatchMinted(address indexed buyer, address indexed recipient, bytes32 indexed role, uint8 tier, uint256 quantity, uint256 totalPaid, uint256 firstId, uint256 lastId)',
]
