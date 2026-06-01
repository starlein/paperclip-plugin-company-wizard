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
  it('forwards CEO metadata fields accepted by Paperclip instead of dropping them', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, opts, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'agent-1' });
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
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://paperclip.test/api/companies/company-1/agents');
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
    });
  });

  it('uses the same full payload when falling back to the board-approval hire endpoint', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      requests.push({ url, opts, body });
      if (url.endsWith('/agents')) {
        return new Response('Direct agent creation requires board approval', { status: 409 });
      }
      if (url.endsWith('/agent-hires')) {
        return jsonResponse({
          agent: { id: 'agent-1' },
          approval: { id: 'approval-1' },
        });
      }
      if (url.endsWith('/api/approvals/approval-1/approve')) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/api/agents/agent-1')) {
        return jsonResponse({ id: 'agent-1', status: 'idle' });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createAgent('company-1', {
      name: 'CEO',
      role: 'ceo',
      capabilities: 'Owns company strategy.',
      metadata: { description: 'Owns company strategy.' },
      adapterType: 'codex_local',
      adapterConfig: { model: 'gpt-5.5', modelReasoningEffort: 'high' },
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 3600, maxConcurrentRuns: 1 } },
      permissions: { canCreateAgents: true },
    });

    const hireRequest = requests.find((request) => request.url.endsWith('/agent-hires'));
    assert.ok(hireRequest);
    assert.equal(hireRequest.body.capabilities, 'Owns company strategy.');
    assert.deepEqual(hireRequest.body.metadata, { description: 'Owns company strategy.' });
    assert.equal(hireRequest.body.adapterConfig.model, 'gpt-5.5');
    assert.equal(hireRequest.body.adapterConfig.modelReasoningEffort, 'high');
    assert.equal(hireRequest.body.runtimeConfig.heartbeat.maxConcurrentRuns, 1);
  });

  it('defaults direct agent creation to codex_local instead of a Claude adapter', async () => {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return jsonResponse({ id: 'agent-1' });
    };

    const client = new PaperclipClient('http://paperclip.test');
    await client.createAgent('company-1', {
      name: 'Engineer',
      role: 'engineer',
    });

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
    });

    assert.deepEqual(requests[0].body.workspace, {
      sourceType: 'local_path',
      cwd: '/paperclip/instances/default/companies/Dialer/projects/Dialer',
      isPrimary: true,
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
});
