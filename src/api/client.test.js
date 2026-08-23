import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  companySkillCreateSchema,
  companySkillFileUpdateSchema,
  companySkillRenameSchema,
  companySkillUpdateSchema,
  createAgentHireSchema,
  createCompanySchema,
  createGoalSchema,
  createIssueSchema,
  createProjectSchema,
  createRoutineSchema,
  createRoutineTriggerSchema,
} from '@paperclipai/shared';
import { PaperclipClient } from './client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PaperclipClient.createAgent', () => {
  it('forwards CEO metadata fields accepted by Paperclip through the governance hire endpoint', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, opts, body: JSON.parse(opts.body) });
      return jsonResponse({ agent: { id: 'agent-1' } });
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createAgent('company-1', {
      name: 'CEO',
      role: 'ceo',
      title: 'CEO',
      reportsTo: null,
      capabilities: 'Strategic leader. Sets goals, delegates work, manages approvals.',
      desiredSkills: ['leadership'],
      metadata: { templateRole: 'ceo', description: 'Strategic leader.' },
      adapterType: 'codex_local',
      adapterConfig: { model: 'gpt-5.5', modelReasoningEffort: 'high' },
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, maxConcurrentRuns: 1 } },
      budgetMonthlyCents: 0,
      permissions: { canCreateAgents: true },
      sourceIssueId: 'issue-board-ops',
      instructionsBundle: {
        entryFile: 'AGENTS.md',
        files: { 'AGENTS.md': 'Use managed AGENTS.md.' },
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://paperclip.test/api/companies/company-1/agent-hires');
    assert.deepEqual(requests[0].body, {
      name: 'CEO',
      role: 'ceo',
      title: 'CEO',
      reportsTo: null,
      capabilities: 'Strategic leader. Sets goals, delegates work, manages approvals.',
      desiredSkills: ['leadership'],
      metadata: { templateRole: 'ceo', description: 'Strategic leader.' },
      adapterType: 'codex_local',
      adapterConfig: { model: 'gpt-5.5', modelReasoningEffort: 'high' },
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, maxConcurrentRuns: 1 } },
      budgetMonthlyCents: 0,
      permissions: { canCreateAgents: true },
      sourceIssueId: 'issue-board-ops',
      instructionsBundle: {
        entryFile: 'AGENTS.md',
        files: { 'AGENTS.md': 'Use managed AGENTS.md.' },
      },
    });
  });

  it('submits new agents through the governance hire endpoint without auto-approving', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      requests.push({ url, opts, body });
      if (url.endsWith('/agent-hires')) {
        return jsonResponse({
          agent: { id: 'agent-1' },
          approval: { id: 'approval-1' },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const client = new PaperclipClient('http://paperclip.test');
    const agent = await client.createAgent('company-1', {
      name: 'CEO',
      role: 'ceo',
      capabilities: 'Owns company strategy.',
      metadata: { description: 'Owns company strategy.' },
      adapterType: 'codex_local',
      adapterConfig: { model: 'gpt-5.5', modelReasoningEffort: 'high' },
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, maxConcurrentRuns: 1 } },
      permissions: { canCreateAgents: true },
      sourceIssueId: 'issue-hiring-plan',
      instructionsBundle: {
        entryFile: 'AGENTS.md',
        files: { 'AGENTS.md': 'Use managed AGENTS.md.' },
      },
    });

    assert.equal(requests.length, 1);
    const hireRequest = requests.find((request) => request.url.endsWith('/agent-hires'));
    assert.ok(hireRequest);
    assert.equal(hireRequest.body.capabilities, 'Owns company strategy.');
    assert.deepEqual(hireRequest.body.metadata, { description: 'Owns company strategy.' });
    assert.equal(hireRequest.body.adapterConfig.model, 'gpt-5.5');
    assert.equal(hireRequest.body.adapterConfig.modelReasoningEffort, 'high');
    assert.equal(hireRequest.body.runtimeConfig.heartbeat.maxConcurrentRuns, 1);
    assert.equal(hireRequest.body.sourceIssueId, 'issue-hiring-plan');
    assert.deepEqual(hireRequest.body.instructionsBundle, {
      entryFile: 'AGENTS.md',
      files: { 'AGENTS.md': 'Use managed AGENTS.md.' },
    });
    assert.equal(agent._pendingApprovalId, 'approval-1');
    assert.ok(!requests.some((request) => request.url.endsWith('/approve')));
  });

  it('defaults governed agent hire requests to codex_local instead of a Claude adapter', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return jsonResponse({ agent: { id: 'agent-1' } });
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createAgent('company-1', {
      name: 'Engineer',
      role: 'engineer',
    });

    assert.equal(requests[0].url, 'http://paperclip.test/api/companies/company-1/agent-hires');
    assert.equal(requests[0].body.adapterType, 'codex_local');
  });
});

describe('PaperclipClient provisioning helpers', () => {
  it('sends a v2026.403.0 project workspace object instead of a raw workspace string', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'project-1' }, 201);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createProject('company-1', {
      name: 'Dialer',
      description: 'Dialer project',
      goalIds: ['goal-1'],
      workspace: '/paperclip/instances/default/companies/Dialer/projects/Dialer',
      executionWorkspacePolicy: {
        defaultMode: 'isolated_workspace',
        workspaceStrategy: { type: 'git_worktree', baseRef: 'release/2026-q2' },
      },
    });

    assert.deepEqual(requests[0].body.workspace, {
      sourceType: 'local_path',
      cwd: '/paperclip/instances/default/companies/Dialer/projects/Dialer',
      isPrimary: true,
    });
    assert.deepEqual(requests[0].body.executionWorkspacePolicy, {
      enabled: true,
      defaultMode: 'isolated_workspace',
      workspaceStrategy: { type: 'git_worktree', baseRef: 'release/2026-q2' },
    });
  });

  it('forwards current issue fields and defaults the required status to todo', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'issue-1' }, 201);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createIssue('company-1', {
      title: 'Child issue',
      description: 'Scoped child task',
      priority: 'high',
      parentId: 'parent-1',
      projectId: 'project-1',
      labelIds: ['label-1'],
      blockParentUntilDone: true,
    });

    assert.equal(requests[0].body.parentId, 'parent-1');
    assert.equal(requests[0].body.projectId, 'project-1');
    assert.deepEqual(requests[0].body.labelIds, ['label-1']);
    assert.equal(requests[0].body.status, 'todo');
    assert.ok(
      !Object.hasOwn(requests[0].body, 'blockParentUntilDone'),
      'removed Paperclip fields must not leak into create-issue payloads',
    );
  });

  it('forwards a task watchdog on issue create only when an agentId is present', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'issue-1' }, 201);
    };

    const client = new PaperclipClient('http://paperclip.test');
    // With a watchdog
    await client.createIssue('company-1', {
      title: 'Bootstrap',
      watchdog: { agentId: 'ceo-1', instructions: 'recover if stalled' },
    });
    assert.deepEqual(requests[0].body.watchdog, {
      agentId: 'ceo-1',
      instructions: 'recover if stalled',
    });

    // Without an agentId — the field is dropped, not sent as an invalid object
    await client.createIssue('company-1', { title: 'No watchdog', watchdog: {} });
    assert.ok(
      !Object.hasOwn(requests[1].body, 'watchdog') || requests[1].body.watchdog === undefined,
      'watchdog without agentId must not be sent',
    );
  });

  it('upserts a task watchdog through PUT /issues/:id/watchdog', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'wd-1' });
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.setIssueWatchdog('issue-1', { agentId: 'ceo-1', instructions: 'recover' });

    assert.equal(requests[0].url, 'http://paperclip.test/api/issues/issue-1/watchdog');
    assert.equal(requests[0].method, 'PUT');
    assert.equal(requests[0].body.agentId, 'ceo-1');
    assert.equal(requests[0].body.instructions, 'recover');
  });

  it('patches issues through the top-level issue update route', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'issue-1', status: 'todo' }, 200);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.updateIssue('issue-1', { status: 'todo' });

    assert.equal(requests[0].url, 'http://paperclip.test/api/issues/issue-1');
    assert.equal(requests[0].method, 'PATCH');
    assert.deepEqual(requests[0].body, { status: 'todo' });
  });

  it('patches projects through the top-level project update route', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'project-1', goalIds: ['goal-1'] }, 200);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.updateProject('project-1', { goalIds: ['goal-1'] });

    assert.equal(requests[0].url, 'http://paperclip.test/api/projects/project-1');
    assert.equal(requests[0].method, 'PATCH');
    assert.deepEqual(requests[0].body, { goalIds: ['goal-1'] });
  });

  it('updates routines and routine triggers through supported top-level routes', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({
        url,
        method: opts.method || 'GET',
        body: opts.body ? JSON.parse(opts.body) : undefined,
      });
      return jsonResponse({ id: url.includes('routine-triggers') ? 'trigger-1' : 'routine-1' });
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.listRoutines('company-1');
    await client.getRoutine('routine-1');
    await client.updateRoutine('routine-1', { description: 'Updated routine' });
    await client.updateRoutineTrigger('trigger-1', { cronExpression: '0 */4 * * *' });

    assert.deepEqual(
      requests.map((request) => [request.method, request.url, request.body]),
      [
        ['GET', 'http://paperclip.test/api/companies/company-1/routines', undefined],
        ['GET', 'http://paperclip.test/api/routines/routine-1', undefined],
        [
          'PATCH',
          'http://paperclip.test/api/routines/routine-1',
          { description: 'Updated routine' },
        ],
        [
          'PATCH',
          'http://paperclip.test/api/routine-triggers/trigger-1',
          { cronExpression: '0 */4 * * *' },
        ],
      ],
    );
  });

  it('creates issue documents with optional revision freshness', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return jsonResponse({ key: 'decision-log', latestRevision: { id: 'rev-2' } }, 200);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.putIssueDocument('issue-1', 'decision-log', {
      title: 'Decision Log',
      format: 'markdown',
      body: '# Decision Log',
      baseRevisionId: 'rev-1',
    });

    assert.equal(
      requests[0].url,
      'http://paperclip.test/api/issues/issue-1/documents/decision-log',
    );
    assert.equal(requests[0].method, 'PUT');
    assert.deepEqual(requests[0].body, {
      title: 'Decision Log',
      format: 'markdown',
      body: '# Decision Log',
      baseRevisionId: 'rev-1',
    });
  });
});

describe('PaperclipClient instance settings helpers', () => {
  it('reads experimental settings from the instance settings endpoint', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({
        url,
        method: opts.method || 'GET',
        body: opts.body ? JSON.parse(opts.body) : undefined,
      });
      return jsonResponse(
        {
          enableEnvironments: false,
          enableIsolatedWorkspaces: true,
          enableStreamlinedLeftNavigation: false,
        },
        200,
      );
    };

    const client = new PaperclipClient('http://paperclip.test');
    const settings = await client.getInstanceExperimentalSettings();

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://paperclip.test/api/instance/settings/experimental');
    assert.equal(requests[0].method, 'GET');
    assert.equal(settings.enableIsolatedWorkspaces, true);
  });
});

describe('PaperclipClient company skills', () => {
  it('creates a company skill via POST /companies/:id/skills', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({
        url: String(url),
        method: opts.method,
        body: opts.body ? JSON.parse(opts.body) : null,
      });
      return jsonResponse({ id: 'skill-1', key: 'ci-cd', slug: 'ci-cd' }, 201);
    };
    const client = new PaperclipClient('http://paperclip.test');
    const result = await client.createCompanySkill('company-1', {
      name: 'Ci Cd',
      slug: 'ci-cd',
      description: 'ci-cd — primary skill',
      markdown: '# CI/CD',
      categories: ['ci-cd'],
    });
    assert.equal(result.key, 'ci-cd');
    assert.equal(requests[0].method, 'POST');
    assert.ok(requests[0].url.endsWith('/api/companies/company-1/skills'));
    assert.equal(requests[0].body.slug, 'ci-cd');
    assert.equal(requests[0].body.markdown, '# CI/CD');
  });

  it('uses the current metadata, rename, and SKILL.md update routes', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({
        url: String(url),
        method: opts.method || 'GET',
        body: opts.body ? JSON.parse(opts.body) : undefined,
      });
      if (String(url).endsWith('/skills') && (!opts.method || opts.method === 'GET')) {
        return jsonResponse([{ id: 'skill-1', key: 'ci-cd', slug: 'ci-cd' }]);
      }
      return jsonResponse({ id: 'skill-1', key: 'ci-cd', slug: 'ci-cd' });
    };
    const client = new PaperclipClient('http://paperclip.test');
    const list = await client.listCompanySkills('company-1');
    assert.equal(list[0].slug, 'ci-cd');
    await client.updateCompanySkill('company-1', 'skill-1', { description: 'updated' });
    await client.renameCompanySkill('company-1', 'skill-1', { name: 'CI/CD' });
    await client.updateCompanySkillFile('company-1', 'skill-1', {
      path: 'SKILL.md',
      content: '# new',
    });
    assert.equal(requests[1].method, 'PATCH');
    assert.ok(requests[1].url.endsWith('/api/companies/company-1/skills/skill-1'));
    assert.deepEqual(requests[1].body, { description: 'updated' });
    assert.equal(requests[2].method, 'POST');
    assert.ok(requests[2].url.endsWith('/api/companies/company-1/skills/skill-1/rename'));
    assert.deepEqual(requests[2].body, { name: 'CI/CD' });
    assert.equal(requests[3].method, 'PATCH');
    assert.ok(requests[3].url.endsWith('/api/companies/company-1/skills/skill-1/files'));
    assert.deepEqual(requests[3].body, { path: 'SKILL.md', content: '# new' });
  });
});

describe('latest Paperclip stable request contracts', () => {
  it('emits payloads accepted by the v2026.817.0 shared validators', async () => {
    const ids = {
      company: '00000000-0000-4000-8000-000000000001',
      agent: '00000000-0000-4000-8000-000000000002',
      project: '00000000-0000-4000-8000-000000000003',
      goal: '00000000-0000-4000-8000-000000000004',
      parent: '00000000-0000-4000-8000-000000000005',
      label: '00000000-0000-4000-8000-000000000006',
      routine: '00000000-0000-4000-8000-000000000007',
      skill: '00000000-0000-4000-8000-000000000008',
    };
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      const request = {
        url: String(url),
        method: opts.method || 'GET',
        body: opts.body ? JSON.parse(opts.body) : undefined,
      };
      requests.push(request);
      if (request.url.endsWith('/agent-hires')) {
        return jsonResponse({ agent: { id: ids.agent }, approval: null }, 201);
      }
      return jsonResponse({ id: 'result' }, request.method === 'POST' ? 201 : 200);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createCompany({ name: 'Compatible Co', description: 'Current host contract' });
    await client.createGoal(ids.company, {
      title: 'Ship',
      description: 'Ship safely',
      level: 'company',
      status: 'active',
      ownerAgentId: ids.agent,
    });
    await client.createProject(ids.company, {
      name: 'Compatible Project',
      description: 'Current workspace contract',
      goalIds: [ids.goal],
      workspace: '/tmp/compatible-project',
      executionWorkspacePolicy: {
        defaultMode: 'isolated_workspace',
        workspaceStrategy: { type: 'git_worktree', baseRef: 'main' },
      },
    });
    await client.createIssue(ids.company, {
      title: 'Compatible issue',
      description: 'Current issue contract',
      status: 'todo',
      priority: 'high',
      parentId: ids.parent,
      projectId: ids.project,
      goalId: ids.goal,
      labelIds: [ids.label],
      assigneeAgentId: ids.agent,
      executionWorkspaceSettings: { mode: 'isolated_workspace' },
      blockedByIssueIds: [],
    });
    await client.createAgent(ids.company, {
      name: 'Engineer',
      role: 'engineer',
      adapterType: 'codex_local',
      adapterConfig: {},
      desiredSkills: ['company/skill'],
      instructionsBundle: {
        entryFile: 'AGENTS.md',
        files: { 'AGENTS.md': '# Engineer' },
      },
      sourceIssueId: ids.parent,
    });
    await client.createRoutine(ids.company, {
      title: 'Backlog health',
      description: 'Bounded maintenance',
      assigneeAgentId: ids.agent,
      projectId: ids.project,
      priority: 'medium',
      status: 'active',
      concurrencyPolicy: 'skip_if_active',
      catchUpPolicy: 'skip_missed',
    });
    await client.createRoutineTrigger(ids.routine, {
      kind: 'schedule',
      cronExpression: '0 */4 * * *',
      timezone: 'UTC',
    });
    await client.createCompanySkill(ids.company, {
      name: 'CI/CD',
      slug: 'ci-cd',
      description: 'Pipeline skill',
      markdown: '# CI/CD',
      categories: ['delivery'],
    });
    await client.updateCompanySkill(ids.company, ids.skill, {
      description: 'Updated pipeline skill',
      categories: ['delivery'],
    });
    await client.renameCompanySkill(ids.company, ids.skill, { name: 'Delivery CI/CD' });
    await client.updateCompanySkillFile(ids.company, ids.skill, {
      path: 'SKILL.md',
      content: '# Delivery CI/CD',
    });

    const bodyFor = (suffix, method) =>
      requests.find((request) => request.url.endsWith(suffix) && request.method === method)?.body;

    assert.doesNotThrow(() => createCompanySchema.parse(bodyFor('/api/companies', 'POST')));
    assert.doesNotThrow(() =>
      createGoalSchema.parse(bodyFor(`/api/companies/${ids.company}/goals`, 'POST')),
    );
    assert.doesNotThrow(() =>
      createProjectSchema.parse(bodyFor(`/api/companies/${ids.company}/projects`, 'POST')),
    );
    assert.doesNotThrow(() =>
      createIssueSchema.parse(bodyFor(`/api/companies/${ids.company}/issues`, 'POST')),
    );
    assert.doesNotThrow(() =>
      createAgentHireSchema.parse(bodyFor(`/api/companies/${ids.company}/agent-hires`, 'POST')),
    );
    assert.doesNotThrow(() =>
      createRoutineSchema.parse(bodyFor(`/api/companies/${ids.company}/routines`, 'POST')),
    );
    assert.doesNotThrow(() =>
      createRoutineTriggerSchema.parse(bodyFor(`/api/routines/${ids.routine}/triggers`, 'POST')),
    );
    assert.doesNotThrow(() =>
      companySkillCreateSchema.parse(bodyFor(`/api/companies/${ids.company}/skills`, 'POST')),
    );
    assert.doesNotThrow(() =>
      companySkillUpdateSchema.parse(
        bodyFor(`/api/companies/${ids.company}/skills/${ids.skill}`, 'PATCH'),
      ),
    );
    assert.doesNotThrow(() =>
      companySkillRenameSchema.parse(
        bodyFor(`/api/companies/${ids.company}/skills/${ids.skill}/rename`, 'POST'),
      ),
    );
    assert.doesNotThrow(() =>
      companySkillFileUpdateSchema.parse(
        bodyFor(`/api/companies/${ids.company}/skills/${ids.skill}/files`, 'PATCH'),
      ),
    );
  });
});
