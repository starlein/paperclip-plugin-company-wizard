# Substantive Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `pr-review` module's review concept substantive — the merge gate becomes executed verification (green CI, or running the tests and pasting output), not an agent reading a sibling agent's diff and saying "looks good".

**Architecture:** The hard evidence precondition lives on the Engineer's final merge-gate `executionPolicy` stage, independent of which reviewers are present. QA is the substantive review stage when staffed; the Security Engineer reviews only security-relevant changes; the Code Reviewer becomes advisory (non-blocking). CI-awareness is decided at assembly time by whether the `ci-cd` module is selected. New default — no opt-in flag.

**Tech Stack:** Plain-JS assembly engine (`src/logic/assemble.js`), Markdown templates under `templates/modules/pr-review/`, `node --test` logic suite (`src/logic/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-06-15-substantive-review-design.md`

**Test commands:**
- Single logic file: `node --test src/logic/assemble.integration.test.js`
- Filter by name: `node --test --test-name-pattern="<pattern>" src/logic/assemble.integration.test.js`
- Full logic suite: `pnpm test:logic`
- Full plugin suite: `pnpm test`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `templates/modules/pr-review/module.meta.json` | Gate definition, role activation, module/issue copy | Modify |
| `templates/modules/pr-review/agents/qa/skills/qa-review.md` | QA = substantive gate, two modes, evidence | Rewrite |
| `templates/modules/pr-review/agents/code-reviewer/skills/code-review.md` | Code review = advisory, non-binding | Rewrite |
| `templates/modules/pr-review/agents/security-engineer/skills/pr-security-review.md` | PR-scoped, conditional security probe | Create |
| `templates/modules/pr-review/docs/pr-conventions.md` | Workflow + merge rules + comment posting | Rewrite 3 sections, remove `gh pr review` line |
| `src/logic/assemble.js` | `renderReviewGate` CI-awareness; BOOTSTRAP pr-review guardrail | Modify |
| `src/logic/assemble.integration.test.js` | Assembly assertions for the new model | Add 4 tests |

**No-touch (verified safe):** the two existing unit tests in `src/logic/assemble.test.js` (synthetic `gated-work` and `pr-review` modules) stay green — they assert generic `renderReviewGate` ordering and the guardrail opening phrase, both preserved. The existing `assemble.integration.test.js` "Paperclip-governed verdicts" test (line 281) currently FAILS because `pr-conventions.md` contains `gh pr review --request-changes`; Task 6 removes that line and turns it green.

---

### Task 1: Slim the reviewGate, wire security-engineer, rewrite module copy

**Files:**
- Modify: `templates/modules/pr-review/module.meta.json`
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` block inside the existing top-level `describe(...)` in `src/logic/assemble.integration.test.js` (e.g. right after the existing `'pr-review templates use Paperclip-governed verdicts...'` test, before line 323's `'injects skill references...'`):

```js
  it('pr-review gates on QA + executed verification, not a reading-only code reviewer', async () => {
    const meta = JSON.parse(
      await readFile(join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'module.meta.json'), 'utf-8'),
    );
    const gate = meta.issues[0].reviewGate;
    assert.deepEqual(gate.reviewers, ['qa'], 'QA is the substantive review stage');
    assert.equal(gate.approver, 'product-owner');
    assert.equal(gate.mergeGate, 'engineer');
    assert.ok(
      !gate.reviewers.includes('code-reviewer'),
      'code-reviewer is no longer a blocking reviewer',
    );
    assert.ok(
      meta.activatesWithRoles.includes('security-engineer'),
      'security-engineer can activate pr-review for the conditional security stage',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="gates on QA" src/logic/assemble.integration.test.js`
Expected: FAIL — `gate.reviewers` is `['code-reviewer']`, not `['qa']`.

- [ ] **Step 3: Rewrite `module.meta.json`**

Replace the entire contents of `templates/modules/pr-review/module.meta.json` with:

```json
{
  "name": "pr-review",
  "description": "Coordinates substantive PR review through the issue's native executionPolicy. The merge gate is executed verification — green CI, or the engineer running the tests/build and pasting the output — not opinion. QA is the substantive reviewer when present; the Security Engineer reviews only security-relevant changes; the Code Reviewer is advisory.",
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
    "security-engineer",
    "devops"
  ],
  "capabilities": [],
  "issues": [
    {
      "title": "Set up Paperclip PR review workflow",
      "bootstrapPhase": "foundation",
      "assignTo": "engineer",
      "reviewGate": {
        "reviewers": ["qa"],
        "approver": "product-owner",
        "mergeGate": "engineer"
      },
      "description": "Document and verify the PR workflow via the issue's executionPolicy. The merge gate is executed verification: with CI, builds must be green before merge; without CI, the engineer runs the test suite/build and pastes the output before merging. Stages: a review stage for QA when present, a review stage for the Security Engineer only on security-relevant changes, an approval stage for the Product Owner, and a final approval stage for the Engineer as the merge gate (woken last to merge the PR before recording approval, which closes the issue). The merge gate must be the last stage so the Product Owner's approval does not auto-close the issue with the PR still open. The Code Reviewer and other domain reviewers add advisory, non-blocking comments. Optional branch protection may disable direct pushes, but do not require GitHub-native approving reviews unless the project has distinct non-author GitHub reviewer credentials."
    }
  ]
}
```

Note (do not change): the module `description` must not contain "branch protection" and the issue description must not contain "require pr reviews" — the existing test at line 281 asserts both. The text above is already compliant.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="gates on QA" src/logic/assemble.integration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/modules/pr-review/module.meta.json src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): make QA the review gate, wire conditional security stage"
```

---

### Task 2: CI-aware merge-gate precondition + evidence note in `renderReviewGate`

**Files:**
- Modify: `src/logic/assemble.js:341-360` (the `renderReviewGate` function)
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing tests**

Add these two `it(...)` blocks in `src/logic/assemble.integration.test.js` (near the other pr-review tests). Note: `exists`, `readFile`, `join` are already imported in this file.

```js
  it('renders a CI-green hard gate in BOOTSTRAP when ci-cd is active', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'CiGateCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'ci-cd', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes('CI must be green before merge'),
      'CI mode should state CI-green as the hard merge-gate precondition',
    );
    assert.ok(
      bootstrap.toLowerCase().includes('looks good'),
      'evidence note should reject "looks good" verdicts',
    );
  });

  it('renders a run-the-tests fallback gate in BOOTSTRAP when no CI is configured', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'NoCiGateCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes('no CI configured'),
      'no-CI mode should fall back to running tests + pasting output before merge',
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern="hard gate in BOOTSTRAP|run-the-tests fallback" src/logic/assemble.integration.test.js`
Expected: FAIL — neither `'CI must be green before merge'` nor `'no CI configured'` is emitted yet.

- [ ] **Step 3: Implement CI-awareness in `renderReviewGate`**

In `src/logic/assemble.js`, replace the `renderReviewGate` function (currently at lines 341-360) with:

```js
  // Render a resolved reviewGate as an executionPolicy sketch for BOOTSTRAP.md.
  // The CEO/Engineer resolves each role name to its agentId when setting the
  // policy on the issue (same role→agentId resolution as `assigneeAgentId`).
  // The merge-gate stage carries the hard precondition: CI-green when the ci-cd
  // module is selected, otherwise running the tests/build and pasting the output.
  const hasCi = moduleNames.includes('ci-cd');
  const renderReviewGate = (gate) => {
    const stages = [];
    for (const role of gate.reviewers) {
      stages.push(`  - stage ${stages.length + 1} (review) → assign ${JSON.stringify(role)}`);
    }
    if (gate.approver) {
      stages.push(
        `  - stage ${stages.length + 1} (approval) → assign ${JSON.stringify(gate.approver)}`,
      );
    }
    if (gate.mergeGate) {
      const gatePrecondition = hasCi
        ? 'CI must be green before merge'
        : 'no CI configured — run the test suite/build and paste the output before merge';
      stages.push(
        `  - stage ${stages.length + 1} (approval) → assign ${JSON.stringify(gate.mergeGate)}  — merge gate: ${gatePrecondition}; merge the PR, then record approved to close`,
      );
    }
    return (
      `- **executionPolicy** (set when creating this issue; resolve each role to its agentId):\n` +
      `${stages.join('\n')}\n` +
      `  - every verdict must cite executed verification (commands + results); "looks good" without evidence is not a valid verdict\n\n`
    );
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-name-pattern="hard gate in BOOTSTRAP|run-the-tests fallback" src/logic/assemble.integration.test.js`
Expected: PASS (both).

- [ ] **Step 5: Guard the existing unit test still passes**

Run: `node --test --test-name-pattern="renders a reviewGate as an ordered executionPolicy" src/logic/assemble.test.js`
Expected: PASS — the synthetic `gated-work` gate still renders `(review) → assign "code-reviewer"`, `merge gate`, and `(approval) → assign "engineer"` in order; the new evidence note does not introduce `missing-role`.

- [ ] **Step 6: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): merge-gate precondition is CI-green or run-the-tests evidence"
```

---

### Task 3: Rewrite the BOOTSTRAP pr-review guardrail text

**Files:**
- Modify: `src/logic/assemble.js:1289-1291` (the `if (moduleNames.includes('pr-review'))` guardrail block)
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` block in `src/logic/assemble.integration.test.js`:

```js
  it('BOOTSTRAP guardrail describes the substantive gate and advisory code reviewer', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'GuardrailCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes("Required PR reviews use the issue's `executionPolicy`"),
      'guardrail keeps its opening phrase',
    );
    assert.ok(
      bootstrap.includes('advisory'),
      'guardrail marks the Code Reviewer / domain reviewers advisory',
    );
    assert.ok(
      bootstrap.includes('only when the change is security-relevant'),
      'guardrail makes the security stage conditional',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="guardrail describes the substantive gate" src/logic/assemble.integration.test.js`
Expected: FAIL — the old guardrail text lacks "advisory" and "only when the change is security-relevant".

- [ ] **Step 3: Rewrite the guardrail block**

In `src/logic/assemble.js`, replace this block (lines 1289-1291):

```js
    if (moduleNames.includes('pr-review')) {
      bootstrap += `- Required PR reviews use the issue's \`executionPolicy\`: a \`review\` stage for the Code Reviewer (plus any relevant domain reviewer — QA/UI/UX/DevOps), an \`approval\` stage for the Product Owner, then a final \`approval\` merge-gate stage for the Engineer (who merges the PR before recording approval, which closes the issue). The merge gate must be last so the Product Owner's approval does not auto-close the issue with the PR still open. Resolve each role to its agentId. Do not create separate child review issues and do not use @-mentions.\n`;
    }
```

with:

```js
    if (moduleNames.includes('pr-review')) {
      const ciClause = moduleNames.includes('ci-cd')
        ? 'CI (lint/test/build) must be green before the Engineer merges — this is the hard gate and cannot be skipped'
        : 'no CI is configured, so the Engineer must run the test suite/build and paste the real output into the merge-gate verdict before merging — this is the hard gate';
      bootstrap += `- Required PR reviews use the issue's \`executionPolicy\`. The substantive gate is execution, not opinion: ${ciClause}. Stages, in order: a \`review\` stage for QA when present (test adequacy / running the tests), a \`review\` stage for the Security Engineer **only when the change is security-relevant** (auth, secrets, input boundaries, crypto, dependencies, infra exposure), an \`approval\` stage for the Product Owner (intent/scope), then a final \`approval\` merge-gate stage for the Engineer (who satisfies the hard gate above, merges the PR, then records approval to close the issue). The merge gate must be last so the Product Owner's approval does not auto-close the issue with the PR still open. The Code Reviewer and other domain reviewers may add advisory, non-blocking comments but do not gate the merge. Every verdict must cite executed verification. Resolve each role to its agentId. Do not create separate child review issues and do not use @-mentions.\n`;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="guardrail describes the substantive gate" src/logic/assemble.integration.test.js`
Expected: PASS.

- [ ] **Step 5: Guard the existing unit test still passes**

Run: `node --test --test-name-pattern="adds PR-review executionPolicy guardrail" src/logic/assemble.test.js`
Expected: PASS — the opening phrase `Required PR reviews use the issue's \`executionPolicy\`` is preserved and `'are explicit assigned child issues'` is still absent.

- [ ] **Step 6: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): rewrite BOOTSTRAP guardrail for substantive gate"
```

---

### Task 4: Rewrite `qa-review.md` — QA is the substantive gate

**Files:**
- Rewrite: `templates/modules/pr-review/agents/qa/skills/qa-review.md`
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` block in `src/logic/assemble.integration.test.js`:

```js
  it('QA review skill is the substantive gate with an evidence requirement', async () => {
    const qaSkill = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'agents', 'qa', 'skills', 'qa-review.md'),
      'utf-8',
    );
    assert.ok(qaSkill.includes('substantive review gate'), 'QA framed as the gate');
    assert.ok(
      qaSkill.toLowerCase().includes('without execution output is invalid') ||
        qaSkill.toLowerCase().includes('without executed verification'),
      'a verdict without executed evidence must be invalid',
    );
    assert.ok(!qaSkill.includes('gh pr review'), 'no formal GitHub review with shared credential');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="QA review skill is the substantive gate" src/logic/assemble.integration.test.js`
Expected: FAIL — current `qa-review.md` does not contain "substantive review gate".

- [ ] **Step 3: Rewrite the file**

Replace the entire contents of `templates/modules/pr-review/agents/qa/skills/qa-review.md` with:

```markdown
# Skill: QA Review

You are the **substantive review gate** for pull requests. Review is by *doing*, not by reading: your verdict must rest on tests that actually ran. "Looks good" is not a review.

## Two modes

**CI is configured (hard gate = CI):**
Your job is to ensure the tests *mean something*. Green CI on a change with no real coverage is worthless. Verify:
- New code paths and edge cases are covered by tests that CI runs.
- Tests assert behavior, not implementation.
- Regression risk is covered.
Record `approved` only when CI is green AND coverage is adequate. If coverage is inadequate, record `changes_requested` with the specific missing test cases — even if CI is green.

**No CI configured (you are the gate):**
There is no machine arbiter, so you run it. Check out the branch, run the full test suite and the build locally, and paste the **real command output** into your verdict. A verdict without execution output is invalid.

```bash
git fetch origin && git checkout <branch>
<the project's test command>   # e.g. pnpm test, pytest, go test ./...
<the project's build command>  # e.g. pnpm build
```

Record `approved` only if the suite and build pass and coverage is adequate; otherwise `changes_requested` with the failing output and the gaps.

## Review checklist

1. **Test coverage** — new code paths and edge cases covered?
2. **Regression risk** — could this break existing behavior? Is the affected area covered?
3. **Error handling** — failure modes handled and tested?
4. **Boundary conditions** — empty/null/max/concurrent inputs respected?
5. **Data validation** — input validated at boundaries; API contracts enforced?
6. **Test quality** — tests assert behavior; readable and maintainable?
7. **Manual test plan** — for hard-to-automate changes, is a manual plan documented in the PR?

## How to record your verdict

1. You are the active participant of a `review` stage on the issue carrying the PR link.
2. Record on your stage: `approved` (with the evidence — commands + results) or `changes_requested` (with specific gaps and suggested test cases).
3. Optionally mirror the verdict as a GitHub PR comment via a Markdown file: open with a heading (`## ✅ Approved` / `## 🔄 Changes requested`), then details, and run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- A verdict that does not cite executed verification (CI green, or your pasted test/build output) is invalid.
- Be constructive — suggest specific test cases, don't just say "needs more tests".
- Flag untested critical paths as blockers; untested non-critical paths as suggestions.
- Approve trivial changes (docs, comments, config) without ceremony.
- If CI is missing or broken, that is a blocker — tests that don't run don't count.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="QA review skill is the substantive gate" src/logic/assemble.integration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/modules/pr-review/agents/qa/skills/qa-review.md src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): rewrite QA review skill as the substantive evidence gate"
```

---

### Task 5: Rewrite `code-review.md` — advisory, non-binding

**Files:**
- Rewrite: `templates/modules/pr-review/agents/code-reviewer/skills/code-review.md`
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` block in `src/logic/assemble.integration.test.js`:

```js
  it('code review skill is advisory and does not gate the merge', async () => {
    const crSkill = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'agents', 'code-reviewer', 'skills', 'code-review.md'),
      'utf-8',
    );
    assert.ok(crSkill.toLowerCase().includes('advisory'), 'framed as advisory');
    assert.ok(
      crSkill.toLowerCase().includes('do not gate the merge') ||
        crSkill.toLowerCase().includes('does not block the merge') ||
        crSkill.toLowerCase().includes('not a merge gate'),
      'explicitly non-blocking',
    );
    assert.ok(!crSkill.includes('gh pr review'), 'no formal GitHub review with shared credential');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="code review skill is advisory" src/logic/assemble.integration.test.js`
Expected: FAIL — current `code-review.md` calls itself "a required reviewer".

- [ ] **Step 3: Rewrite the file**

Replace the entire contents of `templates/modules/pr-review/agents/code-reviewer/skills/code-review.md` with:

```markdown
# Skill: Code Review (advisory)

You provide an **advisory, non-binding** code review. You are *not a merge gate*: the merge is gated by executed verification — green CI, or QA running the tests (see `docs/pr-conventions.md`). Your value is a second pair of eyes on correctness, clarity, and simplicity that automated checks miss.

## What to look for

1. **Correctness** — Does the code do what the PR claims? Are edge cases handled? Does the logic match the stated intent?
2. **Simplicity** — Is this the simplest solution that works? Could anything be removed without losing functionality?
3. **Clarity** — Naming, structure, comments. Will the next reader understand this?
4. **Security smells** — Obvious injection, exposed secrets, missing validation at boundaries. Defer deep security review to the Security Engineer when the change is security-relevant.
5. **Dead code** — Commented-out blocks, unused branches.

## How to comment

1. When the PR has a review stage assigned to you, read the diff (check it out locally if useful).
2. Post your feedback as a GitHub PR comment via a Markdown file: open with a heading (`## 💬 Review notes`), then specific, actionable points, and run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."` — `\n` stays literal in a double-quoted shell string. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.
3. If you are a participant on an advisory review stage, record your notes there too — but understand it does not gate the merge.

## Rules

- Be constructive — suggest alternatives, don't just criticize.
- Focus on substance over style; auto-formatters handle style.
- "Looks good" is not useful feedback. Point at what you actually examined.
- Raise correctness or security concerns clearly so QA / the Security Engineer / the Engineer can act on them before merge.
- You do not gate the merge. If something must block, it belongs to QA (tests), the Security Engineer (security-relevant), or CI.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="code review skill is advisory" src/logic/assemble.integration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/modules/pr-review/agents/code-reviewer/skills/code-review.md src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): reframe code review as advisory, non-blocking"
```

---

### Task 6: Add the PR-scoped security review skill + rewrite `pr-conventions.md`

**Files:**
- Create: `templates/modules/pr-review/agents/security-engineer/skills/pr-security-review.md`
- Rewrite: `templates/modules/pr-review/docs/pr-conventions.md` (3 sections + remove `gh pr review` line)
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the failing test**

Add this `it(...)` block in `src/logic/assemble.integration.test.js`:

```js
  it('installs the PR-scoped security review skill when a security engineer is present', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'SecReviewCo',
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'security-engineer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const skillPath = join(
      companyDir, 'agents', 'security-engineer', 'skills', 'pr-security-review.md',
    );
    assert.ok(
      await exists(skillPath),
      'pr-security-review.md should be installed for security-engineer',
    );
    const content = await readFile(skillPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('security-relevant'),
      'pr-security-review scopes itself to security-relevant changes',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="PR-scoped security review skill" src/logic/assemble.integration.test.js`
Expected: FAIL — the file does not exist yet.

- [ ] **Step 3: Create `pr-security-review.md`**

Create `templates/modules/pr-review/agents/security-engineer/skills/pr-security-review.md` with:

```markdown
# Skill: PR Security Review

You review a **specific PR's diff** for security-relevant changes. You are added as a `review` stage **only when the change touches** authentication, authorization, secrets, input boundaries, cryptography, dependencies, or infrastructure exposure — i.e. when it is security-relevant. (For broader threat modeling, see your `security-review` skill from the security-audit module, if present.)

Review is by *probing*, not by reading. Your verdict must state what you actually checked.

## What to probe

1. **Input boundaries** — Is all external input validated and encoded? Any injection surface (SQL, command, path, template)?
2. **AuthN/AuthZ** — Are new endpoints/actions access-controlled? Any privilege escalation or missing ownership check?
3. **Secrets** — No secrets in code, logs, or error messages. Secret handling uses the established mechanism.
4. **Crypto** — No home-grown crypto; correct, current algorithms and key handling.
5. **Dependencies** — New/updated deps: known vulnerabilities? Is the source trustworthy?
6. **Data exposure** — Does the change leak data in responses, logs, or errors beyond what's intended?

## How to record your verdict

1. You are the active participant of a `review` stage on the issue carrying the PR link.
2. State **what you probed and how** (e.g. "checked the new `/upload` endpoint for path traversal with `../` inputs; validated the content-type allowlist"). A verdict without concrete checks is invalid.
3. Record `approved` (with the checks performed) or `changes_requested` (with the specific finding, its impact, and a remediation).
4. Optionally mirror as a GitHub PR comment via a Markdown file (`## ✅ Approved` / `## 🔄 Changes requested`), run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."`. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- Block on exploitable issues (injection, auth bypass, secret exposure). Suggest on defense-in-depth hardening.
- Be specific: name the input, the path, the impact. "Looks secure" is not a review.
- If the change is not actually security-relevant, say so briefly and approve — don't manufacture findings.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="PR-scoped security review skill" src/logic/assemble.integration.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `pr-conventions.md`**

In `templates/modules/pr-review/docs/pr-conventions.md`, make three edits.

**Edit 5a — remove the forbidden `gh pr review` example.** In the *Posting PR Bodies & Comments* code block, delete this line (keep the `gh pr create` and `gh pr comment` lines):

```
gh pr review  <number> --request-changes --body-file /tmp/pr-body.md
```

**Edit 5b — replace the `## Review Workflow` section** (the numbered list 1-8) with:

```markdown
## Review Workflow

Review runs through the issue's native `executionPolicy` (stages), not separate child issues. The gate is **executed verification, not opinion**.

1. **Engineer** opens the PR on GitHub and adds the PR link as an issue comment.
2. **Engineer** sets the originating issue's `executionPolicy` stages, in order:
   - a `review` stage for **QA** when a QA agent is on the team (test adequacy / running the tests),
   - a `review` stage for the **Security Engineer** *only when the change is security-relevant* (auth, secrets, input boundaries, crypto, dependencies, infra exposure),
   - an `approval` stage for the **Product Owner** (intent, scope, acceptance),
   - a final `approval` stage for the **Engineer** as the merge gate.
   Resolve each role to its agentId.
3. **Engineer** sets the issue to `in_review`.
4. **QA** (when present) reviews and records `approved`/`changes_requested` with executed evidence (see *Merge Rules*).
5. **Security Engineer** (when present as a stage) probes the security-relevant change and records a verdict stating what was checked.
6. **Code Reviewer** and other domain reviewers may add **advisory, non-blocking** PR comments. They do not gate the merge.
7. **Product Owner** reviews for intent match, scope discipline, and acceptance criteria, and records the `approval` verdict.
8. **Engineer** owns the final `approval` stage (merge gate): once reviewers and the Product Owner have approved, the engineer satisfies the hard gate (CI green, or runs the tests/build and pastes the output), merges the PR, confirms the merge landed, and only then records `approved` — which closes the issue to `done`. The merge must happen before the issue is `done`.
```

**Edit 5c — replace the `## Review Roles` and `## Merge Rules` sections** with:

```markdown
## Review Roles

- **QA** (`review` stage, when present): the substantive gate. Test coverage, regression risk, and validation — backed by tests that actually ran.
- **Security Engineer** (`review` stage, only when the change is security-relevant): probes the diff for injection, auth, secrets, crypto, dependency, and exposure issues.
- **Product Owner** (`approval` stage): intent alignment, scope discipline, acceptance criteria.
- **Engineer** (`approval` stage, last): the merge gate and hard-gate backstop — see *Merge Rules*.
- **Code Reviewer / domain reviewers** (advisory): optional, non-blocking comments on correctness, clarity, design, accessibility, UX. They never gate the merge.

## Merge Rules

The hard gate is **executed verification**, enforced on the Engineer's merge-gate stage and independent of which reviewers are present:

- **With CI:** CI (lint/test/build) must be **green** before the Engineer merges. This is machine-verified and cannot be skipped.
- **Without CI:** the Engineer must run the full test suite and build locally and paste the real output into the merge-gate verdict before merging. (When QA is present, QA already produced this evidence; the Engineer confirms it.)
- A verdict that does not cite executed verification — green CI, or pasted test/build output — is not valid.
- The Product Owner's `approval` stage must be approved.
- QA's `review` stage (when present) and the Security Engineer's `review` stage (when added) must be approved.
- The Code Reviewer and other domain reviewers are advisory — blocking only when they escalate a concern that QA, the Security Engineer, or the Engineer then acts on.
- No force pushes.
- Merge using `gh pr merge <number> --merge`.
- The Engineer is the merge owner — reviewers never merge.
- The engineer's merge gate must be the **last** `approval` stage. If the Product Owner's approval were last, it would auto-close the issue to `done` and the merge would be skipped, leaving the PR open on GitHub.
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs.
```

Leave the `## Dev Cycle Rules` section (and all earlier sections) unchanged.

- [ ] **Step 6: Run the existing "Paperclip-governed verdicts" test (now green)**

Run: `node --test --test-name-pattern="Paperclip-governed verdicts" src/logic/assemble.integration.test.js`
Expected: PASS — `gh pr review`, `--approve`, `--request-changes` no longer appear in any pr-review markdown (this test currently FAILS on the branch; this step fixes it).

- [ ] **Step 7: Commit**

```bash
git add templates/modules/pr-review/agents/security-engineer/skills/pr-security-review.md templates/modules/pr-review/docs/pr-conventions.md src/logic/assemble.integration.test.js
git commit -m "feat(pr-review): add PR-scoped security review skill, rewrite conventions"
```

---

### Task 7: Full verification + template cache sync

**Files:** none (verification only)

- [ ] **Step 1: Run the full logic suite**

Run: `pnpm test:logic`
Expected: PASS — all `src/logic/*.test.js` and `src/api/*.test.js` green, including the previously-failing "Paperclip-governed verdicts" test and the quality-preset integration test.

- [ ] **Step 2: Run the full plugin suite**

Run: `pnpm test`
Expected: PASS — no vitest assertion in `tests/**/*.spec.ts` depended on the old pr-review wording.

- [ ] **Step 3: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed (no `.ts` changed, but confirm the JS edit did not break the bundle).

- [ ] **Step 4: Sync the template cache so the running plugin sees the new templates**

The worker reads `~/.paperclip/plugin-templates` first; a stale cache masks these template edits.

Run: `rsync -a --delete templates/ "$HOME/.paperclip/plugin-templates/"`
Expected: completes silently. (If `sync-plugin.sh` is the project's preferred path, run that instead.)

- [ ] **Step 5: Commit any remaining staged changes (if the build produced dist artifacts that are tracked)**

```bash
git status
# Only if dist/ is tracked and changed:
git add -A && git commit -m "chore: rebuild dist after pr-review review redesign"
```

---

## Self-Review

**1. Spec coverage:**
- Two-mode gate (CI / no-CI) → Tasks 2, 3 (assemble.js) + Task 4 (qa-review modes) + Task 6 (conventions). ✓
- Hard gate on Engineer merge-gate stage, QA-independent → Task 2 (`renderReviewGate` mergeGate precondition) + Task 3 (guardrail `ciClause`) + Task 6 (Merge Rules). ✓
- Evidence requirement / no "looks good" → Task 2 (evidence note), Task 4, Task 5, Task 6. ✓
- Stage order (QA → conditional Security → advisory CR → PO → Engineer last) → Task 1 (reviewGate) + Task 3 (guardrail) + Task 6 (workflow). ✓
- code-reviewer out of gate, advisory → Task 1 (reviewers `['qa']`) + Task 5 + Task 6. ✓
- Security stage home (`pr-security-review.md`, distinct name, `activatesWithRoles`) → Task 1 + Task 6. ✓
- New default, no flag → no manifest/worker change in any task. ✓ (intentional)
- Presets unchanged → no preset task. ✓ (intentional, per decision)

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". The `<branch>` / `<the project's test command>` tokens inside the `qa-review.md` code block are *intended literal template content* shown to agents, not plan placeholders.

**3. Type/name consistency:** `hasCi` defined once (Task 2) and reused; `moduleNames.includes('ci-cd')` used consistently in Tasks 2 and 3. Skill file named `pr-security-review.md` consistently in Task 1 (spec), Task 6 (create), and its test. `reviewGate.reviewers` = `['qa']` consistent across Task 1 meta and test.

**4. Test-safety of existing suites:** Verified — `assemble.test.js:372` (synthetic gate ordering) and `assemble.test.js:897` (guardrail opening phrase) both keep passing; `assemble.integration.test.js:281` (forbidden GitHub strings) flips from failing to passing in Task 6.
