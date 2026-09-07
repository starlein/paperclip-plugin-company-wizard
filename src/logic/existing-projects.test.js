import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExistingProjects, projectPolicyChanges } from './existing-projects.js';

const project = {
  id: 'p1',
  companyId: 'c1',
  name: 'App',
  goals: [{ title: 'Ship' }],
  primaryWorkspace: {
    id: 'w1',
    sourceType: 'git_repo',
    cwd: '/operator/app',
    repoUrl: 'https://example.com/app.git',
  },
  executionWorkspacePolicy: {
    enabled: false,
    defaultMode: 'isolated_workspace',
    sharedWorkspaceConcurrency: 'allow',
    environmentId: 'env',
    allowIssueOverride: false,
    workspaceStrategy: { type: 'git_worktree', baseRef: 'develop', provisionCommand: 'npm ci' },
  },
};
test('empty selection loads all company projects without touching operator workspaces or policies', () => {
  const result = resolveExistingProjects('c1', [
    project,
    { ...project, id: 'foreign', companyId: 'c2' },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].executionWorkspacePolicy, project.executionWorkspacePolicy);
  assert.deepEqual(result[0].workspace, project.primaryWorkspace);
  assert.deepEqual(result[0].goals, ['Ship']);
});
test('an explicit policy override preserves other policy and strategy fields', () => {
  const [result] = resolveExistingProjects(
    'c1',
    [project],
    [
      {
        id: 'p1',
        executionWorkspacePolicy: {
          sharedWorkspaceConcurrency: 'serialize',
          workspaceStrategy: { baseRef: 'main' },
        },
      },
    ],
  );
  assert.equal(result.executionWorkspacePolicy.enabled, false);
  assert.equal(result.executionWorkspacePolicy.sharedWorkspaceConcurrency, 'serialize');
  assert.deepEqual(result.executionWorkspacePolicy.workspaceStrategy, {
    type: 'git_worktree',
    baseRef: 'main',
    provisionCommand: 'npm ci',
  });
});
test('missing and ambiguous targets fail before writes; no workspace is synthesized', () => {
  assert.throws(
    () => resolveExistingProjects('c1', [project], [{ id: 'foreign' }]),
    /uniquely match/,
  );
  assert.throws(
    () => resolveExistingProjects('c1', [project, { ...project, id: 'p2' }], [{ name: 'App' }]),
    /uniquely match/,
  );
  assert.throws(
    () => resolveExistingProjects('c1', [project], [{ id: 'p1' }, { id: 'p1' }]),
    /Duplicate/,
  );
  const [result] = resolveExistingProjects('c1', [
    { ...project, primaryWorkspace: null, executionWorkspacePolicy: null },
  ]);
  assert.equal(result.workspace, undefined);
  assert.deepEqual(result.executionWorkspacePolicy, {
    enabled: true,
    defaultMode: 'shared_workspace',
  });
});
test('preview reports the same policy object used for updates', () => {
  const projects = resolveExistingProjects('c1', [project]);
  assert.deepEqual(projectPolicyChanges([project], projects), [
    {
      id: 'p1',
      name: 'App',
      before: project.executionWorkspacePolicy,
      after: projects[0].executionWorkspacePolicy,
    },
  ]);
});
