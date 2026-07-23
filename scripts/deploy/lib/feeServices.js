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
  // Staking (spec 066): per-provider LIQUID-staking fees the StakingRouter reads + charges itself
  // (ConfigOnly — the FeeRouter never moves staking funds; the router skims + forwards). Delegated
  // staking is fee-free in v1, so it has no service. Rate ships at 0, set later from the Fees tab.
  { label: "stake.lido", capBps: 250, kind: ServiceKind.ConfigOnly }, // Lido ETH→wstETH liquid staking
  { label: "stake.polygon", capBps: 250, kind: ServiceKind.ConfigOnly }, // sPOL POL→sPOL liquid staking
];

module.exports = { LAUNCH_FEE_SERVICES, ServiceKind };
