import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ROUTINE_CONCURRENCY_POLICY,
  ROUTINE_CONCURRENCY_POLICIES,
  routineConcurrencyPolicy,
  routineProjectPayload,
  routineTitle,
  routineUsesProjectWorkspace,
} from './routines.js';

describe('routine workspace policy', () => {
  it('keeps ordinary routines linked to the resolved main project', () => {
    assert.equal(routineUsesProjectWorkspace({ title: 'Dependency audit' }), true);
    assert.deepEqual(routineProjectPayload({}, 'project-1'), { projectId: 'project-1' });
  });

  it('keeps control-plane routines off project worktrees', () => {
    const routine = { title: 'Backlog grooming', useProjectWorkspace: false };

    assert.equal(routineUsesProjectWorkspace(routine), false);
    assert.deepEqual(routineProjectPayload(routine, 'project-1'), {});
  });

  it('clears a legacy project link when syncing a detached routine', () => {
    const routine = { title: 'Backlog grooming', useProjectWorkspace: false };

    assert.deepEqual(routineProjectPayload(routine, undefined, { sync: true }), {
      projectId: null,
    });
    assert.deepEqual(
      routineProjectPayload({ title: 'Dependency audit' }, undefined, { sync: true }),
      {},
    );
  });
});

describe('routine title resolution', () => {
  it('accepts both the current title and the legacy name key', () => {
    assert.equal(routineTitle({ title: 'Dependency audit' }), 'Dependency audit');
    assert.equal(routineTitle({ name: 'Release readiness check' }), 'Release readiness check');
    assert.equal(routineTitle({ title: '  Stall detection  ' }), 'Stall detection');
  });

  it('prefers title over name and reports an empty title as empty', () => {
    assert.equal(routineTitle({ title: 'Backlog grooming', name: 'legacy' }), 'Backlog grooming');
    assert.equal(routineTitle({ title: '   ' }), '');
    assert.equal(routineTitle(undefined), '');
  });
});

describe('routine concurrency policy', () => {
  it('passes through the policies Paperclip accepts', () => {
    for (const policy of ROUTINE_CONCURRENCY_POLICIES) {
      assert.equal(routineConcurrencyPolicy({ concurrencyPolicy: policy }), policy);
    }
  });

  it('maps the legacy forbid spelling instead of sending a rejected value', () => {
    assert.equal(routineConcurrencyPolicy({ concurrencyPolicy: 'forbid' }), 'skip_if_active');
  });

  it('falls back to the default for missing or unknown values', () => {
    assert.equal(routineConcurrencyPolicy({}), DEFAULT_ROUTINE_CONCURRENCY_POLICY);
    assert.equal(routineConcurrencyPolicy({ concurrencyPolicy: 'nope' }), 'skip_if_active');
    assert.equal(routineConcurrencyPolicy({ concurrencyPolicy: 42 }), 'skip_if_active');
  });
});
