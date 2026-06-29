export const DEFAULT_CEO_ADAPTER_TYPE = 'codex_local';
export const DEFAULT_CEO_MODEL = 'gpt-5.5';
export const DEFAULT_CEO_THINKING_LEVEL = 'high';
// Worker (non-CEO) agents default to 'auto' reasoning effort — let the model decide
// per task instead of pinning a flat level. A role can still set an explicit level
// via its role.meta.json adapter override (now propagated to provisioning).
export const DEFAULT_WORKER_THINKING_LEVEL = 'auto';
export const DEFAULT_CEO_MAX_CONCURRENT_RUNS = 1;
export const DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC = 3600;

const DEFAULT_CLAUDE_CEO_MODEL = 'claude-opus-4-6';

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCeoAdapterType(userCeoAdapter = {}) {
  return asTrimmedString(userCeoAdapter.type) || DEFAULT_CEO_ADAPTER_TYPE;
}

function buildAdapterConfig({
  userCeoAdapter = {},
  companyDir,
  roleAdapterOverrides = {},
  defaultThinkingLevel = DEFAULT_CEO_THINKING_LEVEL,
  inheritUserThinking = true,
} = {}) {
  const adapterType = normalizeCeoAdapterType(userCeoAdapter);
  const userCwd = asTrimmedString(userCeoAdapter.cwd);
  const userModel = asTrimmedString(userCeoAdapter.model);
  const overrideModel = asTrimmedString(roleAdapterOverrides.model);
  const defaultModel =
    adapterType === 'claude_local' ? DEFAULT_CLAUDE_CEO_MODEL : DEFAULT_CEO_MODEL;
  const model = userModel || overrideModel || defaultModel;
  // The CEO inherits the user-configured thinking level; worker agents do NOT — a
  // user picking xhigh for the CEO shouldn't silently turn the whole team xhigh. A
  // role can still set its own level via role.meta.json (roleAdapterOverrides).
  const userThinking = inheritUserThinking
    ? asTrimmedString(userCeoAdapter.thinkingLevel) ||
      asTrimmedString(userCeoAdapter.modelReasoningEffort) ||
      asTrimmedString(userCeoAdapter.reasoningEffort)
    : '';
  const thinkingLevel =
    userThinking ||
    asTrimmedString(roleAdapterOverrides.thinkingLevel) ||
    asTrimmedString(roleAdapterOverrides.modelReasoningEffort) ||
    asTrimmedString(roleAdapterOverrides.reasoningEffort) ||
    asTrimmedString(roleAdapterOverrides.effort) ||
    defaultThinkingLevel;

  const adapterConfig = {
    ...roleAdapterOverrides,
    cwd: userCwd || companyDir,
    ...(model ? { model } : {}),
  };
  delete adapterConfig.promptTemplate;
  delete adapterConfig.bootstrapPromptTemplate;
  // Thinking effort is applied per-adapter below from the resolved `thinkingLevel`.
  // Strip the raw override keys so they don't leak into the config (and so a
  // non-codex adapter doesn't carry a stray thinkingLevel).
  delete adapterConfig.thinkingLevel;
  delete adapterConfig.modelReasoningEffort;
  delete adapterConfig.reasoningEffort;
  delete adapterConfig.effort;

  if (adapterType === 'codex_local') {
    // Codex's `reasoning.effort` only accepts none|minimal|low|medium|high|xhigh —
    // it rejects 'auto' with a 400. 'auto' means "let the model decide", which for
    // Codex is expressed by *omitting* the param entirely (Codex picks its own
    // effort). Only set the effort when we have a concrete level the API accepts.
    const codexEffort = thinkingLevel && thinkingLevel !== 'auto' ? thinkingLevel : '';
    if (codexEffort) {
      adapterConfig.modelReasoningEffort = codexEffort;
      adapterConfig.thinkingLevel = codexEffort;
    }
    adapterConfig.dangerouslyBypassApprovalsAndSandbox = true;
  } else if (adapterType === 'claude_local') {
    adapterConfig.dangerouslySkipPermissions = true;
  }

  return adapterConfig;
}

export function buildCeoAdapterConfig(opts = {}) {
  return buildAdapterConfig({
    ...opts,
    defaultThinkingLevel: DEFAULT_CEO_THINKING_LEVEL,
    inheritUserThinking: true,
  });
}

/**
 * Adapter config for non-CEO ("worker") agents. Same adapter type/model as the CEO
 * (companies pick codex vs claude once), but defaults to a modest reasoning effort
 * (DEFAULT_WORKER_THINKING_LEVEL) and does not inherit the CEO's thinking level.
 */
export function buildWorkerAdapterConfig(opts = {}) {
  return buildAdapterConfig({
    ...opts,
    defaultThinkingLevel: DEFAULT_WORKER_THINKING_LEVEL,
    inheritUserThinking: false,
  });
}

export function buildCeoAgentRuntimeConfig() {
  return {
    heartbeat: {
      enabled: true,
      intervalSec: DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC,
      maxConcurrentRuns: DEFAULT_CEO_MAX_CONCURRENT_RUNS,
    },
  };
}

/**
 * Runtime config for non-CEO ("worker") agents. Heartbeat is DISABLED: Paperclip
 * wakes an agent when work is assigned to it (and routines drive scheduled work),
 * so always-on heartbeats for every agent are unnecessary. Enabling them for the
 * whole team at once produced a burst of concurrent/queued runs that overloaded the
 * server. The interval/concurrency are kept for when a heartbeat is later enabled.
 */
export function buildWorkerAgentRuntimeConfig() {
  return {
    heartbeat: {
      enabled: false,
      intervalSec: DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC,
      maxConcurrentRuns: DEFAULT_CEO_MAX_CONCURRENT_RUNS,
    },
  };
}
