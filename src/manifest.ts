import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk';

const manifest: PaperclipPluginManifestV1 = {
  id: 'starlein.paperclip-plugin-company-wizard',
  apiVersion: 1,
  version: '0.6.1',
  displayName: 'Company Wizard',
  description: 'AI-powered wizard to bootstrap agent companies from composable templates',
  author: 'Sascha Pietrowski <sp@speednetwork.de>',
  categories: ['workspace', 'ui'],
  // No numeric host floor: current Paperclip source starts its plugin loader with
  // hostVersion "0.0.0" even when /health reports a current release or git build.
  // Keep API v1/capabilities explicit and validate feature availability at runtime.
  capabilities: [
    'companies.read',
    'issues.create',
    'issues.read',
    'issues.update',
    'goals.create',
    'goals.read',
    'agents.read',
    'projects.read',
    'skills.managed',
    'plugin.state.read',
    'plugin.state.write',
    'secrets.read-ref',
    'events.subscribe',
    'ui.page.register',
    'ui.sidebar.register',
  ],
  instanceConfigSchema: {
    type: 'object',
    properties: {
      companiesDir: {
        type: 'string',
        description:
          'Directory where assembled company workspaces are written. Auto-detected: ~/instances/default/companies in Docker setups, ~/.paperclip/instances/default/companies otherwise. Rarely needs manual override.',
      },
      templatesPath: {
        type: 'string',
        description:
          'Optional operator-managed templates directory. Defaults to templates bundled with this plugin release. Local files are never overwritten by refresh.',
      },
      templatesRepoUrl: {
        type: 'string',
        default: 'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates',
        description:
          'Optional custom GitHub tree URL. The official default uses bundled release templates; a custom URL opts into a refreshable remote cache.',
      },
      aiProvider: {
        type: 'string',
        enum: ['anthropic', 'openai'],
        default: 'anthropic',
        description:
          'AI provider used for company generation. Anthropic uses Claude Opus 5 at max effort; OpenAI uses GPT-5.6 Sol at high reasoning effort.',
      },
      anthropicApiKey: {
        // Paperclip's secret picker submits an EnvSecretRefBinding object,
        // while direct keys and older hosts still submit strings. Keep both
        // representations schema-valid; the host validates governed bindings
        // and the worker resolves them before calling Anthropic.
        type: ['string', 'object'],
        format: 'secret-ref',
        description:
          'Anthropic API key for the AI wizard. Paste a key or select a saved Paperclip company secret; Paperclip stores pasted values as governed secret references.',
      },
      openaiApiKey: {
        type: ['string', 'object'],
        format: 'secret-ref',
        description:
          'OpenAI API key for GPT/Codex company generation. Paste a key or select a saved Paperclip company secret; required when AI Provider is openai.',
      },
      paperclipUrl: {
        type: 'string',
        description:
          'Paperclip instance URL. Defaults to http://localhost:3100 or the PAPERCLIP_PUBLIC_URL env var.',
      },
      paperclipEmail: {
        type: 'string',
        description: 'Board login email (for authenticated instances).',
      },
      paperclipPassword: {
        type: 'string',
        description: 'Board login password (for authenticated instances).',
      },
    },
  },
  entrypoints: {
    worker: './dist/worker.js',
    ui: './dist/ui',
  },
  ui: {
    slots: [
      {
        type: 'page',
        id: 'company-wizard',
        displayName: 'Company Wizard',
        exportName: 'WizardPage',
        routePath: 'company-creator',
      },
      {
        type: 'sidebar',
        id: 'company-wizard-link',
        displayName: 'Create Company',
        exportName: 'SidebarLink',
      },
    ],
  },
};

export default manifest;
