import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeBoardAction } from '../src/ui/lib/board-action.js';

afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('browser board action', () => {
  it('refuses a legacy-to-browser transition without prior consent before minting or invoking', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (url) =>
        json(
          url === '/api/health'
            ? { deploymentMode: 'authenticated' }
            : {
                id: 'key-id',
                token: 'temporary-key',
                expiresAt: new Date(Date.now() + 3500000).toISOString(),
              },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const action = vi.fn().mockResolvedValue('legacy');
    await invokeBoardAction(action, { mode: 'legacy' }, {}, 'https://paperclip.test');
    expect(action).toHaveBeenCalledOnce();
    action.mockClear();
    await expect(
      invokeBoardAction(action, { mode: 'browser' }, {}, 'https://paperclip.test'),
    ).rejects.toThrow(/Reload.*consent/i);
    expect(action).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/health', expect.any(Object));
  });

  it('bounds stalled cleanup and reports a visible warning without losing success', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
      .mockResolvedValueOnce(
        json({
          id: 'key-id',
          token: 'temporary-key',
          expiresAt: new Date(Date.now() + 3500000).toISOString(),
        }),
      )
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      );
    vi.stubGlobal('fetch', fetcher);
    const warning = vi.fn();
    try {
      const result = invokeBoardAction(
        vi.fn().mockResolvedValue({ companyId: 'created' }),
        { mode: 'browser' },
        {},
        'https://paperclip.test',
        warning,
        true,
      );
      await vi.advanceTimersByTimeAsync(5000);
      expect(timeout).toHaveBeenCalledWith(5000);
      expect(await result).toEqual({ companyId: 'created' });
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('API key settings'));
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it('allows an operator-configured loopback transport behind a public UI', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
      .mockResolvedValueOnce(
        json({
          id: 'key-id',
          token: 'temporary-key',
          expiresAt: new Date(Date.now() + 3500000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const action = vi.fn();
    await invokeBoardAction(
      action,
      { mode: 'browser', paperclipUrl: 'http://localhost:3100' },
      {},
      'https://paperclip.test',
      undefined,
      true,
    );
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: expect.any(Object) }),
    );
  });

  it.each([401, 403, 404, 405, 500])(
    'does not fall back or expose response contents after key creation fails (%i)',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
        .mockResolvedValueOnce(json({ error: 'private-response' }, status));
      vi.stubGlobal('fetch', fetcher);
      const action = vi.fn();
      await expect(
        invokeBoardAction(
          action,
          { mode: 'browser' },
          {},
          'https://paperclip.test',
          undefined,
          true,
        ),
      ).rejects.not.toThrow('private-response');
      expect(action).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it('does not revoke while a timed-out worker may still be provisioning', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
      .mockResolvedValueOnce(
        json({
          id: 'key-id',
          token: 'temporary-key',
          expiresAt: new Date(Date.now() + 3500000).toISOString(),
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      invokeBoardAction(
        vi.fn().mockRejectedValue(new Error('timeout temporary-key')),
        { mode: 'browser' },
        {},
        'https://paperclip.test',
        undefined,
        true,
      ),
    ).rejects.toThrow('may still be running');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['success'])(
    'attempts revocation after action %s, without masking its result',
    async (outcome) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
        .mockResolvedValueOnce(
          json({
            id: 'key-id',
            token: 'temporary-key',
            expiresAt: new Date(Date.now() + 3500000).toISOString(),
          }),
        )
        .mockRejectedValueOnce(new Error('network unavailable'));
      vi.stubGlobal('fetch', fetcher);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const action =
        outcome === 'success'
          ? vi.fn().mockResolvedValue({ companyId: 'created' })
          : vi.fn().mockRejectedValue(new Error('action failed'));
      try {
        const result = invokeBoardAction(
          action,
          { mode: 'browser' },
          {},
          'https://paperclip.test',
          undefined,
          true,
        );
        if (outcome === 'success') expect(await result).toEqual({ companyId: 'created' });
        else await expect(result).rejects.toThrow('action failed');
        expect(fetcher.mock.calls[2][1]).toHaveProperty('method', 'DELETE');
        expect(warn).toHaveBeenCalledOnce();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each([
    { mode: 'legacy' as const },
    { mode: 'browser' as const, paperclipUrl: 'https://remote.test' },
  ])('preserves explicit legacy/remote configuration %j', async (options) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const action = vi.fn().mockResolvedValue('legacy');
    expect(await invokeBoardAction(action, options, { test: true }, 'https://paperclip.test')).toBe(
      'legacy',
    );
    expect(action).toHaveBeenCalledWith({ test: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not mint a key on local_trusted hosts', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ deploymentMode: 'local_trusted' }));
    vi.stubGlobal('fetch', fetcher);
    const action = vi.fn();
    await invokeBoardAction(action, { mode: 'browser' }, {}, 'http://paperclip.test');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith({});
  });

  it('refuses authenticated non-loopback HTTP before minting a key', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      invokeBoardAction(vi.fn(), { mode: 'browser' }, {}, 'http://paperclip.test', undefined, true),
    ).rejects.toThrow('HTTPS');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('creates an expiring key using the same-origin session and revokes it after the action', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ deploymentMode: 'authenticated' }))
      .mockResolvedValueOnce(
        json({
          id: 'key-id',
          token: 'temporary-key',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const action = vi.fn().mockResolvedValue({ ok: true });
    const before = Date.now();
    expect(
      await invokeBoardAction(
        action,
        { mode: 'browser' },
        { companyId: 'company-a' },
        'https://paperclip.test',
        undefined,
        true,
      ),
    ).toEqual({ ok: true });
    expect(action).toHaveBeenCalledExactlyOnceWith({
      companyId: 'company-a',
      credentials: { origin: 'https://paperclip.test', token: 'temporary-key' },
    });
    const [url, request] = fetcher.mock.calls[1];
    expect(url).toBe('/api/board-api-keys');
    expect(request).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
    });
    const body = JSON.parse(request.body);
    expect(body.name).toBe('Company Wizard temporary action');
    expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + 3600000);
    expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(Date.now() + 3600000);
    expect(fetcher.mock.calls[2]).toMatchObject([
      '/api/board-api-keys/key-id',
      { method: 'DELETE', credentials: 'same-origin', redirect: 'error' },
    ]);
  });
});
