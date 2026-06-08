# PR Review via native executionPolicy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `pr-review` module's manually-created child review issues with Paperclip's native issue `executionPolicy` (`review`/`approval` stages), both for runtime PR reviews and for statically declared module/preset issues via a new `reviewGate` field.

**Architecture:** Assembly resolves a declared `reviewGate` to roles present in the team and renders an ordered executionPolicy sketch into BOOTSTRAP.md; the CEO/Engineer resolves roles → agentIds at runtime and sets `executionPolicy` on the issue. `client.createIssue` already forwards `executionPolicy`, so no client change is needed. The pr-review skill templates are rewritten to drive review through stages instead of child issues.

**Tech Stack:** Node ESM (`src/logic/*.js`), `node:test` for logic tests, vitest for plugin tests, Markdown templates under `templates/modules/pr-review/`.

**Spec:** `docs/superpowers/specs/2026-06-08-pr-review-execution-policy-design.md`

---

## Reference: Canonical executionPolicy shape (from `@paperclipai/shared` 2026.529.0)

```jsonc
{
  "mode": "normal",            // default
  "commentRequired": true,     // default
  "stages": [                  // ordered; each stage takes exactly 1 approval
    { "type": "review",   "participants": [{ "type": "agent", "agentId": "<uuid>" }] },
    { "type": "approval", "participants": [{ "type": "agent", "agentId": "<uuid>" }] }
  ]
}
```
- Stage types: only `"review"` and `"approval"`. Decision outcomes: `"approved"`, `"changes_requested"`.
- Participant: `type:"agent"` requires `agentId` (no `userId`); `type:"user"` requires `userId` (no `agentId`).

---

## Task 1: Verify the stage-decision submit mechanism (investigation, no code)

This unblocks the reviewer-skill wording in Task 6. Do NOT write reviewer-skill verdict instructions until this is recorded.

**Files:**
- Modify (append findings): `docs/superpowers/specs/2026-06-08-pr-review-execution-policy-design.md`

- [ ] **Step 1: Probe how an agent submits a stage decision**

The instance runs at `http://localhost:3100`. Determine how a reviewer agent records `approved` / `changes_requested` for a `review`/`approval` stage. Check, in order:

Run:
```bash
grep -rniE "decision|approve|changes_requested|advanceStage|stage" \
  /paperclip/paperclip-plugin-company-wizard/node_modules/@paperclipai/shared/dist/validators/issue.js | head -30
```
Then inspect the agent adapter/tooling surface if present:
```bash
grep -rniE "review|approve|decision|stage" \
  /paperclip/paperclip-plugin-company-wizard/node_modules/@paperclipai/plugin-sdk/dist/*.d.ts 2>/dev/null | head -30
```
Expected: identify whether the verdict is submitted via `PATCH /api/issues/:id` (e.g. a decision/status field), via a dedicated agent runtime tool, or is otherwise host-driven.

- [ ] **Step 2: Record the finding in the spec**

Append a short subsection "## Decision-Submit Mechanism (verified)" to the spec stating exactly how a reviewer records a verdict (concrete tool/endpoint/field), or — if it cannot be pinned down from the bundle and a live probe is unsafe — state that reviewer skills must stay mechanism-neutral ("record your `approved` / `changes_requested` verdict on your review stage").

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-08-pr-review-execution-policy-design.md
git commit -m "docs: record stage-decision submit mechanism for pr-review"
```

---

## Task 2: Resolve `reviewGate` and render executionPolicy into BOOTSTRAP.md

**Files:**
- Modify: `src/logic/assemble.js` (add helpers after `resolveAssignee` ~line 267; render in the issues loop ~line 1063)
- Test: `src/logic/assemble.test.js`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('assembleCompany', ...)` block in `src/logic/assemble.test.js` (e.g. after the existing "includes initial tasks in BOOTSTRAP.md from modules" test, around line 300):

```js
  it('renders a reviewGate as an ordered executionPolicy in BOOTSTRAP.md', async () => {
    // Reviewer/approver role templates must exist or they are skipped.
    for (const role of ['code-reviewer', 'qa', 'product-owner']) {
      const roleDir = join(templatesDir, 'roles', role);
      await mkdir(roleDir, { recursive: true });
      await writeJson(join(roleDir, 'role.meta.json'), { name: role });
      await writeFile(join(roleDir, 'AGENTS.md'), `# ${role} agent\n\n## Skills\n\n`);
      await writeFile(join(roleDir, 'HEARTBEAT.md'), `# ${role} heartbeat\n`);
      await writeFile(join(roleDir, 'SOUL.md'), `# ${role} soul\n`);
    }

    const modDir = join(templatesDir, 'modules', 'gated-work');
    await mkdir(modDir, { recursive: true });
    await writeJson(join(modDir, 'module.meta.json'), {
      name: 'gated-work',
      capabilities: [],
      issues: [
        {
          title: 'Implement gated feature',
          assignTo: 'engineer',
          reviewGate: {
            reviewers: ['code-reviewer', 'qa', 'missing-role'],
            approver: 'product-owner',
          },
        },
      ],
    });

    const { companyDir } = await assembleCompany({
      companyName: 'GateCo',
      moduleNames: ['gated-work'],
      extraRoleNames: ['code-reviewer', 'qa', 'product-owner'],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    // Ordered review stages, roles present in the team only (missing-role dropped),
    // approver rendered as the final approval stage.
    assert.ok(bootstrap.includes('**executionPolicy**'), 'executionPolicy block present');
    assert.ok(bootstrap.includes('(review) → assign "code-reviewer"'));
    assert.ok(bootstrap.includes('(review) → assign "qa"'));
    assert.ok(bootstrap.includes('(approval) → assign "product-owner"'));
    assert.ok(!bootstrap.includes('missing-role'), 'role absent from team is dropped');

    const crIdx = bootstrap.indexOf('"code-reviewer"');
    const poIdx = bootstrap.indexOf('"product-owner"');
    assert.ok(crIdx > -1 && poIdx > crIdx, 'approver renders after reviewers');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:logic 2>&1 | grep -A3 "reviewGate"`
Expected: FAIL — the assertion `executionPolicy block present` fails because nothing renders the gate yet.

- [ ] **Step 3: Add the resolve + render helpers**

In `src/logic/assemble.js`, immediately after the `resolveAssignee` helper (the block ending at line 267 with `return assignee;\n  };`), insert:

```js
  // Helper: resolve a declared reviewGate to roles present in the team. Reviewers
  // become ordered `review` stages; the approver becomes the final `approval`
  // stage. Roles not present in the team are dropped (no CEO fallback) — a review
  // gate references concrete reviewer roles, and a missing one means that gate
  // simply has one fewer stage.
  const resolveReviewGate = (reviewGate) => {
    if (!reviewGate || typeof reviewGate !== 'object') return null;
    const reviewers = (Array.isArray(reviewGate.reviewers) ? reviewGate.reviewers : []).filter(
      (role) => typeof role === 'string' && allRoles.has(role),
    );
    const approver =
      typeof reviewGate.approver === 'string' && allRoles.has(reviewGate.approver)
        ? reviewGate.approver
        : undefined;
    if (reviewers.length === 0 && !approver) return null;
    return { reviewers, approver };
  };

  // Render a resolved reviewGate as an executionPolicy sketch for BOOTSTRAP.md.
  // The CEO/Engineer resolves each role name to its agentId when setting the
  // policy on the issue (same role→agentId resolution as `assigneeAgentId`).
  const renderReviewGate = (gate) => {
    const stages = [];
    for (const role of gate.reviewers) {
      stages.push(`  - stage ${stages.length + 1} (review) → assign "${role}"`);
    }
    if (gate.approver) {
      stages.push(`  - stage ${stages.length + 1} (approval) → assign "${gate.approver}"`);
    }
    return (
      `- **executionPolicy** (set when creating this issue; resolve each role to its agentId):\n` +
      `${stages.join('\n')}\n\n`
    );
  };
```

- [ ] **Step 4: Render the gate in the issues loop**

In `src/logic/assemble.js`, in the issues loop, find the `renderMeta([...])` call for an issue that ends just before `if (issue.description) {` (around line 1063-1064). Insert between the `renderMeta(...)` block's closing `]);` and the `if (issue.description) {` line:

```js
      const issueReviewGate = resolveReviewGate(issue.reviewGate);
      if (issueReviewGate) {
        bootstrap += renderReviewGate(issueReviewGate);
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:logic 2>&1 | tail -8`
Expected: PASS — all assertions, suite count increases by 1, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.test.js
git commit -m "feat: render reviewGate as executionPolicy in BOOTSTRAP.md"
```

---

## Task 3: Rewrite the pr-review BOOTSTRAP guardrail (assemble.js + its test)

**Files:**
- Modify: `src/logic/assemble.js:1075-1077`
- Test: `src/logic/assemble.test.js:686-705`

- [ ] **Step 1: Update the existing guardrail test to expect the new wording**

In `src/logic/assemble.test.js`, replace line 704:

```js
    assert.ok(bootstrap.includes('Required PR reviews are explicit assigned child issues'));
```

with:

```js
    assert.ok(bootstrap.includes("Required PR reviews use the issue's `executionPolicy`"));
    assert.ok(!bootstrap.includes('child review issues'));
```

Also update the test title on line 686 from:

```js
  it('adds PR-review child issue guardrail when pr-review module is active', async () => {
```

to:

```js
  it('adds PR-review executionPolicy guardrail when pr-review module is active', async () => {
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:logic 2>&1 | grep -A3 "executionPolicy guardrail"`
Expected: FAIL — BOOTSTRAP still contains the old child-issue sentence.

- [ ] **Step 3: Rewrite the guardrail in assemble.js**

In `src/logic/assemble.js`, replace the block at lines 1075-1077:

```js
    if (moduleNames.includes('pr-review')) {
      bootstrap += `- Required PR reviews are explicit assigned child issues (Code Reviewer + Product Owner; plus Security/QA/UI/DevOps when relevant), not @-mentions.\n`;
    }
```

with:

```js
    if (moduleNames.includes('pr-review')) {
      bootstrap += `- Required PR reviews use the issue's \`executionPolicy\`: a \`review\` stage for the Code Reviewer (plus any relevant domain reviewer — QA/UI/UX/DevOps), then a final \`approval\` stage for the Product Owner. Resolve each reviewer/approver role to its agentId. Do not create separate child review issues and do not use @-mentions.\n`;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:logic 2>&1 | tail -8`
Expected: PASS — 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.test.js
git commit -m "feat: pr-review BOOTSTRAP guardrail describes executionPolicy"
```

---

## Task 4: Update the pr-review module metadata

**Files:**
- Modify: `templates/modules/pr-review/module.meta.json`

- [ ] **Step 1: Rewrite description and the setup issue**

Replace the `description` and `issues` fields in `templates/modules/pr-review/module.meta.json` so the file reads:

```json
{
  "name": "pr-review",
  "description": "Coordinates pull request reviews through the issue's native executionPolicy (review/approval stages) instead of separate child issues. Reviewers may mirror verdicts as PR comments, but GitHub-native approvals require distinct non-author GitHub credentials.",
  "requires": [
    "github-repo"
  ],
  "activatesWithRoles": [
    "engineer",
    "code-reviewer",
    "product-owner",
    "ui-designer",
    "ux-researcher",
    "qa",
    "devops"
  ],
  "capabilities": [],
  "issues": [
    {
      "title": "Set up Paperclip PR review workflow",
      "assignTo": "engineer",
      "reviewGate": {
        "reviewers": ["code-reviewer"],
        "approver": "product-owner"
      },
      "description": "Document and verify the PR workflow: feature branches, PR links, and review via the issue's executionPolicy — a review stage for the Code Reviewer (plus relevant domain reviewers) and a final approval stage for the Product Owner, with engineer-owned merges once all stages clear. Optional branch protection may disable direct pushes or require CI, but do not require GitHub-native approving reviews unless the project has distinct non-author GitHub reviewer credentials."
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('templates/modules/pr-review/module.meta.json','utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Commit**

```bash
git add templates/modules/pr-review/module.meta.json
git commit -m "feat: pr-review module declares reviewGate on its setup issue"
```

---

## Task 5: Rewrite the engineer PR workflow skill

**Files:**
- Modify: `templates/modules/pr-review/agents/engineer/skills/pr-workflow.md`

- [ ] **Step 1: Replace the file contents**

Overwrite `templates/modules/pr-review/agents/engineer/skills/pr-workflow.md` with:

```markdown
# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to main. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Pull latest main: `git pull origin main`
2. Create branch: `git checkout -b <prefix>-<N>/<short-description>`
3. Make your changes, commit with Conventional Commits format
4. Push branch: `git push -u origin <branch-name>`
5. Open PR: `gh pr create --title "<type>: <description>" --body "<template>"`
6. Set the originating issue's `executionPolicy` to gate the merge on review:
   - One `review` stage with the **Code Reviewer** as participant (always).
   - Additional `review` stages for any relevant domain reviewer that exists in the team (UI Designer for UI diffs, UX Researcher for flow changes, QA for logic/test-sensitive changes, DevOps for infra/deploy/dependency changes).
   - A final `approval` stage with the **Product Owner** as participant (always).
   - Resolve each role to its agentId first (look up active agents), then set the policy on the issue. Include the PR link in an issue comment so reviewers can find it.
7. Move the originating issue to `in_review`.
8. Wait for the issue to clear its stages. Each reviewer records `approved` or `changes_requested` on their stage; verdicts may be mirrored as PR comments.
9. When all stages are approved (no `changes_requested` outstanding): `gh pr merge <number> --merge`, then set the issue to `done`.

## Rules

- Never commit directly to main (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If a reviewer requests changes, address them, push to the same branch, and re-request review (the stage re-runs).
- You are the merge owner — never ask reviewers to merge.
- Do not create separate child review issues and do not use @-mentions to request review; the executionPolicy stages are the governance signal.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. The Paperclip executionPolicy stages are the required signal unless a separate non-author GitHub reviewer credential is explicitly available.
```

- [ ] **Step 2: Commit**

```bash
git add templates/modules/pr-review/agents/engineer/skills/pr-workflow.md
git commit -m "feat: engineer pr-workflow sets executionPolicy instead of child issues"
```

---

## Task 6: Rewrite the six reviewer skills (depends on Task 1)

Apply the verdict wording recorded in Task 1. If Task 1 concluded "mechanism-neutral", use the neutral phrasing below verbatim. Each file changes only its "How to Review" section and the reviewer-identity sentence; keep each skill's checklist and domain-specific rules intact.

**Files:**
- Modify: `templates/modules/pr-review/agents/code-reviewer/skills/code-review.md`
- Modify: `templates/modules/pr-review/agents/product-owner/skills/product-review.md`
- Modify: `templates/modules/pr-review/agents/ui-designer/skills/design-review.md`
- Modify: `templates/modules/pr-review/agents/ux-researcher/skills/ux-review.md`
- Modify: `templates/modules/pr-review/agents/qa/skills/qa-review.md`
- Modify: `templates/modules/pr-review/agents/devops/skills/infra-review.md`

- [ ] **Step 1: code-review.md**

Replace the opening identity sentence:
`You are a required Paperclip reviewer — your Paperclip review issue verdict is needed before any PR can be merged.`
with:
`You are a required reviewer — you are the participant of a \`review\` stage on the PR's issue, and your verdict gates the merge.`

Replace the "How to Review" section (the numbered list under `## How to Review`) with:

```markdown
## How to Review

1. When you are the active participant of a review stage on an issue with a PR link, review the PR diff (check out locally if useful).
2. Record your verdict on your review stage:
   - **approved** if the code meets quality standards
   - **changes_requested** with specific, actionable feedback if not
3. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

In the Rules section, replace:
`Do not block only because GitHub rejects formal review submission from the shared PR-author credential. GitHub-native approval is optional unless a distinct non-author reviewer credential is explicitly available.`
with:
`Your review stage verdict is the governance signal. Do not block only because GitHub rejects formal review submission from the shared PR-author credential — GitHub-native approval is optional unless a distinct non-author reviewer credential is explicitly available.`

- [ ] **Step 2: product-review.md**

Replace the identity sentence:
`You are a required Paperclip reviewer — your Paperclip review issue verdict is needed before any PR can be merged.`
with:
`You are the final approver — you are the participant of the \`approval\` stage on the PR's issue, and your sign-off is the last gate before merge.`

Replace the "How to Review" section with:

```markdown
## How to Review

1. When you are the active participant of the approval stage on an issue with a PR link, review the PR against the originating issue.
2. Record your verdict on your approval stage:
   - **approved** if the change meets product requirements
   - **changes_requested** with specific feedback tied to acceptance criteria
3. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

In the Rules section, replace the GitHub sentence (same text as in code-review.md Step 1) with:
`Your approval stage verdict is the final governance signal. Do not block only because GitHub rejects formal review submission from the shared PR-author credential — GitHub-native approval is optional unless a distinct non-author reviewer credential is explicitly available.`

- [ ] **Step 3: design-review.md, ux-review.md, qa-review.md, infra-review.md**

For each of these four files, replace the "How to Review" numbered list so the assignment trigger and verdict use stages. Use this template, keeping each file's existing domain focus line (e.g. "leave code logic to Code Reviewer …"):

design-review.md `## How to Review`:
```markdown
## How to Review

1. When you are the active participant of a review stage on an issue with a PR link, review the PR.
2. Focus only on visual/design concerns — leave code logic to Code Reviewer and product scope to Product Owner.
3. Record your verdict on your review stage:
   - **approved** if visually sound
   - **changes_requested** with specific, actionable feedback if not
4. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

ux-review.md `## How to Review`:
```markdown
## How to Review

1. When you are the active participant of a review stage on an issue with a PR link, review the PR.
2. Focus only on UX and usability concerns — leave code logic to Code Reviewer and visuals to UI Designer.
3. Record your verdict on your review stage:
   - **approved** if usability is sound
   - **changes_requested** with specific, actionable feedback if not
4. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

qa-review.md `## How to Review`:
```markdown
## How to Review

1. When you are the active participant of a review stage on an issue with a PR link, review the PR.
2. Focus on test coverage, regression risk, and validation strategy.
3. Record your verdict on your review stage:
   - **approved** if quality is adequate
   - **changes_requested** with specific gaps and suggested test cases if not
4. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

infra-review.md `## How to Review`:
```markdown
## How to Review

1. When you are the active participant of a review stage on an issue with a PR link, review the PR.
2. Focus on infrastructure, deployment, runtime security, observability, and rollback risk.
3. Record your verdict on your review stage:
   - **approved** if operationally sound
   - **changes_requested** with specific concerns if not
4. Optionally mirror the same verdict as a GitHub PR comment for visibility.
```

- [ ] **Step 4: Verify no "Paperclip review issue" wording remains**

Run:
```bash
grep -rni "review issue\|child review\|child issue" templates/modules/pr-review/agents/
```
Expected: no matches (empty output).

- [ ] **Step 5: Commit**

```bash
git add templates/modules/pr-review/agents/
git commit -m "feat: reviewer skills record verdicts on executionPolicy stages"
```

---

## Task 7: Rewrite the pr-conventions doc

**Files:**
- Modify: `templates/modules/pr-review/docs/pr-conventions.md`

- [ ] **Step 1: Replace the "Review Workflow" and "Review Roles" sections**

In `templates/modules/pr-review/docs/pr-conventions.md`, replace the entire `## Review Workflow` section and the `## Review Roles` section with:

```markdown
## Review Workflow

Review runs through the issue's native `executionPolicy` (stages), not separate child issues:

1. **Engineer** opens the PR on GitHub.
2. **Engineer** sets the originating issue's `executionPolicy`: a `review` stage for the Code Reviewer, optional `review` stages for relevant domain reviewers (UI Designer / UX Researcher / QA / DevOps), and a final `approval` stage for the Product Owner. Reviewer/approver roles are resolved to agentIds. The PR link is added as an issue comment.
3. **Engineer** sets the originating issue to `in_review`.
4. **Code Reviewer** reviews for correctness, security, code style, simplicity and records `approved` / `changes_requested` on the review stage.
5. **Domain reviewers** (when present as stages) review their concern and record their verdict.
6. **Product Owner** reviews for intent match, scope discipline, acceptance criteria, and records the final `approval` verdict.
7. Verdicts are recorded on the stages and may be mirrored as PR comments.
8. **Engineer** merges when all stages are approved (no `changes_requested` outstanding), then sets the originating issue to `done`.

## Review Roles

- **Code Reviewer** (`review` stage): Correctness, security, style, simplicity.
- **Domain reviewers** (`review` stages, when relevant): UI Designer (visual/brand/accessibility), UX Researcher (flows/usability), QA (coverage/regression), DevOps (infra/security/rollback).
- **Product Owner** (`approval` stage): Intent alignment, scope discipline, acceptance criteria — the final sign-off.

Reviewers may also add a PR comment, but GitHub-native approving reviews require distinct non-author GitHub credentials and are optional.
```

- [ ] **Step 2: Commit**

```bash
git add templates/modules/pr-review/docs/pr-conventions.md
git commit -m "docs: pr-conventions describes executionPolicy stage review"
```

---

## Task 8: Full verification, changelog, version bump

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `src/manifest.ts`

- [ ] **Step 1: Run the full test + build matrix**

Run:
```bash
pnpm typecheck && pnpm test 2>&1 | tail -6 && pnpm test:logic 2>&1 | tail -8 && pnpm build 2>&1 | tail -3
```
Expected: typecheck clean; vitest all pass; `node:test` `# fail 0`; build prints `Done`.

- [ ] **Step 2: Add the changelog entry**

In `CHANGELOG.md`, insert below the header block (before the topmost `## [...]` entry):

```markdown
---
## [0.3.9] - 2026-06-08

### Changed

- **PR reviews now use the issue's native `executionPolicy` instead of separate child review issues.** The Engineer sets an ordered stage chain on the originating issue — a `review` stage for the Code Reviewer, optional `review` stages for relevant domain reviewers (UI/UX/QA/DevOps), and a final `approval` stage for the Product Owner — and merges once all stages clear. Reviewer skills record `approved` / `changes_requested` on their stage. This surfaces reviewer/approver in the native UI and removes 2–6 review issues per PR.

### Added

- **`reviewGate` field on declared module/preset issues** (`{ reviewers: [...], approver: "..." }`). Assembly resolves the roles present in the team and renders an ordered executionPolicy sketch into BOOTSTRAP.md; the CEO resolves roles → agentIds when creating the issue. `client.createIssue` already forwards `executionPolicy`.
```

- [ ] **Step 3: Bump the version to 0.3.9**

In `package.json` change `"version": "0.3.8"` → `"version": "0.3.9"`.
In `src/manifest.ts` change `version: '0.3.8'` → `version: '0.3.9'`.

Run:
```bash
grep '"version"' package.json && grep "version:" src/manifest.ts
```
Expected: both show `0.3.9`.

- [ ] **Step 4: Rebuild to embed the new version, then commit**

```bash
pnpm build 2>&1 | tail -3
git add CHANGELOG.md package.json src/manifest.ts dist
git commit -m "chore: release v0.3.9 — pr-review via executionPolicy"
```

---

## Self-review notes

- **Spec coverage:** Full replacement (Tasks 5–7), stage order review→domain→approval (Tasks 5,7), context-dependent domain reviewers (Task 5 step 6, Task 7), `reviewGate` plugin declaration + BOOTSTRAP rendering (Tasks 2,4), no client change (verified, none in plan), guardrail rewrite (Task 3), open verification (Task 1 blocks Task 6), tests (Tasks 2,3,8). GitHub-native left unchanged (stated in Tasks 5–7).
- **Type/name consistency:** helpers `resolveReviewGate` / `renderReviewGate`, field `reviewGate.reviewers[]` + `reviewGate.approver`, stage types `review`/`approval`, outcomes `approved`/`changes_requested` — used consistently across tasks.
