const { expect } = require("chai");
const { LAUNCH_FEE_SERVICES, ServiceKind } = require("../../scripts/deploy/lib/feeServices");

// spec 066 — the deploy fee-service table carries the two per-provider LIQUID staking
// services (stake.lido / stake.polygon) as ConfigOnly at the 250 bps cap. The StakingRouter
// reads + charges these itself; the FeeRouter never moves staking funds. Delegated staking
// is fee-free in v1, so there is deliberately no stake.polygon-delegated service.
describe("feeServices — staking (spec 066)", function () {
  const byLabel = (label) => LAUNCH_FEE_SERVICES.find((s) => s.label === label);

  it("registers stake.lido and stake.polygon", function () {
    expect(byLabel("stake.lido"), "stake.lido service").to.exist;
    expect(byLabel("stake.polygon"), "stake.polygon service").to.exist;
  });

  it("both are ConfigOnly with a 250 bps cap", function () {
    for (const label of ["stake.lido", "stake.polygon"]) {
      const svc = byLabel(label);
      expect(svc.capBps, `${label} cap`).to.equal(250);
      expect(svc.kind, `${label} kind`).to.equal(ServiceKind.ConfigOnly);
    }
  });

  it("does NOT register a delegated staking fee service (fee-free in v1)", function () {
    expect(byLabel("stake.polygon-delegated")).to.equal(undefined);
    expect(byLabel("stake.delegated")).to.equal(undefined);
  });
});
