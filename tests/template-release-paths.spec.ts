import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore — real plain-JS assembly, not a mocked skill resolver
import { assembleCompany } from '../src/logic/assemble.js';

const templatesDir = fileURLToPath(new URL('../templates', import.meta.url));
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function assemble(roles: string[], modules = ['github-repo', 'release-management']) {
  const outputDir = await mkdtemp(join(tmpdir(), 'release-paths-'));
  dirs.push(outputDir);
  return assembleCompany({
    companyName: 'ReleasePaths',
    extraRoleNames: roles,
    moduleNames: modules,
    outputDir,
    templatesDir,
  });
}
function assigned(result: any, role: string, prefix: string) {
  const slugs = result.roleSkillSlugs.get(role) ?? [];
  const skill = result.companySkills.find(
    (s: any) => slugs.includes(s.slug) && s.slug.startsWith(prefix),
  );
  expect(skill, `${role} must actually receive ${prefix}`).toBeDefined();
  return skill.markdown as string;
}

describe('assembled release and workspace safety', () => {
  it('uses generated company references but writes project deliverables in the execution workspace', async () => {
    // Engineer-primary selects the shared variants under audit, not DevOps overrides.
    const result = await assemble(['engineer'], ['github-repo', 'ci-cd', 'monitoring']);
    const agents = await readFile(
      join(result.companyDir, 'agents', 'engineer', 'AGENTS.md'),
      'utf8',
    );
    expect(agents).toContain('Shared Documentation');
    expect(agents).toContain('git-workflow.md');
    for (const [role, name] of [
      ['engineer', 'git-workflow'],
      ['engineer', 'ci-cd'],
      ['engineer', 'monitoring'],
    ]) {
      const skill = assigned(result, role, name);
      expect(skill).toContain('Shared Documentation');
      expect(skill).toContain('actual project/execution workspace');
      expect(skill).not.toContain('your working directory, the company workspace');
      expect(skill).toContain('Do not copy company docs');
      if (name !== 'git-workflow') {
        expect(skill).toContain('if it exists');
        expect(skill).toContain('create it');
        expect(skill).toContain('not a shipped company reference');
      }
    }
  });

  it.each([['engineer'], ['devops', 'engineer']])(
    'preserves authorized specialist execution for %j',
    async (...roles: string[]) => {
      const result = await assemble(roles);
      const owner = roles.includes('devops') ? 'devops' : 'engineer';
      const skill = assigned(result, owner, 'release-process');
      expect(skill).toContain('Execute authorized releases');
      for (const phrase of [
        'repoRef',
        'defaultRef',
        'baseRef',
        'Preserve the managed issue branch',
        'verified merged commit',
        'documented authorization',
        'registry',
        'artifact',
        'refs/tags/<tag>:refs/tags/<tag>',
        'Shared Documentation',
      ])
        expect(skill).toContain(phrase);
      expect(skill).not.toMatch(
        /git push origin main|git push[^\n]*--tags|git tag vX\.Y\.Z`|last-tag>\.\.HEAD/,
      );
      const fallback = assigned(result, 'ceo', 'release-process-fallback');
      expect(fallback).toContain('specialist primary');
      expect(fallback).toContain('Do not execute releases');
      expect(fallback).toContain('present, eligible owner');
      expect(fallback).toContain('CEO-owned follow-up');
      expect(fallback).not.toContain('capability:ci-cd');
      expect(fallback).not.toContain('neither a devops agent nor an engineer');
      const routine = result.initialRoutines.find(
        (r: any) => r.title === 'Release readiness check',
      );
      expect(routine.description).toContain('documented authorization');
    },
  );

  it('installs a bounded CEO primary rather than the shared release executor', async () => {
    const result = await assemble([]);
    expect([...result.allRoles]).toEqual(['ceo']);
    const skill = assigned(result, 'ceo', 'release-process');
    expect(skill).toContain('CEO Primary');
    expect(skill).toContain('Do not execute releases');
    expect(skill).toContain('CEO-owned follow-up');
    expect(skill).toContain('governed hiring');
    expect(skill).toContain('present, eligible owner');
    expect(skill).not.toContain('git tag');
    expect(skill).not.toContain('capability:ci-cd');
    expect(
      result.initialIssues.find((i: any) => i.title === 'Document or establish release process')
        .assignTo,
    ).toBe('ceo');
  });
});
