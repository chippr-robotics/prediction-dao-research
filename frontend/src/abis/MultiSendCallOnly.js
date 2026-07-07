// Spec 043 — MultiSendCallOnly (v1.4.1) ABI, hand-maintained. Batches multiple inner transactions into one
// Safe transaction executed with operation = 1 (delegatecall to MultiSendCallOnly). "CallOnly" restricts the
// inner transactions to CALL (no nested delegatecall) — the smaller-attack-surface choice for the common
// "approve + action" batch (e.g. ERC-20 approve then createWager).
//
// Each inner transaction is packed as: operation(1 byte = 0x00) ‖ to(20) ‖ value(32) ‖ dataLength(32) ‖ data,
// and all are concatenated into the single `transactions` bytes argument.

export const MULTI_SEND_CALL_ONLY_ABI = ['function multiSend(bytes transactions) payable']

export default MULTI_SEND_CALL_ONLY_ABI
