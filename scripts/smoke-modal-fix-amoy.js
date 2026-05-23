/**
 * smoke-modal-fix-amoy.js — Replay the patched modal's contract calls on Amoy.
 *
 * Acts as a non-spending equivalent of the manual browser smoke test for
 * PR #590 (fix/polymarket-pegged-modal-hook-wiring). Uses `createWager.staticCall`
 * so nothing is actually mined; the contract's argument-validation branches
 * are exercised end-to-end with the exact (resolutionType, polymarketConditionId,
 * creatorIsYes) tuples the patched modal+hook now produce.
 *
 * Run:
 *   node scripts/smoke-modal-fix-amoy.js
 *
 * Expectations (printed PASS/FAIL inline):
 *
 *   A. Polymarket-pegged path WITH a non-zero conditionId:
 *      → contract accepts the args, reverts only at MembershipDenied (admin
 *        isn't a paid member). Proves the modal's NEW args are valid.
 *
 *   B. Polymarket-pegged path with zero conditionId (the pre-fix payload):
 *      → reverts PolymarketRequired. Proves the contract still rejects what
 *        the old modal was sending.
 *
 *   C. ChainlinkDataFeed slot with non-zero conditionId (the OLD modal's
 *      mis-mapping of "PolymarketOracle = 5"):
 *      → reverts ConditionAlreadyResolved or similar adapter-side error
 *        (NOT PolymarketRequired). Proves the routing is now correct: the
 *        slot 5 goes through the Chainlink path, not the Polymarket one.
 *
 *   D. ChainlinkDataFeed slot with zero conditionId:
 *      → reverts OracleConditionRequired (the NEW error class).
 *
 *   E. Either resolution with a stray non-zero conditionId:
 *      → reverts PolymarketDisallowed. Sanity check that non-oracle types
 *        still require a zero conditionId.
 *
 *   F. Either resolution with zero conditionId:
 *      → reverts MembershipDenied (all arg validation passed, only the
 *        membership gate stops it).
 */

const { ethers } = require('ethers');
require('dotenv').config();

const AMOY_RPC = process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';
const ADMIN_PK = process.env.PRIVATE_KEY;

// v2 Amoy deployment (from PR #589 deployment record)
const WAGER_REGISTRY = '0x39f1CbC680cDc9831b6dF4D9e4719D3748720aBA';
const USDC           = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';

const RT = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3,
  Polymarket: 4, ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};

// Minimal ABI — just what we need for the static-call simulation.
const ABI = [
  'function createWager(address opponent, address arbitrator, address token, uint128 creatorStake, uint128 opponentStake, uint64 acceptDeadline, uint64 resolveDeadline, uint8 resolutionType, bytes32 polymarketConditionId, bool creatorIsYes, bytes32 metadataHash) external returns (uint256)',
  // Custom errors so ethers can decode them for clearer output.
  'error MembershipDenied()',
  'error PolymarketRequired()',
  'error PolymarketDisallowed()',
  'error OracleConditionRequired()',
  'error OracleAdapterNotSet()',
  'error UnsupportedOracleResolutionType()',
  'error ConditionAlreadyResolved()',
  'error AdapterNotSet()',
  'error ZeroAddress()',
  'error SelfWager()',
  'error NotAllowedToken()',
  'error ZeroStake()',
  'error BadDeadlines()',
  'error ArbitratorRequired()',
  'error ArbitratorDisallowed()',
];

// Pull the custom-error name out of an ethers static-call error.
function classifyRevert(err) {
  // ethers v6 puts the decoded custom error under err.revert.name (if it
  // could decode against the contract ABI we passed). Fall through to
  // string matching on shortMessage / message otherwise.
  const name = err?.revert?.name;
  if (name) return name;
  const msg = (err?.shortMessage || err?.reason || err?.message || '').toString();
  // Try to extract a Solidity custom-error name. ethers sometimes prints
  // them as `Error: VM Exception ...: custom error <selector>` or raw "0x<sel>".
  const customError = msg.match(/custom error '([^']+)'/i)?.[1]
    || msg.match(/reverted with custom error\s+([A-Za-z]+)/)?.[1];
  if (customError) return customError;
  // Plain-string matches for the named errors we care about.
  for (const errName of [
    'MembershipDenied', 'PolymarketRequired', 'PolymarketDisallowed',
    'OracleConditionRequired', 'OracleAdapterNotSet', 'UnsupportedOracleResolutionType',
    'ConditionAlreadyResolved', 'AdapterNotSet', 'NotAllowedToken',
    'ZeroAddress', 'SelfWager', 'ZeroStake', 'BadDeadlines',
    'ArbitratorRequired', 'ArbitratorDisallowed',
  ]) {
    if (msg.includes(errName)) return errName;
  }
  return msg.split('\n')[0].slice(0, 120) || '(unknown revert)';
}

async function tryStatic(reg, args, label) {
  try {
    await reg.createWager.staticCall(...args);
    return { label, status: 'SUCCEEDED', detail: '(static call did not revert; would have minted on-chain)' };
  } catch (e) {
    return { label, status: 'REVERTED', detail: classifyRevert(e) };
  }
}

(async () => {
  if (!ADMIN_PK) throw new Error('PRIVATE_KEY missing from env');
  const p = new ethers.JsonRpcProvider(AMOY_RPC);
  const w = new ethers.Wallet(ADMIN_PK, p);
  console.log('Admin EOA:', w.address);
  console.log('Network:  Amoy (chainId', (await p.getNetwork()).chainId.toString() + ')');

  const reg = new ethers.Contract(WAGER_REGISTRY, ABI, w);

  // Build a baseline args tuple that passes early validation (allowed token,
  // non-zero stakes, sane deadlines, opponent != self, no arbitrator).
  const now = Math.floor(Date.now() / 1000);
  const baseline = {
    opponent: '0x0000000000000000000000000000000000000bad', // anything non-self, non-zero, non-eq
    arbitrator: ethers.ZeroAddress,
    token: USDC,
    creatorStake: ethers.parseUnits('1', 6),  // 1 USDC (we won't actually transfer)
    opponentStake: ethers.parseUnits('1', 6),
    acceptDeadline: now + 7 * 24 * 3600,  // +7d
    resolveDeadline: now + 30 * 24 * 3600, // +30d
    metadataHash: ethers.keccak256(ethers.toUtf8Bytes('smoke-test')),
  };

  // Mocked conditionId for the staticCall tests — any non-zero 32-byte value.
  const fakeCid = '0x' + 'ab'.repeat(32);

  const matrix = [
    {
      label: 'A. Polymarket(4) + non-zero conditionId + creatorIsYes=true',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.Polymarket, fakeCid, true,
        baseline.metadataHash,
      ],
      // The Polymarket adapter on Amoy uses MockPolymarketCTF, which returns
      // false (not resolved) for any unset conditionId. So the
      // _isConditionResolved branch passes → next gate is membership. Expect
      // MembershipDenied for the admin EOA (no tier purchased).
      // (If MockPolymarketCTF doesn't even decode the call, getOutcome's
      // try/catch falls through to "not resolved" — same effect.)
      expect: 'MembershipDenied',
    },
    {
      label: 'B. Polymarket(4) + zero conditionId (the OLD modal payload)',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.Polymarket, ethers.ZeroHash, true,
        baseline.metadataHash,
      ],
      expect: 'PolymarketRequired',
    },
    {
      label: 'C. ChainlinkDataFeed(5) + non-zero conditionId',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.ChainlinkDataFeed, fakeCid, true,
        baseline.metadataHash,
      ],
      // Adapter IS registered (PR #589). For an unregistered conditionId,
      // ChainlinkDataFeedOracleAdapter.isConditionResolved checks the
      // resolutionCache mapping; default is false. So the stale-condition
      // gate passes → next gate is membership.
      expect: 'MembershipDenied',
    },
    {
      label: 'D. ChainlinkDataFeed(5) + zero conditionId',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.ChainlinkDataFeed, ethers.ZeroHash, true,
        baseline.metadataHash,
      ],
      expect: 'OracleConditionRequired',
    },
    {
      label: 'E. Either(0) + stray non-zero conditionId',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.Either, fakeCid, true,
        baseline.metadataHash,
      ],
      expect: 'PolymarketDisallowed',
    },
    {
      label: 'F. Either(0) + zero conditionId (the boring happy path)',
      args: [
        baseline.opponent, baseline.arbitrator, baseline.token,
        baseline.creatorStake, baseline.opponentStake,
        baseline.acceptDeadline, baseline.resolveDeadline,
        RT.Either, ethers.ZeroHash, true,
        baseline.metadataHash,
      ],
      expect: 'MembershipDenied',
    },
  ];

  console.log('\nReplaying patched-modal contract calls via staticCall...\n');
  console.log(' #  Scenario'.padEnd(76), 'Got'.padEnd(34), 'Expected');
  console.log('─'.repeat(150));

  let pass = 0, fail = 0;
  for (const t of matrix) {
    const r = await tryStatic(reg, t.args, t.label);
    const ok = r.detail === t.expect || (r.status === 'SUCCEEDED' && t.expect === 'SUCCEEDED');
    const mark = ok ? '✓' : '✗';
    if (ok) pass++; else fail++;
    console.log(
      `${mark} ${t.label}`.padEnd(76),
      r.detail.padEnd(34),
      t.expect,
    );
  }
  console.log('─'.repeat(150));
  console.log(`\nResult: ${pass}/${pass + fail} scenarios behaved as expected.`);
  if (fail > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
