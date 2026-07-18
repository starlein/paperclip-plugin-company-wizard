import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routineProjectPayload, routineUsesProjectWorkspace } from './routines.js';

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
