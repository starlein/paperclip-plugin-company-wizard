const BASE_ROLE_MAP = {
  ceo: 'ceo',
  engineer: 'engineer',
};

/**
 * Minimal Paperclip API client using native fetch.
 * Supports both local_trusted (no auth) and authenticated instances.
 *
 * Usage:
 *   const client = new PaperclipClient('http://localhost:3100', { email, password });
 *   await client.connect(); // auto-detects auth requirement, signs in if needed
 */
export class PaperclipClient {
  constructor(baseUrl = 'http://localhost:3100', credentials = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.origin = new URL(this.baseUrl).origin;
    this.credentials = credentials; // { email, password } — optional
    this.sessionCookie = null;
    this.boardUserId = null; // resolved during connect()
    this.boardUserName = null; // resolved during connect()
    this.boardUserEmail = null; // resolved during connect()
  }

  async _fetch(path, opts = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json', Origin: this.origin, ...opts.headers };
    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }
    let res;
    try {
      res = await fetch(url, { ...opts, headers });
    } catch (err) {
      throw new Error(
        `${opts.method || 'GET'} ${path} — network error: ${err.message}. Is Paperclip running at ${this.baseUrl}?`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${body}`);
    }
    return res.json();
  }

  /**
   * Connect to the Paperclip instance.
   * Pings the API — if auth is required and credentials are available, signs in.
   * For local_trusted instances this is a no-op beyond the connectivity check.
   */
  async connect() {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/companies`, {
        method: 'GET',
        headers: { Origin: this.origin },
      });
    } catch (err) {
      // Network error (connection refused, DNS failure, wrong port, etc.)
      throw new Error(
        `Could not reach Paperclip at ${this.baseUrl} (${err.message}).\n` +
          `  If your instance runs on a different port, set paperclipUrl in plugin settings.`,
      );
    }

    // local_trusted — no auth needed
    if (res.ok) {
      this.boardUserId = 'local-board';
      this.boardUserName = null;
      this.boardUserEmail = null;
      return;
    }

    // Auth required
    if (res.status === 401 || res.status === 403) {
      const { email, password } = this.credentials;
      if (!email || !password) {
        throw new Error(
          `Paperclip instance requires authentication.\n` +
            `  Configure paperclipEmail and paperclipPassword in plugin settings.`,
        );
      }
      await this._signIn(email, password);
      // Fetch the authenticated user's profile for assigneeUserId and git identity support
      try {
        const session = await this._fetch('/api/auth/get-session');
        this.boardUserId = session?.user?.id || null;
        this.boardUserName = session?.user?.name || null;
        this.boardUserEmail = session?.user?.email || null;
      } catch {
        // Non-critical — user assignment will fall back to unassigned
      }
      return;
    }

    throw new Error(
      `Paperclip API at ${this.baseUrl} returned unexpected status ${res.status}.\n` +
        `  Check that paperclipUrl in plugin settings points to the correct instance.`,
    );
  }

  /**
   * Authenticate via Better Auth email/password sign-in.
   * Captures the session cookie for subsequent requests.
   */
  async _signIn(email, password) {
    const res = await fetch(`${this.baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: this.origin },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    });

    if (!res.ok && res.status !== 302) {
      const body = await res.text().catch(() => '');
      throw new Error(`Authentication failed (${res.status}): ${body}`);
    }

    // Capture set-cookie header(s)
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length === 0) {
      // Fallback: some runtimes use get('set-cookie')
      const raw = res.headers.get('set-cookie');
      if (raw) setCookie.push(...raw.split(/,(?=\s*\w+=)/));
    }

    this.sessionCookie = setCookie
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    if (!this.sessionCookie) {
      throw new Error('Authentication succeeded but no session cookie received.');
    }
  }

  async ping() {
    try {
      const headers = { Origin: this.origin };
      if (this.sessionCookie) headers['Cookie'] = this.sessionCookie;
      const res = await fetch(`${this.baseUrl}/api/companies`, {
        method: 'GET',
        headers,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Read instance-wide experimental settings (including enableIsolatedWorkspaces).
   */
  async getInstanceExperimentalSettings() {
    return this._fetch('/api/instance/settings/experimental');
  }

  async createCompany({ name, description }) {
    return this._fetch('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || null }),
    });
  }

  /**
   * List all companies the connected identity can see.
   * Returns the raw array from `GET /api/companies`.
   */
  async listCompanies() {
    const result = await this._fetch('/api/companies', { method: 'GET' });
    return Array.isArray(result) ? result : (result?.companies ?? []);
  }

  async updateCompany(companyId, updates) {
    return this._fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteCompany(companyId) {
    return this._fetch(`/api/companies/${companyId}`, { method: 'DELETE' });
  }

  async getCompany(companyId) {
    return this._fetch(`/api/companies/${companyId}`, { method: 'GET' });
  }

  async listAgents(companyId) {
    return this._fetch(`/api/companies/${companyId}/agents`, { method: 'GET' });
  }

  async getAgent(agentId) {
    return this._fetch(`/api/agents/${agentId}`, { method: 'GET' });
  }

  async updateAgent(agentId, updates) {
    return this._fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async updateInstructionsBundle(agentId, updates) {
    return this._fetch(`/api/agents/${agentId}/instructions-bundle`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async upsertInstructionsBundleFile(
    agentId,
    { path: filePath, content, clearLegacyPromptTemplate },
  ) {
    return this._fetch(`/api/agents/${agentId}/instructions-bundle/file`, {
      method: 'PUT',
      body: JSON.stringify({
        path: filePath,
        content,
        ...(clearLegacyPromptTemplate !== undefined
          ? { clearLegacyPromptTemplate: !!clearLegacyPromptTemplate }
          : {}),
      }),
    });
  }

  async getInstructionsBundle(agentId) {
    return this._fetch(`/api/agents/${agentId}/instructions-bundle`, {
      method: 'GET',
    });
  }

  async deleteInstructionsBundleFile(agentId, { path }) {
    return this._fetch(`/api/agents/${agentId}/instructions-bundle/file`, {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    });
  }

  async createAgent(companyId, agent) {
    const {
      name,
      role,
      title,
      icon,
      reportsTo,
      capabilities,
      tags,
      desiredSkills,
      adapterType,
      adapterConfig,
      runtimeConfig,
      budgetMonthlyCents,
      permissions,
      metadata,
      instructionsBundle,
      sourceIssueId,
      sourceIssueIds,
    } = agent || {};
    const payload = {
      name,
      role,
      title: title || null,
      ...(icon !== undefined ? { icon: icon || null } : {}),
      reportsTo: reportsTo || null,
      ...(capabilities !== undefined ? { capabilities: capabilities || null } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(desiredSkills !== undefined ? { desiredSkills } : {}),
      adapterType: adapterType || 'codex_local',
      adapterConfig: adapterConfig || {},
      ...(runtimeConfig ? { runtimeConfig } : {}),
      ...(budgetMonthlyCents !== undefined ? { budgetMonthlyCents } : {}),
      ...(permissions ? { permissions } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(instructionsBundle !== undefined ? { instructionsBundle } : {}),
      ...(sourceIssueId !== undefined ? { sourceIssueId } : {}),
      ...(sourceIssueIds !== undefined ? { sourceIssueIds } : {}),
    };

    const hireResult = await this._fetch(`/api/companies/${companyId}/agent-hires`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const hiredAgent = hireResult?.agent || null;
    const approvalId = hireResult?.approval?.id || null;
    if (!hiredAgent) {
      throw new Error('Agent hire endpoint returned no agent.');
    }

    if (approvalId) {
      return {
        ...hiredAgent,
        _pendingApprovalId: approvalId,
      };
    }

    return hiredAgent;
  }

  async createProject(
    companyId,
    { name, description, goalIds, workspace, executionWorkspacePolicy },
  ) {
    const workspacePayload =
      typeof workspace === 'string'
        ? { sourceType: 'local_path', cwd: workspace, isPrimary: true }
        : workspace || undefined;
    return this._fetch(`/api/companies/${companyId}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: description || null,
        ...(goalIds?.length ? { goalIds } : {}),
        workspace: workspacePayload,
        ...(executionWorkspacePolicy ? { executionWorkspacePolicy } : {}),
      }),
    });
  }

  async updateProject(projectId, updates = {}) {
    return this._fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async createGoal(companyId, { title, description, level, parentId, status, ownerAgentId }) {
    return this._fetch(`/api/companies/${companyId}/goals`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: description || null,
        level: level || 'company',
        status: status || 'active',
        ...(parentId ? { parentId } : {}),
        ...(ownerAgentId ? { ownerAgentId } : {}),
      }),
    });
  }

  async createIssue(
    companyId,
    {
      title,
      description,
      status,
      priority,
      parentId,
      projectId,
      projectWorkspaceId,
      goalId,
      labelIds,
      assigneeAgentId,
      assigneeUserId,
      executionWorkspacePreference,
      executionWorkspaceSettings,
      executionPolicy,
      blockedByIssueIds,
      blockParentUntilDone,
    },
  ) {
    return this._fetch(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: description || null,
        status: status || undefined,
        priority: priority || 'medium',
        parentId: parentId || undefined,
        projectId: projectId || undefined,
        projectWorkspaceId: projectWorkspaceId || undefined,
        goalId: goalId || undefined,
        labelIds: labelIds || undefined,
        assigneeAgentId: assigneeAgentId || undefined,
        assigneeUserId: assigneeUserId || undefined,
        executionWorkspacePreference: executionWorkspacePreference || undefined,
        executionWorkspaceSettings: executionWorkspaceSettings || undefined,
        executionPolicy: executionPolicy || undefined,
        blockedByIssueIds: blockedByIssueIds || undefined,
        blockParentUntilDone: blockParentUntilDone || undefined,
      }),
    });
  }

  async updateIssue(issueId, updates = {}) {
    return this._fetch(`/api/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async putIssueDocument(issueId, key, { title, format, body, baseRevisionId }) {
    return this._fetch(`/api/issues/${issueId}/documents/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        format: format || 'markdown',
        body: body || '',
        ...(baseRevisionId !== undefined ? { baseRevisionId } : {}),
      }),
    });
  }

  async createRoutine(
    companyId,
    {
      title,
      description,
      assigneeAgentId,
      projectId,
      priority,
      status,
      concurrencyPolicy,
      catchUpPolicy,
    },
  ) {
    return this._fetch(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: description || null,
        assigneeAgentId: assigneeAgentId || undefined,
        projectId: projectId || undefined,
        priority: priority || 'medium',
        status: status || 'active',
        concurrencyPolicy: concurrencyPolicy || 'skip_if_active',
        catchUpPolicy: catchUpPolicy || 'skip_missed',
      }),
    });
  }

  async listRoutines(companyId, filters = {}) {
    const params = new URLSearchParams();
    if (filters.projectId) params.set('projectId', filters.projectId);
    const query = params.toString();
    return this._fetch(`/api/companies/${companyId}/routines${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
  }

  async getRoutine(routineId) {
    return this._fetch(`/api/routines/${routineId}`, { method: 'GET' });
  }

  async updateRoutine(routineId, updates = {}) {
    return this._fetch(`/api/routines/${routineId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async createRoutineTrigger(routineId, { kind, cronExpression, timezone }) {
    return this._fetch(`/api/routines/${routineId}/triggers`, {
      method: 'POST',
      body: JSON.stringify({
        kind: kind || 'schedule',
        ...(cronExpression ? { cronExpression } : {}),
        ...(timezone ? { timezone } : {}),
      }),
    });
  }

  async updateRoutineTrigger(triggerId, updates = {}) {
    return this._fetch(`/api/routine-triggers/${triggerId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates || {}),
    });
  }

  async triggerHeartbeat(agentId, { issueId } = {}) {
    return this._fetch(`/api/agents/${agentId}/wakeup`, {
      method: 'POST',
      body: JSON.stringify({
        source: 'on_demand',
        triggerDetail: 'manual',
        ...(issueId ? { payload: { issueId } } : {}),
      }),
    });
  }

  /**
   * Resolve a role name to a Paperclip API role enum.
   * Uses role.json's paperclipRole field, falls back to 'general'.
   */
  static resolveRole(roleName, roleData) {
    // Check base roles first
    if (BASE_ROLE_MAP[roleName]) return BASE_ROLE_MAP[roleName];
    // Check role.json data
    if (roleData?.paperclipRole) return roleData.paperclipRole;
    return 'general';
  }
}
