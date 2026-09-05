---
name: "speckit-taskstoissues"
description: "Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts."
argument-hint: "Optional filter or label for GitHub issues"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/taskstoissues.md"
user-invocable: true
disable-model-invocation: false
---


## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before tasks-to-issues conversion)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_taskstoissues` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
1. **IF EXISTS**: Load `.specify/memory/constitution.md` for project principles and governance constraints.
1. From the executed script, extract the path to **tasks**.
1. Get the Git remote by running:

```bash
git config --get remote.origin.url
```

> [!CAUTION]
> ONLY PROCEED TO NEXT STEPS IF THE REMOTE IS A GITHUB URL

1. For each task in the list, use the GitHub MCP server to create a new issue in the repository that is representative of the Git remote.

> [!CAUTION]
> UNDER NO CIRCUMSTANCES EVER CREATE ISSUES IN REPOSITORIES THAT DO NOT MATCH THE REMOTE URL

## How this repository wants those issues (REQUIRED)

Full protocol: `docs/developer-guide/multi-agent-workflow.md`. A flat list of unlinked, unsized
issues is what this command produced before, and it is unusable for coordination — nobody can tell
what belongs to what, what is being worked, or what is left.

**Every issue this command creates is a SUB-ISSUE of the tracking issue for the feature.** Ask for
the parent issue number if you do not have it; do not create orphans. Create and link in one call
via `issue_write` with `parent_issue_number`, or link an existing issue with `sub_issue_write`.

Set all of the following at creation — retrofitting them is work someone else has to do:

| What | How |
|---|---|
| **Type** | `issue_write` `type` — almost always `Task` |
| **Priority** | `issue_fields` → `Priority`: `Urgent` / `High` / `Medium` / `Low`. Inherit the parent's unless the task is genuinely on a different critical path. |
| **Effort** | `issue_fields` → `Effort`: `High` / `Medium` / `Low` |
| **Size label** | `size:xs` … `size:xl` (XS/S → Effort Low, M → Medium, L/XL → High) |
| **Status label** | `status:triage` — unclaimed, free for any agent to pick up |
| **Body** | The task text, its `tasks.md` id, the spec path, and what would prove it done |

Run `list_issue_fields` first if you have not this session: option names are validated against the
live field, and a wrong one fails the call rather than silently doing nothing.

**Status is a label, not a field.** The GitHub MCP server has no Projects v2 write tool — Status
lives on the project item and is unreachable from here. `.github/labels.json`'s `status:*` set is the
record; `project-status-sync.yml` mirrors it onto the board. Never report a status you did not put
on a label.

**Then keep them current.** `status:in-progress` when a subagent picks the task up, `status:blocked`
with a comment naming the blocker when it stalls, `status:in-review` once its PR is open,
`status:done` + close with `state_reason: completed` when it merges. At the moment the state
changes, not in a batch at the end — a batch update is a status that was wrong for the whole time
anyone might have read it.

**Do not mark a sub-issue done on a subagent's say-so.** Its report is a claim: read the diff, run
the gates the change touched (`monorepo-verify` skill), and check that it did not quietly widen the
scope. If it is wrong, say what is wrong on the sub-issue and hand it back.

## Post-Execution Checks

**Check for extension hooks (after tasks-to-issues conversion)**:
Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_taskstoissues` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing slash commands from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently
