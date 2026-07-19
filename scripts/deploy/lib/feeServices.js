/**
 * Canonical launch fee-service table for the spec-060 FeeRouter, shared by the deploy script and
 * its test so the two can never drift (security review nit). Each entry is registered at 0 bps;
 * rates are enabled later from the AdminPanel Fees tab.
 *
 * kind: 1 = Wrapped (chargeable via depositToVaultWithFee), 2 = ConfigOnly (rate read off-chain).
 * Wrapped caps must be <= MAX_WRAPPED_FEE_BPS (250); the Polymarket entries keep their spec-057 caps.
 */
const ServiceKind = { Wrapped: 1, ConfigOnly: 2 };

const LAUNCH_FEE_SERVICES = [
  { label: "earn.lend", capBps: 250, kind: ServiceKind.Wrapped }, // Earn/Morpho vault deposits (spec 050)
  { label: "polymarket.taker", capBps: 100, kind: ServiceKind.ConfigOnly }, // relay-gateway reads; spec-057 cap
  { label: "polymarket.maker", capBps: 50, kind: ServiceKind.ConfigOnly }, // relay-gateway reads; spec-057 cap
];

module.exports = { LAUNCH_FEE_SERVICES, ServiceKind };
