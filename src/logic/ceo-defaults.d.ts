export const DEFAULT_CEO_ADAPTER_TYPE: 'codex_local';
export const DEFAULT_CEO_MODEL: 'gpt-5.5';
export const DEFAULT_CEO_THINKING_LEVEL: 'high';
export const DEFAULT_WORKER_THINKING_LEVEL: 'medium';
export const DEFAULT_CEO_MAX_CONCURRENT_RUNS: 1;
export const DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC: 3600;

export function normalizeCeoAdapterType(userCeoAdapter?: Record<string, unknown>): string;

export function buildCeoAdapterConfig(options?: {
  userCeoAdapter?: Record<string, unknown>;
  companyDir?: string;
  roleAdapterOverrides?: Record<string, unknown>;
  promptTemplate?: string;
}): Record<string, unknown>;

export function buildWorkerAdapterConfig(options?: {
  userCeoAdapter?: Record<string, unknown>;
  companyDir?: string;
  roleAdapterOverrides?: Record<string, unknown>;
  promptTemplate?: string;
}): Record<string, unknown>;

export function buildCeoAgentRuntimeConfig(): {
  heartbeat: {
    enabled: boolean;
    intervalSec: number;
    maxConcurrentRuns: number;
  };
};

export function buildWorkerAgentRuntimeConfig(): {
  heartbeat: {
    enabled: boolean;
    intervalSec: number;
    maxConcurrentRuns: number;
  };
};
