# Agent Persona Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in agent persona enrichment (domain lenses, output/review bars, done-criteria) gated behind a new `enableEnrichedPersonas` plugin setting, injected from fragment files at assembly time so the lean baseline is unchanged when off.

**Architecture:** Enrichment content lives in fragment files (`roles/<role>/LENSES.md`, `roles/<role>/DONE.md`, `modules/<module>/skills/<skill>.bar.md`). `assembleCompany()` filters these from the normal copy and conditionally appends them into `SOUL.md` / `HEARTBEAT.md` / installed primary skills when `enableEnrichedPersonas` is true. The flag is threaded `manifest.ts → worker.ts (cfgBool) → assembleCompany`, exactly like `enableIsolatedWorktrees`.

**Tech Stack:** Node ESM, `node:fs/promises`; tests with `node:test` (`pnpm test:logic`) and vitest (`pnpm test`); esbuild build.

---

## File Structure

**Modified:**
- `src/logic/assemble.js` — new `enableEnrichedPersonas` param; `isEnrichmentFragment()` helper; fragment filtering in the two role-copy loops and the non-capability skill loop; bar append in `installSkill`; new injection step for LENSES/DONE.
- `src/worker.ts` — read `enableEnrichedPersonas` via `cfgBool`; pass into both `assembleCompany` calls.
- `src/manifest.ts` — declare the `enableEnrichedPersonas` boolean setting.
- `src/logic/assemble.test.js` — tests for on/off behaviour and fragment non-leakage.
- `README.md`, `CLAUDE.md`, `AGENTS.md`, `ROADMAP.md` — docs.

**Created (content fragments):**
- `templates/roles/{security-engineer,ux-researcher,ui-designer,product-owner,code-reviewer,devops}/LENSES.md`
- `templates/roles/{engineer,qa,security-engineer,ux-researcher,ui-designer,product-owner,code-reviewer,devops}/DONE.md`
- `templates/modules/<module>/skills/<skill>.bar.md` for the mapped skills (Task 9).

---

## Task 1: Assembly engine — fragment helper + filter from role copy

**Files:**
- Modify: `src/logic/assemble.js` (helper after `appendToFile` ~line 48; base-role copy ~line 217; extra-role copy ~line 234)
- Test: `src/logic/assemble.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/logic/assemble.test.js` (inside the top-level `describe`, after `setupFixtures`/`beforeEach` are in scope — mirror the existing test style):

```js
it('does not emit enrichment fragments as standalone files (flag off)', async () => {
  // engineer is a base role in the fixtures; give it enrichment fragments.
  const engDir = join(templatesDir, 'roles', 'engineer');
  await writeFile(join(engDir, 'LENSES.md'), '## Domain Lenses\n\n- **Test Lens** — x\n');
  await writeFile(join(engDir, 'DONE.md'), '## Done\n\nAlways comment.\n');

  const { companyDir } = await assembleCompany({
    companyName: 'FragCo',
    moduleNames: [],
    extraRoleNames: [],
    outputDir,
    templatesDir,
  });

  const files = await readdir(join(companyDir, 'agents', 'engineer'));
  assert.ok(!files.includes('LENSES.md'), 'LENSES.md must not be copied verbatim');
  assert.ok(!files.includes('DONE.md'), 'DONE.md must not be copied verbatim');
  // Baseline SOUL.md unchanged (no lens content) when flag is off.
  const soul = await readFile(join(companyDir, 'agents', 'engineer', 'SOUL.md'), 'utf-8');
  assert.ok(!soul.includes('Domain Lenses'), 'SOUL.md must stay lean when flag off');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:logic 2>&1 | grep -A3 "enrichment fragments as standalone"`
Expected: FAIL — `LENSES.md`/`DONE.md` ARE present in the copied agent dir (current code copies them).

- [ ] **Step 3: Add the helper**

In `src/logic/assemble.js`, after the `appendToFile` function (ends ~line 48), add:

```js
// Enrichment fragments are opt-in persona additions (domain lenses, done-criteria,
// output bars). They are never emitted as standalone files — assembly appends them
// into SOUL.md / HEARTBEAT.md / skill files only when enableEnrichedPersonas is on.
function isEnrichmentFragment(name) {
  return name === 'LENSES.md' || name === 'DONE.md' || name.endsWith('.bar.md');
}
```

- [ ] **Step 4: Filter fragments from the base-role copy**

In the base-role copy loop, change the file-copy branch (currently ~line 217):

```js
      } else if (!entry.name.endsWith('.meta.json') && !isEnrichmentFragment(entry.name)) {
        await copyFile(join(roleSrc, entry.name), join(roleDest, entry.name));
      }
```

- [ ] **Step 5: Filter fragments from the extra-role copy**

In the extra-role copy loop (currently ~line 234-236), add the guard:

```js
    for (const entry of entries) {
      if (entry.isDirectory() || !entry.name.endsWith('.md')) continue;
      if (isEnrichmentFragment(entry.name)) continue;
      await copyFile(join(roleDir, entry.name), join(destDir, entry.name));
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:logic 2>&1 | grep -A3 "enrichment fragments as standalone"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.test.js
git commit -m "feat(assemble): filter enrichment fragments from role copy"
```

---

## Task 2: Assembly engine — add `enableEnrichedPersonas` param + inject LENSES/DONE

**Files:**
- Modify: `src/logic/assemble.js` (param ~line 112; JSDoc ~line 94; new injection step after heartbeat injection ~line 595)
- Test: `src/logic/assemble.test.js`

- [ ] **Step 1: Write the failing test**

```js
it('injects lenses into SOUL.md and done-criteria into HEARTBEAT.md when enabled', async () => {
  const engDir = join(templatesDir, 'roles', 'engineer');
  await writeFile(join(engDir, 'LENSES.md'), '## Domain Lenses\n\n- **Test Lens** — explanation\n');
  await writeFile(join(engDir, 'DONE.md'), '## Done criteria\n\nAlways update your task with a comment before exiting a heartbeat.\n');

  const { companyDir } = await assembleCompany({
    companyName: 'EnrichCo',
    moduleNames: [],
    extraRoleNames: [],
    enableEnrichedPersonas: true,
    outputDir,
    templatesDir,
  });

  const soul = await readFile(join(companyDir, 'agents', 'engineer', 'SOUL.md'), 'utf-8');
  const heartbeat = await readFile(join(companyDir, 'agents', 'engineer', 'HEARTBEAT.md'), 'utf-8');
  assert.ok(soul.includes('## Domain Lenses'), 'SOUL.md should contain injected lenses');
  assert.ok(soul.includes('Test Lens'), 'SOUL.md should contain the lens body');
  assert.ok(heartbeat.includes('## Done criteria'), 'HEARTBEAT.md should contain done-criteria');
  assert.ok(
    heartbeat.includes('comment before exiting a heartbeat'),
    'HEARTBEAT.md should contain the heartbeat-exit rule',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:logic 2>&1 | grep -A3 "injects lenses into SOUL"`
Expected: FAIL — `enableEnrichedPersonas` is ignored; nothing injected.

- [ ] **Step 3: Add the param + JSDoc**

In `src/logic/assemble.js`, add to the JSDoc block (after the `enableIsolatedWorktrees` line ~94):

```js
 * @param {boolean} [opts.enableEnrichedPersonas] - Opt-in: when true, append role LENSES.md to SOUL.md, role DONE.md to HEARTBEAT.md, and primary-skill <skill>.bar.md output bars. Default false keeps the lean baseline.
```

In the destructured params (after `enableIsolatedWorktrees = false,` ~line 112):

```js
  enableEnrichedPersonas = false,
```

- [ ] **Step 4: Add the injection step**

In `src/logic/assemble.js`, immediately AFTER the module heartbeat-section injection loop (the loop ending ~line 595, right before the `$AGENT_HOME` rewrite step), insert:

```js
  // 4b. Inject opt-in persona enrichments. Domain lenses → SOUL.md, done-criteria →
  // HEARTBEAT.md. Fragments live at roles/<role>/LENSES.md and roles/<role>/DONE.md
  // and apply only when enableEnrichedPersonas is on. Same gracefully-optimistic
  // pattern as skills: a missing fragment simply means no enrichment for that role.
  if (enableEnrichedPersonas) {
    for (const roleName of allRoles) {
      const lensesSrc = join(rolesDir, roleName, 'LENSES.md');
      const soulPath = join(companyDir, 'agents', roleName, 'SOUL.md');
      if ((await exists(lensesSrc)) && (await exists(soulPath))) {
        const lenses = await readFile(lensesSrc, 'utf-8');
        await appendFile(soulPath, '\n' + lenses.trim() + '\n');
        onProgress(`+ agents/${roleName}/SOUL.md (domain lenses)`);
      }

      const doneSrc = join(rolesDir, roleName, 'DONE.md');
      const heartbeatPath = join(companyDir, 'agents', roleName, 'HEARTBEAT.md');
      if ((await exists(doneSrc)) && (await exists(heartbeatPath))) {
        const done = await readFile(doneSrc, 'utf-8');
        await appendFile(heartbeatPath, '\n' + done.trim() + '\n');
        onProgress(`+ agents/${roleName}/HEARTBEAT.md (done criteria)`);
      }
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:logic 2>&1 | grep -A3 "injects lenses into SOUL"`
Expected: PASS.

- [ ] **Step 6: Run the full logic suite to confirm no regressions**

Run: `pnpm test:logic 2>&1 | grep -E "# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.test.js
git commit -m "feat(assemble): inject lenses+done-criteria when enableEnrichedPersonas"
```

---

## Task 3: Assembly engine — append output bars to primary skills

**Files:**
- Modify: `src/logic/assemble.js` (`installSkill` ~line 490-503; non-capability skill loop ~line 531)
- Test: `src/logic/assemble.test.js`

- [ ] **Step 1: Write the failing test**

```js
it('appends a primary skill output bar when enabled, and never emits .bar.md standalone', async () => {
  // Module with one capability skill owned by engineer + a shared bar fragment.
  const modDir = join(templatesDir, 'modules', 'demo');
  await mkdir(join(modDir, 'skills'), { recursive: true });
  await writeJson(join(modDir, 'module.meta.json'), {
    name: 'demo',
    capabilities: [{ skill: 'demo-skill', owners: ['engineer', 'ceo'] }],
  });
  await writeFile(join(modDir, 'skills', 'demo-skill.md'), '# Demo skill\n\nDo the thing.\n');
  await writeFile(
    join(modDir, 'skills', 'demo-skill.bar.md'),
    '## Output bar\n\nA result without tests is not done.\n',
  );

  const { companyDir } = await assembleCompany({
    companyName: 'BarCo',
    moduleNames: ['demo'],
    extraRoleNames: [],
    enableEnrichedPersonas: true,
    outputDir,
    templatesDir,
  });

  const skillPath = join(companyDir, 'agents', 'engineer', 'skills', 'demo-skill.md');
  const skill = await readFile(skillPath, 'utf-8');
  assert.ok(skill.includes('Do the thing.'), 'primary skill body present');
  assert.ok(skill.includes('## Output bar'), 'output bar appended to primary skill');
  const skillFiles = await readdir(join(companyDir, 'agents', 'engineer', 'skills'));
  assert.ok(!skillFiles.includes('demo-skill.bar.md'), '.bar.md must not be a standalone file');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:logic 2>&1 | grep -A3 "appends a primary skill output bar"`
Expected: FAIL — bar not appended (and possibly `.bar.md` copied as standalone by the non-capability loop).

- [ ] **Step 3: Append the bar inside `installSkill`**

Replace the body of `installSkill` (~line 490-503) with:

```js
    async function installSkill(roleName, fileName, label) {
      const resolved = await resolveSkillFile(roleName, fileName);
      if (!resolved) return false;
      const destSkillsDir = join(companyDir, 'agents', roleName, 'skills');
      await mkdir(destSkillsDir, { recursive: true });
      const destFile = join(destSkillsDir, fileName);
      await copyFile(resolved.path, destFile);
      // Opt-in: append a primary skill's output/review bar when present.
      if (enableEnrichedPersonas && label === 'primary') {
        const barFileName = fileName.replace(/\.md$/, '.bar.md');
        const bar = await resolveSkillFile(roleName, barFileName);
        if (bar) {
          const barContent = await readFile(bar.path, 'utf-8');
          await appendFile(destFile, '\n' + barContent.trim() + '\n');
          onProgress(`+ agents/${roleName}/skills/${fileName} (${moduleName}, output bar)`);
        }
      }
      await appendToFile(
        join(companyDir, 'agents', roleName, 'AGENTS.md'),
        `\nRead and follow: \`$AGENT_HOME/skills/${fileName}\`\n`,
      );
      const sourceTag = resolved.source === 'shared' ? ', shared' : '';
      onProgress(`+ agents/${roleName}/skills/${fileName} (${moduleName}, ${label}${sourceTag})`);
      return true;
    }
```

- [ ] **Step 4: Exclude `.bar.md` from the non-capability skill loop**

In the non-capability skill loop (~line 531), add a guard as the first statement inside `for (const skillFile of skills) {`:

```js
        for (const skillFile of skills) {
          if (skillFile.endsWith('.bar.md')) continue;
          const skillName = skillFile.replace(/\.md$/, '');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:logic 2>&1 | grep -A3 "appends a primary skill output bar"`
Expected: PASS.

- [ ] **Step 6: Add the "flag off" negative test**

```js
it('does not append output bars or lenses when flag is off (baseline unchanged)', async () => {
  const modDir = join(templatesDir, 'modules', 'demo2');
  await mkdir(join(modDir, 'skills'), { recursive: true });
  await writeJson(join(modDir, 'module.meta.json'), {
    name: 'demo2',
    capabilities: [{ skill: 'demo2-skill', owners: ['engineer', 'ceo'] }],
  });
  await writeFile(join(modDir, 'skills', 'demo2-skill.md'), '# Demo2\n\nWork.\n');
  await writeFile(join(modDir, 'skills', 'demo2-skill.bar.md'), '## Output bar\n\nbar text\n');

  const { companyDir } = await assembleCompany({
    companyName: 'BaselineCo',
    moduleNames: ['demo2'],
    extraRoleNames: [],
    outputDir,
    templatesDir,
  });

  const skill = await readFile(
    join(companyDir, 'agents', 'engineer', 'skills', 'demo2-skill.md'),
    'utf-8',
  );
  assert.ok(!skill.includes('Output bar'), 'no bar appended when flag off');
});
```

- [ ] **Step 7: Run the full logic suite**

Run: `pnpm test:logic 2>&1 | grep -E "# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add src/logic/assemble.js src/logic/assemble.test.js
git commit -m "feat(assemble): append primary-skill output bars when enriched"
```

---

## Task 4: Manifest setting + worker threading

**Files:**
- Modify: `src/manifest.ts` (after `enableIsolatedWorktrees` block ~line 70-75)
- Modify: `src/worker.ts` (preview-files call ~line 491; start-provision const ~line 649 and call ~line 712)
- Test: `tests/plugin.spec.ts`

- [ ] **Step 1: Declare the setting in the manifest**

In `src/manifest.ts`, after the `enableIsolatedWorktrees` property (closing `},` ~line 75), add:

```ts
      enableEnrichedPersonas: {
        type: 'boolean',
        default: false,
        description:
          'Optional. If true, expert roles are enriched with domain lenses (named mental models), module skills gain concrete output/review bars with negative examples, and HEARTBEAT.md gains explicit done-criteria. Leave false (default) for the lean baseline personas.',
      },
```

- [ ] **Step 2: Write the failing manifest test**

In `tests/plugin.spec.ts`, add inside the existing `describe`:

```ts
it("declares the enableEnrichedPersonas setting (default false)", async () => {
  const mod = await import("../src/manifest.ts");
  const props = (mod.default.instanceConfigSchema as any).properties;
  expect(props.enableEnrichedPersonas).toBeDefined();
  expect(props.enableEnrichedPersonas.type).toBe("boolean");
  expect(props.enableEnrichedPersonas.default).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm test 2>&1 | tail -5`
Expected: PASS (the manifest property was added in Step 1).

- [ ] **Step 4: Thread into the preview-files call**

In `src/worker.ts`, in the `preview-files` `assembleCompany({ ... })` call, after the `enableIsolatedWorktrees:` line (~491) add:

```ts
          enableEnrichedPersonas: cfgBool(cfg, 'enableEnrichedPersonas'),
```

- [ ] **Step 5: Thread into the start-provision call**

In `src/worker.ts`, near the existing `const enableIsolatedWorktrees = ...` in start-provision (~line 649), add:

```ts
        const enableEnrichedPersonas = cfgBool(cfg, 'enableEnrichedPersonas');
```

Then in the start-provision `assembleCompany({ ... })` call, after `enableIsolatedWorktrees,` (~line 712) add:

```ts
          enableEnrichedPersonas,
```

- [ ] **Step 6: Typecheck + full test run**

Run: `pnpm typecheck && pnpm test 2>&1 | tail -5`
Expected: typecheck clean; vitest all pass.

- [ ] **Step 7: Commit**

```bash
git add src/manifest.ts src/worker.ts tests/plugin.spec.ts
git commit -m "feat: add enableEnrichedPersonas setting and thread through worker"
```

---

## Task 5: Author DONE.md (shared closing block, 8 roles)

The done-criteria block is generic and identical for all 8 roles this iteration touches. Author once, copy to each role dir.

**Files:**
- Create: `templates/roles/{engineer,qa,security-engineer,ux-researcher,ui-designer,product-owner,code-reviewer,devops}/DONE.md`

- [ ] **Step 1: Write the canonical content to the engineer role**

Create `templates/roles/engineer/DONE.md`:

```md
## Done criteria

Before you mark an issue done, verify the work — do not hand off on faith:

- Run the smallest check that proves it: the relevant tests, a screenshot, a query, or a re-read of the spec against the result. State which check you ran.
- Put the evidence in your final comment: what changed, how you verified it, and any residual risk or follow-up that needs its own ticket.
- Reassign deliberately on completion — to a reviewer, to your manager, or to `done`. Never leave a finished task silently assigned to yourself.
- If the success condition was not described, pick a sensible one, state it, and check against it before finishing.

You must always update your task with a comment before exiting a heartbeat — even when blocked. If you are blocked, name the blocker, the owner who can unblock it, and your best guess at the fix.
```

- [ ] **Step 2: Copy it to the other 7 roles**

Run:

```bash
cd "$(git rev-parse --show-toplevel)"
for r in qa security-engineer ux-researcher ui-designer product-owner code-reviewer devops; do
  cp templates/roles/engineer/DONE.md "templates/roles/$r/DONE.md"
done
```

- [ ] **Step 3: Verify all 8 exist**

Run: `ls templates/roles/*/DONE.md | wc -l`
Expected: `8`.

- [ ] **Step 4: Commit**

```bash
git add templates/roles/*/DONE.md
git commit -m "feat(templates): add done-criteria DONE.md fragments (8 roles)"
```

---

## Task 6: Author LENSES.md for the three lens-heavy roles

**Files:**
- Create: `templates/roles/security-engineer/LENSES.md`
- Create: `templates/roles/ux-researcher/LENSES.md`
- Create: `templates/roles/ui-designer/LENSES.md`

- [ ] **Step 1: Create `templates/roles/security-engineer/LENSES.md`**

```md
## Domain Lenses

Apply these when reviewing or designing. Cite them by name in comments so your reasoning is auditable.

- **STRIDE** — walk Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege against each trust boundary.
- **OWASP Top 10 (Web)** — broken access control, injection, crypto failures, misconfiguration, vulnerable components, auth failures, SSRF.
- **OWASP API Top 10** — BOLA/IDOR, broken function-level authz, unrestricted resource consumption, mass assignment.
- **OWASP LLM/agent Top 10** — prompt injection (direct + indirect), insecure output handling, excessive agency, tool/plugin design. Every tool call is a capability grant.
- **Least privilege** — grant the narrowest access that works; drop it after use. Deny by default.
- **Defense in depth** — never rely on one layer; validation + parameterized queries + scoped DB user is the baseline, not paranoia.
- **Fail closed** — when a check errors, deny. The insecure path must never be the easy path.
- **Blast radius** — for any finding, state what an attacker gets, whose data, and whether it pivots.
- **AuthN ≠ AuthZ** — authentication does not imply authorization; check both, every access, every time.
- **Secrets hygiene** — never in source, logs, URLs, or error messages; use a secrets manager and constant-time comparison.
- **Supply-chain trust** — pin and audit dependencies; be wary of typosquats and freshly published packages from unknown maintainers.
- **Disclosure discipline** — never discuss unpatched vulnerabilities or PoCs outside the ticket or a private advisory channel.
```

- [ ] **Step 2: Create `templates/roles/ux-researcher/LENSES.md`**

```md
## Domain Lenses

Apply these when evaluating flows and grounding product decisions. Cite them by name in comments.

- **Nielsen's 10 heuristics** — visibility of status, match to the real world, user control, consistency, error prevention, recognition over recall, flexibility, minimalist design, help users recover, documentation.
- **Jakob's Law** — users spend most of their time on other products; honour established conventions before inventing new ones.
- **Hick's Law** — decision time grows with the number and complexity of choices; reduce options at decision points.
- **Fitts's Law** — time to a target depends on its size and distance; primary actions are large and close.
- **Recognition over Recall** — show options rather than forcing the user to remember them.
- **Tesler's Law** — irreducible complexity must live somewhere; move it off the user and into the system where possible.
- **Kano model** — separate must-be, performance, and delight features; do not polish delighters while basics are broken.
- **Jobs-to-be-Done** — frame findings around the progress the user is trying to make, not demographics.
- **Evidence over opinion** — a finding without an observation, quote, or metric is a hypothesis; label it as one.
- **WCAG POUR** — perceivable, operable, understandable, robust; accessibility failures are usability failures.
```

- [ ] **Step 3: Create `templates/roles/ui-designer/LENSES.md`**

```md
## Domain Lenses

Apply these when producing or reviewing visual and brand work. Cite them by name in comments.

- **Gestalt principles** — proximity, similarity, closure, continuity; group related elements and separate unrelated ones.
- **Visual hierarchy** — size, weight, colour, and spacing must guide the eye to the most important element first.
- **Type scale & rhythm** — a consistent modular scale and vertical rhythm; no arbitrary one-off font sizes.
- **Contrast & WCAG** — text and interactive elements meet contrast minimums; colour is never the only signal.
- **Design tokens & consistency** — spacing, colour, and radius come from tokens, not magic numbers; reuse before inventing.
- **Affordance & signifiers** — interactive elements look interactive; the design tells the user what they can do.
- **Progressive disclosure** — reveal complexity only when needed; default to the simplest useful view.
- **Brand coherence** — voice, colour, and typography stay consistent with the brand book across every surface.
- **Render truth** — judge against the rendered surface (a screenshot or live view), not the spec; "looks right in Figma" is not done.
```

- [ ] **Step 4: Verify**

Run: `ls templates/roles/{security-engineer,ux-researcher,ui-designer}/LENSES.md`
Expected: all three listed.

- [ ] **Step 5: Commit**

```bash
git add templates/roles/security-engineer/LENSES.md templates/roles/ux-researcher/LENSES.md templates/roles/ui-designer/LENSES.md
git commit -m "feat(templates): add lens-heavy LENSES.md (security, ux, ui)"
```

---

## Task 7: Author LENSES.md for the three focused-lens roles

**Files:**
- Create: `templates/roles/product-owner/LENSES.md`
- Create: `templates/roles/code-reviewer/LENSES.md`
- Create: `templates/roles/devops/LENSES.md`

- [ ] **Step 1: Create `templates/roles/product-owner/LENSES.md`**

```md
## Domain Lenses

Apply these when prioritising and shaping the backlog. Cite them by name in comments.

- **RICE / ICE** — score by Reach, Impact, Confidence, Effort (or Impact, Confidence, Ease) before ranking; do not rank by loudness.
- **MoSCoW** — separate Must / Should / Could / Won't for the current cut; protect the Musts.
- **Kano model** — distinguish must-be, performance, and delight; do not trade a basic for a delighter.
- **Opportunity cost** — saying yes to one item is saying no to another; name what this displaces.
- **Outcome over output** — measure shipped value against the goal, not the count of issues closed.
- **INVEST** — issues are Independent, Negotiable, Valuable, Estimable, Small, Testable; split anything that is not.
- **WSJF** — when sequencing, weigh cost of delay against job size.
```

- [ ] **Step 2: Create `templates/roles/code-reviewer/LENSES.md`**

```md
## Domain Lenses

Apply these when reviewing a change. Cite them by name in comments.

- **Correctness first** — does it do what it claims, including the edge cases the author did not mention?
- **Blast radius** — what else does this change touch, and what breaks if it is wrong?
- **Readability & maintainability** — will the next agent understand this in six months without the author present?
- **Test adequacy** — do the tests actually exercise the new behaviour, or just the happy path? A green suite that tests nothing is not coverage.
- **Security smell** — untrusted input reaching shells/SQL/eval, secrets in the diff, broadened permissions; flag and route to the security owner.
- **Smallest diff** — does the change do one thing? Unrelated churn hides bugs and bloats review.
- **Approve the change, not the person** — findings cite the code and the risk, never the author.
```

- [ ] **Step 3: Create `templates/roles/devops/LENSES.md`**

```md
## Domain Lenses

Apply these when building or operating infrastructure. Cite them by name in comments.

- **Error budgets** — reliability is a budget, not a goal of zero; spend it deliberately on change velocity.
- **MTTR over MTBF** — optimise for fast, safe recovery; a fast rollback beats a rare failure.
- **Rollback path first** — never ship a change you cannot undo; the rollback is part of the change.
- **Canary vs full deploy** — expose risk to a small slice first; promote on signal, not on hope.
- **Observability before launch** — if you cannot see it, you cannot operate it; metrics, logs, and alerts ship with the feature.
- **Infrastructure as code** — every change is reviewable and versioned; no click-ops in production.
- **Least-privilege IAM** — no wildcards in production policies; scope and rotate credentials.
- **Idempotency** — pipelines and scripts must be safe to re-run; partial runs must not corrupt state.
```

- [ ] **Step 4: Verify all 6 lens files exist**

Run: `ls templates/roles/*/LENSES.md | wc -l`
Expected: `6`.

- [ ] **Step 5: Commit**

```bash
git add templates/roles/product-owner/LENSES.md templates/roles/code-reviewer/LENSES.md templates/roles/devops/LENSES.md
git commit -m "feat(templates): add focused LENSES.md (product-owner, code-reviewer, devops)"
```

---

## Task 8: Author output/review bars for module skills

Bars sit next to the primary skill they grade. For each target below, read the existing primary skill file first, then write a sibling `<skill>.bar.md` that follows the **bar structure** and matches that skill's domain. The bar is appended to the primary skill only.

**Bar structure (every `.bar.md` follows this):**

```md
## Output / review bar

A good deliverable for this skill:

- <what shape it takes — PR, doc, report, triaged backlog, screenshots>
- <what it must include — evidence, repro steps, acceptance criteria, measurements>

Not done:

- <one or two concrete negative examples specific to this skill>
```

**Target files** (resolve each skill's actual filename by listing the module's `skills/` dir first):

| Module | Primary skill file → create sibling bar |
| :--- | :--- |
| `tech-stack` | `templates/modules/tech-stack/skills/tech-stack.bar.md` |
| `architecture-plan` | `templates/modules/architecture-plan/skills/architecture-plan.bar.md`, `design-system.bar.md` |
| `build-api` | `templates/modules/build-api/skills/<api-design skill>.bar.md` |
| `codebase-onboarding` | `templates/modules/codebase-onboarding/skills/<codebase-audit skill>.bar.md` |
| `user-testing` | `templates/modules/user-testing/skills/user-testing.bar.md` |
| `accessibility` | `templates/modules/accessibility/skills/<accessibility-audit skill>.bar.md` |
| `security-audit` | `templates/modules/security-audit/skills/threat-model.bar.md`, `security-review.bar.md` |
| `market-analysis` | `templates/modules/market-analysis/skills/market-analysis.bar.md` |
| `brand-identity` | `templates/modules/brand-identity/skills/brand-identity.bar.md` |
| `backlog` | `templates/modules/backlog/skills/<backlog-health skill>.bar.md` |
| `pr-review` | `templates/modules/pr-review/skills/<pr-review skill>.bar.md` |
| `ci-cd` | `templates/modules/ci-cd/skills/ci-cd.bar.md` |
| `monitoring` | `templates/modules/monitoring/skills/monitoring.bar.md` |

- [ ] **Step 1: Confirm exact skill filenames**

Run:

```bash
cd "$(git rev-parse --show-toplevel)"
for m in tech-stack architecture-plan build-api codebase-onboarding user-testing accessibility security-audit market-analysis brand-identity backlog pr-review ci-cd monitoring; do
  echo "== $m =="; ls "templates/modules/$m/skills/" 2>/dev/null
done
```

Expected: prints each module's skill filenames. Use these exact basenames for the `.bar.md` siblings (the bar filename is `<basename>.bar.md`).

- [ ] **Step 2: Worked example — `pr-review`**

Read `templates/modules/pr-review/skills/<basename>.md`, then create `templates/modules/pr-review/skills/<basename>.bar.md`:

```md
## Output / review bar

A good review:

- Leaves a verdict (approve / request changes) with specific, cited findings — file and line, the risk, and a concrete fix, not "looks fine".
- Confirms the change is scoped to one concern and that tests actually exercise the new behaviour.

Not done:

- An approval with no comment, or "LGTM" on a diff you did not read.
- Findings that critique the author instead of the code.
```

- [ ] **Step 3: Worked example — `user-testing`**

Read `templates/modules/user-testing/skills/user-testing.md`, then create `templates/modules/user-testing/skills/user-testing.bar.md`:

```md
## Output / review bar

A good usability finding:

- Names the task, the observation (with a quote or step trace), the severity, and a concrete recommendation.
- Distinguishes evidence from interpretation, and reproducible issues from one-offs.

Not done:

- "Users were confused" with no task, no repro, and no severity.
- A pass/fail with no evidence attached.
```

- [ ] **Step 4: Author the remaining bars**

For each remaining target in the table, read the primary skill and write its `.bar.md` following the bar structure with domain-specific negative examples (e.g. tech-stack: "a stack pick with no rationale or rejected alternatives is not done"; threat-model: "a threat list with no trust boundaries or blast-radius is not done"; ci-cd: "a pipeline with no rollback path is not done"; monitoring: "alerts with no runbook are not done"; market-analysis: "competitor list with no positioning takeaway is not done"; brand-identity: "a palette with no usage rules is not done"; architecture-plan: "a diagram with no data flow or failure modes is not done"; design-system: "tokens with no usage guidance is not done"; backlog: "issues that are not INVEST-shaped are not done"; codebase-audit: "an audit with no prioritised tech-debt list is not done"; api-design: "endpoints with no auth or error contract is not done"; accessibility-audit: "a scan dump with no remediation priorities is not done").

- [ ] **Step 5: Verify bars resolve to real primary skills**

Run:

```bash
cd "$(git rev-parse --show-toplevel)"
for f in $(find templates/modules -name '*.bar.md'); do
  base="${f%.bar.md}.md"; [ -f "$base" ] && echo "OK  $f" || echo "ORPHAN $f"
done
```

Expected: every `.bar.md` prints `OK` (a sibling primary skill exists). Fix any `ORPHAN`.

- [ ] **Step 6: Commit**

```bash
git add templates/modules/*/skills/*.bar.md
git commit -m "feat(templates): add output/review bars for module skills"
```

---

## Task 9: Integration test across a real preset

**Files:**
- Test: `src/logic/assemble.integration.test.js`

- [ ] **Step 1: Write the test**

Add a test that assembles using the real `templates/` dir (the integration suite already points `templatesDir` at the repo templates — match its existing setup) with `enableEnrichedPersonas: true` and an extra role that has a `LENSES.md` (e.g. `security-engineer`) plus the `security-audit` module:

```js
it('enriches a real expert role when enableEnrichedPersonas is on', async () => {
  const { companyDir } = await assembleCompany({
    companyName: 'EnrichReal',
    userGoals: [{ title: 'Ship securely', description: '' }],
    moduleNames: ['github-repo', 'security-audit'],
    extraRoleNames: ['security-engineer'],
    enableEnrichedPersonas: true,
    outputDir,
    templatesDir, // repo templates dir, per this suite's existing setup
  });

  const soul = await readFile(
    join(companyDir, 'agents', 'security-engineer', 'SOUL.md'),
    'utf-8',
  );
  assert.ok(soul.includes('## Domain Lenses'), 'security-engineer SOUL.md gains lenses');
  assert.ok(soul.includes('STRIDE'), 'lens body present');
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:logic 2>&1 | grep -A3 "enriches a real expert role"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/logic/assemble.integration.test.js
git commit -m "test(assemble): integration coverage for enriched personas"
```

---

## Task 10: Documentation

**Files:**
- Modify: `README.md` (Configuration table + a sentence near "How Roles Work")
- Modify: `CLAUDE.md` (template-system section + assembly param)
- Modify: `AGENTS.md` (template-layout note)
- Modify: `ROADMAP.md` (move to Done; keep fast-follow backlog)

- [ ] **Step 1: README Configuration table**

Add a row after the `disableBoardApprovalOnNewCompanies` row:

```md
| `enableEnrichedPersonas` | No | If `true`, expert roles get domain lenses (in `SOUL.md`), module skills get output/review bars, and `HEARTBEAT.md` gets done-criteria. Default `false` (lean baseline). |
```

- [ ] **Step 2: CLAUDE.md**

Under the template-system / heartbeat-injection area, add a short paragraph describing the enrichment fragments (`LENSES.md`, `DONE.md`, `<skill>.bar.md`) and that they inject only when `enableEnrichedPersonas` is set; note the new `assembleCompany` param.

- [ ] **Step 3: AGENTS.md**

In the template-layout description, note the optional `LENSES.md` / `DONE.md` role fragments and `<skill>.bar.md` module fragments as opt-in enrichments.

- [ ] **Step 4: ROADMAP.md**

Move "agent persona enrichment (lenses, output bars, done-criteria)" to Done. Keep backlog items: "contributor role-authoring guide" and "roll done-criteria out to all 17 roles".

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md AGENTS.md ROADMAP.md
git commit -m "docs: document enableEnrichedPersonas and enrichment fragments"
```

---

## Task 11: Verify, sync cache, release

- [ ] **Step 1: Full verification**

Run: `pnpm typecheck && pnpm test 2>&1 | tail -5 && pnpm test:logic 2>&1 | grep -E "# (pass|fail)" && pnpm build 2>&1 | tail -2`
Expected: typecheck clean; vitest pass; `# fail 0`; build ok.

- [ ] **Step 2: Sync template cache**

Because template files changed, the worker's cached templates (`~/.paperclip/plugin-templates`) would otherwise mask them.

Run: `./sync-plugin.sh`
Expected: "Synced template cache to …".

- [ ] **Step 3: Release**

Use the `release` skill: bump patch version in `package.json` + `src/manifest.ts`, add a CHANGELOG entry, build, then open a PR (branch protection requires it), squash-merge, and move/force-push the version tag to the merged commit. Publish is the user's call.

---

## Notes for the implementer

- The flag plumbing intentionally mirrors `enableIsolatedWorktrees` — read that path in `assemble.js`/`worker.ts` if anything is unclear.
- `engineer` and `qa` intentionally have **no** `LENSES.md` — they are operational roles; do not add lens files for them.
- Output bars apply to **primary** skills only; fallback variants stay lean.
- All lens prose is written in our own words — do not copy text from the upstream `paperclip-create-agent` references.
