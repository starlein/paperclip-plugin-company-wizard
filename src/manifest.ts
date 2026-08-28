import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk';

const manifest: PaperclipPluginManifestV1 = {
  id: 'starlein.paperclip-plugin-company-wizard',
  apiVersion: 1,
  version: '0.5.3',
  displayName: 'Company Wizard',
  description: 'AI-powered wizard to bootstrap agent companies from composable templates',
  author: 'Sascha Pietrowski <sp@speednetwork.de>',
  categories: ['workspace', 'ui'],
  // Some source-derived and npx installations report Paperclip's package
  // semver instead of its release CalVer. API shape is gated separately by
  // apiVersion and capability validation, so keep the install floor on the
  // package-version axis rather than rejecting an otherwise compatible host.
  minimumHostVersion: '0.3.1',
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
          'Path to the templates directory. Auto-detected: ~/plugin-templates in Docker setups, ~/.paperclip/plugin-templates otherwise. Rarely needs manual override.',
      },
      templatesRepoUrl: {
        type: 'string',
        default: 'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates',
        description:
          'GitHub tree URL for template downloads. The default is correct for most setups — only change this if using a custom fork.',
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
