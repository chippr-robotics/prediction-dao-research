#!/usr/bin/env node
/**
 * Extract the issues a pull request body says it closes (issue #1460).
 *
 * WHY THIS EXISTS. GitHub honours closing keywords only when a PR merges into the repository's
 * DEFAULT branch. Here that is `main`, and every feature PR targets `staging` by design (spec 076),
 * so no feature PR in this repo has ever auto-closed anything — PR #1461 merged with `Closes #1460`
 * in its body and #1461 stayed linked to nothing, with the issue still open. The later
 * `staging` -> `main` promotion does not rescue it either: GitHub reads THAT PR's body.
 *
 * `close-linked-issues.yml` closes them on the merge into `staging` instead. This file is the part
 * with logic in it, so it is separated out and tested against fixtures rather than living as a
 * regex inside a workflow step where nothing can exercise it.
 *
 * IT DELIBERATELY MIRRORS GITHUB'S OWN RULES rather than improving on them:
 *   · the nine keywords GitHub accepts, case-insensitive;
 *   · `#123`, `owner/repo#123`, and full issue URLs;
 *   · code spans and fenced blocks are ignored, as GitHub ignores them;
 *   · no attempt to understand negation — GitHub closes on "this does not fix #123" too, and a
 *     parser that is cleverer than the platform is a parser whose behaviour nobody can predict.
 *
 * Cross-repository references are dropped: this runs with a token scoped to one repository, and
 * closing an issue somewhere else on the strength of a PR body is not a power this should have.
 *
 * Dependency-free. Usage:
 *   node scripts/ci/parse-closing-keywords.js --repo owner/name [--body-file path]
 * Prints one issue number per line (deduplicated, ascending); prints nothing when there are none.
 */

const fs = require('fs');

const KEYWORDS = [
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
];

/**
 * Remove fenced blocks and inline code spans.
 *
 * Not cosmetic: a PR body that documents this very feature will contain the string "Closes #123"
 * inside an example, and a parser that reads its own documentation as an instruction would close
 * whatever number the example used.
 */
function stripCode(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

/**
 * Issue numbers the body closes, for `repoFullName` only.
 *
 * @param {string} body PR body markdown
 * @param {string} repoFullName "owner/name"
 * @returns {number[]} ascending, deduplicated
 */
function parseClosingKeywords(body, repoFullName) {
  const text = stripCode(body);
  const [owner, repo] = String(repoFullName || '').split('/');
  if (!owner || !repo) return [];

  const found = new Set();
  const kw = KEYWORDS.join('|');

  // `Closes #123` / `Closes owner/repo#123`
  const shortForm = new RegExp(
    `\\b(?:${kw})\\b\\s*:?\\s+(?:([\\w.-]+)\\/([\\w.-]+))?#(\\d+)`,
    'gi',
  );
  for (const m of text.matchAll(shortForm)) {
    const [, mOwner, mRepo, num] = m;
    // A bare `#123` means this repository; a qualified one must name it.
    if (mOwner && (mOwner.toLowerCase() !== owner.toLowerCase() || mRepo.toLowerCase() !== repo.toLowerCase())) {
      continue;
    }
    found.add(Number(num));
  }

  // `Closes https://github.com/owner/repo/issues/123`
  const urlForm = new RegExp(
    `\\b(?:${kw})\\b\\s*:?\\s+https?:\\/\\/github\\.com\\/([\\w.-]+)\\/([\\w.-]+)\\/issues\\/(\\d+)`,
    'gi',
  );
  for (const m of text.matchAll(urlForm)) {
    const [, mOwner, mRepo, num] = m;
    if (mOwner.toLowerCase() !== owner.toLowerCase() || mRepo.toLowerCase() !== repo.toLowerCase()) {
      continue;
    }
    found.add(Number(num));
  }

  return [...found].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
}

function main(argv) {
  const repoIdx = argv.indexOf('--repo');
  const fileIdx = argv.indexOf('--body-file');
  const repoFullName = repoIdx !== -1 ? argv[repoIdx + 1] : process.env.GITHUB_REPOSITORY;

  if (!repoFullName) {
    console.error('Error: --repo owner/name (or GITHUB_REPOSITORY) is required.');
    return 2;
  }

  let body = '';
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    body = fs.readFileSync(argv[fileIdx + 1], 'utf8');
  } else {
    body = fs.readFileSync(0, 'utf8'); // stdin
  }

  for (const n of parseClosingKeywords(body, repoFullName)) console.log(n);
  return 0;
}

module.exports = { parseClosingKeywords, stripCode, KEYWORDS };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
