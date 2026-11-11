import { expect, it, vi } from 'vitest';
// @ts-ignore JavaScript REST client
import { PaperclipClient } from '../src/api/client.js';

it.each([
  { baseRevisionId: '11111111-1111-4111-8111-111111111111' },
  { baseRevisionId: null },
  { baseHash: 'a'.repeat(64) },
  { baseHash: null },
])('preserves instruction optimistic-concurrency tokens: %j', async (base) => {
  const client = new PaperclipClient('http://fixture.invalid');
  client._fetch = vi.fn(async (_path: string, options: any) => JSON.parse(options.body));
  const result = await client.upsertInstructionsBundleFile('agent', {
    path: 'AGENTS.md',
    content: 'Reviewed replacement',
    ...base,
  });
  expect(result).toMatchObject(base);
});

it('sends the instruction delete path and reviewed hash as query parameters', async () => {
  const client = new PaperclipClient('http://fixture.invalid');
  client._fetch = vi.fn(async () => ({}));
  const path = 'references/a file & notes.md';
  const baseHash = 'a'.repeat(64);
  await client.deleteInstructionsBundleFile('agent', { path, baseHash });
  const [url, options] = client._fetch.mock.calls[0] as unknown as [string, RequestInit];
  const target = new URL(url, 'http://fixture.invalid');
  expect(target.searchParams.get('path')).toBe(path);
  expect(target.searchParams.get('baseHash')).toBe(baseHash);
  expect(options.method).toBe('DELETE');
  expect(options.body).toBeUndefined();
});
