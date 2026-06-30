import { definePlugin, runWorker } from '@paperclipai/plugin-sdk';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './manifest.js';
// @ts-ignore — plain JS modules, bundled by esbuild
import { assembleCompany, toPascalCase } from './logic/assemble.js';
// @ts-ignore — plain JS module, bundled by esbuild
import { isNewerVersion } from './logic/version.js';
// @ts-ignore
import { PaperclipClient } from './api/client.js';
// @ts-ignore — plain JS module, bundled by esbuild
import {
  buildCeoAdapterConfig,
  buildWorkerAdapterConfig,
  buildCeoAgentRuntimeConfig,
  buildWorkerAgentRuntimeConfig,
  normalizeCeoAdapterType,
} from './logic/ceo-defaults.js';
// @ts-ignore
import {
  collectGoals,
  collectPresetBootstrapData,
  loadModules,
  loadPresets,
  loadRoles,
  resolveEffectiveModules,
} from './logic/load-templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Template loader ---

const DEFAULT_TEMPLATES_REPO_URL =
  'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates';
const BUNDLED_TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const PLUGIN_PACKAGE_NAME = '@starlein/paperclip-plugin-company-wizard';
const CURRENT_PLUGIN_VERSION = manifest.version;
const NPM_LATEST_URL =
  'https://registry.npmjs.org/@starlein%2Fpaperclip-plugin-company-wizard/latest';

/** Recursively copy a directory (sync). */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Download a GitHub subdirectory into destDir using git sparse-checkout.
 * Expects a URL in the form: https://github.com/{owner}/{repo}/tree/{branch}/{subpath}
 */
function downloadTemplatesFromGithub(destDir: string, githubUrl: string): void {
  // Branch is captured as the first path segment after /tree/; subpath takes the rest.
  // Branch names with slashes (e.g. feature/my-branch) are not supported in tree URLs —
  // use a tag or a branch without slashes, or pin to a commit SHA instead.
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (!match) {
    throw new Error(
      `Unsupported templates URL: ${githubUrl}. Expected https://github.com/{owner}/{repo}/tree/{branch}/{path}`,
    );
  }
  const [, owner, repo, branch, subpath] = match;
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const tmpDir = path.join(os.tmpdir(), `plugin-templates-dl-${Date.now()}`);
  try {
    execFileSync(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        '--branch',
        branch,
        cloneUrl,
        tmpDir,
      ],
      { stdio: 'pipe' },
    );
    execFileSync('git', ['sparse-checkout', 'set', subpath], { cwd: tmpDir, stdio: 'pipe' });
    const srcDir = path.join(tmpDir, subpath);
    if (!fs.existsSync(srcDir)) throw new Error(`Path '${subpath}' not found in ${cloneUrl}`);
    copyDirSync(srcDir, destDir);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
}

/**
 * Detect whether the current environment is a Docker/Paperclip server setup.
 * In Docker, the home directory is /paperclip and the instance layout uses
 * ~/instances/default/companies and ~/plugin-templates directly (no .paperclip subdir).
 * In NPX/local setups, the layout is ~/.paperclip/instances/default/companies
 * and ~/.paperclip/plugin-templates.
 */
function isDockerLayout(): boolean {
  return fs.existsSync(path.join(os.homedir(), 'instances'));
}

/**
 * Resolve (and if needed, create) the templates directory.
 * Resolution order:
 *  1. cfg.templatesPath if set → use it; auto-download if missing.
 *  2. Docker detection: ~/plugin-templates when ~/instances exists.
 *  3. Default: ~/.paperclip/plugin-templates → auto-download if missing.
 *  4. Bundled templates (dist/../templates) as last resort.
 */
async function ensureTemplatesDir(cfg: Record<string, string>): Promise<string> {
  const repoUrl = cfg.templatesRepoUrl || DEFAULT_TEMPLATES_REPO_URL;

  if (cfg.templatesPath) {
    if (fs.existsSync(cfg.templatesPath)) return cfg.templatesPath;
    downloadTemplatesFromGithub(cfg.templatesPath, repoUrl);
    return cfg.templatesPath;
  }

  // Docker detection: prefer ~/plugin-templates when ~/instances exists (Docker layout)
  if (isDockerLayout()) {
    const dockerTemplatesDir = path.join(os.homedir(), 'plugin-templates');
    if (fs.existsSync(dockerTemplatesDir)) return dockerTemplatesDir;
    try {
      downloadTemplatesFromGithub(dockerTemplatesDir, repoUrl);
      return dockerTemplatesDir;
    } catch {
      // Fall through to home-dir default
    }
  }

  const defaultDir = path.join(os.homedir(), '.paperclip', 'plugin-templates');

  if (fs.existsSync(defaultDir)) return defaultDir;

  try {
    downloadTemplatesFromGithub(defaultDir, repoUrl);
    return defaultDir;
  } catch {
    if (fs.existsSync(BUNDLED_TEMPLATES_DIR)) return BUNDLED_TEMPLATES_DIR;
    throw new Error(
      'Templates not found and download failed. Configure templatesPath or templatesRepoUrl in plugin settings.',
    );
  }
}

/**
 * The directory `ensureTemplatesDir` will actually READ from, without downloading.
 * Must mirror `ensureTemplatesDir`'s resolution (incl. the Docker layout) so the
 * refresh path targets the SAME dir the worker reads — otherwise a refresh writes
 * `~/.paperclip/plugin-templates` while the worker keeps reading the stale
 * `~/plugin-templates` (Docker), and template fixes never reach provisioning.
 */
function resolveTemplatesCacheDir(cfg: Record<string, string>): string {
  if (cfg.templatesPath) return cfg.templatesPath;
  if (isDockerLayout()) return path.join(os.homedir(), 'plugin-templates');
  return path.join(os.homedir(), '.paperclip', 'plugin-templates');
}

/**
 * Delete and re-download the templates cache from GitHub so the next assembly uses
 * the latest published templates. Returns the refreshed dir. Throws on failure;
 * callers that must not fail (e.g. provisioning) should wrap in try/catch and fall
 * back to the existing cache.
 */
function refreshTemplatesCache(cfg: Record<string, string>, log?: (m: string) => void): string {
  const repoUrl = cfg.templatesRepoUrl || DEFAULT_TEMPLATES_REPO_URL;
  const targetDir = resolveTemplatesCacheDir(cfg);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  downloadTemplatesFromGithub(targetDir, repoUrl);
  log?.(`✓ Refreshed templates cache from ${repoUrl} → ${targetDir}`);
  return targetDir;
}

type SecretResolverContext = {
  secrets: {
    resolve(secretRef: string): Promise<string>;
  };
};

function isLikelyAnthropicApiKey(value: string): boolean {
  return value.startsWith('sk-ant-');
}

async function resolveAnthropicApiKey(
  ctx: SecretResolverContext,
  configuredValue: unknown,
): Promise<string> {
  if (typeof configuredValue !== 'string') return '';
  const value = configuredValue.trim();
  if (!value) return '';

  // The setting now stores the raw Anthropic key directly (plain string field).
  if (isLikelyAnthropicApiKey(value)) return value;

  try {
    // Backward compatibility: older installs may still have a Paperclip secret
    // reference stored in config instead of the raw key.
    const resolved = await ctx.secrets.resolve(value);
    return resolved.trim();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Anthropic API key could not be resolved. Re-save the plugin setting with a valid Anthropic API key (sk-ant-...). ${detail}`,
    );
  }
}

/**
 * Single Anthropic Messages API call. Returns `{ text, error? }` — never throws,
 * so callers (sync and async job modes) can handle failures uniformly.
 */
async function callAnthropic(
  apiKey: string,
  system: unknown,
  messages: unknown,
): Promise<{ text: string; error?: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        // High ceiling so the wizard's final config — which reproduces the user's
        // full spec in the first goal — is never truncated mid-JSON. This is only
        // an upper bound; generation time tracks the tokens actually produced.
        max_tokens: 32768,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { text: '', error: `Anthropic API error (${response.status}): ${body}` };
    }

    const data = (await response.json()) as { content?: { text: string }[] };
    return { text: data.content?.[0]?.text || '' };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * In-memory store for async ai-chat jobs. The plugin runs one long-lived worker
 * process, so an in-process map is sufficient. Used to decouple long Anthropic
 * generations (e.g. the AI wizard's final config) from the host's 30s
 * `performAction` RPC timeout: the UI starts a job, then polls for the result.
 */
type AiChatJob =
  | { status: 'pending'; createdAt: number }
  | { status: 'done'; text: string; createdAt: number }
  | { status: 'error'; error: string; createdAt: number };

const aiChatJobs = new Map<string, AiChatJob>();
const AI_CHAT_JOB_TTL_MS = 10 * 60 * 1000;

/** Drop completed/abandoned jobs so the map doesn't grow unbounded. */
function sweepAiChatJobs(): void {
  const now = Date.now();
  for (const [id, job] of aiChatJobs) {
    if (now - job.createdAt > AI_CHAT_JOB_TTL_MS) aiChatJobs.delete(id);
  }
}

function loadJsonFiles(dir: string, filename: string): { items: any[]; errors: string[] } {
  const items: any[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(dir)) return { items, errors };

  for (const d of fs.readdirSync(dir)) {
    const fullDir = path.join(dir, d);
    try {
      if (!fs.statSync(fullDir).isDirectory()) continue;
    } catch {
      continue;
    }

    const fp = path.join(fullDir, filename);
    if (!fs.existsSync(fp)) continue;

    try {
      items.push(JSON.parse(fs.readFileSync(fp, 'utf-8')));
    } catch (err) {
      errors.push(`Failed to parse ${fp}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { items, errors };
}

function loadTemplates(templatesDir: string) {
  const presetLoad = loadJsonFiles(path.join(templatesDir, 'presets'), 'preset.meta.json');
  const moduleLoad = loadJsonFiles(path.join(templatesDir, 'modules'), 'module.meta.json');
  const roleLoad = loadJsonFiles(path.join(templatesDir, 'roles'), 'role.meta.json');

  const modules = moduleLoad.items.map((mod: Record<string, unknown>) => {
    const issues = Array.isArray(mod.issues)
      ? mod.issues
      : Array.isArray(mod.tasks)
        ? mod.tasks
        : [];

    return {
      ...mod,
      // Keep both keys so old UI callers (tasks) and new callers (issues) stay consistent.
      issues,
      tasks: Array.isArray(mod.tasks) ? mod.tasks : issues,
    };
  });

  const roles = roleLoad.items.map((r: Record<string, unknown>) => {
    if (r.base) return { ...r, _base: true };
    return r;
  });

  return {
    presets: presetLoad.items,
    modules,
    roles,
    loadErrors: [...presetLoad.errors, ...moduleLoad.errors, ...roleLoad.errors],
  };
}

// --- Helpers ---

type InstanceExperimentalSettings = {
  enableIsolatedWorkspaces?: boolean;
};

/**
 * Resolve the Paperclip connection parameters from plugin config.
 */
function resolvePaperclipCredentials(cfg: Record<string, string>): {
  url: string;
  email: string;
  password: string;
} {
  return {
    url: cfg.paperclipUrl || process.env.PAPERCLIP_PUBLIC_URL || 'http://localhost:3100',
    email: cfg.paperclipEmail || '',
    password: cfg.paperclipPassword || '',
  };
}

/**
 * Cross-action session cache. The plugin runs one long-lived worker process, and a
 * single wizard run fires several actions back-to-back (check-auth, preview-files,
 * preview-company-update, start-provision) — each of which previously created its own
 * client and performed a fresh Better Auth sign-in. On authenticated instances the
 * sign-in endpoint is rate-limited, so the burst tripped `429 Too many requests`.
 *
 * We cache the resolved session cookie (+ board identity) keyed by URL+email and reuse
 * it across actions for a short TTL, validating with a cheap GET (`ping`) rather than
 * another sign-in. Sign-ins only happen on first connect or after the cookie expires.
 */
type SharedAuthCache = {
  key: string;
  ts: number;
  sessionCookie: string | null;
  boardUserId: string | null;
  boardUserName: string | null;
  boardUserEmail: string | null;
};

let sharedAuthCache: SharedAuthCache | null = null;
const SHARED_AUTH_TTL_MS = 5 * 60 * 1000;

/**
 * Connect to Paperclip, reusing a cached session when one is still valid. Returns a
 * ready-to-use client. On a cache hit the session cookie is validated with a single
 * GET; on a miss (or stale/invalid session) it performs a normal `connect()` and
 * refreshes the cache.
 */
async function connectSharedClient(cfg: Record<string, string>): Promise<PaperclipClient> {
  const { url, email, password } = resolvePaperclipCredentials(cfg);
  const key = `${url}|${email}`;
  const client = new PaperclipClient(url, { email, password });

  if (
    sharedAuthCache &&
    sharedAuthCache.key === key &&
    Date.now() - sharedAuthCache.ts < SHARED_AUTH_TTL_MS
  ) {
    client.sessionCookie = sharedAuthCache.sessionCookie;
    client.boardUserId = sharedAuthCache.boardUserId;
    client.boardUserName = sharedAuthCache.boardUserName;
    client.boardUserEmail = sharedAuthCache.boardUserEmail;
    // Validate cheaply (a GET, not the rate-limited sign-in). If the session is still
    // good, reuse it; otherwise fall through to a fresh connect below.
    if (await client.ping()) {
      return client;
    }
  }

  await client.connect();
  sharedAuthCache = {
    key,
    ts: Date.now(),
    sessionCookie: client.sessionCookie,
    boardUserId: client.boardUserId,
    boardUserName: client.boardUserName,
    boardUserEmail: client.boardUserEmail,
  };
  return client;
}

async function resolveEnableIsolatedWorkspacesFromInstance(
  cfg: Record<string, string>,
  log?: (msg: string) => void,
): Promise<boolean> {
  try {
    const instanceClient = await connectSharedClient(cfg);
    const experimentalSettings = (await instanceClient.getInstanceExperimentalSettings()) as
      | InstanceExperimentalSettings
      | undefined;
    return experimentalSettings?.enableIsolatedWorkspaces === true;
  } catch (err) {
    if (log) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`⚠ Could not read instance experimental settings: ${detail}. Using fallback false.`);
    }
    return false;
  }
}

function resolveCompaniesDir(cfg: Record<string, string>): string {
  if (cfg.companiesDir) return cfg.companiesDir;
  return path.join(os.homedir(), '.paperclip', 'instances', 'default', 'companies');
}

function mkdirErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function ensureWritableDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
}

export function resolveWritableCompaniesDir(
  cfg: Record<string, string>,
  log?: (msg: string) => void,
): string {
  const configuredDir = typeof cfg.companiesDir === 'string' ? cfg.companiesDir.trim() : '';
  if (configuredDir) {
    try {
      ensureWritableDir(configuredDir);
      return configuredDir;
    } catch (err) {
      throw new Error(
        `Configured companiesDir is not writable (${configuredDir}): ${mkdirErrorMessage(err)}`,
      );
    }
  }

  // Auto-detect: Docker layout uses ~/instances, NPX layout uses ~/.paperclip/instances
  const candidates: string[] = [];
  if (isDockerLayout()) {
    // Docker: home is /paperclip, layout is ~/instances/default/companies
    candidates.push(path.join(os.homedir(), 'instances', 'default', 'companies'));
  }
  // NPX/local: ~/.paperclip/instances/default/companies
  candidates.push(resolveCompaniesDir(cfg));
  // Last resort: OS temp dir
  candidates.push(path.join(os.tmpdir(), 'paperclip-companies'));
  const attempted = new Set<string>();
  let lastError = '';

  for (const candidate of candidates) {
    if (attempted.has(candidate)) continue;
    attempted.add(candidate);
    try {
      ensureWritableDir(candidate);
      return candidate;
    } catch (err) {
      const message = mkdirErrorMessage(err);
      lastError = `${candidate}: ${message}`;
      if (log) log(`⚠ Companies dir unavailable: ${candidate} (${message})`);
    }
  }

  throw new Error(
    `Unable to prepare a writable companies directory. Last attempt failed at ${lastError}`,
  );
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function normalizeGitBranch(value: unknown): string {
  const branch = typeof value === 'string' && value.trim() ? value.trim() : 'main';
  return /^[A-Za-z0-9._/-]+$/.test(branch) ? branch.replace(/^origin\//, '') : 'main';
}

export function prepareLocalProjectWorkspace(
  mainProject: { name?: string; workspace?: Record<string, unknown> } | null | undefined,
  companyDir: string,
  log?: (msg: string) => void,
  gitIdentity?: { name?: string | null; email?: string | null } | null,
): void {
  const workspace = mainProject?.workspace;
  if (!workspace || workspace.sourceType !== 'local_path') return;

  const cwd = typeof workspace.cwd === 'string' ? workspace.cwd.trim() : '';
  if (!cwd) return;

  const resolvedCompanyDir = path.resolve(companyDir);
  const resolvedCwd = path.resolve(cwd);
  if (!isPathInside(resolvedCompanyDir, resolvedCwd)) {
    log?.(`⚠ Skipped project workspace preparation outside company dir: ${resolvedCwd}`);
    return;
  }

  fs.mkdirSync(resolvedCwd, { recursive: true });

  const gitDir = path.join(resolvedCwd, '.git');
  if (fs.existsSync(gitDir)) {
    log?.(`✓ Project workspace ready: ${resolvedCwd}`);
    return;
  }

  const branch = normalizeGitBranch(workspace.defaultRef);
  const gitUserName = gitIdentity?.name || 'Paperclip Bootstrap';
  const gitUserEmail = gitIdentity?.email || 'bootstrap@paperclip.local';
  execFileSync('git', ['init', '-b', branch], { cwd: resolvedCwd, stdio: 'pipe' });
  execFileSync(
    'git',
    [
      '-c',
      `user.email=${gitUserEmail}`,
      '-c',
      `user.name=${gitUserName}`,
      'commit',
      '--allow-empty',
      '-m',
      'chore: initialize repository',
    ],
    { cwd: resolvedCwd, stdio: 'pipe' },
  );
  log?.(`✓ Project workspace initialized: ${resolvedCwd}`);
}

function formatRoleName(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Point an agent's instructions at the assembled on-disk directory using the host's
 * **external** bundle mode (rather than a managed bundle materialized under
 * `companies/<companyId>/agents/<agentId>/instructions`). `sourceDir` is the
 * human-readable assembled dir, e.g.
 * `…/companies/<CompanyName>/agents/<role>/`, and `entryFile` is `AGENTS.md`.
 *
 * `updateInstructionsBundle({ mode: 'external', rootPath, entryFile })` sets
 * `instructionsBundleMode`/`instructionsRootPath`/`instructionsEntryFile` AND
 * `instructionsFilePath = rootPath/entryFile` on the agent's adapterConfig. Every
 * local adapter (codex/claude/acpx) reads `instructionsFilePath`, injects its
 * content, and tells the model to resolve relative file references from its
 * directory — so the assembled `HEARTBEAT.md` / `skills/<x>.md` / `../../docs/<y>.md`
 * references resolve correctly without any absolute paths, and existing managed
 * agents are migrated to external in a single call.
 */
async function setExternalInstructionsBundle({
  client,
  agentId,
  sourceDir,
  entryFile,
  log,
}: {
  client: any;
  agentId: string;
  sourceDir: string;
  entryFile: string;
  log: (m: string) => void;
}) {
  try {
    await client.updateInstructionsBundle(agentId, {
      mode: 'external',
      rootPath: sourceDir,
      entryFile,
      clearLegacyPromptTemplate: true,
    });
    log(`✓ Pointed instructions at external dir ${sourceDir} (entry ${entryFile})`);
  } catch (err) {
    log(
      `⚠ Could not set external instructions bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Preserve existing `paperclipSkillSync.desiredSkills` from an agent's current
 * `adapterConfig` when updating it. The plugin rebuilds `adapterConfig` from scratch
 * (via `buildWorkerAdapterConfig` / `buildCeoAdapterConfig`), which does NOT include
 * `paperclipSkillSync`. Without this merge, individual runtime skill assignments are
 * lost on every update.
 *
 * Merges the existing `paperclipSkillSync` key into `nextAdapterConfig` so the PATCH
 * preserves the agent's skill sync preferences.
 */
function preserveExistingSkillSync(
  existingAgent: any,
  nextAdapterConfig: Record<string, unknown>,
): Record<string, unknown> {
  const existingSync =
    existingAgent?.adapterConfig &&
    typeof existingAgent.adapterConfig === 'object' &&
    'paperclipSkillSync' in (existingAgent.adapterConfig as Record<string, unknown>)
      ? (existingAgent.adapterConfig as Record<string, unknown>).paperclipSkillSync
      : undefined;

  if (!existingSync) {
    return nextAdapterConfig;
  }

  return {
    ...nextAdapterConfig,
    paperclipSkillSync: existingSync,
  };
}

function routineTemplateTitle(routine: any): string {
  if (typeof routine?.title === 'string' && routine.title.trim()) return routine.title.trim();
  if (typeof routine?.name === 'string' && routine.name.trim()) return routine.name.trim();
  return '';
}

interface WizardManifest {
  pluginVersion: string;
  preset: string | null;
  modules: string[];
  roles: string[];
  generatedFilePaths: Record<string, string[]>;
  routineTitles: string[];
  updatedAt: string;
}

function buildWizardManifest(params: {
  presetName: string | null;
  selectedModules: string[];
  selectedRoleNames: string[];
  assembleResult: any;
  initialRoutines: any[];
}): WizardManifest {
  const routineTitles = params.initialRoutines
    .map((r: any) => routineTemplateTitle(r))
    .filter(Boolean);

  const generatedFilePaths: Record<string, string[]> = {};
  if (params.assembleResult?.allFiles && typeof params.assembleResult.allFiles === 'object') {
    for (const relativePath of Object.keys(params.assembleResult.allFiles)) {
      const match = relativePath.match(/^agents\/([^/]+)\//);
      if (match) {
        const agentRole = match[1];
        if (!generatedFilePaths[agentRole]) generatedFilePaths[agentRole] = [];
        generatedFilePaths[agentRole].push(relativePath);
      } else if (relativePath.startsWith('docs/')) {
        if (!generatedFilePaths['docs']) generatedFilePaths['docs'] = [];
        generatedFilePaths['docs'].push(relativePath);
      }
    }
  }

  return {
    pluginVersion: CURRENT_PLUGIN_VERSION,
    preset: params.presetName,
    modules: params.selectedModules,
    roles: params.selectedRoleNames,
    generatedFilePaths,
    routineTitles,
    updatedAt: new Date().toISOString(),
  };
}

const WIZARD_PLUGIN_KEY = 'starlein.paperclip-plugin-company-wizard';

async function findPluginId(client: PaperclipClient): Promise<string | null> {
  try {
    const plugins: any[] = await client._fetch('/api/plugins');
    const match = Array.isArray(plugins)
      ? plugins.find((p: any) => p.pluginKey === WIZARD_PLUGIN_KEY)
      : null;
    return match?.id ?? null;
  } catch {
    return null;
  }
}

async function syncRoutineTrigger({
  client,
  routineId,
  schedule,
  log,
}: {
  client: any;
  routineId: string;
  schedule?: string;
  log: (m: string) => void;
}) {
  if (!schedule) return;

  try {
    const detail = await client.getRoutine(routineId);
    const triggers = Array.isArray(detail?.triggers) ? detail.triggers : [];
    const scheduleTrigger = triggers.find((trigger: any) => trigger?.kind === 'schedule');
    if (scheduleTrigger?.id) {
      await client.updateRoutineTrigger(scheduleTrigger.id, {
        enabled: true,
        cronExpression: schedule,
        timezone: scheduleTrigger.timezone || 'UTC',
      });
      return;
    }

    await client.createRoutineTrigger(routineId, {
      kind: 'schedule',
      cronExpression: schedule,
      timezone: 'UTC',
    });
  } catch (err) {
    log(
      `⚠ Could not sync trigger for routine "${routineId}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function syncExistingCompanyRoutines({
  client,
  companyId,
  routines,
  ceoAgentId,
  teamAgentIds,
  log,
}: {
  client: any;
  companyId: string;
  routines: any[];
  ceoAgentId: string;
  teamAgentIds: Record<string, string>;
  log: (m: string) => void;
}) {
  if (!Array.isArray(routines) || routines.length === 0) return;

  let existingRoutines: any[] = [];
  try {
    existingRoutines = await client.listRoutines(companyId);
  } catch (err) {
    log(
      `⚠ Could not list existing routines for template sync: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const byTitle = new Map<string, any>();
  for (const existing of existingRoutines) {
    if (typeof existing?.title === 'string' && existing.title.trim()) {
      byTitle.set(existing.title.trim().toLowerCase(), existing);
    }
  }

  for (const routine of routines) {
    const title = routineTemplateTitle(routine);
    if (!title) continue;

    const role = routine.assignTo;
    const assigneeAgentId =
      !role || role === 'ceo' ? ceoAgentId : (teamAgentIds[role] ?? ceoAgentId);
    const payload = {
      title,
      description: routine.description || null,
      assigneeAgentId,
      priority: routine.priority || 'medium',
      status: routine.status || 'active',
      concurrencyPolicy: routine.concurrencyPolicy || 'skip_if_active',
      catchUpPolicy: routine.catchUpPolicy || 'skip_missed',
    };

    const existing = byTitle.get(title.toLowerCase());
    try {
      if (existing?.id) {
        await client.updateRoutine(existing.id, payload);
        await syncRoutineTrigger({
          client,
          routineId: existing.id,
          schedule: routine.schedule,
          log,
        });
        log(`✓ Synced existing routine "${title}"`);
      } else {
        const created = await client.createRoutine(companyId, payload);
        if (routine.schedule && created?.id) {
          await client.createRoutineTrigger(created.id, {
            kind: 'schedule',
            cronExpression: routine.schedule,
            timezone: 'UTC',
          });
        }
        log(
          `✓ Created missing routine "${title}"${routine.schedule ? ` (${routine.schedule})` : ''}`,
        );
      }
    } catch (err) {
      log(
        `⚠ Could not sync routine "${title}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function buildDecisionLogBody({
  companyName,
  companyDescription,
  preset,
  moduleNames,
  roles,
  repositoryMode,
  approvalMode,
}: {
  companyName: string;
  companyDescription?: string;
  preset?: string;
  moduleNames: string[];
  roles: string[];
  repositoryMode: string;
  approvalMode: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return `# Decision Log — ${companyName}

## ${today}
- Created or selected company "${companyName}"${companyDescription ? ` with mission: ${companyDescription}` : ''}.
- Selected preset: ${preset || 'custom/manual'}.
- Selected modules: ${moduleNames.length > 0 ? moduleNames.join(', ') : 'none'}.
- Initial roles: ${roles.join(', ')}.
- Repository setup: ${repositoryMode}.
- Hiring governance: ${approvalMode}.
- Company Wizard generated the initial bootstrap package, agent instruction bundles, routines, and backlog seed from templates.
`;
}

function buildHiringPlanBody({
  companyName,
  roles,
  moduleNames,
}: {
  companyName: string;
  roles: string[];
  moduleNames: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return `# Hiring Plan — ${companyName}

Generated by Company Wizard on ${today}.

## Status: initial team already provisioned

Company Wizard has already submitted the initial team below as **governed hires**
via \`/agent-hires\` (each with a full instruction bundle assembled from curated role
templates). Where the board requires approval, those hires are pending your approval —
they were **not** auto-approved.

**This issue is your review checkpoint — not a re-hiring task.** Do not create the
roles below again.

## Your tasks

1. **Review each provisioned agent against the draft-review checklist** (Paperclip
   \`paperclip-create-agent\` → \`references/draft-review-checklist.md\`): instruction
   quality, correct adapter/model/thinking level, escalation/reportsTo path, and
   desiredSkills justification. Note any corrections in the decision log.
2. **Approve or reject** the pending hires accordingly.
3. **Only hire for genuine gaps.** If a capability is missing after the first
   roadmap/backlog pass, follow the \`paperclip-create-agent\` workflow: pick an exact,
   adjacent, or generic template, run the draft-review checklist, submit via
   \`/agent-hires\` with a concrete AGENTS.md draft + adapter config + desiredSkills
   justification, and set \`sourceIssueId\` to this issue.

## Initial Roles (already provisioned)

${roles.map((role) => `- ${formatRoleName(role)}`).join('\n')}

## Selected Modules

${moduleNames.length > 0 ? moduleNames.map((mod) => `- ${mod}`).join('\n') : '- none'}
`;
}

// --- Plugin definition ---

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register('templates', async () => {
      const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
      const templates = loadTemplates(await ensureTemplatesDir(cfg));
      if (templates.loadErrors.length > 0) {
        for (const err of templates.loadErrors) {
          ctx.logger.info(`⚠ Template load warning: ${err}`);
        }
      }
      return templates;
    });

    // Refresh templates — delete cached dir so next load re-downloads from GitHub.
    ctx.actions.register('refresh-templates', async () => {
      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        // Refresh the SAME dir ensureTemplatesDir reads (Docker-aware) — previously
        // this always targeted ~/.paperclip/plugin-templates, so on Docker instances
        // (where the worker reads ~/plugin-templates) the refresh hit the wrong dir
        // and template fixes never reached the agents.
        const targetDir = refreshTemplatesCache(cfg);
        return { ok: true, targetDir };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    ctx.actions.register('check-update', async () => {
      try {
        const response = await fetch(NPM_LATEST_URL, {
          headers: { accept: 'application/json' },
        });
        if (!response.ok) {
          return {
            ok: false,
            currentVersion: CURRENT_PLUGIN_VERSION,
            packageName: PLUGIN_PACKAGE_NAME,
            error: `npm registry returned ${response.status}`,
          };
        }

        const data = (await response.json()) as { version?: unknown };
        const latestVersion = typeof data.version === 'string' ? data.version.trim() : '';
        if (!latestVersion) {
          return {
            ok: false,
            currentVersion: CURRENT_PLUGIN_VERSION,
            packageName: PLUGIN_PACKAGE_NAME,
            error: 'npm registry response did not include a version',
          };
        }

        return {
          ok: true,
          packageName: PLUGIN_PACKAGE_NAME,
          currentVersion: CURRENT_PLUGIN_VERSION,
          latestVersion,
          updateAvailable: isNewerVersion(latestVersion, CURRENT_PLUGIN_VERSION),
          url: 'https://www.npmjs.com/package/@starlein/paperclip-plugin-company-wizard',
        };
      } catch (err) {
        return {
          ok: false,
          currentVersion: CURRENT_PLUGIN_VERSION,
          packageName: PLUGIN_PACKAGE_NAME,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // Preview action — assembles files to a temp dir and returns their contents.
    // Used by the UI review step to show/edit generated MD files before provisioning.
    ctx.actions.register('preview-files', async (params) => {
      let tmpDir: string | undefined;
      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;

        const companyName =
          typeof params.companyName === 'string' && params.companyName.trim()
            ? params.companyName.trim()
            : 'Preview';

        const templatesDir = await ensureTemplatesDir(cfg);
        tmpDir = path.join(os.tmpdir(), `company-wizard-preview-${Date.now()}`);

        // Resolve the companies dir so BOOTSTRAP.md shows correct paths in preview.
        const companiesDir = resolveWritableCompaniesDir(cfg);

        const [presets, allModules] = await Promise.all([
          loadPresets(templatesDir),
          loadModules(templatesDir),
        ]);
        const selectedPreset = presets.find((p: any) => p.name === params.presetName) || null;
        const effectiveModules = resolveEffectiveModules(
          selectedPreset,
          allModules,
          (params.selectedModules as string[]) ?? [],
        );
        const goals = collectGoals(selectedPreset, allModules, new Set(effectiveModules));
        const presetBootstrapData = collectPresetBootstrapData(selectedPreset);

        // Normalize goals/projects for preview (same logic as start-provision)
        const previewGoals: any[] = Array.isArray(params.goals)
          ? (params.goals as any[])
          : params.goal
            ? [params.goal]
            : [];
        const previewProjects: any[] = Array.isArray(params.projects)
          ? (params.projects as any[])
          : [];
        const previewIssues: any[] = Array.isArray(params.issues) ? (params.issues as any[]) : [];

        const result = await assembleCompany({
          companyName,
          userGoals: previewGoals,
          userProjects: previewProjects,
          moduleNames: effectiveModules,
          extraRoleNames: (params.selectedRoles as string[]) ?? [],
          inlineGoals: goals,
          userIssues: previewIssues,
          presetIssues: presetBootstrapData.issues,
          presetRoutines: presetBootstrapData.routines,
          presetLabels: presetBootstrapData.labels,
          enableIsolatedWorktrees: await resolveEnableIsolatedWorkspacesFromInstance(cfg),
          enableEnrichedPersonas: true,
          outputDir: tmpDir,
          templatesDir,
        });

        // Collect all .md files from the assembled company dir.
        // For BOOTSTRAP.md, replace the tmp path with the realistic host workspace path
        // so the preview shows where files will actually live after provisioning.
        const previewCompanyDir = path.join(companiesDir, toPascalCase(companyName));
        const files: Record<string, string> = {};

        function collectMdFiles(dir: string, base: string) {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = base ? `${base}/${entry.name}` : entry.name;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              collectMdFiles(full, rel);
            } else if (entry.name.endsWith('.md')) {
              let content = fs.readFileSync(full, 'utf-8');
              if (entry.name === 'BOOTSTRAP.md') {
                content = content.replaceAll(result.companyDir, previewCompanyDir);
              }
              files[rel] = content;
            }
          }
        }

        collectMdFiles(result.companyDir, '');
        return { files };
      } catch (err) {
        return { files: {}, error: err instanceof Error ? err.message : String(err) };
      } finally {
        if (tmpDir) {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {
            /* */
          }
        }
      }
    });

    // Preview company update — dry-run diff of what would change for an existing company.
    // READ-ONLY: no writes to Paperclip. Returns agents/routines diff and preserved skills.
    ctx.actions.register('preview-company-update', async (params) => {
      let tmpDir: string | undefined;
      try {
        const existingCompanyId =
          typeof params.existingCompanyId === 'string' && params.existingCompanyId.trim()
            ? params.existingCompanyId.trim()
            : '';
        if (!existingCompanyId) {
          return { error: 'existingCompanyId is required for preview.' };
        }

        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;

        const companyName =
          typeof params.companyName === 'string' && params.companyName.trim()
            ? params.companyName.trim()
            : 'Preview';

        const templatesDir = await ensureTemplatesDir(cfg);
        tmpDir = path.join(os.tmpdir(), `company-wizard-preview-update-${Date.now()}`);

        const [presets, allModules, roleTemplates] = await Promise.all([
          loadPresets(templatesDir),
          loadModules(templatesDir),
          loadRoles(templatesDir),
        ]);
        const roleTemplateByName = new Map(
          (Array.isArray(roleTemplates) ? roleTemplates : [])
            .filter((role: any) => role && typeof role.name === 'string')
            .map((role: any) => [role.name, role]),
        );
        const selectedPreset = presets.find((p: any) => p.name === params.presetName) || null;
        const effectiveModules = resolveEffectiveModules(
          selectedPreset,
          allModules,
          (params.selectedModules as string[]) ?? [],
        );
        const goals = collectGoals(selectedPreset, allModules, new Set(effectiveModules));
        const presetBootstrapData = collectPresetBootstrapData(selectedPreset);

        const previewGoals: any[] = Array.isArray(params.goals)
          ? (params.goals as any[])
          : params.goal
            ? [params.goal]
            : [];
        const previewProjects: any[] = Array.isArray(params.projects)
          ? (params.projects as any[])
          : [];
        const previewIssues: any[] = Array.isArray(params.issues) ? (params.issues as any[]) : [];

        const assembleResult = await assembleCompany({
          companyName,
          userGoals: previewGoals,
          userProjects: previewProjects,
          moduleNames: effectiveModules,
          extraRoleNames: (params.selectedRoles as string[]) ?? [],
          inlineGoals: goals,
          userIssues: previewIssues,
          presetIssues: presetBootstrapData.issues,
          presetRoutines: presetBootstrapData.routines,
          presetLabels: presetBootstrapData.labels,
          enableIsolatedWorktrees: await resolveEnableIsolatedWorkspacesFromInstance(cfg),
          enableEnrichedPersonas: true,
          outputDir: tmpDir,
          templatesDir,
        });

        const allRoles = Array.isArray(params.allRoles)
          ? (params.allRoles as string[])
          : [...(assembleResult.allRoles ?? [])].filter(Boolean);
        const teamRoles = allRoles.filter((r: string) => r && r !== 'ceo');

        // Count planned files (assemble created them in tmpDir)
        let plannedFiles = 0;
        function countFiles(dir: string): void {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) countFiles(full);
            else if (entry.isFile()) plannedFiles++;
          }
        }
        countFiles(assembleResult.companyDir);

        // Connect to Paperclip API to read existing data
        const client = await connectSharedClient(cfg);

        const company = await client.getCompany(existingCompanyId);
        const existingAgents = await client.listAgents(existingCompanyId);
        const existingRoutines = await client.listRoutines(existingCompanyId);

        // Read the wizard manifest (best-effort) for better retired-role detection
        let existingManifest: WizardManifest | null = null;
        try {
          const pluginId = await findPluginId(client);
          if (pluginId) {
            const settings = await client._fetch(
              `/api/plugins/${pluginId}/company-settings/${existingCompanyId}`,
            );
            const manifestData =
              settings?.settingsJson?.wizardManifest ?? settings?.settings_json?.wizardManifest;
            if (manifestData && typeof manifestData === 'object') {
              existingManifest = manifestData as WizardManifest;
            }
          }
        } catch {
          // Manifest read failure is non-fatal — preview still works without it
        }

        // Build agent diff
        const existingCeo = Array.isArray(existingAgents)
          ? existingAgents.find((a: any) => a?.role === 'ceo' && a?.status !== 'terminated')
          : null;

        const existingByTemplateRole = new Map<string, any>();
        if (Array.isArray(existingAgents)) {
          for (const a of existingAgents) {
            const tr = a?.metadata?.templateRole;
            if (tr && a?.status !== 'terminated' && a?.role !== 'ceo') {
              existingByTemplateRole.set(tr, a);
            }
          }
        }

        const agents: { role: string; title: string; action: string }[] = [];

        // CEO always present — update if exists, hire if not
        const ceoTemplate = roleTemplateByName.get('ceo') || {};
        const ceoTitle =
          typeof ceoTemplate.title === 'string' && ceoTemplate.title.trim()
            ? ceoTemplate.title.trim()
            : 'CEO';
        agents.push({
          role: 'ceo',
          title: existingCeo?.title || ceoTitle,
          action: existingCeo ? 'update' : 'hire',
        });

        // Team roles: hire or update
        for (const roleName of teamRoles) {
          const roleTemplate = roleTemplateByName.get(roleName) || {};
          const roleTitle =
            typeof roleTemplate.title === 'string' && roleTemplate.title.trim()
              ? roleTemplate.title.trim()
              : formatRoleName(roleName);
          const existing = existingByTemplateRole.get(roleName);
          agents.push({
            role: roleName,
            title: roleTitle,
            action: existing ? 'update' : 'hire',
          });
        }

        // Retire: existing templateRole agents not in the new selection.
        // Use the manifest roles list when available — it records which roles
        // the wizard originally provisioned, so we can distinguish "was in the
        // wizard's last run" from "manually added by a human" (which we should
        // never retire without explicit user consent).
        const selectedRoleSet = new Set(allRoles);
        const manifestRoleSet = existingManifest?.roles ? new Set(existingManifest.roles) : null;
        for (const [tr, agent] of existingByTemplateRole.entries()) {
          if (!selectedRoleSet.has(tr)) {
            // If we have a manifest and this role was NOT in it, skip retirement —
            // it was added outside the wizard and shouldn't be auto-retired.
            if (manifestRoleSet && !manifestRoleSet.has(tr)) {
              continue;
            }
            const roleTemplate = roleTemplateByName.get(tr) || {};
            const roleTitle =
              typeof roleTemplate.title === 'string' && roleTemplate.title.trim()
                ? roleTemplate.title.trim()
                : formatRoleName(tr);
            agents.push({
              role: tr,
              title: agent?.title || roleTitle,
              action: 'retire',
            });
          }
        }

        // Build routine diff — match by title (same as syncExistingCompanyRoutines)
        const existingRoutineByTitle = new Map<string, any>();
        if (Array.isArray(existingRoutines)) {
          for (const r of existingRoutines) {
            const title = routineTemplateTitle(r);
            if (title) existingRoutineByTitle.set(title.toLowerCase(), r);
          }
        }

        const plannedRoutines = [
          ...(assembleResult.initialRoutines ?? []),
          ...(presetBootstrapData.routines ?? []),
        ];
        // Deduplicate routines by title
        const seenRoutineTitles = new Set<string>();
        const routines: { title: string; action: string; assignTo?: string }[] = [];
        for (const routine of plannedRoutines) {
          const title = routineTemplateTitle(routine);
          if (!title) continue;
          const key = title.toLowerCase();
          if (seenRoutineTitles.has(key)) continue;
          seenRoutineTitles.add(key);
          const existing = existingRoutineByTitle.get(key);
          routines.push({
            title,
            action: existing ? 'update' : 'create',
            assignTo: routine.assignTo || undefined,
          });
        }

        // Collect desiredSkillsPreserved from existing agents
        const desiredSkillsPreserved: { agentId: string; agentName: string; skills: string[] }[] =
          [];
        if (Array.isArray(existingAgents)) {
          for (const a of existingAgents) {
            if (
              a?.adapterConfig &&
              typeof a.adapterConfig === 'object' &&
              'paperclipSkillSync' in (a.adapterConfig as Record<string, unknown>)
            ) {
              const sync = (a.adapterConfig as Record<string, unknown>).paperclipSkillSync;
              if (
                sync &&
                typeof sync === 'object' &&
                'desiredSkills' in (sync as Record<string, unknown>)
              ) {
                const skills = (sync as Record<string, unknown>).desiredSkills;
                if (Array.isArray(skills) && skills.length > 0) {
                  desiredSkillsPreserved.push({
                    agentId: a.id,
                    agentName: a.title || a.name || a.id,
                    skills: skills as string[],
                  });
                }
              }
            }
          }
        }

        // Clean up temp dir
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* */
        }
        tmpDir = undefined;

        return {
          diff: {
            companyId: existingCompanyId,
            companyName: company?.name || companyName,
            agents,
            routines,
            desiredSkillsPreserved,
            plannedFiles,
            existingManifest,
          },
        };
      } catch (err) {
        if (tmpDir) {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {
            /* */
          }
        }
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    // Auth check action — called by the summary step to surface credential issues early.
    ctx.actions.register('check-auth', async () => {
      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        await connectSharedClient(cfg);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    // List companies — populates the "Update existing company" dropdown so the user
    // picks from a list instead of pasting a UUID. Returns { companies } or { error }.
    ctx.actions.register('list-companies', async () => {
      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        const client = await connectSharedClient(cfg);
        const companies = await client.listCompanies();
        const normalized = (Array.isArray(companies) ? companies : [])
          .filter((c: any) => c && typeof c.id === 'string')
          .map((c: any) => ({
            id: c.id as string,
            name: typeof c.name === 'string' ? c.name : '',
            description: typeof c.description === 'string' ? c.description : '',
          }));
        return { companies: normalized };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    // AI chat action — proxies messages to the Anthropic API using the configured key.
    // Keeps the API key server-side; the UI never touches it directly.
    // Returns { text, error? } — never throws, so the plugin host doesn't swallow the message in a 502.
    ctx.actions.register('ai-chat', async (params) => {
      try {
        // Poll mode: return the status of a previously started async job.
        // Each poll returns immediately, so it never approaches the 30s RPC timeout.
        if (params.mode === 'poll') {
          const jobId = typeof params.jobId === 'string' ? params.jobId : '';
          const job = jobId ? aiChatJobs.get(jobId) : undefined;
          if (!job) {
            return {
              text: '',
              status: 'error',
              error: 'Unknown or expired generation job. Please retry.',
            };
          }
          if (job.status === 'pending') return { status: 'pending' };
          // Terminal state — hand it back and free the slot.
          aiChatJobs.delete(jobId);
          if (job.status === 'error') return { text: '', status: 'error', error: job.error };
          return { text: job.text, status: 'done' };
        }

        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        const apiKey = await resolveAnthropicApiKey(ctx, cfg.anthropicApiKey);
        if (!apiKey) {
          return {
            text: '',
            error: 'Anthropic API key not configured. Add it in plugin settings (anthropicApiKey).',
          };
        }

        // Start mode: kick off generation in the background and return a job id.
        // The UI polls with { mode: 'poll', jobId }, so a slow generation (e.g. the
        // wizard's final config, which can take well over 30s) never trips the host's
        // 30s performAction RPC timeout.
        if (params.mode === 'start') {
          sweepAiChatJobs();
          const jobId = `aichat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          aiChatJobs.set(jobId, { status: 'pending', createdAt: Date.now() });
          void callAnthropic(apiKey, params.system, params.messages).then((result) => {
            aiChatJobs.set(
              jobId,
              result.error
                ? { status: 'error', error: result.error, createdAt: Date.now() }
                : { status: 'done', text: result.text, createdAt: Date.now() },
            );
          });
          return { jobId, status: 'pending' };
        }

        // Synchronous mode (default): short interview turns that finish well within 30s.
        return await callAnthropic(apiKey, params.system, params.messages);
      } catch (err) {
        return { text: '', error: err instanceof Error ? err.message : String(err) };
      }
    });

    // Lightweight config check — UI calls this on mount to show a warning before the user types.
    ctx.actions.register('check-ai-config', async () => {
      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        const apiKey = await resolveAnthropicApiKey(ctx, cfg.anthropicApiKey);
        if (!apiKey) {
          return {
            ok: false,
            error: 'Anthropic API key not configured. Add it in plugin settings (anthropicApiKey).',
          };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    // Provisioning action — assembles files, then creates company/agent/issue.
    // Uses the plugin SDK host services where available (issues, goals),
    // falls back to PaperclipClient HTTP for operations the SDK doesn't support
    // yet (company creation, agent creation).
    // Returns { ..., logs } on success or { error, logs } on failure — never throws.
    ctx.actions.register('start-provision', async (params) => {
      const logs: string[] = [];
      const log = (msg: string) => {
        logs.push(msg);
        ctx.logger.info(msg);
      };

      try {
        const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
        const paperclipEmail = cfg.paperclipEmail || '';
        const enableIsolatedWorktrees = await resolveEnableIsolatedWorkspacesFromInstance(cfg, log);
        const enableEnrichedPersonas = true;

        const companyName = typeof params.companyName === 'string' ? params.companyName.trim() : '';
        const existingCompanyId =
          typeof params.existingCompanyId === 'string' && params.existingCompanyId.trim()
            ? params.existingCompanyId.trim()
            : '';
        if (!companyName) return { error: 'companyName is required', logs };

        // Refresh the templates cache from the repo before assembling so an update
        // always provisions the LATEST published instructions — otherwise a stale
        // local cache silently re-writes old agent instructions over the fix
        // (a fixed-but-never-deployed trap, especially on existing-company updates).
        // Best-effort: a download failure falls back to the existing cache.
        //
        // Skip when `templatesPath` is explicitly configured — that path is a
        // user-managed templates dir (e.g. a local working copy synced by hand), and
        // deleting + re-downloading it from GitHub on every provision would clobber it.
        if (params.refreshTemplates !== false && !cfg.templatesPath) {
          try {
            refreshTemplatesCache(cfg, log);
          } catch (err) {
            log(
              `⚠ Could not refresh templates cache (${err instanceof Error ? err.message : String(err)}); using existing cache.`,
            );
          }
        } else if (cfg.templatesPath) {
          log(`Using configured templatesPath (${cfg.templatesPath}); skipping auto-refresh.`);
        }

        const templatesDir = await ensureTemplatesDir(cfg);

        // Step 1: Collect inline goals and role metadata
        const [presets, allModules, roleTemplates] = await Promise.all([
          loadPresets(templatesDir),
          loadModules(templatesDir),
          loadRoles(templatesDir),
        ]);
        const roleTemplateByName = new Map(
          (Array.isArray(roleTemplates) ? roleTemplates : [])
            .filter((role: any) => role && typeof role.name === 'string')
            .map((role: any) => [role.name, role]),
        );
        const selectedPreset = presets.find((p: any) => p.name === params.presetName) || null;
        const effectiveModules = resolveEffectiveModules(
          selectedPreset,
          allModules,
          (params.selectedModules as string[]) ?? [],
        );
        const goals = collectGoals(selectedPreset, allModules, new Set(effectiveModules));
        const presetBootstrapData = collectPresetBootstrapData(selectedPreset);

        // Step 2: Connect to Paperclip API early to resolve user identity for git commits.
        // Reuses the session established by the preceding check-auth / preview actions
        // (cached in-process), so an authenticated instance isn't hit with repeated
        // sign-ins that trip its rate limiter (429).
        log('Connecting to Paperclip API...');
        const client = await connectSharedClient(cfg);
        log('Connected.');

        // Resolve git identity from board session (fall back to Paperclip Bootstrap)
        const gitIdentity = {
          name: client.boardUserName || null,
          email: client.boardUserEmail || paperclipEmail || null,
        };

        // Step 3: Assemble files on disk
        const outputDir = resolveWritableCompaniesDir(cfg, log);
        log('Assembling company workspace...');

        const companyDescription =
          typeof params.companyDescription === 'string' ? params.companyDescription.trim() : '';

        // Normalize goals: support both old single-goal and new array format
        const userGoals: any[] = Array.isArray(params.goals)
          ? (params.goals as any[])
          : params.goal
            ? [params.goal]
            : [];
        const userProjects: any[] = Array.isArray(params.projects)
          ? (params.projects as any[])
          : [];
        const userIssues: any[] = Array.isArray(params.issues) ? (params.issues as any[]) : [];

        const assembleResult = await assembleCompany({
          companyName,
          companyDescription,
          userGoals,
          userProjects,
          moduleNames: effectiveModules,
          extraRoleNames: (params.selectedRoles as string[]) ?? [],
          inlineGoals: goals,
          userIssues,
          presetIssues: presetBootstrapData.issues,
          presetRoutines: presetBootstrapData.routines,
          presetLabels: presetBootstrapData.labels,
          enableIsolatedWorktrees,
          enableEnrichedPersonas,
          gitUserName: gitIdentity.name || undefined,
          gitUserEmail: gitIdentity.email || undefined,
          outputDir,
          templatesDir,
          onProgress: log,
        });

        const { companyDir } = assembleResult;

        // Apply file overrides from UI edits
        const fileOverrides = (params.fileOverrides as Record<string, string>) ?? {};
        for (const [relPath, content] of Object.entries(fileOverrides)) {
          const absPath = path.resolve(companyDir, relPath);
          if (!absPath.startsWith(companyDir + path.sep) && absPath !== companyDir) {
            log(`⚠ Skipped override outside company dir: ${relPath}`);
            continue;
          }
          if (fs.existsSync(absPath)) {
            fs.writeFileSync(absPath, content, 'utf-8');
            log(`✎ Override: ${relPath}`);
          }
        }

        prepareLocalProjectWorkspace(assembleResult.mainProject, companyDir, log, gitIdentity);

        const ceoInstructionsDir = path.join(companyDir, 'agents', 'ceo');
        const ceoEntryFile = 'AGENTS.md';
        const ceoEntryPath = path.join(ceoInstructionsDir, ceoEntryFile);
        if (!fs.existsSync(ceoEntryPath)) {
          log(
            `⚠ Assembled CEO entry file missing at ${ceoEntryPath}; external bundle may be empty.`,
          );
        }

        log('');
        log(`✓ Generated files: ${companyDir}`);

        // Step 4: Resolve target company (create new, or reuse existing)
        let company: any;
        let companyId: string;
        let createdCompany = false;

        if (existingCompanyId) {
          log(`Using existing company: ${existingCompanyId}`);
          company = await client.getCompany(existingCompanyId);
          companyId = company.id;
          log(`✓ Target company "${company.name}" selected`);
          log('Keeping company hire policy as configured (board approvals may be required).');
        } else {
          log('Creating company...');
          company = await client.createCompany({
            name: companyName,
            description: companyDescription || undefined,
          });
          companyId = company.id;
          createdCompany = true;
          log(`✓ Company "${companyName}" created`);

          log('Keeping company hire policy as configured (board approvals may be required).');
        }

        // Steps 6-7 are wrapped so we can delete only newly-created companies on partial failure.
        let ceoAgentId: string;
        const teamAgentIds: Record<string, string> = {};
        let boardOperationsIssue: { id: string; identifier?: string } | null = null;
        let hiringPlanIssue: { id: string; identifier?: string } | null = null;
        let bootstrapIssue: { id: string; identifier?: string };
        // Hoisted so the post-provisioning manifest-save and governance-cleanup
        // blocks (which run after this try/catch on the success path) can read
        // them. The catch block re-throws on failure, so these only need to be
        // valid on the success path.
        let allRoleNames: string[] = [];
        let existingManifest: WizardManifest | null = null;
        let existingByTemplateRole = new Map<string, any>();
        let routines: any[] = [];
        try {
          allRoleNames = [...(assembleResult.allRoles ?? [])].filter(Boolean).sort();

          // Read the wizard manifest (best-effort) for retired-role detection
          if (existingCompanyId) {
            try {
              const pluginId = await findPluginId(client);
              if (pluginId) {
                const settings = await client._fetch(
                  `/api/plugins/${pluginId}/company-settings/${companyId}`,
                );
                const manifestData =
                  settings?.settingsJson?.wizardManifest ?? settings?.settings_json?.wizardManifest;
                if (manifestData && typeof manifestData === 'object') {
                  existingManifest = manifestData as WizardManifest;
                }
              }
            } catch {
              // Manifest read failure is non-fatal — provisioning still proceeds
            }
          }

          const repositoryMode = userProjects.some(
            (project) => project?.repoUrl || project?.workspace?.sourceType === 'git_repo',
          )
            ? 'existing git repository'
            : 'fresh local repository';
          const approvalMode =
            'board approval preserved; /agent-hires may create pending approvals';

          log('Creating board operations and hiring plan records...');
          const createdBoardOperationsIssue = await client.createIssue(companyId, {
            title: 'Board Operations',
            description: 'Standing issue for board decision log and operations tracking.',
            // These governance records are created before the CEO is guaranteed to exist.
            // Paperclip requires an assignee for in_progress issues, so keep them unassigned
            // and actionable later rather than failing existing-company provisioning.
            status: 'todo',
            priority: 'medium',
          });
          boardOperationsIssue = createdBoardOperationsIssue;
          await client.putIssueDocument(createdBoardOperationsIssue.id, 'decision-log', {
            title: 'Decision Log',
            format: 'markdown',
            body: buildDecisionLogBody({
              companyName,
              companyDescription,
              preset: selectedPreset?.name,
              moduleNames: effectiveModules,
              roles: allRoleNames,
              repositoryMode,
              approvalMode,
            }),
          });
          log(
            `✓ Board Operations issue created${createdBoardOperationsIssue.identifier ? `: ${createdBoardOperationsIssue.identifier}` : ''}`,
          );

          const createdHiringPlanIssue = await client.createIssue(companyId, {
            title: 'Hiring Plan',
            description: 'Develop and execute the governed team hiring plan.',
            status: 'todo',
            priority: 'high',
          });
          hiringPlanIssue = createdHiringPlanIssue;
          await client.putIssueDocument(createdHiringPlanIssue.id, 'hiring-plan', {
            title: 'Hiring Plan',
            format: 'markdown',
            body: buildHiringPlanBody({
              companyName,
              roles: allRoleNames,
              moduleNames: effectiveModules,
            }),
          });
          log(
            `✓ Hiring Plan issue created${createdHiringPlanIssue.identifier ? `: ${createdHiringPlanIssue.identifier}` : ''}`,
          );

          // Step 6: Resolve or create CEO agent
          const userCeoAdapter = (params.ceoAdapter as any) || {};
          const adapterType = normalizeCeoAdapterType(userCeoAdapter);

          const ceoTemplate = roleTemplateByName.get('ceo') || {};
          const ceoTitle =
            typeof ceoTemplate.title === 'string' && ceoTemplate.title.trim()
              ? ceoTemplate.title.trim()
              : 'CEO';
          const ceoDescription =
            typeof ceoTemplate.description === 'string' && ceoTemplate.description.trim()
              ? ceoTemplate.description.trim()
              : undefined;
          const ceoMetadata = {
            templateRole: 'ceo',
            ...(ceoDescription ? { description: ceoDescription } : {}),
          };
          const ceoRuntimeConfig = buildCeoAgentRuntimeConfig();

          const adapterConfig: Record<string, unknown> = buildCeoAdapterConfig({
            userCeoAdapter,
            companyDir,
            roleAdapterOverrides: assembleResult.roleAdapterOverrides?.get('ceo') ?? {},
          });
          // The CEO uses an EXTERNAL instructions bundle pointing at the assembled
          // on-disk dir (set after create/update), so no managed bundle is uploaded.
          adapterConfig.instructionsFilePath = ceoEntryPath;

          const logPendingApproval = (agent: any) => {
            if (!agent?._pendingApprovalId) return;
            log(
              `⚠ CEO hire is pending approval: ${agent._pendingApprovalId}. Approve it in the board before the bootstrap heartbeat can run.`,
            );
          };

          if (existingCompanyId) {
            log('Looking for an existing CEO agent...');
            const agents = await client.listAgents(companyId);
            const existingCeo = Array.isArray(agents)
              ? agents.find((agent: any) => agent?.role === 'ceo' && agent?.status !== 'terminated')
              : null;

            if (existingCeo?.id) {
              ceoAgentId = existingCeo.id;
              log(`✓ Reusing existing CEO agent (${ceoAgentId})`);

              // Keep the reused CEO aligned with the newly generated workspace/instructions.
              try {
                const ceoPatch: Record<string, unknown> = {
                  adapterType,
                  adapterConfig: preserveExistingSkillSync(existingCeo, adapterConfig),
                  runtimeConfig: ceoRuntimeConfig,
                  ...(ceoMetadata
                    ? { metadata: { ...(existingCeo.metadata ?? {}), ...ceoMetadata } }
                    : {}),
                };
                if (!existingCeo?.title && ceoTitle) {
                  ceoPatch.title = ceoTitle;
                }
                if (!existingCeo?.capabilities && ceoDescription) {
                  ceoPatch.capabilities = ceoDescription;
                }
                await client.updateAgent(ceoAgentId, ceoPatch);
                log('✓ Updated existing CEO adapter config (cwd + Codex defaults)');
              } catch (updateErr) {
                log(
                  `⚠ Could not update existing CEO adapter config: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
                );
                log(
                  '  Continuing with existing CEO configuration; bootstrap paths may be out of sync.',
                );
              }
            } else {
              log('No active CEO found — creating CEO agent...');
              const ceoAgent = await client.createAgent(companyId, {
                name: 'CEO',
                role: 'ceo',
                title: ceoTitle,
                ...(ceoDescription ? { capabilities: ceoDescription } : {}),
                ...(ceoMetadata ? { metadata: ceoMetadata } : {}),
                reportsTo: null,
                adapterType,
                adapterConfig,
                runtimeConfig: ceoRuntimeConfig,
                permissions: { canCreateAgents: true },
                ...(boardOperationsIssue?.id ? { sourceIssueId: boardOperationsIssue.id } : {}),
              });
              ceoAgentId = ceoAgent.id;
              log(`✓ CEO agent created (${ceoAgentId})`);
              logPendingApproval(ceoAgent);
            }
          } else {
            log('Creating CEO agent...');
            const ceoAgent = await client.createAgent(companyId, {
              name: 'CEO',
              role: 'ceo',
              title: ceoTitle,
              ...(ceoDescription ? { capabilities: ceoDescription } : {}),
              ...(ceoMetadata ? { metadata: ceoMetadata } : {}),
              reportsTo: null,
              adapterType,
              adapterConfig,
              runtimeConfig: ceoRuntimeConfig,
              permissions: { canCreateAgents: true },
              ...(boardOperationsIssue?.id ? { sourceIssueId: boardOperationsIssue.id } : {}),
            });
            ceoAgentId = ceoAgent.id;
            log(`✓ CEO agent created (${ceoAgentId})`);
            logPendingApproval(ceoAgent);
          }

          await setExternalInstructionsBundle({
            client,
            agentId: ceoAgentId,
            sourceDir: ceoInstructionsDir,
            entryFile: ceoEntryFile,
            log,
          });

          // The Board Operations (#1) and Hiring Plan (#2) governance issues are created
          // before the CEO exists (so they can't be assigned at creation time). Now that
          // the CEO is available, assign both to it so they are actionable rather than
          // orphaned — the CEO owns the decision log and reviews the provisioned team
          // against the hiring plan. Best-effort: don't fail provisioning over this.
          for (const govIssue of [
            { issue: boardOperationsIssue, label: 'Board Operations' },
            { issue: hiringPlanIssue, label: 'Hiring Plan' },
          ]) {
            if (!govIssue.issue?.id) continue;
            try {
              await client.updateIssue(govIssue.issue.id, { assigneeAgentId: ceoAgentId });
              log(`✓ Assigned ${govIssue.label} issue to CEO`);
            } catch (assignErr) {
              log(
                `⚠ Could not assign ${govIssue.label} issue to CEO: ${assignErr instanceof Error ? assignErr.message : String(assignErr)}`,
              );
            }
          }

          // Step 6b: Create (or reuse) the rest of the team, each with its FULL
          // instructions bundle. The wizard assembles a complete per-role workspace
          // (AGENTS.md + HEARTBEAT/SOUL/TOOLS + skills), and passing it as
          // `instructionsBundle` makes the host materialize a self-contained managed
          // bundle in a single createAgent call — because buildCeoAdapterConfig sets no
          // instructionsFilePath, the host materializes the passed files instead of
          // skipping them. Previously these agents were created by the CEO during
          // bootstrap with only an instructionsFilePath, leaving each non-CEO agent with
          // a bare AGENTS.md that referenced external, fragile absolute paths.
          const teamRoles = [...(assembleResult.allRoles ?? [])].filter(
            (r: string) => r && r !== 'ceo',
          );

          existingByTemplateRole = new Map<string, any>();
          if (existingCompanyId && teamRoles.length > 0) {
            const agents = await client.listAgents(companyId);
            if (Array.isArray(agents)) {
              for (const a of agents) {
                const tr = a?.metadata?.templateRole;
                if (tr && a?.status !== 'terminated' && a?.role !== 'ceo') {
                  existingByTemplateRole.set(tr, a);
                }
              }
            }
          }

          for (const roleName of teamRoles) {
            const roleTemplate = roleTemplateByName.get(roleName) || {};
            const paperclipRole =
              typeof roleTemplate.paperclipRole === 'string' && roleTemplate.paperclipRole.trim()
                ? roleTemplate.paperclipRole.trim()
                : 'general';
            const roleTitle =
              typeof roleTemplate.title === 'string' && roleTemplate.title.trim()
                ? roleTemplate.title.trim()
                : formatRoleName(roleName);
            const roleDescription =
              typeof roleTemplate.description === 'string' && roleTemplate.description.trim()
                ? roleTemplate.description.trim()
                : undefined;
            const roleMetadata = {
              templateRole: roleName,
              ...(roleDescription ? { description: roleDescription } : {}),
            };
            // Worker agents have heartbeat DISABLED — Paperclip wakes them on
            // assignment and their routines drive scheduled work. Enabling always-on
            // heartbeats for the whole team at once overloaded the server with
            // concurrent/queued runs.
            const roleRuntimeConfig = buildWorkerAgentRuntimeConfig();
            const roleAdapterConfig: Record<string, unknown> = buildWorkerAdapterConfig({
              userCeoAdapter,
              companyDir,
              roleAdapterOverrides: assembleResult.roleAdapterOverrides?.get(roleName) ?? {},
            });
            const roleInstructionsDir = path.join(companyDir, 'agents', roleName);
            // External instructions bundle pointing at the assembled on-disk dir
            // (set after create/update); no managed bundle is uploaded.
            roleAdapterConfig.instructionsFilePath = path.join(roleInstructionsDir, 'AGENTS.md');

            const existingAgent = existingByTemplateRole.get(roleName);
            if (existingAgent?.id) {
              try {
                await client.updateAgent(existingAgent.id, {
                  adapterType,
                  adapterConfig: preserveExistingSkillSync(existingAgent, roleAdapterConfig),
                  runtimeConfig: roleRuntimeConfig,
                  metadata: { ...(existingAgent.metadata ?? {}), ...roleMetadata },
                  ...(!existingAgent.title && roleTitle ? { title: roleTitle } : {}),
                  ...(!existingAgent.capabilities && roleDescription
                    ? { capabilities: roleDescription }
                    : {}),
                });
                log(`✓ Reusing ${roleTitle} (${existingAgent.id})`);
              } catch (err) {
                log(
                  `⚠ Could not update ${roleTitle}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
              teamAgentIds[roleName] = existingAgent.id;
              await setExternalInstructionsBundle({
                client,
                agentId: existingAgent.id,
                sourceDir: roleInstructionsDir,
                entryFile: 'AGENTS.md',
                log,
              });
              log(`✓ Synced ${roleTitle} instructions from latest templates`);
              continue;
            }

            const roleAgent = await client.createAgent(companyId, {
              name: roleTitle,
              role: paperclipRole,
              title: roleTitle,
              ...(roleDescription ? { capabilities: roleDescription } : {}),
              metadata: roleMetadata,
              reportsTo: ceoAgentId,
              adapterType,
              adapterConfig: roleAdapterConfig,
              runtimeConfig: roleRuntimeConfig,
              ...(hiringPlanIssue?.id ? { sourceIssueId: hiringPlanIssue.id } : {}),
            });
            teamAgentIds[roleName] = roleAgent.id;
            await setExternalInstructionsBundle({
              client,
              agentId: roleAgent.id,
              sourceDir: roleInstructionsDir,
              entryFile: 'AGENTS.md',
              log,
            });
            log(`✓ ${roleTitle} created (${roleAgent.id})`);
            if (roleAgent?._pendingApprovalId) {
              log(
                `⚠ ${roleTitle} hire pending approval: ${roleAgent._pendingApprovalId}. Approve it in the board.`,
              );
            }
          }

          // Step 6c: Create or sync the scheduled routines directly. Paperclip only lets an
          // agent create routines assigned to ITSELF, so a CEO following the bootstrap
          // cannot create routines owned by other agents (backlog grooming, auto-assign,
          // …) — that previously blocked the bootstrap issue. The wizard connects with
          // board authority, so it can create or update routines for any agent. Existing
          // company runs match by title and patch routines/triggers instead of creating
          // duplicates; this is the lightweight "apply latest templates" path.
          routines = Array.isArray(assembleResult.initialRoutines)
            ? assembleResult.initialRoutines
            : [];

          if (!existingCompanyId) {
            // Pre-create the main project so every routine can be linked to it.
            // The CEO creates projects during bootstrap, but it can only edit
            // routines assigned to ITSELF — routines owned by other agents (PM,
            // etc.) would otherwise stay project-less forever. The wizard runs
            // with board authority, so it can create the project up front and
            // attach all routines to it. Best-effort: if it fails, routines are
            // still created (project-less) rather than blocking provisioning.
            let mainProjectId: string | undefined;
            const mainProject = assembleResult.mainProject;
            if (routines.length > 0 && mainProject?.name) {
              try {
                const createdProject = await client.createProject(companyId, {
                  name: mainProject.name,
                  description: mainProject.description,
                  workspace: mainProject.workspace,
                  executionWorkspacePolicy: mainProject.executionWorkspacePolicy,
                });
                mainProjectId = createdProject?.id;
                log(
                  `✓ Main project "${mainProject.name}" created${mainProjectId ? ` (${mainProjectId})` : ' (no id returned)'}`,
                );
              } catch (err) {
                log(
                  `⚠ Could not create main project "${mainProject.name}": ${err instanceof Error ? err.message : String(err)}. Routines will be created without a project.`,
                );
              }
            }

            for (const routine of routines) {
              const title =
                typeof routine.title === 'string' && routine.title.trim()
                  ? routine.title.trim()
                  : typeof routine.name === 'string'
                    ? routine.name.trim()
                    : '';
              if (!title) continue;
              const role = routine.assignTo;
              const assigneeAgentId =
                !role || role === 'ceo' ? ceoAgentId : (teamAgentIds[role] ?? ceoAgentId);
              try {
                const createdRoutine = await client.createRoutine(companyId, {
                  title,
                  description: routine.description,
                  assigneeAgentId,
                  projectId: mainProjectId,
                  priority: routine.priority || 'medium',
                  concurrencyPolicy: routine.concurrencyPolicy || 'skip_if_active',
                  catchUpPolicy: routine.catchUpPolicy || 'skip_missed',
                });
                if (routine.schedule && createdRoutine?.id) {
                  await client.createRoutineTrigger(createdRoutine.id, {
                    kind: 'schedule',
                    cronExpression: routine.schedule,
                    timezone: 'UTC',
                  });
                }
                log(
                  `✓ Routine "${title}" created${routine.schedule ? ` (${routine.schedule})` : ''}`,
                );
              } catch (err) {
                log(
                  `⚠ Could not create routine "${title}": ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }
          } else {
            await syncExistingCompanyRoutines({
              client,
              companyId,
              routines,
              ceoAgentId,
              teamAgentIds,
              log,
            });
          }

          // Step 7: Create bootstrap issue.
          // Use the HTTP client instead of ctx.issues here because the wizard may be
          // launched from company A while provisioning a newly-created/reused company B.
          // Paperclip master correctly scopes SDK host calls to the launching company,
          // so ctx.issues.create({ companyId: B }) is denied when A !== B.
          // BOOTSTRAP.md IS the bootstrap issue — read it directly.
          const bootstrapDescription = fs.readFileSync(
            path.join(companyDir, 'BOOTSTRAP.md'),
            'utf-8',
          );

          log('Creating bootstrap task for CEO...');
          const issue = await client.createIssue(companyId, {
            title: `Bootstrap ${company.name || companyName}`,
            description: bootstrapDescription,
            assigneeAgentId: ceoAgentId,
            status: 'todo',
          });
          bootstrapIssue = issue as { id: string; identifier?: string };
          log(`✓ Bootstrap task created: ${bootstrapIssue.identifier || bootstrapIssue.id}`);
        } catch (err) {
          log(`✗ Provisioning failed: ${err instanceof Error ? err.message : String(err)}`);
          if (createdCompany) {
            log(`Cleaning up — deleting partially created company (${companyId})...`);
            try {
              await client.deleteCompany(companyId);
              log('✓ Company deleted.');
            } catch (cleanupErr) {
              log(
                `⚠ Could not delete company ${companyId}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
              );
              log(`  Delete it manually in the Paperclip UI to clean up.`);
            }
          } else {
            log('Skipping cleanup because provisioning targeted an existing company.');
          }
          throw err;
        }

        log('');
        log('Provisioning complete!');
        log(
          existingCompanyId
            ? 'Bootstrap task created in existing company. Trigger the CEO heartbeat to continue setup.'
            : 'The CEO agent and initial team hire requests are ready. Approve any pending hires, then trigger the CEO heartbeat to continue setup.',
        );

        const issueIds = [boardOperationsIssue?.id, hiringPlanIssue?.id, bootstrapIssue!.id].filter(
          Boolean,
        );

        // Persist wizard manifest so future updates can diff against it
        try {
          const pluginId = await findPluginId(client);
          if (pluginId) {
            const wizardManifest = buildWizardManifest({
              presetName: selectedPreset?.name ?? null,
              selectedModules: effectiveModules,
              selectedRoleNames: allRoleNames,
              assembleResult,
              initialRoutines: routines,
            });
            await client._fetch(`/api/plugins/${pluginId}/company-settings/${companyId}`, {
              method: 'PUT',
              body: JSON.stringify({ settingsJson: { wizardManifest } }),
            });
            log('✓ Wizard manifest saved');
          } else {
            log('⚠ Could not find plugin ID — manifest not saved');
          }
        } catch (manifestErr) {
          log(
            `⚠ Could not save wizard manifest: ${manifestErr instanceof Error ? manifestErr.message : String(manifestErr)}`,
          );
        }

        // Governance cleanup: create review issues for retired template roles
        if (existingCompanyId && existingManifest && Array.isArray(existingManifest.roles)) {
          const newRoleSet = new Set(allRoleNames);
          const retiredRoles = existingManifest.roles.filter(
            (role: string) => !newRoleSet.has(role),
          );
          for (const role of retiredRoles) {
            try {
              const agentData = existingByTemplateRole.get(role);
              const agentInfo = agentData
                ? `**Agent ID:** ${agentData.id}\n**Agent name:** ${agentData.title || agentData.name || agentData.id}`
                : '_No active agent found for this role._';
              const issueTitle = `Review retired template role: ${role}`;
              const issueDescription = [
                `## Retired Role: \`${role}\``,
                '',
                'This template role was removed from the company configuration during an update.',
                'The agent is still active but no longer managed by the wizard.',
                '',
                '### Cleanup Checklist',
                '',
                "- [ ] Review the agent's current work and open issues",
                '- [ ] Reassign any in-progress issues to other team members',
                "- [ ] Consider pausing the agent's heartbeat",
                '- [ ] Remove module-specific skill files if applicable',
                '- [ ] Consider terminating the agent if no longer needed',
                '',
                agentInfo,
              ].join('\n');
              const createdIssue = await client.createIssue(companyId, {
                title: issueTitle,
                description: issueDescription,
                priority: 'low',
                status: 'todo',
                ...(boardOperationsIssue?.id
                  ? { projectId: boardOperationsIssue.id, goalId: boardOperationsIssue.id }
                  : {}),
              });
              log(
                `✓ Retired-role review issue created for "${role}": ${createdIssue.identifier || createdIssue.id}`,
              );
            } catch (retiredRoleErr) {
              log(
                `⚠ Could not create retired-role review issue for "${role}": ${retiredRoleErr instanceof Error ? retiredRoleErr.message : String(retiredRoleErr)}`,
              );
            }
          }
        }

        return {
          companyId,
          issuePrefix: company.issuePrefix,
          paperclipUrl: client.baseUrl,
          agentIds: { ceo: ceoAgentId!, ...teamAgentIds },
          issueIds,
          logs,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Only log if it wasn't already logged by the inner compensation catch
        if (!logs.some((l) => l.includes('Provisioning failed'))) {
          log(`✗ ${message}`);
        }
        return { error: message, logs };
      }
    });
  },

  async onHealth() {
    return { status: 'ok', message: 'Company Wizard plugin is running' };
  },

  // Called by the "Test Configuration" button in the plugin settings UI.
  async onValidateConfig(config: Record<string, unknown>) {
    const paperclipUrl =
      (config.paperclipUrl as string) ||
      process.env.PAPERCLIP_PUBLIC_URL ||
      'http://localhost:3100';
    try {
      const client = new PaperclipClient(paperclipUrl, {
        email: (config.paperclipEmail as string) || '',
        password: (config.paperclipPassword as string) || '',
      });
      await client.connect();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
