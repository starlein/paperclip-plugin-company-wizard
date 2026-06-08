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
      'Initialize GitHub repository',
      'github repository foundation task should lead the initial backlog',
    );
    assert.equal(initialIssues[0].priority, 'critical');
    assert.equal(initialIssues[0].bootstrapPhase, 'foundation');
    assert.ok(taskTitles.includes('Initialize GitHub repository'), 'should have github-repo task');
    const prReviewIndex = taskTitles.indexOf('Set up Paperclip PR review workflow');
    const githubIndex = taskTitles.indexOf('Initialize GitHub repository');
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
    const { companyDir } = await assembleCompany({
      companyName: 'CapResolution',
      moduleNames: ['backlog', 'auto-assign'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // product-owner is first in owners[] for both backlog-health and auto-assign
    // → product-owner should be primary, ceo should be fallback

    const poSkillsDir = join(companyDir, 'agents', 'product-owner', 'skills');
    const ceoSkillsDir = join(companyDir, 'agents', 'ceo', 'skills');

    assert.ok(await exists(poSkillsDir), 'product-owner should have skills/');
    assert.ok(await exists(ceoSkillsDir), 'ceo should have skills/');

    const poSkills = await readdir(poSkillsDir);
    const ceoSkills = await readdir(ceoSkillsDir);

    // product-owner gets primary skills
    assert.ok(poSkills.includes('auto-assign.md'), 'PO should have primary auto-assign.md');
    assert.ok(poSkills.includes('backlog-health.md'), 'PO should have primary backlog-health.md');

    // ceo gets fallback skills
    assert.ok(
      ceoSkills.includes('auto-assign.fallback.md'),
      'CEO should have fallback auto-assign',
    );
    assert.ok(
      ceoSkills.includes('backlog-health.fallback.md'),
      'CEO should have fallback backlog-health',
    );

    // ceo should NOT have the primary versions of capability skills
    assert.ok(!ceoSkills.includes('auto-assign.md'), 'CEO should not have primary auto-assign');
    assert.ok(
      !ceoSkills.includes('backlog-health.md'),
      'CEO should not have primary backlog-health',
    );

    // AGENTS.md should reference the installed skills
    const poAgentsMd = await readFile(
      join(companyDir, 'agents', 'product-owner', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(poAgentsMd.includes('auto-assign.md'), 'PO AGENTS.md should reference auto-assign');
    assert.ok(
      poAgentsMd.includes('backlog-health.md'),
      'PO AGENTS.md should reference backlog-health',
    );

    const ceoAgentsMd = await readFile(join(companyDir, 'agents', 'ceo', 'AGENTS.md'), 'utf-8');
    assert.ok(
      ceoAgentsMd.includes('auto-assign.fallback.md'),
      'CEO AGENTS.md should reference fallback auto-assign',
    );
  });

  it('falls back capability ownership to ceo when product-owner is absent', async () => {
    const { companyDir, initialIssues } = await assembleCompany({
      companyName: 'FallbackCo',
      moduleNames: ['backlog', 'auto-assign'],
      extraRoleNames: [],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // Without product-owner, ceo is next in owners[] → ceo becomes primary
    const ceoSkillsDir = join(companyDir, 'agents', 'ceo', 'skills');
    assert.ok(await exists(ceoSkillsDir), 'ceo should have skills/');

    const ceoSkills = await readdir(ceoSkillsDir);
    assert.ok(
      ceoSkills.includes('auto-assign.md'),
      'CEO should have primary auto-assign when PO absent',
    );
    assert.ok(
      ceoSkills.includes('backlog-health.md'),
      'CEO should have primary backlog-health when PO absent',
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

  it('pr-review templates use Paperclip-governed verdicts instead of GitHub self-approval', async () => {
    const prReviewDir = join(REAL_TEMPLATES_DIR, 'modules', 'pr-review');
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

    const markdownFiles = await readMarkdownFiles(prReviewDir);
    assert.ok(markdownFiles.length > 0, 'expected pr-review markdown templates');
    for (const file of markdownFiles) {
      const content = await readFile(file, 'utf-8');
      assert.ok(
        !content.includes('gh pr review'),
        `${file} should not instruct agents to submit formal GitHub reviews`,
      );
      assert.ok(
        !content.includes('--approve'),
        `${file} should not instruct agents to approve with the shared GitHub credential`,
      );
      assert.ok(
        !content.includes('--request-changes'),
        `${file} should not instruct agents to request changes with the shared GitHub credential`,
      );
    }
  });

  it('injects skill references into AGENTS.md with correct paths', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'SkillRefCo',
      moduleNames: ['github-repo'],
      extraRoleNames: ['engineer'],
      outputDir,
      templatesDir: REAL_TEMPLATES_DIR,
    });

    // github-repo has agent-specific skill for engineer; reference must be the
    // absolute provisioned path, not an unresolved $AGENT_HOME placeholder.
    const engAgentsMd = await readFile(
      join(companyDir, 'agents', 'engineer', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(
      engAgentsMd.includes(join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md')),
      'engineer AGENTS.md should reference git-workflow skill by absolute path',
    );

    // Skill file should exist at the referenced location
    assert.ok(
      await exists(join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md')),
      'engineer skills/git-workflow.md should exist',
    );
  });

  it('resolves all $AGENT_HOME references to absolute paths in agent files', async () => {
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
        assert.ok(
          !content.includes('$AGENT_HOME'),
          `${role}/${file} should not contain unresolved $AGENT_HOME`,
        );
        // The role's own files should be referenced under its absolute home dir.
        if (content.includes('/skills/') || content.includes('/HEARTBEAT.md')) {
          assert.ok(
            content.includes(roleDir),
            `${role}/${file} should reference files under its absolute home dir`,
          );
        }
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
});
