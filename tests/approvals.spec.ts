import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
// @ts-ignore — plain JS module, bundled by esbuild
import { PaperclipClient } from '../src/api/client.js';
import manifest from '../src/manifest.js';
import plugin from '../src/worker.js';

beforeEach(() => {
  vi.spyOn(PaperclipClient.prototype, 'connect').mockResolvedValue(undefined);
  vi.spyOn(PaperclipClient.prototype, 'ping').mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

async function createHarness() {
  const harness = createTestHarness({
    manifest,
    capabilities: manifest.capabilities,
    config: { paperclipUrl: 'http://approval-regressions.test' },
  });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

const hire = (id: string, overrides = {}) => ({
  id,
  companyId: 'company-a',
  type: 'hire_agent',
  status: 'pending',
  payload: { agentId: `agent-${id}`, name: id },
  ...overrides,
});

describe('explicit hire decisions', () => {
  it.each([undefined, null, [], [''], ['hire-a', 42]])(
    'rejects implicit or malformed approval selection %j without contacting Paperclip',
    async (approvalIds) => {
      const list = vi.spyOn(PaperclipClient.prototype, 'listApprovals');
      const approve = vi.spyOn(PaperclipClient.prototype, 'approveApproval');
      const harness = await createHarness();
      const result = (await harness.performAction('approve-pending-hires', {
        companyId: 'company-a',
        approvalIds,
      })) as any;
      expect(result.error).toMatch(/explicitly/);
      expect(list).not.toHaveBeenCalled();
      expect(approve).not.toHaveBeenCalled();
    },
  );

  it("only lists this run's live pending company hires", async () => {
    vi.spyOn(PaperclipClient.prototype, 'listApprovals').mockResolvedValue([
      hire('requested'),
      hire('pre-existing'),
      hire('wrong-company', { companyId: 'company-b' }),
      hire('decided', { status: 'approved' }),
      hire('not-hire', { type: 'budget_override_required' }),
    ]);
    const harness = await createHarness();
    const result = (await harness.performAction('list-pending-hires', {
      companyId: 'company-a',
      approvalIds: ['requested', 'wrong-company', 'decided', 'not-hire'],
    })) as any;
    expect(result.approvals.map((approval: any) => approval.id)).toEqual(['requested']);
    expect(
      await harness.performAction('list-pending-hires', { companyId: 'company-a' }),
    ).toHaveProperty('error');
    expect(
      await harness.performAction('list-pending-hires', {
        companyId: 'company-a',
        approvalIds: [],
      }),
    ).toEqual({ approvals: [] });
  });

  it('does not approve unseen arrivals, another company, decided hires, or non-hires; deduplicates selected IDs', async () => {
    const approvals = [
      hire('selected'),
      hire('arrived-after-render'),
      hire('wrong-company', { companyId: 'company-b' }),
      hire('decided', { status: 'rejected' }),
      hire('not-hire', { type: 'budget_override_required' }),
    ];
    vi.spyOn(PaperclipClient.prototype, 'listApprovals').mockResolvedValue(approvals);
    const approve = vi
      .spyOn(PaperclipClient.prototype, 'approveApproval')
      .mockResolvedValue({ status: 'approved' });
    const wakeup = vi.spyOn(PaperclipClient.prototype, 'triggerHeartbeat');
    const harness = await createHarness();
    const result = (await harness.performAction('approve-pending-hires', {
      companyId: 'company-a',
      approvalIds: ['selected', 'selected', 'wrong-company', 'decided', 'not-hire'],
    })) as any;
    expect(result.approved).toEqual(['selected']);
    expect(result.failed.map((failure: any) => failure.id)).toEqual([
      'wrong-company',
      'decided',
      'not-hire',
    ]);
    expect(approve).toHaveBeenCalledExactlyOnceWith('selected', {
      decisionNote: 'Approved from Company Wizard.',
    });
    expect(wakeup).not.toHaveBeenCalled();
  });

  it('preserves successful decisions and reports per-hire authorization failures', async () => {
    vi.spyOn(PaperclipClient.prototype, 'listApprovals').mockResolvedValue([
      hire('allowed'),
      hire('denied'),
    ]);
    vi.spyOn(PaperclipClient.prototype, 'approveApproval').mockImplementation(
      async (id: string) => {
        if (id === 'denied') throw new Error('403: Board access required');
        return { status: 'approved' };
      },
    );
    const harness = await createHarness();
    const result = (await harness.performAction('approve-pending-hires', {
      companyId: 'company-a',
      approvalIds: ['allowed', 'denied'],
    })) as any;
    expect(result).toEqual({
      approved: ['allowed'],
      failed: [{ id: 'denied', error: '403: Board access required' }],
      remaining: 1,
    });
  });
});

describe('explicit bootstrap start', () => {
  const params = { companyId: 'company-a', agentId: 'ceo-a', issueId: 'bootstrap-a' };
  function mockBootstrap(agentOverrides = {}, issueOverrides = {}) {
    vi.spyOn(PaperclipClient.prototype, 'getAgent').mockResolvedValue({
      id: 'ceo-a',
      companyId: 'company-a',
      role: 'ceo',
      status: 'idle',
      ...agentOverrides,
    });
    vi.spyOn(PaperclipClient.prototype, 'getIssue').mockResolvedValue({
      id: 'bootstrap-a',
      companyId: 'company-a',
      assigneeAgentId: 'ceo-a',
      status: 'todo',
      ...issueOverrides,
    });
    const watchdog = vi
      .spyOn(PaperclipClient.prototype, 'getIssueWatchdog')
      .mockResolvedValue(null);
    const attach = vi
      .spyOn(PaperclipClient.prototype, 'setIssueWatchdog')
      .mockResolvedValue({ id: 'watchdog-a' });
    const wake = vi
      .spyOn(PaperclipClient.prototype, 'triggerHeartbeat')
      .mockResolvedValue({ id: 'run-a', status: 'queued' });
    return { watchdog, attach, wake };
  }

  it('starts the correct CEO and bootstrap issue and restores an absent watchdog after approval', async () => {
    const { attach, wake } = mockBootstrap();
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toEqual({
      started: true,
      runId: 'run-a',
      warnings: [],
    });
    expect(attach).toHaveBeenCalledWith(
      'bootstrap-a',
      expect.objectContaining({ agentId: 'ceo-a' }),
    );
    expect(wake).toHaveBeenCalledExactlyOnceWith('ceo-a', {
      issueId: 'bootstrap-a',
      idempotencyKey: 'company-wizard-bootstrap:bootstrap-a',
    });
  });

  it.each([
    [{ companyId: 'company-b' }, {}],
    [{ role: 'engineer' }, {}],
    [{ status: 'pending_approval' }, {}],
    [{ status: 'paused' }, {}],
    [{ status: 'terminated' }, {}],
    [{}, { companyId: 'company-b' }],
    [{}, { assigneeAgentId: 'other' }],
    [{}, { status: 'done' }],
    [{}, { status: 'cancelled' }],
  ])('rejects invalid live scope/state before creating work %j %j', async (agent, issue) => {
    const { attach, wake } = mockBootstrap(agent, issue);
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toHaveProperty('error');
    expect(attach).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });

  it('reports an already-running CEO without starting another heartbeat', async () => {
    const { wake } = mockBootstrap({ status: 'running' });
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toMatchObject({
      started: false,
      alreadyRunning: true,
    });
    expect(wake).not.toHaveBeenCalled();
  });

  it('preserves a watchdog configured by the operator', async () => {
    const { watchdog, attach } = mockBootstrap();
    watchdog.mockResolvedValue({ id: 'existing-watchdog', agentId: 'operator-selected' });
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toMatchObject({ started: true });
    expect(attach).not.toHaveBeenCalled();
  });

  it('can start when watchdog restoration fails but surfaces the warning', async () => {
    const { attach } = mockBootstrap();
    attach.mockRejectedValue(new Error('watchdog unavailable'));
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toMatchObject({
      started: true,
      warnings: ['Bootstrap watchdog could not be restored: watchdog unavailable'],
    });
  });

  it('does not report a skipped HTTP 202 wakeup as a started bootstrap', async () => {
    const { wake } = mockBootstrap();
    wake.mockResolvedValue({
      status: 'skipped',
      message: 'Wakeup was deferred because this issue already has an active execution run.',
    });
    const harness = await createHarness();
    expect(await harness.performAction('start-bootstrap', params)).toMatchObject({
      started: false,
      error: expect.stringContaining('deferred'),
    });
  });
});
