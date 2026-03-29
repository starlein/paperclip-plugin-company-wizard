import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoalTemplate, collectGoals } from './load-templates.js';

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
