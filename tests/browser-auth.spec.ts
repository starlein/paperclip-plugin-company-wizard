import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
// @ts-ignore — plain JS module
import { PaperclipClient } from '../src/api/client.js';
import manifest from '../src/manifest.js';
import plugin from '../src/worker.js';

const actor = (userId = 'board-a') => ({
  actor: { type: 'user', userId, agentId: null, runId: null, companyId: 'company-a' },
  companyId: 'company-a',
});
const auth = (token = 'test-board-token-a') => ({ origin: 'https://paperclip.test', token });
async function handlers(config = {}) {
  const harness = createTestHarness({ manifest, capabilities: manifest.capabilities, config });
  const register = vi.spyOn(harness.ctx.actions, 'register');
  await plugin.definition.setup(harness.ctx);
  return Object.fromEntries(register.mock.calls) as Record<string, Function>;
}
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(PaperclipClient.prototype, '_fetch').mockResolvedValue({ revoked: true });
});

describe('action-scoped browser board authorization', () => {
  it('validates credential-free settings without trying a password sign-in', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(await plugin.definition.onValidateConfig!({})).toMatchObject({ ok: true });
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns only non-secret connection options', async () => {
    const actions = await handlers({
      paperclipEmail: 'user',
      paperclipPassword: 'private-password',
    });
    expect(await actions['auth-options']({})).toEqual({ mode: 'legacy', paperclipUrl: null });
  });

  it.each([
    { browser: null, context: actor() },
    { browser: auth(), context: undefined },
    { browser: auth(), context: { actor: { type: 'agent', userId: 'board-a' } } },
    { browser: { ...auth(), origin: 'http://remote.test' }, context: actor() },
    { browser: { ...auth(), origin: 'https://paperclip.test/path' }, context: actor() },
    { browser: { ...auth(), origin: 'https://user:pass@paperclip.test' }, context: actor() },
  ])(
    'rejects invalid or untrusted browser auth before network calls: %j',
    async ({ browser, context }) => {
      const connect = vi.spyOn(PaperclipClient.prototype, 'connect');
      const actions = await handlers();
      expect(await actions['list-companies']({ credentials: browser }, context)).toHaveProperty(
        'error',
      );
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('does not send a browser key to a configured remote instance', async () => {
    const connect = vi.spyOn(PaperclipClient.prototype, 'connect');
    const actions = await handlers({ paperclipUrl: 'https://other.test' });
    expect(await actions['check-auth']({ credentials: auth() }, actor())).toHaveProperty('error');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a token belonging to another user, without using legacy credentials', async () => {
    vi.spyOn(PaperclipClient.prototype, 'connect').mockImplementation(async function (this: any) {
      this.boardUserId = 'board-b';
    });
    const list = vi.spyOn(PaperclipClient.prototype, 'listCompanies');
    const actions = await handlers({
      paperclipEmail: 'legacy-user',
      paperclipPassword: 'legacy-password',
    });
    expect(await actions['list-companies']({ credentials: auth() }, actor())).toHaveProperty(
      'error',
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('isolates overlapping users and does not retain browser credentials for later actions', async () => {
    const connect = vi
      .spyOn(PaperclipClient.prototype, 'connect')
      .mockImplementation(async function (this: any) {
        this.boardUserId = this.credentials.token === 'token-b' ? 'board-b' : 'board-a';
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    vi.spyOn(PaperclipClient.prototype, 'ping').mockResolvedValue(false);
    vi.spyOn(PaperclipClient.prototype, 'listCompanies').mockImplementation(async function (
      this: any,
    ) {
      return [{ id: this.boardUserId, name: this.boardUserId }];
    });
    const actions = await handlers();
    const [a, b] = await Promise.all([
      actions['list-companies']({ credentials: auth() }, actor()),
      actions['list-companies']({ credentials: auth('token-b') }, actor('board-b')),
    ]);
    expect(a.companies[0].id).toBe('board-a');
    expect(b.companies[0].id).toBe('board-b');
    await actions['check-auth']({}, actor());
    expect(connect.mock.instances[2].credentials).not.toHaveProperty('token');
  });

  it('uses the browser credential without a password or a shared session', async () => {
    const connect = vi
      .spyOn(PaperclipClient.prototype, 'connect')
      .mockImplementation(async function (this: any) {
        this.boardUserId = 'board-a';
      });
    const list = vi.spyOn(PaperclipClient.prototype, 'listCompanies').mockResolvedValue([]);
    const actions = await handlers();
    const result = await actions['list-companies']({ credentials: auth() }, actor());
    expect(result).not.toHaveProperty('error');
    expect(connect.mock.instances[0]).toMatchObject({
      baseUrl: 'http://localhost:3100',
      credentials: { token: 'test-board-token-a' },
    });
    expect(list).toHaveBeenCalledOnce();
    expect(PaperclipClient.prototype._fetch).toHaveBeenCalledWith('/api/cli-auth/revoke-current', {
      method: 'POST',
      body: '{}',
      signal: expect.any(AbortSignal),
    });
  });
});
