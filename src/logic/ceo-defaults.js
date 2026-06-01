export const DEFAULT_CEO_ADAPTER_TYPE = 'codex_local';
export const DEFAULT_CEO_MODEL = 'gpt-5.5';
export const DEFAULT_CEO_THINKING_LEVEL = 'high';
export const DEFAULT_CEO_MAX_CONCURRENT_RUNS = 1;
export const DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC = 3600;

const DEFAULT_CLAUDE_CEO_MODEL = 'claude-opus-4-6';

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCeoAdapterType(userCeoAdapter = {}) {
  return asTrimmedString(userCeoAdapter.type) || DEFAULT_CEO_ADAPTER_TYPE;
}

export function buildCeoAdapterConfig({
  userCeoAdapter = {},
  companyDir,
  roleAdapterOverrides = {},
  promptTemplate = '',
} = {}) {
  const adapterType = normalizeCeoAdapterType(userCeoAdapter);
  const userCwd = asTrimmedString(userCeoAdapter.cwd);
  const userModel = asTrimmedString(userCeoAdapter.model);
  const overrideModel = asTrimmedString(roleAdapterOverrides.model);
  const defaultModel =
    adapterType === 'claude_local' ? DEFAULT_CLAUDE_CEO_MODEL : DEFAULT_CEO_MODEL;
  const model = userModel || overrideModel || defaultModel;
  const thinkingLevel =
    asTrimmedString(userCeoAdapter.thinkingLevel) ||
    asTrimmedString(userCeoAdapter.modelReasoningEffort) ||
    asTrimmedString(userCeoAdapter.reasoningEffort) ||
    asTrimmedString(roleAdapterOverrides.thinkingLevel) ||
    asTrimmedString(roleAdapterOverrides.modelReasoningEffort) ||
    asTrimmedString(roleAdapterOverrides.reasoningEffort) ||
    DEFAULT_CEO_THINKING_LEVEL;

  const adapterConfig = {
    ...roleAdapterOverrides,
    cwd: userCwd || companyDir,
    ...(asTrimmedString(promptTemplate) ? { promptTemplate } : {}),
    ...(model ? { model } : {}),
  };

  if (adapterType === 'codex_local') {
    adapterConfig.modelReasoningEffort = thinkingLevel;
    adapterConfig.thinkingLevel = thinkingLevel;
    adapterConfig.dangerouslyBypassApprovalsAndSandbox = true;
  } else if (adapterType === 'claude_local') {
    adapterConfig.dangerouslySkipPermissions = true;
  }

  return adapterConfig;
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
