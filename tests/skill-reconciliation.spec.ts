import { describe, expect, it, vi } from 'vitest';
import { provisionCompanySkills } from '../src/worker';

const company = 'company-a';
const skill = (slug: string) => ({
  slug,
  name: slug,
  description: 'Wizard skill',
  markdown: `# ${slug}`,
  categories: ['test'],
});
const managed = (slug: string) => ({
  id: `id-${slug}`,
  companyId: company,
  key: `company/${company}/${slug}`,
  slug,
  name: slug,
  sourceType: 'local_path',
  editable: true,
});
const conflict = () => Object.assign(new Error('slug already exists'), { status: 409 });
const client = () => ({
  listCompanySkills: vi.fn().mockResolvedValue([]),
  createCompanySkill: vi.fn().mockImplementation(async (_company, input) => managed(input.slug)),
  updateCompanySkillFile: vi.fn().mockResolvedValue({}),
  renameCompanySkill: vi.fn().mockResolvedValue({}),
  updateCompanySkill: vi.fn().mockResolvedValue({}),
});

describe('Company Skill reconciliation against list summaries', () => {
  it('reuses a forked company skill without overwriting its custom content', async () => {
    const api = client();
    api.listCompanySkills.mockResolvedValue([
      { ...managed('backlog-health'), forkedFromSkillId: 'upstream-skill' },
    ]);
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn(), {
      continueOnError: true,
    });
    expect(api.updateCompanySkillFile).not.toHaveBeenCalled();
    expect(api.renameCompanySkill).not.toHaveBeenCalled();
    expect(keys.get('backlog-health')).toBe(`company/${company}/backlog-health`);
  });
  it.each([404, 409])(
    'drops a disappeared skill reference after update failure %s',
    async (status) => {
      const api = client();
      api.listCompanySkills
        .mockResolvedValueOnce([managed('backlog-health')])
        .mockResolvedValueOnce([]);
      api.updateCompanySkillFile.mockRejectedValueOnce(
        Object.assign(new Error('changed'), { status }),
      );
      const keys = await provisionCompanySkills(
        api,
        company,
        [skill('backlog-health'), skill('next-skill')],
        vi.fn(),
        { continueOnError: true },
      );
      expect(keys.has('backlog-health')).toBe(false);
      expect(keys.has('next-skill')).toBe(true);
    },
  );

  it('does not confuse a disappeared record with an unsupported rename endpoint', async () => {
    const api = client();
    api.listCompanySkills
      .mockResolvedValueOnce([{ ...managed('backlog-health'), name: 'Old name' }])
      .mockResolvedValueOnce([]);
    api.renameCompanySkill.mockResolvedValueOnce(null);
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn(), {
      continueOnError: true,
    });
    expect(keys.has('backlog-health')).toBe(false);
  });

  it('uses inventory readback rather than an ambiguous bare slug from a rename response', async () => {
    const api = client();
    api.listCompanySkills.mockResolvedValue([{ ...managed('backlog-health'), name: 'Old name' }]);
    api.renameCompanySkill.mockResolvedValueOnce({ skill: { slug: 'backlog-health' } });
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn());
    expect(keys.get('backlog-health')).toBe(`company/${company}/backlog-health`);
  });
  it('updates an existing managed summary without requiring omitted metadata/markdown', async () => {
    const api = client();
    api.listCompanySkills.mockResolvedValue([managed('backlog-health')]);
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn());
    expect(api.createCompanySkill).not.toHaveBeenCalled();
    expect(api.updateCompanySkillFile).toHaveBeenCalledWith(
      company,
      'id-backlog-health',
      expect.objectContaining({ path: 'SKILL.md' }),
    );
    expect(keys.get('backlog-health')).toBe(`company/${company}/backlog-health`);
  });

  it('re-reads once after a create conflict and reconciles the concurrently created managed skill', async () => {
    const api = client();
    api.listCompanySkills
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([managed('backlog-health')]);
    api.createCompanySkill.mockRejectedValueOnce(conflict());
    const keys = await provisionCompanySkills(
      api,
      company,
      [skill('backlog-health'), skill('next-skill')],
      vi.fn(),
    );
    expect(api.listCompanySkills).toHaveBeenCalledTimes(2);
    expect(api.updateCompanySkillFile).toHaveBeenCalledWith(
      company,
      'id-backlog-health',
      expect.any(Object),
    );
    expect(keys.has('next-skill')).toBe(true);
  });

  it('preserves a read-only company skill without creating or overwriting it', async () => {
    const api = client();
    api.listCompanySkills.mockResolvedValue([{ ...managed('backlog-health'), editable: false }]);
    const warn = vi.fn();
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn(), {
      continueOnError: true,
      onWarning: warn,
    });
    expect(api.createCompanySkill).not.toHaveBeenCalled();
    expect(api.updateCompanySkillFile).not.toHaveBeenCalled();
    expect(keys.get('backlog-health')).toBe(`company/${company}/backlog-health`);
    expect(warn).toHaveBeenCalled();
  });

  it('does not adopt a same-slug imported skill or another company key', async () => {
    const api = client();
    api.listCompanySkills.mockResolvedValue([
      {
        ...managed('backlog-health'),
        key: 'catalog/provider/backlog-health',
        sourceType: 'catalog',
        editable: false,
      },
      { ...managed('backlog-health'), companyId: 'other', key: 'company/other/backlog-health' },
    ]);
    await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn());
    expect(api.createCompanySkill).toHaveBeenCalledOnce();
    expect(api.updateCompanySkillFile).not.toHaveBeenCalled();
  });

  it.each(['create', 'update', 'rename'])(
    'continues remaining skills after an unrecoverable %s conflict in an existing company',
    async (stage) => {
      const api = client();
      const warn = vi.fn();
      if (stage === 'create') api.createCompanySkill.mockRejectedValueOnce(conflict());
      else {
        api.listCompanySkills.mockResolvedValue([
          {
            ...managed('backlog-health'),
            name: stage === 'rename' ? 'Old name' : 'backlog-health',
          },
        ]);
        (stage === 'update'
          ? api.updateCompanySkillFile
          : api.renameCompanySkill
        ).mockRejectedValueOnce(conflict());
      }
      const keys = await provisionCompanySkills(
        api,
        company,
        [skill('backlog-health'), skill('next-skill')],
        vi.fn(),
        { continueOnError: true, onWarning: warn },
      );
      expect(keys.has('next-skill')).toBe(true);
      expect(keys.has('backlog-health')).toBe(stage !== 'create');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('backlog-health'));
    },
  );

  it('does not invent skill references when inventory is unavailable in an existing company', async () => {
    const api = client();
    api.listCompanySkills.mockRejectedValue(new Error('network details must not leak'));
    const warn = vi.fn();
    const keys = await provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn(), {
      continueOnError: true,
      onWarning: warn,
    });
    expect(keys.size).toBe(0);
    expect(api.createCompanySkill).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('network details');
  });

  it('remains fail-fast for an unrecoverable new-company skill error', async () => {
    const api = client();
    api.createCompanySkill.mockRejectedValueOnce(conflict());
    await expect(
      provisionCompanySkills(api, company, [skill('backlog-health')], vi.fn()),
    ).rejects.toThrow();
    expect(api.createCompanySkill).toHaveBeenCalledOnce();
  });
});
