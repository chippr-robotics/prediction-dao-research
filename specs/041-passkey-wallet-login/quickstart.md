# Quickstart: Validating Passkey Wallet Accounts (041)

End-to-end validation guide. Prerequisites: specs 035 + 036 implemented and
deployed (plan.md sequencing decision); Node 20; Chrome (CDP virtual
authenticator); local stack per spec 006 (`npm run dev:local` environment).

## 1. Contract layer

```bash
npm run compile
npx hardhat test test/account/            # vendored stack: owners, ERC-1271, executeBatch, factory determinism, P-256 fallback verify
npx hardhat test test/intent/SignerIntentBase.erc1271.test.js   # contract-account intent signers accepted, EOA path unchanged
npx hardhat test test/integration/passkey-account.e2e.test.js
npm run check:storage-layout              # gates the SignerIntentBase in-place upgrades (both facets + membershipManagerImpl)
npx hardhat test test/fork/usdc-erc1271-authorization.test.js   # native USDC accepts smart-account EIP-3009 auth (fork)
cd services/relay-gateway && npm test     # gateway ERC-1271 verify fallback
```

Expected: all green. The integration test proves membership purchase, wager
create/accept/claim, and sanctions-block work when `msg.sender` is a smart
account (no interface changes to MembershipManager/WagerRegistry/
SanctionsGuard; the only contract change is the `SignerIntentBase`
signature-verification extension, storage-layout gated).

## 2. Deployment determinism (Amoy, then Polygon)

```bash
node scripts/deploy/deploy-account-stack.js --network amoy
node scripts/deploy/deploy-account-stack.js --network polygon
npm run sync:frontend-contracts
```

Expected: `deployments/` gains `entryPoint`, `accountFactory` (+
`p256Verifier` where applicable) per network; the script **fails loudly** if
`accountFactory` addresses differ across networks (FR-023). On Amoy, run the
script's `--verify-7212` probe: a P-256 verification through `WebAuthnSol`
must take the precompile path (~3,450 gas), not the fallback.

## 3. Frontend unit layer

```bash
npm run test:frontend
```

New suites: connector (connect/reconnect/disconnect/switchChain refusal),
ceremony error taxonomy (cancel, unavailable), submission routing table
(intent vs UserOp vs fallback vs both-down), PRF pipeline (wrap/unwrap,
capability degradation, no-silent-wrong-keys), controllers panel logic
(last-owner refusal, flagged-link refusal). Existing suites pass unchanged
(SC-004 gate).

## 4. E2E passkey journeys (Cypress + virtual authenticator)

```bash
npm run frontend          # against local stack with relayer + alto running
npx cypress run --spec cypress/e2e/passkey/*.cy.js
```

Scenarios (map to spec user stories):

| Scenario | Proves |
|---|---|
| Sign-up → fund → membership → create wager → accept (2nd account) → claim | US1, SC-001/SC-002: ≤3 interactions to fundable account, one ceremony per action, zero native token held, no seed phrase anywhere in DOM |
| Same surface connects injected wallet; all gates identical | US2, SC-003/SC-004/SC-008 |
| Reload persists session; sign-out clears storage; re-sign-in ≤10 s | US3, FR-003, SC-005 |
| Add 2nd credential, both sign; remove 1st, it can no longer sign (on-chain assert); last-owner removal refused | US4, FR-019/FR-020 |
| Discard credential (simulated device loss), recover via 2nd credential / linked wallet; single-credential path showed all 3 warnings | US5, FR-021, SC-007 |
| Flagged linked-wallet refused; flagged account blocked from gated action | US6, clarification Q2, SC-008 |
| Kill relayer container → action falls back to UserOp path with honest notice; kill bundler too → `SubmissionUnavailable` + retry-after (no spin) | FR-013/FR-017 |
| Disable PRF on virtual authenticator → encrypted features marked unavailable with reason; transactions unaffected | FR-012, clarification Q1 |

## 5. Live-network checklist (Amoy, pre-merge; Polygon, pre-release)

1. Real device (phone biometric): sign-up, fund from faucet USDC, membership
   purchase via relayed intent (user pays no gas), wager round-trip.
2. Fee comparison: same action from EOA vs passkey account on the UserOp
   path — passkey total fee ≤2× EOA fee (SC-006).
3. Cross-device: sign in on second device via synced passkey — same address,
   funds, roles (US3).
4. `check` CI suite fully green, including axe/Lighthouse on the login and
   account-management surfaces (constitution V).

## Success criteria traceability

SC-001/002 → §4 row 1 + §5.1 · SC-003/004/008 → §4 rows 2,6 · SC-005 → §4
row 3 · SC-006 → §5.2 · SC-007 → §4 row 5 · SC-009 → deployment review: no
new FairWins service beyond the 036-colocated bundler (Complexity Tracking).
