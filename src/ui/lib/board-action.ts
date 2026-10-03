type Action = (params?: Record<string, unknown>) => Promise<unknown>;
export type BoardAuthOptions = { mode: 'legacy' | 'browser'; paperclipUrl?: string | null };
const KEY_TTL_MS = 60 * 60 * 1000;
const sessionRequest = {
  credentials: 'same-origin',
  redirect: 'error',
  cache: 'no-store',
} as const;

export function usesLegacyConnection(options: BoardAuthOptions, origin: string): boolean {
  if (options.mode === 'legacy') return true;
  if (!options.paperclipUrl) return false;
  const target = new URL(options.paperclipUrl);
  return target.origin !== origin && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
}

/** The HttpOnly login stays in the browser. Only a bounded, revocable key crosses the bridge. */
export async function invokeBoardAction(
  action: Action,
  options: BoardAuthOptions,
  params: Record<string, unknown> = {},
  origin = window.location.origin,
  onWarning: (message: string) => void = (message) => console.warn(message),
  hasBrowserConsent = false,
): Promise<unknown> {
  if (usesLegacyConnection(options, origin)) return action(params);
  if (options.mode !== 'browser')
    throw new Error('Reload Company Wizard to update its authentication support.');
  const healthResponse = await fetch('/api/health', sessionRequest);
  if (!healthResponse.ok)
    throw new Error('Could not check Paperclip authentication. Reload and sign in again.');
  const health = await healthResponse.json();
  if (health.deploymentMode === 'local_trusted') return action(params);
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('Browser authorization requires HTTPS (or loopback HTTP).');
  }
  if (!hasBrowserConsent)
    throw new Error(
      'Reload Company Wizard and consent by clicking Use current login before browser authorization.',
    );
  const response = await fetch('/api/board-api-keys', {
    ...sessionRequest,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Company Wizard temporary action',
      expiresAt: new Date(Date.now() + KEY_TTL_MS).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 405
        ? 'This Paperclip host does not support browser authorization. Configure the optional legacy paperclipEmail and paperclipPassword, or upgrade Paperclip.'
        : `Browser authorization failed (${response.status}). Sign in again and check board permissions.`,
    );
  }
  const key = await response.json();
  let workerMayBeRunning = false;
  try {
    if (
      typeof key.id !== 'string' ||
      !key.id ||
      typeof key.token !== 'string' ||
      !key.token ||
      typeof key.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(key.expiresAt)) ||
      Date.parse(key.expiresAt) <= Date.now() ||
      Date.parse(key.expiresAt) > Date.now() + KEY_TTL_MS
    ) {
      throw new Error('Paperclip did not return a valid, expiring board key.');
    }
    workerMayBeRunning = true;
    let result: unknown;
    try {
      result = await action({ ...params, credentials: { origin, token: key.token } });
    } catch {
      // A bridge timeout is not cancellation. Let worker cleanup/expiry finish;
      // revoking now could interrupt provisioning after it has already mutated state.
      throw new Error(
        'The worker may still be running. Check the company and plugin logs before retrying; its temporary key expires within one hour.',
      );
    }
    workerMayBeRunning = false;
    return result;
  } finally {
    if (!workerMayBeRunning && typeof key.id === 'string' && key.id) {
      // Never turn an already successful provisioning result into a retryable failure.
      // If the tab/network disappears, the server-enforced expiry remains the backstop.
      try {
        const revoked = await fetch(`/api/board-api-keys/${encodeURIComponent(key.id)}`, {
          ...sessionRequest,
          method: 'DELETE',
          signal: AbortSignal.timeout(5000),
        });
        if (!revoked.ok && revoked.status !== 404) throw new Error('Key cleanup failed');
      } catch {
        onWarning(
          'Company Wizard could not revoke its temporary board key. It expires within one hour; revoke it in API key settings if needed.',
        );
      }
    }
  }
}
