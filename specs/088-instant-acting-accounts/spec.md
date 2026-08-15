# Feature Specification: Instant Acting Accounts & Deferred Signing

**Feature Branch**: `claude/hardware-wallet-protect-ojldc1` (third PR from this branch line)
**Created**: 2026-08-15
**Status**: Shipped with this PR
**Input**: Staging feedback after specs 085/086: (1) the Home page's send surface showed the
PRIMARY account's balances while acting as a hardware account; (2) switching acting accounts
required unlocking or connecting devices up front — the public address should be enough to
navigate every flow, with unlock/connect needed only when a transaction is actually sent;
(3) transaction buttons (Bridge et al.) should switch the wallet to the required network the
way Trade does.

## The three findings, and what each turned out to be

1. **Wrong balances on Home** — `useEffectiveAccount` (spec 063) resolves every acting kind, but
   the home/send surfaces re-derived the acting address inline, and each copy only knew
   vault + legacy: hardware and derived accounts fell to the "use the connected wallet"
   sentinel. Worse, the same omission existed on the WRITE path — `useTransfer` routed a
   hardware acting account to the personal branch, signing with the CONNECTED wallet.
2. **Ceremony-at-switch** — `operateAsLegacy`/`operateAsHardware` hard-required a signer, so
   choosing those accounts routed through unlock/device dialogs before the identity could even
   be viewed.
3. **Network switching** — `WalletContext.switchNetwork` awaited wagmi's non-async mutate: it
   resolved BEFORE the wallet changed chains and a user rejection never rejected, so several
   "Switch to X" buttons were racy. (Bridge itself already auto-switches at submit via the
   `sendOnChain` settle helper; the core fix repairs the racy callers.)

## Functional Requirements

- **FR-001**: Every surface showing an account's balances resolves the acting address through
  `useEffectiveAccount` — no inline per-kind derivations. (PayPanel, TransferForm,
  DexContext.tradingAddress; Portfolio/Receive/Request already complied.)
- **FR-002**: A transfer, swap, wrap, or mini-app write while acting as ANY non-personal kind
  signs with THAT account's signer, never the connected wallet's.
- **FR-003**: Switching the acting account is instant and address-only for every kind — no
  unlock dialog, no device ceremony, no passphrase at switch time.
- **FR-004**: The signing ceremony runs at the moment a signature is needed: a broker in
  CustodyContext (`requestActingSigner`) parks the action, one globally-mounted
  `SignerRequestHost` renders the right dialog (legacy unlock / hardware connect), success
  resolves the parked action and caches the signer for the session, dismissal rejects it with
  a stated reason. Concurrent actions share one ceremony.
- **FR-005**: The chain binding belongs to the SIGNER (set at ceremony time), not the identity.
  A cached signer bound to a network the wallet has left is dropped and the ceremony re-runs,
  binding to the current chain — never a "switch back" dead end.
- **FR-006**: A pending ceremony is cancelled (with its parked action rejected) when the
  connected account or the acting identity changes.
- **FR-007**: `switchNetwork` resolves only after the wallet has actually switched (async
  mutate), and a member rejection rejects — every "Switch to X" control inherits the fix.
- **FR-008**: Message signing as a locked recovered/hardware identity is OFFERED (capability
  honest) and acquires its signer through the same broker at sign time.

## Out of scope

- Vault (Safe) acting semantics — unchanged: chain-bound by nature, proposals not signatures.
- The Recovery tab's own explicit unlock flows (sweep, cross-chain discovery) — those need the
  raw seed, not an ethers signer, and keep their in-place ceremonies.
- Converting every "Switch to X" button-swap into auto-switch-then-proceed — the core
  `switchNetwork` fix makes the existing buttons correct; UX unification is follow-up work.
