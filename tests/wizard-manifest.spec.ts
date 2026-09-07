import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import manifest from '../src/manifest.js';
import plugin, {
  readWizardManifest,
  saveWizardManifest,
  type WizardManifest,
} from '../src/worker.js';

const previous: WizardManifest = {
  pluginVersion: '0.6.1',
  preset: null,
  modules: ['backlog'],
  roles: ['ceo', 'engineer'],
  generatedFilePaths: { ceo: ['agents/ceo/AGENTS.md'] },
  routineTitles: ['Backlog check'],
  updatedAt: '2026-09-07T12:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('company-scoped wizard manifest persistence', () => {
  it('round trips per company without replacing unrelated plugin state or settings', async () => {
    const config = { templatesPath: '/custom/templates', paperclipUrl: 'http://paperclip.test' };
    const harness = createTestHarness({ manifest, config });
    const unrelatedKey = {
      scopeKind: 'company' as const,
      scopeId: 'company-a',
      stateKey: 'other-feature',
    };
    await harness.ctx.state.set(unrelatedKey, { retained: true });

    expect(await readWizardManifest(harness.ctx.state, 'company-a')).toBeNull();
    await saveWizardManifest(harness.ctx.state, 'company-a', previous);
    await saveWizardManifest(harness.ctx.state, 'company-b', { ...previous, roles: ['ceo'] });

    expect(await readWizardManifest(harness.ctx.state, 'company-a')).toEqual(previous);
    expect((await readWizardManifest(harness.ctx.state, 'company-b'))?.roles).toEqual(['ceo']);
    expect(await harness.ctx.state.get(unrelatedKey)).toEqual({ retained: true });
    expect(await harness.ctx.config.get()).toEqual(config);
  });

  it('treats malformed persisted roles as an unavailable manifest', async () => {
    const harness = createTestHarness({ manifest });
    await harness.ctx.state.set(
      {
        scopeKind: 'company',
        scopeId: 'company-a',
        namespace: 'company-wizard',
        stateKey: 'wizard-manifest',
      },
      { ...previous, roles: 'engineer' },
    );
    expect(await readWizardManifest(harness.ctx.state, 'company-a')).toBeNull();
    await expect(saveWizardManifest(harness.ctx.state, ' ', previous)).rejects.toThrow(
      'Company ID',
    );
  });

  it('surfaces SDK persistence failures to the provisioning warning handler', async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.state, 'set').mockRejectedValueOnce(new Error('state unavailable'));
    await expect(saveWizardManifest(harness.ctx.state, 'company-a', previous)).rejects.toThrow(
      'state unavailable',
    );
  });

  it('uses the saved manifest during preview to distinguish wizard roles from manual additions', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestPath = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        ).pathname;
        requests.push(requestPath);
        expect(init?.method ?? 'GET').toBe('GET');
        const responses: Record<string, unknown> = {
          '/api/companies': [],
          '/api/companies/company-a': { id: 'company-a', name: 'Existing' },
          '/api/companies/company-a/projects': [],
          '/api/companies/company-a/routines': [],
          '/api/instance/settings/experimental': { enableIsolatedWorkspaces: false },
          '/api/companies/company-a/agents': [
            { id: 'ceo-id', role: 'ceo', status: 'idle', metadata: { templateRole: 'ceo' } },
            {
              id: 'eng-id',
              role: 'engineer',
              status: 'idle',
              metadata: { templateRole: 'engineer' },
            },
            {
              id: 'manual-id',
              role: 'designer',
              status: 'idle',
              metadata: { templateRole: 'designer' },
            },
          ],
        };
        if (!(requestPath in responses)) throw new Error(`Unexpected request: ${requestPath}`);
        return new Response(JSON.stringify(responses[requestPath]), { status: 200 });
      }),
    );
    const harness = createTestHarness({
      manifest,
      config: {
        templatesPath: path.resolve('templates'),
        paperclipUrl: 'http://manifest-preview.test',
      },
    });
    await saveWizardManifest(harness.ctx.state, 'company-a', previous);
    await plugin.definition.setup(harness.ctx);
    const result = await harness.performAction<{
      error?: string;
      diff: { existingManifest: WizardManifest; agents: Array<{ role: string; action: string }> };
    }>('preview-company-update', {
      existingCompanyId: 'company-a',
      companyName: 'Existing',
      allRoles: ['ceo'],
    });

    expect(result.error).toBeUndefined();
    expect(result.diff.existingManifest).toEqual(previous);
    expect(
      result.diff.agents.filter((agent) => agent.action === 'retire').map((agent) => agent.role),
    ).toEqual(['engineer']);
    expect(requests.some((request) => request.includes('/api/plugins'))).toBe(false);
  });
});
