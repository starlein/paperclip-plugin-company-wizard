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
  it('defaults new CEOs to Codex GPT-5.5 high thinking with one heartbeat run', () => {
    assert.equal(DEFAULT_CEO_ADAPTER_TYPE, 'codex_local');
    assert.equal(DEFAULT_CEO_MODEL, 'gpt-5.5');
    assert.equal(DEFAULT_CEO_THINKING_LEVEL, 'high');
    assert.equal(DEFAULT_CEO_MAX_CONCURRENT_RUNS, 1);

    assert.equal(normalizeCeoAdapterType({}), 'codex_local');
    assert.deepEqual(
      buildCeoAdapterConfig({ userCeoAdapter: {}, companyDir: '/paperclip/companies/Dialer' }),
      {
        cwd: '/paperclip/companies/Dialer',
        model: 'gpt-5.5',
        modelReasoningEffort: 'high',
        thinkingLevel: 'high',
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
        model: 'gpt-5.5',
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
        model: 'gpt-5.5',
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
        model: 'gpt-5.5',
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
        model: 'gpt-5.5',
        modelReasoningEffort: 'high',
        thinkingLevel: 'high',
        dangerouslyBypassApprovalsAndSandbox: true,
      },
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
