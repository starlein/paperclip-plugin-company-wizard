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
