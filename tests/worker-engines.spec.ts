import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import manifest from '../src/manifest';
import plugin from '../src/worker';

afterEach(() => vi.unstubAllGlobals());
const response = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

describe('existing agent engine compatibility', () => {
  it.each([undefined, 'auto', 'acp'])(
    'preserves existing CLI unless explicitly changed (%s)',
    async (engine) => {
      const dir = await mkdtemp(join(tmpdir(), 'wizard-engine-'));
      const patches: any[] = [];
      const agents = ['ceo', 'engineer'].map((role) => ({
        id: role,
        role,
        companyId: 'existing',
        status: 'idle',
        adapterType: 'codex_local',
        adapterConfig: { engine: 'cli' },
        metadata: { templateRole: role },
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input, init) => {
          const url = String(input),
            method = init?.method || 'GET';
          const body = init?.body ? JSON.parse(init.body) : {};
          if (url.endsWith('/api/companies')) return response([]);
          if (url.endsWith('/api/companies/existing'))
            return response({ id: 'existing', name: 'Existing' });
          if (url.endsWith('/agents') && method === 'GET') return response(agents);
          if (/\/(projects|skills|routines|plugins)$/.test(url) && method === 'GET')
            return response([]);
          if (/\/api\/agents\/(ceo|engineer)$/.test(url) && method === 'PATCH') patches.push(body);
          return response({ id: 'fixture-id', ...body });
        }),
      );
      try {
        const harness = createTestHarness({
          manifest,
          capabilities: manifest.capabilities,
          config: { companiesDir: dir, paperclipUrl: `http://engine-${engine || 'preserve'}.test` },
        });
        await plugin.definition.setup(harness.ctx);
        await harness.performAction('start-provision', {
          companyName: 'Existing',
          existingCompanyId: 'existing',
          selectedRoles: ['engineer'],
          selectedModules: [],
          ceoAdapter: {
            type: 'codex_local',
            updateExistingAgents: true,
            ...(engine ? { engine } : {}),
          },
        });
        expect(patches).toHaveLength(2);
        for (const patch of patches) expect(patch.adapterConfig.engine).toBe(engine || 'cli');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
