import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
// @ts-ignore plain JS assembler
import { assembleCompany } from '../src/logic/assemble.js';
// @ts-ignore plain JS catalog loader
import { loadModules, loadRoles } from '../src/logic/load-templates.js';

describe('installed skill runtime context', () => {
  it('anchors company references and scopes ongoing instructions for every installed skill', async () => {
    const templatesDir = resolve('templates');
    const outputDir = await mkdtemp(join(tmpdir(), 'skill-runtime-contract-'));
    try {
      const [modules, roles] = await Promise.all([
        loadModules(templatesDir),
        loadRoles(templatesDir),
      ]);
      const result = await assembleCompany({
        companyName: 'Contracts',
        templatesDir,
        outputDir,
        moduleNames: modules.map((m: any) => m.name),
        extraRoleNames: roles.map((r: any) => r.name),
      });
      expect(result.companySkills.length).toBeGreaterThan(0);
      for (const skill of result.companySkills) {
        expect(skill.markdown, skill.slug).toContain('## Runtime scope and document locations');
        expect(skill.markdown, skill.slug).toContain('not permission to scan unrelated queues');
        expect(skill.markdown, skill.slug).toContain('Shared Documentation');
        expect(skill.markdown, skill.slug).toContain(
          'including existence checks for `docs/lean-delivery.md`',
        );
      }
      const pr = result.companySkills.find((s: any) => s.slug === 'pr-workflow');
      expect(pr.markdown).not.toContain('working directory, the company workspace');
      for (const role of result.allRoles) {
        const tools = await readFile(join(result.companyDir, 'agents', role, 'TOOLS.md'), 'utf8');
        expect(tools, role).toContain('Available tools depend');
        expect(tools, role).toContain('Never store credentials');
        expect(tools, role).toContain('do not install or enable');
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('keeps competitive-tracking fallback on the canonical deliverable', async () => {
    const text = await readFile(
      resolve(
        'templates/modules/competitive-intel/agents/product-owner/skills/competitive-tracking.fallback.md',
      ),
      'utf8',
    );
    expect(text).toContain('docs/COMPETITIVE-LANDSCAPE.md');
    expect(text).not.toContain('docs/COMPETITIVE-INTEL.md');
  });
});
