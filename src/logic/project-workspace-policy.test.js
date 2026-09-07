import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectExecutionWorkspacePolicySchema } from '@paperclipai/shared';
import {
  normalizeExecutionWorkspacePolicy,
  executionWorkspacePolicyFields,
} from './project-workspace-policy.js';

describe('AI execution workspace policy normalization', () => {
  it('retains explicit opt-outs and each supported concurrency choice', () => {
    for (const sharedWorkspaceConcurrency of ['auto', 'serialize', 'allow']) {
      const input = { enabled: false, allowIssueOverride: false, sharedWorkspaceConcurrency };
      const normalized = normalizeExecutionWorkspacePolicy(input);
      assert.deepEqual(normalized, input);
      assert.equal(projectExecutionWorkspacePolicySchema.safeParse(normalized).success, true);
    }
  });

  it('preserves a complete schema-valid policy, including nulls and strategy hooks', () => {
    const input = {
      enabled: true,
      defaultMode: 'isolated_workspace',
      allowIssueOverride: false,
      sharedWorkspaceConcurrency: 'allow',
      defaultProjectWorkspaceId: '11111111-1111-4111-8111-111111111111',
      environmentId: null,
      workspaceStrategy: {
        type: 'git_worktree',
        baseRef: 'origin/release',
        branchTemplate: 'feature/{issue.identifier}',
        worktreeParentDir: '/work/branches',
        provisionCommand: 'printf "starting"\nnpm ci',
        runtimeProvisionCommand: null,
        teardownCommand: 'npm run cleanup',
      },
      workspaceRuntime: { services: [{ name: 'api', desiredState: 'running' }] },
      branchPolicy: { prefix: 'delivery/' },
      pullRequestPolicy: { draft: true },
      runtimePolicy: { env: { MODE: 'dev' } },
      cleanupPolicy: null,
      authorizationPolicy: { assignmentPolicy: { mode: 'protected' } },
    };
    const normalized = normalizeExecutionWorkspacePolicy(input);
    assert.deepEqual(normalized, input);
    assert.equal(projectExecutionWorkspacePolicySchema.safeParse(normalized).success, true);
    normalized.runtimePolicy.env.MODE = 'changed';
    assert.equal(input.runtimePolicy.env.MODE, 'dev');
  });

  it('drops unsupported AI keys and malformed enum, boolean and reference values', () => {
    const normalized = normalizeExecutionWorkspacePolicy({
      enabled: true,
      defaultMode: 'not_a_mode',
      sharedWorkspaceConcurrency: 'parallel',
      allowIssueOverride: 'false',
      environmentId: 'local',
      unsupported: 1,
      workspaceStrategy: {
        type: 'git_worktree',
        existingBranch: 'main',
        baseRef: 'main',
        invalid: true,
      },
    });
    assert.deepEqual(normalized, {
      enabled: true,
      workspaceStrategy: { type: 'git_worktree', baseRef: 'main' },
    });
    assert.equal(projectExecutionWorkspacePolicySchema.safeParse(normalized).success, true);
    for (const invalid of [null, [], 'auto', {}, { unknown: true }]) {
      assert.equal(normalizeExecutionWorkspacePolicy(invalid), undefined);
    }
  });

  it('renders false, null, nested records, arrays and empty records without losing values', () => {
    const fields = Object.fromEntries(
      executionWorkspacePolicyFields({
        enabled: false,
        environmentId: null,
        workspaceStrategy: { type: 'git_worktree', teardownCommand: 'echo "done"' },
        cleanupPolicy: {},
        branchPolicy: { protected: ['main', 'release'] },
      }),
    );
    assert.equal(fields['executionWorkspacePolicy.enabled'], 'false');
    assert.equal(fields['executionWorkspacePolicy.environmentId'], 'null');
    assert.equal(
      fields['executionWorkspacePolicy.workspaceStrategy.teardownCommand'],
      'echo "done"',
    );
    assert.equal(fields['executionWorkspacePolicy.cleanupPolicy'], '{}');
    assert.equal(fields['executionWorkspacePolicy.branchPolicy.protected'], '["main","release"]');
  });
});
