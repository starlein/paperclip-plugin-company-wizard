import { mkdtemp, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-ignore — plain JS logic modules
import { assembleCompany } from '../src/logic/assemble.js';
// @ts-ignore — plain JS logic modules
import {
  loadPresets,
  loadModules,
  loadRoles,
  resolveEffectiveModules,
  collectGoals,
  collectPresetBootstrapData,
} from '../src/logic/load-templates.js';
// @ts-ignore — plain JS logic modules
import { resolveCapabilities, skillSlug } from '../src/logic/resolve.js';

const templatesDir = resolve('templates');
const [presets, modules, roles] = await Promise.all([
  loadPresets(templatesDir),
  loadModules(templatesDir),
  loadRoles(templatesDir),
]);
const allRoleNames = roles.map((role: any) => role.name);
type Scenario = {
  name: string;
  preset?: any;
  roleNames: string[];
  moduleNames: string[];
  isolated: boolean;
};
const scenarios: Scenario[] = [];
for (const preset of presets)
  for (const isolated of [false, true]) {
    scenarios.push({
      name: `preset ${preset.name}, isolation=${isolated}`,
      preset,
      roleNames: preset.roles ?? [],
      moduleNames: resolveEffectiveModules(preset, modules, []),
      isolated,
    });
  }
for (const module of modules)
  for (const full of [false, true]) {
    scenarios.push({
      name: `module ${module.name}, ${full ? 'all roles' : 'CEO only'}`,
      roleNames: full ? allRoleNames : [],
      moduleNames: resolveEffectiveModules(null, modules, [module.name]),
      isolated: false,
    });
  }
for (const roleName of allRoleNames) {
  scenarios.push({
    name: `role ${roleName}`,
    roleNames: [roleName],
    moduleNames: [],
    isolated: false,
  });
}
for (const full of [false, true]) {
  scenarios.push({
    name: `all modules, ${full ? 'all roles' : 'CEO only'}`,
    roleNames: full ? allRoleNames : [],
    moduleNames: modules.map((m: any) => m.name),
    isolated: true,
  });
}

describe('complete shipped template assembly matrix', () => {
  it.each(scenarios)(
    '$name resolves every active capability, assignment, skill and reference',
    async (scenario) => {
      const outputDir = await mkdtemp(join(tmpdir(), 'wizard-matrix-'));
      try {
        const seed = collectPresetBootstrapData(scenario.preset);
        const result = await assembleCompany({
          companyName: 'Matrix',
          templatesDir,
          outputDir,
          moduleNames: scenario.moduleNames,
          extraRoleNames: scenario.roleNames,
          enableIsolatedWorktrees: scenario.isolated,
          inlineGoals: collectGoals(scenario.preset, modules, new Set(scenario.moduleNames)),
          presetIssues: seed.issues,
          presetRoutines: seed.routines,
          presetLabels: seed.labels,
        });
        const active = modules.filter(
          (m: any) =>
            scenario.moduleNames.includes(m.name) &&
            (!m.activatesWithRoles?.length ||
              m.activatesWithRoles.some((r: string) => result.allRoles.has(r))),
        );
        const resolved = resolveCapabilities(
          active,
          active.map((m: any) => m.name),
          result.allRoles,
        );
        const missing = active.flatMap((m: any) =>
          (m.capabilities ?? [])
            .filter((cap: any) => !cap.owners.some((r: string) => result.allRoles.has(r)))
            .map((cap: any) => `${m.name}/${cap.skill}`),
        );
        expect(missing, 'Every active capability needs a present owner').toEqual([]);
        const skills = new Set(result.companySkills.map((skill: any) => skill.slug));
        expect(skills.size).toBe(result.companySkills.length);
        for (const cap of resolved) {
          const ownerSkills = result.roleSkillSlugs.get(cap.primary) ?? [];
          expect(
            ownerSkills.some(
              (slug: string) => slug === cap.skill || slug.startsWith(`${cap.skill}-`),
            ),
            `${cap.primary} needs primary ${cap.skill}`,
          ).toBe(true);
          const meta = active
            .find((m: any) => m.name === cap.module)
            .capabilities.find((c: any) => c.skill === cap.skill);
          if (meta.fallbackSkill)
            for (const fallback of cap.fallbacks) {
              const slug = skillSlug(cap.skill, 'fallback');
              expect(
                (result.roleSkillSlugs.get(fallback) ?? []).some(
                  (s: string) => s === slug || s.startsWith(`${slug}-`),
                ),
                `${fallback} needs fallback ${cap.skill}`,
              ).toBe(true);
            }
        }
        for (const issue of result.initialIssues) {
          // Intentionally unassigned backlog entries are valid, unresolved selectors are not.
          if (issue.assignTo)
            expect(
              issue.assignTo === 'user' || result.allRoles.has(issue.assignTo),
              `${issue.title}: ${issue.assignTo}`,
            ).toBe(true);
        }
        for (const routine of result.initialRoutines)
          expect(
            result.allRoles.has(routine.assignTo),
            `${routine.title}: ${routine.assignTo}`,
          ).toBe(true);
        for (const role of result.allRoles) {
          for (const file of ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md'])
            expect(
              (await readFile(join(result.companyDir, 'agents', role, file), 'utf8')).trim(),
            ).not.toBe('');
          const agents = await readFile(
            join(result.companyDir, 'agents', role, 'AGENTS.md'),
            'utf8',
          );
          for (const ref of agents.matchAll(/^Read: `([^`]+)`/gm))
            await access(resolve(result.companyDir, 'agents', role, ref[1]));
          for (const slug of result.roleSkillSlugs.get(role) ?? [])
            expect(skills.has(slug)).toBe(true);
        }
        const files = await readdir(result.companyDir, { recursive: true });
        expect(
          files.some((file) => /(?:LENSES|DONE)\.md$|\.bar\.md$|\.meta\.json$/.test(file)),
        ).toBe(false);
        const bootstrap = await readFile(join(result.companyDir, 'BOOTSTRAP.md'), 'utf8');
        expect(bootstrap).not.toMatch(/assigneeAgentId[^\n]*capability:/);
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
  );
});
