import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
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
      defaultMode: 'isolated_workspace',
      workspaceStrategy: { type: 'git_worktree', baseRef: 'release/2026-q2' },
    });
  });

  it('forwards issue parent and label fields so bootstrap-created subissues stay scoped', async () => {
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
      status: 'todo',
    });

    assert.equal(requests[0].body.parentId, 'parent-1');
    assert.equal(requests[0].body.projectId, 'project-1');
    assert.deepEqual(requests[0].body.labelIds, ['label-1']);
    assert.equal(requests[0].body.status, 'todo');
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
