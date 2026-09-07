const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Keep this boundary in sync with Paperclip's projectExecutionWorkspacePolicySchema.
// AI output may contain extra keys; the host rejects unknown policy/strategy fields.
export function normalizeExecutionWorkspacePolicy(value) {
  if (!isRecord(value)) return undefined;
  const policy = {};
  for (const key of ['enabled', 'allowIssueOverride']) {
    if (typeof value[key] === 'boolean') policy[key] = value[key];
  }
  for (const [key, allowed] of [
    [
      'defaultMode',
      ['shared_workspace', 'isolated_workspace', 'operator_branch', 'adapter_default'],
    ],
    ['sharedWorkspaceConcurrency', ['auto', 'serialize', 'allow']],
  ]) {
    const candidate = typeof value[key] === 'string' ? value[key].trim() : value[key];
    if (allowed.includes(candidate)) policy[key] = candidate;
  }
  for (const key of ['defaultProjectWorkspaceId', 'environmentId']) {
    const candidate = typeof value[key] === 'string' ? value[key].trim() : value[key];
    if (
      candidate === null ||
      (typeof candidate === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate))
    ) {
      policy[key] = candidate;
    }
  }
  if (value.workspaceStrategy === null) policy.workspaceStrategy = null;
  else if (isRecord(value.workspaceStrategy)) {
    const source = value.workspaceStrategy;
    const strategy = {};
    if (
      ['project_primary', 'git_worktree', 'adapter_managed', 'cloud_sandbox'].includes(source.type)
    ) {
      strategy.type = source.type;
    }
    for (const key of [
      'baseRef',
      'branchTemplate',
      'worktreeParentDir',
      'provisionCommand',
      'runtimeProvisionCommand',
      'teardownCommand',
    ]) {
      // Commands and templates are user configuration: preserve their exact text.
      if (source[key] === null || typeof source[key] === 'string') strategy[key] = source[key];
    }
    policy.workspaceStrategy = strategy;
  }
  for (const key of [
    'workspaceRuntime',
    'branchPolicy',
    'pullRequestPolicy',
    'runtimePolicy',
    'cleanupPolicy',
    'authorizationPolicy',
  ]) {
    if (value[key] === null) policy[key] = null;
    else if (isRecord(value[key])) policy[key] = structuredClone(value[key]);
  }
  return Object.keys(policy).length ? policy : undefined;
}

// Human-readable dotted keys must retain booleans, nulls, nested records and all
// strategy hooks. Provisioning additionally includes the complete JSON object.
export function executionWorkspacePolicyFields(policy) {
  const fields = [];
  const visit = (prefix, value) => {
    if (isRecord(value) && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value)) visit(`${prefix}.${key}`, child);
    } else if (value !== undefined) {
      fields.push([prefix, typeof value === 'string' ? value : JSON.stringify(value)]);
    }
  };
  visit('executionWorkspacePolicy', policy);
  return fields;
}
