// Updating a company must target its live projects, not regenerate a guessed
// project/worktree from its display name. Only the execution policy is writable.
export function resolveExistingProjects(companyId, liveProjects, requested = []) {
  if (!Array.isArray(liveProjects)) throw new Error('Paperclip returned an invalid project list');
  const live = liveProjects.filter((p) => p?.companyId === companyId && p?.id);
  const selections = requested.length ? requested : live;
  const seen = new Set();
  return selections.map((requestedProject) => {
    const matches = live.filter((p) =>
      requestedProject.id ? p.id === requestedProject.id : p.name === requestedProject.name,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Cannot uniquely match existing project "${requestedProject.name || requestedProject.id}" in this company; select its exact project ID.`,
      );
    }
    const project = matches[0];
    if (seen.has(project.id)) throw new Error(`Duplicate project selection: ${project.id}`);
    seen.add(project.id);
    const policy = {
      enabled: true,
      defaultMode: 'shared_workspace',
      ...(project.executionWorkspacePolicy || {}),
      ...(requestedProject.executionWorkspacePolicy || {}),
    };
    // Preserve nested operator policy values when an explicit selection changes
    // only one strategy field; null remains a deliberate reset.
    if (
      requestedProject.executionWorkspacePolicy?.workspaceStrategy &&
      project.executionWorkspacePolicy?.workspaceStrategy
    ) {
      policy.workspaceStrategy = {
        ...project.executionWorkspacePolicy.workspaceStrategy,
        ...requestedProject.executionWorkspacePolicy.workspaceStrategy,
      };
    }
    const workspace =
      project.workspaces?.find((w) => w.id === policy.defaultProjectWorkspaceId) ||
      project.primaryWorkspace ||
      project.workspaces?.find((w) => w.isPrimary);
    return {
      id: project.id,
      name: project.name,
      description: project.description || '',
      goals: (project.goals || []).map((g) => g.title).filter(Boolean),
      workspace: workspace ? structuredClone(workspace) : undefined,
      executionWorkspacePolicy: policy,
    };
  });
}

export function projectPolicyChanges(liveProjects, assembledProjects) {
  return assembledProjects
    .filter((p) => p.id)
    .map((project) => {
      const existing = liveProjects.find((p) => p.id === project.id);
      if (!existing) throw new Error(`Existing project disappeared: ${project.id}`);
      return {
        id: project.id,
        name: project.name,
        before: existing.executionWorkspacePolicy || null,
        after: project.executionWorkspacePolicy,
      };
    });
}
