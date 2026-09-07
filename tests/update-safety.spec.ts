import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import { updateProjectSchema } from '@paperclipai/shared';
import manifest from '../src/manifest.js';
import plugin, { ensureTemplatesDir, provisionCompanySkills } from '../src/worker.js';

afterEach(() => vi.unstubAllGlobals());
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('existing company project updates', () => {
  it('patches every live policy before hires and preserves operator settings with isolation off', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wizard-project-update-'));
    const requests: Array<{ url: string; method: string; body: any }> = [];
    const policy = {
      enabled: false,
      defaultMode: 'isolated_workspace',
      allowIssueOverride: false,
      sharedWorkspaceConcurrency: 'allow',
      environmentId: 'db687eaf-1b3c-4c87-80f4-257153759f4c',
      workspaceStrategy: {
        type: 'git_worktree',
        baseRef: 'develop',
        provisionCommand: 'pnpm install',
      },
      cleanupPolicy: { operatorOwned: true },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input),
          method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        requests.push({ url, method, body });
        if (url.endsWith('/api/companies')) return response([]);
        if (url.endsWith('/api/instance/settings/experimental'))
          return response({ enableIsolatedWorkspaces: false });
        if (url.endsWith('/api/companies/existing/projects'))
          return response([
            {
              id: 'one',
              companyId: 'existing',
              name: 'One',
              executionWorkspacePolicy: policy,
              primaryWorkspace: {
                id: 'w1',
                sourceType: 'git_repo',
                cwd: '/operator/repo',
                repoUrl: 'https://example.com/app.git',
              },
            },
            { id: 'two', companyId: 'existing', name: 'Two', executionWorkspacePolicy: null },
          ]);
        if (url.endsWith('/api/companies/existing'))
          return response({ id: 'existing', name: 'Existing' });
        if (method === 'PATCH' && url.includes('/api/projects/')) {
          updateProjectSchema.parse(body);
          return response({ id: url.split('/').pop(), ...body });
        }
        return response({ error: 'stop after project updates' }, 500);
      }),
    );
    try {
      const harness = createTestHarness({
        manifest,
        capabilities: manifest.capabilities,
        config: {
          companiesDir: dir,
          templatesPath: resolve('templates'),
          paperclipUrl: 'http://project-update.test',
        },
      });
      await plugin.definition.setup(harness.ctx);
      const result = (await harness.performAction('start-provision', {
        companyName: 'Existing',
        existingCompanyId: 'existing',
        selectedModules: [],
        selectedRoles: [],
      })) as any;
      expect(result.error).toContain('stop after project updates');
      const patches = requests.filter(
        (r) => r.method === 'PATCH' && r.url.includes('/api/projects/'),
      );
      expect(patches).toEqual([
        {
          url: 'http://project-update.test/api/projects/one',
          method: 'PATCH',
          body: { executionWorkspacePolicy: policy },
        },
        {
          url: 'http://project-update.test/api/projects/two',
          method: 'PATCH',
          body: {
            executionWorkspacePolicy: {
              enabled: true,
              defaultMode: 'shared_workspace',
              sharedWorkspaceConcurrency: 'serialize',
            },
          },
        },
      ]);
      expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
      expect(result.logs.join('\n')).toContain('not enforced');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('company skill ownership', () => {
  const skill = { slug: 'review', name: 'Review', markdown: '# Review' };
  it.each([false, true])(
    'does not select catalog collisions regardless of order (%s)',
    async (reverse) => {
      const managed = {
        ...skill,
        id: 'managed',
        key: 'company/c1/review',
        metadata: { sourceKind: 'managed_local' },
        editable: true,
      };
      const foreign = {
        ...skill,
        id: 'foreign',
        key: 'catalog/review',
        metadata: { sourceKind: 'catalog' },
        editable: false,
      };
      const client = {
        listCompanySkills: async () => (reverse ? [foreign, managed] : [managed, foreign]),
      };
      const keys = await provisionCompanySkills(client, 'c1', [skill], () => {});
      expect(keys.get('review')).toBe('company/c1/review');
    },
  );
  it('creates a company-owned skill instead of overwriting a matching imported skill', async () => {
    const createCompanySkill = vi.fn(async () => ({ key: 'company/c1/review' }));
    const client = {
      listCompanySkills: async () => [{ ...skill, id: 'foreign', key: 'catalog/review' }],
      createCompanySkill,
    };
    await provisionCompanySkills(client, 'c1', [skill], () => {});
    expect(createCompanySkill).toHaveBeenCalledOnce();
  });
  it('fails closed when skills cannot be listed', async () => {
    const client = {
      listCompanySkills: async () => {
        throw new Error('denied');
      },
      createCompanySkill: vi.fn(),
    };
    await expect(provisionCompanySkills(client, 'c1', [skill], () => {})).rejects.toThrow('denied');
    expect(client.createCompanySkill).not.toHaveBeenCalled();
  });
});

describe('release template source', () => {
  it('uses bundled templates for the official default, never a shared moving-main cache', async () => {
    expect(await ensureTemplatesDir({})).toBe(resolve('templates'));
    expect(
      await ensureTemplatesDir({
        templatesRepoUrl:
          'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates',
      }),
    ).toBe(resolve('templates'));
  });
  it('never creates or replaces a missing operator-managed path', async () => {
    await expect(
      ensureTemplatesDir({ templatesPath: join(tmpdir(), 'wizard-nonexistent-operator-path-061') }),
    ).rejects.toThrow('does not exist');
  });
});
