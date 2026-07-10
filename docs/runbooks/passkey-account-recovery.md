# Passkey Account Recovery (without FairWins)

FairWins passkey accounts are vendored [Coinbase Smart Wallet] (ERC-4337)
contracts owned by their controllers — passkeys (P-256 keys) and/or external
wallet addresses, managed by the on-chain `MultiOwnable` owner list. **Any
single controller has full authority**, including adding and removing other
controllers. FairWins holds no key, no admin role, and no upgrade authority
over user accounts; everything below works even if FairWins the service is
unreachable.

> **Precondition — set up BEFORE disaster:** recovery requires a second
> controller linked while you still had passkey access. In the app:
> My Wallet → Security → *Devices & controllers* → **Link wallet** (or **Add a
> passkey**). An account with a single passkey on a lost, unsynced device is
> unrecoverable **by design** — no one, including FairWins, can help.

## Path A — recover in the FairWins app (wallet-only)

You lost every passkey but previously linked an external wallet:

1. Open the app → Connect → **WalletConnect** or **Browser Wallet**, using the
   linked wallet.
2. Go to **My Wallet → Security → Recover a passkey account**.
3. Enter your passkey account address (the app suggests addresses it has seen
   on this browser). Don't know it? Check any wager/transfer you made on a
   block explorer — your account is the sender — or your address book.
4. **Verify ownership** — the app checks `isOwnerAddress(yourWallet)` on-chain
   and refuses to continue if the wallet is not a controller.
5. **Create & authorize new passkey** — your device prompts for a new passkey,
   then the wallet sends ONE ordinary transaction
   (`addOwnerPublicKey(x, y)`). No bundler, relayer, or FairWins service is
   involved.
6. After the transaction confirms, sign out and sign back in with the new
   passkey. Re-wrap encrypted-feature keys from Security → Devices &
   controllers if you use encrypted features (a controller that never held
   the master seed cannot decrypt old data — see spec 041 key-derivation).

## Path B — generic tools (no FairWins frontend at all)

The account is a standard contract; use any wallet UI or CLI that can send a
transaction from the linked wallet.

Relevant ABI fragments (full vendored source: `contracts/account/`):

```solidity
function isOwnerAddress(address owner) view returns (bool);
function addOwnerAddress(address owner);                 // link another wallet
function addOwnerPublicKey(bytes32 x, bytes32 y);        // authorize a passkey P-256 key
function removeOwnerAtIndex(uint256 index, bytes owner); // reverts on last owner
function ownerAtIndex(uint256 index) view returns (bytes);
function nextOwnerIndex() view returns (uint256);
```

Example with Foundry `cast`, from the linked wallet's key:

```bash
# confirm the wallet is a controller
cast call $ACCOUNT "isOwnerAddress(address)(bool)" $WALLET --rpc-url $RPC

# take control with another wallet (simplest generic recovery)
cast send $ACCOUNT "addOwnerAddress(address)" $NEW_WALLET --rpc-url $RPC --private-key ...
```

To authorize a **passkey** from outside the app you need its P-256 public key
(x, y) — passkeys created in the FairWins app store it in the browser's local
credential book (`fairwins.passkey.credentials.v1`). For a pure-CLI recovery,
prefer `addOwnerAddress` with a fresh wallet, then link a new passkey later
from the app.

## Invariants & cautions

- **Last controller can never be removed** — `removeOwnerAtIndex` reverts with
  `LastOwner()`; the app additionally refuses client-side.
- **Every controller is a full peer (1-of-N).** Linking a wallet gives that
  wallet complete control of the account and its funds. Link only wallets you
  exclusively control; the app sanctions-screens addresses before linking
  (fail-closed) per FR-019/FR-011.
- **Same address on every chain.** The account address derives from the
  initial owners + factory; recovery transactions must be sent on each chain
  where you hold funds (owner lists are per-chain state).
- **Platform passkey sync** (iCloud Keychain / Google Password Manager) is the
  first line of defense — a synced passkey usually survives device loss and
  makes recovery unnecessary.
