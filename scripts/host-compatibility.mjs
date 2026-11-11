// Read-only exact-source probe. Usage: node scripts/host-compatibility.mjs HOST_CHECKOUT
// Requires host shared/SDK dependencies installed; never contacts a running server.
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import manifest from '../dist/manifest.js';
import { PaperclipClient } from '../src/api/client.js';
const host = resolve(process.argv[2]);
const dir = await mkdtemp(join(tmpdir(), 'wizard-host-contract-'));
const aliases = { '@paperclipai/shared': join(host, 'packages/shared/src/index.ts') };
try {
  const schemaPath = join(dir, 'schemas.mjs');
  await build({
    entryPoints: [aliases['@paperclipai/shared']],
    outfile: schemaPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: aliases,
  });
  const schemas = await import(pathToFileURL(schemaPath));
  schemas.pluginManifestV1Schema.parse(manifest);
  const client = new PaperclipClient('http://fixture.invalid');
  let schema;
  let count = 0;
  client._fetch = async (_path, options) => {
    const body = JSON.parse(options.body);
    const parsed = schemas[schema].parse(body);
    assert.deepEqual(
      Object.keys(body).filter((key) => !(key in parsed)),
      [],
      `${schema} stripped fields`,
    );
    count++;
    return { agent: { id: 'fixture' } };
  };
  const id = '11111111-1111-4111-8111-111111111111';
  schema = 'createCompanySchema';
  await client.createCompany({ name: 'Probe' });
  schema = 'createAgentHireSchema';
  await client.createAgent(id, { name: 'CEO', role: 'ceo', adapterType: 'codex_local' });
  schema = 'createProjectSchema';
  await client.createProject(id, {
    name: 'Project',
    workspace: { sourceType: 'local_path', cwd: '/tmp/probe', isPrimary: true },
  });
  schema = 'createGoalSchema';
  await client.createGoal(id, { title: 'Goal' });
  schema = 'createIssueSchema';
  await client.createIssue(id, { title: 'Bootstrap', assigneeAgentId: id });
  schema = 'companySkillCreateSchema';
  await client.createCompanySkill(id, { name: 'probe', slug: 'probe', markdown: '# Probe' });
  schema = 'companySkillFileUpdateSchema';
  await client.updateCompanySkillFile(id, id, { path: 'SKILL.md', content: '# Probe' });
  schema = 'upsertAgentInstructionsFileSchema';
  await client.upsertInstructionsBundleFile(id, {
    path: 'AGENTS.md',
    content: '# Instructions',
    baseRevisionId: id,
  });
  schema = 'createRoutineSchema';
  await client.createRoutine(id, { title: 'Routine', assigneeAgentId: id });
  console.log(
    `Exact-host manifest and ${count} real-client payloads accepted without stripped top-level fields`,
  );
  const shim = join(dir, 'sdk.ts');
  await writeFile(
    shim,
    `export { definePlugin } from ${JSON.stringify(join(host, 'packages/plugins/sdk/src/define-plugin.ts'))};\nexport { runWorker } from ${JSON.stringify(join(host, 'packages/plugins/sdk/src/worker-rpc-host.ts'))};\n`,
  );
  const worker = join(dir, 'worker.mjs');
  await build({
    entryPoints: [resolve('dist/worker.js')],
    outfile: worker,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { ...aliases, '@paperclipai/plugin-sdk': shim },
  });
  const child = spawn(process.execPath, [worker], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '',
    stderr = '';
  const pending = new Map();
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  child.stdout.on('data', (data) => {
    buffer += data;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const waiter = pending.get(msg.id);
      if (waiter && !msg.method) {
        pending.delete(msg.id);
        msg.error
          ? waiter.reject(new Error(JSON.stringify(msg.error)))
          : waiter.resolve(msg.result);
      } else if (msg.method && msg.id !== undefined) {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\n');
      }
    }
  });
  let seq = 0;
  async function rpc(method, params) {
    const id = ++seq;
    return Promise.race([
      new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      }),
      new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error(`RPC timeout: ${method}; ${stderr}`)), 10000);
        t.unref();
      }),
    ]);
  }
  try {
    const initialized = await rpc('initialize', {
      manifest,
      config: {},
      hostVersion: '2026.1106.0',
    });
    assert(initialized);
    const result = await rpc('performAction', { key: 'start-provision', params: {} });
    assert.equal(result.error, 'companyName is required');
    console.log(
      'Built worker loads with exact-host SDK, initializes over stdio JSON-RPC, and executes action validation',
    );
  } finally {
    child.kill();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
