import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CEO_ADAPTER_TYPE,
  DEFAULT_CEO_MAX_CONCURRENT_RUNS,
  DEFAULT_CEO_MODEL,
  DEFAULT_CEO_THINKING_LEVEL,
  DEFAULT_WORKER_THINKING_LEVEL,
  buildCeoAgentRuntimeConfig,
  buildWorkerAgentRuntimeConfig,
  buildCeoAdapterConfig,
  buildWorkerAdapterConfig,
  normalizeCeoAdapterType,
} from './ceo-defaults.js';

describe('CEO provisioning defaults', () => {
  it('omits unselected models and reasoning for every supported adapter', () => {
    for (const build of [buildCeoAdapterConfig, buildWorkerAdapterConfig]) {
      for (const type of ['codex_local', 'claude_local', 'custom']) {
        const config = build({ userCeoAdapter: { type, model: '  ' }, companyDir: '/company' });
        for (const key of ['model', 'thinkingLevel', 'modelReasoningEffort', 'effort']) {
          assert.ok(!Object.hasOwn(config, key), `${build.name} ${type} must omit ${key}`);
        }
      }
    }
  });
  it('defaults new CEOs to host model and reasoning with one heartbeat run', () => {
    assert.equal(DEFAULT_CEO_ADAPTER_TYPE, 'codex_local');
    assert.equal(DEFAULT_CEO_MODEL, '');
    assert.equal(DEFAULT_CEO_THINKING_LEVEL, 'auto');
    assert.equal(DEFAULT_CEO_MAX_CONCURRENT_RUNS, 1);

    assert.equal(normalizeCeoAdapterType({}), 'codex_local');
    assert.deepEqual(
      buildCeoAdapterConfig({ userCeoAdapter: {}, companyDir: '/paperclip/companies/Dialer' }),
      {
        cwd: '/paperclip/companies/Dialer',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
    assert.deepEqual(buildCeoAgentRuntimeConfig(), {
      heartbeat: { enabled: true, intervalSec: 3600, maxConcurrentRuns: 1 },
    });
  });

  it('disables always-on heartbeats for worker agents (woken on assignment + routines)', () => {
    assert.deepEqual(buildWorkerAgentRuntimeConfig(), {
      heartbeat: { enabled: false, intervalSec: 3600, maxConcurrentRuns: 1 },
    });
  });

  it('defaults worker agents to auto thinking and does not inherit the CEO thinking level', () => {
    assert.equal(DEFAULT_WORKER_THINKING_LEVEL, 'auto');

    // CEO configured xhigh — workers must NOT inherit it; they default to auto.
    // 'auto' is NOT a value Codex's `reasoning.effort` accepts — for codex_local it
    // is expressed by *omitting* the param entirely (Codex picks its own effort), so
    // neither modelReasoningEffort nor thinkingLevel is set on the adapter config.
    assert.deepEqual(
      buildWorkerAdapterConfig({
        userCeoAdapter: { thinkingLevel: 'xhigh' },
        companyDir: '/paperclip/companies/Dialer',
      }),
      {
        cwd: '/paperclip/companies/Dialer',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
  });

  it('lets a role override set a worker thinking level above the auto default', () => {
    assert.deepEqual(
      buildWorkerAdapterConfig({
        userCeoAdapter: { thinkingLevel: 'xhigh' },
        companyDir: '/paperclip/companies/Dialer',
        roleAdapterOverrides: { thinkingLevel: 'high' },
      }),
      {
        cwd: '/paperclip/companies/Dialer',
        modelReasoningEffort: 'high',
        thinkingLevel: 'high',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
  });

  it('omits reasoning effort entirely for codex_local when the resolved level is auto', () => {
    // An explicit `auto` role override must NOT be passed through — Codex rejects
    // 'auto' with a 400; "let the model decide" is expressed by omitting the field.
    assert.deepEqual(
      buildWorkerAdapterConfig({
        userCeoAdapter: {},
        companyDir: '/paperclip/companies/Dialer',
        roleAdapterOverrides: { thinkingLevel: 'auto' },
      }),
      {
        cwd: '/paperclip/companies/Dialer',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
  });

  it('normalizes a role override expressed as `effort` and does not leak the raw key', () => {
    assert.deepEqual(
      buildWorkerAdapterConfig({
        userCeoAdapter: {},
        companyDir: '/paperclip/companies/Dialer',
        roleAdapterOverrides: { effort: 'high' },
      }),
      {
        cwd: '/paperclip/companies/Dialer',
        modelReasoningEffort: 'high',
        thinkingLevel: 'high',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
  });

  for (const build of [buildCeoAdapterConfig, buildWorkerAdapterConfig]) {
    for (const engine of ['cli', 'acp', 'auto']) {
      it(`${build.name} forwards explicit ${engine} engine over role defaults`, () => {
        const config = build({
          userCeoAdapter: { engine },
          companyDir: '/paperclip/companies/Dialer',
          roleAdapterOverrides: { engine: engine === 'cli' ? 'acp' : 'cli' },
        });
        assert.equal(config.engine, engine);
      });
    }

    it(`${build.name} leaves the engine unpinned without a supported explicit selection`, () => {
      for (const engine of [undefined, null, '', 'unknown', ' CLI ', {}, false]) {
        const config = build({ userCeoAdapter: { engine }, companyDir: '/company' });
        assert.ok(!Object.hasOwn(config, 'engine'));
      }
    });

    it(`${build.name} preserves a role engine when the user does not select one`, () => {
      const config = build({
        userCeoAdapter: {},
        companyDir: '/company',
        roleAdapterOverrides: { engine: 'cli' },
      });
      assert.equal(config.engine, 'cli');
    });
  }

  it('preserves explicit models, functional overrides and Claude thinking without pinning defaults', () => {
    for (const build of [buildCeoAdapterConfig, buildWorkerAdapterConfig]) {
      const config = build({
        userCeoAdapter: { type: 'claude_local', model: 'operator-model', engine: 'acp' },
        roleAdapterOverrides: { model: 'custom-model', effort: 'low', chrome: true },
      });
      assert.equal(config.model, 'operator-model');
      assert.equal(config.engine, 'acp');
      assert.equal(config.effort, 'low');
      assert.equal(config.chrome, true);
      assert.ok(!Object.hasOwn(config, 'modelReasoningEffort'));
      assert.equal(
        build({ roleAdapterOverrides: { model: 'custom-model' } }).model,
        'custom-model',
      );
    }
    assert.equal(
      buildCeoAdapterConfig({ userCeoAdapter: { type: 'claude_local', thinkingLevel: 'high' } })
        .effort,
      'high',
    );
  });

  it('preserves explicit CEO adapter overrides while keeping Codex safety defaults', () => {
    assert.deepEqual(
      buildCeoAdapterConfig({
        userCeoAdapter: {
          cwd: '/custom/workspace',
          model: 'gpt-5.4',
          thinkingLevel: 'xhigh',
        },
        companyDir: '/paperclip/companies/Dialer',
        roleAdapterOverrides: { fastMode: true, promptTemplate: 'legacy role override' },
        promptTemplate: 'You are the CEO.',
      }),
      {
        fastMode: true,
        cwd: '/custom/workspace',
        model: 'gpt-5.4',
        modelReasoningEffort: 'xhigh',
        thinkingLevel: 'xhigh',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    );
  });
});
