import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @typedef {Object} SubGoal
 * @property {string} id - Unique identifier (kebab-case).
 * @property {string} title
 * @property {'company'|'team'|'agent'|'task'} [level] - Goal level. Default: 'team'.
 * @property {string} [description]
 */

/**
 * @typedef {Object} InlineGoal
 * @property {string} title
 * @property {string} description
 * @property {SubGoal[]} [subgoals]
 */

/**
 * @typedef {Object} TemplateIssue
 * @property {string} title
 * @property {string} [description]
 * @property {'critical'|'high'|'medium'|'low'} [priority]
 * @property {string} [assignTo] - Role name, 'capability:<skill>', or 'user'.
 */

/**
 * @typedef {Object} TemplateRoutine
 * @property {string} title
 * @property {string} [description]
 * @property {string} assignTo - Role name or 'capability:<skill>'.
 * @property {string} schedule - Cron expression.
 * @property {'critical'|'high'|'medium'|'low'} [priority]
 * @property {string} [concurrencyPolicy] - 'skip_if_active' | 'coalesce_if_active' | 'always_enqueue'
 */

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  if (!(await exists(p))) return null;
  return JSON.parse(await readFile(p, 'utf-8'));
}

export async function loadPresets(templatesDir) {
  const presetsDir = join(templatesDir, 'presets');
  const presets = [];
  if (!(await exists(presetsDir))) return presets;
  const dirs = await readdir(presetsDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const presetFile = join(presetsDir, dir.name, 'preset.meta.json');
    if (await exists(presetFile)) {
      const preset = JSON.parse(await readFile(presetFile, 'utf-8'));
      // Validate inline goals if present
      if (preset.goals) {
        for (const goal of preset.goals) {
          validateGoal(goal, `preset "${preset.name}"`);
        }
      }
      presets.push(preset);
    }
  }
  return presets;
}

export async function loadModules(templatesDir) {
  const modulesDir = join(templatesDir, 'modules');
  const modules = [];
  if (!(await exists(modulesDir))) return modules;
  const dirs = await readdir(modulesDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const moduleJson = await readJson(join(modulesDir, dir.name, 'module.meta.json'));
    const readmePath = join(modulesDir, dir.name, 'README.md');
    let description = '';
    if (await exists(readmePath)) {
      const content = await readFile(readmePath, 'utf-8');
      const descLine = content.split('\n').find((l) => l.length > 0 && !l.startsWith('#'));
      description = descLine?.trim() || '';
    }
    const mod = { name: dir.name, description, ...(moduleJson || {}) };
    // Backward compat: rename tasks → issues if old format
    if (mod.tasks && !mod.issues) {
      mod.issues = mod.tasks;
      delete mod.tasks;
    }
    // Validate inline goal if present
    if (mod.goal) {
      validateGoal(mod.goal, `module "${mod.name}"`);
    }
    modules.push(mod);
  }
  return modules;
}

export async function loadRoles(templatesDir) {
  const rolesDir = join(templatesDir, 'roles');
  const roles = [];
  if (!(await exists(rolesDir))) return roles;

  const dirs = await readdir(rolesDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const roleJson = await readJson(join(rolesDir, dir.name, 'role.meta.json'));
    if (roleJson) {
      roles.push(roleJson);
    }
  }

  return roles;
}

const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const SUBGOAL_ID_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Validate an inline goal object (from module or preset).
 * Throws on invalid data.
 * @param {InlineGoal} goal
 * @param {string} sourceName - context for error messages
 */
function validateGoal(goal, sourceName) {
  if (!goal.title || typeof goal.title !== 'string') {
    throw new Error(`Goal in ${sourceName}: missing or invalid "title"`);
  }
  if (!goal.description || typeof goal.description !== 'string') {
    throw new Error(`Goal in ${sourceName}: missing or invalid "description"`);
  }

  if (goal.subgoals) {
    if (!Array.isArray(goal.subgoals)) {
      throw new Error(`Goal in ${sourceName}: "subgoals" must be an array`);
    }
    const ids = new Set();
    for (const sg of goal.subgoals) {
      if (!sg.id || typeof sg.id !== 'string' || !SUBGOAL_ID_RE.test(sg.id)) {
        throw new Error(`Goal in ${sourceName}: subgoal "id" must be kebab-case (got "${sg.id}")`);
      }
      if (ids.has(sg.id)) {
        throw new Error(`Goal in ${sourceName}: duplicate subgoal id "${sg.id}"`);
      }
      ids.add(sg.id);
      if (!sg.title || typeof sg.title !== 'string') {
        throw new Error(`Goal in ${sourceName}: subgoal "${sg.id}" missing "title"`);
      }
    }
  }

  // Legacy support: warn if old fields are still present
  if (goal.milestones) {
    throw new Error(`Goal in ${sourceName}: "milestones" is deprecated — use "subgoals" instead`);
  }
  if (goal.issues) {
    throw new Error(
      `Goal in ${sourceName}: "issues" inside goals is deprecated — move to module/preset level "issues[]"`,
    );
  }
}

/**
 * Collect all active goals from selected preset and modules.
 *
 * @param {object|null} preset - The selected preset object
 * @param {object[]} modules - All loaded modules
 * @param {Set<string>} selectedModules - Names of selected modules
 * @returns {InlineGoal[]}
 */
export function collectGoals(preset, modules, selectedModules) {
  const goals = [];

  // 1. Preset goals
  if (preset?.goals) {
    for (const goal of preset.goals) {
      goals.push({ ...goal, _source: `preset:${preset.name}` });
    }
  }

  // 2. Module goals (only from selected modules)
  for (const mod of modules) {
    if (!selectedModules.has(mod.name)) continue;
    if (!mod.goal) continue;
    goals.push({ ...mod.goal, _source: `module:${mod.name}`, _module: mod.name });
  }

  return goals;
}

export { validateGoal, validateGoal as validateGoalTemplate };
