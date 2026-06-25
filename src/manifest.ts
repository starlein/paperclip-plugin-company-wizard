import type { PaperclipPluginManifestV1 } from '@paperclipai/plugin-sdk';

const manifest: PaperclipPluginManifestV1 = {
  id: 'starlein.paperclip-plugin-company-wizard',
  apiVersion: 1,
  version: '0.4.13',
  displayName: 'Company Wizard',
  description: 'AI-powered wizard to bootstrap agent companies from composable templates',
  author: 'Sascha Pietrowski <sp@speednetwork.de>',
  categories: ['workspace', 'ui'],
  capabilities: [
    'companies.read',
    'issues.create',
    'issues.read',
    'issues.update',
    'goals.create',
    'goals.read',
    'agents.read',
    'projects.read',
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
      anthropicApiKey: {
        type: 'string',
        description:
          'Anthropic API key for the AI wizard (e.g. sk-ant-...). Required to use the AI-powered company setup path.',
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
