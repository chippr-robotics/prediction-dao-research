# Runbook: Operator Onboarding & Role Responsibilities

How to bring a new operator onto the platform, what each operator persona is
responsible for, and how to offboard cleanly. Companion to the
[operations control plane runbook](operations-control-plane.md) (the how-to
for each console view) and the
[roles overview](../system-overview/roles-and-tiers.md) (the authority /
separation-of-powers reference).

## Operator personas and responsibilities

Grant the **narrowest role that covers the job**. One person may hold several
roles, but each grant should be justified by a responsibility below.

| Persona | On-chain role (contract) | Responsible for | Console home |
|---|---|---|---|
| Incident Commander | `GUARDIAN_ROLE` (WagerRegistry) | Emergency pause/unpause; watching protocol + gateway health; first responder on security incidents | Incident Response, Infrastructure |
| Trust & Safety | `ACCOUNT_MODERATOR_ROLE` (WagerRegistry) | Freezing/unfreezing accounts per the [moderation policy](../system-overview/account-moderation.md); documenting reasons on-chain | Incident Response |
| Compliance Officer | `SANCTIONS_ADMIN_ROLE` (SanctionsGuard) | The discretionary deny-list; reviewing the `DenyListUpdated` audit trail; escalating oracle-screening changes to the admin | Compliance |
| Member Support | `ROLE_MANAGER_ROLE` (MembershipManager) | Out-of-band membership grants/revocations (support, gifts, dispute resolution) | Membership & Revenue |
| Protocol Administrator | `DEFAULT_ADMIN_ROLE` (MembershipManager + WagerRegistry) | Tier/pricing config, treasury withdrawals, protocol wiring, and granting every other role. Highest-consequence key — multisig or floppy keystore only | all groups |
| Token Operations | `TOKEN_ISSUER_ROLE` (TokenFactory) | Token issuance through the factory | Access Control (grants); issuance is CLI/spec-driven |
| Identity Moderation | `REGISTRY_CURATOR_ROLE` / `MODERATOR_ROLE` / `VERIFIER_ROLE` (CallsignRegistry) | Reserving, suspending, verifying `%callsigns` ([runbook](callsigns-operations.md)) | Identity |
| Release Engineer | `UPGRADER_ROLE` (all UUPS proxies) | Contract upgrades via the [upgrade runbook](contract-upgrades.md). Air-gapped floppy keystore; **never** exercised from the web console | — (CLI only) |
| Infra Operator | none (GCP IAM instead) | Relay gateway, oz-relayer, alto bundler, paymaster funding cadence ([relayer](relayer-operations.md) / [paymaster](paymaster-operations.md) runbooks) | Infrastructure (read-only telemetry) |

Standing duty for **every** operator: start each session on **Control Room →
Overview** — protocol status, accrued fees, membership metrics, service
health, and your own permissions on one screen. Anomalies (unexpected pause,
killswitch active, runway warnings) go to the incident channel before
anything else.

## Onboarding a new operator

### Prerequisites (the operator)

1. A dedicated operator wallet — hardware-backed where the persona's blast
   radius warrants it (Guardian, Compliance, and above: always). Never reuse
   a personal trading wallet.
2. The wallet funded with a small amount of native gas token on the target
   chain — operator actions are plain signed transactions, never gasless.
3. Read, for every persona: the [roles overview](../system-overview/roles-and-tiers.md)
   and the [control plane runbook](operations-control-plane.md). Persona-specific:
   Trust & Safety reads the [moderation policy](../system-overview/account-moderation.md);
   Incident Commanders read [security](../system-overview/security.md) and the
   [relayer runbook](relayer-operations.md) killswitch section.

### Grant procedure (an existing admin)

1. Verify the request: persona, justification, wallet address (confirmed
   out-of-band — read it back over a second channel).
2. `/admin` → **Access Control → Admin Roles** → select the role → paste the
   address (or ENS) → **Grant Role** → sign. The panel routes the grant to
   the contract that defines the role. Callsign roles are granted from
   **Identity → Callsigns** instead.
3. Record the grant (who, role, why, date) in the ops log. The transaction
   itself is the on-chain audit record.

### Verification (the new operator)

1. Connect the operator wallet on the correct network and open `/admin`.
2. Confirm the expected groups appear in the rail and **Overview → Your
   Permissions** shows the role enabled. Roles are chain-scoped: wrong
   network = missing views.
3. Dry-run a read-only action from your console home (e.g. check an address
   on the deny-list, read the live wiring) before any write.

## Offboarding

1. `/admin` → **Access Control → Admin Roles** → select the role → the
   departing address → **Revoke Role** → sign. Repeat per role held
   (callsign roles from **Identity → Callsigns**).
2. Verify: the departing wallet's `/admin` now shows "Access Restricted"
   (or the reduced group set).
3. If the operator held infra access, revoke GCP IAM and rotate any shared
   secrets per the [relayer runbook](relayer-operations.md) key-management
   section. If a key may be compromised, treat as an incident: freeze what
   the role could touch first, then revoke.

## Emergency contact chain

Pause (Guardian) and killswitch (infra) authority must be reachable
24/7. Keep the on-call rotation and escalation order in the team's private
ops channel — not in this public repo.
