import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_CEO_ADAPTER_TYPE,
  DEFAULT_CEO_MODEL,
  DEFAULT_CEO_THINKING_LEVEL,
  DEFAULT_CEO_MAX_CONCURRENT_RUNS,
  DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC,
} from './ceo-defaults.js';
// modulesWithActiveGoals removed — goals no longer contain issues

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest, { skipExt } = {}) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (skipExt && entry.name.endsWith(skipExt)) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, { skipExt });
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function appendToFile(filePath, content) {
  if (await exists(filePath)) {
    await appendFile(filePath, content);
  }
}

// Enrichment fragments are persona additions (domain lenses, done-criteria,
// output bars). They are never emitted as standalone files — assembly appends them
// into SOUL.md / HEARTBEAT.md / skill files for roles/modules that provide them.
function isEnrichmentFragment(name) {
  return name === 'LENSES.md' || name === 'DONE.md' || name.endsWith('.bar.md');
}

async function readJson(p) {
  if (!(await exists(p))) return null;
  return JSON.parse(await readFile(p, 'utf-8'));
}

/**
 * Convert a company name to PascalCase for the directory name.
 * "Black Mesa" → "BlackMesa", "my-company" → "MyCompany"
 */
export function toPascalCase(name) {
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function normalizeExecutionBaseRef(ref, fallbackRef) {
  const candidates = [ref, fallbackRef].filter(
    (value) => typeof value === 'string' && value.trim(),
  );
  const selected = candidates.length > 0 ? String(candidates[0]).trim() : '';
  return selected || null;
}

/**
 * Assemble a company workspace from templates.
 *
 * @param {object} opts
 * @param {string} opts.companyName
 * @param {string} [opts.companyDescription] - Comprehensive company description
 * @param {Array} [opts.userGoals] - User/AI-specified goals: [{ title, description, parentGoal? }]
 * @param {Array} [opts.userProjects] - User/AI-specified projects: [{ name, description, goals[] }]
 * @param {string[]} opts.moduleNames
 * @param {string[]} opts.extraRoleNames
 * @param {Array} opts.inlineGoals - Inline goals from preset/modules (from collectGoals)
 * @param {Array} [opts.presetIssues] - Initial issues from the selected preset
 * @param {Array} [opts.presetRoutines] - Initial routines from the selected preset
 * @param {Array} [opts.presetLabels] - Explicit labels from the selected preset
 * @param {boolean} [opts.enableIsolatedWorktrees] - Admin setting: when true, external-repo projects keep their isolated git_worktree executionWorkspacePolicy; when false (default), agents share the project workspace. Fresh local repos never use isolated worktrees regardless.
 * @param {boolean} [opts.enableEnrichedPersonas] - Internal escape hatch. Defaults true: append role LENSES.md to SOUL.md, role DONE.md to HEARTBEAT.md, and primary-skill <skill>.bar.md output bars when fragments exist.
 * @param {string} [opts.gitUserName] - Git user name for initial commit (falls back to "Paperclip Bootstrap")
 * @param {string} [opts.gitUserEmail] - Git user email for initial commit (falls back to "bootstrap@paperclip.local")
 * @param {string} opts.outputDir
 * @param {string} opts.templatesDir
 * @param {(line: string) => void} opts.onProgress
 * @returns {Promise<{companyDir: string, allRoles: Set<string>, initialIssues: Array, initialRoutines: Array, roleAdapterOverrides: Map<string, object>, mainProject: {name: string, description: string, workspace: object}|null}>}
 */
export async function assembleCompany({
  companyName,
  companyDescription = '',
  userGoals = [],
  userProjects = [],
  moduleNames,
  extraRoleNames,
  inlineGoals = [],
  userIssues = [],
  presetIssues = [],
  presetRoutines = [],
  presetLabels = [],
  enableIsolatedWorktrees = false,
  enableEnrichedPersonas = true,
  gitUserName,
  gitUserEmail,
  outputDir,
  templatesDir,
  onProgress = () => {},
}) {
  // --- Merge goals ---
  // The first user goal is the "main" company goal.
  // Module inline goals become sub-goals of the main goal.
  // Subgoals (formerly milestones) are expanded into allGoals with parentGoal + level.
  const mainGoal = userGoals[0] || null;
  const mergedInlineGoals = inlineGoals.map((g) => ({
    ...g,
    parentGoal: g.parentGoal || mainGoal?.title || undefined,
  }));

  const allGoals = [];
  for (const g of [...userGoals, ...mergedInlineGoals]) {
    allGoals.push(g);
    // Expand subgoals as nested goals
    if (g.subgoals?.length) {
      for (const sg of g.subgoals) {
        allGoals.push({
          title: sg.title,
          description: sg.description || '',
          level: sg.level || 'team',
          parentGoal: g.title,
        });
      }
    }
  }

  // If user specified projects, use them. Otherwise, create a default project linked to all goals.
  const resolvedProjects =
    userProjects.length > 0
      ? userProjects
      : [
          {
            name: companyName,
            description: mainGoal?.description || '',
            goals: allGoals.map((g) => g.title),
          },
        ];

  const baseDirName = toPascalCase(companyName);
  let dirName = baseDirName;
  let companyDir = join(outputDir, dirName);

  if (await exists(companyDir)) {
    let idx = 2;
    while (await exists(join(outputDir, `${baseDirName}${idx}`))) idx++;
    dirName = `${baseDirName}${idx}`;
    companyDir = join(outputDir, dirName);
  }

  // Discover base roles from roles/ directory (those with base: true in role.meta.json)
  const rolesDir = join(templatesDir, 'roles');
  const baseRoleNames = [];
  const roleMetaByName = new Map();
  if (await exists(rolesDir)) {
    const roleDirs = await readdir(rolesDir, { withFileTypes: true });
    for (const dir of roleDirs) {
      if (!dir.isDirectory()) continue;
      const roleMeta = await readJson(join(rolesDir, dir.name, 'role.meta.json'));
      if (roleMeta && typeof roleMeta === 'object') {
        roleMetaByName.set(dir.name, roleMeta);
      }
      if (roleMeta?.base) {
        baseRoleNames.push(dir.name);
      }
    }
  }

  // Determine all roles present
  const allRoles = new Set([...baseRoleNames, ...extraRoleNames]);

  // Validate module dependencies before starting assembly.
  // Skip modules that won't activate (missing directory or gated by activatesWithRoles).
  const selectedSet = new Set(moduleNames);
  for (const moduleName of moduleNames) {
    const moduleDir = join(templatesDir, 'modules', moduleName);
    if (!(await exists(moduleDir))) continue;
    const moduleJson = await readJson(join(moduleDir, 'module.meta.json'));
    if (moduleJson?.activatesWithRoles?.length) {
      const hasActivatingRole = moduleJson.activatesWithRoles.some((r) => allRoles.has(r));
      if (!hasActivatingRole) continue;
    }
    const deps = moduleJson?.requires || [];
    for (const dep of deps) {
      if (!selectedSet.has(dep)) {
        throw new Error(`Module "${moduleName}" requires module "${dep}", which is not selected`);
      }
    }
  }

  // 1. Copy base roles (exclude .meta.json metadata)
  for (const roleName of baseRoleNames) {
    const roleSrc = join(rolesDir, roleName);
    const roleDest = join(companyDir, 'agents', roleName);
    await mkdir(roleDest, { recursive: true });
    const entries = await readdir(roleSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Role roots are flat — enrichment fragments (LENSES.md/DONE.md/*.bar.md)
        // live at the role root, not in subdirs, so copyDir need only skip metadata.
        await copyDir(join(roleSrc, entry.name), join(roleDest, entry.name), {
          skipExt: '.meta.json',
        });
      } else if (!entry.name.endsWith('.meta.json') && !isEnrichmentFragment(entry.name)) {
        await copyFile(join(roleSrc, entry.name), join(roleDest, entry.name));
      }
    }
    onProgress(`+ agents/${roleName}/ (base)`);
  }

  // 2. Copy extra roles from roles/
  for (const roleName of extraRoleNames) {
    const roleDir = join(rolesDir, roleName);
    if (!(await exists(roleDir))) {
      onProgress(`! role ${roleName} not found, skipping`);
      continue;
    }
    const destDir = join(companyDir, 'agents', roleName);
    await mkdir(destDir, { recursive: true });
    const entries = await readdir(roleDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || !entry.name.endsWith('.md')) continue;
      if (isEnrichmentFragment(entry.name)) continue;
      await copyFile(join(roleDir, entry.name), join(destDir, entry.name));
    }
    onProgress(`+ agents/${roleName}/ (role)`);
  }

  // 3. Apply modules with capability-aware skill assignment
  const initialIssues = Array.isArray(presetIssues)
    ? presetIssues.map((issue) => ({ ...issue, source: issue.source || 'preset' }))
    : [];
  const initialRoutines = Array.isArray(presetRoutines)
    ? presetRoutines.map((routine) => ({ ...routine, source: routine.source || 'preset' }))
    : [];
  const explicitBootstrapLabels = Array.isArray(presetLabels) ? [...presetLabels] : [];
  const roleAdapterOverrides = new Map(); // role name → merged adapter overrides (role.meta.json baseline + modules)
  // Seed each role's adapter baseline from its role.meta.json so the per-role thinking
  // level (e.g. "auto") reaches provisioning — module adapterOverrides merge on top
  // below (module wins). Without this seed, only module overrides were propagated and
  // every worker fell back to the flat DEFAULT_WORKER_THINKING_LEVEL.
  for (const role of allRoles) {
    const roleMeta = roleMetaByName.get(role) || {};
    const adapter = roleMeta && typeof roleMeta.adapter === 'object' ? roleMeta.adapter : {};
    const thinkingLevel =
      (typeof adapter.thinkingLevel === 'string' && adapter.thinkingLevel.trim()) ||
      (typeof adapter.modelReasoningEffort === 'string' && adapter.modelReasoningEffort.trim()) ||
      (typeof adapter.reasoningEffort === 'string' && adapter.reasoningEffort.trim()) ||
      (typeof adapter.effort === 'string' && adapter.effort.trim()) ||
      '';
    if (thinkingLevel) {
      roleAdapterOverrides.set(role, { thinkingLevel });
    }
  }
  // doc filename → Set of roles it is relevant to. A doc whose owning module has no
  // role association (company-wide) is marked with the '*' sentinel and goes to all
  // agents. Used so each agent only references the docs that matter to its role.
  const docRoleMap = new Map();
  const addDocRoles = (docName, roles) => {
    const set = docRoleMap.get(docName) ?? new Set();
    for (const r of roles) set.add(r);
    docRoleMap.set(docName, set);
  };

  // Track issue titles already queued so module issues don't duplicate a curated
  // preset issue (or an earlier module's issue). Preset issues are seeded first, so
  // the richer preset version always wins over a generic module issue of the same name.
  const normalizeIssueTitle = (title) =>
    String(title || '')
      .trim()
      .toLowerCase();
  const seenIssueTitles = new Set(
    initialIssues.map((issue) => normalizeIssueTitle(issue.title)).filter(Boolean),
  );

  // Helper: resolve assignee for a role name or capability reference
  const resolveAssignee = (assignee, moduleJson) => {
    if (assignee?.startsWith('capability:')) {
      const capName = assignee.slice('capability:'.length);
      const cap = moduleJson?.capabilities?.find((c) => c.skill === capName);
      if (cap) return cap.owners.find((r) => allRoles.has(r)) || assignee;
    } else if (assignee && assignee !== 'ceo' && assignee !== 'user' && !allRoles.has(assignee)) {
      return 'ceo'; // Named role not in this team — fall back to CEO
    }
    return assignee;
  };

  // Helper: resolve a declared reviewGate to roles present in the team. Reviewers
  // become ordered `review` stages; the approver becomes the final `approval`
  // stage. Roles not present in the team are dropped (no CEO fallback) — a review
  // gate references concrete reviewer roles, and a missing one means that gate
  // simply has one fewer stage.
  const resolveReviewGate = (reviewGate, assignTo) => {
    if (!reviewGate || typeof reviewGate !== 'object') return null;

    const reviewersRaw = Array.isArray(reviewGate.reviewers) ? reviewGate.reviewers : [];
    const reviewers = [];
    const seen = new Set();
    for (const role of reviewersRaw) {
      if (typeof role !== 'string') continue;
      if (!allRoles.has(role)) continue;
      if (seen.has(role)) continue;
      seen.add(role);
      reviewers.push(role);
    }

    const approver =
      typeof reviewGate.approver === 'string' && allRoles.has(reviewGate.approver)
        ? reviewGate.approver
        : undefined;

    // The merge gate is the non-author agent who lands the PR. It renders as a
    // final `approval` stage so the merge owner is woken *last* — after the
    // approver — to perform the merge. Without it, the approver's verdict
    // auto-closes the issue and the PR is never merged.
    //
    // It must NOT be the issue's executor (assignTo): Paperclip excludes the
    // original executor from every review/approval stage to prevent self-review,
    // so a stage whose only participant is the author has no eligible participant
    // and the issue stalls in `in_review` (422 No eligible approval participant).
    // The engineer therefore can never be their own merge gate.
    //
    // We resolve the merge gate ONLY from the explicitly configured
    // reviewGate.mergeGate role. If that role is absent from the team, or is the
    // issue's executor, there is no eligible non-author merge gate — return null
    // so the engineer takes the self-merge path (no executionPolicy stages). We
    // deliberately do NOT fall back to another role: the documented contract is
    // "no Code Reviewer → PR-Self-Merge", not "substitute another role as a
    // staged gate". A substituted gate would render an executionPolicy sketch the
    // engineer is explicitly told never to set, and a reviewer-doubling-as-gate
    // minimal team still stalls whenever the only candidate is the author.
    let mergeGate =
      typeof reviewGate.mergeGate === 'string' && allRoles.has(reviewGate.mergeGate)
        ? reviewGate.mergeGate
        : undefined;
    if (mergeGate === assignTo) mergeGate = undefined;

    // Avoid accidentally requiring the same role twice (e.g. reviewer + approver).
    if (approver) {
      const idx = reviewers.indexOf(approver);
      if (idx !== -1) reviewers.splice(idx, 1);
    }

    // Without a resolvable non-author merge gate, render no executionPolicy at
    // all — the self-merge path applies. Rendering a gate with reviewers/approver
    // but no merge gate would let the last approval stage auto-close the issue
    // with the PR still open on GitHub.
    if (!mergeGate) return null;
    return { reviewers, approver, mergeGate };
  };

  // Render a resolved reviewGate as an executionPolicy sketch for BOOTSTRAP.md.
  // The CEO/Engineer resolves each role name to its agentId when setting the
  // policy on the issue (same role→agentId resolution as `assigneeAgentId`).
  // The merge-gate stage carries the hard precondition: CI-green when the ci-cd
  // module is selected, otherwise running the tests/build and pasting the output.
  const hasCi = moduleNames.includes('ci-cd');
  const renderReviewGate = (gate) => {
    const stages = [];
    for (const role of gate.reviewers) {
      stages.push(`  - stage ${stages.length + 1} (review) → assign ${JSON.stringify(role)}`);
    }
    if (gate.approver) {
      stages.push(
        `  - stage ${stages.length + 1} (approval) → assign ${JSON.stringify(gate.approver)}`,
      );
    }
    if (gate.mergeGate) {
      const gatePrecondition = hasCi
        ? 'CI must be green before merge'
        : 'no CI configured — run the test suite/build and paste the output before merge';
      stages.push(
        `  - stage ${stages.length + 1} (approval) → assign ${JSON.stringify(gate.mergeGate)}  — merge gate (non-author): ${gatePrecondition}; merge the PR, then record approved to close`,
      );
    }
    return (
      `- **executionPolicy** (set when creating this issue; resolve each role to its agentId):\n` +
      `${stages.join('\n')}\n` +
      `  - never assign the issue's executor/author to any stage — Paperclip excludes the original executor, so a self-stage has no eligible participant and the issue stalls (422); the merge gate must be a non-author\n` +
      `  - every verdict must cite executed verification (commands + results); "looks good" without evidence is not a valid verdict\n\n`
    );
  };

  // Foundation issues are explicit setup gates (repository/bootstrap scaffolding)
  // that must be created before domain implementation starts. Ordinary module and
  // preset issues are generic project scaffolding ("Define company vision", "Add
  // linter"), so user/AI-specified domain issues still lead those generic items.
  const isFoundationIssue = (issue) =>
    issue?.bootstrapPhase === 'foundation' ||
    issue?.phase === 'foundation' ||
    issue?.bootstrapOrder === 'foundation' ||
    issue?.foundation === true;

  // Seed user/AI-specified domain issues near the front of the backlog. Explicit
  // foundation issues are allowed to stay ahead of them; generic module/preset
  // issues remain behind them.
  const resolvedUserIssues = [];
  for (const issue of Array.isArray(userIssues) ? userIssues : []) {
    if (!issue || !issue.title) continue;
    const titleKey = normalizeIssueTitle(issue.title);
    if (titleKey && seenIssueTitles.has(titleKey)) continue;
    if (titleKey) seenIssueTitles.add(titleKey);
    resolvedUserIssues.push({
      ...issue,
      assignTo: resolveAssignee(issue.assignTo, null),
      source: 'user',
    });
  }
  initialIssues.unshift(...resolvedUserIssues);

  for (const moduleName of moduleNames) {
    const moduleDir = join(templatesDir, 'modules', moduleName);
    if (!(await exists(moduleDir))) {
      onProgress(`! module ${moduleName} not found, skipping`);
      continue;
    }

    const moduleJson = await readJson(join(moduleDir, 'module.meta.json'));

    // Check activatesWithRoles
    if (moduleJson?.activatesWithRoles?.length) {
      const hasActivatingRole = moduleJson.activatesWithRoles.some((r) => allRoles.has(r));
      if (!hasActivatingRole) {
        onProgress(`○ ${moduleName} (needs ${moduleJson.activatesWithRoles.join(' or ')})`);
        continue;
      }
    }

    if (Array.isArray(moduleJson?.labels)) {
      explicitBootstrapLabels.push(...moduleJson.labels);
    }

    // Collect issues (backward compat: read tasks[] if issues[] not present)
    const moduleIssues = moduleJson?.issues || moduleJson?.tasks || [];
    for (const issue of moduleIssues) {
      const titleKey = normalizeIssueTitle(issue.title);
      if (titleKey && seenIssueTitles.has(titleKey)) {
        onProgress(`○ issue "${issue.title}" (already provided by preset or earlier module)`);
        continue;
      }
      if (titleKey) seenIssueTitles.add(titleKey);
      initialIssues.push({
        ...issue,
        assignTo: resolveAssignee(issue.assignTo, moduleJson),
        module: moduleName,
      });
    }

    // Collect routines
    if (moduleJson?.routines?.length) {
      for (const routine of moduleJson.routines) {
        initialRoutines.push({
          ...routine,
          assignTo: resolveAssignee(routine.assignTo, moduleJson),
          module: moduleName,
        });
      }
    }

    // Copy shared docs. Track which roles each doc is relevant to (the roles this
    // module touches) so agents only reference the docs that matter to them.
    const docsDir = join(moduleDir, 'docs');
    if (await exists(docsDir)) {
      await copyDir(docsDir, join(companyDir, 'docs'));
      const moduleRoles = new Set();
      for (const cap of moduleJson?.capabilities ?? []) {
        for (const owner of cap.owners ?? []) if (allRoles.has(owner)) moduleRoles.add(owner);
      }
      for (const issue of moduleIssues) {
        if (issue.assignTo && allRoles.has(issue.assignTo)) moduleRoles.add(issue.assignTo);
      }
      for (const routine of moduleJson?.routines ?? []) {
        if (routine.assignTo && allRoles.has(routine.assignTo)) moduleRoles.add(routine.assignTo);
      }
      for (const r of moduleJson?.activatesWithRoles ?? []) if (allRoles.has(r)) moduleRoles.add(r);
      // No specific role association → treat as company-wide (visible to everyone).
      const rolesForDocs = moduleRoles.size > 0 ? moduleRoles : new Set(['*']);
      const docs = await readdir(docsDir);
      for (const doc of docs) {
        addDocRoles(doc, rolesForDocs);
        onProgress(`+ docs/${doc} (${moduleName})`);
      }
    }

    // Resolve capabilities
    const capabilityOwners = new Map();
    if (moduleJson?.capabilities) {
      for (const cap of moduleJson.capabilities) {
        const primaryOwner = cap.owners.find((r) => allRoles.has(r));
        if (primaryOwner) {
          capabilityOwners.set(cap.skill, { primary: primaryOwner, cap });
        }
      }
    }

    // Collect adapter overrides for capability owners
    if (moduleJson?.adapterOverrides && capabilityOwners.size > 0) {
      const ownerRoles = new Set();
      for (const { primary, cap } of capabilityOwners.values()) {
        ownerRoles.add(primary);
        for (const r of cap.owners) {
          if (allRoles.has(r)) ownerRoles.add(r);
        }
      }
      for (const role of ownerRoles) {
        const existing = roleAdapterOverrides.get(role) || {};
        roleAdapterOverrides.set(role, { ...existing, ...moduleJson.adapterOverrides });
      }
    }

    // Copy agent skills.
    //
    // Skill resolution order (per role + skill name):
    //   1. Role-specific override:  agents/<role>/skills/<skill>.md
    //   2. Shared skill:            skills/<skill>.md
    //
    // For capabilities, the assembly logic decides what to copy:
    //   - Primary owner gets <skill>.md (role-specific or shared)
    //   - Fallback owners get <skill>.fallback.md (role-specific or shared)
    //   - Other combinations are skipped
    //
    // Non-capability skills (no matching capabilityOwners entry) are copied
    // as-is to the role that defines them.

    const sharedSkillsDir = join(moduleDir, 'skills');
    const agentsDir = join(moduleDir, 'agents');

    // Helper: resolve a skill file from role-specific first, then shared
    async function resolveSkillFile(roleName, fileName) {
      const roleSpecific = join(agentsDir, roleName, 'skills', fileName);
      if (await exists(roleSpecific)) return { path: roleSpecific, source: 'role' };
      const shared = join(sharedSkillsDir, fileName);
      if (await exists(shared)) return { path: shared, source: 'shared' };
      return null;
    }

    // Helper: copy a resolved skill into the agent's skills/ dir
    async function installSkill(roleName, fileName, label) {
      const resolved = await resolveSkillFile(roleName, fileName);
      if (!resolved) return false;
      const destSkillsDir = join(companyDir, 'agents', roleName, 'skills');
      await mkdir(destSkillsDir, { recursive: true });
      const destFile = join(destSkillsDir, fileName);
      await copyFile(resolved.path, destFile);
      // Append a primary skill's output/review bar when present.
      let barApplied = false;
      if (enableEnrichedPersonas && label === 'primary') {
        const barFileName = fileName.replace(/\.md$/, '.bar.md');
        const bar = await resolveSkillFile(roleName, barFileName);
        if (bar) {
          const barContent = await readFile(bar.path, 'utf-8');
          await appendToFile(destFile, '\n' + barContent.trim() + '\n');
          barApplied = true;
        }
      }
      await appendToFile(
        join(companyDir, 'agents', roleName, 'AGENTS.md'),
        `\nRead and follow: \`$AGENT_HOME/skills/${fileName}\`\n`,
      );
      const sourceTag = resolved.source === 'shared' ? ', shared' : '';
      const barTag = barApplied ? ', output bar' : '';
      onProgress(
        `+ agents/${roleName}/skills/${fileName} (${moduleName}, ${label}${sourceTag}${barTag})`,
      );
      return true;
    }

    // Install capability-based skills for each present role
    for (const [skillName, { primary, cap }] of capabilityOwners) {
      // Primary owner gets the primary skill
      await installSkill(primary, `${skillName}.md`, 'primary');

      // Fallback owners get the fallback skill
      if (cap.fallbackSkill) {
        for (const fallbackRole of cap.owners) {
          if (fallbackRole === primary) continue;
          if (!allRoles.has(fallbackRole)) continue;
          await installSkill(fallbackRole, `${cap.fallbackSkill}.md`, 'fallback');
        }
      }
    }

    // Install non-capability skills (role-specific only, no shared lookup)
    if (await exists(agentsDir)) {
      const roles = await readdir(agentsDir, { withFileTypes: true });
      for (const role of roles) {
        if (!role.isDirectory()) continue;
        if (!allRoles.has(role.name)) continue;

        const skillsDir = join(agentsDir, role.name, 'skills');
        if (!(await exists(skillsDir))) continue;

        const skills = await readdir(skillsDir);
        for (const skillFile of skills) {
          if (skillFile.endsWith('.bar.md')) continue;
          const skillName = skillFile.replace(/\.md$/, '');
          const skillBaseName = skillName.replace(/\.fallback$/, '');

          // Skip if this skill belongs to a capability (already handled above)
          if (capabilityOwners.has(skillBaseName)) continue;

          const destSkillsDir = join(companyDir, 'agents', role.name, 'skills');
          await mkdir(destSkillsDir, { recursive: true });
          await copyFile(join(skillsDir, skillFile), join(destSkillsDir, skillFile));
          await appendToFile(
            join(companyDir, 'agents', role.name, 'AGENTS.md'),
            `\nRead and follow: \`$AGENT_HOME/skills/${skillFile}\`\n`,
          );
          onProgress(`+ agents/${role.name}/skills/${skillFile} (${moduleName})`);
        }
      }
    }
  }

  // 4. Inject module heartbeat sections into HEARTBEAT.md files
  //
  // Convention-based: if a module provides agents/<role>/heartbeat-section.md,
  // it gets appended to that role's HEARTBEAT.md (before the placeholder comment).
  // This follows the same gracefully-optimistic pattern as skills — if the file
  // exists the heartbeat extends, if not nothing breaks.
  const HEARTBEAT_MARKER =
    '<!-- Module heartbeat sections are inserted above this line during assembly -->';
  for (const moduleName of moduleNames) {
    const moduleDir = join(templatesDir, 'modules', moduleName);
    if (!(await exists(moduleDir))) continue;

    const moduleJson = await readJson(join(moduleDir, 'module.meta.json'));
    // Skip gated modules that didn't activate
    if (moduleJson?.activatesWithRoles?.length) {
      const hasActivatingRole = moduleJson.activatesWithRoles.some((r) => allRoles.has(r));
      if (!hasActivatingRole) continue;
    }

    const modAgentsDir = join(moduleDir, 'agents');
    if (!(await exists(modAgentsDir))) continue;

    const modRoles = await readdir(modAgentsDir, { withFileTypes: true });
    for (const modRole of modRoles) {
      if (!modRole.isDirectory()) continue;
      if (!allRoles.has(modRole.name)) continue;

      const sectionFile = join(modAgentsDir, modRole.name, 'heartbeat-section.md');
      if (!(await exists(sectionFile))) continue;

      const heartbeatPath = join(companyDir, 'agents', modRole.name, 'HEARTBEAT.md');
      if (!(await exists(heartbeatPath))) continue;

      const section = await readFile(sectionFile, 'utf-8');
      const heartbeat = await readFile(heartbeatPath, 'utf-8');

      // Insert before the marker comment, or append at end if marker not found
      const updated = heartbeat.includes(HEARTBEAT_MARKER)
        ? heartbeat.replace(HEARTBEAT_MARKER, section.trim() + '\n\n' + HEARTBEAT_MARKER)
        : heartbeat.trimEnd() + '\n\n' + section.trim() + '\n';

      await writeFile(heartbeatPath, updated);
      onProgress(`+ agents/${modRole.name}/HEARTBEAT.md (${moduleName}, heartbeat section)`);
    }
  }

  // 4b. Inject persona enrichments. Domain lenses → SOUL.md, done-criteria →
  // HEARTBEAT.md. Fragments live at roles/<role>/LENSES.md and roles/<role>/DONE.md
  // and apply when enableEnrichedPersonas is on. Same gracefully-optimistic
  // pattern as skills: a missing fragment simply means no enrichment for that role.
  if (enableEnrichedPersonas) {
    for (const roleName of allRoles) {
      const lensesSrc = join(rolesDir, roleName, 'LENSES.md');
      const soulPath = join(companyDir, 'agents', roleName, 'SOUL.md');
      if ((await exists(lensesSrc)) && (await exists(soulPath))) {
        const lenses = await readFile(lensesSrc, 'utf-8');
        await appendToFile(soulPath, '\n' + lenses.trim() + '\n');
        onProgress(`+ agents/${roleName}/SOUL.md (domain lenses)`);
      }

      const doneSrc = join(rolesDir, roleName, 'DONE.md');
      const heartbeatPath = join(companyDir, 'agents', roleName, 'HEARTBEAT.md');
      if ((await exists(doneSrc)) && (await exists(heartbeatPath))) {
        const done = await readFile(doneSrc, 'utf-8');
        await appendToFile(heartbeatPath, '\n' + done.trim() + '\n');
        onProgress(`+ agents/${roleName}/HEARTBEAT.md (done criteria)`);
      }
    }
  }

  // 5. Add ROLE-RELEVANT shared doc references to each agent's AGENTS.md.
  // Each agent only references docs from modules that touch its role — a code
  // reviewer no longer gets the marketing/vision templates, etc. The CEO is the
  // coordinator, so it still sees every doc. Paths are RELATIVE to the agent's
  // home (its adapterConfig.cwd is the company dir), which keeps them valid even
  // if the company directory is renamed (e.g. collision-suffixed).
  const finalDocsDir = join(companyDir, 'docs');
  if (await exists(finalDocsDir)) {
    const docs = (await readdir(finalDocsDir)).sort();
    if (docs.length > 0) {
      const agentsBaseDir = join(companyDir, 'agents');
      const agentRoles = await readdir(agentsBaseDir, { withFileTypes: true });
      for (const role of agentRoles) {
        if (!role.isDirectory()) continue;
        const agentsMd = join(agentsBaseDir, role.name, 'AGENTS.md');
        if (!(await exists(agentsMd))) continue;

        const relevantDocs = docs.filter((doc) => {
          if (role.name === 'ceo') return true; // coordinator sees everything
          const roles = docRoleMap.get(doc);
          return !roles || roles.has('*') || roles.has(role.name);
        });
        if (relevantDocs.length === 0) continue;

        let docRefs =
          '\n## Shared Documentation\n\nReference docs relevant to your role (paths are relative to your workspace home):\n';
        for (const doc of relevantDocs) {
          docRefs += `\nRead: \`docs/${doc}\`\n`;
        }
        await appendToFile(agentsMd, docRefs);
      }
    }
  }

  // 5b. Resolve `$AGENT_HOME` references to absolute paths.
  //
  // Role templates and the generated skill references use `$AGENT_HOME/...` to
  // point at the agent's own files (HEARTBEAT.md, SOUL.md, TOOLS.md, skills/,
  // memory/, life/). At runtime Paperclip sets AGENT_HOME to a separate per-agent
  // workspace dir (<instanceRoot>/workspaces/<agentId>) that does NOT contain
  // these provisioned files, so the references would not resolve. The agent's
  // instructionsFilePath is the absolute companyDir/agents/<role>/AGENTS.md, and
  // its sibling files live alongside it — so we rewrite `$AGENT_HOME` to that
  // absolute directory, which resolves regardless of the agent's runtime cwd.
  const agentsBaseDirForSubst = join(companyDir, 'agents');
  if (await exists(agentsBaseDirForSubst)) {
    const agentRoleDirs = await readdir(agentsBaseDirForSubst, { withFileTypes: true });
    for (const roleDir of agentRoleDirs) {
      if (!roleDir.isDirectory()) continue;
      const absoluteAgentHome = join(agentsBaseDirForSubst, roleDir.name);
      const subst = async (dir) => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await subst(full);
          } else if (entry.name.endsWith('.md')) {
            const content = await readFile(full, 'utf-8');
            if (content.includes('$AGENT_HOME')) {
              await writeFile(full, content.split('$AGENT_HOME').join(absoluteAgentHome));
            }
          }
        }
      };
      await subst(join(agentsBaseDirForSubst, roleDir.name));
    }
  }

  // 6. Generate BOOTSTRAP.md
  const rolesList = [...allRoles];
  const DEFAULT_BOOTSTRAP_LABELS = [
    { name: 'feature', color: '#0075ca', useFor: 'New user-facing capability' },
    { name: 'bug', color: '#d73a4a', useFor: 'Defect or regression' },
    { name: 'chore', color: '#7057ff', useFor: 'Refactoring, cleanup, dependency updates' },
    { name: 'spike', color: '#006b75', useFor: 'Research or investigation' },
    { name: 'blocked', color: '#e4e669', useFor: 'Cannot proceed, needs unblocking' },
  ];
  const DEFAULT_BOOTSTRAP_LABEL_COLOR = '#6f42c1';

  const formatRole = (r) =>
    r
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const normalizeLabelName = (name) =>
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');

  const normalizeHexColor = (color) => {
    const value = String(color || '').trim();
    if (!value) return DEFAULT_BOOTSTRAP_LABEL_COLOR;
    return value.startsWith('#') ? value : `#${value}`;
  };

  const normalizePaperclipRole = (role, roleMeta) => {
    const apiRole = typeof roleMeta.paperclipRole === 'string' ? roleMeta.paperclipRole.trim() : '';
    return apiRole || role;
  };

  const resolveRoleAdapterConfig = (role, roleMeta, instructionsFilePath) => {
    const adapter = roleMeta && typeof roleMeta.adapter === 'object' ? roleMeta.adapter : {};
    const adapterType =
      typeof adapter.type === 'string' && adapter.type.trim()
        ? adapter.type.trim()
        : DEFAULT_CEO_ADAPTER_TYPE;
    const model =
      adapterType === DEFAULT_CEO_ADAPTER_TYPE
        ? DEFAULT_CEO_MODEL
        : typeof adapter.model === 'string' && adapter.model.trim()
          ? adapter.model.trim()
          : DEFAULT_CEO_MODEL;
    const thinkingLevel =
      typeof adapter.thinkingLevel === 'string' && adapter.thinkingLevel.trim()
        ? adapter.thinkingLevel.trim()
        : typeof adapter.modelReasoningEffort === 'string' && adapter.modelReasoningEffort.trim()
          ? adapter.modelReasoningEffort.trim()
          : typeof adapter.effort === 'string' && adapter.effort.trim()
            ? adapter.effort.trim()
            : DEFAULT_CEO_THINKING_LEVEL;

    const adapterConfig = {
      cwd: companyDir,
      model,
      instructionsFilePath,
    };

    if (adapter && typeof adapter === 'object') {
      for (const [key, value] of Object.entries(adapter)) {
        if (['type', 'model', 'effort', 'thinkingLevel', 'modelReasoningEffort'].includes(key)) {
          continue;
        }
        adapterConfig[key] = value;
      }
    }

    if (adapterType === DEFAULT_CEO_ADAPTER_TYPE) {
      adapterConfig.modelReasoningEffort = thinkingLevel;
      adapterConfig.thinkingLevel = thinkingLevel;
      adapterConfig.dangerouslyBypassApprovalsAndSandbox = true;
    }

    return { adapterType, adapterConfig };
  };

  const defaultLabelByName = new Map(
    DEFAULT_BOOTSTRAP_LABELS.map((label) => [label.name, { ...label }]),
  );

  const parseIssueLabels = (issue) => {
    const raw = [];
    if (Array.isArray(issue?.labelNames)) raw.push(...issue.labelNames);
    if (Array.isArray(issue?.labels)) raw.push(...issue.labels);

    const parsed = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const name = normalizeLabelName(item);
        if (!name) continue;
        const known = defaultLabelByName.get(name);
        parsed.push({
          name,
          color: known?.color || DEFAULT_BOOTSTRAP_LABEL_COLOR,
          useFor: known?.useFor || 'Module-defined issue category',
        });
      } else if (item && typeof item === 'object' && typeof item.name === 'string') {
        const name = normalizeLabelName(item.name);
        if (!name) continue;
        const known = defaultLabelByName.get(name);
        const color = normalizeHexColor(
          typeof item.color === 'string' && item.color.trim().length > 0
            ? item.color.trim()
            : known?.color || DEFAULT_BOOTSTRAP_LABEL_COLOR,
        );
        parsed.push({
          name,
          color,
          useFor:
            typeof item.useFor === 'string' && item.useFor.trim().length > 0
              ? item.useFor.trim()
              : known?.useFor || 'Module-defined issue category',
        });
      }
    }

    const seen = new Set();
    return parsed.filter((label) => {
      if (seen.has(label.name)) return false;
      seen.add(label.name);
      return true;
    });
  };

  const inferIssueLabelName = (issue) => {
    const text = `${issue?.title || ''} ${issue?.description || ''}`.toLowerCase();
    if (/\bblocked\b|\bunblock\b/.test(text)) return 'blocked';
    if (/\bbug\b|\bfix\b|regression|crash|error|broken/.test(text)) return 'bug';
    if (/\bspike\b|research|investigat|analysis|audit|explor/.test(text)) return 'spike';
    if (/\bchore\b|cleanup|refactor|dependency|maintenance|configure|setup|set up/.test(text)) {
      return 'chore';
    }
    return 'feature';
  };

  const buildBootstrapLabels = (issues, explicitLabels = []) => {
    if (issues.length === 0 && explicitLabels.length === 0) return [];

    const labelsByName = new Map(
      DEFAULT_BOOTSTRAP_LABELS.map((label) => [label.name, { ...label }]),
    );

    for (const label of explicitLabels) {
      for (const parsedLabel of parseIssueLabels({ labels: [label] })) {
        labelsByName.set(parsedLabel.name, parsedLabel);
      }
    }

    for (const issue of issues) {
      const explicitLabels = parseIssueLabels(issue);
      if (explicitLabels.length > 0) {
        for (const label of explicitLabels) {
          if (!labelsByName.has(label.name)) {
            labelsByName.set(label.name, label);
          }
        }
        continue;
      }

      const inferred = inferIssueLabelName(issue);
      if (!labelsByName.has(inferred)) {
        labelsByName.set(inferred, {
          name: inferred,
          color: DEFAULT_BOOTSTRAP_LABEL_COLOR,
          useFor: 'Auto-inferred issue category',
        });
      }
    }

    return [...labelsByName.values()];
  };

  const orderInitialIssuesForBootstrap = () => {
    const originalOrder = new Map(initialIssues.map((issue, index) => [issue, index]));
    const rank = (issue) => {
      if (isFoundationIssue(issue)) return 0;
      if (issue?.source === 'user') return 1;
      return 2;
    };
    initialIssues.sort((a, b) => rank(a) - rank(b) || originalOrder.get(a) - originalOrder.get(b));
  };

  orderInitialIssuesForBootstrap();

  const bootstrapLabels = buildBootstrapLabels(initialIssues, explicitBootstrapLabels);
  const labelsByName = new Map(bootstrapLabels.map((label) => [label.name, label]));

  const getIssueLabelNames = (issue) => {
    const explicit = parseIssueLabels(issue).map((label) => label.name);
    if (explicit.length > 0) return explicit;
    return [inferIssueLabelName(issue)];
  };

  // --- Helper: render metadata as visible bullet list ---
  const renderMeta = (fields) => {
    const lines = fields.filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (lines.length === 0) return '';
    return lines.map(([k, v]) => `- **${k}**: ${v}`).join('\n') + '\n\n';
  };

  // --- Helper: redact obvious secrets before writing durable bootstrap/issue text ---
  const redactSecrets = (text) =>
    String(text || '')
      .replace(
        /\b(GH_TOKEN|GITHUB_TOKEN|API_KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE_KEY)\s*=\s*[^\s`'"<>]+/gi,
        '$1=[REDACTED]',
      )
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
      .replace(/\b(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, '[REDACTED]');

  // --- Helper: escape # in description body ---
  const escapeBody = (text) =>
    redactSecrets(text)
      .split('\n')
      .map((l) => l.replace(/^(#+)/, '\\$1'))
      .join('\n');

  let bootstrap = `# Bootstrap: ${companyName}\n\n`;

  // Instructions from template
  const instructionsPath = join(templatesDir, 'bootstrap-instructions.md');
  if (await exists(instructionsPath)) {
    const instructions = await readFile(instructionsPath, 'utf-8');
    bootstrap += `${instructions.trim()}\n\n`;
  }

  // Company description
  if (companyDescription) {
    bootstrap += `## Company\n\n`;
    bootstrap += `${escapeBody(companyDescription)}\n\n`;
  }

  // --- Goals ---
  // All goals (user goals + inline goals + expanded subgoals) rendered uniformly.
  if (allGoals.length > 0) {
    bootstrap += `## Goals\n\n`;
    bootstrap += `> **Goal focus:** keep the top-level goal outcome-first and product-first. Secondary constraints (compliance, security, accessibility, performance, tech stack) are quality bars unless the user explicitly made one of them the primary project. Seed issues should lead with core product capabilities and include constraints as acceptance criteria/risk notes, not let one side constraint dominate the backlog.\n\n`;
    for (const g of allGoals) {
      bootstrap += `### ${g.title}\n\n`;
      bootstrap += renderMeta([
        ['level', g.level || 'company'],
        ['status', 'active'],
        ['parentId', g.parentGoal ? `→ "${g.parentGoal}"` : undefined],
      ]);
      if (g.description) {
        bootstrap += `${escapeBody(g.description)}\n\n`;
      }
    }
  }

  // --- Projects ---
  const normalizeProjectWorkspace = (proj) => {
    const explicitWorkspace =
      proj && typeof proj.workspace === 'object' && proj.workspace !== null ? proj.workspace : {};
    const sourceType =
      typeof explicitWorkspace.sourceType === 'string' && explicitWorkspace.sourceType.trim()
        ? explicitWorkspace.sourceType.trim()
        : typeof proj?.workspaceSourceType === 'string' && proj.workspaceSourceType.trim()
          ? proj.workspaceSourceType.trim()
          : typeof proj?.repoUrl === 'string' && proj.repoUrl.trim()
            ? 'git_repo'
            : 'local_path';
    const localCwd = join(companyDir, 'projects', toPascalCase(proj.name));
    const workspace = {
      sourceType,
      ...explicitWorkspace,
      isPrimary: explicitWorkspace.isPrimary ?? proj?.isPrimary ?? true,
    };

    if (sourceType === 'git_repo') {
      const repoUrl = explicitWorkspace.repoUrl || proj?.repoUrl;
      const repoRef = explicitWorkspace.repoRef || proj?.repoRef || proj?.defaultRef;
      const defaultRef = explicitWorkspace.defaultRef || proj?.defaultRef || repoRef;
      if (repoUrl) workspace.repoUrl = repoUrl;
      if (repoRef) workspace.repoRef = repoRef;
      if (defaultRef) workspace.defaultRef = defaultRef;
      delete workspace.cwd;
    } else {
      if (!workspace.cwd) workspace.cwd = localCwd;
      // A bare `git init -b main` leaves an UNBORN main branch (no commits). The
      // isolated execution policy creates a worktree with `git worktree add … main`,
      // which fails until something makes the first commit — so the earliest issues
      // start as "failed" with a workspace error. Seed an initial empty commit so
      // `main` is a valid base ref immediately. Only the known-fragile default is
      // upgraded; a real custom setupCommand is left untouched.
      const trimmedSetup =
        typeof workspace.setupCommand === 'string' ? workspace.setupCommand.trim() : '';
      if (!trimmedSetup || trimmedSetup === 'git init -b main' || trimmedSetup === 'git init') {
        const gitName = gitUserName || 'Paperclip Bootstrap';
        const gitEmail = gitUserEmail || 'bootstrap@paperclip.local';
        workspace.setupCommand = `git init -b main && git -c user.email=${gitEmail} -c user.name='${gitName.replace(/'/g, "'\\''")}' commit --allow-empty -m 'chore: initialize repository'`;
      }
    }

    return workspace;
  };

  const renderWorkspaceMetaFields = (workspace) => {
    const orderedKeys = ['sourceType', 'cwd', 'repoUrl', 'repoRef', 'defaultRef', 'isPrimary'];
    const keys = [
      ...orderedKeys.filter((key) => workspace[key] !== undefined),
      ...Object.keys(workspace).filter((key) => !orderedKeys.includes(key)),
    ];
    return keys.map((key) => [`workspace.${key}`, String(workspace[key])]);
  };

  const formatWorkspaceObject = (workspace) => {
    const orderedKeys = ['sourceType', 'cwd', 'repoUrl', 'repoRef', 'defaultRef', 'isPrimary'];
    const entries = [
      ...orderedKeys
        .filter((key) => workspace[key] !== undefined)
        .map((key) => [key, workspace[key]]),
      ...Object.entries(workspace).filter(([key]) => !orderedKeys.includes(key)),
    ];
    const fields = entries
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (typeof value === 'boolean') return `${key}: ${value}`;
        return `${key}: "${String(value)}"`;
      });
    return `{ ${fields.join(', ')} }`;
  };

  // Isolated git worktrees are gated by the Paperclip instance experimental
  // setting. Repository selection alone must not enable isolation. When the
  // setting is on, project/worktree settings supply the base ref; we preserve it
  // verbatim instead of forcing main/master or origin/*.
  //
  // Freshly-created local repositories still never use them during bootstrap:
  //    the repo and its base ref do not exist yet when the first agents wake, so
  //    worktree creation fails and every early run errors out. Isolated worktrees
  //    only make sense for existing external repos (sourceType "git_repo"), where
  //    a real base ref already exists.
  const isFreshLocalRepo = (workspace) => workspace?.sourceType !== 'git_repo';

  const effectiveExecutionPolicy = (proj, workspace) => {
    const policy = proj?.executionWorkspacePolicy;
    const canUseIsolatedWorktrees = enableIsolatedWorktrees && !isFreshLocalRepo(workspace);
    if (!policy || typeof policy !== 'object') {
      if (!canUseIsolatedWorktrees) return null;
      const baseRef = normalizeExecutionBaseRef(null, workspace?.defaultRef || workspace?.repoRef);
      return {
        enabled: true,
        defaultMode: 'isolated_workspace',
        workspaceStrategy: {
          type: 'git_worktree',
          ...(baseRef ? { baseRef } : {}),
        },
      };
    }
    if (policy.defaultMode === 'isolated_workspace') {
      if (!canUseIsolatedWorktrees) return null;

      const strategy = policy.workspaceStrategy;
      if (!strategy || typeof strategy !== 'object')
        return { ...policy, enabled: policy.enabled ?? true };
      if (strategy.type !== 'git_worktree') return { ...policy, enabled: policy.enabled ?? true };

      const workspaceStrategy = { ...strategy };
      const resolvedBaseRef = normalizeExecutionBaseRef(
        workspaceStrategy.baseRef,
        workspace?.defaultRef || workspace?.repoRef,
      );
      if (resolvedBaseRef) {
        workspaceStrategy.baseRef = resolvedBaseRef;
      }
      return { ...policy, enabled: policy.enabled ?? true, workspaceStrategy };
    }
    return policy;
  };

  const renderExecutionPolicyMetaFields = (proj, workspace) => {
    const policy = effectiveExecutionPolicy(proj, workspace);
    if (!policy) return [];
    const rows = [];
    if (policy.defaultMode) rows.push(['executionWorkspacePolicy.defaultMode', policy.defaultMode]);
    const strategy = policy.workspaceStrategy;
    if (strategy && typeof strategy === 'object') {
      if (strategy.type)
        rows.push(['executionWorkspacePolicy.workspaceStrategy.type', strategy.type]);
      if (strategy.baseRef)
        rows.push(['executionWorkspacePolicy.workspaceStrategy.baseRef', strategy.baseRef]);
    }
    return rows;
  };

  // When the instance has isolated worktrees enabled but this project starts as
  // a fresh local repo, the isolated policy is intentionally deferred (worktrees
  // need an existing base ref and would fail on the first run). Without a hint,
  // the operator is left thinking the setting did nothing and flips it by hand
  // mid-run — which strands early work in the shared workspace. Emit a note so
  // the repo-setup owner enables isolation as soon as the first commit lands.
  const renderDeferredIsolationNote = (workspace) => {
    if (!enableIsolatedWorktrees || !isFreshLocalRepo(workspace)) return '';
    const configuredRef = normalizeExecutionBaseRef(
      null,
      workspace?.defaultRef || workspace?.repoRef,
    );
    const refHint = configuredRef
      ? `When you later enable the project policy, use that configured ref (currently \`${configuredRef}\`) as the worktree \`baseRef\`.`
      : `When you later enable the project policy, first set the project/worktree base ref to the branch Paperclip should branch from.`;
    return (
      `> **Enable isolated worktrees once the repo exists.** This instance has isolated ` +
      `worktrees enabled, but this project starts as a fresh local repository, so the ` +
      `\`executionWorkspacePolicy\` is intentionally omitted now — worktrees need an existing ` +
      `base ref and would fail on the first run. After the initial commit exists on the configured ` +
      `base branch, switch this project to isolated worktrees in Project settings. ${refHint} ` +
      `Until then agents share the project workspace; do not flip it before the repo has its first commit.\n\n`
    );
  };

  const mainProject = resolvedProjects[0];
  const mainProjectName = mainProject?.name || companyName;

  // When there are scheduled routines, the worker pre-creates the main project
  // (with board authority) so every routine — including those owned by non-CEO
  // agents — can be linked to it at creation time. The CEO, which otherwise
  // creates projects during bootstrap, can only edit routines assigned to
  // itself, so routines owned by other agents would stay project-less. Expose
  // the resolved main project (with its normalized workspace) so the worker can
  // create it.
  const mainProjectInfo = mainProject
    ? (() => {
        const workspace = normalizeProjectWorkspace(mainProject);
        const executionWorkspacePolicy = effectiveExecutionPolicy(mainProject, workspace);
        return {
          name: mainProjectName,
          description: mainProject.description || '',
          workspace,
          ...(executionWorkspacePolicy ? { executionWorkspacePolicy } : {}),
        };
      })()
    : null;
  // Mirror the worker's gate: the main project is only pre-created when there
  // are routines to attach. Otherwise the CEO still creates it during bootstrap.
  const mainProjectPreCreated = initialRoutines.length > 0 && mainProjectInfo !== null;

  if (resolvedProjects.length > 0) {
    bootstrap += `## Projects\n\n`;
    if (mainProjectPreCreated) {
      bootstrap += `> **The Company Wizard has already created the main project "${mainProjectName}"** (with board authority) so the scheduled routines could be linked to it. Do NOT recreate it — create issues against it. After creating the goals above, resolve their real ids and link them with \`PATCH /api/projects/{projectId}\` using \`{ "goalIds": [...] }\`.\n\n`;
    }
    for (const proj of resolvedProjects) {
      const workspace = normalizeProjectWorkspace(proj);
      bootstrap += `### ${proj.name}\n\n`;
      bootstrap += renderMeta([
        ...renderWorkspaceMetaFields(workspace),
        ...renderExecutionPolicyMetaFields(proj, workspace),
        [
          'goalIds',
          proj.goals?.length > 0 ? proj.goals.map((g) => `"${g}"`).join(', ') : undefined,
        ],
      ]);
      if (proj.description) {
        bootstrap += `${escapeBody(proj.description)}\n\n`;
      }
      bootstrap += renderDeferredIsolationNote(workspace);
    }
  }

  // --- Labels ---
  if (bootstrapLabels.length > 0) {
    bootstrap += `## Labels\n\n`;
    for (const label of bootstrapLabels) {
      bootstrap += `### ${label.name}\n\n`;
      bootstrap += renderMeta([
        ['name', label.name],
        ['color', label.color],
      ]);
      if (label.useFor) {
        bootstrap += `${escapeBody(label.useFor)}\n\n`;
      }
    }
  }

  // --- Agents ---
  bootstrap += `## Agents\n\n`;
  bootstrap += `> **The Company Wizard has already created all agents listed below**, each with its full instructions bundle. Do NOT create new agents. Match them by \`metadata.templateRole\` when assigning issues; only re-create one if it is genuinely missing.\n\n`;
  for (const role of rolesList) {
    const roleMeta = roleMetaByName.get(role) || {};
    const roleTitle = typeof roleMeta.title === 'string' ? roleMeta.title : undefined;
    const roleCapabilities =
      typeof roleMeta.description === 'string' ? roleMeta.description : undefined;
    const instructionsFilePath = `${companyDir}/agents/${role}/AGENTS.md`;
    const apiRole = normalizePaperclipRole(role, roleMeta);
    const { adapterType, adapterConfig } = resolveRoleAdapterConfig(
      role,
      roleMeta,
      instructionsFilePath,
    );

    bootstrap += `### ${formatRole(role)}\n\n`;
    bootstrap += renderMeta([
      ['role', apiRole],
      ['metadata.templateRole', role],
      ['title', roleTitle],
      ['capabilities', roleCapabilities],
      ['metadata.description', roleCapabilities],
      ['adapterType', adapterType],
      ['adapterConfig.cwd', adapterConfig.cwd],
      ['adapterConfig.model', adapterConfig.model],
      ['adapterConfig.modelReasoningEffort', adapterConfig.modelReasoningEffort],
      ['adapterConfig.thinkingLevel', adapterConfig.thinkingLevel],
      [
        'adapterConfig.dangerouslyBypassApprovalsAndSandbox',
        adapterConfig.dangerouslyBypassApprovalsAndSandbox,
      ],
      ['adapterConfig.instructionsFilePath', adapterConfig.instructionsFilePath],
      ['instructionsFilePath', instructionsFilePath],
      ['runtimeConfig.heartbeat.enabled', 'true'],
      ['runtimeConfig.heartbeat.intervalSec', String(DEFAULT_CEO_HEARTBEAT_INTERVAL_SEC)],
      ['runtimeConfig.heartbeat.maxConcurrentRuns', String(DEFAULT_CEO_MAX_CONCURRENT_RUNS)],
    ]);
  }

  // --- Issues ---
  // All issues come from module.issues[] (project-scoped), not from goals.
  if (initialIssues.length > 0) {
    bootstrap += `## Issues\n\n`;
    for (const issue of initialIssues) {
      bootstrap += `### ${issue.title}\n\n`;
      const isUserAssignment = issue.assignTo === 'user';
      const parentRefRaw =
        issue.parentId || issue.parentIssue || issue.parentIssueTitle || issue.parentTitle;
      const parentRef =
        typeof parentRefRaw === 'string' && parentRefRaw.trim().length > 0
          ? parentRefRaw.trim()
          : undefined;
      const explicitProjectRef =
        typeof issue.projectIdRef === 'string'
          ? issue.projectIdRef
          : typeof issue.projectName === 'string'
            ? issue.projectName
            : typeof issue.project === 'string'
              ? issue.project
              : undefined;
      const resolvedProjectRef = explicitProjectRef || mainProjectName;
      const issueLabelNames = getIssueLabelNames(issue);
      const goalRefRaw = issue.goalId || issue.goalIdRef || issue.goal || issue.goalTitle;
      const goalRef =
        typeof goalRefRaw === 'string' && goalRefRaw.trim().length > 0
          ? goalRefRaw.trim()
          : undefined;
      for (const labelName of issueLabelNames) {
        if (!labelsByName.has(labelName)) {
          labelsByName.set(labelName, {
            name: labelName,
            color: DEFAULT_BOOTSTRAP_LABEL_COLOR,
            useFor: 'Module-defined issue category',
          });
        }
      }

      bootstrap += renderMeta([
        [
          'assigneeAgentId',
          !isUserAssignment && issue.assignTo ? `→ "${issue.assignTo}"` : undefined,
        ],
        ['assigneeUserId', isUserAssignment ? '→ board user' : undefined],
        ['priority', issue.priority || 'medium'],
        ['parentId', parentRef ? `→ "${parentRef}"` : undefined],
        ['projectId', `→ "${resolvedProjectRef}"`],
        ['goalId', goalRef ? `→ "${goalRef}"` : undefined],
        ['labelIds', `→ [${issueLabelNames.map((name) => `"${name}"`).join(', ')}]`],
      ]);
      const issueReviewGate = resolveReviewGate(issue.reviewGate, issue.assignTo);
      if (issueReviewGate) {
        bootstrap += renderReviewGate(issueReviewGate);
      }
      if (issue.description) {
        bootstrap += `${escapeBody(issue.description)}\n\n`;
      }
    }

    bootstrap += `#### Issue Guardrails\n\n`;
    bootstrap += `- Top-level issues must include explicit \`projectId\`.\n`;
    bootstrap += `- Subtasks must include explicit \`parentId\` and explicit \`projectId\` matching the parent project unless an explicit override is required.\n`;
    bootstrap += `- Parent/subissue status is not implicitly coupled (no automatic status bounce).\n`;
    bootstrap += `- Do not reopen \`done\` parent/subissues without an explicit reason in a comment.\n`;
    bootstrap += `- Do not reuse parent workspaces for subissues unless explicitly requested.\n`;
    if (moduleNames.includes('pr-review')) {
      const ciClause = hasCi
        ? 'CI (lint/test/build) must be green before the merge gate merges — this is the hard gate and cannot be skipped'
        : 'no CI is configured, so the merge-gate agent must run the test suite/build and paste the real output into the merge-gate verdict before merging — this is the hard gate';
      bootstrap += `- Required PR reviews use the issue's \`executionPolicy\`. The substantive gate is execution, not opinion: ${ciClause}. Stages, in order: a \`review\` stage for QA when present (test adequacy / running the tests), a \`review\` stage for the Security Engineer **only when the change is security-relevant** (auth, secrets, input boundaries, crypto, dependencies, infra exposure), an \`approval\` stage for the Product Owner when present (intent/scope), then a final \`approval\` merge-gate stage for the **Code Reviewer** (a non-author who satisfies the hard gate above, merges the PR, then records approval to close the issue). **Never list the issue's executor/author as a participant in any stage** — Paperclip excludes the original executor from review/approval, so a stage whose only participant is the author has no eligible participant and the issue stalls in \`in_review\` (422 No eligible approval participant); this is why the merge gate is the Code Reviewer (a non-author), not the engineer who wrote the code. The merge gate must be last so the Product Owner's approval does not auto-close the issue with the PR still open. When no Code Reviewer is on the team, do not set executionPolicy stages at all — use the PR-Self-Merge path (the engineer opens the PR and merges via \`gh pr merge <N> --merge\`); other review roles may leave advisory comments but do not block. Other domain reviewers may add advisory, non-blocking comments but do not gate the merge. Every verdict must cite executed verification. Resolve each role to its agentId. Model review stages in executionPolicy rather than child issues or @-mentions.\n`;
    }
    bootstrap += `\n`;
  }

  // --- Routines ---
  if (initialRoutines.length > 0) {
    bootstrap += `## Routines\n\n`;
    bootstrap += `> **The Company Wizard has already created the routines listed below** (with board authority, so each could be assigned to its owning agent). Do NOT recreate them. Note: an agent may only create routines assigned to itself, so never try to create another agent's routine.\n\n`;
    for (const routine of initialRoutines) {
      bootstrap += `### ${routine.title}\n\n`;
      bootstrap += renderMeta([
        ['assigneeAgentId', routine.assignTo ? `→ "${routine.assignTo}"` : undefined],
        ['schedule', routine.schedule],
        ['priority', routine.priority || 'medium'],
        ['concurrencyPolicy', routine.concurrencyPolicy || 'skip_if_active'],
        ['projectId', `→ "${mainProjectName}"`],
      ]);
      if (routine.description) {
        bootstrap += `${escapeBody(routine.description)}\n\n`;
      }
    }
  }

  // --- Provisioning steps ---
  bootstrap += `## Provisioning Steps\n\n`;
  bootstrap += `The Company Wizard "Provision" step creates the company, board-operations issue, hiring-plan issue, agent hire requests, routines, and this bootstrap issue. Approve any pending hires before running dependent team workflows. The CEO heartbeat completes the remaining setup below by following this task.\n\n`;
  bootstrap += `Manual setup order (respects Paperclip object dependencies):\n\n`;
  let stepN = 1;
  bootstrap += `${stepN++}. **Create company** "${companyName}"${companyDescription ? ' (with description above)' : ''}\n`;
  for (const g of allGoals) {
    const parentNote = g.parentGoal ? `, parentId → "${g.parentGoal}"` : '';
    const level = g.level || 'company';
    bootstrap += `${stepN++}. **Create goal** "${g.title}" (level: ${level}${parentNote})\n`;
  }
  resolvedProjects.forEach((proj, idx) => {
    const workspace = normalizeProjectWorkspace(proj);
    const goalLinks =
      proj.goals?.length > 0 ? `, goalIds → [${proj.goals.map((g) => `"${g}"`).join(', ')}]` : '';
    const activePolicy = effectiveExecutionPolicy(proj, workspace);
    const policy = activePolicy?.defaultMode
      ? `, executionWorkspacePolicy.defaultMode: "${activePolicy.defaultMode}"`
      : '';
    if (idx === 0 && mainProjectPreCreated) {
      const goalLinkInstruction = goalLinks
        ? ` After creating the goals above, resolve their real ids and link them with PATCH /api/projects/{projectId} (${goalLinks.replace(/^, /, '')}).`
        : '';
      bootstrap += `${stepN++}. **Main project already created** — the Company Wizard provisioned project "${proj.name}" (with board authority) so the scheduled routines could be linked to it. Do NOT recreate it.${goalLinkInstruction}\n`;
    } else {
      bootstrap += `${stepN++}. **Create project** "${proj.name}" (workspace: ${formatWorkspaceObject(workspace)}${policy}${goalLinks})\n`;
    }
  });
  if (bootstrapLabels.length > 0) {
    bootstrap += `${stepN++}. **Create labels** — create each label exactly as listed in the Labels section before creating issues\n`;
  }
  bootstrap += `${stepN++}. **Agents already created** — the Company Wizard provisioned every agent above with its full instructions bundle. Match them by metadata.templateRole when assigning issues; only hire via governance if one is genuinely missing\n`;
  if (initialIssues.length > 0) {
    bootstrap += `${stepN++}. **Create issues** — every issue, including subtasks, must carry explicit projectId; subtasks also require parentId\n`;
  }
  if (initialRoutines.length > 0) {
    bootstrap += `${stepN++}. **Routines already created** — the Company Wizard provisioned the routines above (with their cron triggers) using board authority. Do not recreate them; an agent can only create routines assigned to itself\n`;
  }
  bootstrap += `${stepN}. **Start CEO heartbeat** (one-time initial wakeup)\n`;

  await writeFile(join(companyDir, 'BOOTSTRAP.md'), bootstrap);
  onProgress('+ BOOTSTRAP.md');

  return {
    companyDir,
    allRoles,
    initialIssues,
    initialRoutines,
    roleAdapterOverrides,
    mainProject: mainProjectInfo,
  };
}
