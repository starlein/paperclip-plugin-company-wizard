import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateGoalTemplate,
  collectGoals,
  collectPresetBootstrapData,
  resolveEffectiveModules,
  loadModules,
} from './load-templates.js';

describe('validateGoalTemplate', () => {
  it('accepts a valid minimal goal (title + description only)', () => {
    assert.doesNotThrow(() =>
      validateGoalTemplate({ title: 'Ship MVP', description: 'Launch the first version.' }, 'mvp'),
    );
  });

  it('accepts a valid goal with subgoals', () => {
    const goal = {
      title: 'Ship MVP',
      description: 'Launch v1.',
      subgoals: [
        { id: 'design', title: 'Design phase', level: 'team', description: 'Complete design' },
        { id: 'build', title: 'Build phase' },
      ],
    };
    assert.doesNotThrow(() => validateGoalTemplate(goal, 'mvp'));
  });

  it('throws when title is missing', () => {
    assert.throws(
      () => validateGoalTemplate({ description: 'desc' }, 'bad'),
      /missing or invalid "title"/,
    );
  });

  it('throws when description is missing', () => {
    assert.throws(
      () => validateGoalTemplate({ title: 'ok' }, 'bad'),
      /missing or invalid "description"/,
    );
  });

  it('throws when subgoal id is not kebab-case', () => {
    assert.throws(
      () =>
        validateGoalTemplate(
          {
            title: 'T',
            description: 'D',
            subgoals: [{ id: 'Bad Id', title: 'M' }],
          },
          'bad',
        ),
      /kebab-case/,
    );
  });

  it('throws on duplicate subgoal ids', () => {
    assert.throws(
      () =>
        validateGoalTemplate(
          {
            title: 'T',
            description: 'D',
            subgoals: [
              { id: 'alpha', title: 'A' },
              { id: 'alpha', title: 'B' },
            ],
          },
          'bad',
        ),
      /duplicate subgoal id "alpha"/,
    );
  });

  it('throws on deprecated milestones field', () => {
    assert.throws(
      () =>
        validateGoalTemplate(
          {
            title: 'T',
            description: 'D',
            milestones: [{ id: 'alpha', title: 'A' }],
          },
          'bad',
        ),
      /deprecated/,
    );
  });

  it('throws on deprecated issues field inside goal', () => {
    assert.throws(
      () =>
        validateGoalTemplate(
          {
            title: 'T',
            description: 'D',
            issues: [{ title: 'Task' }],
          },
          'bad',
        ),
      /deprecated/,
    );
  });
});

describe('collectGoals', () => {
  it('returns empty array when no preset goals or module goals', () => {
    const goals = collectGoals(null, [], new Set());
    assert.deepStrictEqual(goals, []);
  });

  it('collects goals from preset', () => {
    const preset = {
      name: 'startup',
      goals: [
        { title: 'Launch MVP', description: 'Ship it' },
        { title: 'Scale', description: 'Grow' },
      ],
    };
    const goals = collectGoals(preset, [], new Set());
    assert.equal(goals.length, 2);
    assert.equal(goals[0].title, 'Launch MVP');
    assert.equal(goals[0]._source, 'preset:startup');
    assert.equal(goals[1]._source, 'preset:startup');
  });

  it('collects goal from selected module', () => {
    const modules = [
      { name: 'ci-cd', goal: { title: 'CI/CD Setup', description: 'Automate' } },
      { name: 'backlog', description: 'no goal here' },
    ];
    const goals = collectGoals(null, modules, new Set(['ci-cd', 'backlog']));
    assert.equal(goals.length, 1);
    assert.equal(goals[0].title, 'CI/CD Setup');
    assert.equal(goals[0]._source, 'module:ci-cd');
    assert.equal(goals[0]._module, 'ci-cd');
  });

  it('skips module goals for unselected modules', () => {
    const modules = [{ name: 'ci-cd', goal: { title: 'CI/CD Setup', description: 'Automate' } }];
    const goals = collectGoals(null, modules, new Set([]));
    assert.equal(goals.length, 0);
  });

  it('combines preset and module goals', () => {
    const preset = {
      name: 'quality',
      goals: [{ title: 'Preset Goal', description: 'From preset' }],
    };
    const modules = [{ name: 'ci-cd', goal: { title: 'Module Goal', description: 'From module' } }];
    const goals = collectGoals(preset, modules, new Set(['ci-cd']));
    assert.equal(goals.length, 2);
    assert.equal(goals[0]._source, 'preset:quality');
    assert.equal(goals[1]._source, 'module:ci-cd');
  });
});

describe('collectPresetBootstrapData', () => {
  it('copies preset labels, issues, and routines used by the bootstrap assembler', () => {
    const preset = {
      name: 'strategic-platform',
      labels: [{ name: 'ai', color: '#8957e5' }],
      issues: [{ title: 'Seed strategy issue' }],
      routines: [{ title: 'Weekly platform review', schedule: '0 9 * * 1' }],
    };

    const data = collectPresetBootstrapData(preset);

    assert.deepStrictEqual(data.labels, [{ name: 'ai', color: '#8957e5' }]);
    assert.deepStrictEqual(data.issues, [{ title: 'Seed strategy issue' }]);
    assert.deepStrictEqual(data.routines, [
      { title: 'Weekly platform review', schedule: '0 9 * * 1' },
    ]);
    data.issues[0].title = 'mutated';
    assert.equal(preset.issues[0].title, 'Seed strategy issue');
  });
});

describe('loadModules description precedence', () => {
  let tmpDir;
  let templatesDir;

  const writeModule = async (name, { meta, readme } = {}) => {
    const modDir = join(templatesDir, 'modules', name);
    await mkdir(modDir, { recursive: true });
    await writeFile(join(modDir, 'module.meta.json'), JSON.stringify(meta ?? {}));
    if (readme !== undefined) await writeFile(join(modDir, 'README.md'), readme);
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'load-templates-'));
    templatesDir = join(tmpDir, 'templates');
    await mkdir(join(templatesDir, 'modules'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('uses module.meta.json description when present', async () => {
    await writeModule('alpha', {
      meta: { description: 'From manifest' },
      readme: '# Alpha\n\nFrom README',
    });
    const modules = await loadModules(templatesDir);
    const alpha = modules.find((m) => m.name === 'alpha');
    assert.equal(alpha.description, 'From manifest');
  });

  it('falls back to the first README content line when manifest has no description', async () => {
    await writeModule('beta', { meta: {}, readme: '# Beta\n\nFrom README line' });
    const modules = await loadModules(templatesDir);
    const beta = modules.find((m) => m.name === 'beta');
    assert.equal(beta.description, 'From README line');
  });

  it('defaults to empty string when neither manifest nor README provides a description', async () => {
    await writeModule('gamma', { meta: {} });
    const modules = await loadModules(templatesDir);
    const gamma = modules.find((m) => m.name === 'gamma');
    assert.equal(gamma.description, '');
  });
});

describe('resolveEffectiveModules', () => {
  it('includes preset modules even when the selected module list is sparse', () => {
    const preset = { name: 'build-api', modules: ['build-api', 'github-repo', 'ci-cd'] };
    const modules = [
      { name: 'build-api' },
      { name: 'github-repo' },
      { name: 'ci-cd' },
      { name: 'backlog' },
    ];

    const effective = resolveEffectiveModules(preset, modules, ['build-api']);

    assert.deepStrictEqual(effective, ['build-api', 'github-repo', 'ci-cd']);
  });

  it('adds transitive required modules', () => {
    const modules = [
      { name: 'build-api', requires: ['github-repo'] },
      { name: 'github-repo', requires: ['repo-policy'] },
      { name: 'repo-policy' },
    ];

    const effective = resolveEffectiveModules(null, modules, ['build-api']);

    assert.deepStrictEqual(effective, ['build-api', 'github-repo', 'repo-policy']);
  });

  it('lets collectGoals see every goal from the effective build-api preset modules', () => {
    const preset = { name: 'build-api', modules: ['build-api', 'ci-cd'] };
    const modules = [
      { name: 'build-api', goal: { title: 'Build a REST API', description: 'API work' } },
      { name: 'ci-cd', goal: { title: 'Set up CI/CD pipeline', description: 'Pipeline work' } },
    ];

    const effective = resolveEffectiveModules(preset, modules, ['build-api']);
    const goals = collectGoals(preset, modules, new Set(effective));

    assert.deepStrictEqual(
      goals.map((g) => g.title),
      ['Build a REST API', 'Set up CI/CD pipeline'],
    );
  });
});
