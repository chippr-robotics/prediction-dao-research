#!/usr/bin/env node
/**
 * Mirror an issue's `status:*` label onto the GitHub Project's Status field (issue #1460).
 *
 * WHY THIS EXISTS. The acceptance criterion for #1460 is that an agent can update an issue's
 * status. It cannot do so directly: the GitHub MCP server exposes issue Type, Priority, Effort and
 * the two date fields — all org-level ISSUE fields — but Status lives on the PROJECT ITEM, and
 * there is no Projects v2 write tool. So the agent writes a label, which it can do, and this runs
 * on the label event and moves the card.
 *
 * WHAT IT IS NOT. It is not a source of truth. The label is. If this never runs, the issue still
 * says what state it is in — the board is just stale, which is visibly stale rather than quietly
 * wrong. That ordering is deliberate: an agent must never be blocked on infrastructure it cannot
 * see or fix.
 *
 * CONFIGURATION (all optional; absence disables the mirror with a warning, never an error):
 *   PROJECT_URL      repo/org variable, e.g. https://github.com/orgs/chippr-robotics/projects/7
 *   PROJECTS_TOKEN   secret with `project` scope — GITHUB_TOKEN CANNOT write Projects v2
 *   ISSUE_NUMBER, REPO_OWNER, REPO_NAME, LABELS (JSON array), ISSUE_STATE
 *
 * Dependency-free: global fetch on Node 22, no npm ci. The pure parts (URL parsing, label→status
 * choice, option matching) are exported and driven by must-fail fixtures in __tests__.
 */

const GRAPHQL = 'https://api.github.com/graphql';

/**
 * Label → the Status option we want, in priority order.
 *
 * Ordered, not a plain map, because an issue can briefly carry two `status:*` labels (an agent
 * adds the new one before removing the old, or two events race). Picking the FIRST match by this
 * order makes the outcome deterministic instead of dependent on label array order, and it is
 * ordered late-stage-first so the board never regresses a card during that overlap.
 */
const STATUS_PRECEDENCE = [
  { label: 'status:done', status: 'Done' },
  { label: 'status:in-review', status: 'In review' },
  { label: 'status:blocked', status: 'Blocked' },
  { label: 'status:in-progress', status: 'In progress' },
  { label: 'status:triage', status: 'Todo' },
];

/** Parse an org or user project URL into { ownerType, owner, number }. */
function parseProjectUrl(url) {
  if (!url) return null;
  const m = /^https?:\/\/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)/.exec(url.trim());
  if (!m) return null;
  return { ownerType: m[1] === 'orgs' ? 'organization' : 'user', owner: m[2], number: Number(m[3]) };
}

/**
 * Choose the Status option name for a set of labels.
 *
 * A CLOSED issue carrying no status label resolves to Done — closing is itself a status
 * statement, and an agent that closes an issue without labelling it has still finished it. An OPEN
 * issue with no status label resolves to null: "no opinion" moves nothing, which is what keeps
 * this from stampeding every unrelated issue in the repo onto Todo the first time it runs.
 */
function statusForLabels(labels, issueState) {
  const names = new Set((labels || []).map((l) => (typeof l === 'string' ? l : l.name)));
  for (const entry of STATUS_PRECEDENCE) {
    if (names.has(entry.label)) return entry.status;
  }
  return issueState === 'closed' ? 'Done' : null;
}

/**
 * Match a wanted status name against the board's actual Status options.
 *
 * Case- and separator-insensitive, because boards spell these "In Progress", "In progress" and
 * "in-progress" interchangeably and a mirror that fails on capitalisation is a mirror nobody
 * keeps. Returns null when the board genuinely has no such column — reported, never invented.
 */
function matchOption(options, wanted) {
  const norm = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(wanted);
  return (options || []).find((o) => norm(o.name) === target) || null;
}

async function graphql(token, query, variables) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'fairwins-project-status-sync',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    const detail = body.errors ? body.errors.map((e) => e.message).join('; ') : `HTTP ${res.status}`;
    throw new Error(`GraphQL request failed: ${detail}`);
  }
  return body.data;
}

const PROJECT_QUERY = `
query($login: String!, $number: Int!) {
  organization(login: $login) {
    projectV2(number: $number) {
      id
      field(name: "Status") {
        ... on ProjectV2SingleSelectField { id name options { id name } }
      }
    }
  }
}`;

const USER_PROJECT_QUERY = PROJECT_QUERY.replace('organization(login: $login)', 'user(login: $login)');

const ITEM_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id
      projectItems(first: 20) { nodes { id project { id } } }
    }
  }
}`;

const ADD_ITEM = `
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
}`;

const SET_STATUS = `
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}`;

/** Emit a GitHub Actions warning and stop without failing the run. */
function skip(reason) {
  console.log(`::warning::Project status mirror skipped — ${reason}`);
  console.log('The status:* label on the issue remains the record of state; the board is stale.');
  return 0;
}

async function main(env) {
  const projectUrl = env.PROJECT_URL;
  const token = env.PROJECTS_TOKEN;

  const project = parseProjectUrl(projectUrl);
  if (!projectUrl) return skip('PROJECT_URL is not set (repo or org variable)');
  if (!project) return skip(`PROJECT_URL is not a project URL: ${projectUrl}`);
  if (!token) {
    return skip(
      'PROJECTS_TOKEN is not set. GITHUB_TOKEN cannot write Projects v2 — this needs a token ' +
        'with the `project` scope',
    );
  }

  const issueNumber = Number(env.ISSUE_NUMBER);
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;
  if (!issueNumber || !owner || !repo) return skip('issue coordinates missing from the event');

  let labels = [];
  try {
    labels = JSON.parse(env.LABELS || '[]');
  } catch {
    return skip('LABELS was not valid JSON');
  }

  const wanted = statusForLabels(labels, env.ISSUE_STATE);
  if (!wanted) {
    console.log(`No status:* label on #${issueNumber} and the issue is open — nothing to mirror.`);
    return 0;
  }

  const query = project.ownerType === 'organization' ? PROJECT_QUERY : USER_PROJECT_QUERY;
  const data = await graphql(token, query, { login: project.owner, number: project.number });
  const board = (data.organization || data.user || {}).projectV2;
  if (!board) return skip(`project ${projectUrl} is not readable with the configured token`);
  if (!board.field) return skip(`project ${projectUrl} has no single-select field named "Status"`);

  const option = matchOption(board.field.options, wanted);
  if (!option) {
    // Reported, never invented: a missing column is a board-configuration fact, and silently
    // picking the nearest option would put cards in a state nobody chose.
    return skip(
      `the board has no Status option matching "${wanted}" ` +
        `(it has: ${board.field.options.map((o) => o.name).join(', ')})`,
    );
  }

  const issueData = await graphql(token, ITEM_QUERY, { owner, repo, number: issueNumber });
  const issue = issueData.repository && issueData.repository.issue;
  if (!issue) return skip(`issue ${owner}/${repo}#${issueNumber} not readable`);

  let item = (issue.projectItems.nodes || []).find((n) => n.project.id === board.id);
  if (!item) {
    const added = await graphql(token, ADD_ITEM, { projectId: board.id, contentId: issue.id });
    item = added.addProjectV2ItemById.item;
    console.log(`Added #${issueNumber} to the board.`);
  }

  await graphql(token, SET_STATUS, {
    projectId: board.id,
    itemId: item.id,
    fieldId: board.field.id,
    optionId: option.id,
  });

  console.log(`#${issueNumber} → Status "${option.name}".`);
  return 0;
}

module.exports = { parseProjectUrl, statusForLabels, matchOption, STATUS_PRECEDENCE };

if (require.main === module) {
  main(process.env)
    .then((code) => process.exit(code))
    .catch((err) => {
      // A real failure (bad token, API outage) fails the run: the mirror claiming to have moved a
      // card it did not move is worse than a red X on a workflow nothing else depends on.
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}
