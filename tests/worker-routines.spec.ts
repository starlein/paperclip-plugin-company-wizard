import { describe, expect, it, vi } from 'vitest';
import { syncExistingCompanyRoutines } from '../src/worker.js';

describe('existing-company routine project synchronization', () => {
  it('links new repository routines, preserves existing links, and detaches API-only routines', async () => {
    const client = {
      listRoutines: vi.fn().mockResolvedValue([
        { id: 'existing-audit', title: 'Existing audit', projectId: 'operator-project' },
        { id: 'existing-backlog', title: 'Existing backlog', projectId: 'operator-project' },
      ]),
      updateRoutine: vi.fn().mockResolvedValue({}),
      createRoutine: vi.fn().mockResolvedValue({ id: 'new-routine' }),
      createRoutineTrigger: vi.fn().mockResolvedValue({}),
    };
    await syncExistingCompanyRoutines({
      client,
      companyId: 'company',
      ceoAgentId: 'ceo',
      teamAgentIds: { engineer: 'engineer', 'product-owner': 'product-owner' },
      mainProjectId: 'selected-project',
      routines: [
        { title: 'New dependency audit', assignTo: 'engineer', schedule: '0 9 * * 1' },
        { title: 'Existing audit', assignTo: 'engineer' },
        { title: 'Existing backlog', assignTo: 'product-owner', useProjectWorkspace: false },
        { title: 'New API-only planning', assignTo: 'product-owner', useProjectWorkspace: false },
      ],
      log: vi.fn(),
    });
    expect(client.createRoutine).toHaveBeenCalledWith(
      'company',
      expect.objectContaining({
        title: 'New dependency audit',
        projectId: 'selected-project',
        assigneeAgentId: 'engineer',
      }),
    );
    expect(client.createRoutineTrigger).toHaveBeenCalledWith(
      'new-routine',
      expect.objectContaining({
        cronExpression: '0 9 * * 1',
      }),
    );
    const existingAuditPayload = client.updateRoutine.mock.calls.find(
      ([id]) => id === 'existing-audit',
    )?.[1];
    expect(existingAuditPayload).not.toHaveProperty('projectId');
    expect(client.updateRoutine).toHaveBeenCalledWith(
      'existing-backlog',
      expect.objectContaining({
        projectId: null,
      }),
    );
    const detachedPayload = client.createRoutine.mock.calls.find(
      ([, payload]) => payload.title === 'New API-only planning',
    )?.[1];
    expect(detachedPayload).not.toHaveProperty('projectId');
  });
});
