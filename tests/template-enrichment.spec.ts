import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-ignore production JS assembler
import { assembleCompany } from '../src/logic/assemble.js';
// @ts-ignore production template loader
import { loadModules, loadRoles } from '../src/logic/load-templates.js';
// @ts-ignore production capability resolver
import { resolveCapabilities } from '../src/logic/resolve.js';

const templatesDir = resolve('templates');
const modules = await loadModules(templatesDir);
const roles = (await loadRoles(templatesDir)).map((r: any) => r.name);
const doneRoles = [
  'code-reviewer',
  'devops',
  'engineer',
  'product-owner',
  'qa',
  'security-engineer',
  'ui-designer',
  'ux-researcher',
];
let outputDir: string;
let full: any;
const count = (text: string, fragment: string) => text.split(fragment).length - 1;
async function assemble(extraRoleNames: string[], enableEnrichedPersonas = true) {
  return assembleCompany({
    companyName: 'Enrichment',
    templatesDir,
    outputDir,
    moduleNames: modules.map((m: any) => m.name),
    extraRoleNames,
    enableEnrichedPersonas,
  });
}
beforeAll(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'enrichment-contract-'));
  full = await assemble(roles);
});
afterAll(async () => {
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
});
async function done(role: string) {
  const text = await readFile(join(full.companyDir, 'agents', role, 'HEARTBEAT.md'), 'utf8');
  const section = text.slice(text.indexOf('## Done criteria'));
  expect(text).toContain('## Done criteria');
  return section;
}

async function primary(result: any, moduleName: string, skillName: string) {
  const cap = resolveCapabilities(modules, [moduleName], result.allRoles).find(
    (c: any) => c.skill === skillName,
  );
  expect(cap, `${moduleName}/${skillName} has a real primary`).toBeDefined();
  const assigned = result.roleSkillSlugs.get(cap.primary) ?? [];
  const skill = result.companySkills.find(
    (s: any) =>
      assigned.includes(s.slug) &&
      s.categories.includes(moduleName) &&
      s.description.endsWith('primary skill') &&
      (s.slug === skillName || s.slug.startsWith(`${skillName}-`)),
  );
  expect(skill).toBeDefined();
  return skill.markdown as string;
}

describe('assembled review bars are achievable and safe', () => {
  it('CEO primary owns a bounded architecture, not an absent-engineer placeholder', async () => {
    const minimal = await assemble([]);
    const text = await primary(minimal, 'architecture-plan', 'architecture-plan');
    expect(text).not.toMatch(
      /CEO Fallback|pending engineer review|assigned to an engineer or the architecture-plan capability/,
    );
    expect(text).toMatch(/CEO primary/i);
    expect(text).toMatch(/bounded.*(?:plan|scope)/i);
    expect(text).toMatch(/actual.*present.*owner/i);
    expect(text).toMatch(/governed.*(?:hiring|input)/i);
    for (const concept of [/API boundaries/i, /deployment/i, /decisions/i, /data flow/i])
      expect(text).toMatch(concept);
  });
  it('competitive tracking accepts evidenced no-change without document churn', async () => {
    const text = await primary(full, 'competitive-intel', 'competitive-tracking');
    expect(text).toContain('docs/COMPETITIVE-LANDSCAPE.md');
    expect(text).not.toContain('COMPETITIVE-INTEL.md');
    expect(text).toMatch(/no-change.*dated.*evidence/i);
    expect(text).not.toMatch(/not updated this run|Each competitor profile was updated/);
  });
  it('backlog project links exempt API-only control work', async () => {
    const text = await primary(full, 'backlog', 'backlog-health');
    expect(text).toMatch(/API-only.*(?:coordination|control).*project-detached/i);
    expect(text).toMatch(/projectId: null.*(?:valid|allowed)|(?:valid|allowed).*projectId: null/i);
    expect(text).not.toMatch(/never a top-level issue with|no label, or no project link/);
    expect(text).toContain('inheritExecutionWorkspaceFromIssueId');
  });
  it.each(['engineer', 'devops'])(
    'CI timing for %s primary is a target with a justified budget',
    async (role) => {
      const result = await assemble([role]);
      const cap = resolveCapabilities(modules, ['ci-cd'], result.allRoles).find(
        (c: any) => c.skill === 'ci-cd',
      );
      expect(cap.primary).toBe(role);
      const text = await primary(result, 'ci-cd', 'ci-cd');
      expect(text).not.toMatch(/Keep pipelines under 5 minutes\./i);
      expect(text).toMatch(/5 minutes.*target|target.*5 minutes/i);
      expect(text).toMatch(/justified.*(?:baseline|budget)/i);
      expect(text).toMatch(/not.*(?:universal|completion).*blocker/i);
    },
  );
  it('documentation verifies safely and persists required verification waits', async () => {
    const text = await primary(full, 'documentation', 'project-docs');
    expect(text).toMatch(/safe.*disposable environment/i);
    expect(text).toMatch(/(?:never|do not).*destructive.*production.*approval/i);
    expect(text).toContain('blockedByIssueIds');
    expect(text).toMatch(/pending.*interaction.*in_review/i);
    expect(text).not.toMatch(/every command.*has been run at least once/i);
  });
  // Protected SOUL.md edit was explicitly denied; keep this acceptance criterion pending.
  it.skip('UX research reports context and sample limitations (protected SOUL write denied)', async () => {
    const text = await readFile(join(full.companyDir, 'agents/ux-researcher/SOUL.md'), 'utf8');
    expect(text).not.toMatch(/5-user test reveals 85%/);
    expect(text).toMatch(/sample size/i);
    expect(text).toMatch(/limitations/i);
    expect(text).toMatch(/population.*task|task.*population/i);
  });
});

describe('enrichment installation contract', () => {
  it('installs all 18 bars exactly once on actual primary skills, never as standalone artifacts', async () => {
    const barFiles = (await readdir(join(templatesDir, 'modules'), { recursive: true })).filter(
      (p) => p.endsWith('.bar.md'),
    );
    expect(barFiles).toHaveLength(18);
    const reached = new Set<string>();
    // All roles exercise specialist overrides; CEO-only exercises the CEO primary.
    for (const result of [full, await assemble([])]) {
      for (const cap of resolveCapabilities(
        modules,
        modules.map((m: any) => m.name),
        result.allRoles,
      )) {
        const mod = modules.find((m: any) => m.name === cap.module);
        if (
          mod.activatesWithRoles?.length &&
          !mod.activatesWithRoles.some((r: string) => result.allRoles.has(r))
        )
          continue;
        const candidates = [
          `${cap.module}/agents/${cap.primary}/skills/${cap.skill}.bar.md`,
          `${cap.module}/skills/${cap.skill}.bar.md`,
        ];
        const barPath = candidates.find((p) => barFiles.includes(p));
        if (!barPath) continue;
        const fragment = (await readFile(join(templatesDir, 'modules', barPath), 'utf8')).trim();
        expect(count(await primary(result, cap.module, cap.skill), fragment), barPath).toBe(1);
        for (const fallback of cap.fallbacks) {
          for (const slug of result.roleSkillSlugs.get(fallback) ?? []) {
            const skill = result.companySkills.find((s: any) => s.slug === slug);
            if (skill.description.endsWith('fallback skill'))
              expect(skill.markdown).not.toContain(fragment);
          }
        }
        reached.add(barPath);
      }
      expect(
        (await readdir(result.companyDir, { recursive: true })).filter((p) =>
          /(?:DONE|LENSES)\.md$|\.bar\.md$/.test(p),
        ),
      ).toEqual([]);
      expect(result.companySkills.some((s: any) => /\.bar|^(?:DONE|LENSES)$/i.test(s.slug))).toBe(
        false,
      );
    }
    expect([...reached].sort()).toEqual([...barFiles].sort());
  });
  it('emits all 8 DONE and 6 LENSES once, and omits enrichment when disabled', async () => {
    const plain = await assemble(roles, false);
    const found: Record<string, number> = { DONE: 0, LENSES: 0 };
    for (const role of roles) {
      const files = await readdir(join(templatesDir, 'roles', role));
      for (const [kind, target] of [
        ['DONE', 'HEARTBEAT.md'],
        ['LENSES', 'SOUL.md'],
      ]) {
        if (!files.includes(`${kind}.md`)) continue;
        found[kind]++;
        const fragment = (
          await readFile(join(templatesDir, 'roles', role, `${kind}.md`), 'utf8')
        ).trim();
        const enriched = await readFile(join(full.companyDir, 'agents', role, target), 'utf8');
        expect(count(enriched, fragment), `${role}/${kind}`).toBe(1);
        expect(
          await readFile(join(plain.companyDir, 'agents', role, target), 'utf8'),
        ).not.toContain(fragment);
      }
    }
    expect(found).toEqual({ DONE: 8, LENSES: 6 });
    const bars = (await readdir(join(templatesDir, 'modules'), { recursive: true })).filter((p) =>
      p.endsWith('.bar.md'),
    );
    for (const path of bars) {
      const fragment = (await readFile(join(templatesDir, 'modules', path), 'utf8')).trim();
      for (const skill of plain.companySkills) expect(skill.markdown).not.toContain(fragment);
    }
  });
});

describe('assembled completion governance', () => {
  it.each(doneRoles)(
    '%s respects gates, durable waits and unchanged-blocker dedup',
    async (role) => {
      const text = await done(role);
      expect(text).toMatch(/executionPolicy/);
      expect(text).toMatch(/currentParticipant/);
      expect(text).toMatch(/native.*(?:decision|verdict)/i);
      expect(text).toMatch(/(?:do not|never).*done.*(?:handoff|gate)/i);
      expect(text).toMatch(/read back.*(?:stage|state)/i);
      expect(text).toMatch(/unchanged.*blocked|blocked.*unchanged/i);
      expect(text).toMatch(/(?:do not|no).*checkout.*(?:re-comment|repeat)/i);
      expect(text).toContain('blockedByIssueIds');
      expect(text).toContain('unblockDescriptor');
      expect(text).toMatch(/own.*agentId/);
      expect(text).toMatch(/(?:saved|persisted).*pending.*interaction.*in_review/i);
      expect(text).toMatch(/(?:missing|ambiguous).*acceptance criteria.*clarif/i);
      expect(text).not.toMatch(/Reassign deliberately|must always update|pick a sensible one/);
    },
  );
});
