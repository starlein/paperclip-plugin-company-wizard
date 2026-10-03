import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk';

const manifest: PaperclipPluginManifestV1 = {
  id: 'starlein.paperclip-plugin-company-wizard',
  apiVersion: 1,
  version: '0.7.0',
  displayName: 'Company Wizard',
  description: 'AI-powered wizard to bootstrap agent companies from composable templates',
  author: 'Sascha Pietrowski <sp@speednetwork.de>',
  categories: ['workspace', 'ui'],
  // No numeric host floor: the loader compares this against the host version
  // `createApp` resolves (git describe → stamped build version → the server
  // package version), so a packaged install reports its package version (0.3.1)
  // and `compareSemver` would reject any CalVer floor on a current host.
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
          'Optional existing template root containing roles/, modules/, and presets/. Overrides the GitHub URL. Leave empty to use bundled release templates or a custom GitHub source. Refresh never overwrites this directory. For an existing empty directory, the wizard offers an explicit sync from the configured template URL.',
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
          'AI provider used for company generation. Anthropic uses Claude Opus 5 at max effort; OpenAI uses GPT-6-Astra at high reasoning effort.',
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
          'Worker-side Paperclip URL. Defaults to PAPERCLIP_PUBLIC_URL or http://localhost:3100. Browser authorization permits the current UI HTTPS origin or trusted loopback; remote instances require legacy credentials.',
      },
      paperclipEmail: {
        type: 'string',
        description:
          'Optional legacy board login email. Leave both login fields empty to use the current browser login after consent in the wizard. Keep for older hosts or a separate remote instance.',
      },
      paperclipPassword: {
        type: 'string',
        description:
          'Optional legacy board login password. Not needed with browser authorization. Existing values remain supported; clear both login fields to switch modes.',
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
