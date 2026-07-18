# Operational Runbooks

This directory contains step-by-step operational guides, integration procedures, and runbooks for using and maintaining the platform.

## Contents

### Operating the platform
- **[operations-control-plane.md](./operations-control-plane.md)** - The operator console at `/admin`: every group and view, role gates, step-by-step how-tos, and troubleshooting
- **[operator-onboarding.md](./operator-onboarding.md)** - Operator personas and responsibilities, role grant/verification procedure, offboarding
- **[relayer-operations.md](./relayer-operations.md)** - Gasless intent relayer (spec 036): gateway/engine components, hot-key management, killswitch, OpenSea/Polymarket proxy ops, incident table
- **[paymaster-operations.md](./paymaster-operations.md)** - Sponsored-gas paymaster (spec 050): deposit funding and runway, monitoring, killswitch, signer rotation, compromise response
- **[callsigns-operations.md](./callsigns-operations.md)** - Deploy the `%callsign` naming registry, wire the frontend, grant operator roles, and moderate / tune / monitor it from the control plane (spec 054)
- **[contract-upgrades.md](./contract-upgrades.md)** - UUPS proxy upgrade procedure: storage-layout gate, in-place upgrades, rollback

### Deploy
- **[relayer-mordor-deploy.md](./relayer-mordor-deploy.md)** - First bring-up of the relayer stack on Mordor: GCP prerequisites, KMS keys, Cloud Run, origin lock, validation
- **[zk-wager-pools-deploy.md](./zk-wager-pools-deploy.md)** - WagerPoolFactory (spec 034) append-only deploy, wiring matrix, subgraph publish
- **[safe-proposal-hub-deploy.md](./safe-proposal-hub-deploy.md)** - SafeProposalHub (spec 043) events-only helper deploy

### Integration & user-facing procedures
- **[batch-operations.md](./batch-operations.md)** - Complete integration guide for batch processing APIs with examples in JavaScript, Python, and React
- **[passkey-account-recovery.md](./passkey-account-recovery.md)** - End-user recovery paths for passkey smart-wallet accounts

The full inventory of administrative control surfaces (on-chain, service, and
frontend) and the gap analysis behind the control plane's structure live in
[docs/system-overview/control-surface-audit.md](../system-overview/control-surface-audit.md).

## Purpose

Runbooks provide:
- **Step-by-step procedures** for common operations
- **Integration examples** with code samples
- **API usage guides** for developers
- **Troubleshooting procedures** for common issues
- **Deployment checklists** and operational procedures

## Structure

Each runbook should include:
1. **Overview** - What the procedure accomplishes
2. **Prerequisites** - Required setup and dependencies
3. **Step-by-Step Instructions** - Detailed procedures
4. **Code Examples** - Working sample code
5. **Troubleshooting** - Common issues and solutions
6. **References** - Links to related documentation

## Related Documentation

- **ADRs** ([docs/adr/](../adr/)) - Architectural decisions behind these procedures
- **Active Build** ([docs/active_build/](../active_build/)) - Current implementation work
- **Developer Guide** ([docs/developer-guide/](../developer-guide/)) - General development setup

## Contributing

When creating new runbooks:
1. Use clear, imperative language ("Do X", not "You should do X")
2. Include working code examples
3. Test all procedures before documenting
4. Keep procedures focused on a single task
5. Update this README when adding new runbooks
