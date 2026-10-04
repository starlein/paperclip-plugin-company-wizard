import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// @ts-ignore plain JS production assembler
import { assembleCompany } from '../src/logic/assemble.js';

const templatesDir = fileURLToPath(new URL('../templates', import.meta.url));
let outputDir: string;
let companyDir: string;
let roles: string[];
let companySkills: any[];
const read = async (path: string) =>
  path.startsWith('skills/')
    ? (companySkills.find((s) => s.slug === path.split('/')[1])?.markdown ?? '')
    : readFile(join(companyDir, path), 'utf8');
beforeAll(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'workflow-contract-'));
  roles = await readdir(join(templatesDir, 'roles'));
  ({ companyDir, companySkills } = await assembleCompany({
    companyName: 'Workflow Audit',
    templatesDir,
    outputDir,
    moduleNames: ['github-repo', 'pr-review', 'hiring-review', 'backlog'],
    extraRoleNames: roles,
  }));
});
afterAll(async () => {
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
});

describe('assembled workflow contracts', () => {
  it.each(['skills/pr-workflow/SKILL.md', 'skills/code-review/SKILL.md', 'docs/pr-conventions.md'])(
    'documents conditional escalation and rejected self-review in %s',
    async (path) => {
      const text = await read(path);
      for (const token of [
        'responsibleUserId',
        'createdByUserId',
        'no guaranteed',
        'first stage',
        '422',
        'Read back',
      ])
        expect(text).toContain(token);
      expect(text).not.toMatch(
        /stalls (?:in `in_review` forever|permanently)|Review rounds are capped/,
      );
    },
  );
  it('keeps the CEO hiring fallback governed and subordinate to a present PO', async () => {
    const text = await read('skills/hiring-review-fallback/SKILL.md');
    for (const token of [
      '/agent-hires',
      'instructionsBundle',
      'desiredSkills',
      'sourceIssueId',
      'company requires',
      'Product Owner is present',
      'supported role',
      'Read back',
    ])
      expect(text).toContain(token);
    expect(text).not.toContain('Create a board approval request');
    expect(text).not.toContain('Tag the PO');
  });
  it('describes assigned backlog routines rather than heartbeat scanning', async () => {
    const text = await readFile(join(templatesDir, 'modules/backlog/README.md'), 'utf8');
    expect(text).toContain('assigned backlog-grooming routine');
    expect(text).toContain('Assign acceptance-ready work');
    expect(text).not.toMatch(/On every heartbeat|count < threshold|left unassigned/);
  });
  // Pending explicit write approval for protected templates/roles/*/AGENTS.md.
  // These acceptance criteria are visible, not claimed as implemented.
  it.skip.each([
    'engineer',
    'qa',
    'product-owner',
    'security-engineer',
    'ui-designer',
    'ux-researcher',
    'devops',
    'cto',
    'cmo',
  ])('routes absent optional specialists through a present owner in %s', async (role) => {
    const text = await read(`agents/${role}/AGENTS.md`);
    expect(text).toMatch(/(?:optional|specialist).*present/i);
    expect(text).toMatch(/absent.*(?:owner|CEO)/i);
    expect(text).toMatch(/(?:preserve|without weakening|do not weaken).*checks/i);
  });
  it('uses the governed primary hiring skill when no Product Owner exists', async () => {
    const minimal = await assembleCompany({
      companyName: 'No PO',
      templatesDir,
      outputDir,
      moduleNames: ['hiring-review'],
      extraRoleNames: [],
    });
    const primary = minimal.companySkills.find((skill: any) => skill.slug === 'hiring-review');
    expect(primary?.markdown).toContain('/agent-hires');
    expect(primary?.markdown).toContain('instructionsBundle');
    expect(primary?.markdown).toContain('sourceIssueId');
    expect(minimal.allRoles.has('product-owner')).toBe(false);
    expect(
      minimal.companySkills.some((skill: any) => skill.slug === 'hiring-review-fallback'),
    ).toBe(false);
  });
  it.skip('uses structured DevOps blockers and self-owned descriptors (protected AGENTS write not approved)', async () => {
    const text = await read('agents/devops/AGENTS.md');
    for (const token of [
      'blockedByIssueIds',
      'unblockDescriptor',
      '"agentId": "<your-agent-id>"',
      'pending question/confirmation interaction',
    ])
      expect(text).toContain(token);
    expect(text).not.toContain('add a comment with the exact blocker, set status to `blocked`');
  });
  it('separates new review admission from existing-issue liveness in every generic heartbeat', async () => {
    let checked = 0;
    for (const role of roles) {
      const text = await read(`agents/${role}/HEARTBEAT.md`);
      if (['engineer', 'qa', 'product-owner', 'code-reviewer'].includes(role)) continue;
      checked++;
      expect(text).toContain('New `in_review` transitions');
      expect(text).toContain('queued interaction response');
      expect(text).toContain('not admission paths');
      expect(text).toContain('recovery-actions');
      expect(text).toContain('interactions');
      expect(text).toContain('approvals');
    }
    expect(checked).toBe(13);
  });
});
