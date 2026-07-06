// Spec 042 — back-compat shim. The OpenZeppelin Governor connector moved to
// `connectors/ozGovernor.js` when the connector layer became pluggable (OZ + GovernorBravo).
// This re-export keeps existing imports (RegisterExternalDao, ExternalDaoView, ProposalBuilder,
// daoSource, tests) working unchanged; new code should import from `./connectors`.
export * from './connectors/ozGovernor'
