/**
 * Estate role-sweep classification (spec 071 FR-011 / FR-012).
 *
 * The operations console asks every chain in the build's cohort whether an account holds each
 * operator role, then has to say what it learned. Spec 071 gives it three answers and only
 * three — `read`, `not-deployed`, `unreadable` — and the whole point of the third is that an
 * operator refused during a network outage must not be told their permissions are the problem.
 *
 * This function is that classification, kept pure and out of the provider so the rule can be
 * exercised without a chain.
 *
 * THE BUG IT EXISTS TO PREVENT. A probe against a chain with no contract that could hold the role
 * returns "not held" without touching the network — Ethereum Classic carries no WagerRegistry,
 * so nobody is its Account Moderator, and that is a fact about the address book. Counting those
 * as the chain having ANSWERED meant a total RPC outage still produced a non-empty `read` list:
 * five chains "answered" from config, Polygon (the only chain where every operator role has a
 * contract) came back unreadable, and the console rendered "Access Restricted" — a statement
 * about permissions — to an operator whose grant was never in question. Classifying on the
 * probes that actually had something to read is what keeps that screen honest.
 *
 * @param {Array<{chainId: number, readable?: boolean, deployed?: boolean}>} probes
 *   Every probe of the sweep, across all roles and all chains. `deployed === false` marks a probe
 *   settled from config; `readable === false` marks one whose contract would not answer.
 * @param {number[]} chainIds The cohort, in the order the caller wants the results reported.
 * @returns {{read: number[], notDeployed: number[], unreadable: number[]}}
 */
export function classifyEstateProbes(probes = [], chainIds = []) {
  const read = []
  const notDeployed = []
  const unreadable = []

  for (const id of chainIds) {
    // Only probes with a contract behind them say anything about whether this chain answered.
    const asked = probes.filter(
      (p) => Number(p.chainId) === Number(id) && p.deployed !== false,
    )
    if (asked.length === 0) notDeployed.push(id)
    else if (asked.every((p) => p.readable === false)) unreadable.push(id)
    else read.push(id)
  }

  return { read, notDeployed, unreadable }
}
