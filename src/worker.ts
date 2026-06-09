import { definePlugin, runWorker } from '@paperclipai/plugin-sdk';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// @ts-ignore — plain JS modules, bundled by esbuild
import { assembleCompany, toPascalCase } from './logic/assemble.js';
// @ts-ignore
import { PaperclipClient } from './api/client.js';
// @ts-ignore — plain JS module, bundled by esbuild
import {
  buildCeoAdapterConfig,
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
// @ts-ignore
import manifest from './manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Template loader ---

const DEFAULT_TEMPLATES_REPO_URL =
  'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates';
const BUNDLED_TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

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
 * Resolve (and if needed, create) the templates directory.
 * Resolution order:
 *  1. cfg.templatesPath if set → use it; auto-download if missing.
 *  2. Default: ~/.paperclip/plugin-templates → auto-download if missing.
 *  3. Bundled templates (dist/../templates) as last resort.
 */
async function ensureTemplatesDir(cfg: Record<string, string>): Promise<string> {
  const repoUrl = cfg.templatesRepoUrl || DEFAULT_TEMPLATES_REPO_URL;

  if (cfg.templatesPath) {
    if (fs.existsSync(cfg.templatesPath)) return cfg.templatesPath;
    downloadTemplatesFromGithub(cfg.templatesPath, repoUrl);
    return cfg.templatesPath;
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

/** Parse a boolean plugin-config value that may arrive as a real boolean or a string. */
function cfgBool(cfg: Record<string, unknown>, key: string): boolean {
  const raw = cfg[key];
  return raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true');
}

function cfgString(cfg: Record<string, unknown>, key: string): string {
  const raw = cfg[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function cfgTelemetryEnabled(cfg: Record<string, unknown>): boolean {
  const raw = cfg.telemetryEnabled;
  return raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true');
}

function cfgTelemetryEndpoint(cfg: Record<string, unknown>): string {
  return cfgString(cfg, 'telemetryEndpoint');
}

function cfgTelemetryAuthToken(cfg: Record<string, unknown>): string {
  return cfgString(cfg, 'telemetryAuthToken');
}

type ProvisionTelemetryPayload = {
  event: 'company_wizard_provision';
  timestamp: string;
  plugin: {
    id: string;
    version: string;
  };
  instance: {
    host: string;
    fingerprint: string;
  };
  counts: {
    companiesCreated: number;
    companiesTargeted: number;
    agentsCreated: number;
    rolesInScope: number;
    modulesInScope: number;
  };
  metadata: {
    hasExistingCompanyTarget: boolean;
    moduleCount: number;
    hadOverrides: boolean;
  };
};

function buildInstanceFingerprint(input: string): string {
  const normalized = input.trim().replace(/\/$/, '');
  return createHash('sha256').update(normalized).digest('hex');
}

type TelemetryEvent = {
  cfg: Record<string, string>;
  paperclipUrl: string;
  counts: ProvisionTelemetryPayload['counts'];
  existingCompanyId: string | null;
  fileOverrideCount: number;
  log?: (msg: string) => void;
};

async function sendProvisionTelemetry({
  cfg,
  paperclipUrl,
  counts,
  existingCompanyId,
  fileOverrideCount,
  log,
}: TelemetryEvent): Promise<void> {
  if (!cfgTelemetryEnabled(cfg)) return;
  const endpoint = cfgTelemetryEndpoint(cfg);
  if (!endpoint) return;

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    if (log) log(`⚠ Telemetry endpoint is invalid: ${endpoint}`);
    return;
  }

  const token = cfgTelemetryAuthToken(cfg);
  const body: ProvisionTelemetryPayload = {
    event: 'company_wizard_provision',
    timestamp: new Date().toISOString(),
    plugin: {
      id: manifest.id,
      version: manifest.version,
    },
    instance: {
      host: paperclipUrl,
      fingerprint: buildInstanceFingerprint(paperclipUrl),
    },
    counts,
    metadata: {
      hasExistingCompanyTarget: Boolean(existingCompanyId),
      moduleCount: counts.modulesInScope,
      hadOverrides: fileOverrideCount > 0,
    },
  };

  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (log) {
        const errText = await res.text().catch(() => '');
        log(
          `⚠ Telemetry request failed (${res.status}): ${errText || res.statusText || 'empty response'}`,
        );
      }
    }
  } catch (err) {
    if (log) {
      log(`⚠ Telemetry request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

type InstanceExperimentalSettings = {
  enableIsolatedWorkspaces?: boolean;
};

async function resolveEnableIsolatedWorkspacesFromInstance(
  cfg: Record<string, string>,
  log?: (msg: string) => void,
): Promise<boolean> {
  const paperclipUrl =
    cfg.paperclipUrl || process.env.PAPERCLIP_PUBLIC_URL || 'http://localhost:3100';
  const paperclipEmail = cfg.paperclipEmail || '';
  const paperclipPassword = cfg.paperclipPassword || '';
  const instanceClient = new PaperclipClient(paperclipUrl, {
    email: paperclipEmail,
    password: paperclipPassword,
  });

  try {
    await instanceClient.connect();
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

function formatRoleName(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function collectInstructionFiles(rootDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(rootDir)) return out;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(rootDir, abs).split(path.sep).join('/');
      out[rel] = fs.readFileSync(abs, 'utf-8');
    }
  };

  walk(rootDir);
  return out;
}

async function syncAgentInstructionsIntoManagedBundle({
  client,
  agentId,
  sourceDir,
  entryFile,
  fallbackEntryContent,
  log,
}: {
  client: any;
  agentId: string;
  sourceDir: string;
  entryFile: string;
  fallbackEntryContent?: string;
  log: (m: string) => void;
}) {
  try {
    await client.updateInstructionsBundle(agentId, {
      mode: 'managed',
      entryFile,
      clearLegacyPromptTemplate: true,
    });

    const files = collectInstructionFiles(sourceDir);
    if (
      !files[entryFile] &&
      typeof fallbackEntryContent === 'string' &&
      fallbackEntryContent.trim()
    ) {
      files[entryFile] = fallbackEntryContent;
    }

    const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
      log('⚠ No instruction files found to sync into managed bundle.');
      return;
    }

    for (const [relativePath, content] of entries) {
      await client.upsertInstructionsBundleFile(agentId, {
        path: relativePath,
        content,
      });
    }

    log(`✓ Synced ${entries.length} instruction file(s) into managed bundle`);
  } catch (err) {
    log(
      `⚠ Could not sync managed instructions bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
        const repoUrl = cfg.templatesRepoUrl || DEFAULT_TEMPLATES_REPO_URL;
        const targetDir =
          cfg.templatesPath || path.join(os.homedir(), '.paperclip', 'plugin-templates');

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        downloadTemplatesFromGithub(targetDir, repoUrl);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
        tmpDir = path.join(os.tmpdir(), `clipper-preview-${Date.now()}`);

        // Resolve the companies dir so BOOTSTRAP.md shows correct paths in preview.
        const companiesDir = resolveCompaniesDir(cfg);

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

    // Auth check action — called by the summary step to surface credential issues early.
    ctx.actions.register('check-auth', async () => {
      const cfg = ((await ctx.config.get()) ?? {}) as Record<string, string>;
      const paperclipUrl =
        cfg.paperclipUrl || process.env.PAPERCLIP_PUBLIC_URL || 'http://localhost:3100';
      try {
        const client = new PaperclipClient(paperclipUrl, {
          email: cfg.paperclipEmail || '',
          password: cfg.paperclipPassword || '',
        });
        await client.connect();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
        const paperclipUrl =
          cfg.paperclipUrl || process.env.PAPERCLIP_PUBLIC_URL || 'http://localhost:3100';
        const paperclipEmail = cfg.paperclipEmail || '';
        const paperclipPassword = cfg.paperclipPassword || '';
        const disableBoardApprovalOnNewCompanies = cfgBool(
          cfg,
          'disableBoardApprovalOnNewCompanies',
        );
        const enableIsolatedWorktrees = await resolveEnableIsolatedWorkspacesFromInstance(cfg, log);

        const companyName = typeof params.companyName === 'string' ? params.companyName.trim() : '';
        const existingCompanyId =
          typeof params.existingCompanyId === 'string' && params.existingCompanyId.trim()
            ? params.existingCompanyId.trim()
            : '';
        if (!companyName) return { error: 'companyName is required', logs };

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

        // Step 2: Assemble files on disk
        const outputDir = resolveCompaniesDir(cfg);

        fs.mkdirSync(outputDir, { recursive: true });
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

        const ceoInstructionsDir = path.join(companyDir, 'agents', 'ceo');
        const ceoEntryFile = 'AGENTS.md';
        const ceoEntryPath = path.join(ceoInstructionsDir, ceoEntryFile);
        const ceoPromptTemplate = fs.existsSync(ceoEntryPath)
          ? fs.readFileSync(ceoEntryPath, 'utf-8')
          : '';

        log('');
        log(`✓ Generated files: ${companyDir}`);

        // Step 3: Connect to Paperclip API
        // The SDK doesn't support company/agent creation yet, so we use PaperclipClient
        // for those. It auto-detects auth mode (no-op for local_trusted).
        log('Connecting to Paperclip API...');
        const client = new PaperclipClient(paperclipUrl, {
          email: paperclipEmail,
          password: paperclipPassword,
        });
        await client.connect();
        log('Connected.');
        log('');

        // Step 5: Resolve target company (create new, or reuse existing)
        let company: any;
        let companyId: string;
        let createdCompany = false;
        let createdAgentCount = 0;
        const fileOverrideCount = Object.keys(
          (params.fileOverrides as Record<string, string>) ?? {},
        ).length;
        const effectiveModuleCount = effectiveModules.length;
        const rolesInScope = (assembleResult.allRoles?.size ?? 0) || 0;

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

          if (disableBoardApprovalOnNewCompanies) {
            // Optional compatibility mode: disable mandatory board-approval hiring on new companies.
            // Useful when users want legacy fully-autonomous bootstrap behavior.
            try {
              await client.updateCompany(companyId, { requireBoardApprovalForNewAgents: false });
              log('✓ Disabled board-approval hiring policy for this new company');
            } catch (err) {
              log(
                `⚠ Could not disable board-approval hiring for new agents: ${err instanceof Error ? err.message : String(err)}`,
              );
              log('  Continuing — agent creation will use an approval-aware fallback if required.');
            }
          } else {
            log('Keeping company hire policy as configured (board approvals may be required).');
          }
        }

        // Steps 6-7 are wrapped so we can delete only newly-created companies on partial failure.
        let ceoAgentId: string;
        const teamAgentIds: Record<string, string> = {};
        let bootstrapIssue: { id: string; identifier?: string };
        try {
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
          const ceoInstructionFiles = collectInstructionFiles(ceoInstructionsDir);
          if (
            !ceoInstructionFiles[ceoEntryFile] &&
            typeof ceoPromptTemplate === 'string' &&
            ceoPromptTemplate.trim()
          ) {
            ceoInstructionFiles[ceoEntryFile] = ceoPromptTemplate;
          }
          const ceoInstructionsBundle =
            Object.keys(ceoInstructionFiles).length > 0
              ? { entryFile: ceoEntryFile, files: ceoInstructionFiles }
              : undefined;

          const logPendingApproval = (agent: any) => {
            if (!agent?._pendingApprovalId) return;
            log(
              `⚠ CEO hire is pending approval: ${agent._pendingApprovalId}. Approve it in the board before the bootstrap heartbeat can run.`,
            );
            if (agent._approvalAutoApproveError) {
              log(`  Auto-approve failed: ${agent._approvalAutoApproveError}`);
            }
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
                  adapterConfig,
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
                instructionsBundle: ceoInstructionsBundle,
                runtimeConfig: ceoRuntimeConfig,
                permissions: { canCreateAgents: true },
              });
              ceoAgentId = ceoAgent.id;
              log(`✓ CEO agent created (${ceoAgentId})`);
              createdAgentCount += 1;
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
              instructionsBundle: ceoInstructionsBundle,
              runtimeConfig: ceoRuntimeConfig,
              permissions: { canCreateAgents: true },
            });
            ceoAgentId = ceoAgent.id;
            log(`✓ CEO agent created (${ceoAgentId})`);
            createdAgentCount += 1;
            logPendingApproval(ceoAgent);
          }

          await syncAgentInstructionsIntoManagedBundle({
            client,
            agentId: ceoAgentId,
            sourceDir: ceoInstructionsDir,
            entryFile: ceoEntryFile,
            fallbackEntryContent: ceoPromptTemplate,
            log,
          });

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

          let existingByTemplateRole = new Map<string, any>();
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
            const roleAdapterConfig: Record<string, unknown> = buildCeoAdapterConfig({
              userCeoAdapter,
              companyDir,
              roleAdapterOverrides: assembleResult.roleAdapterOverrides?.get(roleName) ?? {},
            });
            const roleInstructionsDir = path.join(companyDir, 'agents', roleName);
            const roleInstructionFiles = collectInstructionFiles(roleInstructionsDir);
            const roleInstructionsBundle =
              Object.keys(roleInstructionFiles).length > 0
                ? { entryFile: 'AGENTS.md', files: roleInstructionFiles }
                : undefined;

            const existingAgent = existingByTemplateRole.get(roleName);
            if (existingAgent?.id) {
              try {
                await client.updateAgent(existingAgent.id, {
                  adapterType,
                  adapterConfig: roleAdapterConfig,
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
              instructionsBundle: roleInstructionsBundle,
              runtimeConfig: roleRuntimeConfig,
            });
            teamAgentIds[roleName] = roleAgent.id;
            log(`✓ ${roleTitle} created (${roleAgent.id})`);
            createdAgentCount += 1;
            if (roleAgent?._pendingApprovalId) {
              log(
                `⚠ ${roleTitle} hire pending approval: ${roleAgent._pendingApprovalId}. Approve it in the board.`,
              );
              if (roleAgent._approvalAutoApproveError) {
                log(`  Auto-approve failed: ${roleAgent._approvalAutoApproveError}`);
              }
            }
          }

          // Step 6c: Create the scheduled routines directly. Paperclip only lets an
          // agent create routines assigned to ITSELF, so a CEO following the bootstrap
          // cannot create routines owned by other agents (backlog grooming, auto-assign,
          // …) — that previously blocked the bootstrap issue. The wizard connects with
          // board authority, so it can create routines for any agent. New companies only;
          // existing-company runs leave routines untouched to avoid duplicates.
          if (!existingCompanyId) {
            const routines = Array.isArray(assembleResult.initialRoutines)
              ? assembleResult.initialRoutines
              : [];
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
                  priority: routine.priority || 'medium',
                  concurrencyPolicy: routine.concurrencyPolicy || 'skip_if_active',
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
            : 'The CEO agent is ready. Trigger its first heartbeat to hire the rest of the team and create the initial backlog.',
        );

        void sendProvisionTelemetry({
          cfg,
          paperclipUrl,
          counts: {
            companiesCreated: createdCompany ? 1 : 0,
            companiesTargeted: 1,
            agentsCreated: createdAgentCount,
            rolesInScope,
            modulesInScope: effectiveModuleCount,
          },
          existingCompanyId: existingCompanyId || null,
          fileOverrideCount,
          log,
        });

        return {
          companyId,
          issuePrefix: company.issuePrefix,
          paperclipUrl,
          agentIds: { ceo: ceoAgentId!, ...teamAgentIds },
          issueIds: [bootstrapIssue!.id],
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

export { sendProvisionTelemetry, buildInstanceFingerprint };
export type { ProvisionTelemetryPayload };
