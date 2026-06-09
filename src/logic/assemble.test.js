import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assembleCompany } from './assemble.js';

let tmpDir;
let templatesDir;
let outputDir;

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function setupFixtures() {
  tmpDir = await mkdtemp(join(tmpdir(), 'assemble-test-'));
  templatesDir = join(tmpDir, 'templates');
  outputDir = join(tmpDir, 'output');
  await mkdir(outputDir, { recursive: true });

  // Base roles in roles/ with base: true in role.meta.json
  for (const role of ['ceo', 'engineer']) {
    const roleDir = join(templatesDir, 'roles', role);
    await mkdir(roleDir, { recursive: true });
    await writeJson(join(roleDir, 'role.meta.json'), { name: role, base: true });
    await writeFile(
      join(roleDir, 'AGENTS.md'),
      `# ${role} agent\n\n## Skills\n\n<!-- Skills are appended here by modules during company assembly -->\n`,
    );
    await writeFile(join(roleDir, 'HEARTBEAT.md'), `# ${role} heartbeat\n`);
    await writeFile(join(roleDir, 'SOUL.md'), `# ${role} soul\n`);
  }

  // Extra role template (not base)
  const proleDir = join(templatesDir, 'roles', 'product-owner');
  await mkdir(proleDir, { recursive: true });
  await writeJson(join(proleDir, 'role.meta.json'), { name: 'product-owner' });
  await writeFile(join(proleDir, 'AGENTS.md'), '# product-owner agent\n\n## Skills\n\n');
  await writeFile(join(proleDir, 'HEARTBEAT.md'), '# product-owner heartbeat\n');
  await writeFile(join(proleDir, 'SOUL.md'), '# product-owner soul\n');

  // Module: github-repo (has docs and agent skills, no capabilities)
  const ghDir = join(templatesDir, 'modules', 'github-repo');
  await mkdir(join(ghDir, 'docs'), { recursive: true });
  await writeFile(join(ghDir, 'docs', 'git-workflow.md'), '# Git Workflow\n');
  await mkdir(join(ghDir, 'agents', 'engineer', 'skills'), { recursive: true });
  await writeFile(join(ghDir, 'agents', 'engineer', 'skills', 'git-workflow.md'), '# Git skill\n');
  await writeJson(join(ghDir, 'module.meta.json'), {
    name: 'github-repo',
    capabilities: [],
    tasks: [{ title: 'Init repo', assignTo: 'engineer', description: 'Set up repo' }],
  });

  // Module: auto-assign (has capabilities with ownership chain)
  const aaDir = join(templatesDir, 'modules', 'auto-assign');
  await mkdir(join(aaDir, 'agents', 'ceo', 'skills'), { recursive: true });
  await mkdir(join(aaDir, 'agents', 'product-owner', 'skills'), { recursive: true });
  await writeFile(
    join(aaDir, 'agents', 'ceo', 'skills', 'auto-assign.fallback.md'),
    '# auto-assign fallback\n',
  );
  await writeFile(
    join(aaDir, 'agents', 'ceo', 'skills', 'auto-assign.md'),
    '# auto-assign primary\n',
  );
  await writeFile(
    join(aaDir, 'agents', 'product-owner', 'skills', 'auto-assign.md'),
    '# auto-assign primary\n',
  );
  // Shared skill (primary, used by any owner without a role-specific override)
  await mkdir(join(aaDir, 'skills'), { recursive: true });
  await writeFile(join(aaDir, 'skills', 'auto-assign.md'), '# auto-assign shared primary\n');
  await writeJson(join(aaDir, 'module.meta.json'), {
    name: 'auto-assign',
    permissions: ['tasks:assign'],
    capabilities: [
      {
        skill: 'auto-assign',
        owners: ['product-owner', 'ceo'],
        fallbackSkill: 'auto-assign.fallback',
      },
    ],
  });

  // Module: gated-mod (has activatesWithRoles)
  const gatedDir = join(templatesDir, 'modules', 'gated-mod');
  await mkdir(gatedDir, { recursive: true });
  await writeJson(join(gatedDir, 'module.meta.json'), {
    name: 'gated-mod',
    activatesWithRoles: ['designer'],
    capabilities: [],
  });
}

describe('assembleCompany', () => {
  beforeEach(async () => {
    await setupFixtures();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('copies base roles to agents/ directory', async () => {
    const { companyDir, allRoles } = await assembleCompany({
      companyName: 'Test Co',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    assert.ok(companyDir.endsWith('TestCo'));
    assert.deepEqual(allRoles, new Set(['ceo', 'engineer']));

    const ceoAgents = await readFile(join(companyDir, 'agents', 'ceo', 'AGENTS.md'), 'utf-8');
    assert.ok(ceoAgents.includes('# ceo agent'));

    const engHeartbeat = await readFile(
      join(companyDir, 'agents', 'engineer', 'HEARTBEAT.md'),
      'utf-8',
    );
    assert.ok(engHeartbeat.includes('# engineer heartbeat'));
  });

  it('copies extra roles from roles/', async () => {
    const { allRoles, companyDir } = await assembleCompany({
      companyName: 'Test Co 2',
      moduleNames: [],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir,
    });

    assert.ok(allRoles.has('product-owner'));
    assert.ok(allRoles.has('ceo'));

    const poAgents = await readFile(
      join(companyDir, 'agents', 'product-owner', 'AGENTS.md'),
      'utf-8',
    );
    assert.ok(poAgents.includes('# product-owner agent'));
  });

  it('skips missing extra roles with progress message', async () => {
    const progress = [];
    await assembleCompany({
      companyName: 'Test Co 3',
      moduleNames: [],
      extraRoleNames: ['nonexistent-role'],
      outputDir,
      templatesDir,
      onProgress: (line) => progress.push(line),
    });

    assert.ok(progress.some((p) => p.includes('nonexistent-role') && p.includes('!')));
  });

  it('copies module shared docs to docs/', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'DocTest',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const gitDoc = await readFile(join(companyDir, 'docs', 'git-workflow.md'), 'utf-8');
    assert.ok(gitDoc.includes('# Git Workflow'));
  });

  it('injects module skills into agent skills/ and appends to AGENTS.md', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'SkillTest',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    // Skill file should exist
    const skillContent = await readFile(
      join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md'),
      'utf-8',
    );
    assert.ok(skillContent.includes('# Git skill'));

    // AGENTS.md should reference the skill via an absolute path (no unresolved $AGENT_HOME)
    const agentsMd = await readFile(join(companyDir, 'agents', 'engineer', 'AGENTS.md'), 'utf-8');
    assert.ok(
      agentsMd.includes(join(companyDir, 'agents', 'engineer', 'skills', 'git-workflow.md')),
      'AGENTS.md should reference the skill by absolute path',
    );
    assert.ok(
      !agentsMd.includes('$AGENT_HOME'),
      'AGENTS.md should not contain unresolved $AGENT_HOME',
    );
  });

  it('appends shared doc references to all AGENTS.md files', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'SharedDocs',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    // Both ceo and engineer AGENTS.md should reference shared docs
    for (const role of ['ceo', 'engineer']) {
      const agentsMd = await readFile(join(companyDir, 'agents', role, 'AGENTS.md'), 'utf-8');
      assert.ok(
        agentsMd.includes('docs/git-workflow.md'),
        `${role} AGENTS.md should reference shared doc`,
      );
      assert.ok(
        agentsMd.includes('Shared Documentation'),
        `${role} AGENTS.md should have shared docs section`,
      );
    }
  });

  it('generates BOOTSTRAP.md with company name and roles', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'Boot Co',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('# Bootstrap: Boot Co'));
    assert.ok(bootstrap.includes('### Ceo'));
    assert.ok(bootstrap.includes('### Engineer'));
    assert.ok(bootstrap.includes('instructionsFilePath'));
  });

  it('includes goal in BOOTSTRAP.md when provided', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'GoalCo',
      userGoals: [{ title: 'Ship MVP', description: 'Build and launch the MVP' }],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('## Goals'));
    assert.ok(bootstrap.includes('### Ship MVP'));
    assert.ok(bootstrap.includes('Build and launch the MVP'));
  });

  it('includes project info in BOOTSTRAP.md', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'ProjCo',
      userProjects: [{ name: 'my-app', description: '', goals: [] }],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('my-app'));
  });

  it('includes initial tasks in BOOTSTRAP.md from modules', async () => {
    const { companyDir, initialIssues } = await assembleCompany({
      companyName: 'TaskCo',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    assert.equal(initialIssues.length, 1);
    assert.equal(initialIssues[0].title, 'Init repo');
    assert.equal(initialIssues[0].assignTo, 'engineer');

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('## Labels'));
    assert.ok(bootstrap.includes('### feature'));
    assert.ok(bootstrap.includes('### chore'));
    assert.ok(bootstrap.includes('## Issues'));
    assert.ok(bootstrap.includes('Init repo'));
    assert.ok(bootstrap.includes('**color**: #7057ff'));
    assert.ok(bootstrap.includes('**labelIds**: → ["chore"]'));
    assert.ok(bootstrap.includes('**projectId**: → "TaskCo"'));
    assert.ok(bootstrap.includes('#### Issue Guardrails'));

    const labelsStep = bootstrap.indexOf('**Create labels**');
    const agentsStep = bootstrap.indexOf('**Agents already created**');
    const issuesStep = bootstrap.indexOf('**Create issues**');
    assert.ok(labelsStep > -1, 'manual setup order should include a labels step');
    assert.ok(agentsStep > labelsStep, 'agents step should follow labels');
    assert.ok(issuesStep > agentsStep, 'issues should be created after the agents step');
  });

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
    assert.ok(bootstrap.includes('**executionPolicy**'), 'executionPolicy block present');
    assert.ok(bootstrap.includes('(review) → assign "code-reviewer"'));
    assert.ok(bootstrap.includes('(review) → assign "qa"'));
    assert.ok(bootstrap.includes('(approval) → assign "product-owner"'));
    assert.ok(!bootstrap.includes('missing-role'), 'role absent from team is dropped');

    const crIdx = bootstrap.indexOf('"code-reviewer"');
    const poIdx = bootstrap.indexOf('"product-owner"');
    assert.ok(crIdx > -1 && poIdx > crIdx, 'approver renders after reviewers');
  });

  it('seeds user/AI domain issues at the front of the backlog, ahead of generic module issues', async () => {
    const { companyDir, initialIssues } = await assembleCompany({
      companyName: 'DomainCo',
      moduleNames: ['github-repo'],
      extraRoleNames: ['engineer'],
      userIssues: [
        {
          title: 'Primary domain feature',
          description: 'First concrete, project-specific work item from the brief.',
          priority: 'critical',
          assignTo: 'engineer',
        },
        {
          title: 'Secondary domain feature',
          description: 'Second concrete, project-specific work item from the brief.',
          priority: 'high',
          assignTo: 'engineer',
        },
      ],
      outputDir,
      templatesDir,
    });

    // User issues lead the backlog, ahead of ordinary/generic module issues.
    assert.equal(initialIssues[0].title, 'Primary domain feature');
    assert.equal(initialIssues[0].source, 'user');
    assert.equal(initialIssues[0].assignTo, 'engineer');
    assert.equal(initialIssues[1].title, 'Secondary domain feature');
    assert.ok(initialIssues.some((i) => i.title === 'Init repo'));

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const domainIdx = bootstrap.indexOf('Primary domain feature');
    const genericIdx = bootstrap.indexOf('Init repo');
    assert.ok(domainIdx > -1, 'domain issue should appear in BOOTSTRAP.md');
    assert.ok(domainIdx < genericIdx, 'domain issue should precede the generic module issue');
  });

  it('keeps foundation setup issues ahead of user domain issues and generic module issues', async () => {
    const foundationDir = join(templatesDir, 'modules', 'foundation-mod');
    await mkdir(foundationDir, { recursive: true });
    await writeJson(join(foundationDir, 'module.meta.json'), {
      name: 'foundation-mod',
      capabilities: [],
      issues: [
        {
          title: 'Set up repository foundation',
          assignTo: 'engineer',
          description: 'Must be ready before implementation work starts.',
          bootstrapPhase: 'foundation',
        },
      ],
    });

    const genericDir = join(templatesDir, 'modules', 'generic-mod');
    await mkdir(genericDir, { recursive: true });
    await writeJson(join(genericDir, 'module.meta.json'), {
      name: 'generic-mod',
      capabilities: [],
      issues: [
        {
          title: 'Generic follow-up task',
          assignTo: 'engineer',
          description: 'Normal module backlog item.',
        },
      ],
    });

    const { companyDir, initialIssues } = await assembleCompany({
      companyName: 'FoundationCo',
      moduleNames: ['foundation-mod', 'generic-mod'],
      extraRoleNames: ['engineer'],
      userIssues: [
        {
          title: 'Critical domain feature',
          description: 'Specific feature from the user brief.',
          priority: 'critical',
          assignTo: 'engineer',
        },
      ],
      outputDir,
      templatesDir,
    });

    assert.deepEqual(
      initialIssues.map((issue) => issue.title),
      ['Set up repository foundation', 'Critical domain feature', 'Generic follow-up task'],
    );

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const foundationIdx = bootstrap.indexOf('Set up repository foundation');
    const domainIdx = bootstrap.indexOf('Critical domain feature');
    const genericIdx = bootstrap.indexOf('Generic follow-up task');
    assert.ok(foundationIdx > -1, 'foundation issue should appear in BOOTSTRAP.md');
    assert.ok(foundationIdx < domainIdx, 'foundation issue should precede domain issues');
    assert.ok(domainIdx < genericIdx, 'domain issues should still precede generic module issues');
  });

  it('falls back to CEO when a user issue targets a role not on the team', async () => {
    const { initialIssues } = await assembleCompany({
      companyName: 'FallbackCo',
      moduleNames: [],
      extraRoleNames: [],
      userIssues: [
        {
          title: 'Work item for an absent role',
          description: 'Targets a role that is not part of this team.',
          assignTo: 'security-engineer',
        },
      ],
      outputDir,
      templatesDir,
    });

    assert.equal(initialIssues[0].title, 'Work item for an absent role');
    assert.equal(initialIssues[0].assignTo, 'ceo');
  });

  it('renders subtasks with explicit parentId and explicit projectId for Paperclip v2026.403.0', async () => {
    const subtasksDir = join(templatesDir, 'modules', 'subtasks-mod');
    await mkdir(subtasksDir, { recursive: true });
    await writeJson(join(subtasksDir, 'module.meta.json'), {
      name: 'subtasks-mod',
      capabilities: [],
      issues: [
        { title: 'Parent issue', assignTo: 'engineer', description: 'Top-level parent task' },
        {
          title: 'Child issue',
          assignTo: 'engineer',
          parentId: 'Parent issue',
          description: 'Implementation detail owned by the parent issue scope',
        },
      ],
    });

    const { companyDir } = await assembleCompany({
      companyName: 'SubtaskCo',
      moduleNames: ['subtasks-mod'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const parentBlock = bootstrap.split('### Parent issue')[1] || '';
    const childBlock = bootstrap.split('### Child issue')[1] || '';

    assert.ok(parentBlock.includes('**projectId**: → "SubtaskCo"'));
    assert.ok(childBlock.includes('**parentId**: → "Parent issue"'));
    assert.ok(
      childBlock.includes('**projectId**: → "SubtaskCo"'),
      'child issue should carry an explicit projectId so the API cannot create projectless subissues',
    );
    assert.ok(
      !childBlock.includes('**projectScope**: inherits from parent issue scope'),
      'bootstrap should not rely on implicit project inheritance for subissues',
    );
  });

  it('renders project workspace metadata as a v2026.403.0 createProject workspace object', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'WorkspaceCo',
      userProjects: [{ name: 'app', description: '', goals: [] }],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const projectBlock = bootstrap.split('### app')[1] || '';

    assert.ok(projectBlock.includes('**workspace.sourceType**: local_path'));
    assert.ok(projectBlock.includes('**workspace.cwd**:'));
    assert.ok(projectBlock.includes('/projects/App'));
    assert.ok(projectBlock.includes('**workspace.isPrimary**: true'));
    assert.ok(
      !projectBlock.includes('**workspace**: /'),
      'workspace must not be rendered as a raw string',
    );
  });

  it('renders git_repo workspace and execution workspace policy from project config', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'GitWorkspaceCo',
      enableIsolatedWorktrees: true,
      userProjects: [
        {
          name: 'app',
          description: '',
          goals: [],
          repoUrl: 'https://github.com/example/app',
          repoRef: 'origin/main',
          executionWorkspacePolicy: {
            defaultMode: 'isolated_workspace',
            workspaceStrategy: { type: 'git_worktree', baseRef: 'origin/main' },
          },
        },
      ],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const projectBlock = bootstrap.split('### app')[1] || '';

    assert.ok(projectBlock.includes('**workspace.sourceType**: git_repo'));
    assert.ok(projectBlock.includes('**workspace.repoUrl**: https://github.com/example/app'));
    assert.ok(projectBlock.includes('**workspace.repoRef**: origin/main'));
    assert.ok(projectBlock.includes('**workspace.defaultRef**: origin/main'));
    assert.ok(
      projectBlock.includes('**executionWorkspacePolicy.defaultMode**: isolated_workspace'),
    );
    assert.ok(
      projectBlock.includes('**executionWorkspacePolicy.workspaceStrategy.type**: git_worktree'),
    );
    assert.ok(
      projectBlock.includes('**executionWorkspacePolicy.workspaceStrategy.baseRef**: origin/main'),
    );
    assert.ok(!projectBlock.includes('**workspace.cwd**:'));
    assert.ok(
      bootstrap.includes(
        'workspace: { sourceType: "git_repo", repoUrl: "https://github.com/example/app", repoRef: "origin/main", defaultRef: "origin/main", isPrimary: true }',
      ),
    );
  });

  it('normalizes git workspace policy base ref to a remote reference for isolated worktrees', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'GitPolicyFix',
      enableIsolatedWorktrees: true,
      userProjects: [
        {
          name: 'app',
          description: '',
          goals: [],
          repoUrl: 'https://github.com/example/app',
          repoRef: 'main',
          executionWorkspacePolicy: {
            defaultMode: 'isolated_workspace',
            workspaceStrategy: { type: 'git_worktree', baseRef: 'main' },
          },
        },
      ],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const projectBlock = bootstrap.split('### app')[1] || '';

    assert.ok(
      projectBlock.includes('**workspace.repoRef**: main'),
      'workspace repoRef should keep the provided raw default ref when given',
    );
    assert.ok(
      !projectBlock.includes('**executionWorkspacePolicy.workspaceStrategy.baseRef**: main'),
      'raw base ref should be normalized to a remote ref',
    );
    assert.ok(
      projectBlock.includes('**executionWorkspacePolicy.workspaceStrategy.baseRef**: origin/main'),
      'base ref should become origin/main for isolated worktree policy',
    );
  });

  it('suppresses isolated worktree policy for a fresh local git repository', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'NewRepoCo',
      userProjects: [
        {
          name: 'app',
          description: '',
          goals: [],
          workspace: {
            sourceType: 'local_path',
            defaultRef: 'main',
            setupCommand: 'git init -b main',
            isPrimary: true,
          },
          // Even when an isolated policy slips through (e.g. an AI-generated
          // config), a fresh local repo must NOT bootstrap with git worktrees:
          // the repo/base ref does not exist yet when the first agents wake.
          executionWorkspacePolicy: {
            defaultMode: 'isolated_workspace',
            workspaceStrategy: { type: 'git_worktree', baseRef: 'main' },
          },
        },
      ],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const projectBlock = bootstrap.split('### app')[1] || '';

    assert.ok(projectBlock.includes('**workspace.sourceType**: local_path'));
    assert.ok(projectBlock.includes('**workspace.cwd**:'));
    assert.ok(projectBlock.includes('/projects/App'));
    assert.ok(projectBlock.includes('**workspace.defaultRef**: main'));
    assert.ok(projectBlock.includes('**workspace.setupCommand**: git init -b main'));
    // The isolated git_worktree policy must be stripped for fresh local repos
    // so agents work in the shared project workspace during bootstrap.
    assert.ok(
      !projectBlock.includes('**executionWorkspacePolicy.defaultMode**'),
      'isolated workspace policy must not be rendered for a fresh local repo',
    );
    assert.ok(
      !projectBlock.includes('git_worktree'),
      'git_worktree strategy must not be rendered for a fresh local repo',
    );
    // The provisioning step for the project must not carry the policy either.
    const provisioningBlock = bootstrap.split('## Provisioning Steps')[1] || '';
    assert.ok(!provisioningBlock.includes('executionWorkspacePolicy.defaultMode'));
  });

  it('preserves a real custom setupCommand and seeds one when missing', async () => {
    const customCmd = 'git init -b main && pnpm install';
    const { companyDir } = await assembleCompany({
      companyName: 'CustomSetupCo',
      userProjects: [
        // Real custom command — must be left untouched.
        {
          name: 'custom',
          description: '',
          goals: [],
          workspace: { sourceType: 'local_path', setupCommand: customCmd, isPrimary: true },
        },
        // No setupCommand — must be seeded with an initial commit.
        { name: 'empty', description: '', goals: [], workspace: { sourceType: 'local_path' } },
      ],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const customBlock = bootstrap.split('### custom')[1]?.split('### ')[0] || '';
    const emptyBlock = bootstrap.split('### empty')[1]?.split('### ')[0] || '';

    assert.ok(
      customBlock.includes(`**workspace.setupCommand**: ${customCmd}`),
      'custom setupCommand must be preserved verbatim',
    );
    assert.ok(
      !customBlock.includes('commit --allow-empty'),
      'custom setupCommand must not be rewritten',
    );
    assert.ok(
      emptyBlock.includes('git init -b main &&') && emptyBlock.includes('commit --allow-empty'),
      'missing setupCommand must be seeded with an initial commit',
    );
  });

  it('includes explicit module/preset labels, preset issues, and goal linkage in BOOTSTRAP.md', async () => {
    const modDir = join(templatesDir, 'modules', 'ai-mod');
    await mkdir(modDir, { recursive: true });
    await writeJson(join(modDir, 'module.meta.json'), {
      name: 'ai-mod',
      capabilities: [],
      labels: [{ name: 'ai', color: '#8957e5', useFor: 'AI-native capabilities' }],
      issues: [
        {
          title: 'Build AI copilot',
          assignTo: 'engineer',
          goal: 'AI-Native Capabilities',
          labels: ['ai', 'feature'],
        },
      ],
    });

    const { companyDir, initialIssues } = await assembleCompany({
      companyName: 'LabelCo',
      moduleNames: ['ai-mod'],
      extraRoleNames: [],
      presetIssues: [{ title: 'Preset strategy issue', assignTo: 'ceo', labels: ['docs'] }],
      presetLabels: [{ name: 'docs', color: '#0969da', useFor: 'Documentation' }],
      outputDir,
      templatesDir,
    });

    assert.equal(initialIssues.length, 2);
    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('### ai'));
    assert.ok(bootstrap.includes('**color**: #8957e5'));
    assert.ok(bootstrap.includes('### docs'));
    assert.ok(bootstrap.includes('### Preset strategy issue'));
    const copilotBlock = bootstrap.split('### Build AI copilot')[1] || '';
    assert.ok(copilotBlock.includes('**goalId**: → "AI-Native Capabilities"'));
    assert.ok(copilotBlock.includes('**labelIds**: → ["ai", "feature"]'));
  });

  it('redacts obvious secrets from generated bootstrap text', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'SecretCo',
      companyDescription: 'Use GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890 for GitHub.',
      userGoals: [
        {
          title: 'Ship securely',
          description: 'OpenAI key sk-abcdefghijklmnopqrstuvwxyz1234567890 must never be pasted.',
        },
      ],
      userProjects: [
        {
          name: 'app',
          description: 'PASSWORD=hunter2 should be stored as a company secret.',
          goals: ['Ship securely'],
        },
      ],
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes('GH_TOKEN=[REDACTED]'));
    assert.ok(bootstrap.includes('sk-[REDACTED]') || bootstrap.includes('[REDACTED]'));
    assert.ok(bootstrap.includes('PASSWORD=[REDACTED]'));
    assert.ok(!bootstrap.includes('hunter2'));
    assert.ok(!bootstrap.includes('abcdefghijklmnopqrstuvwxyz1234567890'));
  });

  it('adds PR-review executionPolicy guardrail when pr-review module is active', async () => {
    const prDir = join(templatesDir, 'modules', 'pr-review');
    await mkdir(prDir, { recursive: true });
    await writeJson(join(prDir, 'module.meta.json'), {
      name: 'pr-review',
      capabilities: [],
      issues: [{ title: 'Set up PR reviews', assignTo: 'engineer' }],
    });

    const { companyDir } = await assembleCompany({
      companyName: 'ReviewCo',
      moduleNames: ['pr-review'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    assert.ok(bootstrap.includes("Required PR reviews use the issue's `executionPolicy`"));
    assert.ok(!bootstrap.includes('are explicit assigned child issues'));
  });

  it('renders agent hire metadata required by Paperclip v2026.403.0', async () => {
    const engineerMeta = join(templatesDir, 'roles', 'engineer', 'role.meta.json');
    await writeJson(engineerMeta, {
      name: 'engineer',
      base: true,
      title: 'Software Engineer',
      paperclipRole: 'engineer',
      description: 'Implements features and fixes bugs.',
      adapter: { model: 'gpt-5.5', effort: 'high' },
    });

    const { companyDir } = await assembleCompany({
      companyName: 'AgentCo',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const bootstrap = await readFile(join(companyDir, 'BOOTSTRAP.md'), 'utf-8');
    const engineerBlock = bootstrap.split('### Engineer')[1] || '';

    assert.ok(engineerBlock.includes('**role**: engineer'));
    assert.ok(engineerBlock.includes('**title**: Software Engineer'));
    assert.ok(engineerBlock.includes('**capabilities**: Implements features and fixes bugs.'));
    assert.ok(engineerBlock.includes('**adapterType**: codex_local'));
    assert.ok(engineerBlock.includes('**adapterConfig.cwd**:'));
    assert.ok(engineerBlock.includes('**adapterConfig.model**: gpt-5.5'));
    assert.ok(engineerBlock.includes('**adapterConfig.modelReasoningEffort**: high'));
    assert.ok(engineerBlock.includes('**runtimeConfig.heartbeat.maxConcurrentRuns**: 1'));
  });

  it('fires onProgress callback for each step', async () => {
    const progress = [];
    await assembleCompany({
      companyName: 'ProgressCo',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
      onProgress: (line) => progress.push(line),
    });

    // Should have base role copies, doc copies, skill copies, BOOTSTRAP.md
    assert.ok(progress.some((p) => p.includes('agents/ceo/') && p.includes('base')));
    assert.ok(progress.some((p) => p.includes('agents/engineer/') && p.includes('base')));
    assert.ok(progress.some((p) => p.includes('docs/git-workflow.md')));
    assert.ok(progress.some((p) => p.includes('git-workflow.md') && p.includes('github-repo')));
    assert.ok(progress.some((p) => p.includes('BOOTSTRAP.md')));
  });

  it('appends incrementing index when company directory already exists', async () => {
    const first = await assembleCompany({
      companyName: 'DupeCo',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });
    assert.ok(first.companyDir.endsWith('DupeCo'));

    const second = await assembleCompany({
      companyName: 'DupeCo',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });
    assert.ok(second.companyDir.endsWith('DupeCo2'));

    const third = await assembleCompany({
      companyName: 'DupeCo',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });
    assert.ok(third.companyDir.endsWith('DupeCo3'));
  });

  it('converts company name to PascalCase directory', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'my cool company',
      moduleNames: [],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    assert.ok(companyDir.endsWith('MyCoolCompany'));
  });

  it('skips modules not found with progress message', async () => {
    const progress = [];
    await assembleCompany({
      companyName: 'MissingMod',
      moduleNames: ['nonexistent-module'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
      onProgress: (line) => progress.push(line),
    });

    assert.ok(progress.some((p) => p.includes('nonexistent-module') && p.includes('!')));
  });

  it('skips modules gated by activatesWithRoles when role absent', async () => {
    const progress = [];
    await assembleCompany({
      companyName: 'GatedCo',
      moduleNames: ['gated-mod'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
      onProgress: (line) => progress.push(line),
    });

    // Should show skipped with ○
    assert.ok(progress.some((p) => p.includes('gated-mod') && p.includes('○')));
  });

  it('assigns primary skill to capability owner and fallback to non-owner', async () => {
    const { companyDir } = await assembleCompany({
      companyName: 'CapCo',
      moduleNames: ['auto-assign'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir,
    });

    // product-owner is primary owner → gets auto-assign.md (primary)
    const poSkills = await readdir(join(companyDir, 'agents', 'product-owner', 'skills'));
    assert.ok(poSkills.includes('auto-assign.md'));

    // ceo is fallback → gets auto-assign.fallback.md
    const ceoSkills = await readdir(join(companyDir, 'agents', 'ceo', 'skills'));
    assert.ok(ceoSkills.includes('auto-assign.fallback.md'));
    // ceo should NOT get the primary auto-assign.md
    assert.ok(!ceoSkills.includes('auto-assign.md'));
  });

  it('injects heartbeat sections from modules into HEARTBEAT.md', async () => {
    // Add heartbeat-section.md to the auto-assign module for ceo
    const aaHeartbeatDir = join(templatesDir, 'modules', 'auto-assign', 'agents', 'ceo');
    await mkdir(aaHeartbeatDir, { recursive: true });
    await writeFile(
      join(aaHeartbeatDir, 'heartbeat-section.md'),
      '## Assignment Check (Fallback)\n\nCheck for idle agents.\n',
    );

    // Add the marker comment to ceo HEARTBEAT.md
    const ceoHeartbeat = join(templatesDir, 'roles', 'ceo', 'HEARTBEAT.md');
    await writeFile(
      ceoHeartbeat,
      '# ceo heartbeat\n\n<!-- Module heartbeat sections are inserted above this line during assembly -->\n',
    );

    const { companyDir } = await assembleCompany({
      companyName: 'HeartbeatCo',
      moduleNames: ['auto-assign'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const heartbeat = await readFile(join(companyDir, 'agents', 'ceo', 'HEARTBEAT.md'), 'utf-8');
    assert.ok(
      heartbeat.includes('## Assignment Check (Fallback)'),
      'should inject heartbeat section',
    );
    assert.ok(heartbeat.includes('Check for idle agents'), 'should include section content');
    assert.ok(
      heartbeat.includes('<!-- Module heartbeat'),
      'should preserve the marker for further injections',
    );
  });

  it('injects heartbeat sections for multiple modules into same role', async () => {
    // Create two modules with heartbeat sections for ceo
    for (const mod of ['mod-a', 'mod-b']) {
      const modDir = join(templatesDir, 'modules', mod);
      await mkdir(join(modDir, 'agents', 'ceo'), { recursive: true });
      await writeJson(join(modDir, 'module.meta.json'), { name: mod, capabilities: [] });
      await writeFile(
        join(modDir, 'agents', 'ceo', 'heartbeat-section.md'),
        `## Section from ${mod}\n\nDo ${mod} things.\n`,
      );
    }

    // Add marker to ceo HEARTBEAT.md
    await writeFile(
      join(templatesDir, 'roles', 'ceo', 'HEARTBEAT.md'),
      '# ceo heartbeat\n\n<!-- Module heartbeat sections are inserted above this line during assembly -->\n',
    );

    const { companyDir } = await assembleCompany({
      companyName: 'MultiHeartbeat',
      moduleNames: ['mod-a', 'mod-b'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    const heartbeat = await readFile(join(companyDir, 'agents', 'ceo', 'HEARTBEAT.md'), 'utf-8');
    assert.ok(heartbeat.includes('## Section from mod-a'), 'should have mod-a section');
    assert.ok(heartbeat.includes('## Section from mod-b'), 'should have mod-b section');
    assert.ok(
      heartbeat.includes('<!-- Module heartbeat'),
      'should preserve marker after both injections',
    );
  });

  it('skips heartbeat injection for roles not present in the company', async () => {
    // auto-assign module has product-owner heartbeat section in fixtures
    const poHeartbeatDir = join(templatesDir, 'modules', 'auto-assign', 'agents', 'product-owner');
    await mkdir(poHeartbeatDir, { recursive: true });
    await writeFile(
      join(poHeartbeatDir, 'heartbeat-section.md'),
      '## PO Assignment Check\n\nAssign issues.\n',
    );

    const { companyDir } = await assembleCompany({
      companyName: 'NoPoCo',
      moduleNames: ['auto-assign'],
      extraRoleNames: [], // no product-owner
      outputDir,
      templatesDir,
    });

    // CEO heartbeat should NOT have PO section
    const ceoHb = await readFile(join(companyDir, 'agents', 'ceo', 'HEARTBEAT.md'), 'utf-8');
    assert.ok(!ceoHb.includes('PO Assignment Check'), 'should not inject PO section into CEO');
  });

  it("skips heartbeat injection for gated modules that didn't activate", async () => {
    // gated-mod requires "designer" role
    const gatedDir = join(templatesDir, 'modules', 'gated-mod');
    await mkdir(join(gatedDir, 'agents', 'ceo'), { recursive: true });
    await writeFile(
      join(gatedDir, 'agents', 'ceo', 'heartbeat-section.md'),
      '## Gated Section\n\nShould not appear.\n',
    );

    await writeFile(
      join(templatesDir, 'roles', 'ceo', 'HEARTBEAT.md'),
      '# ceo heartbeat\n\n<!-- Module heartbeat sections are inserted above this line during assembly -->\n',
    );

    const { companyDir } = await assembleCompany({
      companyName: 'GatedHeartbeat',
      moduleNames: ['gated-mod'],
      extraRoleNames: [], // no designer
      outputDir,
      templatesDir,
    });

    const heartbeat = await readFile(join(companyDir, 'agents', 'ceo', 'HEARTBEAT.md'), 'utf-8');
    assert.ok(!heartbeat.includes('Gated Section'), 'should not inject from gated module');
  });

  it('reports heartbeat injection in onProgress callback', async () => {
    const aaHeartbeatDir = join(templatesDir, 'modules', 'auto-assign', 'agents', 'ceo');
    await mkdir(aaHeartbeatDir, { recursive: true });
    await writeFile(
      join(aaHeartbeatDir, 'heartbeat-section.md'),
      '## Assignment Check\n\nDo assignments.\n',
    );

    await writeFile(
      join(templatesDir, 'roles', 'ceo', 'HEARTBEAT.md'),
      '# ceo heartbeat\n\n<!-- Module heartbeat sections are inserted above this line during assembly -->\n',
    );

    const progress = [];
    await assembleCompany({
      companyName: 'ProgressHeartbeat',
      moduleNames: ['auto-assign'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
      onProgress: (line) => progress.push(line),
    });

    assert.ok(
      progress.some(
        (p) =>
          p.includes('HEARTBEAT.md') &&
          p.includes('auto-assign') &&
          p.includes('heartbeat section'),
      ),
      'should report heartbeat injection in progress',
    );
  });

  it('throws when a module requires another module that is not selected', async () => {
    // Add requires to github-repo module
    const ghMeta = join(templatesDir, 'modules', 'github-repo', 'module.meta.json');
    await writeJson(ghMeta, {
      name: 'github-repo',
      requires: ['auto-assign'],
      capabilities: [],
    });

    await assert.rejects(
      () =>
        assembleCompany({
          companyName: 'MissingDep',
          moduleNames: ['github-repo'],
          extraRoleNames: [],
          outputDir,
          templatesDir,
        }),
      {
        message: 'Module "github-repo" requires module "auto-assign", which is not selected',
      },
    );
  });

  it('succeeds when all required modules are selected', async () => {
    // Add requires to github-repo module
    const ghMeta = join(templatesDir, 'modules', 'github-repo', 'module.meta.json');
    await writeJson(ghMeta, {
      name: 'github-repo',
      requires: ['auto-assign'],
      capabilities: [],
      tasks: [],
    });

    const { companyDir } = await assembleCompany({
      companyName: 'AllDeps',
      moduleNames: ['github-repo', 'auto-assign'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    // Should succeed without error
    assert.ok(companyDir.endsWith('AllDeps'));
  });

  it('skips dependency validation for modules with no requires field', async () => {
    // github-repo in fixtures has no requires field — should work fine
    const { companyDir } = await assembleCompany({
      companyName: 'NoDeps',
      moduleNames: ['github-repo'],
      extraRoleNames: [],
      outputDir,
      templatesDir,
    });

    assert.ok(companyDir.endsWith('NoDeps'));
  });

  it('does not emit enrichment fragments as standalone files (flag off)', async () => {
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
    const soul = await readFile(join(companyDir, 'agents', 'engineer', 'SOUL.md'), 'utf-8');
    assert.ok(!soul.includes('Domain Lenses'), 'SOUL.md must stay lean when flag off');
  });

  it('injects lenses into SOUL.md and done-criteria into HEARTBEAT.md when enabled', async () => {
    const engDir = join(templatesDir, 'roles', 'engineer');
    await writeFile(
      join(engDir, 'LENSES.md'),
      '## Domain Lenses\n\n- **Test Lens** — explanation\n',
    );
    await writeFile(
      join(engDir, 'DONE.md'),
      '## Done criteria\n\nAlways update your task with a comment before exiting a heartbeat.\n',
    );

    const { companyDir } = await assembleCompany({
      companyName: 'EnrichCo',
      moduleNames: [],
      extraRoleNames: [],
      enableEnrichedPersonas: true,
      outputDir,
      templatesDir,
    });

    const soul = await readFile(join(companyDir, 'agents', 'engineer', 'SOUL.md'), 'utf-8');
    const heartbeat = await readFile(
      join(companyDir, 'agents', 'engineer', 'HEARTBEAT.md'),
      'utf-8',
    );
    assert.ok(soul.includes('## Domain Lenses'), 'SOUL.md should contain injected lenses');
    assert.ok(soul.includes('Test Lens'), 'SOUL.md should contain the lens body');
    assert.ok(heartbeat.includes('## Done criteria'), 'HEARTBEAT.md should contain done-criteria');
    assert.ok(
      heartbeat.includes('comment before exiting a heartbeat'),
      'HEARTBEAT.md should contain the heartbeat-exit rule',
    );
  });

  it('appends a primary skill output bar when enabled, and never emits .bar.md standalone', async () => {
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

  it('resolves capability:* task assignments to the primary owner role', async () => {
    // Add a task with capability: reference
    const aaModuleMeta = join(templatesDir, 'modules', 'auto-assign', 'module.meta.json');
    await writeJson(aaModuleMeta, {
      name: 'auto-assign',
      capabilities: [{ skill: 'auto-assign', owners: ['product-owner', 'ceo'] }],
      tasks: [{ title: 'Configure auto-assign', assignTo: 'capability:auto-assign' }],
    });

    const { initialIssues } = await assembleCompany({
      companyName: 'CapTaskCo',
      moduleNames: ['auto-assign'],
      extraRoleNames: ['product-owner'],
      outputDir,
      templatesDir,
    });

    assert.equal(initialIssues.length, 1);
    assert.equal(initialIssues[0].assignTo, 'product-owner');
  });
});
