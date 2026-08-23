import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { assembleCompany } from './assemble.js';

const REAL_TEMPLATES_DIR = resolve(import.meta.dirname, '..', '..', 'templates');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('assembleCompany integration (real templates)', () => {
  let outputDir;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'assemble-integration-'));
    outputDir = join(tmpDir, 'output');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('keeps execution workspaces reusable when issues complete', async () => {
    const roleEntries = await readdir(join(REAL_TEMPLATES_DIR, 'roles'), { withFileTypes: true });
    for (const roleEntry of roleEntries.filter((entry) => entry.isDirectory())) {
      const heartbeat = await readFile(
        join(REAL_TEMPLATES_DIR, 'roles', roleEntry.name, 'HEARTBEAT.md'),
        'utf-8',
      );
      assert.ok(
        heartbeat.includes('Preserve execution workspaces across issue completion'),
        `${roleEntry.name}/HEARTBEAT.md should preserve reusable workspaces`,
      );
      assert.ok(
        heartbeat.includes('/interactions') &&
          heartbeat.includes('/approvals') &&
          heartbeat.includes('pending') &&
          heartbeat.includes('interaction'),
        `${roleEntry.name}/HEARTBEAT.md should recognize interaction-owned review waits`,
      );
    }

    const markdownFiles = (await readdir(REAL_TEMPLATES_DIR, { recursive: true })).filter((file) =>
      file.endsWith('.md'),
    );
    const destructiveInstructions = [];
    for (const relativePath of markdownFiles) {
      const content = await readFile(join(REAL_TEMPLATES_DIR, relativePath), 'utf-8');
      for (const [index, line] of content.split('\n').entries()) {
        const mentionsWorkspace = /\b(?:workspace|worktree)s?\b/i.test(line);
        const requestsDestruction =
          /\b(?:archive|delete)(?:s|d)?\b/i.test(line) ||
          /\bclose(?:s|d)?\s+(?:an? |the |any )?(?:isolated |execution )?(?:workspace|worktree)s?\b/i.test(
            line,
          );
        const explicitlyForbidsDestruction = /\bdo not\b|\bneither\b/i.test(line);
        if (mentionsWorkspace && requestsDestruction && !explicitlyForbidsDestruction) {
          destructiveInstructions.push(`${relativePath}:${index + 1}: ${line}`);
        }
      }
    }

    assert.deepEqual(
      destructiveInstructions,
      [],
      `templates must not retire workspaces during normal issue completion:\n${destructiveInstructions.join('\n')}`,
    );
  });

  it('assembles quality preset with all expected role directories and files', async () => {
    // Quality preset: roles = product-owner, code-reviewer; modules = github-repo, pr-review, backlog, auto-assign, stall-detection
    const { companyDir, allRoles, initialIssues } = await assembleCompany({
      companyName: 'Integration Test Co',
      userGoals: [{ title: 'Ship the MVP', description: 'Build and launch a working product' }],
      userProjects: [{ name: 'test-app', description: '', goals: ['Ship the MVP'] }],
      moduleNames: ['github-repo', 'pr-review', 'backlog', 'auto-assign', 'stall-detection'],
      extraRoleNames: ['engineer', 'product-owner', 'code-reviewer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // --- Verify company directory ---
    assert.ok(
      companyDir.endsWith('IntegrationTestCo'),
      `expected PascalCase dir, got ${companyDir}`,
    );
    assert.ok(await exists(companyDir), 'company directory should exist');

    // --- Verify all expected roles ---
    const expectedRoles = ['ceo', 'engineer', 'product-owner', 'code-reviewer'];
    assert.deepEqual(allRoles, new Set(expectedRoles));

    for (const role of expectedRoles) {
      const roleDir = join(companyDir, 'agents', role);
      assert.ok(await exists(roleDir), `agents/${role}/ should exist`);

      // Every role must have these core files
      for (const file of ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md']) {
        assert.ok(await exists(join(roleDir, file)), `agents/${role}/${file} should exist`);
      }

      // AGENTS.md should not be empty
      const agentsMd = await readFile(join(roleDir, 'AGENTS.md'), 'utf-8');
      assert.ok(agentsMd.length > 10, `agents/${role}/AGENTS.md should have content`);
    }

    // --- Verify shared docs ---
    const docsDir = join(companyDir, 'docs');
    assert.ok(await exists(docsDir), 'docs/ should exist');
    assert.ok(
      await exists(join(docsDir, 'git-workflow.md')),
      'docs/git-workflow.md should exist (from github-repo module)',
    );

    // --- Verify role-scoped shared doc references in AGENTS.md ---
    // git-workflow.md ships with the github-repo module, so it is referenced by the
    // roles that module touches (engineer) and by the CEO coordinator — but NOT by a
    // role it does not concern (product-owner). Paths are relative to the agent home.
    for (const role of ['ceo', 'engineer']) {
      const agentsMd = await readFile(join(companyDir, 'agents', role, 'AGENTS.md'), 'utf-8');
      assert.ok(
        agentsMd.includes('docs/git-workflow.md'),
        `${role} AGENTS.md should reference shared doc git-workflow.md`,
      );
    }
    const poAgentsMd = await readFile(
      join(companyDir, 'agents', 'product-owner', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      !poAgentsMd.includes('docs/git-workflow.md'),
      'product-owner AGENTS.md should NOT reference an unrelated github-repo doc',
    );

    // --- Verify BOOTSTRAP.md ---
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('# Bootstrap: Integration Test Co'));
    assert.ok(bootstrap.includes('### Ship the MVP'), 'BOOTSTRAP.md should include goal title');
    assert.ok(
      bootstrap.includes('Build and launch a working product'),
      'should include goal description',
    );
    assert.ok(bootstrap.includes('test-app'), 'should include project name');
    assert.ok(bootstrap.includes('instructionsFilePath'), 'should have agent setup instructions');
    assert.ok(bootstrap.includes('## Labels'), 'should include explicit Labels section');
    assert.ok(bootstrap.includes('**labelIds**:'), 'issues should include labelIds guidance');
    assert.ok(
      bootstrap.includes('**projectId**: → "test-app"'),
      'top-level issues should include explicit projectId reference',
    );
    assert.ok(
      bootstrap.includes('Parent/subissue status is not implicitly coupled'),
      'bootstrap should include status bounce guardrails',
    );

    const labelsStep = bootstrap.indexOf('**Create labels**');
    const agentsStep = bootstrap.indexOf('**Agents already created**');
    const issuesStep = bootstrap.indexOf('**Create issues**');
    assert.ok(labelsStep > -1, 'manual setup order should include labels step');
    assert.ok(agentsStep > labelsStep, 'agents step should come after labels step');
    assert.ok(issuesStep > agentsStep, 'issues step should come after agents step');

    for (const role of expectedRoles) {
      assert.ok(
        bootstrap.includes(`agents/${role}/AGENTS.md`),
        `BOOTSTRAP.md should reference ${role}`,
      );
    }

    // --- Verify initial tasks ---
    assert.ok(initialIssues.length > 0, 'should have initial tasks from modules');
    const taskTitles = initialIssues.map((t) => t.title);
    assert.equal(
      initialIssues[0].title,
      'Prepare GitHub repository',
      'github repository foundation task should lead the initial backlog',
    );
    assert.equal(initialIssues[0].priority, 'critical');
    assert.equal(initialIssues[0].bootstrapPhase, 'foundation');
    assert.ok(taskTitles.includes('Prepare GitHub repository'), 'should have github-repo task');
    const prReviewIndex = taskTitles.indexOf('Set up Paperclip PR review workflow');
    const githubIndex = taskTitles.indexOf('Prepare GitHub repository');
    const roadmapIndex = taskTitles.indexOf('Create roadmap and generate initial backlog');
    assert.ok(prReviewIndex > -1, 'should have PR review setup task');
    assert.equal(
      prReviewIndex > githubIndex,
      true,
      'PR review setup should come after repository foundation setup when both exist',
    );
    assert.equal(
      prReviewIndex < roadmapIndex,
      true,
      'PR review setup should be prioritized before generic module tasks',
    );
    assert.ok(
      taskTitles.includes('Create roadmap and generate initial backlog'),
      'should have backlog task',
    );

    // --- Verify initial tasks have resolved assignees (no unresolved capability:* references) ---
    for (const task of initialIssues) {
      assert.ok(
        !task.assignTo.startsWith('capability:'),
        `task "${task.title}" should have resolved assignee, got ${task.assignTo}`,
      );
    }
  });

  it('resolves capability ownership correctly across modules', async () => {
    const result = await assembleCompany({
      companyName: 'CapResolution',
      moduleNames: ['backlog', 'auto-assign'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // product-owner is first in owners[] for both backlog-health and auto-assign
    // → product-owner should be primary, ceo should be fallback

    const poSlugs = result.roleSkillSlugs.get('product-owner') ?? [];
    const ceoSlugs = result.roleSkillSlugs.get('ceo') ?? [];

    // product-owner gets primary skill slugs
    assert.ok(poSlugs.includes('auto-assign'), 'PO should have primary auto-assign slug');
    assert.ok(poSlugs.includes('backlog-health'), 'PO should have primary backlog-health slug');

    // ceo gets fallback skill slugs
    assert.ok(
      ceoSlugs.includes('auto-assign-fallback'),
      'CEO should have fallback auto-assign slug',
    );
    assert.ok(
      ceoSlugs.includes('backlog-health-fallback'),
      'CEO should have fallback backlog-health slug',
    );

    // ceo should NOT have the primary versions of capability skills
    assert.ok(!ceoSlugs.includes('auto-assign'), 'CEO should not have primary auto-assign slug');
    assert.ok(
      !ceoSlugs.includes('backlog-health'),
      'CEO should not have primary backlog-health slug',
    );

    // AGENTS.md should list the installed skills under ## Installed skills
    const poAgentsMd = await readFile(
      join(result.companyDir, 'agents', 'product-owner', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      poAgentsMd.includes('## Installed skills'),
      'PO AGENTS.md should have ## Installed skills section',
    );
    assert.ok(
      poAgentsMd.includes('Auto Assign') || poAgentsMd.includes('auto-assign'),
      'PO AGENTS.md should list auto-assign skill',
    );
    assert.ok(
      poAgentsMd.includes('Backlog Health') || poAgentsMd.includes('backlog-health'),
      'PO AGENTS.md should list backlog-health skill',
    );

    const ceoAgentsMd = await readFile(
      join(result.companyDir, 'agents', 'ceo', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      ceoAgentsMd.includes('## Installed skills'),
      'CEO AGENTS.md should have ## Installed skills section',
    );
    assert.ok(
      ceoAgentsMd.includes('Auto Assign (fallback)') || ceoAgentsMd.includes('auto-assign'),
      'CEO AGENTS.md should list the fallback auto-assign skill',
    );
  });

  it('ships current Paperclip heartbeat and hiring-governance instructions in real templates', async () => {
    const result = await assembleCompany({
      companyName: 'GovernanceTemplateCo',
      moduleNames: [
        'github-repo',
        'backlog',
        'auto-assign',
        'stall-detection',
        'hiring-review',
        'pr-review',
      ],
      extraRoleNames: ['engineer', 'product-owner', 'qa', 'security-engineer', 'ui-designer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { companyDir, companySkills } = result;

    const executionContract =
      'Start actionable work in the same heartbeat; do not stop at a plan unless planning was requested.';
    for (const role of ['engineer', 'qa', 'security-engineer', 'ui-designer', 'product-owner']) {
      const agentsMd = await readFile(join(companyDir, 'agents', role, 'AGENTS.md'), 'utf-8');
      assert.ok(
        agentsMd.includes('follow the Paperclip skill'),
        `${role} should point at the Paperclip skill as heartbeat source of truth`,
      );
      assert.ok(agentsMd.includes(executionContract), `${role} should include execution contract`);
      assert.ok(agentsMd.includes('clear next action'), `${role} should require clear next action`);
    }

    const engineerAgents = await readFile(
      join(companyDir, 'agents', 'engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      engineerAgents.includes(
        "Keep unrelated follow-up work out of the current issue's isolated workspace. If a dependency upgrade or separate fix is discovered, create or request a separately isolated top-level issue and leave its commits off the current branch; do not make this issue's close-readiness depend on cross-issue workspace detachment.",
      ),
      'engineer should isolate unrelated follow-up work in a separate top-level issue',
    );

    const productOwnerAgents = await readFile(
      join(companyDir, 'agents', 'product-owner', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      productOwnerAgents.includes(
        'Codebase audits, dependency upgrades, and implementation work -> assign the Software Engineer; keep the Code Reviewer for explicit non-author review and merge-gate work.',
      ),
      'product owner should route implementation work to the engineer and reserve review gates for reviewers',
    );

    const securityEngineerAgents = await readFile(
      join(companyDir, 'agents', 'security-engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      securityEngineerAgents.includes(
        'After a CI-only review rejection, first re-check every job that the execution policy or reviewer explicitly made mandatory on the exact reviewed head. If any such job has not executed green, do not resubmit: preserve a first-class blocker or bounded monitor with the named owner/action. Resubmit only on new green evidence or an explicit reviewer waiver.',
      ),
      'security engineer should require exact-head green evidence before CI-only resubmission',
    );

    // hiring-review is a capability skill; check emitted markdown content
    const hiringSkill = companySkills.find((s) => s.slug === 'hiring-review');
    assert.ok(hiringSkill, 'hiring-review skill should be in companySkills');
    assert.ok(hiringSkill.markdown.includes('/agent-hires'), 'hiring skill should use agent-hires');
    assert.ok(hiringSkill.markdown.includes('draft-review checklist'));
    assert.ok(hiringSkill.markdown.includes('sourceIssueId'));
    assert.ok(
      !hiringSkill.markdown.includes('type: "hire"'),
      'legacy approval type should be gone',
    );

    // Verify routine-run-scoped skills via companySkills markdown
    for (const [slug, label] of [
      ['auto-assign', 'auto-assign (product-owner primary)'],
      ['backlog-health', 'backlog-health (product-owner primary)'],
      ['stall-detection', 'stall-detection'],
    ]) {
      const skill = companySkills.find((s) => s.slug === slug);
      assert.ok(skill, `${slug} should be in companySkills`);
      assert.ok(
        !skill.markdown.includes('Run this on every heartbeat'),
        `${label} should be routine-run scoped, not every-heartbeat scoped`,
      );
    }

    const stallSkill = companySkills.find((skill) => skill.slug === 'stall-detection');
    assert.ok(stallSkill.markdown.includes('/diagnostics/blockers'));
    assert.ok(stallSkill.markdown.includes('/diagnostics/wakes'));
    assert.ok(stallSkill.markdown.includes('/diagnostics/subtree'));
    assert.ok(stallSkill.markdown.includes('/interactions'));
    assert.ok(stallSkill.markdown.includes('/recovery-actions'));
    assert.ok(stallSkill.markdown.includes('in_review_without_action_path'));
    assert.ok(stallSkill.markdown.includes('pendingFinalizeBlockerCount'));
    assert.ok(stallSkill.markdown.includes('WORKSPACE-FINALIZE-PENDING'));
  });

  it('real bootstrap instructions use executionPolicy review gates without child-review conflict', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'BootstrapGovernanceCo',
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes("Required PR reviews use the issue's `executionPolicy`"));
    assert.ok(!bootstrap.includes('explicit assigned child issues'));
    assert.ok(!bootstrap.includes('create separate child review issues'));
  });

  it('falls back capability ownership to ceo when product-owner is absent', async () => {
    const result = await assembleCompany({
      companyName: 'FallbackCo',
      moduleNames: ['backlog', 'auto-assign'],
      extraRoleNames: [],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { initialIssues, roleSkillSlugs } = result;

    // Without product-owner, ceo is next in owners[] → ceo becomes primary
    const ceoSlugs = roleSkillSlugs.get('ceo') ?? [];
    assert.ok(
      ceoSlugs.includes('auto-assign'),
      'CEO should have primary auto-assign slug when PO absent',
    );
    assert.ok(
      ceoSlugs.includes('backlog-health'),
      'CEO should have primary backlog-health slug when PO absent',
    );

    // Backlog task should resolve to ceo
    const backlogTask = initialIssues.find(
      (t) => t.title === 'Create roadmap and generate initial backlog',
    );
    assert.ok(backlogTask, 'should have backlog task');
    assert.equal(backlogTask.assignTo, 'ceo', 'backlog task should fall back to ceo');
  });

  it('skips gated modules when required roles are absent', async () => {
    const progress = [];
    await assembleCompany({
      companyName: 'GatedInteg',
      moduleNames: ['pr-review'],
      extraRoleNames: [],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
      onProgress: (line) => progress.push(line),
    });

    // pr-review requires code-reviewer|product-owner|ui-designer|ux-researcher|qa|devops
    // None present → should be skipped
    assert.ok(
      progress.some((p) => p.includes('pr-review') && p.includes('○')),
      'pr-review should be skipped when no activating roles present',
    );
  });

  it('review templates use Paperclip-governed verdicts instead of GitHub self-approval', async () => {
    const prReviewDir = join(REAL_TEMPLATES_DIR, 'modules', 'pr-review');
    const codeReviewerRoleDir = join(REAL_TEMPLATES_DIR, 'roles', 'code-reviewer');
    const moduleMeta = JSON.parse(await readFile(join(prReviewDir, 'module.meta.json'), 'utf-8'));
    assert.ok(
      !moduleMeta.description.toLowerCase().includes('branch protection'),
      'module description should not promise GitHub branch-protection enforcement',
    );
    assert.ok(
      !moduleMeta.issues[0].description.toLowerCase().includes('require pr reviews'),
      'setup issue should not require GitHub-native PR approvals when agents share one GitHub user',
    );

    async function readMarkdownFiles(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await readMarkdownFiles(full)));
        if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
      }
      return files;
    }

    const markdownFiles = [
      ...(await readMarkdownFiles(prReviewDir)),
      ...(await readMarkdownFiles(codeReviewerRoleDir)),
    ];
    assert.ok(markdownFiles.length > 0, 'expected pr-review markdown templates');
    for (const file of markdownFiles) {
      const content = await readFile(file, 'utf-8');
      const lowered = content.toLowerCase();
      assert.ok(
        !lowered.includes('gh pr review'),
        `${file} should not instruct agents to submit formal GitHub reviews`,
      );
      assert.ok(
        !lowered.includes('--approve'),
        `${file} should not instruct agents to approve with the shared GitHub credential`,
      );
      assert.ok(
        !lowered.includes('--request-changes'),
        `${file} should not instruct agents to request changes with the shared GitHub credential`,
      );
    }
  });

  it('pr-review defaults to one non-author Code Reviewer stage', async () => {
    const meta = JSON.parse(
      await readFile(join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'module.meta.json'), 'utf-8'),
    );
    const gate = meta.issues[0].reviewGate;
    assert.equal(gate.reviewers, undefined, 'QA is bounded evidence, not a default stage');
    assert.equal(gate.approver, undefined, 'Product acceptance happens before implementation');
    assert.equal(gate.mergeGate, 'code-reviewer', 'the non-author Code Reviewer is the merge gate');
    assert.ok(
      meta.issues[0].description.includes('not serial stages'),
      'specialists are explicitly non-serial',
    );
    assert.notEqual(
      gate.mergeGate,
      'engineer',
      'the engineer authors the work and is excluded from stages, so cannot be the merge gate',
    );
    assert.ok(
      meta.activatesWithRoles.includes('security-engineer'),
      'security-engineer can activate pr-review for bounded security evidence',
    );
  });

  it('backlog templates enforce bounded WIP and explicit subissue isolation', async () => {
    const backlogMeta = JSON.parse(
      await readFile(join(REAL_TEMPLATES_DIR, 'modules', 'backlog', 'module.meta.json'), 'utf-8'),
    );
    const backlogSkill = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'backlog', 'skills', 'backlog-health.md'),
      'utf-8',
    );
    const bootstrapInstructions = await readFile(
      join(REAL_TEMPLATES_DIR, 'bootstrap-instructions.md'),
      'utf-8',
    );
    const leanDelivery = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'docs', 'lean-delivery.md'),
      'utf-8',
    );
    const stallDetection = await readFile(
      join(
        REAL_TEMPLATES_DIR,
        'modules',
        'stall-detection',
        'agents',
        'ceo',
        'skills',
        'stall-detection.md',
      ),
      'utf-8',
    );
    const repoMaintenance = JSON.parse(
      await readFile(
        join(REAL_TEMPLATES_DIR, 'presets', 'repo-maintenance', 'preset.meta.json'),
        'utf-8',
      ),
    );

    assert.ok(
      backlogMeta.issues[0].description.includes('at most two open implementation PRs'),
      'seed backlog must respect the default repository PR cap',
    );
    assert.ok(
      backlogMeta.routines[0].description.includes('create at most the next 1-3'),
      'grooming creates a bounded next batch rather than an eight-item assigned queue',
    );
    assert.ok(
      backlogSkill.includes('including subissues') &&
        backlogSkill.includes('inheritExecutionWorkspaceFromIssueId'),
      'subissues default to isolated workspaces and reuse is explicit',
    );
    assert.ok(
      !backlogSkill.includes('Attach a task watchdog to every'),
      'backlog creation must not attach a universal task watchdog',
    );
    const autoAssignSkill = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'auto-assign', 'skills', 'auto-assign.md'),
      'utf-8',
    );
    const autoAssignFallback = await readFile(
      join(
        REAL_TEMPLATES_DIR,
        'modules',
        'auto-assign',
        'agents',
        'ceo',
        'skills',
        'auto-assign.fallback.md',
      ),
      'utf-8',
    );
    assert.ok(
      autoAssignSkill.includes('leave the waiting issue unassigned') &&
        autoAssignSkill.includes('blockers are conjunctive') &&
        !autoAssignSkill.includes('link the waiting issue to the issues owning those PRs'),
      'dynamic PR capacity must not become an all-open-PR conjunctive dependency',
    );
    assert.ok(
      autoAssignFallback.includes('leave later work unassigned') &&
        autoAssignFallback.includes('relations are conjunctive') &&
        !autoAssignFallback.includes('blocker relations to the issues owning in-flight PRs'),
      'CEO fallback follows the same non-conjunctive capacity wait',
    );
    assert.ok(
      backlogSkill.includes('`#0075ca`') && !backlogSkill.includes('`0075ca`'),
      'documented label colors must satisfy the current #RRGGBB validator',
    );
    assert.ok(
      bootstrapInstructions.includes('including subtasks') &&
        bootstrapInstructions.includes('inheritExecutionWorkspaceFromIssueId'),
      'bootstrap applies the same explicit-isolation contract',
    );
    assert.ok(
      leanDelivery.includes('Exactly one default executionPolicy stage') &&
        leanDelivery.includes('Agent reassignment alone is not a no-policy review path'),
      'shared lean-delivery contract overrides stale serial/no-policy handoff habits',
    );
    assert.ok(
      leanDelivery.includes('do not self-claim unassigned work') &&
        leanDelivery.includes('probe from the intended consumer runtime'),
      'shared contract requires explicit assignment and effective-state verification',
    );
    assert.ok(
      leanDelivery.includes('Inherited BASE-BRANCH-RED is the narrow exception') &&
        leanDelivery.includes('separately owned baseline-restore issue, branch, and PR') &&
        leanDelivery.includes('leave later work unassigned') &&
        !leanDelivery.includes('blocker relations to the issues owning the in-flight PRs'),
      'shared contract isolates inherited baseline repair and avoids conjunctive capacity blockers',
    );
    assert.ok(
      stallDetection.includes('A `cancelled` blocker does **not** resolve a dependency'),
      'stall recovery must remove or replace cancelled blocker relations',
    );
    assert.ok(
      repoMaintenance.issues.every((issue) => issue.assignTo !== 'user'),
      'automatable repository setup is not assigned to the board user',
    );
    assert.ok(
      repoMaintenance.issues.some(
        (issue) =>
          issue.title === 'Reconcile open pull request ownership' &&
          issue.description.includes('Do not review or merge multiple PRs from this setup issue'),
      ),
      'repository maintenance reconciles PR ownership without a multi-PR wrapper',
    );
    assert.ok(
      repoMaintenance.issues.some(
        (issue) =>
          issue.title === 'Implement the highest-priority codebase health fix' &&
          issue.description.includes('one branch/PR'),
      ),
      'health cleanup remains one originating issue and one PR',
    );
    assert.deepEqual(
      repoMaintenance.issues
        .filter((issue) => issue.assignTo === 'engineer')
        .map((issue) => issue.title),
      ['Audit codebase and document architecture'],
      'repo maintenance wakes the Engineer for only the first implementation slot',
    );
    assert.ok(
      repoMaintenance.issues
        .filter((issue) =>
          [
            'Run initial dependency audit',
            'Configure PR workflow and branch protection',
            'Document or establish release process',
            'Implement the highest-priority codebase health fix',
          ].includes(issue.title),
        )
        .every(
          (issue) =>
            issue.assignTo == null &&
            issue.description.toLowerCase().includes('unassigned') &&
            issue.description.toLowerCase().includes('capacity'),
        ),
      'later PR-producing maintenance issues remain unassigned until review capacity is free',
    );
  });

  it('pr-review setup issue documents self-merge fallback when no code-reviewer present', async () => {
    const meta = JSON.parse(
      await readFile(join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'module.meta.json'), 'utf-8'),
    );
    const setupIssueDesc = meta.issues[0].description;
    assert.ok(
      setupIssueDesc.includes('no code-reviewer') || setupIssueDesc.includes('PR-Self-Merge'),
      'pr-review setup issue must document self-merge fallback when code-reviewer is absent',
    );
    assert.ok(
      setupIssueDesc.includes('gh pr merge'),
      'fallback must name the exact merge command (gh pr merge)',
    );
    assert.ok(
      setupIssueDesc.includes('422 No eligible approval participant') ||
        setupIssueDesc.toLowerCase().includes('stall'),
      'setup issue must warn about the 422 stall risk',
    );
  });

  it('pr-review with no code-reviewer produces no executionPolicy sketch and installs the self-merge skill', async () => {
    // C1: when pr-review is active but code-reviewer is absent, the module still
    // loads (it activates with engineer + product-owner too), but assembly must
    // render NO executionPolicy sketch — otherwise the Product Owner approval
    // would auto-close the issue with the PR still open, or a self-stage stalls
    // with 422. The engineer takes the self-merge path instead.
    const result = await assembleCompany({
      companyName: 'NoCodeReviewerCo',
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { companyDir, companySkills } = result;

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      !bootstrap.includes('**executionPolicy**'),
      'no executionPolicy sketch is rendered when the configured merge gate (code-reviewer) is absent',
    );
    assert.ok(
      !bootstrap.includes('merge gate (non-author)'),
      'no merge-gate stage is rendered without an eligible non-author merge gate',
    );

    // M10: the engineer's emitted pr-workflow skill must carry the self-merge
    // path — agents use this content at runtime via Company Skills.
    const prWorkflowSkill = companySkills.find((s) => s.slug === 'pr-workflow');
    assert.ok(prWorkflowSkill, 'pr-workflow skill should be emitted as a company skill');
    assert.ok(
      prWorkflowSkill.markdown.includes('gh pr merge'),
      'emitted engineer pr-workflow skill names the self-merge command',
    );
    assert.ok(
      prWorkflowSkill.markdown.toLowerCase().includes('self-merge') ||
        prWorkflowSkill.markdown.includes('No code-reviewer present'),
      'emitted engineer pr-workflow skill documents the self-merge path',
    );
    assert.ok(
      prWorkflowSkill.markdown.includes('not sufficient evidence') &&
        prWorkflowSkill.markdown.includes('/interactions') &&
        prWorkflowSkill.markdown.includes('/recovery-actions'),
      'emitted engineer pr-workflow diagnoses all review action paths before recovery',
    );
  });

  it('pr-review with code-reviewer present but no product-owner omits the PO approval stage', async () => {
    // M8: the PO approval stage is conditioned on presence. With code-reviewer
    // present but no product-owner, the rendered gate must not require a PO
    // approval stage (which would have no eligible participant and stall).
    const { companyDir } = await assembleCompany({
      companyName: 'NoPoCo',
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'code-reviewer', 'qa'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes('**executionPolicy**'),
      'executionPolicy sketch is rendered when a non-author merge gate (code-reviewer) is present',
    );
    assert.ok(
      bootstrap.includes('(approval) → assign "code-reviewer"'),
      'the Code Reviewer is rendered as the merge-gate stage',
    );
    assert.ok(
      !bootstrap.includes('(approval) → assign "product-owner"'),
      'no Product Owner approval stage is rendered when no product-owner is on the team',
    );
  });

  it('emits skill data and lists skills in AGENTS.md Installed skills section', async () => {
    const result = await assembleCompany({
      companyName: 'SkillRefCo',
      moduleNames: ['github-repo'],
      extraRoleNames: ['engineer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { companyDir, companySkills, roleSkillSlugs } = result;

    // github-repo has an agent-specific skill for engineer; it should be emitted
    // as a company skill rather than written to disk.
    const gitSkill = companySkills.find((s) => s.slug === 'git-workflow');
    assert.ok(gitSkill, 'git-workflow should be emitted as a company skill');
    assert.ok(
      roleSkillSlugs.get('engineer')?.includes('git-workflow'),
      'engineer should be assigned the git-workflow slug',
    );

    // AGENTS.md should list the skill under ## Installed skills (not "Read and follow:")
    const engAgentsMd = await readFile(
      join(companyDir, 'agents', 'engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      engAgentsMd.includes('## Installed skills'),
      'engineer AGENTS.md should have ## Installed skills section',
    );
    assert.ok(
      !engAgentsMd.includes(join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md')),
      'engineer AGENTS.md should not contain an absolute skill path',
    );

    // No skill file on disk — skills are emitted as data only
    assert.ok(
      !(await exists(join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md'))),
      'engineer skills/git-workflow.md should NOT exist on disk (emitted as data)',
    );
  });

  it('rewrites $AGENT_HOME file references to relative paths in agent files', async () => {
    const { companyDir, allRoles } = await assembleCompany({
      companyName: 'AgentHomeCo',
      moduleNames: ['github-repo'],
      extraRoleNames: ['engineer', 'product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    for (const role of allRoles) {
      const roleDir = join(companyDir, 'agents', role);
      for (const file of ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md']) {
        const p = join(roleDir, file);
        if (!(await exists(p))) continue;
        const content = await readFile(p, 'utf-8');
        // File references (`$AGENT_HOME/<file>`) are stripped to relative; bare
        // `$AGENT_HOME` prose (the runtime home env var) may remain.
        assert.ok(
          !content.includes('$AGENT_HOME/'),
          `${role}/${file} should not contain a $AGENT_HOME/ file prefix`,
        );
        // Instruction refs must be relative, never under the absolute home dir.
        assert.ok(
          !content.includes(`${roleDir}/skills/`) && !content.includes(`${roleDir}/HEARTBEAT.md`),
          `${role}/${file} should reference sibling files relatively, not by absolute path`,
        );
      }
    }
  });

  it('generates complete output for minimal config (base roles only, no modules)', async () => {
    const { companyDir, allRoles, initialIssues } = await assembleCompany({
      companyName: 'MinimalCo',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // Only base roles (engineer is now optional, not a base role)
    assert.deepEqual(allRoles, new Set(['ceo']));
    assert.equal(initialIssues.length, 0, 'no modules = no tasks');

    // Core files still present
    for (const role of ['ceo']) {
      for (const file of ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md']) {
        assert.ok(
          await exists(join(companyDir, 'agents', role, file)),
          `${role}/${file} should exist`,
        );
      }
    }

    // BOOTSTRAP.md still generated
    assert.ok(await exists(join(companyDir, 'BOOTSTRAP.md')));
  });

  it('heartbeat sections are injected into HEARTBEAT.md when modules provide them', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'HeartbeatInteg',
      moduleNames: ['backlog', 'auto-assign', 'stall-detection'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // Check that HEARTBEAT.md files still have the marker comment (preserved for future injections)
    const ceoHeartbeat = await readFile(join(companyDir, 'agents', 'ceo', 'HEARTBEAT.md'), 'utf-8');
    assert.ok(
      ceoHeartbeat.includes('<!-- Module'),
      'CEO HEARTBEAT.md should preserve module marker comment',
    );

    // Heartbeat should not be empty
    assert.ok(ceoHeartbeat.length > 50, 'CEO HEARTBEAT.md should have substantial content');
  });

  it('no meta.json files leak into the output', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'NoMetaCo',
      moduleNames: ['github-repo', 'backlog', 'auto-assign'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // Recursively check no .meta.json files in the output
    async function findMetaFiles(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      const found = [];
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          found.push(...(await findMetaFiles(fullPath)));
        } else if (entry.name.endsWith('.meta.json')) {
          found.push(fullPath);
        }
      }
      return found;
    }

    const metaFiles = await findMetaFiles(companyDir);
    assert.equal(
      metaFiles.length,
      0,
      `no .meta.json should leak into output, found: ${metaFiles.join(', ')}`,
    );
  });

  it('enriches a real expert role by default', async () => {
    const result = await assembleCompany({
      companyName: 'EnrichReal',
      userGoals: [{ title: 'Ship securely', description: '' }],
      moduleNames: ['github-repo', 'security-audit'],
      extraRoleNames: ['security-engineer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { companyDir, companySkills } = result;

    const soul = await readFile(
      join(companyDir, 'agents', 'security-engineer', 'SOUL.md'),
      'utf-8',
    );
    assert.ok(soul.includes('## Domain Lenses'), 'security-engineer SOUL.md gains lenses');
    assert.ok(soul.includes('STRIDE'), 'lens body present');

    const heartbeat = await readFile(
      join(companyDir, 'agents', 'security-engineer', 'HEARTBEAT.md'),
      'utf-8',
    );
    assert.ok(
      heartbeat.includes('## Done criteria'),
      'security-engineer HEARTBEAT.md gains done-criteria',
    );

    // The security-audit primary skills (owned by security-engineer) gain their output bars
    // in the emitted companySkills markdown.
    const securityReview = companySkills.find((s) => s.slug === 'security-review');
    assert.ok(securityReview, 'security-review should be in companySkills');
    assert.ok(
      securityReview.markdown.includes('## Output / review bar'),
      'security-review primary skill gains its output bar in emitted markdown',
    );

    // No enrichment fragment leaks as a standalone file.
    const roleFiles = await readdir(join(companyDir, 'agents', 'security-engineer'));
    assert.ok(!roleFiles.includes('LENSES.md'), 'LENSES.md must not leak as a file');
    assert.ok(!roleFiles.includes('DONE.md'), 'DONE.md must not leak as a file');
  });

  it('uses exact-head CI only after checks exist and otherwise renders a local fallback', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'CiGateCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'ci-cd', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa', 'code-reviewer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes('if required company CI checks actually exist') &&
        bootstrap.includes('until those checks exist on this head') &&
        bootstrap.includes('complete local test/lint/typecheck/build gate once'),
      'selecting ci-cd must not suppress the local gate before exact-head checks actually exist',
    );
    assert.ok(
      bootstrap.includes('"looks good" without evidence is not a valid verdict'),
      'evidence note should reject "looks good" verdicts in a negative context',
    );
  });

  it('renders a run-the-tests fallback gate in BOOTSTRAP when no CI is configured', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'NoCiGateCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa', 'code-reviewer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes('no CI configured'),
      'no-CI mode should fall back to running tests + pasting output before merge',
    );
  });

  it('BOOTSTRAP guardrail names the Code Reviewer merge gate and forbids self-stages', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'GuardrailCo',
      userGoals: [{ title: 'Ship it', description: 'Build and launch' }],
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'product-owner', 'qa', 'code-reviewer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(
      bootstrap.includes("Required PR reviews use the issue's `executionPolicy`"),
      'guardrail keeps its opening phrase',
    );
    assert.ok(
      bootstrap.includes('Code Reviewer'),
      'guardrail names the Code Reviewer as the merge gate',
    );
    assert.ok(
      /never list the issue's executor/i.test(bootstrap) ||
        bootstrap.includes('No eligible approval participant'),
      'guardrail forbids assigning the issue executor/author to a stage',
    );
    assert.ok(
      bootstrap.includes('bounded evidence') && bootstrap.includes('not serial default stages'),
      'guardrail makes specialist evidence conditional and non-serial',
    );
    // The live-proven default is one non-author Code Reviewer stage.
    const qaStageIdx = bootstrap.indexOf('(review) → assign "qa"');
    const poStageIdx = bootstrap.indexOf('(approval) → assign "product-owner"');
    const mergeStageIdx = bootstrap.indexOf('(approval) → assign "code-reviewer"');
    assert.equal(qaStageIdx, -1, 'QA is not rendered as a default stage');
    assert.equal(poStageIdx, -1, 'Product Owner is not rendered as a post-code stage');
    assert.ok(mergeStageIdx > -1, 'Code Reviewer merge-gate stage is rendered');
  });

  it('QA review skill is bounded evidence rather than a serial gate', async () => {
    const qaSkill = await readFile(
      join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'agents', 'qa', 'skills', 'qa-review.md'),
      'utf-8',
    );
    assert.ok(qaSkill.includes('bounded QA evidence'), 'QA framed as bounded evidence');
    assert.ok(
      qaSkill.toLowerCase().includes('exact-head verification'),
      'a verdict must cite exact-head evidence',
    );
    assert.ok(
      qaSkill.includes('bounded `pass` comment') &&
        qaSkill.includes('bounded `fail` comment') &&
        !qaSkill.includes('Record `approved`') &&
        !qaSkill.includes('otherwise `changes_requested`'),
      'QA records evidence comments rather than executionPolicy stage verdicts',
    );
    assert.ok(!qaSkill.includes('gh pr review'), 'no formal GitHub review with shared credential');
  });

  it('triggered specialist evidence has an assignment wake-and-return path before review', async () => {
    const prWorkflow = await readFile(
      join(
        REAL_TEMPLATES_DIR,
        'modules',
        'pr-review',
        'agents',
        'engineer',
        'skills',
        'pr-workflow.md',
      ),
      'utf-8',
    );
    assert.ok(
      prWorkflow.includes('Assignment is the wake signal') &&
        prWorkflow.includes('always reassigns the originating issue to the implementation owner') &&
        prWorkflow.indexOf('Resolve triggered specialist evidence') <
          prWorkflow.indexOf("Set the originating issue's `executionPolicy`"),
      'the Engineer must wake specialists on the same issue and receive it back before opening the gate',
    );

    const specialistSkills = [
      ['qa', 'qa-review.md'],
      ['product-owner', 'product-review.md'],
      ['security-engineer', 'pr-security-review.md'],
      ['ux-researcher', 'ux-review.md'],
      ['devops', 'infra-review.md'],
      ['ui-designer', 'design-review.md'],
    ];
    for (const [role, file] of specialistSkills) {
      const skill = await readFile(
        join(REAL_TEMPLATES_DIR, 'modules', 'pr-review', 'agents', role, 'skills', file),
        'utf-8',
      );
      assert.ok(
        skill.toLowerCase().includes('reassign') && skill.includes('implementation owner'),
        `${role} must return the assigned originating issue to the implementation owner`,
      );
    }
  });

  it('retained base roles do not contradict CI, WIP, acceptance, or remediation policy', async () => {
    const codeReviewer = await readFile(
      join(REAL_TEMPLATES_DIR, 'roles', 'code-reviewer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      codeReviewer.includes('required company CI checks actually exist') &&
        codeReviewer.includes('green exact-head CI is the authoritative complete gate') &&
        codeReviewer.includes('complete local lint/test/typecheck/build gate once') &&
        !codeReviewer.includes('always run and paste your own lint/test/build output'),
      'Code Reviewer uses exact-head CI with a focused check and a complete-local fallback',
    );

    const engineer = await readFile(
      join(REAL_TEMPLATES_DIR, 'roles', 'engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      engineer.includes('Do not self-claim unassigned work') &&
        engineer.includes('repository review/PR capacity') &&
        engineer.includes('do not invent a sensible outcome') &&
        !engineer.includes('pick a sensible one'),
      'Engineer base policy honors WIP capacity and acceptance preflight',
    );

    const securityEngineer = await readFile(
      join(REAL_TEMPLATES_DIR, 'roles', 'security-engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      securityEngineer.includes('originating issue, branch, and PR') &&
        securityEngineer.includes('independently deliverable, non-blocking work') &&
        !securityEngineer.includes('Create remediation issues for material findings'),
      'Security blocking remediation remains on the originating delivery',
    );
  });

  it('retained QA heartbeat and public docs follow the lean review flow', async () => {
    const qaHeartbeat = await readFile(
      join(REAL_TEMPLATES_DIR, 'roles', 'qa', 'HEARTBEAT.md'),
      'utf-8',
    );
    const prWorkflow = await readFile(
      join(
        REAL_TEMPLATES_DIR,
        'modules',
        'pr-review',
        'agents',
        'engineer',
        'skills',
        'pr-workflow.md',
      ),
      'utf-8',
    );
    const publicReadme = await readFile(resolve(REAL_TEMPLATES_DIR, '..', 'README.md'), 'utf-8');

    assert.ok(
      qaHeartbeat.includes('Never mark the originating implementation issue `done`') &&
        qaHeartbeat.includes('sole Code Reviewer stage'),
      'QA cannot close the originating PR issue or advance the merge-gate stage',
    );
    assert.ok(
      qaHeartbeat.includes('Standalone QA deliverable'),
      'standalone QA work retains a legitimate completion path',
    );
    assert.ok(
      prWorkflow.indexOf('## Acceptance Preflight') < prWorkflow.indexOf('## Feature Branch Flow'),
      'acceptance is checked before branch creation and implementation',
    );
    assert.ok(
      prWorkflow.includes('assign it to the Product Owner for clarification') &&
        prWorkflow.includes('CEO backlog-owner fallback'),
      'ambiguous acceptance has a pre-code Product Owner/CEO route',
    );
    assert.ok(
      publicReadme.includes('exactly one default stage') &&
        publicReadme.includes('they are not serial executionPolicy stages'),
      'public documentation describes the sole Code Reviewer stage',
    );
    assert.ok(
      !publicReadme.includes('a `review` stage for QA when present'),
      'public documentation no longer advertises the old serial chain',
    );
  });

  it('code review skill is the non-author merge gate that lands the PR', async () => {
    const crSkill = await readFile(
      join(
        REAL_TEMPLATES_DIR,
        'modules',
        'pr-review',
        'agents',
        'code-reviewer',
        'skills',
        'code-review.md',
      ),
      'utf-8',
    );
    assert.ok(crSkill.toLowerCase().includes('merge gate'), 'framed as the merge gate');
    assert.ok(crSkill.includes('gh pr merge'), 'the merge gate actually merges the PR');
    assert.ok(
      crSkill.toLowerCase().includes('non-author') ||
        crSkill.toLowerCase().includes('excludes the issue') ||
        crSkill.toLowerCase().includes('original executor'),
      'explains it is a non-author because Paperclip excludes the executor',
    );
    assert.ok(
      crSkill.toLowerCase().includes('green') ||
        crSkill.toLowerCase().includes('executed verification'),
      'requires executed verification before merge',
    );
    assert.ok(!crSkill.includes('gh pr review'), 'no formal GitHub review with shared credential');
  });

  it('emits the PR-scoped security review skill when a security engineer is present', async () => {
    const result = await assembleCompany({
      companyName: 'SecReviewCo',
      moduleNames: ['github-repo', 'pr-review'],
      extraRoleNames: ['engineer', 'security-engineer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });
    const { companySkills, roleSkillSlugs } = result;

    // pr-security-review is a non-capability skill for security-engineer
    const prSecReview = companySkills.find((s) => s.slug === 'pr-security-review');
    assert.ok(
      prSecReview,
      'pr-security-review should be emitted as a company skill when security-engineer is present',
    );
    assert.ok(
      prSecReview.markdown.toLowerCase().includes('security-relevant'),
      'pr-security-review scopes itself to security-relevant changes',
    );
    assert.ok(
      roleSkillSlugs.get('security-engineer')?.includes('pr-security-review'),
      'security-engineer should be assigned the pr-security-review slug',
    );
  });

  it('can internally keep the lean baseline when enrichment is explicitly disabled', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'LeanReal',
      userGoals: [{ title: 'Ship securely', description: '' }],
      moduleNames: ['github-repo', 'security-audit'],
      extraRoleNames: ['security-engineer'],
      enableEnrichedPersonas: false,
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    const soul = await readFile(
      join(companyDir, 'agents', 'security-engineer', 'SOUL.md'),
      'utf-8',
    );
    assert.ok(!soul.includes('## Domain Lenses'), 'no lenses injected when internally disabled');
    const heartbeat = await readFile(
      join(companyDir, 'agents', 'security-engineer', 'HEARTBEAT.md'),
      'utf-8',
    );
    assert.ok(
      !heartbeat.includes('## Done criteria'),
      'no done-criteria injected when internally disabled',
    );
  });
});
