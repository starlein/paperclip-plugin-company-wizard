import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import plugin from '../src/worker';
import manifest from '../src/manifest';
import { updateAgentSchema } from '@paperclipai/shared';

afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('existing-company provisioning resilience and operator settings', () => {
  it.each([
    { failure: 'none', apply: false },
    { failure: 'create-conflict', apply: false },
    { failure: 'update-denied', apply: false },
    { failure: 'inventory-unavailable', apply: false },
    { failure: 'create-conflict', apply: true },
    { failure: 'none', apply: true },
    { failure: 'assignment-denied', apply: false },
  ])(
    'completes provisioning after $failure, applies agent settings only with opt-in ($apply)',
    async ({ failure, apply }) => {
      const dir = await mkdtemp(join(tmpdir(), 'existing-company-resilience-'));
      const agents = ['ceo', 'engineer'].map((role) => ({
        id: role,
        role,
        status: 'idle',
        companyId: 'existing',
        metadata: { templateRole: role },
        adapterType: 'codex_local',
        adapterConfig: {
          model: 'operator-selected',
          modelReasoningEffort: 'high',
          thinkingLevel: 'high',
          reasoningEffort: 'high',
          effort: 'high',
          env: { OPERATOR_SETTING: 'keep' },
          engine: 'cli',
          paperclipSkillSync: {
            custom: 'keep',
            desiredSkills: [
              'company/existing/operator-skill',
              { key: 'company/existing/backlog-health', versionId: 'pinned-version' },
            ],
          },
        },
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 777 } },
      }));
      const patches: any[] = [];
      const issues: any[] = [];
      const bundles: string[] = [];
      const skillCreates: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input, init) => {
          const url = String(input),
            method = init?.method ?? 'GET';
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          if (url.endsWith('/api/companies')) return json([]);
          if (url.endsWith('/api/companies/existing'))
            return json({ id: 'existing', name: 'Existing' });
          if (url.endsWith('/settings/experimental'))
            return json({ enableIsolatedWorkspaces: false });
          if (url.endsWith('/agents') && method === 'GET') return json(agents);
          if (url.endsWith('/skills') && method === 'GET') {
            if (failure === 'inventory-unavailable') return json({ error: 'unavailable' }, 503);
            return json(
              failure === 'update-denied'
                ? [
                    {
                      id: 'backlog-skill',
                      companyId: 'existing',
                      key: 'company/existing/backlog-health',
                      slug: 'backlog-health',
                      name: 'backlog-health',
                      sourceType: 'local_path',
                      editable: true,
                    },
                  ]
                : [],
            );
          }
          if (url.endsWith('/skills') && method === 'POST') {
            skillCreates.push(body.slug);
            if (body.slug === 'backlog-health' && failure === 'create-conflict')
              return json(
                { error: 'A company skill with slug "backlog-health" already exists.' },
                409,
              );
            return json(
              { id: `skill-${body.slug}`, key: `company/existing/${body.slug}`, slug: body.slug },
              201,
            );
          }
          if (url.includes('/skills/backlog-skill/files')) return json({ error: 'denied' }, 403);
          if (/\/(projects|routines|plugins)$/.test(url) && method === 'GET') return json([]);
          if (/\/api\/agents\/(ceo|engineer)\/skills\/sync$/.test(url)) {
            if (failure === 'assignment-denied') return json({ error: 'denied' }, 403);
            expect(body.mode).toBe('add');
            const agent = agents.find((a) => url.includes(`/agents/${a.id}/`))!;
            const current = agent.adapterConfig.paperclipSkillSync.desiredSkills;
            const byKey = new Map(
              current.map((ref) => [typeof ref === 'string' ? ref : ref.key, ref]),
            );
            // Host add mode overwrites a same-key pin: send only missing keys.
            for (const ref of body.desiredSkills)
              byKey.set(typeof ref === 'string' ? ref : ref.key, ref);
            agent.adapterConfig.paperclipSkillSync.desiredSkills = [...byKey.values()];
            return json({ warnings: [] });
          }
          if (/\/api\/agents\/(ceo|engineer)$/.test(url) && method === 'PATCH') {
            patches.push({ id: url.split('/').pop(), body });
            const agent = agents.find((a) => a.id === url.split('/').pop())!;
            // Host validator strips unknown desiredSkills; same-adapter PATCH
            // shallow-merges adapterConfig (routes/agents.ts:5250-5269).
            const parsed: any = updateAgentSchema.parse(body);
            if (parsed.adapterConfig)
              parsed.adapterConfig = { ...agent.adapterConfig, ...parsed.adapterConfig };
            Object.assign(agent, parsed);
            return json(agent);
          }
          if (url.endsWith('/instructions-bundle')) bundles.push(url);
          if (url.endsWith('/issues') && method === 'POST') {
            issues.push(body);
            return json({ id: `issue-${issues.length}` });
          }
          return json({ id: 'fixture-id', ...body });
        }),
      );
      try {
        const harness = createTestHarness({
          manifest,
          capabilities: manifest.capabilities,
          config: { companiesDir: dir, paperclipUrl: `http://${failure}.test` },
        });
        await plugin.definition.setup(harness.ctx);
        const result: any = await harness.performAction('start-provision', {
          companyName: 'Existing',
          existingCompanyId: 'existing',
          selectedRoles: ['engineer'],
          selectedModules: ['backlog', 'auto-assign'],
          ceoAdapter: {
            type: 'codex_local',
            model: '',
            thinkingLevel: 'auto',
            ...(apply ? { updateExistingAgents: true } : {}),
          },
        });
        expect(result.error).toBeUndefined();
        if (failure === 'none') expect(result.warnings).toEqual([]);
        else expect(result.warnings?.length).toBeGreaterThan(0);
        expect(result.bootstrapIssueId).toBeTruthy();
        expect(issues.some((issue) => issue.title.startsWith('Bootstrap '))).toBe(true);
        expect(bundles).toHaveLength(2);
        expect(patches).toHaveLength(2);
        for (const { body } of patches) {
          if (apply) {
            expect(body.adapterType).toBe('codex_local');
            expect(body.adapterConfig.model).toBeNull();
            expect(body).toHaveProperty('runtimeConfig');
          } else {
            expect(body).not.toHaveProperty('adapterType');

            expect(body).not.toHaveProperty('runtimeConfig');
          }
          expect(body).not.toHaveProperty('desiredSkills');
        }
        for (const agent of agents) {
          expect(agent.adapterConfig.model).toBe(apply ? null : 'operator-selected');
          expect(agent.adapterConfig.modelReasoningEffort).toBe(apply ? null : 'high');
          expect(agent.adapterConfig.thinkingLevel).toBe(apply ? null : 'high');
          expect(agent.adapterConfig.reasoningEffort).toBe(apply ? null : 'high');
          expect(agent.adapterConfig.effort).toBe(apply ? null : 'high');
          expect(agent.adapterConfig.engine).toBe('cli');
          expect(agent.adapterConfig.env).toEqual({ OPERATOR_SETTING: 'keep' });
          expect(agent.adapterConfig.paperclipSkillSync.custom).toBe('keep');
          const skills = agent.adapterConfig.paperclipSkillSync.desiredSkills;
          expect(skills).toContain('company/existing/operator-skill');
          expect(
            skills.filter(
              (ref) =>
                (typeof ref === 'string' ? ref : ref.key) === 'company/existing/backlog-health',
            ),
          ).toEqual([{ key: 'company/existing/backlog-health', versionId: 'pinned-version' }]);
          if (failure === 'none' && agent.id === 'ceo')
            expect(skills).toContain('company/existing/auto-assign');
          if (!apply)
            expect(agent.runtimeConfig).toEqual({ heartbeat: { enabled: true, intervalSec: 777 } });
        }
        if (failure !== 'inventory-unavailable') expect(skillCreates).toContain('auto-assign');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
