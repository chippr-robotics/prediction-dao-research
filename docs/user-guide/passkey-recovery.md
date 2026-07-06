# Recovering access to a passkey account

Your FairWins passkey account is **self-custodial**: only your registered
controllers (passkeys and any linked wallet) can move funds or change who
controls the account. FairWins holds nothing and can neither move your funds
nor restore access — by design (spec 041, FR-006/FR-021).

## The three recovery paths (no FairWins involvement in any of them)

1. **Synced passkey** — if your platform syncs passkeys (iCloud Keychain,
   Google Password Manager), sign in on any device in that ecosystem:
   *Connect Wallet → Passkey*. The platform picker offers your synced
   credential and you land in the same account — same address, funds,
   membership, history.
2. **Second passkey** — if you added another passkey (a second device or a
   hardware security key) under *Account → Devices & controllers*, sign in
   with it the same way. You can then remove the lost device's passkey — the
   removal is enforced on-chain, so the lost credential can sign nothing.
3. **Linked wallet** — if you linked an external wallet as a controller,
   connect that wallet normally; it can operate the account and register a
   replacement passkey.

## If you had none of the above

A single device-bound passkey with no sync, no second passkey, and no linked
wallet is unrecoverable when the device is lost — the app warns about exactly
this at account creation, first funding, and membership purchase, and keeps
warning until a second controller exists.

## After recovering

- Remove the lost device's passkey (*Devices & controllers → Remove*).
- Add a fresh backup controller so you're never one device away from loss.
- Encrypted-feature keys: any controller holding key material restores the
  same encryption keys automatically; a brand-new controller can be granted
  them from a signed-in device.
