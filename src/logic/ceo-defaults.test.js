import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CEO_ADAPTER_TYPE,
  DEFAULT_CEO_MAX_CONCURRENT_RUNS,
  DEFAULT_CEO_MODEL,
  DEFAULT_CEO_THINKING_LEVEL,
  buildCeoAgentRuntimeConfig,
  buildWorkerAgentRuntimeConfig,
  buildCeoAdapterConfig,
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
